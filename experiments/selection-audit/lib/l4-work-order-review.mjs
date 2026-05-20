import fs from "node:fs/promises";
import path from "node:path";
import {
  buildHermesDelegateDefaultArgs,
  hermesDelegateArgsFromEnv,
  hermesDelegateCommandFromEnv,
  hermesDelegateModelFromEnv,
  hermesDelegateProviderFromEnv,
  parseJsonArray,
  replaceArgPlaceholders,
  runHermesDelegateCommand,
  serializeProviderError,
  stripJson
} from "../../external-trajectory/lib/external-trajectory-llm-work-order-draft.mjs";

export const DEFAULT_L4_REVIEW_PROVIDER = "mock";
export const DEFAULT_L4_REVIEW_MODEL = "work-order-reviewer";
export const DEFAULT_L4_REVIEW_TIMEOUT_MS = 180000;

const VERDICTS = new Set(["accept", "revise", "reject", "human_needed", "owner_needed"]);
const KNOWN_FEEDBACK_SIGNALS = new Set([
  "policy_clean",
  "low_revision_needed",
  "policy_conflict",
  "human_review_requested"
]);
const HANDOFF_TARGETS = new Set(["no_context_worker", "primary_agent", "maintainer_or_owner", "none"]);
const EXECUTION_RISKS = new Set(["low", "medium", "high"]);

const HIGH_RISK_ACTION_RULES = [
  {
    scope: "repository_push_or_publish",
    pattern: /\b(push|publish)\b.*\b(git|github|gitlab|repository|repo|branch|remote|origin)\b|\b(git|github|gitlab|repository|repo|branch|remote|origin)\b.*\b(push|publish)\b/i
  },
  {
    scope: "release_or_deployment",
    pattern: /\b(release|deploy|deployment|rollout)\b/i
  },
  {
    scope: "production_or_remote_runtime",
    pattern: /\b(production|prod|live service|remote runtime|production server|remote server|live server|cloud server|cloud runtime|hosted environment)\b/i
  },
  {
    scope: "persistent_memory_or_database",
    pattern: /\b(write|upsert|insert|update|delete|persist|store|migrate)\b.*\b(memory|database|db|datastore|vector store|vector db|embedding store|index)\b|\b(memory|database|db|datastore|vector store|vector db|embedding store|index)\b.*\b(write|upsert|insert|update|delete|persist|store|migrate)\b/i
  },
  {
    scope: "public_publish",
    pattern: /\b(public post|public publish|publish publicly|tweet|cast|social post|send email|send message|notify users)\b/i
  },
  {
    scope: "secrets_or_credentials",
    pattern: /\b(secret|credential|api key|token|password|private key|oauth|auth key)\b/i
  },
  {
    scope: "permission_or_access_change",
    pattern: /\b(permission|access control|role|acl|chmod|chown|grant|revoke)\b/i
  },
  {
    scope: "destructive_delete",
    pattern: /\b(delete|remove|drop|truncate|wipe|purge|destroy)\b.*\b(data|database|db|record|row|table|collection|bucket|index|persistent|production|remote)\b|\b(data|database|db|record|row|table|collection|bucket|index|persistent|production|remote)\b.*\b(delete|remove|drop|truncate|wipe|purge|destroy)\b/i
  }
];

const NEGATED_SIDE_EFFECT_PATTERN = /\b(do not|don't|never|without|no|avoid|forbid|forbidden|must not|should not|not allowed|disallow|read-only|readonly|observe-only|review-only|dry-run|dry run|no-write|no write|non-executable|does not|will not|must remain)\b/i;

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-18T12:00:00.000Z").toISOString() : date.toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, Math.round(number * 1000) / 1000));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function average(values) {
  return values.length
    ? Math.round(1000 * values.reduce((sum, value) => sum + Number(value), 0) / values.length) / 1000
    : 0;
}

function feedbackSignalsForVerdict(verdict, rawSignals = []) {
  const kept = rawSignals.filter((signal) => KNOWN_FEEDBACK_SIGNALS.has(signal));
  const base = {
    accept: ["policy_clean"],
    revise: ["low_revision_needed"],
    reject: ["policy_conflict"],
    human_needed: ["human_review_requested"]
  }[verdict] ?? ["human_review_requested"];
  return uniqueStrings([...base, ...kept]);
}

function resultStatusForVerdict(verdict) {
  if (verdict === "accept") return "succeeded";
  if (verdict === "revise") return "drafted";
  return "blocked";
}

