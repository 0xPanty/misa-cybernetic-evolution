import fs from "node:fs/promises";
import path from "node:path";

// Public adapter boundary:
// workflow-specific adapters should only translate their native logs/events into
// a sanitized perception digest. This core contract stays generic and only
// emits observe-only readouts, hints, and no-write drafts.
export const DEFAULT_ONLINE_SHADOW_PERCEPTION_DIGEST = "examples/perception_digest.example.json";

const DEFAULT_NOW = new Date("2026-05-16T04:00:00Z");

const BLOCKED_EFFECTS = Object.freeze([
  "route_change",
  "winner_change",
  "persistent_memory_write",
  "zilliz_write",
  "embedding_creation",
  "raw_external_content_persistence",
  "live_llm_call",
  "external_api_call",
  "work_order_execution",
  "vps_touch",
  "github_push",
  "public_publish"
]);

const ALLOWED_OUTPUTS = Object.freeze([
  "external_trajectory_readout",
  "review_hints",
  "repair_ticket_drafts",
  "work_order_drafts"
]);

const FULL_PERCEPTION_HOLDOUT_FIELDS = Object.freeze([
  "source_project",
  "repo",
  "time",
  "task_family"
]);
const ROUTE_TIEBREAK_ORDER = Object.freeze([
  "policy",
  "damping",
  "case",
  "skill",
  "memory",
  "ignore"
]);

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 100) || "unknown";
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function primaryRoute(routePressure = {}) {
  const entries = Object.entries(routePressure);
  if (!entries.length) return "ignore";
  const rank = (route) => {
    const index = ROUTE_TIEBREAK_ORDER.indexOf(route);
    return index >= 0 ? index : ROUTE_TIEBREAK_ORDER.length;
  };
  return entries.sort(([leftRoute, leftCount], [rightRoute, rightCount]) => (
    rightCount - leftCount
      || rank(leftRoute) - rank(rightRoute)
      || leftRoute.localeCompare(rightRoute)
  ))[0][0];
}

function sourceLevel(source) {
  if ((source.suggested_priority ?? 0) >= 95) return "critical";
  if ((source.suggested_priority ?? 0) >= 80) return "high";
  if ((source.suggested_priority ?? 0) >= 50) return "medium";
  return "low";
}

function severityFor(source) {
  const level = sourceLevel(source);
  if (level === "critical") return "P1";
  if (level === "high") return "P2";
  return "P3";
}

function readoutFamilyFor(source) {
  const signals = new Set(source.observed_signals ?? []);
  const route = primaryRoute(source.route_pressure);
  if (signals.has("public_posting_boundary")
    || signals.has("farcaster_public_memory_risk")
    || signals.has("explicit_user_boundary")
    || route === "policy") {
    return "safety_boundary_pressure";
  }
  if (signals.has("repeated_failure_pattern")
    || signals.has("single_failure")
    || route === "damping") {
    return "damping_or_failure_pressure";
  }
  if (signals.has("research_needed")
    || signals.has("knowledge_gap")
    || route === "case") {
    return "research_or_case_pressure";
  }
  if (route === "skill") return "skill_candidate_pressure";
  if (route === "memory") return "memory_candidate_pressure";
  return "trajectory_signal_pressure";
}

function holdoutFieldsFor(source) {
  const full = source.full_perception_holdout ?? source.holdout_fields ?? {};
  return {
    source_project: full.source_project ?? null,
    repo: full.repo ?? null,
    time: full.time ?? null,
    task_family: full.task_family ?? null,
    status: FULL_PERCEPTION_HOLDOUT_FIELDS.every((field) => full[field])
      ? "available"
      : "planned_required_when_full_perception_is_available"
  };
}

function buildReadoutRecords(sourceRefs) {
  return sourceRefs.map((source) => {
    const route = primaryRoute(source.route_pressure);
    const family = readoutFamilyFor(source);
    return {
      record_id: `online-shadow-${stableSlug(source.source_id)}`,
      source_id: source.source_id,
      source_kind: source.source_kind,
      source_refs: uniqueStrings(source.source_refs),
      signal_fingerprint_id: source.signal_fingerprint_id ?? null,
      observed_signals: uniqueStrings(source.observed_signals),
      route_pressure: source.route_pressure ?? {},
      primary_route_pressure: route,
      suggested_priority: source.suggested_priority ?? 0,
      readout_family: family,
      external_trajectory_readout: {
        admission: "observe_only",
        target: "external_trajectory_readout",
        review_value: sourceLevel(source),
        explanation: `${source.source_id} may inform ${family}, but it cannot change route or winner authority.`,
        authority: "hint_only"
      },
      holdout_fields: holdoutFieldsFor(source),
      authority_closure: authorityClosure()
    };
  });
}

