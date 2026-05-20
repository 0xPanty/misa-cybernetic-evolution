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
const LEVEL_RANK = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});
const L1_DIMENSION_HYPOTHESES = Object.freeze({
  l2_eligible: "reduce low-value L2 calls without dropping high-value signals",
  dedupe_pool: "merge repeated sources into a pool instead of drafting duplicate work orders",
  strategy_axes: "give multi-candidate L2 runs distinct branches instead of wording variants",
  risk_level: "send safety and reliability pressure to the right review mode",
  novelty_repeat: "promote recurrence and new evidence while suppressing already handled repeats",
  evidence_density: "reserve recheck or multi-pool for sources with enough evidence",
  uncertainty_conflict: "trigger recheck when route, risk, or evidence signals disagree"
});

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

function strongestLevel(levels = []) {
  return uniqueStrings(levels)
    .sort((left, right) => (LEVEL_RANK[right] ?? 0) - (LEVEL_RANK[left] ?? 0))[0] ?? "low";
}

function sourceHintLevels(digest, sourceId, kind) {
  return (digest?.[kind] ?? [])
    .filter((hint) => hint.source_id === sourceId)
    .map((hint) => hint.level ?? "medium");
}

function fingerprintFor(source, digest) {
  return (digest.signal_fingerprints ?? []).find((fingerprint) => (
    fingerprint.fingerprint_id === source.signal_fingerprint_id
    || (fingerprint.source_ids ?? []).includes(source.source_id)
  )) ?? null;
}

function duplicateClusterFor(source, digest) {
  return (digest.duplicate_clusters ?? []).find((cluster) => (
    (cluster.source_ids ?? []).includes(source.source_id)
  )) ?? null;
}

function riskLevelFor(source, digest) {
  const signals = new Set(source.observed_signals ?? []);
  const levels = [
    sourceLevel(source),
    ...sourceHintLevels(digest, source.source_id, "risk_hints")
  ];
  if (primaryRoute(source.route_pressure) === "policy") levels.push("high");
  if (signals.has("public_posting_boundary")
    || signals.has("farcaster_public_memory_risk")
    || signals.has("explicit_user_boundary")) {
    levels.push("critical");
  }
  if (signals.has("repeated_failure_pattern")) levels.push("high");
  return strongestLevel(levels);
}

function activeRoutes(routePressure = {}) {
  const rank = (route) => {
    const index = ROUTE_TIEBREAK_ORDER.indexOf(route);
    return index >= 0 ? index : ROUTE_TIEBREAK_ORDER.length;
  };
  return Object.entries(routePressure)
    .filter(([, count]) => Number(count) > 0)
    .map(([route]) => route)
    .sort((left, right) => (
      rank(left) - rank(right)
      || left.localeCompare(right)
    ));
}

function evidenceDensityFor(evidenceRefs = []) {
  if (evidenceRefs.length >= 3) return "high";
  if (evidenceRefs.length >= 2) return "medium";
  if (evidenceRefs.length === 1) return "low";
  return "none";
}

function noveltyStatusFor(fingerprint) {
  if (!fingerprint) return "unknown";
  if (fingerprint.ledger_status === "new_signal") return "new";
  if (fingerprint.ledger_status === "seen_with_new_evidence") return "new_evidence";
  if (fingerprint.ledger_status === "recurring_after_fix") return "recurring_after_fix";
  if (fingerprint.ledger_status === "already_processed") return "already_processed";
  if (fingerprint.ledger_status === "seen_open") return "seen_open";
  return fingerprint.ledger_status ?? "unknown";
}

function dedupeStatusFor({ source, duplicateCluster, fingerprint, canonicalSourceId }) {
  if (fingerprint?.ledger_status === "already_processed" && !(fingerprint.new_evidence_refs ?? []).length) {
    return "suppressed_repeat";
  }
  if (!duplicateCluster) return "unique";
  return source.source_id === canonicalSourceId ? "canonical" : "duplicate";
}