function defaultHandoffTargetForVerdict(verdict) {
  if (verdict === "accept") return "no_context_worker";
  if (verdict === "revise") return "primary_agent";
  if (verdict === "reject") return "none";
  return "maintainer_or_owner";
}

function defaultExecutionRiskForVerdict(verdict) {
  if (verdict === "accept") return "low";
  if (verdict === "revise") return "medium";
  return "high";
}

function compactWorkOrder(draft) {
  if (!draft) return null;
  return {
    title: draft.title ?? null,
    problem: draft.problem ?? null,
    evidence_refs: draft.evidence_refs ?? [],
    concrete_tasks: draft.concrete_tasks ?? [],
    acceptance_criteria: draft.acceptance_criteria ?? [],
    verification_commands: draft.verification_commands ?? [],
    forbidden_scope: draft.forbidden_scope ?? [],
    risk_notes: draft.risk_notes ?? [],
    stop_condition: draft.stop_condition ?? null
  };
}

function workOrderReviewTextLines(workOrder = {}) {
  return [
    workOrder.title,
    workOrder.problem,
    ...(workOrder.concrete_tasks ?? []),
    ...(workOrder.acceptance_criteria ?? []),
    ...(workOrder.verification_commands ?? []),
    ...(workOrder.risk_notes ?? []),
    workOrder.stop_condition
  ]
    .filter((value) => value !== null && value !== undefined)
    .flatMap((value) => String(value).split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectHighRiskAuthorizationNeeds(workOrder = {}) {
  const requestedScopes = new Set();
  const evidence = [];
  for (const line of workOrderReviewTextLines(workOrder)) {
    if (NEGATED_SIDE_EFFECT_PATTERN.test(line)) continue;
    for (const rule of HIGH_RISK_ACTION_RULES) {
      if (rule.pattern.test(line)) {
        requestedScopes.add(rule.scope);
        if (evidence.length < 8) evidence.push({ scope: rule.scope, text: line });
      }
    }
  }
  const authorizationScopes = [...requestedScopes].sort();
  return {
    requires_user_authorization: authorizationScopes.length > 0,
    authorization_reason: authorizationScopes.length
      ? "work_order_requests_high_risk_external_or_persistent_side_effects"
      : null,
    authorization_scopes: authorizationScopes,
    authorization_evidence: evidence
  };
}

function buildDecisionIndex(l3Report) {
  return new Map((l3Report?.decisions ?? []).map((decision) => [decision.source_id, decision]));
}

function shouldReviewDecision(decision, { includeRedSpotChecks }) {
  if (!decision) return false;
  if (decision.l4_forward) return true;
  return Boolean(includeRedSpotChecks && decision.l4_spot_check);
}

function selectReviewTargets({ l2Report, l3Report, sourceIds = [], includeRedSpotChecks = true }) {
  const wanted = new Set(sourceIds);
  const decisions = buildDecisionIndex(l3Report);
  return (l2Report?.results ?? [])
    .map((l2Item) => {
      const decision = decisions.get(l2Item.source_id);
      if (!shouldReviewDecision(decision, { includeRedSpotChecks })) return null;
      if (wanted.size && !wanted.has(l2Item.source_id)) return null;
      return {
        source_id: l2Item.source_id,
        l2_item: l2Item,
        l3_decision: decision
      };
    })
    .filter(Boolean);
}

export function buildL4WorkOrderReviewPacket({ l2Item, l3Decision, l2Report, l3Report }) {
  const packet = l2Item.packet ?? {};
  return {
    schema_version: "misa.l4_work_order_review_packet.v1",
    mode: "hermes-delegate-observe-only",
    layer: "L4",
    role: "no-context-work-order-reviewer",
    context_policy: {
      inherit_chat_history: false,
      parent_context_allowed: false,
      allowed_context: "this L4 review packet only",
      memory_lookup_allowed: false,
      repo_file_reads_allowed: false,
      executes_work_order: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false
    },
    execution_policy: {
      observe_only: true,
      review_only: true,
      execute_work_order: false,
      route_change_allowed: false,
      winner_change_allowed: false,
      memory_write_allowed: false,
      zilliz_write_allowed: false,
      embedding_creation_allowed: false,
      vps_touch_allowed: false,
      github_push_allowed: false,
      public_publish_allowed: false
    },
    input: {
      source_id: l2Item.source_id,
      l2_provider: l2Report?.provider ?? l2Item.provider ?? null,
      l2_model: l2Report?.model ?? l2Item.model ?? null,
      l3_pool: l3Decision?.pool ?? null,
      l3_quality_score: l3Decision?.quality_score ?? null,
      l3_gate_class: l3Decision?.gate_class ?? l2Item.gate?.gate_class ?? null,
      l3_reason_codes: l3Decision?.reason_codes ?? [],
      l3_feedback: l2Item.l3_feedback ?? l3Decision?.l3_feedback ?? null,
      l3_report_created_at: l3Report?.created_at ?? null
    },
    source: {
      source_id: l2Item.source_id,
      readout_family: packet.readout_family ?? null,
      route_hint: packet.route_hint ?? null,
      severity: packet.severity ?? null,
      priority: packet.priority ?? null,
      observed_signals: packet.observed_signals ?? [],
      evidence_refs: packet.evidence_refs ?? l2Item.draft?.evidence_refs ?? [],
      relevant_files: packet.relevant_files ?? [],
      allowed_verification_commands: packet.allowed_verification_commands ?? []
    },
    work_order_under_review: compactWorkOrder(l2Item.draft),
    local_gate_summary: {
      gate_ok: Boolean(l2Item.gate?.ok),
      gate_class: l2Item.gate?.gate_class ?? null,
      quality_score: l2Item.gate?.quality_score ?? null,
      violations: l2Item.gate?.violations ?? [],
      soft_violations: l2Item.gate?.soft_violations ?? [],
      warning_codes: l2Item.gate?.warning_codes ?? [],
      actionableTaskCount: l2Item.gate?.checks?.actionableTaskCount ?? null,
      weakTaskCount: l2Item.gate?.checks?.weakTaskCount ?? null,
      specificityHits: l2Item.gate?.checks?.specificityHits ?? null
    },
    review_question: "Can a fresh no-context engineer or sub-agent safely execute this work order using only the work order text and the listed local verification commands?",
    output_contract: {
      required_verdicts: ["accept", "revise", "reject", "human_needed"],
      known_feedback_signals: [...KNOWN_FEEDBACK_SIGNALS],
      accept_means: "self-contained, concrete, safe, and execution-ready without parent chat or memory",
      revise_means: "useful but missing context, expected result, file/test anchor, or boundary wording",
      reject_means: "not actionable or unsafe as an execution handoff",
      human_needed_means: "requires owner/project context that this packet does not contain",
      owner_needed_means: "requests high-risk external, persistent, public, credential, permission, or destructive effects that need explicit maintainer/user authorization"
    }
  };
}

function promptForHermesDelegate(packet) {
  return `You are a fresh Hermes L4 no-context work-order reviewer.
Use delegate_task if it is available; otherwise complete the same observe-only review directly.
Do not use chat history, memory, Zilliz, embeddings, repo file reads, tools, route/winner authority, VPS, GitHub push, public posting, or work-order execution.
Only use the L4ReviewPacket below. Return JSON only.

Judge the work order as a handoff artifact:
- accept only if a no-context engineer/sub-agent could execute it safely from the work order text alone.
- revise if it is mostly useful but lacks a concrete file/test anchor, source/evidence anchor, expected result, command boundary, or stop condition.
- reject if it is generic, unsafe, or not actionable.
- human_needed if the work order depends on owner/project context missing from the packet.
- owner_needed if the work order asks for repository push/publish, release/deploy, production or remote runtime changes, persistent memory/database/vector-store writes, public publishing, secrets/credentials, permission changes, or destructive deletes without explicit user authorization in this packet.
- feedback_signals must use only these existing signals: policy_clean, low_revision_needed, policy_conflict, human_review_requested.

L4ReviewPacket:
${JSON.stringify(packet, null, 2)}

Return shape:
{
  "verdict": "accept" | "revise" | "reject" | "human_needed" | "owner_needed",
  "handoff_target": "no_context_worker" | "primary_agent" | "maintainer_or_owner" | "none",
  "execution_readiness_score": number,
  "can_execute_without_parent_context": boolean,
  "requires_user_authorization": boolean,
  "authorization_reason": string | null,
  "authorization_scopes": string[],
  "blocking_reasons": string[],
  "context_gaps": string[],
  "execution_risk": "low" | "medium" | "high",
  "task_specificity_notes": string[],
  "feedback_signals": string[],
  "recommended_next_step": string,
  "recommendation_only": true,
  "executes_work_order": false,
  "llm_notes": string
}`;
}

async function callHermesDelegate({
  packet,
  repoRoot,
  command,
  args,
  hermesProvider,
  hermesModel,
  timeoutMs
}) {
  const prompt = promptForHermesDelegate(packet);
  const effectiveCommand = command ?? hermesDelegateCommandFromEnv();
  const configuredArgs = args ?? hermesDelegateArgsFromEnv();
  const effectiveArgs = configuredArgs
    ? replaceArgPlaceholders(configuredArgs, { prompt, auditPacket: packet })
    : buildHermesDelegateDefaultArgs({
      prompt,
      provider: hermesProvider,
      model: hermesModel
    });
  return await runHermesDelegateCommand({
    command: effectiveCommand,
    args: effectiveArgs,
    repoRoot,
    timeoutMs,
    stdinPayload: {
      schema_version: "misa.hermes_delegate_bridge_input.v1",
      provider: "hermes-delegate",
      mode: "l4_no_context_work_order_review",
      prompt,
      audit_packet: packet
    }
  });
}

function deterministicReviewForPacket(packet) {
  const workOrder = packet.work_order_under_review ?? {};
  const gate = packet.local_gate_summary ?? {};
  const taskCount = Array.isArray(workOrder.concrete_tasks) ? workOrder.concrete_tasks.length : 0;
  const commandCount = Array.isArray(workOrder.verification_commands) ? workOrder.verification_commands.length : 0;
  const evidenceCount = Array.isArray(workOrder.evidence_refs) ? workOrder.evidence_refs.length : 0;
  const weakCount = Number(gate.weakTaskCount ?? 0);
  const actionableCount = Number(gate.actionableTaskCount ?? 0);
  const hasStop = Boolean(workOrder.stop_condition);
  const safeForbiddenScope = Array.isArray(workOrder.forbidden_scope)
    && workOrder.forbidden_scope.some((item) => /do_not_write_memory|do_not_write_persistent_memory|do_not_write_persistent_state|do_not_write_database|do_not_write_vector_store|do_not_touch_vps|do_not_touch_production|do_not_touch_remote_runtime|do_not_push_github|do_not_push_repository|do_not_publish_repository|do_not_publish_publicly|do_not_public_publish/i.test(String(item)));
  const authorization = detectHighRiskAuthorizationNeeds(workOrder);

  if (authorization.requires_user_authorization) {
    return {
      verdict: "owner_needed",
      handoff_target: "maintainer_or_owner",
      execution_readiness_score: 0.48,
      can_execute_without_parent_context: false,
      requires_user_authorization: true,
      authorization_reason: authorization.authorization_reason,
      authorization_scopes: authorization.authorization_scopes,
      authorization_evidence: authorization.authorization_evidence,
      blocking_reasons: ["requires_user_authorization", ...authorization.authorization_scopes.map((scope) => `high_risk:${scope}`)],
      context_gaps: ["explicit_user_authorization_missing"],
      execution_risk: "high",
      task_specificity_notes: ["Work order requests high-risk external or persistent effects; request explicit user authorization before execution."],
      feedback_signals: ["human_review_requested"],
      recommended_next_step: "request_user_authorization",
      recommendation_only: true,
      executes_work_order: false,
      llm_notes: "Deterministic L4 mock review blocked handoff until user authorization is granted."
    };
  }

  const good = Boolean(gate.gate_ok)
    && actionableCount >= 4
    && weakCount === 0
    && taskCount >= 4
    && commandCount > 0
    && evidenceCount > 0
    && hasStop
    && safeForbiddenScope;

  if (good) {
    return {
      verdict: "accept",
      handoff_target: "no_context_worker",
      execution_readiness_score: 0.96,
      can_execute_without_parent_context: true,
      requires_user_authorization: false,
      authorization_reason: null,
      authorization_scopes: [],
      authorization_evidence: [],
      blocking_reasons: [],
      context_gaps: [],
      execution_risk: "low",
      task_specificity_notes: ["Work order has concrete tasks, evidence refs, local commands, forbidden scope, and a stop condition."],
      feedback_signals: ["policy_clean"],
      recommended_next_step: "forward_to_no_context_execution_trial",
      recommendation_only: true,
      executes_work_order: false,
      llm_notes: "Deterministic L4 mock review accepted the L3 handoff."
    };
  }

  const blockingReasons = [];
  if (!gate.gate_ok) blockingReasons.push("local_gate_did_not_pass");
  if (actionableCount < 4) blockingReasons.push("too_few_actionable_tasks");
  if (weakCount > 0) blockingReasons.push("weak_tasks_present");
  if (!evidenceCount) blockingReasons.push("missing_evidence_refs");
  if (!commandCount) blockingReasons.push("missing_verification_commands");
  if (!hasStop) blockingReasons.push("missing_stop_condition");
  if (!safeForbiddenScope) blockingReasons.push("missing_forbidden_scope_boundary");

  return {
    verdict: blockingReasons.includes("missing_evidence_refs") || blockingReasons.includes("missing_verification_commands")
      ? "human_needed"
      : "revise",
    handoff_target: blockingReasons.includes("missing_evidence_refs") || blockingReasons.includes("missing_verification_commands")
      ? "maintainer_or_owner"
      : "primary_agent",
    execution_readiness_score: 0.62,
    can_execute_without_parent_context: false,
    requires_user_authorization: false,
    authorization_reason: null,
    authorization_scopes: [],
    authorization_evidence: [],
    blocking_reasons: blockingReasons,
    context_gaps: blockingReasons.filter((reason) => reason.startsWith("missing_")),
    execution_risk: "medium",
    task_specificity_notes: ["Work order needs a tighter handoff before no-context execution."],
    feedback_signals: blockingReasons.includes("missing_evidence_refs") ? ["human_review_requested"] : ["low_revision_needed"],
    recommended_next_step: "send_back_to_l2_l3_prompt_or_gate_tuning",
    recommendation_only: true,
    executes_work_order: false,
    llm_notes: "Deterministic L4 mock review found handoff gaps."
  };
}

async function callReviewProvider({
  packet,
  provider,
  repoRoot,
  hermesDelegateOptions = {}
}) {
  if (provider === "mock") {
    return {
      raw: JSON.stringify(deterministicReviewForPacket(packet)),
      llm_api_calls: 0,
      provider_error: null
    };
  }
  if (provider === "hermes-delegate") {
    try {
      return {
        raw: await callHermesDelegate({
          packet,
          repoRoot,
          command: hermesDelegateOptions.command,
          args: hermesDelegateOptions.args,
          hermesProvider: hermesDelegateOptions.provider,
          hermesModel: hermesDelegateOptions.model,
          timeoutMs: hermesDelegateOptions.timeoutMs ?? DEFAULT_L4_REVIEW_TIMEOUT_MS
        }),
        llm_api_calls: 1,
        provider_error: null
      };
    } catch (error) {
      return {
        raw: "",
        llm_api_calls: 1,
        provider_error: serializeProviderError(error)
      };
    }
  }
  if (typeof provider === "function") {
    try {
      return {
        raw: await provider({ packet, prompt: promptForHermesDelegate(packet) }),
        llm_api_calls: 1,
        provider_error: null
      };
    } catch (error) {
      return {
        raw: "",
        llm_api_calls: 1,
        provider_error: serializeProviderError(error)
      };
    }
  }
  throw new Error(`unsupported L4 review provider: ${provider}`);
}

function normalizeReview(rawReview, { providerError = null } = {}) {
  if (providerError) {
    return {
      verdict: "human_needed",
      handoff_target: "maintainer_or_owner",
      execution_readiness_score: 0,
      can_execute_without_parent_context: false,
      requires_user_authorization: false,
      authorization_reason: null,
      authorization_scopes: [],
      authorization_evidence: [],
      blocking_reasons: ["provider_error"],
      context_gaps: [],
      execution_risk: "high",
      task_specificity_notes: [],
      feedback_signals: ["human_review_requested"],
      recommended_next_step: "retry_l4_review_or_owner_review",
      recommendation_only: true,
      executes_work_order: false,
      llm_notes: providerError.message ?? "provider error"
    };
  }

  const parsed = rawReview && typeof rawReview === "object" ? rawReview : {};
  const verdict = VERDICTS.has(parsed.verdict) ? parsed.verdict : "human_needed";
  return {
    verdict,
    handoff_target: HANDOFF_TARGETS.has(parsed.handoff_target)
      ? parsed.handoff_target
      : defaultHandoffTargetForVerdict(verdict),
    execution_readiness_score: clampScore(parsed.execution_readiness_score),
    can_execute_without_parent_context: Boolean(parsed.can_execute_without_parent_context),
    requires_user_authorization: Boolean(parsed.requires_user_authorization),
    authorization_reason: parsed.authorization_reason === null || parsed.authorization_reason === undefined
      ? null
      : String(parsed.authorization_reason).trim() || null,
    authorization_scopes: uniqueStrings(parsed.authorization_scopes ?? []),
    authorization_evidence: Array.isArray(parsed.authorization_evidence)
      ? parsed.authorization_evidence.slice(0, 8).map((item) => ({
        scope: String(item?.scope ?? "").trim(),
        text: String(item?.text ?? "").trim()
      })).filter((item) => item.scope && item.text)
      : [],
    blocking_reasons: uniqueStrings(parsed.blocking_reasons ?? []),
    context_gaps: uniqueStrings(parsed.context_gaps ?? []),
    execution_risk: EXECUTION_RISKS.has(parsed.execution_risk)
      ? parsed.execution_risk
      : defaultExecutionRiskForVerdict(verdict),
    task_specificity_notes: uniqueStrings(parsed.task_specificity_notes ?? []),
    feedback_signals: feedbackSignalsForVerdict(verdict, uniqueStrings(parsed.feedback_signals ?? [])),
    recommended_next_step: String(parsed.recommended_next_step ?? "").trim() || "owner_review_l4_result",
    recommendation_only: true,
    executes_work_order: false,
    llm_notes: String(parsed.llm_notes ?? "").trim()
  };
}

function parseReview(raw, providerError) {
  if (providerError) return normalizeReview(null, { providerError });
  try {
    return normalizeReview(JSON.parse(stripJson(raw)));
  } catch (error) {
    return normalizeReview(null, {
      providerError: {
        code: "l4_review_parse_failed",
        message: error.message
      }
    });
  }
}

async function reviewOneTarget({
  target,
  l2Report,
  l3Report,
  repoRoot,
  provider,
  hermesDelegateOptions,
  createdAt
}) {
  const packet = buildL4WorkOrderReviewPacket({
    l2Item: target.l2_item,
    l3Decision: target.l3_decision,
    l2Report,
    l3Report
  });
  const providerResult = await callReviewProvider({
    packet,
    provider,
    repoRoot,
    hermesDelegateOptions
  });
  const review = parseReview(providerResult.raw, providerResult.provider_error);
  return {
    schema_version: "misa.l4_work_order_review.v1",
    created_at: createdAt,
    source_id: target.source_id,
    layer: "L4",
    role: "no-context-work-order-reviewer",
    provider: typeof provider === "string" ? provider : "custom",
    model: typeof provider === "string" ? (hermesDelegateOptions.model ?? DEFAULT_L4_REVIEW_MODEL) : "custom",
    llm_api_calls: providerResult.llm_api_calls,
    provider_error: providerResult.provider_error,
    l3_pool: target.l3_decision.pool,
    l3_quality_score: target.l3_decision.quality_score,
    l3_feedback_status: target.l3_decision.l3_feedback_status ?? target.l2_item.l3_feedback?.final_status ?? null,
    l2_gate_ok: Boolean(target.l2_item.gate?.ok),
    l2_gate_class: target.l2_item.gate?.gate_class ?? null,
    l2_quality_score: target.l2_item.gate?.quality_score ?? null,
    draft_title: target.l2_item.draft?.title ?? null,
    review,
    feedback_event: {
      status: resultStatusForVerdict(review.verdict),
      feedback_signals: review.feedback_signals,
      metrics: {
        execution_readiness_score: review.execution_readiness_score,
        can_execute_without_parent_context: review.can_execute_without_parent_context,
        l3_quality_score: target.l3_decision.quality_score ?? null
      }
    },
    safety_counters: {
      work_order_executions: 0,
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      route_changes: 0,
      winner_changes: 0,
      vps_touches: 0,
      github_pushes: 0,
      public_publishes: 0
    }
  };
}

function summarizeReviews({ reviews, provider, l2Report, l3Report }) {
  const verdictCounts = sortedObject(countBy(reviews, (review) => review.review.verdict));
  const feedbackSignals = reviews.flatMap((review) => review.review.feedback_signals);
  const authorizationScopes = reviews.flatMap((review) => review.review.authorization_scopes ?? []);
  const handoffTargets = reviews.map((review) => review.review.handoff_target ?? "unknown");
  const executionRisks = reviews.map((review) => review.review.execution_risk ?? "unknown");
  const poolVerdicts = {};
  for (const review of reviews) {
    const pool = review.l3_pool ?? "unknown";
    poolVerdicts[pool] = poolVerdicts[pool] ?? {};
    poolVerdicts[pool][review.review.verdict] = (poolVerdicts[pool][review.review.verdict] ?? 0) + 1;
  }
  return {
    sample_count: reviews.length,
    l2_sample_count: l2Report?.summary?.sample_count ?? null,
    l3_forward_count: l3Report?.summary?.l4_forward_count ?? null,
    verdict_counts: verdictCounts,
    accept_count: verdictCounts.accept ?? 0,
    revise_count: verdictCounts.revise ?? 0,
    reject_count: verdictCounts.reject ?? 0,
    human_needed_count: verdictCounts.human_needed ?? 0,
    owner_needed_count: verdictCounts.owner_needed ?? 0,
    requires_user_authorization_count: reviews.filter((review) => review.review.requires_user_authorization).length,
    authorization_scope_counts: sortedObject(countBy(authorizationScopes, (scope) => scope)),
    handoff_target_counts: sortedObject(countBy(handoffTargets, (target) => target)),
    execution_risk_counts: sortedObject(countBy(executionRisks, (risk) => risk)),
    avg_execution_readiness_score: average(reviews.map((review) => review.review.execution_readiness_score)),
    no_context_executable_count: reviews.filter((review) => review.review.can_execute_without_parent_context).length,
    provider_error_count: reviews.filter((review) => review.provider_error).length,
    llm_api_calls: reviews.reduce((sum, review) => sum + Number(review.llm_api_calls ?? 0), 0),
    external_api_calls: provider === "mock" ? 0 : reviews.reduce((sum, review) => sum + Number(review.llm_api_calls ?? 0), 0),
    feedback_signal_counts: sortedObject(countBy(feedbackSignals, (signal) => signal)),
    pool_verdict_counts: Object.fromEntries(Object.entries(poolVerdicts)
      .map(([pool, counts]) => [pool, sortedObject(counts)])
      .sort(([left], [right]) => left.localeCompare(right))),
    memory_writes: 0,
    zilliz_writes: 0,
    embedding_creations: 0,
    route_changes: 0,
    winner_changes: 0,
    work_order_executions: 0,
    vps_touches: 0,
    github_pushes: 0,
    public_publishes: 0
  };
}

export async function buildL4WorkOrderReviewReport({
  repoRoot = process.cwd(),
  l2Report,
  l2ReportPath,
  l3Report,
  l3ReportPath,
  sourceIds = [],
  includeRedSpotChecks = true,
  provider = DEFAULT_L4_REVIEW_PROVIDER,
  hermesDelegateCommand,
  hermesDelegateArgs,
  hermesDelegateProvider = hermesDelegateProviderFromEnv(),
  hermesDelegateModel = hermesDelegateModelFromEnv(),
  hermesDelegateTimeoutMs = DEFAULT_L4_REVIEW_TIMEOUT_MS,
  now = new Date()
} = {}) {
  const resolvedL2 = l2Report ?? await readJson(resolvePath(repoRoot, l2ReportPath));
  const resolvedL3 = l3Report ?? await readJson(resolvePath(repoRoot, l3ReportPath));
  const targets = selectReviewTargets({
    l2Report: resolvedL2,
    l3Report: resolvedL3,
    sourceIds,
    includeRedSpotChecks
  });
  const createdAt = asIsoDate(now);
  const reviews = [];
  for (const target of targets) {
    reviews.push(await reviewOneTarget({
      target,
      l2Report: resolvedL2,
      l3Report: resolvedL3,
      repoRoot,
      provider,
      hermesDelegateOptions: {
        command: hermesDelegateCommand,
        args: hermesDelegateArgs,
        provider: hermesDelegateProvider,
        model: hermesDelegateModel,
        timeoutMs: hermesDelegateTimeoutMs
      },
      createdAt
    }));
  }
  const summary = summarizeReviews({
    reviews,
    provider,
    l2Report: resolvedL2,
    l3Report: resolvedL3
  });
  return {
    schema_version: "misa.l4_work_order_review_report.v1",
    mode: "l4-work-order-review",
    ok: summary.provider_error_count === 0,
    created_at: createdAt,
    input: {
      l2_report_path: normalizePathForReport(repoRoot, l2ReportPath ?? resolvedL3?.input?.l2_report_path),
      l3_report_path: normalizePathForReport(repoRoot, l3ReportPath),
      l2_provider: resolvedL2.provider ?? null,
      l2_model: resolvedL2.model ?? null,
      l3_mode: resolvedL3.mode ?? null,
      source_ids: sourceIds
    },
    provider: typeof provider === "string" ? provider : "custom",
    model: typeof provider === "string" ? (hermesDelegateModel ?? DEFAULT_L4_REVIEW_MODEL) : "custom",
    delegate: {
      provider: hermesDelegateProvider ?? null,
      model: hermesDelegateModel ?? null
    },
    summary,
    safety: {
      local_report_only: true,
      calls_llm: provider !== "mock",
      executes_work_orders: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      changes_route: false,
      changes_winner: false,
      touches_vps: false,
      pushes_github: false,
      publishes_publicly: false,
      requests_user_authorization: summary.requires_user_authorization_count > 0
    },
    reviews,
    warnings: [
      "L4 verdicts are no-context reviewer signals, not execution authority.",
      "This command does not execute work orders or write persistent memory.",
      "Review entries are designed to append to the existing l4-review.jsonl ledger."
    ]
  };
}

export function renderL4WorkOrderReviewMarkdown(result) {
  const lines = [
    "# L4 Work Order Review",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- provider: ${result.provider}`,
    `- model: ${result.model ?? "unknown"}`,
    `- sample_count: ${result.summary.sample_count}`,
    `- verdict_counts: ${JSON.stringify(result.summary.verdict_counts)}`,
    `- avg_execution_readiness_score: ${result.summary.avg_execution_readiness_score}`,
    `- no_context_executable_count: ${result.summary.no_context_executable_count}`,
    `- requires_user_authorization_count: ${result.summary.requires_user_authorization_count}`,
    `- provider_error_count: ${result.summary.provider_error_count}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    `- handoff_target_counts: ${JSON.stringify(result.summary.handoff_target_counts)}`,
    `- execution_risk_counts: ${JSON.stringify(result.summary.execution_risk_counts)}`,
    "",
    "## Feedback Signals",
    "",
    ...(
      Object.keys(result.summary.feedback_signal_counts).length
        ? Object.entries(result.summary.feedback_signal_counts).map(([signal, count]) => `- ${signal}: ${count}`)
        : ["- none"]
    ),
    "",
    "## Reviews",
    ""
  ];

  for (const review of result.reviews) {
    lines.push(
      `- ${review.source_id}: verdict=${review.review.verdict}, score=${review.review.execution_readiness_score}, no_context=${review.review.can_execute_without_parent_context}, pool=${review.l3_pool}, next=${review.review.recommended_next_step}`
    );
    if (review.review.blocking_reasons.length) {
      lines.push(`  blocking=${review.review.blocking_reasons.join(", ")}`);
    }
    if (review.review.requires_user_authorization) {
      lines.push(`  authorization_scopes=${review.review.authorization_scopes.join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function artifactPaths({ repoRoot, outDir, l3Report, l3ReportPath, now }) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const l3Dir = l3ReportPath ? path.dirname(resolvePath(repoRoot, l3ReportPath)) : null;
  const outputRoot = outDir
    ? (path.isAbsolute(outDir) ? outDir : path.join(repoRoot, outDir))
    : (l3Dir ?? path.join(repoRoot, "runs", "l4-work-order-review", stamp));
  const l3LedgerPath = l3Report?.output?.l4_review_path
    ? resolvePath(repoRoot, l3Report.output.l4_review_path)
    : null;
  const l4ReviewPath = outDir
    ? path.join(outputRoot, "l4-review.jsonl")
    : (l3LedgerPath ?? path.join(outputRoot, "l4-review.jsonl"));
  return {
    outputRoot,
    l4ReviewReportJsonPath: path.join(outputRoot, "l4-review-report.json"),
    l4ReviewReportMarkdownPath: path.join(outputRoot, "l4-review-report.md"),
    l4ReviewPath
  };
}

export async function writeL4WorkOrderReviewArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  l3Report,
  l3ReportPath,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const paths = artifactPaths({ repoRoot, outDir, l3Report, l3ReportPath, now });
  await fs.mkdir(paths.outputRoot, { recursive: true });
  await fs.mkdir(path.dirname(paths.l4ReviewPath), { recursive: true });
  const output = {
    output_dir: path.relative(repoRoot, paths.outputRoot).replaceAll("\\", "/"),
    l4_review_report_json_path: path.relative(repoRoot, paths.l4ReviewReportJsonPath).replaceAll("\\", "/"),
    l4_review_report_markdown_path: path.relative(repoRoot, paths.l4ReviewReportMarkdownPath).replaceAll("\\", "/"),
    l4_review_path: path.relative(repoRoot, paths.l4ReviewPath).replaceAll("\\", "/")
  };
  const written = {
    ...result,
    output
  };
  await fs.writeFile(paths.l4ReviewReportJsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.l4ReviewReportMarkdownPath, renderL4WorkOrderReviewMarkdown(written), "utf8");
  if (result.reviews.length) {
    await fs.appendFile(
      paths.l4ReviewPath,
      result.reviews.map((review) => JSON.stringify(review)).join("\n") + "\n",
      "utf8"
    );
  } else {
    await fs.appendFile(paths.l4ReviewPath, "", "utf8");
  }
  return written;
}

export function parseHermesDelegateArgsJson(value) {
  return parseJsonArray(value);
}
