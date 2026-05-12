import fs from "node:fs/promises";
import path from "node:path";
import { distillMisaSources } from "./session-distiller.mjs";
import { buildWorkOrderRouting } from "./work-order-router.mjs";

const FIXTURE_DIR = path.join("examples", "hermes-distillation-mapping");

const ZERO_CALL_SAFETY = {
  llm_api_calls: 0,
  external_api_calls: 0,
  ai_second_pass_enabled: false,
  embedding_created: false,
  zilliz_written: false,
  production_journal_written: false,
  writes_persistent_memory: false,
  posts_publicly: false,
  autonomous_execution_allowed: false
};

const HIGH_RISK_FLAGS = [
  "production",
  "credentials",
  "credential",
  "secret",
  "public_send",
  "public send",
  "public_post",
  "public post",
  "durable_memory_write",
  "persistent_memory",
  "memory_write",
  "zilliz_write",
  "provider_route",
  "timer",
  "service_start"
];

const DEFAULT_CODEX_SCOPE = {
  may_edit: [
    "scripts/lib/hermes-distillation-mapper.mjs",
    "scripts/hermes-distillation-mapper.mjs",
    "schemas/hermes_distillation_mapping.schema.json",
    "test/governance.test.mjs",
    "docs/hermes-distillation-mapping-v0.15.md"
  ],
  must_not_edit: [
    "Hermes runtime files",
    "Misa persona or production memory",
    "Farcaster production publisher",
    "VPS services",
    "provider credentials or .env files",
    "Zilliz collections"
  ]
};