function conflictSignalsFor({ source, route, routes, riskLevel, fingerprint, duplicateCluster }) {
  const signals = new Set(source.observed_signals ?? []);
  const conflicts = [];
  if (routes.length > 1) conflicts.push("multiple_route_pressure");
  if ((signals.has("public_posting_boundary") || signals.has("explicit_user_boundary")) && route !== "policy") {
    conflicts.push("boundary_signal_not_policy_route");
  }
  if (signals.has("repeated_failure_pattern") && !["damping", "case"].includes(route)) {
    conflicts.push("repeated_failure_not_damping_or_case_route");
  }
  if (["high", "critical"].includes(riskLevel) && (source.suggested_priority ?? 0) < 80) {
    conflicts.push("high_risk_low_priority");
  }
  if (duplicateCluster && !fingerprint) conflicts.push("duplicate_pool_without_fingerprint");
  return uniqueStrings(conflicts);
}

function strategyAxesFor({ source, route, riskLevel, evidenceRefs, newEvidenceRefs, duplicateCluster, conflictSignals }) {
  const signals = new Set(source.observed_signals ?? []);
  const axes = [];
  if (route === "policy"
    || signals.has("public_posting_boundary")
    || signals.has("farcaster_public_memory_risk")
    || signals.has("explicit_user_boundary")
    || ["high", "critical"].includes(riskLevel)) {
    axes.push("strict_safety_boundary");
  }
  if (route === "damping"
    || signals.has("repeated_failure_pattern")
    || signals.has("single_failure")
    || signals.has("test_regression")) {
    axes.push("damping_repair");
  }
  if (source.source_kind === "custom_workflow"
    || signals.has("human_review_requested")
    || signals.has("test_regression")) {
    axes.push("workflow_generalization");
  }
  if (route === "case" || signals.has("research_needed") || signals.has("knowledge_gap")) {
    axes.push("research_gap");
  }
  if (evidenceRefs.length >= 2 || newEvidenceRefs.length > 0) axes.push("evidence_trace");
  if (duplicateCluster) axes.push("source_dedupe_pool");
  if (conflictSignals.length > 0) axes.push("counterexample_check");
  return uniqueStrings(axes);
}

function uncertaintyLevelFor({ conflictSignals, evidenceDensity, routes }) {
  if (conflictSignals.length >= 2 || evidenceDensity === "none") return "high";
  if (conflictSignals.length === 1 || routes.length > 1 || evidenceDensity === "low") return "medium";
  return "low";
}

function l2CandidateModeFor({ eligible, dedupeStatus, riskLevel, uncertaintyLevel, strategyAxes, repeatCount }) {
  if (!eligible) return "suppress";
  if (dedupeStatus === "canonical" || strategyAxes.includes("source_dedupe_pool")) return "multi_pool";
  if (["critical"].includes(riskLevel) || uncertaintyLevel === "high" || repeatCount >= 3) return "recheck";
  if (riskLevel === "high" && strategyAxes.length >= 2) return "recheck";
  return "single";
}

function l2EligibilityReasonsFor({ source, route, riskLevel, dedupeStatus, evidenceDensity, newEvidenceRefs, repeatCount }) {
  const reasons = [];
  if ((source.suggested_priority ?? 0) >= 80) reasons.push("priority_ge_80");
  if (["policy", "damping", "case"].includes(route)) reasons.push(`route_${route}`);
  if (["high", "critical"].includes(riskLevel)) reasons.push(`risk_${riskLevel}`);
  if (["medium", "high"].includes(evidenceDensity)) reasons.push(`evidence_${evidenceDensity}`);
  if (newEvidenceRefs.length) reasons.push("new_evidence");
  if (repeatCount > 1) reasons.push("repeat_signal");
  if (dedupeStatus === "canonical") reasons.push("canonical_duplicate_pool");
  return uniqueStrings(reasons);
}

function l1DimensionHits(profile) {
  return {
    l2_eligible: profile.l2_eligible,
    dedupe_pool: profile.dedupe_status !== "unique",
    strategy_axes: profile.strategy_axes.length >= 2,
    risk_level: ["high", "critical"].includes(profile.risk_level),
    novelty_repeat: profile.novelty_status !== "unknown"
      || profile.repeat_count > 1
      || profile.new_evidence_refs.length > 0,
    evidence_density: ["medium", "high"].includes(profile.evidence_density),
    uncertainty_conflict: profile.uncertainty_level !== "low"
      || profile.conflict_signals.length > 0
  };
}

