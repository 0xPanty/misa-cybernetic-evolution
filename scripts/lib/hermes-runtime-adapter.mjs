import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_HERMES_RUNTIME_EVENTS = "test/fixtures/hermes-runtime-adapter/hermes-self-improvement-events.json";
export const DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG = "~/.hermes/qianxuesen-runtime-events.ndjson";

const REQUIRED_HERMES_HOOKS = [
  "pre_tool_call",
  "post_tool_call",
  "pre_api_request",
  "post_api_request",
  "pre_llm_call",
  "post_llm_call",
  "on_session_end"
];

const ROUTE_VOCAB = ["memory", "skill", "case", "policy", "damping", "ignore"];
const FEEDBACK_SOURCE_VOCAB = ["user_explicit", "system_event", "trace_inferred"];
const USER_FEEDBACK_SIGNAL_VOCAB = ["correction", "accepted", "rejected"];
const EVIDENCE_QUALITY_VOCAB = ["sufficient", "insufficient_evidence", "gaming_suspected"];
const SIGNAL_ORIGIN_VOCAB = [
  "runtime_operation_log",
  "hermes_official_self_evolution",
  "qianxuesen_replay_synthesis"
];
const INTERPRETATION_VOCAB = [
  "adapter_inferred_evolution_pressure",
  "official_evolution_candidate",
  "replay_synthesized_evidence"
];
const CONFIDENCE_VOCAB = ["high", "medium", "low"];
const ANOMALY_RULE_VERSION = "hermes-boundary-anomaly-rules.v1";
const ANOMALY_RULE_REGISTRY = Object.freeze([
  {
    rule_id: "skill_manage_create_burst",
    version: ANOMALY_RULE_VERSION,
    registered_at: "2026-05-24T00:00:00Z",
    rule_definition: "runtime_operation_log skill_manage create cluster count >= 5",
    deterministic_reducer: true
  },
  {
    rule_id: "persistent_skill_mutation_pressure",
    version: ANOMALY_RULE_VERSION,
    registered_at: "2026-05-24T00:00:00Z",
    rule_definition: "runtime_operation_log skill_manage write cluster count >= 5",
    deterministic_reducer: true
  },
  {
    rule_id: "write_file_sensitive_path",
    version: ANOMALY_RULE_VERSION,
    registered_at: "2026-05-24T00:00:00Z",
    rule_definition: "runtime_operation_log skill_manage write_file event references sensitive path terms",
    deterministic_reducer: true
  },
  {
    rule_id: "repeated_failure_then_skill_create",
    version: ANOMALY_RULE_VERSION,
    registered_at: "2026-05-24T00:00:00Z",
    rule_definition: "skill create follows a failure-marked runtime event in the same capture",
    deterministic_reducer: true
  },
  {
    rule_id: "post_tool_call_failure_after_skill_manage",
    version: ANOMALY_RULE_VERSION,
    registered_at: "2026-05-24T00:00:00Z",
    rule_definition: "post_tool_call skill_manage event has failure or damping pressure",
    deterministic_reducer: true
  },
  {
    rule_id: "memory_write_boundary_pressure",
    version: ANOMALY_RULE_VERSION,
    registered_at: "2026-05-24T00:00:00Z",
    rule_definition: "runtime_operation_log memory write touches durable memory boundary",
    deterministic_reducer: true
  }
]);
const SIGNAL_TO_NOISE_METRIC_ID = "sidecar_signal_to_noise_ratio";
const SIGNAL_TO_NOISE_TARGET_BAND = { min: 0.05, max: 0.2 };
const OBSERVABILITY_RETENTION_POLICY = Object.freeze({
  raw_events_window: "30d",
  aggregated_stats_window: "1y",
  compaction_on_overflow: true,
  enforcement_mode: "declared_only_no_deletion"
});

const QIANXUESEN_FROZEN_BASELINES = new Set([
  "baseline-farcaster-reply-2026-05-14",
  "baseline-public-boundary-2026-05-14",
  "baseline-recovery-smoke-2026-05-14"
]);

const QIANXUESEN_FROZEN_HOLDOUT_SPLITS = new Set([
  "holdout-farcaster-public-reply-v1",
  "holdout-public-private-boundary-v1",
  "holdout-recovery-anchor-v1"
]);

const QIANXUESEN_REGISTERED_EVAL_DATASETS = new Set([
  "dataset-farcaster-public-reply-v1",
  "dataset-public-private-boundary-v1",
  "dataset-recovery-anchor-v1"
]);

const HUMAN_REVIEW_DECISIONS = new Set([
  "approve-for-human-review",
  "approve_for_human_review",
  "policy_candidate_pending_human_review"
]);

const SKILL_WRITE_ACTIONS = new Set([
  "create",
  "patch",
  "edit",
  "delete",
  "write_file",
  "remove_file"
]);

const MEMORY_WRITE_ACTIONS = new Set([
  "add",
  "replace",
  "remove",
  "delete",
  "write"
]);

const EXTERNAL_INFORMATION_TOOLS = new Set([
  "session_search",
  "web_search",
  "web_extract",
  "search",
  "browser_search"
]);
const QUERY_ENTROPY_TOOLS = new Set([
  "session_search",
  "web_search",
  "search",
  "browser_search"
]);
const ACTION_HISTORY_MONITOR_RECORD_KIND = "action_history_monitor";
const MODEL_IO_TAP_RECORD_KIND = "model_io_tap";
const MEASUREMENT_QUALITY_GATE_RECORD_KIND = "measurement_quality_gate";
const MEASUREMENT_GATE_BIAS_MONITOR_RECORD_KIND = "measurement_gate_bias_monitor";
const MODEL_IO_TAP_REDACTION_STATUSES = ["at_tap_point", "at_importer_point"];
const MODEL_IO_TAP_PHASES = ["pre_api_request", "post_api_request", "imported_request"];
const MEASUREMENT_GATE_RULE_VERSION = "hermes-measurement-gate-rules.v1";
const MEASUREMENT_GATE_RULE_REGISTRY = Object.freeze([
  {
    rule_id: "context_byte_size_high",
    version: MEASUREMENT_GATE_RULE_VERSION,
    category: "input_contamination",
    rule_definition: "model_io_tap max(context_byte_size) >= 50000",
    deterministic_reducer: true
  },
  {
    rule_id: "tool_schema_count_high",
    version: MEASUREMENT_GATE_RULE_VERSION,
    category: "input_contamination",
    rule_definition: "model_io_tap max(tool_schema_count) >= 40",
    deterministic_reducer: true
  },
  {
    rule_id: "tool_result_error_accumulation",
    version: MEASUREMENT_GATE_RULE_VERSION,
    category: "input_contamination",
    rule_definition: "model_io_tap max(tool_result_error_count) >= 3",
    deterministic_reducer: true
  },
  {
    rule_id: "failure_after_repeat_rate_high",
    version: MEASUREMENT_GATE_RULE_VERSION,
    category: "behavior_loop",
    rule_definition: "action_history_monitor failure_after_repeat_rate value >= 0.5 with denominator >= 1",
    deterministic_reducer: true
  },
  {
    rule_id: "query_entropy_collapsed",
    version: MEASUREMENT_GATE_RULE_VERSION,
    category: "behavior_loop",
    rule_definition: "action_history_monitor query_entropy status is collapsed or low_entropy with query_count >= 3",
    deterministic_reducer: true
  },
  {
    rule_id: "measurement_evidence_sparse",
    version: MEASUREMENT_GATE_RULE_VERSION,
    category: "insufficient_evidence",
    rule_definition: "no model_io_tap records and action_history_monitor has no failed action sample plus insufficient query entropy sample",
    deterministic_reducer: true
  }
]);

const RESEARCH_SIGNALS = new Set([
  "external_framework_change",
  "competitor_change",
  "knowledge_gap",
  "research_needed",
  "user_correction",
  "repeated_terminology"
]);

const PUBLIC_BOUNDARY_SIGNALS = new Set([
  "farcaster_public_memory_risk",
  "public_posting_boundary",
  "explicit_user_boundary",
  "public_posting_boundary"
]);