const NON_GOALS = [
  "Do not call model providers.",
  "Do not create embeddings.",
  "Do not write Zilliz.",
  "Do not write production journals.",
  "Do not write persistent Misa memory.",
  "Do not post publicly.",
  "Do not start timers or services.",
  "Do not change provider routes."
];

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function stableSlug(value) {
  return String(value || "hermes-distillation")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120) || "hermes-distillation";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function textMatchesAny(text, patterns) {
  const normalized = String(text ?? "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function normalizeRef(value, prefix = "ref") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  if (value.ref) return String(value.ref);
  if (value.id) return `${prefix}:${value.id}`;
  if (value.chunk_hash) return `zilliz:chunk:${value.chunk_hash}`;
  if (value.journal_entry_hash) {
    const date = value.journal_date || value.date || "unknown-date";
    return `journal:${date}:${value.journal_entry_hash}`;
  }
  if (value.path) return `${prefix}:${value.path}`;
  if (value.audit_path) return `audit:${value.audit_path}`;
  if (value.source_path) return `${prefix}:${value.source_path}`;
  return "";
}

function normalizeChunkRefs(input) {
  return uniqueStrings([
    ...asArray(input.chunk_refs).map((item) => normalizeRef(item, "zilliz")),
    ...asArray(input.chunks).map((item) => normalizeRef(item, "zilliz")),
    ...asArray(input.manifest_rows).map((item) => normalizeRef(item, "zilliz")),
    ...asArray(input.zilliz_manifest_rows).map((item) => normalizeRef(item, "zilliz"))
  ]);
}

function normalizeJournalRefs(input) {
  return uniqueStrings([
    ...asArray(input.journal_refs).map((item) => normalizeRef(item, "journal")),
    ...asArray(input.planned_entries).map((item) => normalizeRef(item, "journal")),
    ...asArray(input.journal_plan?.planned_entries).map((item) => normalizeRef(item, "journal"))
  ]);
}

function normalizeAuditRefs(input) {
  return uniqueStrings([
    ...asArray(input.audit_refs).map((item) => normalizeRef(item, "audit")),
    normalizeRef(input.audit_path, "audit"),
    normalizeRef(input.audit_log, "audit"),
    normalizeRef(input.audit, "audit")
  ]);
}

function normalizeSourceRefs(input) {
  return uniqueStrings([
    ...asArray(input.source_refs).map((item) => normalizeRef(item, "source")),
    ...asArray(input.session_refs).map((item) => normalizeRef(item, "session")),
    ...asArray(input.artifact_refs).map((item) => normalizeRef(item, "artifact"))
  ]);
}

function extractSummary(input) {
  const firstSessionResult = Array.isArray(input.session_results) ? input.session_results[0] : undefined;
  return firstString(
    input.summary,
    input.session_summary,
    input.distilled_summary,
    input.quality_result?.summary,
    input.failure_signal?.summary,
    firstSessionResult?.distilled_summary,
    firstSessionResult?.summary,
    "Hermes distillation artifact mapped into the Qianxuesen control-learning layer."
  );
}

function extractRiskLevel(input, classification) {
  const explicit = input.risk_level || input.risk?.level || input.quality_result?.risk_level || input.failure_signal?.risk_level;
  if (["low", "medium", "high", "critical"].includes(explicit)) {
    return explicit;
  }
  if (classification.highRisk) return "critical";
  if (classification.operatorQuality) return "high";
  if (classification.repeatedFailure) return "medium";
  return "low";
}

function extractOutcome(input, classification) {
  const explicit = input.outcome || input.quality_result?.outcome || input.failure_signal?.outcome;
  if (["success", "partial", "failure", "unknown"].includes(explicit)) {
    return explicit;
  }
  if (classification.repeatedFailure) return "failure";
  if (classification.operatorQuality || classification.missingEvidence || classification.highRisk) return "partial";
  return "success";
}

function classifyInput(input, evidence) {
  const summaryText = [
    extractSummary(input),
    JSON.stringify(input.risk ?? {}),
    JSON.stringify(input.quality_result ?? {}),
    JSON.stringify(input.failure_signal ?? {}),
    ...asArray(input.signals)
  ].join(" ");
  const riskFlags = uniqueStrings([
    ...asArray(input.risk_flags),
    ...asArray(input.risk?.flags),
    ...asArray(input.blocked_surfaces),
    ...asArray(input.live_effect_surfaces)
  ]).map((item) => item.toLowerCase());
  const textHighRisk = textMatchesAny(summaryText, [
    "production routing",
    "production service",
    "credential",
    "secret",
    "durable memory write",
    "persistent memory write",
    "write zilliz",
    "zilliz write",
    "provider route",
    "start timer",
    "start service"
  ]);
  const highRisk = riskFlags.some((flag) => HIGH_RISK_FLAGS.some((item) => flag.includes(item)))
    || textHighRisk
    || input.risk_level === "critical";
  const operatorQuality = String(input.source_kind ?? "").includes("farcaster_quality")
    || Boolean(input.quality_result?.verdict)
    || asArray(input.signals).includes("operator_quality")
    || asArray(input.signals).includes("persona_style_drift");
  const repeatedFailure = Boolean(input.failure_signal)
    || asArray(input.signals).includes("repeated_failure_pattern")
    || textMatchesAny(summaryText, ["repeated failure", "repeat failure", "failed repeatedly", "timeout loop", "重复失败", "反复失败"]);
  const missingEvidence = evidence.source_refs.length === 0 || evidence.audit_refs.length === 0;

  return {
    highRisk,
    operatorQuality,
    repeatedFailure,
    missingEvidence
  };
}

function signalsFor(input, classification) {
  const signals = [...asArray(input.signals)];
  if (classification.highRisk) {
    signals.push(
      "explicit_user_boundary",
      "public_posting_boundary",
      "production_boundary",
      "credential_boundary",
      "durable_memory_write_boundary"
    );
  }
  if (classification.operatorQuality) {
    signals.push(
      "operator_quality",
      "farcaster_low_quality_reply",
      "persona_style_drift",
      "public_posting_boundary"
    );
  }
  if (classification.repeatedFailure) {
    signals.push("repeated_failure_pattern");
  }
  if (classification.missingEvidence) {
    signals.push("needs_evidence", "explicit_user_boundary");
  }
  if (!classification.highRisk && !classification.operatorQuality && !classification.repeatedFailure) {
    signals.push("stable_project_fact");
  }
  return uniqueStrings(signals);
}

function sourceKindFor(input, classification) {
  if (classification.operatorQuality) return "farcaster_audit";
  if (classification.repeatedFailure) return "failure_log";
  return input.local_source_kind || "chat_window";
}

function channelFor(input, classification) {
  if (input.channel) return input.channel;
  if (classification.operatorQuality) return "farcaster";
  return "local";
}

function sourceIdFor(input) {
  return stableSlug(input.source_id || input.session_id || input.report_id || input.artifact_id || "hermes-distillation-source");
}

function turnsFor(input, summary, sourceId, allRefs, classification) {
  if (Array.isArray(input.turns) && input.turns.length > 0) {
    return input.turns.map((turn, index) => ({
      speaker: String(turn.speaker || "hermes"),
      ref: String(turn.ref || allRefs[index] || `${sourceId}:turn:${index + 1}`),
      text: String(turn.text || summary)
    }));
  }

  if (classification.highRisk) {
    return [
      {
        speaker: "hermes",
        ref: allRefs[0] || `${sourceId}:policy-boundary`,
        text: "Policy boundary: production routing, credentials, public send, and durable writes require human owner review with audit and rollback before any execution."
      }
    ];
  }

  const details = [];
  if (input.quality_result?.issues) {
    details.push(`Quality issues: ${asArray(input.quality_result.issues).join("; ")}`);
  }
  if (input.quality_result?.recommendations) {
    details.push(`Recommendations: ${asArray(input.quality_result.recommendations).join("; ")}`);
  }
  if (input.failure_signal?.reproduction) {
    details.push("Reproduction evidence is preserved on the repair ticket, not executed by the mapper.");
  }
  if (classification.missingEvidence) {
    details.push("Evidence is incomplete, so the mapper must block executable routing until source refs and audit refs are supplied.");
  }

  return [
    {
      speaker: "hermes",
      ref: allRefs[0] || `${sourceId}:summary`,
      text: [summary, ...details].filter(Boolean).join(" ")
    }
  ];
}

function buildEvidence(input) {
  const sourceRefs = normalizeSourceRefs(input);
  const chunkRefs = normalizeChunkRefs(input);
  const journalRefs = normalizeJournalRefs(input);
  const auditRefs = normalizeAuditRefs(input);
  const artifactEvidence = input.artifact_evidence ?? {};
  const readRefs = uniqueStrings([
    ...asArray(artifactEvidence.read),
    ...sourceRefs,
    ...chunkRefs,
    ...journalRefs,
    ...auditRefs
  ]);

  return {
    source_refs: sourceRefs,
    chunk_refs: chunkRefs,
    journal_refs: journalRefs,
    audit_refs: auditRefs,
    artifact_evidence: {
      injected: uniqueStrings(artifactEvidence.injected),
      read: readRefs,
      modified: uniqueStrings(artifactEvidence.modified),
      tool_errors: uniqueStrings([
        ...asArray(artifactEvidence.tool_errors),
        ...asArray(input.failure_signal?.tool_errors)
      ])
    }
  };
}

function buildLocalDistillationSource(input, evidence, classification) {
  const summary = extractSummary(input);
  const sourceId = sourceIdFor(input);
  const allRefs = uniqueStrings([
    ...evidence.source_refs,
    ...evidence.chunk_refs,
    ...evidence.journal_refs,
    ...evidence.audit_refs
  ]);
  const signals = signalsFor(input, classification);
  const riskLevel = extractRiskLevel(input, classification);
  const outcome = extractOutcome(input, classification);
  const source = {
    schema_version: "misa.local_distillation_source.v1",
    source_id: sourceId,
    source_kind: sourceKindFor(input, classification),
    channel: channelFor(input, classification),
    created_at: input.generated_at || input.created_at || "2026-05-12T00:00:00.000Z",
    local_only: true,
    uses_zilliz_proxy: false,
    vector_lookup_required: false,
    raw_window_default: false,
    redaction_status: classification.missingEvidence ? "blocked" : (input.redaction_status || "redacted"),
    redaction_note: input.redaction_note || "Mapped from an existing Hermes/Zilliz distillation artifact; raw private text is not required.",
    summary,
    setpoint: input.setpoint || "translate Hermes/Zilliz distillation output into Qianxuesen local control-learning input",
    evidence_count: Math.max(1, allRefs.length || Number(input.evidence_count || 1)),
    outcome,
    risk_level: riskLevel,
    signals,
    artifact_evidence: evidence.artifact_evidence,
    turns: turnsFor(input, summary, sourceId, allRefs, classification)
  };

  if (allRefs.length > 0) {
    source.source_refs = allRefs;
  }

  return source;
}

function routeTargetsFor(classification, learningEvents) {
  if (classification.missingEvidence) return ["needs_evidence"];
  if (classification.highRisk) return ["human_owner"];
  if (classification.operatorQuality) return ["operator_quality"];
  if (classification.repeatedFailure) return ["case", "repair_ticket", "work_order"];
  return uniqueStrings(learningEvents.map((event) => event.expected_route)).filter((route) => route !== "ignore");
}

function routingStatusFor(classification) {
  if (classification.missingEvidence) return "blocked";
  if (classification.highRisk) return "human_review";
  if (classification.operatorQuality) return "ask_before_execution";
  return "ready";
}

function suggestedExecutorFor(classification) {
  if (classification.missingEvidence || classification.highRisk) return "human_owner";
  if (classification.operatorQuality) return "persona_operator_agent";
  if (classification.repeatedFailure) return "specialized_engineering_agent";
  return "primary_agent";
}

function buildRepairTicket(input, source, distillation, classification) {
  if (!classification.repeatedFailure && !classification.highRisk) return null;

  const sourceKind = classification.highRisk ? "hermes_distillation_high_risk" : "hermes_distillation_repeated_failure";
  const severity = classification.highRisk ? "P0" : "P2";
  const sourceEventIds = distillation.learning_events.map((event) => event.event_id);
  const reproduction = uniqueStrings([
    ...asArray(input.failure_signal?.reproduction),
    ...asArray(input.reproduction_commands),
    "npm run hermes:map-distillation -- --fixture examples/hermes-distillation-mapping/repeated-failure.input.json --json --dry-run",
    "npm run validate:schemas",
    "npm test"
  ]);
  const acceptance = uniqueStrings([
    ...asArray(input.failure_signal?.acceptance_criteria),
    ...asArray(input.acceptance_criteria),
    "mapping output keeps llm_api_calls == 0",
    "mapping output keeps external_api_calls == 0",
    "work order requires user confirmation before execution",
    "durable or public effects remain blocked"
  ]);

  return {
    ticket_id: classification.highRisk
      ? `repair-${source.source_id}-high-risk-owner-review`
      : `repair-${source.source_id}-repeated-failure`,
    title: classification.highRisk
      ? "Hermes distillation high-risk owner review"
      : "Hermes distillation repeated failure repair",
    severity,
    status: classification.highRisk ? "must_fix" : "repair_candidate",
    source_kind: sourceKind,
    problem_statement: classification.highRisk
      ? "The mapped Hermes/Zilliz artifact touches production, credential, public-send, or durable-memory surfaces and must stop at human owner review."
      : "The mapped Hermes/Zilliz artifact describes a repeated failure pattern that should become a local repair work order, not an automatic runtime change.",
    evidence: {
      source_count: 1,
      turn_count: source.turns.length,
      raw_token_estimate: source.turns.reduce((sum, turn) => sum + String(turn.text).split(/\s+/).filter(Boolean).length, 0),
      distillate_token_estimate: Math.max(1, source.summary.split(/\s+/).filter(Boolean).length),
      compression_ratio: 1,
      route_counts: distillation.lesson_splitter.route_counts,
      original_auto_l3_skill_count: 0,
      minimal_l3_skill_count: 0,
      original_non_skill_promoted_count: 0,
      minimal_non_skill_promoted_count: 0,
      avoided_bad_promotions: 0,
      verdict: classification.highRisk ? "human_owner_required" : "repair_work_order_required",
      source_event_ids: sourceEventIds,
      source_refs: source.source_refs ?? []
    },
    bad_promotions: [],
    reproduction_commands: reproduction,
    acceptance_criteria: acceptance,
    codex_scope: {
      may_edit: uniqueStrings([
        ...DEFAULT_CODEX_SCOPE.may_edit,
        ...asArray(input.failure_signal?.affected_files),
        ...asArray(input.codex_scope?.may_edit)
      ]),
      must_not_edit: uniqueStrings([
        ...DEFAULT_CODEX_SCOPE.must_not_edit,
        ...asArray(input.codex_scope?.must_not_edit)
      ])
    },
    non_goals: [...NON_GOALS],
    repair_tasks: {
      must_fix: classification.highRisk
        ? [
          "Keep high-risk production, credential, public-send, and durable-memory changes behind human owner approval.",
          "Do not convert this mapping into autonomous execution."
        ]
        : [
          "Preserve reproduction evidence from the Hermes/Zilliz source artifact.",
          "Route the repair through work-order handoff before any code change."
        ],
      should_improve: [
        "Keep exact source refs and audit refs attached to the work order.",
        "Add regression coverage if the failure pattern becomes a code repair."
      ],
      observe_only: [
        "This mapper only creates local routing input; it does not execute the repair."
      ]
    },
    quality_notes: [
      "traceable: source refs and audit refs are preserved when present",
      "bounded: no provider, embedding, Zilliz, journal, memory, or public-send call is allowed",
      classification.highRisk ? "blocked: human owner review is required" : "actionable: reproduction and acceptance criteria are attached"
    ]
  };
}

function buildOperatorReport(input, source) {
  const quality = input.quality_result ?? {};
  const reportDate = input.report_date || String(source.created_at).slice(0, 10);
  return {
    schema: "misa.hermes.farcaster.daily_report.v1",
    report_id: input.report_id || source.source_id,
    report_date: reportDate,
    counts: {
      outcomes_considered: Number(input.counts?.outcomes_considered ?? quality.outcomes_considered ?? 1),
      quality_issues: asArray(quality.issues).length
    },
    operator_quality: {
      schema: "misa.hermes.farcaster.operator_quality.v1",
      verdict: quality.verdict || "tighten",
      recommendations: uniqueStrings([
        ...asArray(quality.recommendations),
        "report the quality work order before changing persona or public behavior",
        "do not auto-send Farcaster posts from this mapping result"
      ])
    }
  };
}

function compactWorkOrder(order) {
  if (!order) return null;
  return {
    work_order_id: order.work_order_id,
    category: order.category,
    severity: order.severity,
    risk_level: order.risk_level,
    suggested_executor: order.suggested_executor.executor_type,
    routing_status: order.status,
    default_next_step: order.execution_policy.default_next_step,
    requires_user_confirmation: order.execution_policy.requires_user_confirmation,
    auto_execute_allowed: order.execution_policy.auto_execute_allowed,
    audit_required: order.traceability.audit_required,
    rollback_required: order.traceability.rollback_required,
    source_refs: order.source_refs,
    reproduction_commands: order.traceability.reproduction_commands,
    acceptance_criteria: order.traceability.acceptance_criteria,
    forbidden_scope: order.traceability.forbidden_scope
  };
}

function compactLearningEvent(event) {
  return {
    event_id: event.event_id,
    expected_route: event.expected_route,
    summary: event.summary,
    signals: event.signals,
    outcome: event.outcome,
    risk_level: event.risk_level,
    source_refs: event.source_refs ?? [],
    artifact_evidence: event.artifact_evidence,
    expected_status: event.expected_status,
    expected_publication_mode: event.expected_publication_mode,
    expected_candidate_state: event.expected_candidate_state
  };
}

function checksFor({ evidence, classification, localSource, learningEvents, workOrder }) {
  return [
    {
      id: "zero_llm_api_calls",
      ok: true,
      reason: "Mapper is deterministic and does not call a model provider."
    },
    {
      id: "zero_external_api_calls",
      ok: true,
      reason: "Mapper reads only the supplied local artifact or fixture."
    },
    {
      id: "no_zilliz_write_or_embedding",
      ok: true,
      reason: "Mapper preserves chunk refs but does not create embeddings or write Zilliz."
    },
    {
      id: "traceability_gate",
      ok: !classification.missingEvidence,
      reason: classification.missingEvidence
        ? "Source refs or audit refs are missing, so executable routing is blocked."
        : "Source refs and audit refs are attached to the mapping output."
    },
    {
      id: "local_distillation_source_emitted",
      ok: Boolean(localSource),
      reason: "A Qianxuesen local_distillation_source is emitted for downstream local learning."
    },
    {
      id: "learning_events_emitted",
      ok: learningEvents.length > 0,
      reason: "The mapped local source was passed through the existing local distiller."
    },
    {
      id: "no_autonomous_execution",
      ok: !workOrder || workOrder.auto_execute_allowed === false,
      reason: "Generated work orders remain behind report-only or ask-before-execution behavior."
    },
    {
      id: "artifact_evidence_preserved",
      ok: evidence.artifact_evidence.read.length > 0 || classification.missingEvidence,
      reason: "Chunk, journal, source, and audit refs are carried as artifact evidence when supplied."
    }
  ];
}

function warningsFor(classification) {
  const warnings = [
    "Hermes/Zilliz stays the memory distillation and retrieval layer; this mapper only translates existing artifacts into Qianxuesen control-learning inputs.",
    "AI second-pass is off by default and this implementation does not call it."
  ];
  if (classification.missingEvidence) {
    warnings.push("Evidence is incomplete, so executable work-order generation is blocked.");
  }
  if (classification.highRisk) {
    warnings.push("High-risk surfaces are routed to human_owner with audit and rollback required.");
  }
  return warnings;
}

function summarizeFixture(result) {
  return {
    fixture_id: result.source.source_id,
    evidence_status: result.evidence.evidence_status,
    routing_status: result.routing.routing_status,
    route_targets: result.routing.route_targets,
    suggested_executor: result.routing.suggested_executor,
    learning_event_routes: result.learning_events.map((event) => event.expected_route),
    work_order: result.work_order ? {
      category: result.work_order.category,
      severity: result.work_order.severity,
      suggested_executor: result.work_order.suggested_executor,
      auto_execute_allowed: result.work_order.auto_execute_allowed,
      audit_required: result.work_order.audit_required,
      rollback_required: result.work_order.rollback_required
    } : null,
    repair_ticket: result.repair_ticket ? {
      severity: result.repair_ticket.severity,
      status: result.repair_ticket.status,
      reproduction_command_count: result.repair_ticket.reproduction_commands.length,
      acceptance_criteria_count: result.repair_ticket.acceptance_criteria.length
    } : null,
    safety: {
      llm_api_calls: result.safety.llm_api_calls,
      external_api_calls: result.safety.external_api_calls,
      ai_second_pass_enabled: result.safety.ai_second_pass_enabled,
      zilliz_written: result.safety.zilliz_written,
      writes_persistent_memory: result.safety.writes_persistent_memory,
      posts_publicly: result.safety.posts_publicly,
      autonomous_execution_allowed: result.safety.autonomous_execution_allowed
    }
  };
}

export async function mapHermesDistillation(input, {
  now,
  dryRun = true
} = {}) {
  const generatedAt = now ? now.toISOString() : (input.generated_at || input.created_at || "2026-05-12T00:00:00.000Z");
  const evidence = buildEvidence(input);
  const classification = classifyInput(input, evidence);
  const localSource = buildLocalDistillationSource(input, evidence, classification);
  const distillation = await distillMisaSources([localSource], { requireTemplateCoverage: false });
  const learningEvents = distillation.learning_events.map(compactLearningEvent);
  const repairTicket = buildRepairTicket(input, localSource, distillation, classification);
  const operatorReport = classification.operatorQuality && !classification.missingEvidence && !classification.highRisk
    ? buildOperatorReport(input, localSource)
    : null;
  const routingInput = repairTicket
    ? { repairTicketReview: { tickets: [repairTicket] } }
    : operatorReport
      ? { operationalReports: [operatorReport] }
      : null;
  const workOrderRouting = routingInput
    ? buildWorkOrderRouting({
      ...routingInput,
      now: new Date(generatedAt)
    })
    : null;
  const workOrder = compactWorkOrder(workOrderRouting?.work_orders?.[0]);
  const routeTargets = routeTargetsFor(classification, learningEvents);
  const checks = checksFor({ evidence, classification, localSource, learningEvents, workOrder });

  const result = {
    schema_version: "misa.hermes_distillation_mapping.v1",
    mode: "hermes-distillation-mapping",
    ok: true,
    created_at: generatedAt,
    dry_run: Boolean(dryRun),
    source: {
      source_id: localSource.source_id,
      source_kind: input.source_kind || "hermes_distillation_artifact",
      artifact_type: input.artifact_type || input.schema_version || "HermesDistillationArtifact",
      channel: localSource.channel
    },
    summary: {
      local_distillation_source_emitted: true,
      learning_event_count: learningEvents.length,
      work_order_created: Boolean(workOrder),
      repair_ticket_created: Boolean(repairTicket),
      llm_api_calls: 0,
      external_api_calls: 0,
      ai_second_pass_enabled: false,
      embedding_created: false,
      zilliz_written: false,
      production_write: false
    },
    evidence: {
      evidence_status: classification.missingEvidence ? "needs_evidence" : "complete",
      source_refs: evidence.source_refs,
      chunk_refs: evidence.chunk_refs,
      journal_refs: evidence.journal_refs,
      audit_refs: evidence.audit_refs,
      artifact_evidence: evidence.artifact_evidence
    },
    routing: {
      routing_status: routingStatusFor(classification),
      route_targets: routeTargets,
      suggested_executor: suggestedExecutorFor(classification),
      routing_policy: classification.operatorQuality || classification.repeatedFailure || classification.highRisk
        ? "ask_before_execution"
        : "report_only",
      ask_before_execution: classification.operatorQuality || classification.repeatedFailure || classification.highRisk,
      autonomous_execution_allowed: false,
      audit_required: classification.highRisk || Boolean(workOrder?.audit_required),
      rollback_required: classification.highRisk || Boolean(workOrder?.rollback_required),
      no_public_send: true,
      no_zilliz_write: true,
      no_memory_write: true
    },
    local_distillation_source: localSource,
    learning_events: learningEvents,
    repair_ticket: repairTicket,
    operator_report: operatorReport,
    work_order: workOrder,
    safety: { ...ZERO_CALL_SAFETY },
    checks,
    warnings: warningsFor(classification),
    violations: []
  };

  result.expectation_summary = summarizeFixture(result);
  return result;
}

export async function loadHermesMappingFixtures({
  repoRoot = process.cwd(),
  fixtureDir = FIXTURE_DIR
} = {}) {
  const root = path.isAbsolute(fixtureDir) ? fixtureDir : path.join(repoRoot, fixtureDir);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const fixtures = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".input.json")) continue;
    const filePath = path.join(root, entry.name);
    const raw = await fs.readFile(filePath, "utf8");
    fixtures.push({
      fixture_id: entry.name.replace(/\.input\.json$/, ""),
      file_path: filePath,
      input: JSON.parse(raw)
    });
  }
  fixtures.sort((a, b) => a.fixture_id.localeCompare(b.fixture_id));
  return fixtures;
}