function normalizeHint(hint, fallbackKind) {
  return {
    hint_id: hint.hint_id ?? `${stableSlug(hint.source_id)}-${fallbackKind}`,
    source_id: hint.source_id,
    kind: hint.kind ?? fallbackKind,
    level: hint.level ?? "medium",
    reason: hint.reason ?? hint.expected_value ?? "Review this signal before using it in external trajectory calibration.",
    evidence_refs: uniqueStrings(hint.source_refs ?? hint.evidence_refs),
    target_surface: "external_trajectory_readout",
    authority: "hint_only",
    no_write: true
  };
}

function buildReviewHints(digest) {
  return [
    ...(digest.risk_hints ?? []).map((hint) => normalizeHint(hint, "risk")),
    ...(digest.novelty_hints ?? []).map((hint) => normalizeHint(hint, "novelty")),
    ...(digest.expected_review_value_hints ?? []).map((hint) => normalizeHint(hint, "expected_review_value")),
    ...(digest.trace_continuity_hints ?? []).map((hint) => normalizeHint(hint, "trace_continuity"))
  ];
}

function highValueSources(sourceRefs) {
  return sourceRefs.filter((source) => (
    (source.suggested_priority ?? 0) >= 80
    || ["policy", "damping"].includes(primaryRoute(source.route_pressure))
  ));
}

function buildRepairTicketDrafts(sourceRefs) {
  return highValueSources(sourceRefs).map((source) => {
    const route = primaryRoute(source.route_pressure);
    return {
      ticket_id: `external-trajectory-ticket-${stableSlug(source.source_id)}`,
      title: `Review ${readoutFamilyFor(source)} from ${source.source_kind}`,
      severity: severityFor(source),
      status: "draft_no_write",
      source_id: source.source_id,
      source_kind: source.source_kind,
      evidence_refs: uniqueStrings(source.source_refs),
      route_hint: route,
      problem_statement: "A real signal should be reviewed as external trajectory evidence without changing live routing, winner selection, or memory.",
      suggested_next_review: "Compare the signal against shadow-only readout and decide whether it belongs in future sanitized holdout data.",
      acceptance_hint: "Reviewer can explain the signal, trace evidence refs, and keep all production authority disabled.",
      authority: "suggestion_only",
      execution_policy: suggestionExecutionPolicy()
    };
  });
}

function buildWorkOrderDrafts(sourceRefs) {
  return highValueSources(sourceRefs).map((source) => ({
    work_order_id: `external-trajectory-work-order-${stableSlug(source.source_id)}`,
    title: `Explain external trajectory signal ${source.source_id}`,
    category: "external_trajectory_review",
    status: "draft_no_write",
    suggested_executor: "primary_agent_review",
    source_id: source.source_id,
    evidence_refs: uniqueStrings(source.source_refs),
    route_hint: primaryRoute(source.route_pressure),
    review_tasks: [
      "summarize the observed signal in sanitized form",
      "state whether it is safety, outcome, noise, or holdout evidence",
      "recommend only future local shadow calibration or manual review"
    ],
    non_goals: [
      "do not execute the work order",
      "do not change route or winner authority",
      "do not write memory, Zilliz, embeddings, or raw external content"
    ],
    authority: "suggestion_only",
    execution_policy: suggestionExecutionPolicy()
  }));
}

function suggestionExecutionPolicy() {
  return {
    auto_execute_allowed: false,
    durable_or_public_effect_allowed: false,
    route_change_allowed: false,
    winner_change_allowed: false,
    persistent_memory_write_allowed: false,
    zilliz_write_allowed: false,
    embedding_creation_allowed: false,
    llm_call_allowed: false,
    external_api_call_allowed: false,
    human_review_required: true
  };
}

function authorityClosure() {
  return {
    route_authority_changed: false,
    winner_authority_changed: false,
    production_authority: false,
    persistent_memory_written: false,
    zilliz_written: false,
    embedding_created: false,
    raw_external_content_persisted: false,
    llm_api_calls: 0,
    external_api_calls: 0,
    vps_touched: false,
    github_pushed: false
  };
}