const KNOWN_TERMS = [
  "Farcaster",
  "Hermes",
  "Qianxuesen",
  "Curiosity Engine",
  "GEPA",
  "LangGraph",
  "skill_manage",
  "session_search",
  "memory",
  "curator"
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function stableSlug(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90) || "unknown";
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function maxNumber(values, fallback = 0) {
  const numbers = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return numbers.length ? Math.max(...numbers) : fallback;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function nonNegativeIntegerOrZero(value) {
  return nonNegativeIntegerOrNull(value) ?? 0;
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function hashOrNull(value) {
  const text = stringOrNull(value);
  return text && /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function riskOrUnknown(value) {
  const risk = String(value ?? "unknown").trim().toLowerCase();
  return ["low", "medium", "high"].includes(risk) ? risk : "unknown";
}

function enumOrDefault(value, allowed, fallback) {
  const text = stringOrNull(value);
  return text && allowed.includes(text) ? text : fallback;
}

function registeredOrMissing(id, registry, missingReason, untrustedReason, reasons) {
  if (!id) {
    reasons.push(missingReason);
    return false;
  }
  if (!registry.has(id)) {
    reasons.push(untrustedReason);
    return false;
  }
  return true;
}

function explicitSignalOriginFor(event) {
  const raw = event.evolution_evidence ?? event.context?.evolution_evidence;
  return enumOrDefault(
    raw?.signal_origin ?? event.context?.signal_origin,
    SIGNAL_ORIGIN_VOCAB,
    null
  );
}

function hasEvolutionEvidencePayload(event) {
  const raw = event.evolution_evidence ?? event.context?.evolution_evidence;
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw));
}

function signalOriginFor(event) {
  const explicit = explicitSignalOriginFor(event);
  if (explicit) return explicit;
  return "runtime_operation_log";
}

function interpretationForOrigin(origin) {
  return {
    runtime_operation_log: "adapter_inferred_evolution_pressure",
    hermes_official_self_evolution: "official_evolution_candidate",
    qianxuesen_replay_synthesis: "replay_synthesized_evidence"
  }[origin] ?? "adapter_inferred_evolution_pressure";
}

function confidenceRuleFor(event, origin) {
  if (origin !== "runtime_operation_log") {
    return {
      confidence: "high",
      confidence_rule_id: "non_runtime_evidence_is_explicit"
    };
  }

  const hook = String(event.hook ?? "");
  const toolName = toolNameFor(event);
  const action = String(actionFor(event) ?? "");
  if (hook === "post_tool_call" && toolName === "skill_manage" && ["create", "write_file"].includes(action)) {
    return {
      confidence: "high",
      confidence_rule_id: `post_tool_call_skill_manage_${action}`
    };
  }
  if (hook === "post_tool_call" && toolName === "memory" && MEMORY_WRITE_ACTIONS.has(action)) {
    return {
      confidence: "high",
      confidence_rule_id: "post_tool_call_memory_write"
    };
  }
  if (hook === "pre_tool_call" && toolName === "skill_manage") {
    return {
      confidence: "medium",
      confidence_rule_id: "pre_tool_call_skill_manage"
    };
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) {
    return {
      confidence: "low",
      confidence_rule_id: "external_information_lookup"
    };
  }
  if (event.context?.curator_action) {
    return {
      confidence: "medium",
      confidence_rule_id: "curator_lifecycle_signal"
    };
  }
  if (toolName === "memory" && MEMORY_WRITE_ACTIONS.has(action)) {
    return {
      confidence: "medium",
      confidence_rule_id: "pre_tool_call_memory_write"
    };
  }
  return {
    confidence: "low",
    confidence_rule_id: "runtime_log_default_low"
  };
}

function hermesArtifactHash(value, label) {
  const text = stringOrNull(value);
  return text ? stableHash({ label, text }) : null;
}

function sourceWindowFor(events, sampleCount) {
  const timestamps = events
    .map((event) => event.timestamp)
    .map((value) => value ? new Date(value) : null)
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .map((date) => date.toISOString())
    .sort((left, right) => left.localeCompare(right));
  if (timestamps.length > 0) {
    return {
      kind: "time",
      value: `${timestamps[0]}/${timestamps[timestamps.length - 1]}`
    };
  }
  return {
    kind: "count",
    value: `${sampleCount}_events`
  };
}

function evidenceQualityFor({ positiveDirection, registered, metricGamingRisk, llmInferred }) {
  if (metricGamingRisk === "high") return "gaming_suspected";
  if (!positiveDirection || !registered || llmInferred) return "insufficient_evidence";
  return "sufficient";
}

function normalizeEvolutionEvidence(event, sourceEventId) {
  const raw = event.evolution_evidence ?? event.context?.evolution_evidence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const beforeScore = numberOrNull(raw.before_score ?? raw.baseline_score ?? raw.before?.score);
  const afterScore = numberOrNull(raw.after_score ?? raw.candidate_score ?? raw.after?.score);
  const explicitDelta = numberOrNull(raw.delta ?? raw.score_delta);
  const delta = beforeScore !== null && afterScore !== null
    ? round3(afterScore - beforeScore)
    : explicitDelta !== null
      ? round3(explicitDelta)
      : null;
  const sampleCount = Math.max(0, Math.trunc(numberOrNull(
    raw.sample_count ?? raw.holdout_sample_count ?? raw.samples
  ) ?? 0));
  const metricGamingRisk = riskOrUnknown(raw.metric_gaming_risk ?? raw.gaming_risk);
  const baselineSnapshotId = stringOrNull(raw.baseline_snapshot_id ?? raw.baseline?.snapshot_id);
  const holdoutSplitId = stringOrNull(raw.holdout_split_id ?? raw.holdout?.split_id);
  const evalDatasetRef = stringOrNull(raw.eval_dataset_ref ?? raw.eval_dataset?.dataset_hash ?? raw.eval_dataset?.ref);
  const traceRef = stringOrNull(raw.trace_ref ?? event.trace_ref ?? event.session_id);
  const redactedTraceDigestRef = stringOrNull(
    raw.redacted_trace_digest_ref
      ?? raw.trace_digest_ref
      ?? event.context?.redacted_trace_digest_ref
      ?? event.context?.trace_digest_ref
  );
  const userFeedbackSignal = enumOrDefault(raw.user_feedback_signal ?? raw.feedback_signal, USER_FEEDBACK_SIGNAL_VOCAB, null);
  const feedbackSource = enumOrDefault(raw.feedback_source, FEEDBACK_SOURCE_VOCAB, "system_event");
  const llmInferred = raw.llm_inferred === true;
  const hasExplicitSignalOrigin = Boolean(explicitSignalOriginFor(event));
  const positiveDirection = delta !== null && delta > 0;
  const reasonCodes = [];
  const baselineRegistered = registeredOrMissing(
    baselineSnapshotId,
    QIANXUESEN_FROZEN_BASELINES,
    "missing_baseline_snapshot",
    "untrusted_baseline",
    reasonCodes
  );
  const holdoutRegistered = registeredOrMissing(
    holdoutSplitId,
    QIANXUESEN_FROZEN_HOLDOUT_SPLITS,
    "missing_holdout",
    "untrusted_holdout",
    reasonCodes
  );
  const evalDatasetRegistered = registeredOrMissing(
    evalDatasetRef,
    QIANXUESEN_REGISTERED_EVAL_DATASETS,
    "missing_eval_dataset_ref",
    "unregistered_eval_dataset",
    reasonCodes
  );
  if (sampleCount <= 0) reasonCodes.push("missing_sample_count");
  if (!positiveDirection) reasonCodes.push("non_positive_delta");
  if (metricGamingRisk === "high") reasonCodes.push("metric_gaming_risk_high");
  if (llmInferred) reasonCodes.push("llm_inferred_feedback_blocked");
  if (!hasExplicitSignalOrigin) reasonCodes.push("evolution_evidence_without_explicit_signal_origin");

  const registered = baselineRegistered && holdoutRegistered && evalDatasetRegistered && sampleCount > 0 && hasExplicitSignalOrigin;
  const holdoutBacked = Boolean(holdoutRegistered && sampleCount > 0);
  const evidenceQuality = evidenceQualityFor({
    positiveDirection,
    registered,
    metricGamingRisk,
    llmInferred
  });
  const advisoryOnly = evidenceQuality !== "sufficient";

  return {
    evidence_id: stringOrNull(raw.evidence_id) ?? `hermes-evolution-evidence-${stableSlug(sourceEventId)}`,
    metric: stringOrNull(raw.metric ?? raw.metric_id) ?? "unspecified",
    baseline_snapshot_id: baselineSnapshotId,
    holdout_split_id: holdoutSplitId,
    eval_dataset_ref: evalDatasetRef,
    baseline_registered: baselineRegistered,
    holdout_registered: holdoutRegistered,
    eval_dataset_registered: evalDatasetRegistered,
    before_score: beforeScore,
    after_score: afterScore,
    delta,
    sample_count: sampleCount,
    metric_gaming_risk: metricGamingRisk,
    evidence_quality: evidenceQuality,
    advisory_only: advisoryOnly,
    reason_codes: uniqueStrings(reasonCodes),
    user_feedback_signal: userFeedbackSignal,
    feedback_source: feedbackSource,
    llm_inferred: llmInferred,
    feedback_usable_for_decision: !llmInferred,
    trace_ref: traceRef,
    redacted_trace_digest_ref: redactedTraceDigestRef,
    trace_detail_source: redactedTraceDigestRef ? "hermes_redacted_reducer_digest" : "trace_identity_only",
    redaction_status: "at_tap_point",
    raw_private_content_exported: false,
    hermes_artifact_hash_before: stringOrNull(raw.hermes_artifact_hash_before ?? raw.artifact_hash_before ?? raw.before?.artifact_hash)
      ?? hermesArtifactHash(event.args?.old_string, "hermes_artifact_before"),
    hermes_artifact_hash_after: stringOrNull(raw.hermes_artifact_hash_after ?? raw.artifact_hash_after ?? raw.after?.artifact_hash)
      ?? hermesArtifactHash(event.args?.new_string, "hermes_artifact_after"),
    failure_refs: uniqueStrings([
      ...(raw.failure_refs ?? []),
      ...(raw.before?.failure_refs ?? [])
    ]),
    evidence_refs: uniqueStrings([
      ...(raw.evidence_refs ?? []),
      ...(raw.after?.evidence_refs ?? [])
    ]),
    positive_direction: positiveDirection,
    holdout_backed: holdoutBacked,
    can_support_optimization: evidenceQuality === "sufficient"
  };
}

function hasAny(values = [], expected) {
  return values.some((value) => expected.has(value));
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date("2026-05-15T00:00:00Z").toISOString()
    : date.toISOString();
}

function expandHome(relOrAbs) {
  if (relOrAbs === "~") return os.homedir();
  if (relOrAbs?.startsWith("~/") || relOrAbs?.startsWith("~\\")) {
    return path.join(os.homedir(), relOrAbs.slice(2));
  }
  return relOrAbs;
}

function resolvePath(repoRoot, relOrAbs) {
  const expanded = expandHome(relOrAbs);
  return path.isAbsolute(expanded) ? expanded : path.join(repoRoot, expanded);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function parseNdjson(raw, filePath) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid Hermes runtime NDJSON at ${filePath}:${index}: ${error.message}`);
      }
    });
}

export async function readHermesRuntimeEventLog(filePath) {
  return parseNdjson(await fs.readFile(filePath, "utf8"), filePath);
}

function collectText(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (typeof value === "object") return Object.values(value).flatMap(collectText);
  return [String(value)];
}

function extractKnownTerms(event) {
  const text = collectText(event).join(" ");
  const lower = text.toLowerCase();
  const contextTerms = event.context?.terms ?? [];
  return uniqueStrings([
    ...contextTerms,
    ...KNOWN_TERMS.filter((term) => lower.includes(term.toLowerCase()))
  ]);
}

function toolNameFor(event) {
  return event.tool_name ? String(event.tool_name) : null;
}

function actionFor(event) {
  return event.args?.action
    ?? event.context?.curator_action
    ?? event.action
    ?? null;
}

function hookFamilyFor(runtimeHook) {
  return ["pre_tool_call", "post_tool_call"].includes(runtimeHook)
    ? "tool_call"
    : runtimeHook ?? "unknown";
}

function actionIdentityFingerprintFor(event) {
  const args = event.args ?? {};
  return stableHash({
    tool_name: toolNameFor(event),
    action: actionFor(event),
    target_name: args.name ?? args.skill_name ?? args.target ?? event.context?.skill_name ?? null,
    target_path: args.path ?? args.file_path ?? args.filename ?? null,
    target_fingerprint: args.fingerprint ?? null
  });
}

function eventSignals(event) {
  const toolName = toolNameFor(event);
  const action = actionFor(event);
  const signals = [
    ...(event.observed_signals ?? []),
    ...(event.context?.conversation_signals ?? []),
    ...(event.context?.signals ?? [])
  ];

  if (toolName === "skill_manage") {
    signals.push("hermes_skill_manage", "skill_self_modification");
    if (SKILL_WRITE_ACTIONS.has(String(action))) signals.push("skill_mutation_attempt");
  }
  if (toolName === "memory") {
    signals.push("hermes_memory_tool");
    if (MEMORY_WRITE_ACTIONS.has(String(action))) signals.push("persistent_memory_write");
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) {
    signals.push("external_information_channel", "research_needed");
  }
  if (event.context?.curator_action) {
    signals.push("hermes_curator_lifecycle", "background_skill_review");
  }
  if (event.result?.success === false || event.result?.status === "failed") {
    signals.push("tool_failure", "damping_pressure");
  }

  return uniqueStrings(signals);
}

function runtimeSurfaceFor(event) {
  if (event.context?.curator_action || event.context?.platform === "curator") {
    return "curator_background_review";
  }
  if (String(event.hook || "").includes("tool")) return "tool_call";
  if (String(event.hook || "").includes("llm")) return "llm_call";
  if (String(event.hook || "").includes("session")) return "session_lifecycle";
  return "runtime_event";
}

function qianxuesenEventTypeFor(event, signals) {
  const toolName = toolNameFor(event);
  const action = actionFor(event);
  if (toolName === "skill_manage" && SKILL_WRITE_ACTIONS.has(String(action))) {
    return "skill_mutation_attempt";
  }
  if (toolName === "memory" && MEMORY_WRITE_ACTIONS.has(String(action))) {
    return "memory_write_attempt";
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) {
    return "research_lookup";
  }
  if (signals.includes("background_skill_review")) {
    return "background_evolution_review";
  }
  if (signals.includes("tool_failure")) {
    return "execution_failure_trace";
  }
  return "execution_trace";
}

function routeTargetFor(event, signals) {
  const toolName = toolNameFor(event);
  const requestedDecision = event.context?.decision ?? event.context?.review_decision ?? event.decision;
  if (HUMAN_REVIEW_DECISIONS.has(String(requestedDecision))) return "policy";
  if (signals.includes("damping_pressure")) return "damping";
  if (toolName === "skill_manage" || signals.includes("background_skill_review")) return "skill";
  if (toolName === "memory") {
    return hasAny(signals, PUBLIC_BOUNDARY_SIGNALS) ? "policy" : "memory";
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) return "case";
  if (hasAny(signals, RESEARCH_SIGNALS)) return "case";
  return "ignore";
}

function effectBoundaryFor(event, signals) {
  const toolName = toolNameFor(event);
  const action = actionFor(event);
  return {
    persistent_memory_write_requested: toolName === "memory" && MEMORY_WRITE_ACTIONS.has(String(action)),
    skill_write_requested: toolName === "skill_manage" && SKILL_WRITE_ACTIONS.has(String(action)),
    public_or_durable_effect_requested: Boolean(event.effects?.public_output || event.effects?.durable_effect),
    external_information_channel: (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) || hasAny(signals, RESEARCH_SIGNALS),
    direct_qianxuesen_write_allowed: false
  };
}

function controlDecisionFor(event, routeTarget, effectBoundary, signals) {
  if (effectBoundary.skill_write_requested) {
    return {
      decision: "candidate_pool_replay_required",
      reason: "Hermes can propose or mutate a skill, but Qianxuesen only treats it as a replay-gated candidate.",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false
    };
  }
  if (effectBoundary.persistent_memory_write_requested) {
    return {
      decision: hasAny(signals, PUBLIC_BOUNDARY_SIGNALS)
        ? "policy_candidate_replay_required"
        : "observe_only_memory_review",
      reason: "Memory writes are observed as pressure, not accepted as durable Qianxuesen memory.",
      replay_required: hasAny(signals, PUBLIC_BOUNDARY_SIGNALS),
      tournament_required: hasAny(signals, PUBLIC_BOUNDARY_SIGNALS),
      can_promote_now: false
    };
  }
  if (effectBoundary.external_information_channel) {
    return {
      decision: "research_digest_required",
      reason: "External or cross-session information should become digest evidence before variants are generated.",
      replay_required: false,
      tournament_required: false,
      can_promote_now: false
    };
  }
  if (signals.includes("background_skill_review")) {
    return {
      decision: "candidate_pool_replay_required",
      reason: "Hermes curator output is useful evolution pressure, but it cannot directly rewrite Qianxuesen state.",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false
    };
  }
  if (routeTarget === "damping") {
    return {
      decision: "damping_review_required",
      reason: "Execution failures should be replayed before damping rules or skill changes are promoted.",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false
    };
  }
  return {
    decision: "observe_only",
    reason: "Runtime trace is retained as evidence only.",
    replay_required: false,
    tournament_required: false,
    can_promote_now: false
  };
}

function normalizeHermesEvent(event, index) {
  const signals = eventSignals(event);
  const routeTarget = routeTargetFor(event, signals);
  const effectBoundary = effectBoundaryFor(event, signals);
  const sourceEventId = event.event_id ?? `hermes-event-${index + 1}`;
  const evolutionEvidence = normalizeEvolutionEvidence(event, sourceEventId);
  const signalOrigin = signalOriginFor(event);
  const interpretation = interpretationForOrigin(signalOrigin);
  const confidence = confidenceRuleFor(event, signalOrigin);
  const runtimeHook = event.hook ?? "unknown";
  const actionIdentityFingerprint = actionIdentityFingerprintFor(event);
  const sourcePayloadFingerprint = stableHash({
    hook: event.hook,
    tool_name: event.tool_name,
    action: actionFor(event),
    context: event.context,
    result: event.result
  });

  return {
    normalized_event_id: `hermes-${stableSlug(sourceEventId)}-${sourcePayloadFingerprint.slice(0, 8)}`,
    source_event_id: sourceEventId,
    runtime_hook: runtimeHook,
    hook_family: hookFamilyFor(runtimeHook),
    runtime_surface: runtimeSurfaceFor(event),
    tool_name: toolNameFor(event),
    runtime_action: actionFor(event),
    qianxuesen_event_type: qianxuesenEventTypeFor(event, signals),
    route_target: routeTarget,
    observed_signals: signals,
    observed_terms: extractKnownTerms(event),
    signal_origin: signalOrigin,
    interpretation,
    confidence: confidence.confidence,
    confidence_rule_id: confidence.confidence_rule_id,
    evidence_refs: uniqueStrings([
      sourceEventId,
      ...(event.source_refs ?? []),
      ...(event.context?.evidence_refs ?? [])
    ]),
    action_identity_fingerprint: actionIdentityFingerprint,
    source_payload_fingerprint: sourcePayloadFingerprint,
    ...(evolutionEvidence ? { evolution_evidence: evolutionEvidence } : {}),
    effect_boundary: effectBoundary,
    control_decision: controlDecisionFor(event, routeTarget, effectBoundary, signals)
  };
}

function topicFor(event, normalized) {
  return event.args?.query
    ?? event.context?.topic
    ?? event.args?.name
    ?? event.context?.skill_name
    ?? normalized.observed_terms.slice(0, 2).join(" + ")
    ?? normalized.source_event_id;
}

function buildResearchDigests(normalizedEvents, originalEvents) {
  const originalById = new Map(originalEvents.map((event, index) => [
    event.event_id ?? `hermes-event-${index + 1}`,
    event
  ]));

  return normalizedEvents
    .filter((event) => (
      event.effect_boundary.external_information_channel
      || hasAny(event.observed_signals, RESEARCH_SIGNALS)
    ))
    .map((event) => {
      const original = originalById.get(event.source_event_id) ?? {};
      const topic = topicFor(original, event) || event.source_event_id;
      return {
        digest_id: `research-digest-${stableSlug(event.source_event_id)}`,
        source_event_ids: [event.source_event_id],
        topic,
        channel: event.tool_name ?? event.runtime_surface,
        observed_terms: event.observed_terms,
        knowledge_gap_signals: event.observed_signals.filter((signal) => RESEARCH_SIGNALS.has(signal)),
        summary: "Hold this runtime observation as research evidence before generating skill or policy variants.",
        evolution_pressure: event.control_decision.reason,
        candidate_policy: {
          candidate_pool: "research_digest",
          direct_memory_write: false,
          direct_skill_write: false,
          replay_or_tournament_required_before_promotion: true
        }
      };
    });
}

function proposedChangeFor(event) {
  if (event.tool_name === "skill_manage") {
    return `Replay Hermes skill_manage ${event.runtime_action ?? "change"} as a skill variant instead of applying it directly.`;
  }
  if (event.tool_name === "memory") {
    return "Replay this as a policy or memory-boundary candidate before any durable memory update.";
  }
  if (event.control_decision.decision === "research_digest_required") {
    return "Convert the digest into a bounded research follow-up, then generate variants only for high-value evidence.";
  }
  if (event.route_target === "damping") {
    return "Replay the failure trace before changing damping or cooldown rules.";
  }
  if (event.observed_signals.includes("background_skill_review")) {
    return "Treat Hermes curator lifecycle output as candidate pressure for skill maintenance.";
  }
  return "Keep as evidence for future candidate ranking.";
}

function expectedGainFor(event) {
  if (event.route_target === "skill") return "Improve reusable skill behavior while preserving replay gates.";
  if (event.route_target === "policy") return "Reduce public/private boundary mistakes before durable memory changes.";
  if (event.route_target === "case") return "Ground variants in current external or cross-session evidence.";
  if (event.route_target === "damping") return "Reduce repeated execution failures without overfitting a single trace.";
  return "Improve candidate ranking evidence.";
}

function candidateTypeFor(event) {
  if (event.tool_name === "skill_manage" || event.observed_signals.includes("background_skill_review")) {
    return "skill_variant";
  }
  if (event.tool_name === "memory") return "policy_boundary_variant";
  if (event.control_decision.decision === "research_digest_required") return "research_followup";
  if (event.route_target === "damping") return "damping_rule_candidate";
  return "runtime_trace_candidate";
}

function shouldCreateCandidate(event) {
  return event.control_decision.replay_required
    || event.control_decision.tournament_required
    || event.control_decision.decision === "research_digest_required"
    || event.observed_signals.includes("background_skill_review");
}

function humanReviewFor(event) {
  const requestedDecision = event.context?.decision ?? event.context?.review_decision ?? event.decision;
  if (!HUMAN_REVIEW_DECISIONS.has(String(requestedDecision))) return null;
  return {
    route_target: "policy",
    state: "policy_candidate_pending_human_review",
    consumer: "human_owner"
  };
}

function candidateEvidenceGate(event) {
  if (!event.evolution_evidence) {
    return {
      evidence_quality: "insufficient_evidence",
      advisory_only: true,
      reason_codes: ["missing_evolution_evidence"]
    };
  }
  if (event.signal_origin === "runtime_operation_log") {
    return {
      evidence_quality: "insufficient_evidence",
      advisory_only: true,
      reason_codes: uniqueStrings([
        ...(event.evolution_evidence.reason_codes ?? []),
        "evolution_evidence_without_explicit_signal_origin"
      ])
    };
  }
  return {
    evidence_quality: EVIDENCE_QUALITY_VOCAB.includes(event.evolution_evidence.evidence_quality)
      ? event.evolution_evidence.evidence_quality
      : "insufficient_evidence",
    advisory_only: event.evolution_evidence.advisory_only !== false,
    reason_codes: event.evolution_evidence.reason_codes ?? []
  };
}

function candidateClusterKey(event, candidateType) {
  return stableSlug([
    candidateType,
    event.tool_name ?? "none",
    event.runtime_action ?? "none",
    event.hook_family ?? event.runtime_hook ?? "unknown",
    event.action_identity_fingerprint.slice(0, 12)
  ].join("|"));
}

function anomalyRuleIdsFor({ event, clusterCount, captureHasFailure }) {
  if (event.signal_origin !== "runtime_operation_log") return [];

  const ruleIds = [];
  if (event.effect_boundary.persistent_memory_write_requested) {
    ruleIds.push("memory_write_boundary_pressure");
  }
  if (event.tool_name === "skill_manage" && event.runtime_action === "create" && clusterCount >= 5) {
    ruleIds.push("skill_manage_create_burst");
  }
  if (event.tool_name === "skill_manage" && ["patch", "write_file"].includes(String(event.runtime_action)) && clusterCount >= 5) {
    ruleIds.push("persistent_skill_mutation_pressure");
  }
  if (
    event.tool_name === "skill_manage"
    && event.runtime_action === "write_file"
    && event.observed_terms.some((term) => /secret|credential|private|production/i.test(term))
  ) {
    ruleIds.push("write_file_sensitive_path");
  }
  if (event.tool_name === "skill_manage" && event.runtime_action === "create" && captureHasFailure) {
    ruleIds.push("repeated_failure_then_skill_create");
  }
  if (
    event.runtime_hook === "post_tool_call"
    && event.tool_name === "skill_manage"
    && event.observed_signals.includes("tool_failure")
  ) {
    ruleIds.push("post_tool_call_failure_after_skill_manage");
  }
  return uniqueStrings(ruleIds);
}

function workOrderOutcomeSkeleton(anomalyRuleIds) {
  return {
    outcome: "pending",
    dismissed_reason_code: null,
    fire_count: anomalyRuleIds.length,
    dismissal_rate: null,
    human_action_rate: null,
    noisy_rule: false
  };
}

function buildEvolutionCandidates(normalizedEvents) {
  const captureHasFailure = normalizedEvents.some((event) => event.observed_signals.includes("tool_failure"));
  const candidateEvents = normalizedEvents
    .filter(shouldCreateCandidate)
    .map((event, index) => {
      const evidenceGate = candidateEvidenceGate(event);
      const candidateType = candidateTypeFor(event);
      const dedupeClusterKey = candidateClusterKey(event, candidateType);
      return {
        _candidate_index: index,
        _source_event: event,
        candidate_id: `hermes-candidate-${stableSlug(event.source_event_id)}-${stableHash({
          route: event.route_target,
          type: event.qianxuesen_event_type,
          decision: event.control_decision.decision
        }).slice(0, 8)}`,
        source_event_ids: [event.source_event_id],
        candidate_type: candidateType,
        target_surface: event.route_target,
        signal_origin: event.signal_origin,
        interpretation: event.interpretation,
        confidence: event.confidence,
        confidence_rule_id: event.confidence_rule_id,
        dedupe_cluster_key: dedupeClusterKey,
        action_identity_fingerprint: event.action_identity_fingerprint,
        pressure_signals: event.observed_signals,
        evidence_refs: event.evidence_refs,
        proposed_change: proposedChangeFor(event),
        expected_gain: expectedGainFor(event),
        ...(event.evolution_evidence ? { evolution_evidence: event.evolution_evidence } : {}),
        ...(humanReviewFor(event) ? { human_review: humanReviewFor(event) } : {}),
        evidence_quality: evidenceGate.evidence_quality,
        advisory_only: evidenceGate.advisory_only,
        evidence_reason_codes: uniqueStrings(evidenceGate.reason_codes),
        status: "observed",
        replay_required: false,
        tournament_required: false,
        can_promote_now: false,
        anomaly_rule_version: ANOMALY_RULE_VERSION,
        anomaly_rule_ids: [],
        raw_signal_count: 1,
        routing_stream: "observability_stream",
        stream_reason: "runtime observation is archived unless an anomaly rule or explicit evidence triggers a work order",
        review_outcome: workOrderOutcomeSkeleton([]),
        promotion_gate: {
          required_rules: [
            "preserve_signal_origin",
            "route_layer_a_to_observability_by_default",
            "promote_only_through_qianxuesen_gate"
          ],
          reason: "Runtime adapter output is boundary observation, not authority."
        }
      };
    });

  const clusterStats = new Map();
  for (const candidate of candidateEvents) {
    const current = clusterStats.get(candidate.dedupe_cluster_key) ?? {
      count: 0,
      representative_index: candidate._candidate_index,
      representative_hook: candidate._source_event.runtime_hook,
      representative_source_event_id: candidate.source_event_ids[0],
      source_event_ids: []
    };
    current.count += 1;
    current.source_event_ids.push(...candidate.source_event_ids);
    const candidateHook = candidate._source_event.runtime_hook;
    const prefersPostToolCall = candidateHook === "post_tool_call" && current.representative_hook !== "post_tool_call";
    const preservesFirstWithinHook = candidateHook === current.representative_hook && candidate._candidate_index < current.representative_index;
    if (prefersPostToolCall || preservesFirstWithinHook) {
      current.representative_index = candidate._candidate_index;
      current.representative_hook = candidateHook;
      current.representative_source_event_id = candidate.source_event_ids[0];
    }
    clusterStats.set(candidate.dedupe_cluster_key, current);
  }

  return candidateEvents.map((candidate) => {
    const event = candidate._source_event;
    const cluster = clusterStats.get(candidate.dedupe_cluster_key) ?? {
      count: 1,
      representative_index: candidate._candidate_index,
      representative_hook: candidate._source_event.runtime_hook,
      representative_source_event_id: candidate.source_event_ids[0],
      source_event_ids: candidate.source_event_ids
    };
    const anomalyRuleIds = anomalyRuleIdsFor({
      event,
      clusterCount: cluster.count,
      captureHasFailure
    });
    const explicitEvidence = candidate.signal_origin !== "runtime_operation_log";
    const isClusterRepresentative = candidate._candidate_index === cluster.representative_index;
    const goesToWorkOrder = explicitEvidence || (anomalyRuleIds.length > 0 && isClusterRepresentative);
    const requiredRules = goesToWorkOrder
      ? [
          "preserve_signal_origin",
          "dedupe_boundary_observations",
          "run_only_anomaly_or_explicit_evidence_as_work_order",
          "promote_only_through_qianxuesen_gate"
        ]
      : [
          "preserve_signal_origin",
          "archive_runtime_boundary_observation",
          "do_not_interrupt_human_inbox_without_anomaly"
        ];
    const {
      _candidate_index,
      _source_event,
      ...publicCandidate
    } = candidate;

    return {
      ...publicCandidate,
      source_event_ids: uniqueStrings([
        cluster.representative_source_event_id,
        ...(cluster.source_event_ids ?? publicCandidate.source_event_ids)
      ]),
      anomaly_rule_ids: anomalyRuleIds,
      raw_signal_count: cluster.count,
      routing_stream: goesToWorkOrder ? "work_order_stream" : "observability_stream",
      stream_reason: goesToWorkOrder
        ? explicitEvidence
          ? "explicit evolution evidence or replay synthesis enters the work-order stream"
          : "cluster representative matched deterministic anomaly rules"
        : "runtime boundary observation archived for observability only",
      review_outcome: workOrderOutcomeSkeleton(anomalyRuleIds),
      status: goesToWorkOrder ? "replay_required" : "observed",
      replay_required: goesToWorkOrder,
      tournament_required: goesToWorkOrder && candidate.signal_origin !== "runtime_operation_log",
      promotion_gate: {
        required_rules: requiredRules,
        reason: goesToWorkOrder
          ? "This record may become a work order, but still has no promotion authority."
          : "This record is observable boundary pressure, not a work order."
      }
    };
  });
}

function isFailedPostToolCall(event = {}) {
  if (event.hook !== "post_tool_call") return false;
  const result = event.result ?? {};
  const status = String(result.status ?? event.status ?? "").trim().toLowerCase();
  return result.success === false
    || ["failed", "error", "errored"].includes(status)
    || Boolean(result.error ?? event.error);
}

function queryTextFor(event = {}) {
  const toolName = toolNameFor(event);
  if (!toolName || !QUERY_ENTROPY_TOOLS.has(toolName)) return null;
  const rawQuery = event.args?.query
    ?? event.args?.q
    ?? event.args?.search_query
    ?? event.context?.query
    ?? null;
  const query = stringOrNull(rawQuery);
  return query ? query.replace(/\s+/g, " ") : null;
}

function actionHistoryEvents(normalizedEvents, originalEvents) {
  return normalizedEvents
    .map((normalized, index) => ({
      index,
      normalized,
      original: originalEvents[index] ?? {},
      source_event_id: normalized.source_event_id
    }))
    .filter(({ normalized }) => normalized.signal_origin === "runtime_operation_log")
    .filter(({ normalized }) => normalized.hook_family === "tool_call");
}

function buildFailureAfterRepeatMetric(runtimeActionEvents) {
  const failedEvents = runtimeActionEvents.filter(({ original }) => isFailedPostToolCall(original));
  const repeatedAfterFailure = failedEvents.filter((failedEvent) => {
    const nextToolEvent = runtimeActionEvents.find(({ index }) => index > failedEvent.index);
    return nextToolEvent?.normalized.action_identity_fingerprint
      === failedEvent.normalized.action_identity_fingerprint;
  });

  return {
    metric_id: "failure_after_repeat_rate",
    definition: "post_tool_call failure followed by the next tool-call event with the same action identity",
    failure_definition: "post_tool_call result returns error or failed",
    source_contract: {
      kind: "deterministic_reducer",
      llm_api_calls: 0
    },
    numerator: repeatedAfterFailure.length,
    denominator: failedEvents.length,
    value: failedEvents.length ? round3(repeatedAfterFailure.length / failedEvents.length) : 0,
    failed_source_event_ids: uniqueStrings(failedEvents.map(({ source_event_id }) => source_event_id)),
    repeated_source_event_ids: uniqueStrings(repeatedAfterFailure.map(({ source_event_id }) => source_event_id)),
    status: failedEvents.length === 0
      ? "not_applicable"
      : repeatedAfterFailure.length > 0
        ? "repeat_after_failure_detected"
        : "no_repeat_after_failure"
  };
}

function shannonEntropyBits(values) {
  const counts = countBy(values, (value) => value);
  const total = values.length;
  if (total === 0) return 0;
  return Object.values(counts).reduce((entropy, count) => {
    const probability = count / total;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function buildQueryEntropyMetric(runtimeActionEvents) {
  const queryEvents = runtimeActionEvents
    .map(({ original, source_event_id }) => ({
      source_event_id,
      tool_name: toolNameFor(original),
      query: queryTextFor(original)
    }))
    .filter(({ query }) => Boolean(query));
  const queries = queryEvents.map(({ query }) => query);
  const uniqueQueryCount = new Set(queries).size;
  const entropyBits = round3(shannonEntropyBits(queries));
  const maxEntropyBits = uniqueQueryCount > 1 ? Math.log2(uniqueQueryCount) : 0;
  const normalizedEntropy = maxEntropyBits > 0
    ? round3(entropyBits / maxEntropyBits)
    : 0;
  const status = queries.length < 2
    ? "insufficient_sample"
    : uniqueQueryCount <= 1
      ? "collapsed"
      : normalizedEntropy <= 0.35
        ? "low_entropy"
        : "diverse";

  return {
    metric_id: "query_entropy",
    definition: "Shannon entropy over retrieval/search tool query text",
    query_source: "retrieval_or_search_tool_args_query",
    source_contract: {
      kind: "deterministic_reducer",
      llm_api_calls: 0
    },
    query_count: queries.length,
    unique_query_count: uniqueQueryCount,
    entropy_bits: entropyBits,
    normalized_entropy: normalizedEntropy,
    value: normalizedEntropy,
    query_tool_names: uniqueStrings(queryEvents.map(({ tool_name }) => tool_name)),
    source_event_ids: uniqueStrings(queryEvents.map(({ source_event_id }) => source_event_id)),
    status
  };
}

function buildActionHistoryMonitorRecord(normalizedEvents, originalEvents) {
  const runtimeActionEvents = actionHistoryEvents(normalizedEvents, originalEvents);
  if (runtimeActionEvents.length === 0) return null;

  const sourceEventIds = uniqueStrings(runtimeActionEvents.map(({ source_event_id }) => source_event_id));
  return {
    record_id: `hermes-action-history-monitor-${stableHash({
      source_event_ids: sourceEventIds,
      event_count: runtimeActionEvents.length
    }).slice(0, 12)}`,
    record_kind: ACTION_HISTORY_MONITOR_RECORD_KIND,
    source_event_ids: sourceEventIds,
    signal_origin: "runtime_operation_log",
    interpretation: "adapter_inferred_evolution_pressure",
    routing_stream: "observability_stream",
    stream_reason: "readonly action-history monitor; advisory observability only",
    status: "observed",
    replay_required: false,
    tournament_required: false,
    can_promote_now: false,
    advisory_only: true,
    anomaly_rule_version: "none",
    anomaly_rule_ids: [],
    metrics: {
      failure_after_repeat_rate: buildFailureAfterRepeatMetric(runtimeActionEvents),
      query_entropy: buildQueryEntropyMetric(runtimeActionEvents)
    },
    source_window: sourceWindowFor(originalEvents, runtimeActionEvents.length)
  };
}

function isModelIoTapRecord(event = {}) {
  return event?.record_kind === MODEL_IO_TAP_RECORD_KIND;
}

function safeModelIoTapApiCallRef(raw = {}) {
  return {
    session_id: stringOrNull(raw.session_id),
    task_id: stringOrNull(raw.task_id),
    api_call_count: nonNegativeIntegerOrNull(raw.api_call_count),
    hook: enumOrDefault(raw.hook, MODEL_IO_TAP_PHASES, "imported_request"),
    model: stringOrNull(raw.model),
    provider: stringOrNull(raw.provider),
    api_mode: stringOrNull(raw.api_mode),
    base_url_hash: hashOrNull(raw.base_url_hash)
  };
}

function safeModelIoTapMetrics(raw = {}) {
  const metrics = raw.metrics && typeof raw.metrics === "object" ? raw.metrics : {};
  const tokenUsage = metrics.token_usage && typeof metrics.token_usage === "object"
    ? metrics.token_usage
    : {};

  return {
    token_usage: {
      input_tokens: nonNegativeIntegerOrNull(tokenUsage.input_tokens ?? metrics.input_tokens),
      output_tokens: nonNegativeIntegerOrNull(tokenUsage.output_tokens ?? metrics.output_tokens),
      cache_read_tokens: nonNegativeIntegerOrNull(tokenUsage.cache_read_tokens ?? metrics.cache_read_tokens)
    },
    message_count: nonNegativeIntegerOrZero(metrics.message_count),
    context_byte_size: nonNegativeIntegerOrZero(metrics.context_byte_size),
    tool_schema_count: nonNegativeIntegerOrZero(metrics.tool_schema_count),
    tool_result_error_count: nonNegativeIntegerOrZero(metrics.tool_result_error_count),
    system_prompt_hash: hashOrNull(metrics.system_prompt_hash),
    tool_schema_hash: hashOrNull(metrics.tool_schema_hash)
  };
}

function normalizeModelIoTapRecord(event = {}, index = 0) {
  const sourceEventIds = uniqueStrings(
    Array.isArray(event.source_event_ids) && event.source_event_ids.length
      ? event.source_event_ids
      : [event.event_id ?? `model-io-tap-${index + 1}`]
  );
  const apiCallRef = safeModelIoTapApiCallRef({
    ...(event.api_call_ref ?? {}),
    hook: event.api_call_ref?.hook ?? event.hook,
    session_id: event.api_call_ref?.session_id ?? event.session_id,
    task_id: event.api_call_ref?.task_id ?? event.task_id,
    api_call_count: event.api_call_ref?.api_call_count ?? event.api_call_count,
    model: event.api_call_ref?.model ?? event.model,
    provider: event.api_call_ref?.provider ?? event.provider,
    api_mode: event.api_call_ref?.api_mode ?? event.api_mode,
    base_url_hash: event.api_call_ref?.base_url_hash ?? event.base_url_hash
  });
  const sourceWindow = event.source_window?.kind && event.source_window?.value
    ? event.source_window
    : {
        kind: "count",
        value: `${sourceEventIds.length}_model_io_tap_events`
      };

  return {
    record_id: stringOrNull(event.record_id)
      ?? `hermes-model-io-tap-${stableHash({ source_event_ids: sourceEventIds, api_call_ref: apiCallRef }).slice(0, 12)}`,
    record_kind: MODEL_IO_TAP_RECORD_KIND,
    source_event_ids: sourceEventIds,
    signal_origin: "runtime_operation_log",
    routing_stream: "observability_stream",
    stream_reason: "readonly model I/O digest; input-side observability only",
    status: "observed",
    replay_required: false,
    tournament_required: false,
    can_promote_now: false,
    advisory_only: true,
    anomaly_rule_version: "none",
    anomaly_rule_ids: [],
    raw_prompt_persisted: false,
    raw_private_content_exported: false,
    redaction_status: enumOrDefault(event.redaction_status, MODEL_IO_TAP_REDACTION_STATUSES, "at_tap_point"),
    source_contract: {
      kind: "deterministic_reducer",
      llm_api_calls: 0
    },
    api_call_ref: apiCallRef,
    metrics: safeModelIoTapMetrics(event),
    source_window: sourceWindow
  };
}

function measurementGateRuleIdsFor({ actionHistoryMonitorRecord, modelIoTapRecords }) {
  const matched = [];
  const maxContextByteSize = maxNumber(modelIoTapRecords.map((record) => record.metrics.context_byte_size));
  const maxToolSchemaCount = maxNumber(modelIoTapRecords.map((record) => record.metrics.tool_schema_count));
  const maxToolResultErrorCount = maxNumber(modelIoTapRecords.map((record) => record.metrics.tool_result_error_count));
  const failureAfterRepeat = actionHistoryMonitorRecord?.metrics?.failure_after_repeat_rate;
  const queryEntropy = actionHistoryMonitorRecord?.metrics?.query_entropy;

  if (maxContextByteSize >= 50000) matched.push("context_byte_size_high");
  if (maxToolSchemaCount >= 40) matched.push("tool_schema_count_high");
  if (maxToolResultErrorCount >= 3) matched.push("tool_result_error_accumulation");
  if ((failureAfterRepeat?.denominator ?? 0) >= 1 && (failureAfterRepeat?.value ?? 0) >= 0.5) {
    matched.push("failure_after_repeat_rate_high");
  }
  if ((queryEntropy?.query_count ?? 0) >= 3 && ["collapsed", "low_entropy"].includes(queryEntropy?.status)) {
    matched.push("query_entropy_collapsed");
  }
  if (
    modelIoTapRecords.length === 0
    && (failureAfterRepeat?.denominator ?? 0) === 0
    && (!queryEntropy || queryEntropy.status === "insufficient_sample")
  ) {
    matched.push("measurement_evidence_sparse");
  }

  return uniqueStrings(matched);
}

function measurementGateVerdictFor(ruleIds) {
  const rules = MEASUREMENT_GATE_RULE_REGISTRY.filter((rule) => ruleIds.includes(rule.rule_id));
  const inputSuspected = rules.some((rule) => rule.category === "input_contamination");
  const behaviorSuspected = rules.some((rule) => rule.category === "behavior_loop");
  if (inputSuspected && behaviorSuspected) return "suspect_compound_failure";
  if (inputSuspected) return "suspect_input_contamination";
  if (behaviorSuspected) return "suspect_behavior_loop";
  if (rules.some((rule) => rule.category === "insufficient_evidence")) return "insufficient_evidence";
  return "clean_measurement";
}

function measurementGateBiasSnapshot({ verdict, evolutionCandidates }) {
  const candidateTypeCounts = countBy(evolutionCandidates, (candidate) => candidate.candidate_type);
  return Object.entries(candidateTypeCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([candidateType, count]) => {
      const prospectiveDirtyCount = verdict === "clean_measurement" ? 0 : count;
      return {
        candidate_type: candidateType,
        sample_count: count,
        prospective_clean_replay_required_count: prospectiveDirtyCount,
        prospective_clean_replay_required_rate: count ? round3(prospectiveDirtyCount / count) : 0
      };
    });
}

function buildMeasurementGateBiasMonitorRecord({
  measurementQualityGateRecord,
  evolutionCandidates,
  runtimeEvents
}) {
  if (!measurementQualityGateRecord) return null;
  const snapshot = measurementGateBiasSnapshot({
    verdict: measurementQualityGateRecord.verdict,
    evolutionCandidates
  });

  return {
    record_id: `hermes-measurement-gate-bias-monitor-${stableHash({
      gate_record_id: measurementQualityGateRecord.record_id,
      verdict: measurementQualityGateRecord.verdict,
      candidate_type_counts: countBy(evolutionCandidates, (candidate) => candidate.candidate_type)
    }).slice(0, 12)}`,
    record_kind: MEASUREMENT_GATE_BIAS_MONITOR_RECORD_KIND,
    source_event_ids: measurementQualityGateRecord.source_event_ids,
    signal_origin: "runtime_operation_log",
    routing_stream: "observability_stream",
    stream_reason: "emit-only gate-of-gate snapshot; detects prospective candidate-type bias before Phase 2-B",
    status: "observed",
    gate_phase: "emit_only",
    replay_required: false,
    tournament_required: false,
    can_promote_now: false,
    advisory_only: true,
    anomaly_rule_version: "none",
    anomaly_rule_ids: [],
    gate_record_id: measurementQualityGateRecord.record_id,
    verdict: measurementQualityGateRecord.verdict,
    bias_status: evolutionCandidates.length ? "baseline_only" : "no_candidate_sample",
    bias_policy: {
      phase: "phase_2a_emit_only",
      minimum_real_sessions_required: 50,
      dirty_rate_target_min: 0.05,
      dirty_rate_target_max: 0.3,
      human_review_hit_rate_min: 0.7,
      deterministic_reducer: true,
      llm_api_calls: 0
    },
    monitor_authority: {
      evaluates_candidate_quality: false,
      evaluates_gate_bias: true,
      blocks_layer_a: false,
      triggers_replay: false,
      layer_a_visibility: "not_exported_to_layer_a",
      agent_can_read: false,
      llm_api_calls: 0
    },
    by_candidate_type: snapshot.map((item) => ({
      candidate_type: item.candidate_type,
      sample_count: item.sample_count,
      prospective_dirty_measurement_count: item.prospective_clean_replay_required_count,
      prospective_dirty_measurement_rate: item.prospective_clean_replay_required_rate
    })),
    source_window: sourceWindowFor(runtimeEvents, measurementQualityGateRecord.source_event_ids.length)
  };
}

function buildMeasurementQualityGateRecord({
  actionHistoryMonitorRecord,
  modelIoTapRecords,
  evolutionCandidates,
  runtimeEvents
}) {
  if (!actionHistoryMonitorRecord && modelIoTapRecords.length === 0) return null;

  const matchedRuleIds = measurementGateRuleIdsFor({ actionHistoryMonitorRecord, modelIoTapRecords });
  const verdict = measurementGateVerdictFor(matchedRuleIds);
  const sourceEventIds = uniqueStrings([
    ...(actionHistoryMonitorRecord?.source_event_ids ?? []),
    ...modelIoTapRecords.flatMap((record) => record.source_event_ids)
  ]);
  const modelIoMetrics = modelIoTapRecords.map((record) => record.metrics);
  const failureAfterRepeat = actionHistoryMonitorRecord?.metrics?.failure_after_repeat_rate;
  const queryEntropy = actionHistoryMonitorRecord?.metrics?.query_entropy;

  return {
    record_id: `hermes-measurement-quality-gate-${stableHash({
      source_event_ids: sourceEventIds,
      matched_rule_ids: matchedRuleIds,
      verdict
    }).slice(0, 12)}`,
    record_kind: MEASUREMENT_QUALITY_GATE_RECORD_KIND,
    source_event_ids: sourceEventIds,
    signal_origin: "runtime_operation_log",
    routing_stream: "observability_stream",
    stream_reason: "emit-only measurement quality gate; does not block Layer A in this phase",
    status: "observed",
    verdict,
    gate_phase: "emit_only",
    replay_required: false,
    tournament_required: false,
    can_promote_now: false,
    advisory_only: true,
    anomaly_rule_version: "none",
    anomaly_rule_ids: [],
    measurement_rule_registry: {
      registry_id: "hermes-measurement-gate-rules",
      version: MEASUREMENT_GATE_RULE_VERSION,
      matched_rule_ids: matchedRuleIds,
      rules: MEASUREMENT_GATE_RULE_REGISTRY
    },
    gate_authority: {
      evaluates_candidate_quality: false,
      evaluates_measurement_quality: true,
      blocks_layer_a: false,
      triggers_replay: false,
      layer_a_visibility: "not_exported_to_layer_a",
      agent_can_read: false,
      llm_api_calls: 0
    },
    inputs: {
      action_history_monitor_record_ids: actionHistoryMonitorRecord ? [actionHistoryMonitorRecord.record_id] : [],
      model_io_tap_record_ids: modelIoTapRecords.map((record) => record.record_id),
      candidate_count: evolutionCandidates.length,
      candidate_type_counts: countBy(evolutionCandidates, (candidate) => candidate.candidate_type)
    },
    metrics: {
      max_context_byte_size: maxNumber(modelIoMetrics.map((metrics) => metrics.context_byte_size)),
      max_tool_schema_count: maxNumber(modelIoMetrics.map((metrics) => metrics.tool_schema_count)),
      max_tool_result_error_count: maxNumber(modelIoMetrics.map((metrics) => metrics.tool_result_error_count)),
      max_failure_after_repeat_rate: failureAfterRepeat?.value ?? null,
      failure_after_repeat_denominator: failureAfterRepeat?.denominator ?? 0,
      query_entropy_value: queryEntropy?.value ?? null,
      query_entropy_status: queryEntropy?.status ?? null
    },
    gate_bias_monitor: {
      mode: "emit_only_candidate_type_rate_snapshot",
      status: evolutionCandidates.length ? "baseline_only" : "no_candidate_sample",
      by_candidate_type: measurementGateBiasSnapshot({ verdict, evolutionCandidates })
    },
    source_window: sourceWindowFor(runtimeEvents, sourceEventIds.length)
  };
}

function buildHookMapping() {
  return [
    {
      hook: "pre_tool_call",
      hermes_surface: "tool intent before execution",
      qianxuesen_stage: "observe_tool_intent",
      qianxuesen_event_type: "runtime_tool_intent",
      can_block_runtime: true,
      default_blocks_runtime: false
    },
    {
      hook: "post_tool_call",
      hermes_surface: "tool result after execution",
      qianxuesen_stage: "observe_tool_result",
      qianxuesen_event_type: "execution_trace",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "pre_api_request",
      hermes_surface: "assembled provider request before model call",
      qianxuesen_stage: "observe_model_input_digest",
      qianxuesen_event_type: "model_io_tap",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "post_api_request",
      hermes_surface: "provider response metadata after model call",
      qianxuesen_stage: "observe_model_output_digest",
      qianxuesen_event_type: "model_io_tap",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "pre_llm_call",
      hermes_surface: "prompt and model request boundary",
      qianxuesen_stage: "observe_model_request",
      qianxuesen_event_type: "llm_context_trace",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "post_llm_call",
      hermes_surface: "assistant output and background review",
      qianxuesen_stage: "observe_model_output",
      qianxuesen_event_type: "llm_output_trace",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "on_session_end",
      hermes_surface: "end-of-session review boundary",
      qianxuesen_stage: "flush_adapter_events",
      qianxuesen_event_type: "session_digest_boundary",
      can_block_runtime: false,
      default_blocks_runtime: false
    }
  ];
}

function buildPluginContract() {
  return {
    plugin_id: "qianxuesen-hermes-runtime-adapter",
    install_shape: "Hermes plugin hook module plus event log bridge",
    default_mode: "observe_only",
    attach_points: buildHookMapping().map((item) => ({
      hook: item.hook,
      purpose: item.qianxuesen_stage,
      can_block_runtime: item.can_block_runtime,
      default_action: "observe"
    })),
    event_output: {
      format: "ndjson",
      env_var: "QIANXUESEN_HERMES_EVENT_LOG",
      default_path: "~/.hermes/qianxuesen-runtime-events.ndjson",
      contains_raw_private_content: false,
      redaction_status: "at_tap_point",
      raw_private_content_exported: false
    },
    no_direct_authority: [
      "does_not_write_hermes_memory",
      "does_not_write_hermes_skills",
      "does_not_promote_qianxuesen_candidates",
      "does_not_call_llm_or_external_api"
    ],
    adapter_boundary: {
      universal_contract_stays_qianxuesen_owned: true,
      framework_specific_code_required: true,
      framework_specific_code_is_thin: true,
      runtime_install_required_before_live_capture: true
    }
  };
}

function buildControlPlaneWriteDeny() {
  return {
    policy_id: "misa.control_plane_write_deny.v1",
    default_decision: "deny",
    allowed_surface: "observe_and_emit_replay_required_candidates",
    direct_writes_allowed: false,
    bypass_allowed: false,
    applies_to: [
      "qianxuesen_routes",
      "qianxuesen_memory",
      "qianxuesen_skills",
      "candidate_promotion",
      "hermes_memory",
      "hermes_skills",
      "runtime_blocking"
    ],
    enforced_by: [
      "adapter_safety_summary",
      "effect_boundary.direct_qianxuesen_write_allowed=false",
      "candidate_replay_required_before_promotion",
      "plugin_contract.default_mode=observe_only"
    ]
  };
}

function safetySummary() {
  return {
    production_authority: false,
    writes_persistent_memory: false,
    writes_skills: false,
    changes_route: false,
    changes_winner: false,
    blocks_runtime: false,
    publication_allowed: false,
    starts_services: false,
    raw_private_content_persisted: false,
    raw_private_content_exported: false,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function buildChecks({
  hookMapping,
  normalizedEvents,
  researchDigests,
  evolutionCandidates,
  boundaryObservations,
  observabilityStream,
  workOrderStream,
  safety,
  pluginContract,
  controlPlaneWriteDeny
}) {
  const hooks = new Set(hookMapping.map((item) => item.hook));
  const skillEvents = normalizedEvents.filter((event) => event.tool_name === "skill_manage");
  const memoryWriteEvents = normalizedEvents.filter((event) => event.effect_boundary.persistent_memory_write_requested);
  const externalEvents = normalizedEvents.filter((event) => event.effect_boundary.external_information_channel);
  const candidateSourceIds = new Set(evolutionCandidates.flatMap((candidate) => candidate.source_event_ids));
  const actionHistoryMonitorRecords = observabilityStream.filter((record) => (
    record.record_kind === ACTION_HISTORY_MONITOR_RECORD_KIND
  ));
  const modelIoTapRecords = observabilityStream.filter((record) => (
    record.record_kind === MODEL_IO_TAP_RECORD_KIND
  ));
  const measurementQualityGateRecords = observabilityStream.filter((record) => (
    record.record_kind === MEASUREMENT_QUALITY_GATE_RECORD_KIND
  ));
  const measurementGateBiasMonitorRecords = observabilityStream.filter((record) => (
    record.record_kind === MEASUREMENT_GATE_BIAS_MONITOR_RECORD_KIND
  ));
  const directAuthorityOff = Object.values({
    production_authority: safety.production_authority,
    writes_persistent_memory: safety.writes_persistent_memory,
    writes_skills: safety.writes_skills,
    changes_route: safety.changes_route,
    changes_winner: safety.changes_winner,
    blocks_runtime: safety.blocks_runtime,
    publication_allowed: safety.publication_allowed,
    starts_services: safety.starts_services,
    raw_private_content_persisted: safety.raw_private_content_persisted,
    raw_private_content_exported: safety.raw_private_content_exported
  }).every((value) => value === false);

  return [
    {
      name: "Hermes hook surface is mapped",
      ok: REQUIRED_HERMES_HOOKS.every((hook) => hooks.has(hook)),
      required_hooks: REQUIRED_HERMES_HOOKS,
      mapped_hooks: [...hooks].sort()
    },
    {
      name: "skill_manage changes become replay-gated candidates",
      ok: skillEvents.length === 0 || skillEvents.every((event) => (
        event.route_target === "skill"
        && event.effect_boundary.direct_qianxuesen_write_allowed === false
        && candidateSourceIds.has(event.source_event_id)
      )),
      skill_manage_events: skillEvents.length,
      candidate_source_ids: [...candidateSourceIds].sort()
    },
    {
      name: "memory writes cannot bypass policy review",
      ok: memoryWriteEvents.every((event) => (
        event.effect_boundary.direct_qianxuesen_write_allowed === false
        && event.control_decision.can_promote_now === false
      )),
      memory_write_events: memoryWriteEvents.length
    },
    {
      name: "external information becomes research digest evidence",
      ok: externalEvents.length === 0 || researchDigests.length >= externalEvents.length,
      external_information_events: externalEvents.length,
      research_digests: researchDigests.length
    },
    {
      name: "boundary observations split into observability and work-order streams",
      ok: evolutionCandidates.every((candidate) => (
        ["observability_stream", "work_order_stream"].includes(candidate.routing_stream)
        && candidate.can_promote_now === false
      ))
        && observabilityStream.every((candidate) => candidate.replay_required === false)
        && workOrderStream.every((candidate) => candidate.replay_required === true),
      candidate_count: evolutionCandidates.length,
      observability_stream_count: observabilityStream.length,
      work_order_stream_count: workOrderStream.length
    },
    {
      name: "action-history monitor stays observability-only",
      ok: actionHistoryMonitorRecords.every((record) => (
        record.signal_origin === "runtime_operation_log"
        && record.routing_stream === "observability_stream"
        && record.can_promote_now === false
        && record.replay_required === false
        && record.tournament_required === false
      ))
        && workOrderStream.every((record) => record.record_kind !== ACTION_HISTORY_MONITOR_RECORD_KIND),
      action_history_monitor_count: actionHistoryMonitorRecords.length
    },
    {
      name: "model I/O tap stays input-side observability-only",
      ok: modelIoTapRecords.every((record) => (
        record.signal_origin === "runtime_operation_log"
        && record.routing_stream === "observability_stream"
        && record.can_promote_now === false
        && record.replay_required === false
        && record.tournament_required === false
        && record.raw_prompt_persisted === false
        && record.raw_private_content_exported === false
        && record.source_contract.llm_api_calls === 0
      ))
        && workOrderStream.every((record) => record.record_kind !== MODEL_IO_TAP_RECORD_KIND)
        && evolutionCandidates.every((record) => record.record_kind !== MODEL_IO_TAP_RECORD_KIND),
      model_io_tap_count: modelIoTapRecords.length
    },
    {
      name: "measurement quality gate stays emit-only",
      ok: measurementQualityGateRecords.every((record) => (
        record.signal_origin === "runtime_operation_log"
        && record.routing_stream === "observability_stream"
        && record.gate_phase === "emit_only"
        && record.can_promote_now === false
        && record.replay_required === false
        && record.tournament_required === false
        && record.gate_authority.blocks_layer_a === false
        && record.gate_authority.triggers_replay === false
        && record.gate_authority.agent_can_read === false
        && record.gate_authority.llm_api_calls === 0
      ))
        && workOrderStream.every((record) => record.record_kind !== MEASUREMENT_QUALITY_GATE_RECORD_KIND)
        && evolutionCandidates.every((record) => record.record_kind !== MEASUREMENT_QUALITY_GATE_RECORD_KIND),
      measurement_quality_gate_count: measurementQualityGateRecords.length
    },
    {
      name: "measurement gate bias monitor stays emit-only",
      ok: measurementGateBiasMonitorRecords.every((record) => (
        record.signal_origin === "runtime_operation_log"
        && record.routing_stream === "observability_stream"
        && record.gate_phase === "emit_only"
        && record.can_promote_now === false
        && record.replay_required === false
        && record.tournament_required === false
        && record.monitor_authority.blocks_layer_a === false
        && record.monitor_authority.triggers_replay === false
        && record.monitor_authority.agent_can_read === false
        && record.monitor_authority.llm_api_calls === 0
      ))
        && workOrderStream.every((record) => record.record_kind !== MEASUREMENT_GATE_BIAS_MONITOR_RECORD_KIND)
        && evolutionCandidates.every((record) => record.record_kind !== MEASUREMENT_GATE_BIAS_MONITOR_RECORD_KIND),
      measurement_gate_bias_monitor_count: measurementGateBiasMonitorRecords.length
    },
    {
      name: "candidate provenance is explicit and closed",
      ok: evolutionCandidates.every((candidate) => (
        SIGNAL_ORIGIN_VOCAB.includes(candidate.signal_origin)
        && INTERPRETATION_VOCAB.includes(candidate.interpretation)
        && CONFIDENCE_VOCAB.includes(candidate.confidence)
        && typeof candidate.confidence_rule_id === "string"
        && candidate.confidence_rule_id.length > 0
      )),
      signal_origin_counts: countBy(evolutionCandidates, (candidate) => candidate.signal_origin),
      boundary_observations: boundaryObservations.length
    },
    {
      name: "runtime log pressure reaches inbox only through deterministic anomaly rules",
      ok: workOrderStream.every((candidate) => (
        candidate.signal_origin !== "runtime_operation_log"
        || candidate.anomaly_rule_ids.length > 0
      ))
        && evolutionCandidates.every((candidate) => candidate.anomaly_rule_version === ANOMALY_RULE_VERSION),
      anomaly_rule_version: ANOMALY_RULE_VERSION,
      runtime_work_order_count: workOrderStream.filter((candidate) => candidate.signal_origin === "runtime_operation_log").length
    },
    {
      name: "evolution evidence tap blocks insufficient or gameable evidence",
      ok: evolutionCandidates.every((candidate) => (
        candidate.can_promote_now === false
        && EVIDENCE_QUALITY_VOCAB.includes(candidate.evidence_quality)
        && (candidate.evidence_quality !== "sufficient" || candidate.advisory_only === false)
      )),
      insufficient_evidence_count: evolutionCandidates.filter((candidate) => candidate.evidence_quality !== "sufficient").length,
      candidate_count: evolutionCandidates.length
    },
    {
      name: "feedback reducer gate blocks LLM-inferred feedback from decisions",
      ok: evolutionCandidates.every((candidate) => (
        candidate.evolution_evidence?.llm_inferred !== true
          || (candidate.evidence_quality !== "sufficient" && candidate.advisory_only === true)
      )),
      llm_inferred_feedback_candidates: evolutionCandidates.filter((candidate) => candidate.evolution_evidence?.llm_inferred === true).length
    },
    {
      name: "registered baseline eval and holdout own promotion evidence",
      ok: evolutionCandidates.every((candidate) => (
        candidate.evidence_quality !== "sufficient"
          || (
            candidate.evolution_evidence?.baseline_registered === true
            && candidate.evolution_evidence?.holdout_registered === true
            && candidate.evolution_evidence?.eval_dataset_registered === true
          )
      )),
      sufficient_evidence_count: evolutionCandidates.filter((candidate) => candidate.evidence_quality === "sufficient").length
    },
    {
      name: "trace references stay behind the redacted tap boundary",
      ok: normalizedEvents.every((event) => (
        !event.evolution_evidence
          || (
            event.evolution_evidence.redaction_status === "at_tap_point"
            && event.evolution_evidence.raw_private_content_exported === false
          )
      )),
      evolution_evidence_count: normalizedEvents.filter((event) => event.evolution_evidence).length
    },
    {
      name: "adapter stays observe-only and call-free",
      ok: directAuthorityOff
        && safety.llm_api_calls === 0
        && safety.external_api_calls === 0,
      safety
    },
    {
      name: "control-plane write-deny is explicit and closed",
      ok: controlPlaneWriteDeny.default_decision === "deny"
        && controlPlaneWriteDeny.direct_writes_allowed === false
        && controlPlaneWriteDeny.bypass_allowed === false
        && pluginContract.default_mode === "observe_only"
        && normalizedEvents.every((event) => event.effect_boundary.direct_qianxuesen_write_allowed === false),
      control_plane_write_deny_failed: false,
      control_plane_write_deny: controlPlaneWriteDeny
    },
    {
      name: "plugin contract is thin runtime glue",
      ok: pluginContract.adapter_boundary.universal_contract_stays_qianxuesen_owned === true
        && pluginContract.adapter_boundary.framework_specific_code_required === true
        && pluginContract.adapter_boundary.framework_specific_code_is_thin === true,
      install_shape: pluginContract.install_shape,
      default_mode: pluginContract.default_mode
    }
  ];
}

function violationsForChecks(checks) {
  return checks
    .filter((check) => !check.ok)
    .map((check) => `failed_${stableSlug(check.name)}`);
}

function buildSignalToNoiseMetric({ workOrderCount, boundaryObservationCount }) {
  const value = boundaryObservationCount
    ? round3(workOrderCount / boundaryObservationCount)
    : 0;
  const status = boundaryObservationCount === 0
    ? "not_applicable"
    : value >= SIGNAL_TO_NOISE_TARGET_BAND.min && value <= SIGNAL_TO_NOISE_TARGET_BAND.max
      ? "inside_target_band"
      : value > SIGNAL_TO_NOISE_TARGET_BAND.max
        ? "too_noisy"
        : "possibly_too_quiet";
  return {
    metric_id: SIGNAL_TO_NOISE_METRIC_ID,
    formula: "work_order_stream_count / boundary_observation_count",
    source_contract: {
      kind: "deterministic_reducer",
      llm_api_calls: 0
    },
    numerator: workOrderCount,
    denominator: boundaryObservationCount,
    value,
    target_band: SIGNAL_TO_NOISE_TARGET_BAND,
    status
  };
}

function buildMigrationDryRun({ evolutionCandidates, observabilityStream, workOrderStream }) {
  return {
    mode: "dry_run_only",
    source: "legacy_evolution_candidates",
    original_count: evolutionCandidates.length,
    work_order_stream_count: workOrderStream.length,
    observability_stream_count: observabilityStream.length,
    history_write_performed: false,
    action: "report_only_no_ledger_mutation",
    reclassified_marker: "retroactively_reclassified_on_report_only"
  };
}

export function buildHermesRuntimeAdapterReport({
  fixture,
  now = new Date("2026-05-15T00:00:00Z")
} = {}) {
  if (!fixture) throw new Error("fixture is required");

  const events = fixture.events ?? [];
  const modelIoTapRecords = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => isModelIoTapRecord(event))
    .map(({ event, index }) => normalizeModelIoTapRecord(event, index));
  const runtimeEvents = events.filter((event) => !isModelIoTapRecord(event));
  const hookMapping = buildHookMapping();
  const normalizedEvents = runtimeEvents.map(normalizeHermesEvent);
  const researchDigests = buildResearchDigests(normalizedEvents, runtimeEvents);
  const evolutionCandidates = buildEvolutionCandidates(normalizedEvents);
  const boundaryObservations = evolutionCandidates.filter((candidate) => candidate.signal_origin === "runtime_operation_log");
  const candidateObservabilityStream = evolutionCandidates.filter((candidate) => candidate.routing_stream === "observability_stream");
  const workOrderStream = evolutionCandidates.filter((candidate) => candidate.routing_stream === "work_order_stream");
  const actionHistoryMonitorRecord = buildActionHistoryMonitorRecord(normalizedEvents, runtimeEvents);
  const measurementQualityGateRecord = buildMeasurementQualityGateRecord({
    actionHistoryMonitorRecord,
    modelIoTapRecords,
    evolutionCandidates,
    runtimeEvents
  });
  const measurementGateBiasMonitorRecord = buildMeasurementGateBiasMonitorRecord({
    measurementQualityGateRecord,
    evolutionCandidates,
    runtimeEvents
  });
  const observabilityStream = [
    ...candidateObservabilityStream,
    ...modelIoTapRecords,
    ...(actionHistoryMonitorRecord ? [actionHistoryMonitorRecord] : []),
    ...(measurementQualityGateRecord ? [measurementQualityGateRecord] : []),
    ...(measurementGateBiasMonitorRecord ? [measurementGateBiasMonitorRecord] : [])
  ];
  const evolutionEvidence = normalizedEvents
    .map((event) => event.evolution_evidence)
    .filter(Boolean);
  const safety = safetySummary();
  const pluginContract = buildPluginContract();
  const controlPlaneWriteDeny = buildControlPlaneWriteDeny();
  const checks = buildChecks({
    hookMapping,
    normalizedEvents,
    researchDigests,
    evolutionCandidates,
    boundaryObservations,
    observabilityStream,
    workOrderStream,
    safety,
    pluginContract,
    controlPlaneWriteDeny
  });
  const violations = violationsForChecks(checks);
  const signalToNoise = buildSignalToNoiseMetric({
    workOrderCount: workOrderStream.length,
    boundaryObservationCount: boundaryObservations.length
  });
  const evidenceWithoutExplicitSignalOriginCount = events.filter((event) => (
    hasEvolutionEvidencePayload(event) && !explicitSignalOriginFor(event)
  )).length;
  const warnings = [
    "This adapter report is local dry-run evidence, not a live Hermes plugin install.",
    "Hermes pre_tool_call can block at runtime, but this default contract only observes.",
    "Layer A runtime operation logs are boundary observations; they are not official Hermes self-evolution candidates.",
    "Only anomaly-triggered boundary observations or explicit evolution evidence enter the work-order stream.",
    ...(evidenceWithoutExplicitSignalOriginCount > 0
      ? [
          `${evidenceWithoutExplicitSignalOriginCount} event(s) supplied evolution_evidence without explicit signal_origin; they defaulted to runtime_operation_log and cannot support promotion.`
        ]
      : [])
  ];

  return {
    schema_version: "misa.agent_runtime_adapter.v1",
    mode: "hermes-runtime-adapter",
    ok: violations.length === 0,
    created_at: asIsoDate(now),
    adapter: {
      adapter_id: "hermes-agent-runtime-adapter",
      runtime: fixture.source?.runtime ?? "hermes-agent",
      runtime_commit: fixture.source?.runtime_commit ?? "unknown",
      source_url: fixture.source?.source_url ?? "https://github.com/NousResearch/hermes-agent",
      entry_strategy: "Hermes plugin hooks plus offline NDJSON replay",
      default_mode: "observe_only"
    },
    universal_contract: {
      adapter_role: "runtime_event_normalizer",
      control_owner: "qianxuesen",
      framework_role: "carrier_runtime",
      route_vocab: ROUTE_VOCAB,
      accepts_external_information: true,
      candidate_pool_policy: "boundary_observation_or_explicit_evolution_evidence_only",
      direct_write_policy: "forbidden_by_default",
      runtime_specific_code_required: true
    },
    hook_mapping: hookMapping,
    normalized_events: normalizedEvents,
    research_digests: researchDigests,
    evolution_candidates: evolutionCandidates,
    boundary_observations: boundaryObservations,
    observability_stream: observabilityStream,
    work_order_stream: workOrderStream,
    anomaly_rules: {
      registry_id: "hermes-boundary-anomaly-rules",
      version: ANOMALY_RULE_VERSION,
      rules: ANOMALY_RULE_REGISTRY
    },
    observability_retention: OBSERVABILITY_RETENTION_POLICY,
    migration_dry_run: buildMigrationDryRun({
      evolutionCandidates,
      observabilityStream: candidateObservabilityStream,
      workOrderStream
    }),
    control_plane_write_deny: controlPlaneWriteDeny,
    plugin_contract: pluginContract,
    summary: {
      event_count: normalizedEvents.length,
      normalized_event_count: normalizedEvents.length,
      model_io_tap_count: modelIoTapRecords.length,
      measurement_quality_gate_count: measurementQualityGateRecord ? 1 : 0,
      measurement_gate_bias_monitor_count: measurementGateBiasMonitorRecord ? 1 : 0,
      research_digest_count: researchDigests.length,
      evolution_candidate_count: evolutionCandidates.length,
      official_evolution_candidate_count: evolutionCandidates.filter((candidate) => (
        candidate.signal_origin === "hermes_official_self_evolution"
      )).length,
      qianxuesen_replay_synthesis_count: evolutionCandidates.filter((candidate) => (
        candidate.signal_origin === "qianxuesen_replay_synthesis"
      )).length,
      inferred_evolution_pressure_count: boundaryObservations.length,
      boundary_observation_count: boundaryObservations.length,
      observability_stream_count: observabilityStream.length,
      work_order_stream_count: workOrderStream.length,
      sidecar_signal_to_noise_ratio: signalToNoise,
      replay_required_count: evolutionCandidates.filter((candidate) => candidate.replay_required).length,
      tournament_required_count: evolutionCandidates.filter((candidate) => candidate.tournament_required).length,
      skill_manage_event_count: normalizedEvents.filter((event) => event.tool_name === "skill_manage").length,
      memory_write_event_count: normalizedEvents.filter((event) => event.effect_boundary.persistent_memory_write_requested).length,
      external_information_event_count: normalizedEvents.filter((event) => event.effect_boundary.external_information_channel).length,
      evolution_evidence_count: evolutionEvidence.length,
      holdout_evidence_count: evolutionEvidence.filter((item) => item.holdout_backed).length,
      positive_optimization_evidence_count: evolutionEvidence.filter((item) => item.can_support_optimization).length,
      insufficient_evidence_summary: {
        sample_count: evolutionCandidates.length,
        event_type: "evolution_candidate",
        source_window: sourceWindowFor(runtimeEvents, evolutionCandidates.length),
        insufficient_count: evolutionCandidates.filter((candidate) => candidate.evidence_quality !== "sufficient").length,
        insufficient_ratio: evolutionCandidates.length
          ? round3(evolutionCandidates.filter((candidate) => candidate.evidence_quality !== "sufficient").length / evolutionCandidates.length)
          : 0
      },
      default_mode: "observe_only",
      verifier: violations.length === 0 ? "passed" : "failed"
    },
    safety,
    checks,
    warnings,
    violations
  };
}

export async function runHermesRuntimeAdapter({
  repoRoot = process.cwd(),
  fixtureFile = DEFAULT_HERMES_RUNTIME_EVENTS,
  eventLogFile,
  runtime = "hermes-agent",
  runtimeCommit = "unknown",
  sourceUrl = "local-hermes-plugin-event-log",
  now = new Date("2026-05-15T00:00:00Z")
} = {}) {
  const fixture = eventLogFile
    ? {
        fixture_id: `hermes-runtime-event-log-${stableSlug(path.basename(eventLogFile))}`,
        source: {
          runtime,
          runtime_commit: runtimeCommit,
          source_url: sourceUrl
        },
        events: await readHermesRuntimeEventLog(resolvePath(repoRoot, eventLogFile))
      }
    : await readJson(resolvePath(repoRoot, fixtureFile));

  return buildHermesRuntimeAdapterReport({
    fixture,
    now
  });
}
