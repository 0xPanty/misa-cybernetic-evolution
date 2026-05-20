import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_EXTERNAL_TRAJECTORY_ROOT = "F:\\misa-agent-datasets\\agent-trajectories";
export const DEFAULT_EXTERNAL_TRAJECTORY_DATASETS = Object.freeze([
  "atbench",
  "atbench-codex",
  "agentrx-github",
  "swe-chat",
  "swe-rebench-openhands"
]);
export const DEFAULT_EXTERNAL_TRAJECTORY_SAMPLING_PROFILE = "head";
export const DEFAULT_SWE_CHAT_SCAN_LIMIT = 200;
export const DEFAULT_SWE_CHAT_MAX_TRANSCRIPT_BYTES = 2_000_000;

const DEFAULT_NOW = new Date("2026-05-15T00:00:00Z");
const DATASET_TARGET_WEIGHTS = Object.freeze({
  "atbench": 0.25,
  "atbench-codex": 0.25,
  "agentrx-github": 0.15,
  "swe-chat": 0.25,
  "swe-rebench-openhands": 0.10
});
const SWE_REBENCH_SIDECAR_NAMES = Object.freeze([
  "sanitized-trajectories.jsonl",
  "swe-rebench-openhands.sanitized.jsonl",
  "public-safe-trajectories.jsonl"
]);
const COMMAND_PATTERN_KEYS = Object.freeze([
  "destructive",
  "install_or_dependency",
  "git_commit",
  "git_push_or_publish",
  "network_fetch",
  "test_or_verify"
]);
const COMMAND_CONTEXT_KEYS = Object.freeze([
  "actual_command",
  "hook_command",
  "tool_result_output",
  "plan_or_instruction",
  "quoted_or_log_output",
  "unknown"
]);

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "sample")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120) || "sample";
}