function buildContract() {
  return {
    contract_id: "external-trajectory-online-observe-only-shadow-v1",
    lane: "external_trajectory",
    stage: "online_observe_only_shadow",
    input_policy: {
      accepted_inputs: [
        "misa.perception_digest.v1",
        "sanitized_signal_refs",
        "runtime_observation_refs"
      ],
      raw_content_policy: "source_refs_and_sanitized_summaries_only",
      full_perception_required_before_online_validation: true,
      raw_external_content_persisted: false
    },
    readout_policy: {
      allowed_outputs: [...ALLOWED_OUTPUTS],
      external_trajectory_readout_allowed: true,
      can_explain_signals: true,
      can_generate_review_hints: true,
      can_generate_repair_ticket_drafts: true,
      can_generate_work_order_drafts: true,
      can_change_route: false,
      can_change_winner: false,
      can_promote_candidates: false
    },
    suggestion_contract: {
      role: "no_write_review_hint_and_ticket_contract",
      allowed_output_types: [
        "review_hints",
        "repair_ticket_drafts",
        "work_order_drafts"
      ],
      output_authority: "suggestion_only",
      execution_policy: suggestionExecutionPolicy(),
      blocked_effects: [...BLOCKED_EFFECTS]
    },
    full_perception_holdout_fields: FULL_PERCEPTION_HOLDOUT_FIELDS.map((field) => ({
      field,
      status: "required_when_full_perception_available",
      reason: "Fresh online observe-only validation needs stronger independence than the current sanitized batch."
    })),
    authority_closure: authorityClosure()
  };
}

