import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_RUNS_DIR = "runs";
export const DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_OUT_DIR = "runs/l1-l3-local-calibration";

export const DEFAULT_L3_FEEDBACK_REFLECTION_POLICY = Object.freeze({
  name: "thin_work_order_first",
  scope: {
    candidate_mode: "single",
    candidate_count: 1,
    risk_level: "medium",
    route_hint: "damping",
    handoff_floor: "no_context_agent",
    signal_family: "keyword_risk_noise"
  },
  thresholds: {
    min_actionable_tasks: 4,
    min_weak_tasks_for_rewrite: 2,
    min_weak_tasks_for_primary_agent: 3,
    max_actionable_tasks_for_primary_agent: 2
  },
  action_order: [
    "rewrite_work_order_more_concrete",
    "candidate_count_2",
    "primary_agent_review_suggested"
  ]
});

const REFLECTION_SIGNAL_FAMILIES = new Set([
  "keyword_context_filter",
  "keyword_risk_noise"
]);

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root, predicate) {
  if (!await fileExists(root)) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(entry.name, fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readJsonl(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Ignore malformed historical lines. The replay should keep going.
    }
  }
  return rows;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sortEntries(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function average(values) {
  return values.length
    ? round(values.reduce((sum, value) => sum + Number(value), 0) / values.length)
    : 0;
}

function currentFeedbackActions(sample) {
  const suggestion = sample.current_feedback?.suggestion ?? null;
  if (!suggestion) return [];
  const actions = [];
  if (Number(suggestion.candidate_count ?? 0) >= 2) actions.push("candidate_count_2");
  if (suggestion.handoff_floor === "primary_agent" || suggestion.handoff_floor === "human_owner") {
    actions.push("primary_agent_review_suggested");
  }
  return [...new Set(actions)];
}

function nextConservativeHandoffFloor(floor) {
  if (floor === "no_context_agent") return "primary_agent";
  if (floor === "primary_agent") return "human_owner";
  return null;
}

function sameFailureShape(left, right) {
  if (!left || !right) return false;
  const leftViolations = [...(left.violations ?? [])].sort().join("|");
  const rightViolations = [...(right.violations ?? [])].sort().join("|");
  return left.gate_class === right.gate_class
    && leftViolations === rightViolations
    && Number(left.actionableTaskCount ?? -1) === Number(right.actionableTaskCount ?? -2)
    && Number(left.weakTaskCount ?? -1) === Number(right.weakTaskCount ?? -2);
}

function repeatedFailureShape(attempts) {
  if (!Array.isArray(attempts) || attempts.length < 2) return false;
  return sameFailureShape(attempts[attempts.length - 2], attempts[attempts.length - 1]);
}

function recomputeCurrentL1FeedbackSuggestion(sample) {
  if (!["exhausted_no_value", "exhausted_reviewable_hard_fail"].includes(sample.l3_feedback_status)) {
    return null;
  }
  const currentCandidateCount = Number(sample.candidate_count ?? 1);
  const currentHandoffFloor = sample.l1_handoff_floor ?? "unknown";
  const suggestedCandidateCount = currentCandidateCount < 2 ? 2 : null;
  const suggestedHandoffFloor = sample.repeated_failure_shape
    ? nextConservativeHandoffFloor(currentHandoffFloor)
    : null;
  const violations = Array.isArray(sample.violations) ? sample.violations : [];
  if (!suggestedCandidateCount && !suggestedHandoffFloor && !violations.length) return null;

  const reasonCodes = [];
  if (suggestedCandidateCount) reasonCodes.push("single_candidate_failed_l3_recheck");
  if (suggestedHandoffFloor) reasonCodes.push("repeated_failure_shape_conservative_handoff_floor");
  for (const violation of violations) reasonCodes.push(`l3_violation:${violation}`);

  return {
    schema_version: "misa.l1_feedback_suggestion.v1",
    authority: "suggestion_only",
    source_id: sample.source_id,
    match: {
      signal_family: sample.signal_family,
      risk_level: sample.risk_level,
      route_hint: sample.route_hint,
      l1_candidate_mode: sample.l1_candidate_mode
    },
    observed_l3_result: {
      final_status: sample.l3_feedback_status,
      repeated_failure_shape: sample.repeated_failure_shape,
      gate_class: sample.gate_class,
      quality_score: sample.quality_score,
      violations,
      actionableTaskCount: sample.actionableTaskCount,
      weakTaskCount: sample.weakTaskCount
    },
    suggestion: {
      candidate_count: suggestedCandidateCount,
      handoff_floor: suggestedHandoffFloor,
      repair_prompt_mode: "task_level_l3_observation"
    },
    reason_codes: [...new Set(reasonCodes)],
    promotion_boundary: "record-only feedback; do not auto-mutate L1 thresholds, global prompts, gate weights, or runtime authority"
  };
}

function sampleIdFor(row, reportPath, lineNumber, repoRoot) {
  return [
    row.source_id ?? "unknown",
    normalizePathForReport(repoRoot, reportPath) ?? "unknown-report",
    lineNumber
  ].join("::");
}

function isCheapRouteSample(row) {
  const profile = row?.l1_signal_profile ?? {};
  const candidateDecision = row?.candidate_count_decision ?? {};
  return REFLECTION_SIGNAL_FAMILIES.has(profile.signal_family)
    && profile.risk_level === DEFAULT_L3_FEEDBACK_REFLECTION_POLICY.scope.risk_level
    && profile.route_hint === DEFAULT_L3_FEEDBACK_REFLECTION_POLICY.scope.route_hint
    && row?.l1_candidate_mode === DEFAULT_L3_FEEDBACK_REFLECTION_POLICY.scope.candidate_mode
    && row?.l1_handoff_floor === DEFAULT_L3_FEEDBACK_REFLECTION_POLICY.scope.handoff_floor
    && Number(candidateDecision.requested_candidate_count ?? row?.candidate_count ?? 0) === DEFAULT_L3_FEEDBACK_REFLECTION_POLICY.scope.candidate_count;
}

function normalizeSample(row, { repoRoot, reportPath, lineNumber }) {
  const profile = row?.l1_signal_profile ?? {};
  const candidateDecision = row?.candidate_count_decision ?? {};
  const l1Control = candidateDecision?.l1_control ?? row?.l1_control ?? {};
  const l3Feedback = row?.l3_feedback ?? {};
  const recordedFeedback = row?.l1_feedback_suggestion ?? l3Feedback?.l1_feedback_suggestion ?? null;
  const status = l3Feedback?.final_status ?? row?.l3_feedback_status ?? null;
  const actionableTaskCount = Number(row?.actionableTaskCount ?? row?.gate?.checks?.actionableTaskCount ?? 0);
  const weakTaskCount = Number(row?.weakTaskCount ?? row?.gate?.checks?.weakTaskCount ?? 0);
  const qualityScore = Number(row?.quality_score ?? row?.gate?.quality_score ?? 0);
  const candidateCount = Number(candidateDecision?.requested_candidate_count ?? row?.candidate_count ?? 0);
  const repeatedFailure = Boolean(l3Feedback?.repeated_failure_shape) || repeatedFailureShape(l3Feedback?.attempts);
  const sample = {
    schema_version: "misa.l3_feedback_reflection_sample.v1",
    sample_id: sampleIdFor(row, reportPath, lineNumber, repoRoot),
    source_id: row?.source_id ?? "unknown",
    source_file: normalizePathForReport(repoRoot, reportPath),
    source_line: lineNumber,
    status,
    is_bad: status !== "accepted_first_try",
    current_feedback: recordedFeedback,
    recorded_feedback: recordedFeedback,
    current_feedback_actions: currentFeedbackActions({
      current_feedback: recordedFeedback
    }),
    recorded_feedback_actions: currentFeedbackActions({
      current_feedback: recordedFeedback
    }),
    candidate_count: candidateCount || null,
    l1_candidate_mode: row?.l1_candidate_mode ?? profile?.l2_candidate_mode ?? null,
    l1_handoff_floor: row?.l1_handoff_floor ?? l1Control?.handoff_floor ?? null,
    risk_level: profile?.risk_level ?? null,
    route_hint: profile?.route_hint ?? null,
    signal_family: profile?.signal_family ?? null,
    actionableTaskCount,
    weakTaskCount,
    quality_score: qualityScore,
    gate_class: row?.gate_class ?? row?.gate?.gate_class ?? null,
    violations: Array.isArray(row?.violations) ? row.violations : (row?.gate?.violations ?? []),
    repeated_failure_shape: repeatedFailure,
    l3_feedback_attempt_count: Array.isArray(l3Feedback?.attempts) ? l3Feedback.attempts.length : 0,
    l3_feedback_status: status,
    recorded_feedback_present: Boolean(recordedFeedback)
  };
  sample.baseline_feedback = recomputeCurrentL1FeedbackSuggestion(sample);
  sample.baseline_feedback_actions = currentFeedbackActions({
    current_feedback: sample.baseline_feedback
  });
  sample.baseline_feedback_present = Boolean(sample.baseline_feedback);
  sample.baseline_candidate_count_upgrade = Boolean(sample.baseline_feedback?.suggestion?.candidate_count);
  sample.baseline_primary_agent_upgrade = Boolean(
    sample.baseline_feedback?.suggestion?.handoff_floor === "primary_agent"
    || sample.baseline_feedback?.suggestion?.handoff_floor === "human_owner"
  );
  sample.reflection = evaluateReflectionSample(sample);
  return sample;
}

export function evaluateReflectionSample(sample, policy = DEFAULT_L3_FEEDBACK_REFLECTION_POLICY) {
  const actions = [];
  const reasons = [];
  const thresholds = policy.thresholds ?? {};
  const scope = policy.scope ?? {};
  const cheapRoute = matchesReflectionPolicyScope(sample, policy);

  if (!cheapRoute) {
    return {
      trigger: false,
      actions,
      reasons
    };
  }

  const thinWorkOrder =
    sample.actionableTaskCount < thresholds.min_actionable_tasks
    || sample.weakTaskCount >= thresholds.min_weak_tasks_for_rewrite;

  const severeThinness =
    sample.weakTaskCount >= thresholds.min_weak_tasks_for_primary_agent
    || sample.actionableTaskCount <= thresholds.max_actionable_tasks_for_primary_agent
    || sample.repeated_failure_shape;

  if (thinWorkOrder) {
    actions.push("rewrite_work_order_more_concrete");
    reasons.push(
      sample.actionableTaskCount < thresholds.min_actionable_tasks
        ? "actionable_task_count_below_min"
        : "weak_task_count_at_least_rewrite_threshold"
    );
  }

  const failed = sample.l3_feedback_status !== "accepted_first_try";
  if (thinWorkOrder && failed && Number(sample.candidate_count ?? 1) < 2) {
    actions.push("candidate_count_2");
    reasons.push("failed_thin_work_order_should_try_second_candidate");
  }

  if (failed && severeThinness) {
    actions.push("primary_agent_review_suggested");
    reasons.push(sample.repeated_failure_shape ? "repeated_failure_shape" : "severe_thinness");
  }

  return {
    trigger: actions.length > 0,
    actions: [...new Set(actions)],
    reasons: [...new Set(reasons)]
  };
}

export function matchesReflectionPolicyScope(sample, policy = DEFAULT_L3_FEEDBACK_REFLECTION_POLICY, {
  ignoreSignalFamily = false,
  ignoreCandidateCount = false,
  ignoreHandoffFloor = false,
  ignoreCandidateMode = false
} = {}) {
  const scope = policy.scope ?? {};
  const signalFamilyOk = ignoreSignalFamily
    || !scope.signal_family
    || scope.signal_family === "*"
    || sample.signal_family === scope.signal_family
    || (scope.signal_family === "keyword_risk_noise" && REFLECTION_SIGNAL_FAMILIES.has(sample.signal_family));
  const candidateCountOk = ignoreCandidateCount
    || !Number.isFinite(Number(scope.candidate_count))
    || Number(sample.candidate_count ?? 0) === Number(scope.candidate_count);
  const handoffFloorOk = ignoreHandoffFloor || sample.l1_handoff_floor === scope.handoff_floor;
  const candidateModeOk = ignoreCandidateMode || sample.l1_candidate_mode === scope.candidate_mode;
  return signalFamilyOk
    && candidateCountOk
    && candidateModeOk
    && sample.risk_level === scope.risk_level
    && sample.route_hint === scope.route_hint
    && handoffFloorOk;
}

function statusCounts(samples) {
  return sortEntries(countBy(samples, (sample) => sample.l3_feedback_status ?? "unknown"));
}

function topSamples(samples, filter, limit = 5) {
  return samples
    .filter(filter)
    .sort((left, right) => (
      Number(left.actionableTaskCount) - Number(right.actionableTaskCount)
      || Number(right.weakTaskCount) - Number(left.weakTaskCount)
      || Number(left.quality_score) - Number(right.quality_score)
      || left.source_id.localeCompare(right.source_id)
      || left.source_file.localeCompare(right.source_file)
    ))
    .slice(0, limit)
    .map((sample) => ({
      sample_id: sample.sample_id,
      source_id: sample.source_id,
      status: sample.l3_feedback_status,
      quality_score: sample.quality_score,
      actionableTaskCount: sample.actionableTaskCount,
      weakTaskCount: sample.weakTaskCount,
      recorded_feedback: sample.recorded_feedback?.suggestion ?? sample.current_feedback?.suggestion ?? null,
      baseline_feedback: sample.baseline_feedback?.suggestion ?? null,
      baseline_feedback_present: sample.baseline_feedback_present,
      reflection_actions: sample.reflection.actions,
      reflection_reasons: sample.reflection.reasons,
      source_file: sample.source_file
    }));
}

function buildSummary(samples, input, policy) {
  const badSamples = samples.filter((sample) => sample.is_bad);
  const goodSamples = samples.filter((sample) => !sample.is_bad);
  const recordedTriggered = samples.filter((sample) => sample.recorded_feedback_present);
  const recordedBadCaught = badSamples.filter((sample) => sample.recorded_feedback_present);
  const baselineTriggered = samples.filter((sample) => sample.baseline_feedback_present);
  const baselineBadCaught = badSamples.filter((sample) => sample.baseline_feedback_present);
  const candidateTriggered = samples.filter((sample) => sample.reflection.trigger);
  const candidateBadCaught = badSamples.filter((sample) => sample.reflection.trigger);
  const candidateGoodFalsePositives = goodSamples.filter((sample) => sample.reflection.trigger);
  const newlyCaught = badSamples.filter((sample) => !sample.baseline_feedback_present && sample.reflection.trigger);
  const recordedMissingBaselineCaught = badSamples.filter((sample) => (
    !sample.recorded_feedback_present && sample.baseline_feedback_present
  ));
  const candidateActionCounts = {
    rewrite_work_order_more_concrete: candidateTriggered.filter((sample) => sample.reflection.actions.includes("rewrite_work_order_more_concrete")).length,
    candidate_count_2: candidateTriggered.filter((sample) => sample.reflection.actions.includes("candidate_count_2")).length,
    primary_agent_review_suggested: candidateTriggered.filter((sample) => sample.reflection.actions.includes("primary_agent_review_suggested")).length
  };
  const currentActionCounts = {
    candidate_count_2: baselineTriggered.filter((sample) => sample.baseline_feedback_actions.includes("candidate_count_2")).length,
    primary_agent_review_suggested: baselineTriggered.filter((sample) => sample.baseline_feedback_actions.includes("primary_agent_review_suggested")).length
  };
  const statusCountsByLabel = statusCounts(samples);
  const violationCounts = sortEntries(countBy(samples.flatMap((sample) => sample.violations), (violation) => violation));
  const recordedFeedbackReasonCounts = sortEntries(countBy(
    recordedTriggered.flatMap((sample) => sample.recorded_feedback?.reason_codes ?? []),
    (reason) => reason
  ));
  const currentFeedbackReasonCounts = sortEntries(countBy(
    baselineTriggered.flatMap((sample) => sample.baseline_feedback?.reason_codes ?? []),
    (reason) => reason
  ));
  const reflectionReasonCounts = sortEntries(countBy(
    candidateTriggered.flatMap((sample) => sample.reflection.reasons),
    (reason) => reason
  ));

  return {
    sample_count: samples.length,
    unique_source_id_count: new Set(samples.map((sample) => sample.source_id)).size,
    good_sample_count: goodSamples.length,
    bad_sample_count: badSamples.length,
    accepted_first_try_count: statusCountsByLabel.accepted_first_try ?? 0,
    repair_pressure_count: badSamples.length,
    bad_rate_pct: samples.length ? round((badSamples.length / samples.length) * 100, 1) : 0,
    recorded_feedback_count: recordedTriggered.length,
    recorded_bad_caught_count: recordedBadCaught.length,
    recorded_recall: badSamples.length ? round(recordedBadCaught.length / badSamples.length) : 0,
    recorded_missing_baseline_caught_count: recordedMissingBaselineCaught.length,
    baseline_feedback_count: baselineTriggered.length,
    baseline_bad_caught_count: baselineBadCaught.length,
    baseline_good_false_positive_count: baselineTriggered.filter((sample) => !sample.is_bad).length,
    baseline_candidate_count_2_count: currentActionCounts.candidate_count_2,
    baseline_primary_agent_review_suggested_count: currentActionCounts.primary_agent_review_suggested,
    candidate_trigger_count: candidateTriggered.length,
    candidate_bad_caught_count: candidateBadCaught.length,
    candidate_good_false_positive_count: candidateGoodFalsePositives.length,
    candidate_rewrite_count: candidateActionCounts.rewrite_work_order_more_concrete,
    candidate_count_2_count: candidateActionCounts.candidate_count_2,
    candidate_primary_agent_review_suggested_count: candidateActionCounts.primary_agent_review_suggested,
    newly_caught_count: newlyCaught.length,
    candidate_precision: candidateTriggered.length ? round(candidateBadCaught.length / candidateTriggered.length) : 0,
    candidate_recall: badSamples.length ? round(candidateBadCaught.length / badSamples.length) : 0,
    baseline_recall: badSamples.length ? round(baselineBadCaught.length / badSamples.length) : 0,
    recorded_feedback_reason_counts: recordedFeedbackReasonCounts,
    current_feedback_reason_counts: currentFeedbackReasonCounts,
    reflection_reason_counts: reflectionReasonCounts,
    status_counts: statusCountsByLabel,
    violation_counts: violationCounts,
    bad_avg_quality_score: average(badSamples.map((sample) => sample.quality_score)),
    good_avg_quality_score: average(goodSamples.map((sample) => sample.quality_score)),
    bad_avg_actionable: average(badSamples.map((sample) => sample.actionableTaskCount)),
    good_avg_actionable: average(goodSamples.map((sample) => sample.actionableTaskCount)),
    bad_avg_weak: average(badSamples.map((sample) => sample.weakTaskCount)),
    good_avg_weak: average(goodSamples.map((sample) => sample.weakTaskCount)),
    current_vs_candidate_gain: candidateBadCaught.length - baselineBadCaught.length,
    reflection_policy_match: policy.name
  };
}

function sortSamples(samples) {
  const statusRank = {
    exhausted_no_value: 0,
    exhausted_reviewable_hard_fail: 1,
    provider_error_failed_closed: 2,
    accepted_after_l3_recheck: 3,
    accepted_first_try: 4,
    l3_recheck_pending: 5,
    unknown: 6
  };
  return [...samples].sort((left, right) => (
    (statusRank[left.l3_feedback_status ?? "unknown"] ?? 99) - (statusRank[right.l3_feedback_status ?? "unknown"] ?? 99)
    || Number(left.actionableTaskCount) - Number(right.actionableTaskCount)
    || Number(right.weakTaskCount) - Number(left.weakTaskCount)
    || Number(left.quality_score) - Number(right.quality_score)
    || left.source_id.localeCompare(right.source_id)
    || left.source_file.localeCompare(right.source_file)
  ));
}

export async function collectL3FeedbackReflectionSamples({
  repoRoot = process.cwd(),
  runsDir = DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_RUNS_DIR
} = {}) {
  const root = resolvePath(repoRoot, runsDir);
  const { jsonlFiles, rawRows } = await collectPoolDecisionRows({ repoRoot, runsDir });

  const samples = rawRows
    .filter(({ row }) => isCheapRouteSample(row))
    .map(({ row, reportPath, lineNumber }) => normalizeSample(row, {
      repoRoot,
      reportPath,
      lineNumber
    }));

  return {
    schema_version: "misa.l3_feedback_reflection_library.v1",
    created_at: new Date().toISOString(),
    input: {
      repo_root: repoRoot,
      runs_dir: normalizePathForReport(repoRoot, root),
      scanned_pool_decisions_file_count: jsonlFiles.length,
      scanned_row_count: rawRows.length,
      matched_sample_count: samples.length,
      unique_source_id_count: new Set(samples.map((sample) => sample.source_id)).size
    },
    policy: DEFAULT_L3_FEEDBACK_REFLECTION_POLICY,
    samples: sortSamples(samples)
  };
}

async function collectPoolDecisionRows({
  repoRoot = process.cwd(),
  runsDir = DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_RUNS_DIR
} = {}) {
  const root = resolvePath(repoRoot, runsDir);
  const jsonlFiles = await walkFiles(root, (name) => name === "pool-decisions.jsonl");
  const rawRows = [];
  for (const filePath of jsonlFiles) {
    const rows = await readJsonl(filePath);
    for (let index = 0; index < rows.length; index += 1) {
      rawRows.push({
        row: rows[index],
        reportPath: filePath,
        lineNumber: index + 1
      });
    }
  }
  return { root, jsonlFiles, rawRows };
}

export async function collectL3FeedbackReflectionAllSamples({
  repoRoot = process.cwd(),
  runsDir = DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_RUNS_DIR
} = {}) {
  const { root, jsonlFiles, rawRows } = await collectPoolDecisionRows({ repoRoot, runsDir });
  const samples = rawRows.map(({ row, reportPath, lineNumber }) => normalizeSample(row, {
    repoRoot,
    reportPath,
    lineNumber
  }));

  return {
    schema_version: "misa.l3_feedback_reflection_full_library.v1",
    created_at: new Date().toISOString(),
    input: {
      repo_root: repoRoot,
      runs_dir: normalizePathForReport(repoRoot, root),
      scanned_pool_decisions_file_count: jsonlFiles.length,
      scanned_row_count: rawRows.length,
      matched_sample_count: samples.length,
      unique_source_id_count: new Set(samples.map((sample) => sample.source_id)).size
    },
    policy: DEFAULT_L3_FEEDBACK_REFLECTION_POLICY,
    samples: sortSamples(samples)
  };
}

export function buildL3FeedbackReflectionReplayReport({
  library,
  libraryPath,
  repoRoot = process.cwd(),
  runsDir = DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_RUNS_DIR,
  now = new Date()
} = {}) {
  if (!library) throw new Error("library is required");
  const samples = sortSamples(library.samples ?? []);
  const summary = buildSummary(samples, library.input ?? {}, library.policy ?? DEFAULT_L3_FEEDBACK_REFLECTION_POLICY);
  const badSamples = samples.filter((sample) => sample.is_bad);
  const goodSamples = samples.filter((sample) => !sample.is_bad);

  return {
    schema_version: "misa.l3_feedback_reflection_replay.v1",
    mode: "l3-feedback-reflection-replay",
    ok: summary.sample_count >= 20
      && summary.bad_sample_count > 0
      && summary.candidate_recall === 1
      && summary.candidate_good_false_positive_count === 0,
    created_at: now.toISOString(),
    input: {
      library_path: normalizePathForReport(repoRoot, libraryPath),
      runs_dir: normalizePathForReport(repoRoot, resolvePath(repoRoot, runsDir))
    },
    policy: library.policy ?? DEFAULT_L3_FEEDBACK_REFLECTION_POLICY,
    summary,
    samples,
    top_bad_samples: topSamples(samples, (sample) => sample.is_bad, 5),
    top_good_samples: topSamples(samples, (sample) => !sample.is_bad, 5),
    bad_samples: badSamples,
    good_samples: goodSamples,
    notes: [
      "The replay stays local and only reads historical pool-decisions.jsonl artifacts.",
      "Baseline feedback is recomputed with the current suggestion-only L3 feedback rule; recorded_feedback_* only describes what older artifacts already stored.",
      "The candidate rule is suggestion-only; it does not mutate L1 thresholds, prompts, or handoff floors."
    ]
  };
}

export async function writeL3FeedbackReflectionReplayArtifacts({
  repoRoot = process.cwd(),
  library,
  libraryPath,
  result,
  outDir,
  now = new Date()
} = {}) {
  if (!library) throw new Error("library is required");
  if (!result) throw new Error("result is required");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join(DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_OUT_DIR, `${stamp}-reflection-replay`));
  await fs.mkdir(outputRoot, { recursive: true });

  const libraryJsonlPath = path.join(outputRoot, "l3-feedback-reflection-library.jsonl");
  const replayJsonPath = path.join(outputRoot, "l3-feedback-reflection-replay.json");
  const replayMarkdownPath = path.join(outputRoot, "l3-feedback-reflection-replay.md");
  const manifestPath = path.join(outputRoot, "input-manifest.json");

  const written = {
    ...result,
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      input_manifest_path: normalizePathForReport(repoRoot, manifestPath),
      library_jsonl_path: normalizePathForReport(repoRoot, libraryJsonlPath),
      replay_json_path: normalizePathForReport(repoRoot, replayJsonPath),
      replay_markdown_path: normalizePathForReport(repoRoot, replayMarkdownPath)
    }
  };

  const manifest = {
    schema_version: "misa.l3_feedback_reflection_manifest.v1",
    created_at: result.created_at,
    input: result.input,
    policy: result.policy,
    sample_count: result.summary.sample_count,
    bad_sample_count: result.summary.bad_sample_count,
    candidate_recall: result.summary.candidate_recall
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(
    libraryJsonlPath,
    library.samples.map((sample) => JSON.stringify(sample)).join("\n") + "\n",
    "utf8"
  );
  await fs.writeFile(replayJsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(replayMarkdownPath, renderL3FeedbackReflectionReplayMarkdown(written), "utf8");

  return written;
}

export function renderL3FeedbackReflectionReplayMarkdown(result) {
  const summary = result.summary;
  const lines = [
    "# L3 Feedback Reflection Replay",
    "",
    "## Summary",
    "",
    `- sample_count: ${summary.sample_count}`,
    `- unique_source_id_count: ${summary.unique_source_id_count}`,
    `- good_sample_count: ${summary.good_sample_count}`,
    `- bad_sample_count: ${summary.bad_sample_count}`,
    `- accepted_first_try_count: ${summary.accepted_first_try_count}`,
    `- repair_pressure_count: ${summary.repair_pressure_count}`,
    `- bad_rate_pct: ${summary.bad_rate_pct}`,
    `- recorded_feedback_count: ${summary.recorded_feedback_count}`,
    `- recorded_bad_caught_count: ${summary.recorded_bad_caught_count}`,
    `- recorded_recall: ${summary.recorded_recall}`,
    `- recorded_missing_baseline_caught_count: ${summary.recorded_missing_baseline_caught_count}`,
    `- baseline_feedback_count: ${summary.baseline_feedback_count}`,
    `- baseline_bad_caught_count: ${summary.baseline_bad_caught_count}`,
    `- baseline_good_false_positive_count: ${summary.baseline_good_false_positive_count}`,
    `- baseline_candidate_count_2_count: ${summary.baseline_candidate_count_2_count}`,
    `- baseline_primary_agent_review_suggested_count: ${summary.baseline_primary_agent_review_suggested_count}`,
    `- candidate_trigger_count: ${summary.candidate_trigger_count}`,
    `- candidate_bad_caught_count: ${summary.candidate_bad_caught_count}`,
    `- candidate_good_false_positive_count: ${summary.candidate_good_false_positive_count}`,
    `- candidate_rewrite_count: ${summary.candidate_rewrite_count}`,
    `- candidate_count_2_count: ${summary.candidate_count_2_count}`,
    `- candidate_primary_agent_review_suggested_count: ${summary.candidate_primary_agent_review_suggested_count}`,
    `- newly_caught_count: ${summary.newly_caught_count}`,
    `- candidate_precision: ${summary.candidate_precision}`,
    `- candidate_recall: ${summary.candidate_recall}`,
    `- baseline_recall: ${summary.baseline_recall}`,
    `- current_vs_candidate_gain: ${summary.current_vs_candidate_gain}`,
    `- reflection_policy_match: ${summary.reflection_policy_match}`,
    "",
    "## Policy",
    "",
    `- scope: ${JSON.stringify(result.policy.scope)}`,
    `- thresholds: ${JSON.stringify(result.policy.thresholds)}`,
    `- action_order: ${result.policy.action_order.join(", ")}`,
    "",
    "## Baseline Feedback",
    "",
    ...(
      Object.keys(summary.current_feedback_reason_counts).length
        ? Object.entries(summary.current_feedback_reason_counts).map(([key, count]) => `- ${key}: ${count}`)
        : ["- none"]
    ),
    "",
    "## Candidate Reflection",
    "",
    ...(
      Object.keys(summary.reflection_reason_counts).length
        ? Object.entries(summary.reflection_reason_counts).map(([key, count]) => `- ${key}: ${count}`)
        : ["- none"]
    ),
    "",
    "## Statuses",
    "",
    ...Object.entries(summary.status_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Violations",
    "",
    ...Object.entries(summary.violation_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Top Bad Samples",
    "",
    ...(
      result.top_bad_samples.length
        ? result.top_bad_samples.map((sample) => (
          `- ${sample.source_id}: status=${sample.status}, actionable=${sample.actionableTaskCount}, weak=${sample.weakTaskCount}, recorded_feedback=${sample.recorded_feedback ? JSON.stringify(sample.recorded_feedback) : "none"}, baseline_feedback=${sample.baseline_feedback ? JSON.stringify(sample.baseline_feedback) : "none"}, reflection=${sample.reflection_actions.join(", ") || "none"}`
        ))
        : ["- none"]
    ),
    "",
    "## Top Good Samples",
    "",
    ...(
      result.top_good_samples.length
        ? result.top_good_samples.map((sample) => (
          `- ${sample.source_id}: status=${sample.status}, actionable=${sample.actionableTaskCount}, weak=${sample.weakTaskCount}, reflection=${sample.reflection_actions.join(", ") || "none"}`
        ))
        : ["- none"]
    ),
    "",
    "## Notes",
    "",
    ...result.notes.map((note) => `- ${note}`)
  ];

  return `${lines.join("\n")}\n`;
}

export async function runL3FeedbackReflectionReplay({
  repoRoot = process.cwd(),
  runsDir = DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_RUNS_DIR,
  outDir,
  now = new Date()
} = {}) {
  const library = await collectL3FeedbackReflectionSamples({ repoRoot, runsDir });
  const result = buildL3FeedbackReflectionReplayReport({
    library,
    libraryPath: null,
    repoRoot,
    runsDir,
    now
  });
  return writeL3FeedbackReflectionReplayArtifacts({
    repoRoot,
    library,
    result,
    outDir,
    now
  });
}