function buildL1SignalProfile(source, digest) {
  const route = primaryRoute(source.route_pressure);
  const routes = activeRoutes(source.route_pressure);
  const fingerprint = fingerprintFor(source, digest);
  const duplicateCluster = duplicateClusterFor(source, digest);
  const canonicalSourceId = duplicateCluster?.source_ids?.[0] ?? source.source_id;
  const evidenceRefs = uniqueStrings(source.source_refs);
  const newEvidenceRefs = uniqueStrings(fingerprint?.new_evidence_refs ?? []);
  const riskLevel = riskLevelFor(source, digest);
  const repeatCount = Number(fingerprint?.seen_count ?? (duplicateCluster?.source_ids?.length ?? 1));
  const dedupeStatus = dedupeStatusFor({ source, duplicateCluster, fingerprint, canonicalSourceId });
  const evidenceDensity = evidenceDensityFor(evidenceRefs);
  const conflictSignals = conflictSignalsFor({
    source,
    route,
    routes,
    riskLevel,
    fingerprint,
    duplicateCluster
  });
  const strategyAxes = strategyAxesFor({
    source,
    route,
    riskLevel,
    evidenceRefs,
    newEvidenceRefs,
    duplicateCluster,
    conflictSignals
  });
  const suppressReasons = [];
  if (dedupeStatus === "duplicate") suppressReasons.push("duplicate_covered_by_canonical_source");
  if (dedupeStatus === "suppressed_repeat") suppressReasons.push("already_processed_without_new_evidence");
  if (evidenceDensity === "none") suppressReasons.push("missing_evidence_refs");

  const eligibilityReasons = l2EligibilityReasonsFor({
    source,
    route,
    riskLevel,
    dedupeStatus,
    evidenceDensity,
    newEvidenceRefs,
    repeatCount
  });
  const eligible = suppressReasons.length === 0 && eligibilityReasons.length > 0;
  const uncertaintyLevel = uncertaintyLevelFor({ conflictSignals, evidenceDensity, routes });
  const mode = l2CandidateModeFor({
    eligible,
    dedupeStatus,
    riskLevel,
    uncertaintyLevel,
    strategyAxes,
    repeatCount
  });
  const profile = {
    schema_version: "misa.l1_signal_profile.v1",
    source_id: source.source_id,
    advice_only: true,
    l2_eligible: eligible,
    l2_candidate_mode: mode,
    l2_candidate_count_hint: mode === "suppress" ? 0 : (mode === "single" ? 1 : 2),
    l2_eligibility_reasons: eligibilityReasons,
    suppress_reasons: uniqueStrings(suppressReasons),
    pool_group_id: duplicateCluster?.cluster_id
      ?? fingerprint?.fingerprint_id
      ?? `source:${stableSlug(source.source_id)}`,
    canonical_source_id: canonicalSourceId,
    dedupe_status: dedupeStatus,
    signal_family: fingerprint?.signal_family ?? readoutFamilyFor(source),
    risk_level: riskLevel,
    route_hint: route,
    priority_score: Number(fingerprint?.priority ?? source.suggested_priority ?? 0),
    novelty_status: noveltyStatusFor(fingerprint),
    repeat_count: repeatCount,
    evidence_refs: evidenceRefs,
    new_evidence_refs: newEvidenceRefs,
    evidence_density: evidenceDensity,
    missing_evidence: evidenceRefs.length === 0,
    strategy_axes: strategyAxes,
    uncertainty_level: uncertaintyLevel,
    conflict_signals: conflictSignals
  };
  return {
    ...profile,
    dimension_hits: l1DimensionHits(profile)
  };
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

function buildReadoutRecords(sourceRefs, digest) {
  return sourceRefs.map((source) => {
    const route = primaryRoute(source.route_pressure);
    const family = readoutFamilyFor(source);
    const l1SignalProfile = buildL1SignalProfile(source, digest);
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
      l1_signal_profile: l1SignalProfile,
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

function l2EligibleRecords(readoutRecords) {
  return readoutRecords.filter((record) => record.l1_signal_profile?.l2_eligible === true);
}

function buildRepairTicketDrafts(readoutRecords) {
  return l2EligibleRecords(readoutRecords).map((record) => {
    return {
      ticket_id: `external-trajectory-ticket-${stableSlug(record.source_id)}`,
      title: `Review ${record.readout_family} from ${record.source_kind}`,
      severity: severityFor(record),
      status: "draft_no_write",
      source_id: record.source_id,
      source_kind: record.source_kind,
      evidence_refs: record.l1_signal_profile.evidence_refs,
      route_hint: record.primary_route_pressure,
      problem_statement: "A real signal should be reviewed as external trajectory evidence without changing live routing, winner selection, or memory.",
      suggested_next_review: "Compare the signal against shadow-only readout and decide whether it belongs in future sanitized holdout data.",
      acceptance_hint: "Reviewer can explain the signal, trace evidence refs, and keep all production authority disabled.",
      authority: "suggestion_only",
      execution_policy: suggestionExecutionPolicy()
    };
  });
}

function buildWorkOrderDrafts(readoutRecords) {
  return l2EligibleRecords(readoutRecords).map((record) => ({
    work_order_id: `external-trajectory-work-order-${stableSlug(record.source_id)}`,
    title: `Explain external trajectory signal ${record.source_id}`,
    category: "external_trajectory_review",
    status: "draft_no_write",
    suggested_executor: "primary_agent_review",
    source_id: record.source_id,
    evidence_refs: record.l1_signal_profile.evidence_refs,
    route_hint: record.primary_route_pressure,
    l1_candidate_mode: record.l1_signal_profile.l2_candidate_mode,
    l1_candidate_count_hint: record.l1_signal_profile.l2_candidate_count_hint,
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

function averagePriority(records) {
  if (!records.length) return 0;
  return Math.round(1000 * records.reduce((sum, record) => (
    sum + Number(record.l1_signal_profile?.priority_score ?? record.suggested_priority ?? 0)
  ), 0) / records.length) / 1000;
}

function dimensionVerdict({ dimension, records, hitRecords }) {
  if (!hitRecords.length) return "no_current_hit";
  const eligible = hitRecords.filter((record) => record.l1_signal_profile.l2_eligible).length;
  const advancedMode = hitRecords.filter((record) => (
    ["recheck", "multi_pool"].includes(record.l1_signal_profile.l2_candidate_mode)
  )).length;
  const suppressed = hitRecords.filter((record) => record.l1_signal_profile.l2_candidate_mode === "suppress").length;
  if (dimension === "dedupe_pool" && suppressed > 0) return "useful_for_duplicate_suppression";
  if (advancedMode > 0) return "useful_for_recheck_or_multi_pool";
  if (eligible > 0) return "useful_for_l2_selection";
  if (hitRecords.length === records.length) return "too_broad_watch";
  return "watch_with_more_samples";
}

function buildL1SignalProfileQuantification(readoutRecords) {
  const dimensions = Object.entries(L1_DIMENSION_HYPOTHESES).map(([dimension, hypothesis]) => {
    const hitRecords = readoutRecords.filter((record) => (
      record.l1_signal_profile?.dimension_hits?.[dimension] === true
    ));
    return {
      dimension,
      hypothesis,
      hit_count: hitRecords.length,
      hit_rate: readoutRecords.length ? Math.round(1000 * hitRecords.length / readoutRecords.length) / 1000 : 0,
      eligible_count: hitRecords.filter((record) => record.l1_signal_profile.l2_eligible).length,
      suppressed_count: hitRecords.filter((record) => record.l1_signal_profile.l2_candidate_mode === "suppress").length,
      single_count: hitRecords.filter((record) => record.l1_signal_profile.l2_candidate_mode === "single").length,
      recheck_count: hitRecords.filter((record) => record.l1_signal_profile.l2_candidate_mode === "recheck").length,
      multi_pool_count: hitRecords.filter((record) => record.l1_signal_profile.l2_candidate_mode === "multi_pool").length,
      avg_priority_score: averagePriority(hitRecords),
      verdict: dimensionVerdict({ dimension, records: readoutRecords, hitRecords })
    };
  });

  return {
    schema_version: "misa.l1_signal_profile_quantification.v1",
    advice_only: true,
    total_records: readoutRecords.length,
    l2_eligible_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_eligible).length,
    suppressed_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_candidate_mode === "suppress").length,
    single_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_candidate_mode === "single").length,
    recheck_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_candidate_mode === "recheck").length,
    multi_pool_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_candidate_mode === "multi_pool").length,
    dimensions
  };
}

function buildSummary({
  sourceRefs,
  readoutRecords,
  reviewHints,
  repairTicketDrafts,
  workOrderDrafts,
  l1SignalProfileQuantification
}) {
  return {
    source_count: sourceRefs.length,
    readout_record_count: readoutRecords.length,
    review_hint_count: reviewHints.length,
    repair_ticket_draft_count: repairTicketDrafts.length,
    work_order_draft_count: workOrderDrafts.length,
    high_review_value_count: l2EligibleRecords(readoutRecords).length,
    l1_l2_eligible_count: l1SignalProfileQuantification.l2_eligible_count,
    l1_single_count: l1SignalProfileQuantification.single_count,
    l1_recheck_recommended_count: l1SignalProfileQuantification.recheck_count,
    l1_multi_pool_recommended_count: l1SignalProfileQuantification.multi_pool_count,
    l1_suppressed_count: l1SignalProfileQuantification.suppressed_count,
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
      name: "L1 signal profiles stay advice-only and gate L2 drafts",
      ok: readoutRecords.every((record) => record.l1_signal_profile?.advice_only === true)
        && repairTicketDrafts.every((ticket) => (
          readoutRecords.find((record) => record.source_id === ticket.source_id)?.l1_signal_profile?.l2_eligible === true
        ))
        && workOrderDrafts.every((order) => (
          readoutRecords.find((record) => record.source_id === order.source_id)?.l1_signal_profile?.l2_eligible === true
        )),
      eligible_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_eligible).length,
      suppressed_count: readoutRecords.filter((record) => record.l1_signal_profile?.l2_candidate_mode === "suppress").length
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
  const readoutRecords = buildReadoutRecords(sourceRefs, perceptionDigest);
  const reviewHints = buildReviewHints(perceptionDigest);
  const repairTicketDrafts = buildRepairTicketDrafts(readoutRecords);
  const workOrderDrafts = buildWorkOrderDrafts(readoutRecords);
  const l1SignalProfileQuantification = buildL1SignalProfileQuantification(readoutRecords);
  const safety = buildSafety();
  const summary = buildSummary({
    sourceRefs,
    readoutRecords,
    reviewHints,
    repairTicketDrafts,
    workOrderDrafts,
    l1SignalProfileQuantification
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
    l1_signal_profile_quantification: l1SignalProfileQuantification,
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
    `- l1_l2_eligible_count: ${result.summary.l1_l2_eligible_count}`,
    `- l1_single/recheck/multi_pool/suppressed: ${result.summary.l1_single_count}/${result.summary.l1_recheck_recommended_count}/${result.summary.l1_multi_pool_recommended_count}/${result.summary.l1_suppressed_count}`,
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
      `- ${record.record_id}: family=${record.readout_family}, route=${record.primary_route_pressure}, priority=${record.suggested_priority}, l1_mode=${record.l1_signal_profile.l2_candidate_mode}, l1_axes=${record.l1_signal_profile.strategy_axes.join(",") || "none"}, authority=${record.external_trajectory_readout.authority}`
    );
  }

  lines.push("", "## L1 Signal Profile Quantification", "");
  lines.push(
    `- total_records: ${result.l1_signal_profile_quantification.total_records}`,
    `- l2_eligible_count: ${result.l1_signal_profile_quantification.l2_eligible_count}`,
    `- suppressed_count: ${result.l1_signal_profile_quantification.suppressed_count}`
  );
  for (const item of result.l1_signal_profile_quantification.dimensions) {
    lines.push(`- ${item.dimension}: hits=${item.hit_count}, eligible=${item.eligible_count}, single=${item.single_count}, recheck=${item.recheck_count}, multi_pool=${item.multi_pool_count}, suppressed=${item.suppressed_count}, avg_priority=${item.avg_priority_score}, verdict=${item.verdict}`);
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