function buildSummary({
  sourceRefs,
  readoutRecords,
  reviewHints,
  repairTicketDrafts,
  workOrderDrafts
}) {
  return {
    source_count: sourceRefs.length,
    readout_record_count: readoutRecords.length,
    review_hint_count: reviewHints.length,
    repair_ticket_draft_count: repairTicketDrafts.length,
    work_order_draft_count: workOrderDrafts.length,
    high_review_value_count: highValueSources(sourceRefs).length,
    allowed_output_count: ALLOWED_OUTPUTS.length,
    blocked_effect_count: BLOCKED_EFFECTS.length,
    route_authority_count: 0,
    winner_authority_count: 0,
    production_authority_count: 0,
    memory_write_count: 0,
    zilliz_write_count: 0,
    embedding_count: 0,
    raw_external_content_persisted_count: 0,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function buildSafety() {
  return {
    shadow_only: true,
    observe_only: true,
    production_authority: false,
    route_authority: false,
    winner_authority: false,
    executes_work_orders: false,
    writes_persistent_memory: false,
    writes_zilliz: false,
    creates_embeddings: false,
    persists_raw_external_data: false,
    installs_skills: false,
    publication_allowed: false,
    touches_vps: false,
    pushes_to_github: false,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function buildChecks({
  digest,
  contract,
  readoutRecords,
  reviewHints,
  repairTicketDrafts,
  workOrderDrafts,
  safety
}) {
  const allAuthorityOff = Object.entries({
    production_authority: safety.production_authority,
    route_authority: safety.route_authority,
    winner_authority: safety.winner_authority,
    executes_work_orders: safety.executes_work_orders,
    writes_persistent_memory: safety.writes_persistent_memory,
    writes_zilliz: safety.writes_zilliz,
    creates_embeddings: safety.creates_embeddings,
    persists_raw_external_data: safety.persists_raw_external_data,
    installs_skills: safety.installs_skills,
    publication_allowed: safety.publication_allowed,
    touches_vps: safety.touches_vps,
    pushes_to_github: safety.pushes_to_github
  }).every(([, value]) => value === false);

  const suggestionOutputsNoWrite = reviewHints.every((hint) => hint.no_write === true && hint.authority === "hint_only")
    && repairTicketDrafts.every((ticket) => ticket.status === "draft_no_write"
      && ticket.execution_policy.auto_execute_allowed === false
      && ticket.execution_policy.route_change_allowed === false
      && ticket.execution_policy.winner_change_allowed === false)
    && workOrderDrafts.every((order) => order.status === "draft_no_write"
      && order.execution_policy.auto_execute_allowed === false
      && order.execution_policy.persistent_memory_write_allowed === false);

  return [
    {
      name: "input is sanitized perception or signal-reference evidence",
      ok: digest.shadow_only === true
        && readoutRecords.every((record) => record.external_trajectory_readout.admission === "observe_only")
        && readoutRecords.every((record) => record.source_refs.length > 0),
      source_count: digest.source_refs?.length ?? 0
    },
    {
      name: "online shadow can feed external trajectory readout only",
      ok: contract.readout_policy.external_trajectory_readout_allowed === true
        && contract.readout_policy.can_change_route === false
        && contract.readout_policy.can_change_winner === false
        && contract.readout_policy.can_promote_candidates === false,
      allowed_outputs: contract.readout_policy.allowed_outputs
    },
    {
      name: "suggestion and ticket outputs are no-write drafts",
      ok: suggestionOutputsNoWrite,
      review_hint_count: reviewHints.length,
      repair_ticket_draft_count: repairTicketDrafts.length,
      work_order_draft_count: workOrderDrafts.length
    },
    {
      name: "route and winner authority stay disconnected",
      ok: allAuthorityOff
        && safety.llm_api_calls === 0
        && safety.external_api_calls === 0,
      safety
    },
    {
      name: "full-perception holdout fields are explicit future gates",
      ok: FULL_PERCEPTION_HOLDOUT_FIELDS.every((field) => (
        contract.full_perception_holdout_fields.some((item) => item.field === field)
      )),
      required_fields: [...FULL_PERCEPTION_HOLDOUT_FIELDS]
    }
  ];
}

function violationsForChecks(checks) {
  return checks
    .filter((check) => !check.ok)
    .map((check) => `failed_${stableSlug(check.name)}`);
}

export function buildExternalTrajectoryOnlineShadowContractReport({
  perceptionDigest,
  perceptionDigestPath = DEFAULT_ONLINE_SHADOW_PERCEPTION_DIGEST,
  now = DEFAULT_NOW
} = {}) {
  if (!perceptionDigest) throw new Error("perceptionDigest is required");

  const sourceRefs = perceptionDigest.source_refs ?? [];
  const contract = buildContract();
  const readoutRecords = buildReadoutRecords(sourceRefs);
  const reviewHints = buildReviewHints(perceptionDigest);
  const repairTicketDrafts = buildRepairTicketDrafts(sourceRefs);
  const workOrderDrafts = buildWorkOrderDrafts(sourceRefs);
  const safety = buildSafety();
  const summary = buildSummary({
    sourceRefs,
    readoutRecords,
    reviewHints,
    repairTicketDrafts,
    workOrderDrafts
  });
  const checks = buildChecks({
    digest: perceptionDigest,
    contract,
    readoutRecords,
    reviewHints,
    repairTicketDrafts,
    workOrderDrafts,
    safety
  });
  const violations = violationsForChecks(checks);

  return {
    schema_version: "misa.external_trajectory_online_shadow_contract.v1",
    mode: "external-trajectory-online-observe-shadow-contract",
    ok: violations.length === 0,
    created_at: asIsoDate(now),
    input: {
      perception_digest_path: perceptionDigestPath,
      perception_digest_schema_version: perceptionDigest.schema_version ?? null,
      perception_digest_id: perceptionDigest.digest_id ?? null,
      source_count: sourceRefs.length
    },
    contract,
    online_shadow_records: readoutRecords,
    review_hints: reviewHints,
    repair_ticket_drafts: repairTicketDrafts,
    work_order_drafts: workOrderDrafts,
    summary,
    safety,
    checks,
    warnings: [
      "This is an online observe-only shadow contract, not a production runtime attachment.",
      "Review hints, repair tickets, and work orders are drafts only; no route, winner, memory, Zilliz, embedding, provider, VPS, or GitHub authority is granted.",
      "Full-perception online validation still needs source_project, repo, time, and task_family fields before claiming independent holdout strength."
    ],
    violations
  };
}

export async function runExternalTrajectoryOnlineShadowContract({
  repoRoot = process.cwd(),
  perceptionDigestPath = DEFAULT_ONLINE_SHADOW_PERCEPTION_DIGEST,
  perceptionDigest,
  now = DEFAULT_NOW
} = {}) {
  const digestPath = resolvePath(repoRoot, perceptionDigestPath);
  const digest = perceptionDigest ?? await readJson(digestPath);
  return buildExternalTrajectoryOnlineShadowContractReport({
    perceptionDigest: digest,
    perceptionDigestPath,
    now
  });
}

export function renderExternalTrajectoryOnlineShadowContractMarkdown(result) {
  const lines = [
    "# External Trajectory Online Observe-only Shadow Contract",
    "",
    "## Summary",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- perception_digest: ${result.input.perception_digest_path}`,
    `- source_count: ${result.summary.source_count}`,
    `- readout_record_count: ${result.summary.readout_record_count}`,
    `- review_hint_count: ${result.summary.review_hint_count}`,
    `- repair_ticket_draft_count: ${result.summary.repair_ticket_draft_count}`,
    `- work_order_draft_count: ${result.summary.work_order_draft_count}`,
    "",
    "## Contract",
    "",
    `- stage: ${result.contract.stage}`,
    `- allowed_outputs: ${result.contract.readout_policy.allowed_outputs.join(",")}`,
    `- output_authority: ${result.contract.suggestion_contract.output_authority}`,
    `- blocked_effects: ${result.contract.suggestion_contract.blocked_effects.join(",")}`,
    "",
    "## Readout Records",
    ""
  ];

  for (const record of result.online_shadow_records) {
    lines.push(
      `- ${record.record_id}: family=${record.readout_family}, route=${record.primary_route_pressure}, priority=${record.suggested_priority}, authority=${record.external_trajectory_readout.authority}`
    );
  }

  lines.push("", "## Review Hints", "");
  for (const hint of result.review_hints) {
    lines.push(`- ${hint.hint_id}: kind=${hint.kind}, level=${hint.level}, authority=${hint.authority}`);
  }

  lines.push("", "## Draft Tickets And Work Orders", "");
  for (const ticket of result.repair_ticket_drafts) {
    lines.push(`- ticket ${ticket.ticket_id}: severity=${ticket.severity}, status=${ticket.status}, route_hint=${ticket.route_hint}`);
  }
  for (const order of result.work_order_drafts) {
    lines.push(`- work_order ${order.work_order_id}: status=${order.status}, route_hint=${order.route_hint}`);
  }

  lines.push("", "## Full-perception Holdout Fields", "");
  for (const field of result.contract.full_perception_holdout_fields) {
    lines.push(`- ${field.field}: ${field.status}`);
  }

  lines.push(
    "",
    "## Boundary",
    "",
    `- shadow_only: ${result.safety.shadow_only}`,
    `- observe_only: ${result.safety.observe_only}`,
    `- production_authority: ${result.safety.production_authority}`,
    `- route_authority: ${result.safety.route_authority}`,
    `- winner_authority: ${result.safety.winner_authority}`,
    `- executes_work_orders: ${result.safety.executes_work_orders}`,
    `- persistent_memory_written: ${result.safety.writes_persistent_memory}`,
    `- zilliz_written: ${result.safety.writes_zilliz}`,
    `- embedding_created: ${result.safety.creates_embeddings}`,
    `- raw_external_data_persisted: ${result.safety.persists_raw_external_data}`,
    `- llm_api_calls: ${result.safety.llm_api_calls}`,
    `- external_api_calls: ${result.safety.external_api_calls}`,
    `- vps_touched: ${result.safety.touches_vps}`,
    `- github_pushed: ${result.safety.pushes_to_github}`,
    "",
    "## Checks",
    ""
  );

  for (const check of result.checks) {
    lines.push(`- ${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function writeExternalTrajectoryOnlineShadowContractArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  now = DEFAULT_NOW
} = {}) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "external-trajectory-online-shadow", stamp));
  await fs.mkdir(outputRoot, { recursive: true });
  const jsonPath = path.join(outputRoot, "external-trajectory-online-shadow-contract.json");
  const markdownPath = path.join(outputRoot, "external-trajectory-online-shadow-contract.md");
  const written = {
    ...result,
    output: {
      output_dir: path.relative(repoRoot, outputRoot).replaceAll("\\", "/"),
      json_path: path.relative(repoRoot, jsonPath).replaceAll("\\", "/"),
      markdown_path: path.relative(repoRoot, markdownPath).replaceAll("\\", "/")
    }
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderExternalTrajectoryOnlineShadowContractMarkdown(written), "utf8");
  return written;
}