export async function evaluateHermesMappingFixtures({
  repoRoot = process.cwd(),
  fixtureDir = FIXTURE_DIR,
  now
} = {}) {
  const fixtures = await loadHermesMappingFixtures({ repoRoot, fixtureDir });
  const results = [];
  const violations = [];
  for (const fixture of fixtures) {
    const result = await mapHermesDistillation(fixture.input, { now, dryRun: true });
    results.push(result);
    if (!result.ok) {
      violations.push(`${fixture.fixture_id}: mapper returned not ok`);
    }
    if (result.safety.llm_api_calls !== 0 || result.safety.external_api_calls !== 0) {
      violations.push(`${fixture.fixture_id}: mapper made a forbidden API call`);
    }
    if (result.safety.zilliz_written || result.safety.writes_persistent_memory || result.safety.posts_publicly) {
      violations.push(`${fixture.fixture_id}: mapper crossed a forbidden write/public boundary`);
    }
  }

  return {
    mode: "hermes-distillation-mapping-fixtures",
    ok: fixtures.length >= 5 && violations.length === 0,
    summary: {
      fixture_count: fixtures.length,
      mapped_count: results.length,
      work_order_count: results.filter((item) => item.work_order).length,
      blocked_count: results.filter((item) => item.routing.routing_status === "blocked").length,
      human_owner_count: results.filter((item) => item.routing.suggested_executor === "human_owner").length,
      llm_api_calls: results.reduce((sum, item) => sum + item.safety.llm_api_calls, 0),
      external_api_calls: results.reduce((sum, item) => sum + item.safety.external_api_calls, 0)
    },
    results,
    violations
  };
}

export { summarizeFixture };