function countBy(values, selector = (value) => value) {
  return values.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function sum(values, selector = (value) => value) {
  return values.reduce((total, value) => total + selector(value), 0);
}

function roundRate(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : 0;
}

function relPath(root, filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

async function listFiles(dirPath, suffix) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && (!suffix || entry.name.endsWith(suffix)))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function normalizeSamplingProfile(profile) {
  return profile === "stratified" ? "stratified" : DEFAULT_EXTERNAL_TRAJECTORY_SAMPLING_PROFILE;
}

function evenlySpaced(items, limit) {
  if (items.length <= limit) return items;
  if (limit <= 0) return [];
  const selected = [];
  const used = new Set();
  const step = (items.length - 1) / Math.max(limit - 1, 1);
  for (let i = 0; i < limit; i += 1) {
    const index = Math.round(i * step);
    if (!used.has(index)) {
      selected.push(items[index]);
      used.add(index);
    }
  }
  return selected;
}

function selectStratified(items, limit, bucketSelector) {
  if (items.length <= limit) return items;
  if (limit <= 0) return [];
  const buckets = new Map();
  for (const item of items) {
    const key = bucketSelector(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const keys = [...buckets.keys()].sort();
  const selected = [];
  const used = new Set();
  let cursor = 0;
  while (selected.length < limit && used.size < items.length) {
    const key = keys[cursor % keys.length];
    const bucket = buckets.get(key);
    while (bucket.length && used.has(bucket[0].stableKey)) bucket.shift();
    if (bucket.length) {
      const next = bucket.shift();
      selected.push(next);
      used.add(next.stableKey);
    }
    cursor += 1;
  }
  return selected;
}

function sampleRows(rows, limit, samplingProfile, bucketSelector) {
  const indexed = rows.map((item, index) => ({
    item,
    index,
    stableKey: String(item.id ?? item.conv_id ?? item.caseId ?? index)
  }));
  const selected = samplingProfile === "stratified"
    ? selectStratified(indexed, limit, bucketSelector)
    : indexed.slice(0, limit);
  return selected;
}

function perDatasetBudgets({ datasets, maxPerDataset, targetSampleCount }) {
  if (!targetSampleCount) {
    return Object.fromEntries(datasets.map((dataset) => [dataset, Math.max(0, maxPerDataset)]));
  }
  const budgets = {};
  const weightedDatasets = datasets.filter((dataset) => (DATASET_TARGET_WEIGHTS[dataset] ?? 0) > 0);
  const fallbackBudget = Math.max(1, Math.ceil(targetSampleCount / Math.max(weightedDatasets.length, 1)));
  for (const dataset of datasets) {
    const weight = DATASET_TARGET_WEIGHTS[dataset];
    budgets[dataset] = weight === undefined
      ? fallbackBudget
      : Math.max(0, Math.round(targetSampleCount * weight));
  }
  return budgets;
}

function emptyAdoptionLedger() {
  return {
    suggestion_count: 0,
    adopted_count: 0,
    rejected_count: 0,
    effective_without_adoption_count: 0,
    score_delta_after_adoption: null,
    safety_regression_after_adoption: false,
    rejection_reasons: [],
    external_success_proxy: {
      available: false,
      kind: "not_available",
      value: null,
      confidence: "none"
    },
    user_pushback_proxy: {
      available: false,
      correction_count: 0,
      failure_report_count: 0,
      rejection_count: 0,
      takeover_count: 0
    }
  };
}

function emptySafetyBoundary() {
  return {
    available: false,
    expected_safe: null,
    unsafe_label: null,
    risk_source: "unknown",
    failure_mode: "unknown",
    harm_type: "unknown"
  };
}

function emptyResolvedProxy() {
  return {
    available: false,
    resolved: null,
    kind: "not_available",
    confidence: "none"
  };
}

function emptyCommandPatterns() {
  return Object.fromEntries(COMMAND_PATTERN_KEYS.map((key) => [key, 0]));
}

function emptyCommandPatternContexts() {
  return Object.fromEntries(COMMAND_PATTERN_KEYS.map((pattern) => [
    pattern,
    Object.fromEntries(COMMAND_CONTEXT_KEYS.map((context) => [context, 0]))
  ]));
}

function addPatternCounts(target, source, contextTarget, context) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
    if (contextTarget?.[key]?.[context] !== undefined) {
      contextTarget[key][context] += value;
    }
  }
}

function makeWorkOrderSample({
  sampleId,
  dataset,
  sampleType,
  title,
  category = "engineering_repair",
  severity = "P2",
  riskLevel = "medium",
  route = "external_trajectory_shadow_eval",
  expectedStrategyFamily = "replay_or_compact",
  baselineCommit,
  sourceRefsCount = 1,
  acceptanceCriteriaCount = 1,
  forbiddenScopeCount = 4
}) {
  return {
    work_order_id: `wo-trajectory-${stableSlug(sampleId)}`,
    title,
    category,
    severity,
    risk_level: riskLevel,
    route,
    baseline_commit: baselineCommit,
    expected_strategy_family: expectedStrategyFamily,
    dataset,
    sample_type: sampleType,
    source_refs_count: sourceRefsCount,
    acceptance_criteria_count: acceptanceCriteriaCount,
    forbidden_scope_count: forbiddenScopeCount
  };
}

function makeRecord({
  sampleId,
  dataset,
  sampleType,
  sourceRef,
  format,
  parserNotes = [],
  workOrderSample,
  adoptionLedger,
  rejectionReason,
  safetyBoundary,
  resolvedProxy,
  issues = []
}) {
  return {
    sample_id: sampleId,
    dataset,
    sample_type: sampleType,
    source_ref: sourceRef,
    normalization: {
      ok: true,
      format,
      raw_content_persisted: false,
      parser_notes: parserNotes
    },
    work_order_sample: workOrderSample,
    adoption_ledger_sample: adoptionLedger ?? emptyAdoptionLedger(),
    rejection_reason_sample: rejectionReason ?? {
      available: false,
      reasons: []
    },
    safety_boundary_sample: safetyBoundary ?? emptySafetyBoundary(),
    resolved_proxy_sample: resolvedProxy ?? emptyResolvedProxy(),
    issues
  };
}

function issue({ dataset, sampleId = null, severity = "medium", kind, message, calibrationTarget }) {
  return {
    issue_id: `${stableSlug(dataset)}-${stableSlug(kind)}-${stableSlug(sampleId ?? "dataset")}`,
    dataset,
    sample_id: sampleId,
    severity,
    kind,
    message,
    calibration_target: calibrationTarget
  };
}

function coerceNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceBoolean(value, fallback = null) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["true", "yes", "1", "pass", "passed", "resolved", "success"].includes(value.toLowerCase())) return true;
    if (["false", "no", "0", "fail", "failed", "unresolved", "failure"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function atBenchRecord({ item, index, group, filePath, datasetRoot, baselineCommit }) {
  const unsafe = String(item.label) === "1" || item.label === true;
  const sampleId = `atbench:${group}:${item.conv_id ?? index}`;
  const issues = unsafe
    ? [issue({
      dataset: "atbench",
      sampleId,
      severity: "high",
      kind: "unsafe_boundary_requires_context_classification",
      message: "Unsafe safety-boundary sample should become a rejected or blocked work-order candidate, not an adopted action.",
      calibrationTarget: "safety_regression_penalty"
    })]
    : [];

  return makeRecord({
    sampleId,
    dataset: "atbench",
    sampleType: "safety_boundary",
    sourceRef: {
      path_hint: `${relPath(datasetRoot, filePath)}#${index}`,
      record_hint: String(item.conv_id ?? index)
    },
    format: "json_array",
    workOrderSample: makeWorkOrderSample({
      sampleId,
      dataset: "atbench",
      sampleType: "safety_boundary",
      title: unsafe ? "Reject unsafe external tool trajectory" : "Preserve safe external tool trajectory boundary",
      severity: unsafe ? "P1" : "P3",
      riskLevel: unsafe ? "high" : "low",
      expectedStrategyFamily: unsafe ? "boundary" : "conservative",
      baselineCommit,
      forbiddenScopeCount: unsafe ? 5 : 3
    }),
    adoptionLedger: {
      ...emptyAdoptionLedger(),
      rejected_count: unsafe ? 1 : 0,
      effective_without_adoption_count: unsafe ? 0 : 1,
      rejection_reasons: unsafe ? [item.failure_mode ?? "unsafe_label"] : [],
      external_success_proxy: {
        available: true,
        kind: "safety_label",
        value: !unsafe,
        confidence: "strong"
      }
    },
    rejectionReason: {
      available: unsafe,
      reasons: unsafe ? [item.failure_mode ?? "unsafe_label"] : []
    },
    safetyBoundary: {
      available: true,
      expected_safe: !unsafe,
      unsafe_label: unsafe,
      risk_source: item.risk_source ?? "unknown",
      failure_mode: item.failure_mode ?? "unknown",
      harm_type: item.real_world_harm ?? "unknown"
    },
    resolvedProxy: emptyResolvedProxy(),
    issues
  });
}

async function adaptAtBench({ datasetRoot, maxPerDataset, baselineCommit, samplingProfile }) {
  const sources = [
    { group: "ATBench", filePath: path.join(datasetRoot, "atbench", "ATBench", "test.json") },
    { group: "ATBench500", filePath: path.join(datasetRoot, "atbench", "ATBench500", "test.json") }
  ];
  const rows = [];
  for (const source of sources) {
    if (!await fileExists(source.filePath)) continue;
    const sourceRows = await readJson(source.filePath);
    rows.push(...sourceRows.map((item, index) => ({
      id: `${source.group}:${item.id ?? item.conv_id ?? index}`,
      item,
      index,
      group: source.group,
      filePath: source.filePath
    })));
  }
  if (rows.length === 0) {
    return {
      records: [],
      issues: [issue({
        dataset: "atbench",
        severity: "high",
        kind: "dataset_missing",
        message: "ATBench JSON file was not found under the configured dataset root.",
        calibrationTarget: "layer2_data_readiness"
      })]
    };
  }
  const selectedRows = sampleRows(
    rows,
    maxPerDataset,
    samplingProfile,
    ({ item }) => `group:${item.group}:label:${String(item.item.label)}`
  );
  const records = selectedRows
    .map(({ item, index }) => atBenchRecord({
      item: item.item,
      index: item.index ?? index,
      group: item.group,
      filePath: item.filePath,
      datasetRoot,
      baselineCommit
    }));
  return { records, issues: [] };
}

function atBenchCodexRecord({ item, index, filePath, datasetRoot, baselineCommit }) {
  const safe = item.is_safe === true || String(item.is_safe).toLowerCase() === "true";
  const sampleId = `atbench-codex:${item.id ?? index}`;
  const rolloutEvents = Array.isArray(item.codex_rollout) ? item.codex_rollout.length : 0;
  const issues = safe
    ? []
    : [issue({
      dataset: "atbench-codex",
      sampleId,
      severity: "high",
      kind: "codex_safety_failure_requires_shadow_block",
      message: "Unsafe Codex-oriented rollout should map to a boundary record before any action is trusted.",
      calibrationTarget: "safety_boundary_weight"
    })];

  return makeRecord({
    sampleId,
    dataset: "atbench-codex",
    sampleType: "codex_tool_safety",
    sourceRef: {
      path_hint: `${relPath(datasetRoot, filePath)}#${index}`,
      record_hint: String(item.id ?? index)
    },
    format: "json_array",
    parserNotes: [`rollout_event_count=${rolloutEvents}`],
    workOrderSample: makeWorkOrderSample({
      sampleId,
      dataset: "atbench-codex",
      sampleType: "codex_tool_safety",
      title: safe ? "Preserve safe Codex rollout boundary" : "Block unsafe Codex rollout boundary",
      severity: safe ? "P3" : "P1",
      riskLevel: safe ? "low" : "high",
      expectedStrategyFamily: safe ? "conservative" : "boundary",
      baselineCommit,
      sourceRefsCount: 2,
      forbiddenScopeCount: safe ? 3 : 6
    }),
    adoptionLedger: {
      ...emptyAdoptionLedger(),
      rejected_count: safe ? 0 : 1,
      effective_without_adoption_count: safe ? 1 : 0,
      rejection_reasons: safe ? [] : [item.failure_mode ?? item.reason ?? "unsafe_codex_rollout"],
      external_success_proxy: {
        available: true,
        kind: "codex_safety_label",
        value: safe,
        confidence: "strong"
      }
    },
    rejectionReason: {
      available: !safe,
      reasons: safe ? [] : [item.failure_mode ?? item.reason ?? "unsafe_codex_rollout"]
    },
    safetyBoundary: {
      available: true,
      expected_safe: safe,
      unsafe_label: !safe,
      risk_source: item.risk_source ?? "unknown",
      failure_mode: item.failure_mode ?? "unknown",
      harm_type: item.harm_type ?? "unknown"
    },
    resolvedProxy: emptyResolvedProxy(),
    issues
  });
}

async function adaptAtBenchCodex({ datasetRoot, maxPerDataset, baselineCommit, samplingProfile }) {
  const filePath = path.join(datasetRoot, "atbench-codex", "test.json");
  if (!await fileExists(filePath)) {
    return {
      records: [],
      issues: [issue({
        dataset: "atbench-codex",
        severity: "high",
        kind: "dataset_missing",
        message: "ATBench-Codex JSON file was not found under the configured dataset root.",
        calibrationTarget: "layer2_data_readiness"
      })]
    };
  }
  const rows = await readJson(filePath);
  const selectedRows = sampleRows(
    rows,
    maxPerDataset,
    samplingProfile,
    ({ item }) => `safe:${String(item.is_safe)}`
  );
  const records = selectedRows
    .map(({ item, index }) => atBenchCodexRecord({
      item,
      index,
      filePath,
      datasetRoot,
      baselineCommit
    }));
  return { records, issues: [] };
}

function flattenAgentRxInfo(info) {
  const rows = [];
  for (const [failureCategory, cases] of Object.entries(info ?? {})) {
    for (const [caseId, data] of Object.entries(cases ?? {})) {
      rows.push({
        failureCategory,
        caseId,
        step: data.step,
        reason: data.reason,
        name: data.name
      });
    }
  }
  return rows.sort((a, b) => `${a.failureCategory}:${a.caseId}`.localeCompare(`${b.failureCategory}:${b.caseId}`));
}

function agentRxRecord({ item, index, filePath, datasetRoot, baselineCommit }) {
  const sampleId = `agentrx:${item.caseId}`;
  return makeRecord({
    sampleId,
    dataset: "agentrx-github",
    sampleType: "failure_root_cause",
    sourceRef: {
      path_hint: `${relPath(datasetRoot, filePath)}#${index}`,
      record_hint: item.name ?? item.caseId
    },
    format: "json_object",
    parserNotes: [`critical_step=${item.step ?? "unknown"}`],
    workOrderSample: makeWorkOrderSample({
      sampleId,
      dataset: "agentrx-github",
      sampleType: "failure_root_cause",
      title: "Map external failure root cause into rejection ledger",
      severity: item.failureCategory?.includes("RAI") ? "P2" : "P1",
      riskLevel: "high",
      expectedStrategyFamily: "boundary",
      baselineCommit,
      sourceRefsCount: 2,
      acceptanceCriteriaCount: 2,
      forbiddenScopeCount: 5
    }),
    adoptionLedger: {
      ...emptyAdoptionLedger(),
      rejected_count: 1,
      rejection_reasons: [item.reason ?? item.failureCategory],
      safety_regression_after_adoption: item.failureCategory?.includes("RAI") ?? false,
      external_success_proxy: {
        available: true,
        kind: "annotated_failure",
        value: false,
        confidence: "strong"
      }
    },
    rejectionReason: {
      available: true,
      reasons: [item.reason ?? item.failureCategory]
    },
    safetyBoundary: {
      ...emptySafetyBoundary(),
      available: item.failureCategory?.includes("RAI") ?? false,
      expected_safe: false,
      unsafe_label: item.failureCategory?.includes("RAI") ?? false,
      failure_mode: item.failureCategory ?? "unknown"
    },
    resolvedProxy: {
      available: true,
      resolved: false,
      kind: "annotated_failure",
      confidence: "strong"
    },
    issues: [issue({
      dataset: "agentrx-github",
      sampleId,
      severity: "medium",
      kind: "root_cause_must_survive_adapter",
      message: "Annotated failure reason should survive normalization as a rejection reason and calibration signal.",
      calibrationTarget: "rejection_reason_accuracy"
    })]
  });
}

async function adaptAgentRx({ datasetRoot, maxPerDataset, baselineCommit, samplingProfile }) {
  const filePath = path.join(datasetRoot, "agentrx-github", "trajectories", "magentic-one", "trajectories_info.json");
  if (!await fileExists(filePath)) {
    return {
      records: [],
      issues: [issue({
        dataset: "agentrx-github",
        severity: "medium",
        kind: "annotated_failure_index_missing",
        message: "AgentRx GitHub fallback was present, but the annotated failure index was not found.",
        calibrationTarget: "layer2_data_readiness"
      })]
    };
  }
  const rows = flattenAgentRxInfo(await readJson(filePath));
  const selectedRows = sampleRows(
    rows,
    maxPerDataset,
    samplingProfile,
    ({ item }) => item.failureCategory ?? "unknown"
  );
  const records = selectedRows
    .map(({ item, index }) => agentRxRecord({
      item,
      index,
      filePath,
      datasetRoot,
      baselineCommit
    }));
  return { records, issues: [] };
}

function stringifyForSignals(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function classifyCommandPatterns(text) {
  const lower = text.toLowerCase();
  return {
    destructive: /\brm\s+-rf\b|git\s+reset\s+--hard|git\s+checkout\s+--|remove-item\b[\s\S]{0,80}-recurse/i.test(text) ? 1 : 0,
    install_or_dependency: /\b(npm|pnpm|yarn)\s+(install|add)\b|\bpip\s+install\b|\buv\s+add\b/i.test(text) ? 1 : 0,
    git_commit: /\bgit\s+commit\b/i.test(text) ? 1 : 0,
    git_push_or_publish: /\bgit\s+push\b|\bgh\s+pr\s+create\b|\bnpm\s+publish\b/i.test(text) ? 1 : 0,
    network_fetch: /\bcurl\b|\bwget\b|invoke-webrequest/i.test(text) ? 1 : 0,
    test_or_verify: /\b(npm|pnpm|yarn)\s+(run\s+)?(test|build|lint|typecheck)\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b/i.test(lower) ? 1 : 0
  };
}

function addSignalSegment(segments, text, context) {
  if (typeof text === "string" && text.trim()) {
    segments.push({ text, context });
  }
}

function addContentSegments(segments, content, context) {
  if (typeof content === "string") {
    addSignalSegment(segments, content, context);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const item of content) {
    if (typeof item === "string") {
      addSignalSegment(segments, item, context);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    if (item?.type === "tool_use" && typeof item?.input?.command === "string") {
      addSignalSegment(segments, item.input.command, "actual_command");
    }
    if (item?.type === "tool_result") {
      addContentSegments(segments, item.content ?? item.output, "tool_result_output");
      continue;
    }
    addSignalSegment(segments, item.text, context);
    addContentSegments(segments, item.content, context);
    addContentSegments(segments, item.output, context);
  }
}

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toolCommandFromPayload(payload) {
  const args = parseToolArguments(payload?.arguments ?? payload?.input);
  for (const key of ["command", "cmd", "shell_command"]) {
    if (typeof args[key] === "string") return args[key];
  }
  if (["exec", "exec_command", "shell_command", "run_command"].includes(payload?.name)
    && typeof payload?.input === "string") {
    return payload.input;
  }
  return "";
}

function roleBasedContext(role) {
  if (role === "tool") return "tool_result_output";
  return ["user", "assistant", "developer", "system"].includes(role)
    ? "plan_or_instruction"
    : "unknown";
}

function roleTextContext(event) {
  const role = eventRole(event);
  if (roleBasedContext(role) === "plan_or_instruction"
    || event?.type === "user"
    || event?.type === "assistant"
    || event?.type === "gemini") {
    return "plan_or_instruction";
  }
  if ([
    "compacted",
    "file-history-snapshot",
    "progress",
    "queue-operation",
    "session_meta",
    "summary"
  ].includes(event?.type)) {
    return "quoted_or_log_output";
  }
  return "unknown";
}

function addPayloadSegments(segments, event) {
  const payload = event?.payload;
  if (!payload || typeof payload !== "object") return;

  if (event?.type === "turn_context") {
    addSignalSegment(segments, payload.user_instructions, "plan_or_instruction");
    addSignalSegment(segments, payload.developer_instructions, "plan_or_instruction");
    addSignalSegment(segments, payload.summary, "quoted_or_log_output");
    return;
  }

  if (event?.type === "compacted") {
    addSignalSegment(segments, payload.message, "quoted_or_log_output");
    addContentSegments(segments, payload.replacement_history, "quoted_or_log_output");
    return;
  }

  if (event?.type === "session_meta") {
    addSignalSegment(segments, payload.base_instructions, "plan_or_instruction");
    return;
  }

  if (payload.type === "message") {
    addContentSegments(segments, payload.content, roleBasedContext(payload.role));
    return;
  }

  if (payload.type === "function_call" || payload.type === "custom_tool_call") {
    const command = toolCommandFromPayload(payload);
    if (command) {
      addSignalSegment(segments, command, "actual_command");
    } else {
      addContentSegments(segments, payload.input, "plan_or_instruction");
      addSignalSegment(segments, payload.arguments, "plan_or_instruction");
    }
    return;
  }

  if (payload.type === "function_call_output" || payload.type === "custom_tool_call_output") {
    addContentSegments(segments, payload.output, "tool_result_output");
    return;
  }

  if (payload.type === "exec_command_end") {
    addSignalSegment(segments, payload.command, "actual_command");
    addSignalSegment(segments, payload.stdout, "tool_result_output");
    addSignalSegment(segments, payload.stderr, "tool_result_output");
    addSignalSegment(segments, payload.aggregated_output, "tool_result_output");
    addSignalSegment(segments, payload.formatted_output, "tool_result_output");
    return;
  }

  if (payload.type === "patch_apply_end") {
    addSignalSegment(segments, payload.stdout, "tool_result_output");
    addSignalSegment(segments, payload.stderr, "tool_result_output");
    return;
  }

  if (payload.type === "mcp_tool_call_end") {
    addContentSegments(segments, payload.result, "tool_result_output");
    return;
  }

  if (payload.type === "agent_message") {
    addSignalSegment(segments, payload.message, "plan_or_instruction");
    return;
  }

  if (payload.type === "agent_reasoning") {
    addSignalSegment(segments, payload.text, "plan_or_instruction");
    return;
  }

  if (payload.type === "task_complete") {
    addSignalSegment(segments, payload.last_agent_message, "quoted_or_log_output");
    return;
  }

  if (payload.type === "user_message") {
    addSignalSegment(segments, payload.message, "plan_or_instruction");
  }
}

function eventSignalSegments(event) {
  const segments = [];
  if (typeof event?.data?.command === "string") {
    addSignalSegment(
      segments,
      event.data.command,
      event.data.type === "hook_progress" || event.data.hookEvent ? "hook_command" : "actual_command"
    );
  }
  if (event?.data && typeof event.data === "object") {
    addSignalSegment(segments, event.data.output, "tool_result_output");
    addSignalSegment(segments, event.data.fullOutput, "tool_result_output");
    addSignalSegment(segments, event.data.formatted_output, "tool_result_output");
    addSignalSegment(segments, event.data.message, "plan_or_instruction");
    addSignalSegment(segments, event.data.prompt, "plan_or_instruction");
    addContentSegments(segments, event.data.normalizedMessages, "plan_or_instruction");
  }
  if (typeof event?.toolUseResult?.stdout === "string") {
    addSignalSegment(segments, event.toolUseResult.stdout, "tool_result_output");
  }
  if (typeof event?.toolUseResult?.stderr === "string") {
    addSignalSegment(segments, event.toolUseResult.stderr, "tool_result_output");
  }
  if (typeof event?.message?.content === "string") {
    addSignalSegment(segments, event.message.content, roleTextContext(event));
  }
  if (Array.isArray(event?.message?.content)) {
    addContentSegments(segments, event.message.content, roleTextContext(event));
  }
  if (typeof event?.content === "string") {
    addSignalSegment(segments, event.content, roleTextContext(event));
  }
  addPayloadSegments(segments, event);
  return segments.filter((segment) => segment.text);
}

function classifyPushback(text) {
  const lower = text.toLowerCase();
  return {
    correction: /\b(wrong|actually|not what|fix this|doesn't|does not)\b|不对|错了|不是这样|改一下/i.test(lower) ? 1 : 0,
    failure_report: /\b(error|failed|failure|traceback|exception|broken)\b|失败|报错|挂了/i.test(lower) ? 1 : 0,
    rejection: /\b(do not|don't|stop|reject|nope)\b|不要|别|不行|停/i.test(lower) ? 1 : 0,
    takeover: /\b(i'll do|i will do|let me do)\b|我来|我自己来|手动处理/i.test(lower) ? 1 : 0
  };
}

function eventRole(event) {
  return event?.message?.role ?? event?.role ?? event?.type ?? "unknown";
}

function eventText(event) {
  return eventSignalSegments(event).map((segment) => segment.text).join("\n");
}

function parseWholeJsonTranscript(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { events: parsed, parserNotes: ["whole_json_array"] };
  if (Array.isArray(parsed.messages)) return { events: parsed.messages, parserNotes: ["whole_json_messages"] };
  if (Array.isArray(parsed.events)) return { events: parsed.events, parserNotes: ["whole_json_events"] };
  return { events: [parsed], parserNotes: ["whole_json_object"] };
}

function parseJsonlTranscript(raw) {
  const events = [];
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        events.push(parsed);
      } else {
        malformedLineCount += 1;
      }
    } catch {
      malformedLineCount += 1;
    }
  }
  return {
    events,
    parserNotes: malformedLineCount ? [`malformed_line_count=${malformedLineCount}`] : ["jsonl"]
  };
}

async function summarizeTranscript(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const trimmed = raw.trimStart();
  let parsed;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      parsed = parseWholeJsonTranscript(raw);
    } catch {
      parsed = parseJsonlTranscript(raw);
    }
  } else {
    parsed = parseJsonlTranscript(raw);
  }
  const eventTypeCounts = {};
  const commandPatterns = emptyCommandPatterns();
  const commandPatternContexts = emptyCommandPatternContexts();
  const pushback = {
    correction: 0,
    failure_report: 0,
    rejection: 0,
    takeover: 0
  };
  let userCount = 0;
  let assistantCount = 0;
  let toolUseCount = 0;
  let sessionId = path.basename(filePath, path.extname(filePath));

  for (const event of parsed.events) {
    const role = eventRole(event);
    const type = event?.type ?? role;
    eventTypeCounts[type] = (eventTypeCounts[type] ?? 0) + 1;
    if (event.sessionId) sessionId = event.sessionId;
    if (role === "user" || event?.type === "user") userCount += 1;
    if (role === "assistant" || event?.type === "assistant") assistantCount += 1;
    if (event?.message?.content && stringifyForSignals(event.message.content).includes("tool_use")) toolUseCount += 1;
    if (event?.type === "progress" || event?.type === "response_item" || event?.type === "tool_use") toolUseCount += 1;
    const segments = eventSignalSegments(event);
    for (const segment of segments) {
      const patterns = classifyCommandPatterns(segment.text);
      addPatternCounts(commandPatterns, patterns, commandPatternContexts, segment.context);
    }
    if (role === "user" || event?.type === "user") {
      const itemPushback = classifyPushback(segments.map((segment) => segment.text).join("\n"));
      for (const [key, value] of Object.entries(itemPushback)) {
        pushback[key] += value;
      }
    }
  }

  return {
    sessionId,
    eventCount: parsed.events.length,
    userCount,
    assistantCount,
    toolUseCount,
    eventTypeCounts,
    commandPatterns,
    commandPatternContexts,
    pushback,
    parserNotes: parsed.parserNotes
  };
}

function contextCount(commandPatternContexts, pattern, contexts) {
  return contexts.reduce((total, context) => total + (commandPatternContexts?.[pattern]?.[context] ?? 0), 0);
}

function riskKeywordContext(summary) {
  const raw = summary.commandPatterns.destructive + summary.commandPatterns.git_push_or_publish;
  const actual = contextCount(summary.commandPatternContexts, "destructive", ["actual_command"])
    + contextCount(summary.commandPatternContexts, "git_push_or_publish", ["actual_command"]);
  const nonActual = raw - actual;
  const unclassified = contextCount(summary.commandPatternContexts, "destructive", ["unknown"])
    + contextCount(summary.commandPatternContexts, "git_push_or_publish", ["unknown"]);
  let classification = "none";
  if (actual > 0 && nonActual > 0) classification = "mixed";
  else if (actual > 0) classification = "actual_command";
  else if (raw > 0) classification = "non_actual_or_log";
  return {
    raw,
    actual,
    non_actual: nonActual,
    unclassified,
    classification,
    likely_noise: raw > 0 && actual === 0
  };
}

function compactCommandContexts(commandPatternContexts) {
  const parts = [];
  for (const pattern of ["destructive", "git_push_or_publish", "git_commit", "test_or_verify"]) {
    const contexts = commandPatternContexts[pattern] ?? {};
    for (const [context, count] of Object.entries(contexts)) {
      if (count > 0) parts.push(`${pattern}.${context}:${count}`);
    }
  }
  return parts.join("|") || "none";
}

function parserNoteValue(record, key) {
  const prefix = `${key}=`;
  return record.normalization.parser_notes
    .find((note) => note.startsWith(prefix))
    ?.slice(prefix.length);
}

function parserNoteNumber(record, key) {
  const value = Number.parseInt(parserNoteValue(record, key) ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function sweChatBuckets(summary) {
  const pushbackTotal = sum(Object.values(summary.pushback));
  const riskContext = riskKeywordContext(summary);
  const buckets = [];
  if (riskContext.classification === "actual_command") buckets.push("actual_risk_command");
  if (riskContext.classification === "mixed") buckets.push("mixed_risk_keyword_context");
  if (riskContext.classification === "non_actual_or_log") buckets.push("risk_keyword_noise");
  if (summary.commandPatterns.destructive > 0) buckets.push("destructive_keyword");
  if (summary.commandPatterns.git_push_or_publish > 0) buckets.push("publish_keyword");
  if (pushbackTotal > 0) buckets.push("user_pushback");
  if (summary.commandPatterns.git_commit > 0 && summary.commandPatterns.test_or_verify > 0) {
    buckets.push("adopted_and_verified");
  } else if (summary.commandPatterns.git_commit > 0) {
    buckets.push("adopted_only");
  } else if (summary.commandPatterns.test_or_verify > 0) {
    buckets.push("verified_without_commit");
  }
  if (!summary.commandPatterns.git_commit && !summary.commandPatterns.test_or_verify) {
    buckets.push("weak_or_missing_adoption_proxy");
  }
  return buckets.length ? buckets : ["quiet_session"];
}

function sweChatRecord({ summary, filePath, datasetRoot, baselineCommit }) {
  const sampleId = `swe-chat:${summary.sessionId}`;
  const sampleBuckets = sweChatBuckets(summary);
  const riskContext = riskKeywordContext(summary);
  const pushbackTotal = sum(Object.values(summary.pushback));
  const adopted = summary.commandPatterns.git_commit > 0;
  const verified = summary.commandPatterns.test_or_verify > 0;
  const safetyRegression = riskContext.actual > 0;
  const rejectionReasons = [
    summary.pushback.correction ? "user_correction" : null,
    summary.pushback.failure_report ? "failure_report" : null,
    summary.pushback.rejection ? "user_rejection" : null,
    summary.pushback.takeover ? "user_takeover" : null
  ].filter(Boolean);
  const issues = [];
  if (!adopted && !verified) {
    issues.push(issue({
      dataset: "swe-chat",
      sampleId,
      severity: "medium",
      kind: "adoption_proxy_weak_or_missing",
      message: "Transcript sample has no local git-commit or test/verify command proxy; adoption should stay weak.",
      calibrationTarget: "commit_survival_weight"
    }));
  }
  if (pushbackTotal > 0) {
    issues.push(issue({
      dataset: "swe-chat",
      sampleId,
      severity: "medium",
      kind: "user_pushback_needs_rejection_mapping",
      message: "User pushback appears in transcript signals and should be mapped before scoring adoption.",
      calibrationTarget: "rejection_reason_accuracy"
    }));
  }
  if (summary.commandPatterns.git_push_or_publish > 0 && contextCount(summary.commandPatternContexts, "git_push_or_publish", ["actual_command"]) > 0) {
    issues.push(issue({
      dataset: "swe-chat",
      sampleId,
      severity: "high",
      kind: "publish_command_context_requires_classification",
      message: "Publish-like commands appear in transcript signals; context must be classified before treating them as unsafe execution.",
      calibrationTarget: "safety_regression_penalty"
    }));
  }
  if (summary.commandPatterns.destructive > 0 && contextCount(summary.commandPatternContexts, "destructive", ["actual_command"]) > 0) {
    issues.push(issue({
      dataset: "swe-chat",
      sampleId,
      severity: "high",
      kind: "destructive_command_context_requires_classification",
      message: "Destructive command patterns appear in transcript signals; adapter must not use raw keyword hits as final safety proof.",
      calibrationTarget: "keyword_risk_context_classifier"
    }));
  }
  if (riskContext.likely_noise) {
    issues.push(issue({
      dataset: "swe-chat",
      sampleId,
      severity: "medium",
      kind: "keyword_risk_noise_requires_filter",
      message: "Risk keywords appear only in non-action contexts such as hooks, logs, tool output, or plans; safety scoring should filter this before penalizing.",
      calibrationTarget: "keyword_risk_context_classifier"
    }));
  }

  return makeRecord({
    sampleId,
    dataset: "swe-chat",
    sampleType: "real_collaboration_session",
    sourceRef: {
      path_hint: relPath(datasetRoot, filePath),
      record_hint: summary.sessionId
    },
    format: filePath.endsWith(".jsonl") ? "jsonl_or_whole_json" : "json",
    parserNotes: [
      ...summary.parserNotes,
      `sample_buckets=${sampleBuckets.join("+")}`,
      `risk_keyword_context=${riskContext.classification}`,
      `raw_risk_keyword_count=${riskContext.raw}`,
      `actual_risk_keyword_count=${riskContext.actual}`,
      `non_actual_risk_keyword_count=${riskContext.non_actual}`,
      `command_contexts=${compactCommandContexts(summary.commandPatternContexts)}`,
      `event_count=${summary.eventCount}`,
      `assistant_count=${summary.assistantCount}`,
      `tool_use_count=${summary.toolUseCount}`
    ],
    workOrderSample: makeWorkOrderSample({
      sampleId,
      dataset: "swe-chat",
      sampleType: "real_collaboration_session",
      title: "Normalize real human-agent collaboration adoption proxy",
      severity: safetyRegression ? "P1" : pushbackTotal ? "P2" : "P3",
      riskLevel: safetyRegression ? "high" : pushbackTotal ? "medium" : "low",
      expectedStrategyFamily: safetyRegression ? "boundary" : "replay_or_compact",
      baselineCommit,
      sourceRefsCount: 2,
      acceptanceCriteriaCount: verified ? 2 : 1,
      forbiddenScopeCount: safetyRegression ? 6 : 4
    }),
    adoptionLedger: {
      ...emptyAdoptionLedger(),
      suggestion_count: summary.assistantCount + summary.toolUseCount,
      adopted_count: adopted ? 1 : 0,
      rejected_count: pushbackTotal,
      effective_without_adoption_count: !adopted && verified ? 1 : 0,
      score_delta_after_adoption: null,
      safety_regression_after_adoption: safetyRegression,
      rejection_reasons: rejectionReasons,
      external_success_proxy: {
        available: true,
        kind: "transcript_command_proxy",
        value: adopted || verified,
        confidence: adopted && verified ? "medium" : "weak"
      },
      user_pushback_proxy: {
        available: pushbackTotal > 0,
        correction_count: summary.pushback.correction,
        failure_report_count: summary.pushback.failure_report,
        rejection_count: summary.pushback.rejection,
        takeover_count: summary.pushback.takeover
      }
    },
    rejectionReason: {
      available: rejectionReasons.length > 0,
      reasons: rejectionReasons
    },
    safetyBoundary: {
      ...emptySafetyBoundary(),
      available: safetyRegression,
      expected_safe: !safetyRegression,
      unsafe_label: safetyRegression,
      risk_source: summary.commandPatterns.git_push_or_publish ? "publish_command_proxy" : "command_pattern_proxy",
      failure_mode: summary.commandPatterns.destructive ? "destructive_command_pattern" : "publish_or_public_effect_pattern",
      harm_type: "workspace_or_public_effect"
    },
    resolvedProxy: {
      available: adopted || verified,
      resolved: adopted || verified,
      kind: adopted ? "git_commit_command_proxy" : verified ? "test_or_verify_command_proxy" : "not_available",
      confidence: adopted && verified ? "medium" : adopted || verified ? "weak" : "none"
    },
    issues
  });
}

function candidateTranscriptEntries(entries, scanLimit, maxTranscriptBytes) {
  const normalized = entries
    .map((entry) => ({
      rel: typeof entry === "string" ? entry : entry.path,
      size: typeof entry === "string" ? 0 : entry.size ?? 0
    }))
    .filter((entry) => entry.rel);
  const bounded = normalized.filter((entry) => !entry.size || entry.size <= maxTranscriptBytes);
  const source = bounded.length >= scanLimit ? bounded : normalized;
  return evenlySpaced(
    source.sort((a, b) => a.rel.localeCompare(b.rel)),
    Math.max(scanLimit, 0)
  );
}

async function adaptSweChat({
  datasetRoot,
  maxPerDataset,
  baselineCommit,
  samplingProfile,
  sweChatScanLimit,
  sweChatMaxTranscriptBytes,
  sweRebenchSidecarPath
}) {
  const listPath = path.join(datasetRoot, "swe-chat", "transcripts-file-list.json");
  const transcriptRoot = path.join(datasetRoot, "swe-chat");
  if (!await fileExists(listPath)) {
    return {
      records: [],
      issues: [issue({
        dataset: "swe-chat",
        severity: "high",
        kind: "transcript_index_missing",
        message: "SWE-chat transcript file list was not found under the configured dataset root.",
        calibrationTarget: "layer2_data_readiness"
      })]
    };
  }
  const manifest = await readJson(listPath);
  const entries = Array.isArray(manifest) ? manifest : manifest.files ?? [];
  const scanLimit = samplingProfile === "stratified"
    ? Math.max(maxPerDataset * 6, sweChatScanLimit)
    : maxPerDataset;
  const candidates = samplingProfile === "stratified"
    ? candidateTranscriptEntries(entries, scanLimit, sweChatMaxTranscriptBytes)
    : entries
      .map((entry) => ({
        rel: typeof entry === "string" ? entry : entry.path,
        size: typeof entry === "string" ? 0 : entry.size ?? 0
      }))
      .filter((entry) => entry.rel)
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .slice(0, maxPerDataset);
  const records = [];
  const issues = [];
  for (const entry of candidates) {
    const filePath = path.join(transcriptRoot, entry.rel);
    if (!await fileExists(filePath)) {
      issues.push(issue({
        dataset: "swe-chat",
        sampleId: entry.rel,
        severity: "medium",
        kind: "transcript_file_missing",
        message: "SWE-chat manifest referenced a transcript file that is not present locally.",
        calibrationTarget: "layer2_data_readiness"
      }));
      continue;
    }
    const summary = await summarizeTranscript(filePath);
    records.push(sweChatRecord({ summary, filePath, datasetRoot, baselineCommit }));
  }
  const selectedRecords = samplingProfile === "stratified"
    ? selectStratified(
      records.map((record) => ({
        ...record,
        stableKey: record.sample_id,
        primaryBucket: record.normalization.parser_notes
          .find((note) => note.startsWith("sample_buckets="))
          ?.replace("sample_buckets=", "")
          ?.split("+")[0] ?? "unknown"
      })),
      maxPerDataset,
      (record) => record.primaryBucket
    ).map(({ stableKey, primaryBucket, ...record }) => record)
    : records;
  return { records: selectedRecords, issues };
}

function sidecarCommandCounts(item) {
  const command = item.command_counts ?? item.command_summary ?? item.risk_keywords ?? {};
  return {
    raw: coerceNumber(firstDefined(
      item.raw_risk_keyword_count,
      command.raw_risk_keyword_count,
      command.raw
    )),
    actual: coerceNumber(firstDefined(
      item.actual_risk_keyword_count,
      command.actual_risk_keyword_count,
      command.actual_command,
      command.actual
    )),
    nonActual: coerceNumber(firstDefined(
      item.non_actual_risk_keyword_count,
      command.non_actual_risk_keyword_count,
      command.non_actual,
      command.log_or_plan
    ))
  };
}

function sidecarPushback(item) {
  const pushback = item.user_pushback_proxy ?? item.pushback ?? {};
  return {
    correction: coerceNumber(firstDefined(item.correction_count, pushback.correction_count, pushback.correction)),
    failure_report: coerceNumber(firstDefined(item.failure_report_count, pushback.failure_report_count, pushback.failure_report)),
    rejection: coerceNumber(firstDefined(item.rejection_count, pushback.rejection_count, pushback.rejection)),
    takeover: coerceNumber(firstDefined(item.takeover_count, pushback.takeover_count, pushback.takeover))
  };
}

function sidecarResolved(item) {
  const resolved = firstDefined(
    item.resolved,
    item.tests_passed,
    item.patch_passed,
    item.success,
    item.outcome
  );
  const value = coerceBoolean(resolved, null);
  return {
    available: value !== null,
    value
  };
}

function sidecarConfidence(item, resolvedAvailable) {
  const value = item.confidence ?? item.external_success_confidence;
  if (["none", "weak", "medium", "strong"].includes(value)) return value;
  return resolvedAvailable ? "medium" : "weak";
}

function sidecarBuckets({ counts, pushback, resolved, confidence }) {
  const buckets = [];
  if (counts.actual > 0) buckets.push("actual_risk_command");
  if (counts.nonActual > 0 && counts.actual === 0) buckets.push("risk_keyword_noise");
  if (pushback.correction + pushback.failure_report + pushback.rejection + pushback.takeover > 0) buckets.push("user_pushback");
  if (resolved.available && resolved.value === true) buckets.push("resolved_true");
  if (resolved.available && resolved.value === false) buckets.push("resolved_false");
  if (confidence === "weak" && !resolved.available) buckets.push("weak_proxy");
  return buckets.length ? buckets : ["neutral_coding_replay"];
}

function sweRebenchSidecarRecord({ item, index, sidecarPath, datasetRoot, baselineCommit }) {
  const sampleCore = String(item.sample_id ?? item.instance_id ?? item.task_id ?? item.id ?? `row-${index}`);
  const sampleId = `swe-rebench-openhands:${sampleCore}`;
  const counts = sidecarCommandCounts(item);
  const rawRisk = counts.raw || counts.actual + counts.nonActual;
  const pushback = sidecarPushback(item);
  const pushbackTotal = pushback.correction + pushback.failure_report + pushback.rejection + pushback.takeover;
  const resolved = sidecarResolved(item);
  const confidence = sidecarConfidence(item, resolved.available);
  const adopted = coerceNumber(firstDefined(
    item.adopted_count,
    item.patch_adopted_count,
    item.patch_accepted,
    resolved.available && resolved.value === true ? 1 : 0
  ));
  const rejected = coerceNumber(firstDefined(item.rejected_count, item.patch_rejected_count, pushback.rejection));
  const suggestionCount = Math.max(
    adopted + rejected,
    coerceNumber(firstDefined(item.suggestion_count, item.action_count, item.tool_call_count, 1))
  );
  const buckets = sidecarBuckets({ counts, pushback, resolved, confidence });
  const riskContext = counts.actual > 0
    ? "actual_command"
    : counts.nonActual > 0
      ? "non_actual_or_log"
      : "none";
  const commandContexts = item.command_contexts
    ?? (counts.actual > 0
      ? `swe_rebench.actual_command:${counts.actual}`
      : counts.nonActual > 0
        ? `swe_rebench.tool_result_output:${counts.nonActual}`
        : "none");
  const issues = [];
  if (counts.actual > 0) {
    issues.push(issue({
      dataset: "swe-rebench-openhands",
      sampleId,
      severity: "medium",
      kind: "swe_rebench_actual_command_context_requires_classification",
      message: "SWE-rebench sanitized sidecar marks command-risk keywords in actual command context.",
      calibrationTarget: "safety_regression_penalty"
    }));
  }
  if (counts.nonActual > 0 && counts.actual === 0) {
    issues.push(issue({
      dataset: "swe-rebench-openhands",
      sampleId,
      severity: "medium",
      kind: "keyword_risk_noise_requires_filter",
      message: "SWE-rebench sanitized sidecar marks command-risk keywords only in non-action context.",
      calibrationTarget: "keyword_risk_context_classifier"
    }));
  }
  if (pushbackTotal > 0) {
    issues.push(issue({
      dataset: "swe-rebench-openhands",
      sampleId,
      severity: "medium",
      kind: "user_pushback_needs_rejection_mapping",
      message: "SWE-rebench sanitized sidecar includes user pushback that must be mapped before adoption scoring.",
      calibrationTarget: "rejection_reason_accuracy"
    }));
  }
  if (confidence === "weak" && !resolved.available) {
    issues.push(issue({
      dataset: "swe-rebench-openhands",
      sampleId,
      severity: "low",
      kind: "adoption_proxy_weak_or_missing",
      message: "SWE-rebench sanitized sidecar has weak adoption evidence without resolved outcome.",
      calibrationTarget: "commit_survival_weight"
    }));
  }

  return makeRecord({
    sampleId,
    dataset: "swe-rebench-openhands",
    sampleType: "coding_replay_trajectory",
    sourceRef: {
      path_hint: relPath(datasetRoot, sidecarPath),
      record_hint: sampleCore
    },
    format: "sanitized_jsonl_sidecar",
    parserNotes: [
      "sanitized_sidecar",
      `sample_buckets=${buckets.join("+")}`,
      `risk_keyword_context=${riskContext}`,
      `raw_risk_keyword_count=${rawRisk}`,
      `actual_risk_keyword_count=${counts.actual}`,
      `non_actual_risk_keyword_count=${counts.nonActual}`,
      `command_contexts=${commandContexts}`
    ],
    workOrderSample: makeWorkOrderSample({
      sampleId,
      dataset: "swe-rebench-openhands",
      sampleType: "coding_replay_trajectory",
      title: "Normalize SWE-rebench sanitized coding replay",
      severity: counts.actual > 0 ? "P2" : "P3",
      riskLevel: counts.actual > 0 ? "medium" : "low",
      expectedStrategyFamily: counts.actual > 0 ? "boundary" : "replay_or_compact",
      baselineCommit,
      sourceRefsCount: 1,
      acceptanceCriteriaCount: resolved.available ? 2 : 1,
      forbiddenScopeCount: 5
    }),
    adoptionLedger: {
      suggestion_count: suggestionCount,
      adopted_count: adopted,
      rejected_count: rejected,
      effective_without_adoption_count: adopted ? 0 : resolved.available && resolved.value === true ? 1 : 0,
      score_delta_after_adoption: null,
      safety_regression_after_adoption: counts.actual > 0 && coerceBoolean(item.safety_regression_after_adoption, false),
      rejection_reasons: pushbackTotal > 0 ? ["user_pushback_proxy"] : rejected ? ["sidecar_rejection_proxy"] : [],
      external_success_proxy: {
        available: resolved.available || confidence !== "none",
        kind: resolved.available ? "swe_rebench_resolved_sidecar" : "swe_rebench_sanitized_sidecar",
        value: resolved.available ? resolved.value : null,
        confidence
      },
      user_pushback_proxy: {
        available: pushbackTotal > 0,
        correction_count: pushback.correction,
        failure_report_count: pushback.failure_report,
        rejection_count: pushback.rejection,
        takeover_count: pushback.takeover
      }
    },
    rejectionReason: {
      available: pushbackTotal > 0 || rejected > 0,
      reasons: [
        pushback.correction ? "user_correction" : null,
        pushback.failure_report ? "failure_report" : null,
        pushback.rejection ? "user_rejection" : null,
        pushback.takeover ? "user_takeover" : null,
        rejected && !pushbackTotal ? "sidecar_rejection_proxy" : null
      ].filter(Boolean)
    },
    safetyBoundary: {
      available: counts.actual > 0 || coerceBoolean(item.safety_boundary_available, false) === true,
      expected_safe: coerceBoolean(firstDefined(item.expected_safe, item.unsafe_label === true ? false : true), true),
      unsafe_label: coerceBoolean(item.unsafe_label, false),
      risk_source: counts.actual > 0 ? "swe_rebench_command_proxy" : "swe_rebench_sidecar",
      failure_mode: counts.actual > 0 ? "actual_command_pattern" : "none",
      harm_type: "workspace_or_public_effect"
    },
    resolvedProxy: {
      available: resolved.available,
      resolved: resolved.value,
      kind: resolved.available ? "swe_rebench_resolved_sidecar" : "not_available",
      confidence: resolved.available ? confidence : "none"
    },
    issues
  });
}

async function resolveSweRebenchSidecar({ datasetRoot, sweRebenchSidecarPath }) {
  if (sweRebenchSidecarPath) {
    const candidate = path.isAbsolute(sweRebenchSidecarPath)
      ? sweRebenchSidecarPath
      : path.join(datasetRoot, "swe-rebench-openhands", sweRebenchSidecarPath);
    return await fileExists(candidate) ? candidate : null;
  }
  for (const name of SWE_REBENCH_SIDECAR_NAMES) {
    const candidate = path.join(datasetRoot, "swe-rebench-openhands", name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

async function adaptSweRebench({
  datasetRoot,
  maxPerDataset,
  baselineCommit,
  samplingProfile,
  sweRebenchSidecarPath
}) {
  const parquetPath = path.join(datasetRoot, "swe-rebench-openhands", "trajectories.parquet");
  const sidecarPath = await resolveSweRebenchSidecar({ datasetRoot, sweRebenchSidecarPath });
  if (sidecarPath) {
    try {
      const rows = await readJsonl(sidecarPath);
      const selected = sampleRows(
        rows,
        maxPerDataset,
        samplingProfile,
        ({ item }) => {
          const counts = sidecarCommandCounts(item);
          if (counts.actual > 0) return "actual_risk_command";
          if (counts.nonActual > 0) return "risk_keyword_noise";
          const resolved = sidecarResolved(item);
          if (resolved.available && resolved.value === true) return "resolved_true";
          if (resolved.available && resolved.value === false) return "resolved_false";
          return "neutral";
        }
      );
      return {
        records: selected.map(({ item, index }) => sweRebenchSidecarRecord({
          item,
          index,
          sidecarPath,
          datasetRoot,
          baselineCommit
        })),
        issues: []
      };
    } catch (error) {
      return {
        records: [],
        issues: [issue({
          dataset: "swe-rebench-openhands",
          severity: "high",
          kind: "sanitized_sidecar_read_failed",
          message: `SWE-rebench sanitized JSONL sidecar could not be read: ${error.message}`,
          calibrationTarget: "layer2_adapter_coverage"
        })]
      };
    }
  }
  if (!await fileExists(parquetPath)) {
    return {
      records: [],
      issues: [issue({
        dataset: "swe-rebench-openhands",
        severity: "high",
        kind: "dataset_missing",
        message: "SWE-rebench parquet file was not found under the configured dataset root.",
        calibrationTarget: "layer2_data_readiness"
      })]
    };
  }
  return {
    records: [],
    issues: [issue({
      dataset: "swe-rebench-openhands",
      severity: "medium",
      kind: "parquet_reader_not_available",
      message: "Layer 1 counted SWE-rebench parquet rows, but this Node adapter has no local parquet reader or sanitized JSONL sidecar yet, so no per-sample Layer 2 records were emitted for this dataset.",
      calibrationTarget: "layer2_adapter_coverage"
    })]
  };
}

async function resolveGitBaseline(repoRoot) {
  try {
    const [{ stdout: headStdout }, { stdout: statusStdout }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot })
    ]);
    return {
      commit: headStdout.trim(),
      dirty: statusStdout.trim().length > 0
    };
  } catch {
    return {
      commit: "unknown",
      dirty: true
    };
  }
}

async function adaptOneDataset({
  dataset,
  datasetRoot,
  maxPerDataset,
  baselineCommit,
  samplingProfile,
  sweChatScanLimit,
  sweChatMaxTranscriptBytes,
  sweRebenchSidecarPath
}) {
  if (dataset === "atbench") {
    return adaptAtBench({ datasetRoot, maxPerDataset, baselineCommit, samplingProfile });
  }
  if (dataset === "atbench-codex") {
    return adaptAtBenchCodex({ datasetRoot, maxPerDataset, baselineCommit, samplingProfile });
  }
  if (dataset === "agentrx-github") {
    return adaptAgentRx({ datasetRoot, maxPerDataset, baselineCommit, samplingProfile });
  }
  if (dataset === "swe-chat") {
    return adaptSweChat({
      datasetRoot,
      maxPerDataset,
      baselineCommit,
      samplingProfile,
      sweChatScanLimit,
      sweChatMaxTranscriptBytes
    });
  }
  if (dataset === "swe-rebench-openhands") {
    return adaptSweRebench({
      datasetRoot,
      maxPerDataset,
      baselineCommit,
      samplingProfile,
      sweRebenchSidecarPath
    });
  }
  return {
    records: [],
    issues: [issue({
      dataset,
      severity: "medium",
      kind: "unknown_dataset",
      message: "Requested dataset is not supported by the external trajectory adapter.",
      calibrationTarget: "layer2_adapter_coverage"
    })]
  };
}

function summarize(records, issues) {
  const ledgers = records.map((record) => record.adoption_ledger_sample);
  const safetyBoundaryRecords = records.filter((record) => record.safety_boundary_sample.available);
  const resolvedProxyRecords = records.filter((record) => record.resolved_proxy_sample.available);
  const recordsWithIssues = records.filter((record) => record.issues.length > 0);
  const recordsWithPushback = records.filter((record) => record.adoption_ledger_sample.user_pushback_proxy.available);
  const strongProxyRecords = records.filter((record) => record.adoption_ledger_sample.external_success_proxy.confidence === "strong");
  const mediumProxyRecords = records.filter((record) => record.adoption_ledger_sample.external_success_proxy.confidence === "medium");
  const weakProxyRecords = records.filter((record) => record.adoption_ledger_sample.external_success_proxy.confidence === "weak");
  const sweChatRecords = records.filter((record) => record.dataset === "swe-chat");
  const rawRiskKeywordRecords = sweChatRecords.filter((record) => parserNoteNumber(record, "raw_risk_keyword_count") > 0);
  const actualRiskKeywordRecords = sweChatRecords.filter((record) => parserNoteNumber(record, "actual_risk_keyword_count") > 0);
  const nonActualRiskKeywordRecords = sweChatRecords.filter((record) => parserNoteNumber(record, "non_actual_risk_keyword_count") > 0);
  const likelyNoiseKeywordRecords = sweChatRecords.filter((record) => parserNoteValue(record, "risk_keyword_context") === "non_actual_or_log");
  const issueByTarget = countBy(issues, (item) => item.calibration_target);
  const weightedIssuesByTarget = issues.reduce((counts, item) => {
    const weight = item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 1;
    counts[item.calibration_target] = (counts[item.calibration_target] ?? 0) + weight;
    return counts;
  }, {});
  const blockedDatasetCount = new Set(
    issues
      .filter((item) => ["dataset_missing", "parquet_reader_not_available", "transcript_index_missing"].includes(item.kind))
      .map((item) => item.dataset)
  ).size;
  return {
    sample_count: records.length,
    by_dataset: countBy(records, (record) => record.dataset),
    by_sample_type: countBy(records, (record) => record.sample_type),
    issue_count: issues.length,
    blocked_dataset_count: blockedDatasetCount,
    safety_boundary_count: safetyBoundaryRecords.length,
    resolved_proxy_count: resolvedProxyRecords.length,
    by_issue_kind: sortedObject(countBy(issues, (item) => item.kind)),
    by_calibration_target: sortedObject(issueByTarget),
    adoption_ledger: {
      suggestion_count: sum(ledgers, (ledger) => ledger.suggestion_count),
      adopted_count: sum(ledgers, (ledger) => ledger.adopted_count),
      rejected_count: sum(ledgers, (ledger) => ledger.rejected_count),
      effective_without_adoption_count: sum(ledgers, (ledger) => ledger.effective_without_adoption_count),
      safety_regression_after_adoption_count: ledgers.filter((ledger) => ledger.safety_regression_after_adoption).length
    },
    user_pushback_proxy_count: sum(ledgers, (ledger) => {
      const proxy = ledger.user_pushback_proxy;
      return proxy.correction_count
        + proxy.failure_report_count
        + proxy.rejection_count
        + proxy.takeover_count;
    }),
    rates: {
      issue_record_rate: roundRate(recordsWithIssues.length, records.length),
      safety_boundary_rate: roundRate(safetyBoundaryRecords.length, records.length),
      resolved_proxy_rate: roundRate(resolvedProxyRecords.length, records.length),
      user_pushback_record_rate: roundRate(recordsWithPushback.length, records.length),
      strong_external_proxy_rate: roundRate(strongProxyRecords.length, records.length),
      medium_external_proxy_rate: roundRate(mediumProxyRecords.length, records.length),
      weak_external_proxy_rate: roundRate(weakProxyRecords.length, records.length)
    },
    swe_chat_context: {
      sample_count: sweChatRecords.length,
      raw_risk_keyword_records: rawRiskKeywordRecords.length,
      actual_risk_keyword_records: actualRiskKeywordRecords.length,
      non_actual_risk_keyword_records: nonActualRiskKeywordRecords.length,
      likely_noise_keyword_records: likelyNoiseKeywordRecords.length,
      non_actual_risk_keyword_rate: roundRate(nonActualRiskKeywordRecords.length, rawRiskKeywordRecords.length),
      likely_noise_keyword_rate: roundRate(likelyNoiseKeywordRecords.length, rawRiskKeywordRecords.length)
    },
    quant_quality: {
      evidence_strength: {
        strong_records: strongProxyRecords.length,
        medium_records: mediumProxyRecords.length,
        weak_records: weakProxyRecords.length,
        none_records: records.length - strongProxyRecords.length - mediumProxyRecords.length - weakProxyRecords.length
      },
      noise: {
        issue_records: recordsWithIssues.length,
        clean_records: records.length - recordsWithIssues.length,
        keyword_risk_noise_records: likelyNoiseKeywordRecords.length,
        keyword_risk_actual_records: actualRiskKeywordRecords.length,
        weak_proxy_records: weakProxyRecords.length
      },
      calibration_priority: Object.entries(issueByTarget)
        .map(([target, count]) => {
          const weighted = weightedIssuesByTarget[target] ?? count;
          const priorityScore = roundRate(weighted, Math.max(records.length * 3, 1));
          return {
            calibration_target: target,
            issue_count: count,
            weighted_issue_score: weighted,
            priority_score: priorityScore,
            priority: priorityScore >= 0.15 ? "high" : priorityScore >= 0.07 ? "medium" : "low",
            recommendation: recommendationForCalibrationTarget(target)
          };
        })
        .sort((a, b) => b.weighted_issue_score - a.weighted_issue_score || a.calibration_target.localeCompare(b.calibration_target))
    }
  };
}

function recommendationForCalibrationTarget(target) {
  if (target === "rejection_reason_accuracy") {
    return "Split user correction, failure report, rejection, and takeover before using pushback as a negative adoption signal.";
  }
  if (target === "safety_regression_penalty") {
    return "Separate actual commands from plans, hooks, and tool output before penalizing safety.";
  }
  if (target === "safety_boundary_weight") {
    return "Keep safety labels strong, but compare against resolved/adoption proxies before changing winner logic.";
  }
  if (target === "keyword_risk_context_classifier") {
    return "Treat raw command keywords as context-classification inputs, not final safety evidence.";
  }
  if (target === "commit_survival_weight") {
    return "Down-rank commit survival when test/verify and user-acceptance proxies are missing.";
  }
  if (target === "layer2_adapter_coverage") {
    return "Add a SWE-rebench parquet reader or safe JSONL sidecar before claiming broad benchmark coverage.";
  }
  return "Inspect the issue cluster before changing calibration weights.";
}

export async function runExternalTrajectoryAdaptation({
  repoRoot = process.cwd(),
  datasetRoot = process.env.MISA_EXTERNAL_TRAJECTORY_ROOT ?? DEFAULT_EXTERNAL_TRAJECTORY_ROOT,
  datasets = DEFAULT_EXTERNAL_TRAJECTORY_DATASETS,
  maxPerDataset = 2,
  targetSampleCount,
  samplingProfile = DEFAULT_EXTERNAL_TRAJECTORY_SAMPLING_PROFILE,
  sweChatScanLimit = DEFAULT_SWE_CHAT_SCAN_LIMIT,
  sweChatMaxTranscriptBytes = DEFAULT_SWE_CHAT_MAX_TRANSCRIPT_BYTES,
  sweRebenchSidecarPath,
  baselineCommit,
  baselineDirty,
  now = DEFAULT_NOW
} = {}) {
  const normalizedSamplingProfile = normalizeSamplingProfile(samplingProfile);
  const budgets = perDatasetBudgets({
    datasets,
    maxPerDataset,
    targetSampleCount
  });
  const gitBaseline = baselineCommit
    ? { commit: baselineCommit, dirty: baselineDirty ?? false }
    : await resolveGitBaseline(repoRoot);
  const records = [];
  const issues = [];
  for (const dataset of datasets) {
    const result = await adaptOneDataset({
      dataset,
      datasetRoot,
      maxPerDataset: Math.max(0, budgets[dataset] ?? maxPerDataset),
      baselineCommit: gitBaseline.commit,
      samplingProfile: normalizedSamplingProfile,
      sweChatScanLimit,
      sweChatMaxTranscriptBytes,
      sweRebenchSidecarPath
    });
    records.push(...result.records);
    issues.push(...result.issues);
    for (const record of result.records) {
      issues.push(...record.issues);
    }
  }
  const summary = summarize(records, issues);

  return {
    schema_version: "misa.external_trajectory_adaptation.v1",
    mode: "external-trajectory-adaptation",
    ok: records.length > 0,
    created_at: asIsoDate(now),
    dataset_root: datasetRoot,
    baseline: {
      commit: gitBaseline.commit,
      dirty: gitBaseline.dirty,
      policy: "fixed_current_version",
      note: "Baseline logic is fixed for this batch; issues are accumulated for later calibration instead of being patched sample-by-sample."
    },
    batch: {
      max_per_dataset: Math.max(0, maxPerDataset),
      sampling_profile: normalizedSamplingProfile,
      target_sample_count: targetSampleCount ?? null,
      swe_chat_scan_limit: sweChatScanLimit,
      swe_chat_max_transcript_bytes: sweChatMaxTranscriptBytes,
      per_dataset_budget: budgets,
      requested_datasets: datasets,
      selected_dataset_counts: countBy(records, (record) => record.dataset),
      sample_count: records.length,
      issue_count: issues.length
    },
    summary,
    records,
    issues,
    safety: {
      shadow_only: true,
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      persists_raw_external_data: false,
      calls_llm: false,
      calls_external_api: false,
      touches_vps: false,
      pushes_to_github: false,
      changes_winner_authority: false
    },
    warnings: [
      "This adapter normalizes local external trajectories into shadow records only; it does not execute or approve work orders.",
      "Raw external transcript or benchmark content is not persisted in the repo output.",
      "Commit survival, command patterns, and pushback are proxy signals only; calibration must happen after a batch-level review.",
      "SWE-rebench parquet needs a local parquet reader or a public-safe JSONL sidecar before true one-row-one-record Layer 2 coverage."
    ]
  };
}

function renderMarkdown(result) {
  const lines = [
    "# External Trajectory Adaptation",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- baseline_commit: ${result.baseline.commit}`,
    `- baseline_dirty: ${result.baseline.dirty}`,
    `- dataset_root: ${result.dataset_root}`,
    `- sampling_profile: ${result.batch.sampling_profile}`,
    `- target_sample_count: ${result.batch.target_sample_count ?? "none"}`,
    `- sample_count: ${result.summary.sample_count}`,
    `- issue_count: ${result.summary.issue_count}`,
    `- blocked_dataset_count: ${result.summary.blocked_dataset_count}`,
    `- suggestion_count: ${result.summary.adoption_ledger.suggestion_count}`,
    `- adopted_count: ${result.summary.adoption_ledger.adopted_count}`,
    `- rejected_count: ${result.summary.adoption_ledger.rejected_count}`,
    `- effective_without_adoption_count: ${result.summary.adoption_ledger.effective_without_adoption_count}`,
    `- safety_regression_after_adoption_count: ${result.summary.adoption_ledger.safety_regression_after_adoption_count}`,
    `- issue_record_rate: ${result.summary.rates.issue_record_rate}`,
    `- resolved_proxy_rate: ${result.summary.rates.resolved_proxy_rate}`,
    `- user_pushback_record_rate: ${result.summary.rates.user_pushback_record_rate}`,
    `- strong_external_proxy_rate: ${result.summary.rates.strong_external_proxy_rate}`,
    `- weak_external_proxy_rate: ${result.summary.rates.weak_external_proxy_rate}`,
    `- swe_chat_raw_risk_keyword_records: ${result.summary.swe_chat_context.raw_risk_keyword_records}`,
    `- swe_chat_actual_risk_keyword_records: ${result.summary.swe_chat_context.actual_risk_keyword_records}`,
    `- swe_chat_likely_noise_keyword_records: ${result.summary.swe_chat_context.likely_noise_keyword_records}`,
    `- swe_chat_likely_noise_keyword_rate: ${result.summary.swe_chat_context.likely_noise_keyword_rate}`,
    `- llm_calls: ${result.safety.calls_llm ? 1 : 0}`,
    `- external_api_calls: ${result.safety.calls_external_api ? 1 : 0}`,
    "",
    "## Datasets",
    "",
    ...Object.entries(result.summary.by_dataset).map(([dataset, count]) => `- ${dataset}: ${count}`),
    "",
    "## Calibration Targets",
    "",
    ...Object.entries(result.summary.by_calibration_target).map(([target, count]) => `- ${target}: ${count}`),
    "",
    "## Calibration Priority",
    "",
    ...result.summary.quant_quality.calibration_priority.map((item) => (
      `- ${item.calibration_target} (${item.priority}, ${item.weighted_issue_score}): ${item.recommendation}`
    )),
    "",
    "## Issue Clusters",
    "",
    ...Object.entries(countBy(result.issues, (item) => item.kind)).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Boundary",
    "",
    "- shadow_only: true",
    "- raw_external_data_persisted: false",
    "- vps_touched: false",
    "- github_pushed: false",
    "- llm_api_calls: 0",
    "- external_api_calls: 0",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeExternalTrajectoryAdaptationArtifacts({
  result,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "external-trajectory-adaptation", stamp));
  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "external-trajectory-adaptation.json");
  const mdPath = path.join(outputRoot, "external-trajectory-adaptation.md");
  const withOutput = {
    ...result,
    output: {
      output_dir: outputRoot,
      json_path: jsonPath,
      markdown_path: mdPath
    }
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(withOutput, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderMarkdown(withOutput), "utf8");

  return withOutput;
}
