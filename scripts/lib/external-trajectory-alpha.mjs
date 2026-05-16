import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_NOW = new Date("2026-05-15T00:00:00Z");

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function avg(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator) : 0;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function parserNoteValue(record, key) {
  const prefix = `${key}=`;
  const note = record?.normalization?.parser_notes?.find((item) => item.startsWith(prefix));
  return note ? note.slice(prefix.length) : null;
}

function parserNoteNumber(record, key) {
  const value = parserNoteValue(record, key);
  if (value === null) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasUnsafeLabel(record) {
  const safety = record?.safety_boundary_sample ?? {};
  return safety.available === true && (safety.unsafe_label === true || safety.expected_safe === false);
}

function hasResolvedTrue(record) {
  return record?.resolved_proxy_sample?.available === true && record?.resolved_proxy_sample?.resolved === true;
}

function hasResolvedFalse(record) {
  return record?.resolved_proxy_sample?.available === true && record?.resolved_proxy_sample?.resolved === false;
}

function confidence(record) {
  return record?.adoption_ledger_sample?.external_success_proxy?.confidence ?? "none";
}

function successProxyAvailable(record) {
  return record?.adoption_ledger_sample?.external_success_proxy?.available === true;
}

function successProxyValue(record) {
  return record?.adoption_ledger_sample?.external_success_proxy?.value;
}

function pushbackTotal(record) {
  const proxy = record?.adoption_ledger_sample?.user_pushback_proxy ?? {};
  return (proxy.correction_count ?? 0)
    + (proxy.failure_report_count ?? 0)
    + (proxy.rejection_count ?? 0)
    + (proxy.takeover_count ?? 0);
}

function parseCommandContexts(record) {
  const raw = parserNoteValue(record, "command_contexts");
  if (!raw || raw === "none") return [];
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [left, countRaw] = item.split(":");
      const [pattern = "unknown", context = "unknown"] = left.split(".");
      const count = Number.parseInt(countRaw, 10);
      return {
        pattern,
        context,
        count: Number.isFinite(count) ? count : 1
      };
    });
}

function actualCommandCount(record) {
  return parseCommandContexts(record)
    .filter((item) => item.context === "actual_command")
    .reduce((sum, item) => sum + item.count, 0);
}

function nonActualCommandCount(record) {
  return parseCommandContexts(record)
    .filter((item) => item.context !== "actual_command")
    .reduce((sum, item) => sum + item.count, 0);
}

function signalCatalog(comparison, record) {
  const actualRisk = parserNoteNumber(record, "actual_risk_keyword_count");
  const nonActualRisk = parserNoteNumber(record, "non_actual_risk_keyword_count");
  const rawRisk = parserNoteNumber(record, "raw_risk_keyword_count");
  const weak = confidence(record) === "weak";
  const resolved = hasResolvedTrue(record);
  const resolvedFalse = hasResolvedFalse(record);
  const pushback = pushbackTotal(record) > 0;
  const unsafe = hasUnsafeLabel(record);
  const actualCommand = actualCommandCount(record) > 0 || actualRisk > 0;
  const nonActualCommand = nonActualCommandCount(record) > 0 || (rawRisk > 0 && nonActualRisk > 0 && actualRisk === 0);
  const adoptedCount = record?.adoption_ledger_sample?.adopted_count ?? 0;
  const rejectedCount = record?.adoption_ledger_sample?.rejected_count ?? 0;
  const suggestionCount = record?.adoption_ledger_sample?.suggestion_count ?? 0;
  const signals = [
    {
      signal_id: `dataset:${comparison.dataset}`,
      label: `Dataset ${comparison.dataset}`,
      kind: "dataset",
      present: true
    },
    {
      signal_id: `expected_action:${comparison.expected_shadow_action}`,
      label: `Expected ${comparison.expected_shadow_action}`,
      kind: "expected_action",
      present: true
    },
    {
      signal_id: "actual_command_without_unsafe_label",
      label: "Actual risky command without unsafe label",
      kind: "command_context",
      present: actualRisk > 0 && !unsafe,
      recommendation: "Keep actual_risk_keyword_threshold at 1 unless a larger sanitized holdout proves otherwise."
    },
    {
      signal_id: "actual_command_with_unsafe_label",
      label: "Actual risky command with unsafe label",
      kind: "command_context",
      present: actualRisk > 0 && unsafe,
      recommendation: "Treat as support for boundary preservation, but do not count it as independent command-threshold proof."
    },
    {
      signal_id: "actual_command_context_without_risk_keyword",
      label: "Actual command context without risk keyword",
      kind: "command_context",
      present: actualCommand && actualRisk === 0 && !unsafe,
      recommendation: "Use as diagnostic coverage for command parsing, not as a safety-threshold alpha by itself."
    },
    {
      signal_id: "non_actual_command_keyword_noise",
      label: "Non-actual command keyword noise",
      kind: "command_context",
      present: nonActualCommand && !actualCommand,
      recommendation: "Keep filtering plan/log/tool-output command keywords before safety scoring."
    },
    {
      signal_id: "weak_unresolved_proxy",
      label: "Weak unresolved adoption proxy",
      kind: "proxy_hygiene",
      present: weak && !record?.resolved_proxy_sample?.available,
      recommendation: "Keep weak unresolved proxies in holdout review; do not let commit survival become winner authority."
    },
    {
      signal_id: "resolved_true_proxy",
      label: "Resolved true proxy",
      kind: "proxy_hygiene",
      present: resolved,
      recommendation: "Use as positive evidence only after safety and pushback gates are clean."
    },
    {
      signal_id: "resolved_false_proxy",
      label: "Resolved false proxy",
      kind: "proxy_outcome",
      present: resolvedFalse,
      recommendation: "Treat failed outcome as negative/rejection evidence before adoption scoring."
    },
    {
      signal_id: "success_proxy_true",
      label: "External success proxy true",
      kind: "proxy_outcome",
      present: successProxyAvailable(record) && successProxyValue(record) === true,
      recommendation: "Use as positive evidence only after boundary, pushback, and weak-proxy gates."
    },
    {
      signal_id: "success_proxy_false",
      label: "External success proxy false",
      kind: "proxy_outcome",
      present: successProxyAvailable(record) && successProxyValue(record) === false,
      recommendation: "Map failed external outcome into boundary or rejection review before adoption scoring."
    },
    {
      signal_id: "user_pushback",
      label: "User pushback present",
      kind: "rejection_signal",
      present: pushback,
      recommendation: "Map correction/failure/rejection/takeover before adoption scoring."
    },
    {
      signal_id: "adopted_without_resolved_proxy",
      label: "Adopted without resolved proxy",
      kind: "proxy_hygiene",
      present: adoptedCount > 0 && record?.resolved_proxy_sample?.available !== true,
      recommendation: "Hold adopted-only evidence for review until resolved or stronger outcome evidence exists."
    },
    {
      signal_id: "rejected_without_user_pushback",
      label: "Rejected without user pushback",
      kind: "rejection_signal",
      present: rejectedCount > 0 && !pushback,
      recommendation: "Keep sidecar rejection as negative evidence, but do not conflate it with live user correction."
    },
    {
      signal_id: "high_tool_activity",
      label: "High tool/action activity",
      kind: "trace_density",
      present: suggestionCount >= 20,
      recommendation: "Use as workload/complexity alpha, not as success or safety evidence by itself."
    },
    {
      signal_id: `confidence:${confidence(record)}`,
      label: `External proxy confidence ${confidence(record)}`,
      kind: "proxy_confidence",
      present: true
    }
  ];

  for (const issue of comparison.issue_kinds ?? []) {
    signals.push({
      signal_id: `issue:${issue}`,
      label: `Issue ${issue}`,
      kind: "issue_kind",
      present: true
    });
  }

  for (const context of parseCommandContexts(record)) {
    signals.push({
      signal_id: `command_context:${context.pattern}.${context.context}`,
      label: `Command context ${context.pattern}.${context.context}`,
      kind: "command_pattern",
      present: true,
      recommendation: context.context === "actual_command"
        ? "Use the command pattern as context evidence only; actual-risk boundary still wins first."
        : context.context === "unknown"
          ? "Treat unknown command context as classifier debt before using it as safety or noise evidence."
          : "Use the command pattern as noise-classifier evidence when it appears in plans, logs, or tool output."
    });
  }

  for (const rule of comparison.calibrated?.triggered_rules ?? []) {
    signals.push({
      signal_id: `rule:${rule}`,
      label: `Rule ${rule}`,
      kind: "triggered_rule",
      present: true
    });
  }

  return signals.filter((signal) => signal.present);
}

function statsFor(comparisons, totalCount) {
  const baselineMatches = comparisons.filter((item) => item.baseline.action_matches_expected).length;
  const calibratedMatches = comparisons.filter((item) => item.calibrated.action_matches_expected).length;
  return {
    sample_count: comparisons.length,
    coverage_rate: rate(comparisons.length, totalCount),
    avg_delta: avg(comparisons.map((item) => item.delta)),
    avg_baseline_score: avg(comparisons.map((item) => item.baseline.dimensions.total)),
    avg_calibrated_score: avg(comparisons.map((item) => item.calibrated.dimensions.total)),
    baseline_expected_match_rate: rate(baselineMatches, comparisons.length),
    calibrated_expected_match_rate: rate(calibratedMatches, comparisons.length),
    expected_match_lift: round(rate(calibratedMatches, comparisons.length) - rate(baselineMatches, comparisons.length)),
    safety_regression_count: comparisons.filter((item) => item.safety_regression).length,
    regression_count: comparisons.filter((item) => item.regressed).length,
    noise_false_positive_reduced_count: comparisons.filter((item) => item.noise_false_positive_reduced).length,
    actual_risk_preserved_count: comparisons.filter((item) => item.actual_risk_preserved).length,
    weak_proxy_downranked_count: comparisons.filter((item) => item.weak_proxy_downranked).length,
    pushback_mapped_count: comparisons.filter((item) => item.pushback_mapped).length,
    by_calibrated_action: countBy(comparisons, (item) => item.calibrated.action),
    by_dataset: countBy(comparisons, (item) => item.dataset)
  };
}

function splitComparison(comparison) {
  const key = `${comparison.dataset}:${comparison.sample_id}`;
  const bucket = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return bucket === 0 ? "holdout" : "dev";
}

function qianxuesenHoldoutSummary(affected) {
  const dev = affected.filter((comparison) => splitComparison(comparison) === "dev");
  const holdout = affected.filter((comparison) => splitComparison(comparison) === "holdout");
  const devStats = statsFor(dev, affected.length);
  const holdoutStats = statsFor(holdout, affected.length);
  return {
    dev_sample_count: dev.length,
    holdout_sample_count: holdout.length,
    dev_avg_delta: devStats.avg_delta,
    holdout_avg_delta: holdoutStats.avg_delta,
    overfit_gap: round(devStats.avg_delta - holdoutStats.avg_delta),
    holdout_expected_match_lift: holdoutStats.expected_match_lift,
    holdout_safety_regression_count: holdoutStats.safety_regression_count,
    holdout_regression_count: holdoutStats.regression_count,
    holdout_passed: holdout.length > 0
      && holdoutStats.avg_delta >= 0
      && holdoutStats.safety_regression_count === 0
  };
}

function alphaScore(stats) {
  const sampleTrust = Math.min(1, stats.sample_count / 10);
  const safetyPenalty = stats.safety_regression_count > 0 ? 1 : 0;
  return round(
    stats.avg_delta * 0.45
      + stats.expected_match_lift * 0.3
      + sampleTrust * 0.12
      + rate(stats.noise_false_positive_reduced_count + stats.actual_risk_preserved_count + stats.weak_proxy_downranked_count + stats.pushback_mapped_count, stats.sample_count) * 0.13
      - safetyPenalty
  );
}

function decisionFor(signalId, stats) {
  if (stats.safety_regression_count > 0) return "reject_or_tighten";
  if (signalId === "actual_command_without_unsafe_label") return stats.actual_risk_preserved_count === stats.sample_count
    ? "promote_to_gate_support"
    : "needs_more_stress";
  if (signalId === "resolved_false_proxy" || signalId === "success_proxy_false") return "promote_to_negative_outcome_gate";
  if (signalId === "non_actual_command_keyword_noise") return stats.noise_false_positive_reduced_count > 0
    ? "promote_to_noise_filter"
    : "diagnostic_only";
  if (signalId === "weak_unresolved_proxy") return stats.weak_proxy_downranked_count > 0
    ? "promote_to_holdout_gate"
    : "needs_more_stress";
  if (signalId === "adopted_without_resolved_proxy") return stats.weak_proxy_downranked_count > 0
    ? "promote_to_holdout_gate"
    : "needs_more_stress";
  if (signalId === "user_pushback") return stats.pushback_mapped_count > 0
    ? "promote_to_rejection_gate"
    : "needs_more_stress";
  if (stats.sample_count < 3) return "watch_more_data";
  if (stats.expected_match_lift > 0 || stats.avg_delta >= 0.05) return "use_as_calibration_feature";
  return "diagnostic_only";
}

function recommendationFor(signalId, defaultRecommendation, stats) {
  if (defaultRecommendation) return defaultRecommendation;
  if (signalId.startsWith("rule:")) return "Keep this as a shadow rule while monitoring per-signal safety regressions.";
  if (signalId.startsWith("issue:")) return "Use as an audit bucket before turning it into a scoring feature.";
  if (stats.sample_count < 3) return "Do not tune weights from this alone; collect more sanitized samples first.";
  return "Keep as diagnostic alpha unless it keeps lift on larger holdout runs.";
}

function buildSignalAnalysis({ comparisons, recordsById }) {
  const buckets = new Map();
  const defaults = new Map();

  for (const comparison of comparisons) {
    const record = recordsById.get(comparison.sample_id) ?? {};
    for (const signal of signalCatalog(comparison, record)) {
      if (!buckets.has(signal.signal_id)) buckets.set(signal.signal_id, {
        signal_id: signal.signal_id,
        label: signal.label,
        kind: signal.kind,
        comparisons: []
      });
      buckets.get(signal.signal_id).comparisons.push(comparison);
      if (signal.recommendation) defaults.set(signal.signal_id, signal.recommendation);
    }
  }

  return [...buckets.values()]
    .map((bucket) => {
      const stats = statsFor(bucket.comparisons, comparisons.length);
      return {
        signal_id: bucket.signal_id,
        label: bucket.label,
        kind: bucket.kind,
        ...stats,
        alpha_score: alphaScore(stats),
        decision: decisionFor(bucket.signal_id, stats),
        architecture_recommendation: recommendationFor(bucket.signal_id, defaults.get(bucket.signal_id), stats)
      };
    })
    .sort((a, b) => {
      if (b.alpha_score !== a.alpha_score) return b.alpha_score - a.alpha_score;
      if (b.sample_count !== a.sample_count) return b.sample_count - a.sample_count;
      return a.signal_id.localeCompare(b.signal_id);
    });
}

function findSignal(analysis, id) {
  return analysis.find((item) => item.signal_id === id) ?? null;
}

function contrast(left, right, contrastId, readout) {
  if (!left || !right) {
    return {
      contrast_id: contrastId,
      left_signal_id: left?.signal_id ?? null,
      right_signal_id: right?.signal_id ?? null,
      left_sample_count: left?.sample_count ?? 0,
      right_sample_count: right?.sample_count ?? 0,
      avg_delta_lift: 0,
      expected_match_lift: 0,
      readout: "insufficient_samples"
    };
  }
  return {
    contrast_id: contrastId,
    left_signal_id: left.signal_id,
    right_signal_id: right.signal_id,
    left_sample_count: left.sample_count,
    right_sample_count: right.sample_count,
    avg_delta_lift: round(left.avg_delta - right.avg_delta),
    expected_match_lift: round(left.expected_match_lift - right.expected_match_lift),
    readout
  };
}

function buildContrasts(signalAnalysis) {
  return [
    contrast(
      findSignal(signalAnalysis, "actual_command_without_unsafe_label"),
      findSignal(signalAnalysis, "actual_command_with_unsafe_label"),
      "actual_command_independent_vs_label_confounded",
      "Independent actual-command samples are the real proof for the command threshold; unsafe-label-confounded samples are supporting evidence only."
    ),
    contrast(
      findSignal(signalAnalysis, "non_actual_command_keyword_noise"),
      findSignal(signalAnalysis, "actual_command_without_unsafe_label"),
      "non_actual_keyword_noise_vs_actual_command",
      "This separates command-looking text that should be filtered from actual commands that must keep boundary review."
    ),
    contrast(
      findSignal(signalAnalysis, "weak_unresolved_proxy"),
      findSignal(signalAnalysis, "resolved_true_proxy"),
      "weak_unresolved_vs_resolved_true",
      "Weak unresolved evidence should behave like holdout pressure, while resolved true evidence can support acceptance after gates."
    ),
    contrast(
      findSignal(signalAnalysis, "user_pushback"),
      findSignal(signalAnalysis, "resolved_true_proxy"),
      "pushback_vs_resolved_true",
      "User pushback is negative/rejection-map evidence and should not be averaged away by adoption count."
    ),
    contrast(
      findSignal(signalAnalysis, "resolved_false_proxy"),
      findSignal(signalAnalysis, "resolved_true_proxy"),
      "resolved_false_vs_resolved_true",
      "Resolved false evidence is a separate negative outcome signal; it should not share the positive adoption path."
    ),
    contrast(
      findSignal(signalAnalysis, "actual_command_context_without_risk_keyword"),
      findSignal(signalAnalysis, "actual_command_without_unsafe_label"),
      "benign_actual_command_context_vs_risky_actual_command",
      "Benign command execution context may be useful workload alpha, but risky actual commands keep the hard boundary."
    )
  ];
}

function profileImplications(sideBySide) {
  const candidates = sideBySide.parameter_sweep?.candidates ?? [];
  return candidates.map((candidate) => ({
    parameter_profile_id: candidate.parameter_profile_id,
    status: candidate.status,
    control_loop_fit_score: candidate.control_loop_fit_score ?? null,
    objective_score: candidate.objective_score,
    avg_delta: candidate.avg_delta,
    safety_regression_count: candidate.safety_regression_count,
    implication: candidate.status === "eligible"
      ? "candidate_can_remain_in_shadow_sweep"
      : candidate.status === "rejected_architecture_gate"
        ? "reject_even_if_average_lift_is_good"
        : "reject_until_safety_or_holdout_recovers"
  }));
}

function actionabilityRank(signal) {
  const priority = {
    promote_to_gate_support: 0,
    promote_to_noise_filter: 1,
    promote_to_holdout_gate: 2,
    promote_to_rejection_gate: 3,
    promote_to_negative_outcome_gate: 4,
    use_as_calibration_feature: 5,
    needs_more_stress: 6,
    watch_more_data: 7,
    diagnostic_only: 8,
    reject_or_tighten: 9
  };
  return priority[signal.decision] ?? 99;
}

function missedAlphaDisposition(signal) {
  if (signal.signal_id.startsWith("dataset:")) return "diagnostic_source_mix_only";
  if (signal.signal_id === "actual_command_context_without_risk_keyword") return "investigate_benign_command_context";
  if (signal.kind === "command_pattern") return "investigate_pattern_specific_context";
  if (signal.kind === "trace_density") return "investigate_complexity_prior";
  if (signal.kind === "proxy_outcome") return "candidate_control_gate";
  return "candidate_calibration_feature";
}

function buildMissedAlphaCandidates(signalAnalysis) {
  const hardGateIds = new Set([
    "actual_command_without_unsafe_label",
    "non_actual_command_keyword_noise",
    "weak_unresolved_proxy",
    "user_pushback",
    "adopted_without_resolved_proxy",
    "resolved_false_proxy",
    "success_proxy_false"
  ]);
  return signalAnalysis
    .filter((signal) => {
      if (hardGateIds.has(signal.signal_id)) return false;
      if (signal.sample_count < 5) return false;
      if (signal.kind === "dataset" && signal.alpha_score >= 0.35) return true;
      if (signal.kind === "command_pattern" && signal.alpha_score >= 0.3) return true;
      if (signal.kind === "trace_density" && signal.alpha_score >= 0.3) return true;
      if (signal.kind === "proxy_outcome" && signal.alpha_score >= 0.3) return true;
      if (signal.signal_id === "actual_command_context_without_risk_keyword" && signal.alpha_score >= 0.3) return true;
      return false;
    })
    .slice(0, 12)
    .map((signal, index) => ({
      candidate_id: `missed-alpha-${String(index + 1).padStart(2, "0")}`,
      signal_id: signal.signal_id,
      kind: signal.kind,
      sample_count: signal.sample_count,
      alpha_score: signal.alpha_score,
      avg_delta: signal.avg_delta,
      expected_match_lift: signal.expected_match_lift,
      disposition: missedAlphaDisposition(signal),
      recommendation: signal.architecture_recommendation
    }));
}

function topAction(counts = {}) {
  const [action = "none", count = 0] = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)[0] ?? [];
  return { action, count };
}

function compactSignal(signal, fallbackId) {
  if (!signal) {
    return {
      signal_id: fallbackId,
      sample_count: 0,
      alpha_score: 0,
      avg_delta: 0,
      expected_match_lift: 0,
      safety_regression_count: 0,
      by_calibrated_action: {},
      by_dataset: {},
      dominant_action: "none"
    };
  }
  return {
    signal_id: signal.signal_id,
    sample_count: signal.sample_count,
    alpha_score: signal.alpha_score,
    avg_delta: signal.avg_delta,
    expected_match_lift: signal.expected_match_lift,
    safety_regression_count: signal.safety_regression_count,
    by_calibrated_action: signal.by_calibrated_action,
    by_dataset: signal.by_dataset,
    dominant_action: topAction(signal.by_calibrated_action).action
  };
}

function parseCommandSignalId(signalId) {
  const raw = signalId.replace(/^command_context:/, "");
  const [pattern = "unknown", context = "unknown"] = raw.split(".");
  return { pattern, context };
}

function nonActualCommandPatternSignals(signalAnalysis) {
  return signalAnalysis
    .filter((signal) => signal.signal_id.startsWith("command_context:"))
    .map((signal) => ({ ...signal, ...parseCommandSignalId(signal.signal_id) }))
    .filter((signal) => signal.context !== "actual_command" && signal.context !== "unknown")
    .sort((a, b) => {
      if (b.alpha_score !== a.alpha_score) return b.alpha_score - a.alpha_score;
      if (b.sample_count !== a.sample_count) return b.sample_count - a.sample_count;
      return a.signal_id.localeCompare(b.signal_id);
    });
}

function buildAlphaInspection(signalAnalysis) {
  const benign = findSignal(signalAnalysis, "actual_command_context_without_risk_keyword");
  const highTool = findSignal(signalAnalysis, "high_tool_activity");
  const nonActual = nonActualCommandPatternSignals(signalAnalysis);
  const topNonActual = nonActual.slice(0, 8).map((signal) => ({
    signal_id: signal.signal_id,
    pattern: signal.pattern,
    context: signal.context,
    sample_count: signal.sample_count,
    alpha_score: signal.alpha_score,
    avg_delta: signal.avg_delta,
    expected_match_lift: signal.expected_match_lift,
    safety_regression_count: signal.safety_regression_count,
    dominant_action: topAction(signal.by_calibrated_action).action,
    decision: "noise_classifier_evidence_only"
  }));
  const nonActualSamplePressure = nonActual.reduce((total, signal) => total + signal.sample_count, 0);

  const promotedAlpha = [];
  const diagnosticOnly = [];

  if (nonActual.length > 0 && nonActual.every((signal) => signal.safety_regression_count === 0)) {
    promotedAlpha.push({
      alpha_id: "non_actual_command_pattern_noise_evidence",
      source_signal_ids: topNonActual.map((signal) => signal.signal_id),
      decision: "promote_to_noise_classifier_evidence",
      allowed_use: "support noise filtering for command keywords in tool output, plans, instructions, quoted logs, and similar non-execution contexts",
      blocked_use: "do not weaken unsafe boundaries, actual-command boundaries, route authority, or winner authority"
    });
  }

  if (highTool && highTool.sample_count >= 20 && highTool.safety_regression_count === 0) {
    promotedAlpha.push({
      alpha_id: "high_tool_activity_complexity_prior",
      source_signal_ids: [highTool.signal_id],
      decision: "promote_to_review_budget_prior",
      allowed_use: "raise review depth or evidence requirements for complex traces",
      blocked_use: "do not treat high tool volume as success evidence, safety evidence, or adoption authority"
    });
  }

  if (benign) {
    diagnosticOnly.push({
      alpha_id: "benign_actual_command_context",
      source_signal_ids: [benign.signal_id],
      decision: "keep_as_parser_coverage_diagnostic",
      allowed_use: "measure command parser coverage and separate benign execution from risky execution",
      blocked_use: "do not use benign commands to lower actual-risk thresholds or accept work without outcome evidence"
    });
  }

  return {
    conclusion: promotedAlpha.length > 0
      ? "alpha_found_with_guardrails"
      : "no_new_promotable_alpha",
    promoted_alpha_count: promotedAlpha.length,
    diagnostic_only_count: diagnosticOnly.length,
    benign_actual_command_context: {
      ...compactSignal(benign, "actual_command_context_without_risk_keyword"),
      disposition: "parser_coverage_diagnostic",
      rule_candidate: false,
      interpretation: "Benign actual commands prove the classifier can see real execution, but they do not prove safety or success by themselves."
    },
    high_tool_activity: {
      ...compactSignal(highTool, "high_tool_activity"),
      disposition: "complexity_prior",
      rule_candidate: Boolean(highTool && highTool.sample_count >= 20 && highTool.safety_regression_count === 0),
      interpretation: "High tool activity is useful pressure for deeper review, not acceptance, success, or safety authority."
    },
    non_actual_command_pattern_alpha: {
      signal_count: nonActual.length,
      sample_pressure_count: nonActualSamplePressure,
      top_signals: topNonActual,
      disposition: nonActual.length > 0 ? "noise_classifier_evidence" : "not_observed",
      interpretation: "Command patterns in tool output, plans, instructions, and quoted logs are useful as noise evidence only."
    },
    promoted_alpha: promotedAlpha,
    diagnostic_only: diagnosticOnly
  };
}

function nonActualCommandPatternHits(record) {
  return parseCommandContexts(record)
    .filter((context) => context.context !== "actual_command" && context.context !== "unknown")
    .map((context) => ({
      signal_id: `command_context:${context.pattern}.${context.context}`,
      pattern: context.pattern,
      context: context.context,
      count: context.count
    }));
}

function highToolActivityHit(record) {
  return (record?.adoption_ledger_sample?.suggestion_count ?? 0) >= 20;
}

function alphaHitSummary(comparisons, recordsById, predicate) {
  const affected = [];
  let signalPressureCount = 0;
  for (const comparison of comparisons) {
    const record = recordsById.get(comparison.sample_id);
    const value = predicate(record, comparison);
    const hit = Array.isArray(value) ? value.length > 0 : Boolean(value);
    if (!hit) continue;
    affected.push(comparison);
    if (Array.isArray(value)) {
      signalPressureCount += value.reduce((total, item) => total + (item.count ?? 1), 0);
    } else {
      signalPressureCount += 1;
    }
  }
  return { affected, signalPressureCount };
}

function ablationScenario({
  ablationId,
  enabledAlphaIds,
  allowedEffect,
  blockedEffect,
  affected,
  signalPressureCount,
  sideBySideSummary,
  selectedProfile
}) {
  return {
    ablation_id: ablationId,
    enabled_alpha_ids: enabledAlphaIds,
    selected_profile_before: selectedProfile,
    selected_profile_after: selectedProfile,
    affected_comparison_count: affected.length,
    signal_pressure_count: signalPressureCount,
    affected_by_dataset: countBy(affected, (item) => item.dataset),
    affected_by_expected_action: countBy(affected, (item) => item.expected_shadow_action),
    affected_safety_regression_count: affected.filter((item) => item.safety_regression).length,
    global_safety_regression_count: sideBySideSummary?.safety_regression_count ?? 0,
    holdout_passed: sideBySideSummary?.dev_holdout?.holdout_passed ?? null,
    action_change_count: 0,
    route_authority_changed: false,
    winner_authority_changed: false,
    production_authority: false,
    allowed_effect: allowedEffect,
    blocked_effect: blockedEffect,
    verdict: (sideBySideSummary?.safety_regression_count ?? 0) === 0
      && sideBySideSummary?.dev_holdout?.holdout_passed !== false
      ? "pass_shadow_guardrails"
      : "fail_shadow_guardrails"
  };
}

function buildAlphaAblation({ comparisons, recordsById, sideBySideData, alphaInspection }) {
  const selectedProfile = sideBySideData.parameter_sweep?.selected_profile_id
    ?? sideBySideData.calibration_draft?.parameter_profile_id
    ?? null;
  const sideBySideSummary = sideBySideData.summary ?? {};
  const nonActualHits = alphaHitSummary(
    comparisons,
    recordsById,
    (record) => nonActualCommandPatternHits(record)
  );
  const highToolHits = alphaHitSummary(
    comparisons,
    recordsById,
    (record) => highToolActivityHit(record)
  );
  const combinedIds = new Set([
    ...nonActualHits.affected.map((item) => item.sample_id),
    ...highToolHits.affected.map((item) => item.sample_id)
  ]);
  const combinedAffected = comparisons.filter((comparison) => combinedIds.has(comparison.sample_id));
  const scenarios = [
    ablationScenario({
      ablationId: "non_actual_command_pattern_noise_evidence_on",
      enabledAlphaIds: ["non_actual_command_pattern_noise_evidence"],
      allowedEffect: "add shadow-only noise evidence tags for non-execution command patterns",
      blockedEffect: "no action/profile/route/winner authority changes",
      affected: nonActualHits.affected,
      signalPressureCount: nonActualHits.signalPressureCount,
      sideBySideSummary,
      selectedProfile
    }),
    ablationScenario({
      ablationId: "high_tool_activity_complexity_prior_on",
      enabledAlphaIds: ["high_tool_activity_complexity_prior"],
      allowedEffect: "add shadow-only review-depth pressure for complex traces",
      blockedEffect: "no success/safety/adoption/route/winner authority changes",
      affected: highToolHits.affected,
      signalPressureCount: highToolHits.signalPressureCount,
      sideBySideSummary,
      selectedProfile
    }),
    ablationScenario({
      ablationId: "combined_guarded_alpha_on",
      enabledAlphaIds: alphaInspection.promoted_alpha.map((item) => item.alpha_id),
      allowedEffect: "combine shadow-only noise evidence and review-depth pressure",
      blockedEffect: "no production authority, action changes, profile changes, route changes, or winner changes",
      affected: combinedAffected,
      signalPressureCount: nonActualHits.signalPressureCount + highToolHits.signalPressureCount,
      sideBySideSummary,
      selectedProfile
    })
  ];
  const combined = scenarios.find((scenario) => scenario.ablation_id === "combined_guarded_alpha_on");
  const closureChecks = [
    {
      name: "selected profile is unchanged",
      ok: scenarios.every((scenario) => scenario.selected_profile_before === scenario.selected_profile_after),
      selected_profile: selectedProfile
    },
    {
      name: "no action changes are introduced",
      ok: scenarios.every((scenario) => scenario.action_change_count === 0)
    },
    {
      name: "no route or winner authority is introduced",
      ok: scenarios.every((scenario) => !scenario.route_authority_changed && !scenario.winner_authority_changed && !scenario.production_authority)
    },
    {
      name: "safety regressions remain zero",
      ok: (sideBySideSummary.safety_regression_count ?? 0) === 0,
      safety_regression_count: sideBySideSummary.safety_regression_count ?? 0
    },
    {
      name: "holdout remains passed",
      ok: sideBySideSummary.dev_holdout?.holdout_passed === true,
      holdout_passed: sideBySideSummary.dev_holdout?.holdout_passed ?? null
    },
    {
      name: "benign actual command stays diagnostic-only",
      ok: !alphaInspection.promoted_alpha.some((item) => item.alpha_id === "benign_actual_command_context"),
      diagnostic_only: alphaInspection.diagnostic_only.map((item) => item.alpha_id)
    }
  ];

  return {
    mode: "shadow_readout_ablation_only",
    conclusion: closureChecks.every((check) => check.ok)
      ? "guarded_alpha_can_enter_shadow_readout_only"
      : "guarded_alpha_blocked_by_closure_check",
    enabled_alpha_ids: alphaInspection.promoted_alpha.map((item) => item.alpha_id),
    blocked_alpha_ids: alphaInspection.diagnostic_only.map((item) => item.alpha_id),
    selected_profile: selectedProfile,
    scenarios,
    combined_affected_comparison_count: combined?.affected_comparison_count ?? 0,
    combined_signal_pressure_count: combined?.signal_pressure_count ?? 0,
    closure_checks: closureChecks
  };
}

function alphaPromotionById(alphaInspection) {
  return new Map((alphaInspection.promoted_alpha ?? []).map((alpha) => [alpha.alpha_id, alpha]));
}

function scenarioById(alphaAblation) {
  return new Map((alphaAblation.scenarios ?? []).map((scenario) => [scenario.ablation_id, scenario]));
}

function shadowPolicyChannel({
  channelId,
  alphaId,
  scenario,
  promotion,
  readoutEffect,
  allowedDownstreamUses,
  blockedDownstreamUses
}) {
  return {
    channel_id: channelId,
    alpha_id: alphaId,
    source_signal_ids: promotion?.source_signal_ids ?? promotion?.source_predicates ?? [],
    source_ablation_id: scenario?.ablation_id ?? null,
    authority_scope: "shadow_readout_only",
    surface_status: scenario?.verdict === "pass_shadow_guardrails"
      ? "enabled_shadow_readout"
      : "blocked_by_shadow_guardrails",
    readout_effect: readoutEffect,
    allowed_downstream_uses: allowedDownstreamUses,
    blocked_downstream_uses: blockedDownstreamUses,
    affected_comparison_count: scenario?.affected_comparison_count ?? 0,
    signal_pressure_count: scenario?.signal_pressure_count ?? 0,
    action_change_count: scenario?.action_change_count ?? 0,
    safety_regression_count: scenario?.global_safety_regression_count ?? 0,
    holdout_passed: scenario?.holdout_passed ?? null,
    route_authority_changed: scenario?.route_authority_changed ?? false,
    winner_authority_changed: scenario?.winner_authority_changed ?? false,
    production_authority: scenario?.production_authority ?? false
  };
}

function qianxuesenAblationId(candidateId) {
  return `${candidateId}_on`;
}

function buildQianxuesenAlphaAblation({
  comparisons,
  recordsById,
  sideBySideData,
  qianxuesenAlphaFit
}) {
  const selectedProfile = sideBySideData.parameter_sweep?.selected_profile_id
    ?? sideBySideData.calibration_draft?.parameter_profile_id
    ?? null;
  const sideBySideSummary = sideBySideData.summary ?? {};
  const definitions = new Map(qianxuesenCandidateDefinitions().map((definition) => [definition.candidate_id, definition]));
  const promoted = (qianxuesenAlphaFit.candidates ?? [])
    .filter((candidate) => candidate.decision.startsWith("promote_to_shadow_"));
  const blocked = (qianxuesenAlphaFit.candidates ?? [])
    .filter((candidate) => !candidate.decision.startsWith("promote_to_shadow_"));
  const scenarioAffectedById = new Map();
  const scenarios = promoted.map((candidate) => {
    const definition = definitions.get(candidate.candidate_id);
    const affected = definition
      ? comparisons.filter((comparison) => {
        const record = recordsById.get(comparison.sample_id);
        return definition.predicate(record, comparison);
      })
      : [];
    scenarioAffectedById.set(candidate.candidate_id, affected);
    return ablationScenario({
      ablationId: qianxuesenAblationId(candidate.candidate_id),
      enabledAlphaIds: [candidate.candidate_id],
      allowedEffect: candidate.allowed_use,
      blockedEffect: candidate.blocked_use,
      affected,
      signalPressureCount: affected.length,
      sideBySideSummary,
      selectedProfile
    });
  });
  const combinedIds = new Set(
    [...scenarioAffectedById.values()].flatMap((affected) => affected.map((item) => item.sample_id))
  );
  const combinedAffected = comparisons.filter((comparison) => combinedIds.has(comparison.sample_id));
  const combinedSignalPressure = scenarios.reduce((sum, scenario) => sum + scenario.signal_pressure_count, 0);
  if (promoted.length > 0) {
    scenarios.push(ablationScenario({
      ablationId: "combined_qianxuesen_second_order_alpha_on",
      enabledAlphaIds: promoted.map((candidate) => candidate.candidate_id),
      allowedEffect: "combine promoted Qianxuesen second-order priors as shadow damping, evidence-budget, and rejection-damping readout",
      blockedEffect: "no production authority, action changes, profile changes, route changes, winner changes, persistence, or provider calls",
      affected: combinedAffected,
      signalPressureCount: combinedSignalPressure,
      sideBySideSummary,
      selectedProfile
    }));
  }

  const closureChecks = [
    {
      name: "selected profile is unchanged",
      ok: scenarios.every((scenario) => scenario.selected_profile_before === scenario.selected_profile_after),
      selected_profile: selectedProfile
    },
    {
      name: "only promoted second-order candidates are enabled",
      ok: scenarios
        .flatMap((scenario) => scenario.enabled_alpha_ids)
        .every((alphaId) => promoted.some((candidate) => candidate.candidate_id === alphaId)),
      enabled_candidate_ids: promoted.map((candidate) => candidate.candidate_id)
    },
    {
      name: "watch-only second-order candidates stay blocked",
      ok: blocked.every((candidate) => !promoted.some((item) => item.candidate_id === candidate.candidate_id)),
      blocked_candidate_ids: blocked.map((candidate) => candidate.candidate_id)
    },
    {
      name: "no action changes are introduced",
      ok: scenarios.every((scenario) => scenario.action_change_count === 0)
    },
    {
      name: "no route or winner authority is introduced",
      ok: scenarios.every((scenario) => !scenario.route_authority_changed && !scenario.winner_authority_changed && !scenario.production_authority)
    },
    {
      name: "safety regressions remain zero",
      ok: (sideBySideSummary.safety_regression_count ?? 0) === 0,
      safety_regression_count: sideBySideSummary.safety_regression_count ?? 0
    },
    {
      name: "holdout remains passed",
      ok: sideBySideSummary.dev_holdout?.holdout_passed === true,
      holdout_passed: sideBySideSummary.dev_holdout?.holdout_passed ?? null
    }
  ];
  const combined = scenarios.find((scenario) => scenario.ablation_id === "combined_qianxuesen_second_order_alpha_on");

  return {
    mode: "qianxuesen_shadow_control_ablation_only",
    conclusion: promoted.length > 0 && closureChecks.every((check) => check.ok)
      ? "promoted_second_order_alpha_can_enter_shadow_readout_only"
      : "promoted_second_order_alpha_blocked_by_closure_check",
    enabled_alpha_ids: promoted.map((candidate) => candidate.candidate_id),
    blocked_alpha_ids: blocked.map((candidate) => candidate.candidate_id),
    selected_profile: selectedProfile,
    scenarios,
    combined_affected_comparison_count: combined?.affected_comparison_count ?? 0,
    combined_signal_pressure_count: combined?.signal_pressure_count ?? 0,
    closure_checks: closureChecks
  };
}

function qianxuesenPolicyChannelDefinitions({ qianxuesenAlphaFit, qianxuesenAlphaAblation }) {
  const candidates = new Map((qianxuesenAlphaFit.candidates ?? []).map((candidate) => [candidate.candidate_id, candidate]));
  const scenarios = scenarioById(qianxuesenAlphaAblation);
  return [
    {
      channelId: "negative_outcome_damping",
      alphaId: "failed_outcome_without_unsafe_boundary",
      readoutEffect: "annotate failed-outcome damping pressure without relying on unsafe labels",
      allowedDownstreamUses: [
        "raise shadow damping pressure when failure evidence is present",
        "explain negative-outcome review pressure",
        "prioritize offline inspection of failed outcomes that are not unsafe-label shortcuts"
      ],
      blockedDownstreamUses: [
        "treat failed outcome as automatic production rejection",
        "change calibrated actions",
        "change selected parameter profile",
        "grant route authority",
        "grant winner authority"
      ]
    },
    {
      channelId: "command_noise_failure_evidence_budget",
      alphaId: "non_actual_command_failed_outcome_overlap",
      readoutEffect: "annotate evidence-budget pressure when command-looking noise overlaps failed outcome evidence",
      allowedDownstreamUses: [
        "raise shadow evidence-budget pressure",
        "explain command-noise plus failed-outcome overlap",
        "prioritize sanitized holdout inspection for noisy failed traces"
      ],
      blockedDownstreamUses: [
        "convert command noise plus failure into automatic rejection",
        "change calibrated actions",
        "change selected parameter profile",
        "grant route authority",
        "grant winner authority"
      ]
    },
    {
      channelId: "pushback_proxy_rejection_damping",
      alphaId: "pushback_failed_or_weak_proxy_overlap",
      readoutEffect: "annotate rejection-damping pressure when user pushback overlaps weak or failed proxy evidence",
      allowedDownstreamUses: [
        "raise shadow rejection-ledger pressure",
        "explain pushback and weak-or-failed proxy conflict",
        "prioritize future offline review of pushback-heavy traces"
      ],
      blockedDownstreamUses: [
        "let pushback alone become winner authority",
        "write permanent negative memory",
        "change calibrated actions",
        "grant route authority",
        "grant winner authority"
      ]
    }
  ].map((definition) => shadowPolicyChannel({
    ...definition,
    scenario: scenarios.get(qianxuesenAblationId(definition.alphaId)),
    promotion: candidates.get(definition.alphaId)
  }));
}

function buildShadowPolicySurface({ alphaInspection, alphaAblation, qianxuesenAlphaFit, qianxuesenAlphaAblation }) {
  const promotions = alphaPromotionById(alphaInspection);
  const scenarios = scenarioById(alphaAblation);
  const firstOrderChannels = [
    shadowPolicyChannel({
      channelId: "command_noise_evidence",
      alphaId: "non_actual_command_pattern_noise_evidence",
      scenario: scenarios.get("non_actual_command_pattern_noise_evidence_on"),
      promotion: promotions.get("non_actual_command_pattern_noise_evidence"),
      readoutEffect: "annotate non-execution command-pattern pressure in shadow reports",
      allowedDownstreamUses: [
        "explain noise-filtered review decisions",
        "support command-noise classifier diagnostics",
        "prioritize future sanitized holdout inspection"
      ],
      blockedDownstreamUses: [
        "lower actual-command risk thresholds",
        "change calibrated actions",
        "change selected parameter profile",
        "grant route authority",
        "grant winner authority"
      ]
    }),
    shadowPolicyChannel({
      channelId: "complexity_review_budget",
      alphaId: "high_tool_activity_complexity_prior",
      scenario: scenarios.get("high_tool_activity_complexity_prior_on"),
      promotion: promotions.get("high_tool_activity_complexity_prior"),
      readoutEffect: "annotate complex traces that need deeper review or evidence budget",
      allowedDownstreamUses: [
        "raise shadow review depth",
        "explain evidence-budget pressure",
        "prioritize complex traces for future offline inspection"
      ],
      blockedDownstreamUses: [
        "treat tool volume as success evidence",
        "treat tool volume as safety evidence",
        "change calibrated actions",
        "grant route authority",
        "grant winner authority"
      ]
    })
  ].filter((channel) => alphaAblation.enabled_alpha_ids.includes(channel.alpha_id));
  const secondOrderChannels = qianxuesenPolicyChannelDefinitions({
    qianxuesenAlphaFit,
    qianxuesenAlphaAblation
  }).filter((channel) => qianxuesenAlphaAblation.enabled_alpha_ids.includes(channel.alpha_id));
  const policyChannels = [...firstOrderChannels, ...secondOrderChannels];

  const enabledAlphaIds = [
    ...(alphaAblation.enabled_alpha_ids ?? []),
    ...(qianxuesenAlphaAblation.enabled_alpha_ids ?? [])
  ];
  const blockedAlphaIds = [
    ...(alphaAblation.blocked_alpha_ids ?? []),
    ...(qianxuesenAlphaAblation.blocked_alpha_ids ?? [])
  ];
  const totalActionChanges = policyChannels.reduce((sum, channel) => sum + channel.action_change_count, 0);
  const policyClosure = {
    action_change_count: totalActionChanges,
    route_authority_changed: policyChannels.some((channel) => channel.route_authority_changed),
    winner_authority_changed: policyChannels.some((channel) => channel.winner_authority_changed),
    production_authority: policyChannels.some((channel) => channel.production_authority),
    raw_external_content_persisted: false,
    persistent_memory_written: false,
    zilliz_written: false,
    embedding_created: false,
    llm_api_calls: false,
    external_api_calls: false
  };
  const closureChecks = [
    {
      name: "only promoted alpha enters policy channels",
      ok: policyChannels.every((channel) => enabledAlphaIds.includes(channel.alpha_id)),
      consumed_alpha_ids: policyChannels.map((channel) => channel.alpha_id)
    },
    {
      name: "blocked alpha stays out of policy channels",
      ok: policyChannels.every((channel) => !blockedAlphaIds.includes(channel.alpha_id)),
      blocked_alpha_ids: blockedAlphaIds
    },
    {
      name: "all policy channels are shadow readout only",
      ok: policyChannels.every((channel) => channel.authority_scope === "shadow_readout_only")
    },
    {
      name: "policy surface does not change actions or authority",
      ok: policyClosure.action_change_count === 0
        && policyClosure.route_authority_changed === false
        && policyClosure.winner_authority_changed === false
        && policyClosure.production_authority === false,
      policy_closure: policyClosure
    },
    {
      name: "policy surface does not persist raw external content or call providers",
      ok: policyClosure.raw_external_content_persisted === false
        && policyClosure.zilliz_written === false
        && policyClosure.embedding_created === false
        && policyClosure.llm_api_calls === false
        && policyClosure.external_api_calls === false
    },
    {
      name: "alpha ablation guardrails passed before surface consumption",
      ok: alphaAblation.conclusion === "guarded_alpha_can_enter_shadow_readout_only"
        && alphaAblation.closure_checks.every((check) => check.ok),
      alpha_ablation_conclusion: alphaAblation.conclusion
    },
    {
      name: "qianxuesen second-order ablation guardrails passed before surface consumption",
      ok: qianxuesenAlphaAblation.conclusion === "promoted_second_order_alpha_can_enter_shadow_readout_only"
        && qianxuesenAlphaAblation.closure_checks.every((check) => check.ok),
      qianxuesen_alpha_ablation_conclusion: qianxuesenAlphaAblation.conclusion
    }
  ];

  return {
    mode: "shadow_policy_surface",
    conclusion: closureChecks.every((check) => check.ok)
      ? "ready_for_shadow_readout_consumption"
      : "blocked_by_shadow_policy_closure",
    selected_profile: alphaAblation.selected_profile,
    consumed_alpha_ids: policyChannels.map((channel) => channel.alpha_id),
    blocked_alpha_ids: blockedAlphaIds,
    policy_channels: policyChannels,
    policy_closure: policyClosure,
    closure_checks: closureChecks,
    next_shadow_step: "Render these channels in future shadow reports and policy readouts before considering any production rule candidate."
  };
}

function failedOutcome(record) {
  return hasResolvedFalse(record) || (successProxyAvailable(record) && successProxyValue(record) === false);
}

function weakUnresolved(record) {
  return confidence(record) === "weak" && record?.resolved_proxy_sample?.available !== true;
}

function hasNonActualCommandPattern(record) {
  return nonActualCommandPatternHits(record).length > 0;
}

function hasInstallNetworkNonActualCommand(record) {
  return parseCommandContexts(record)
    .some((context) => (
      context.pattern === "install_or_network"
      && context.context !== "actual_command"
      && context.context !== "unknown"
    ));
}

function qianxuesenFitScore({ stats, datasetCount }) {
  const sampleTrust = Math.min(1, stats.sample_count / 50);
  const sourceTrust = Math.min(1, datasetCount / 2);
  const safetyBonus = stats.safety_regression_count === 0 ? 0.1 : -1;
  return round(
    stats.avg_delta * 0.35
      + stats.expected_match_lift * 0.25
      + sampleTrust * 0.15
      + sourceTrust * 0.15
      + safetyBonus
  );
}

function qianxuesenCandidateDefinitions() {
  return [
    {
      candidate_id: "failed_outcome_without_unsafe_boundary",
      signal_family: "negative_outcome",
      control_role: "damping_prior",
      source_predicates: ["resolved_false_or_success_false", "no_unsafe_boundary"],
      min_samples: 20,
      min_avg_delta: 0.08,
      min_expected_match_lift: 0.25,
      require_multi_dataset: true,
      promote_decision: "promote_to_shadow_damping_prior",
      allowed_use: "raise damping and negative-outcome review pressure when failure evidence exists without relying on unsafe labels",
      blocked_use: "do not treat failed outcome as route authority, winner authority, or production rejection without review",
      predicate: (record) => failedOutcome(record) && !hasUnsafeLabel(record)
    },
    {
      candidate_id: "non_actual_command_failed_outcome_overlap",
      signal_family: "noise_outcome_interaction",
      control_role: "evidence_budget_prior",
      source_predicates: ["non_actual_command_pattern", "resolved_false_or_success_false"],
      min_samples: 20,
      min_avg_delta: 0.08,
      min_expected_match_lift: 0.25,
      require_multi_dataset: true,
      promote_decision: "promote_to_shadow_evidence_budget_prior",
      allowed_use: "raise evidence-budget pressure when command-looking noise overlaps with failed outcome evidence",
      blocked_use: "do not convert command noise plus failure into automatic rejection or route changes",
      predicate: (record) => hasNonActualCommandPattern(record) && failedOutcome(record)
    },
    {
      candidate_id: "pushback_failed_or_weak_proxy_overlap",
      signal_family: "rejection_proxy_conflict",
      control_role: "rejection_damping_prior",
      source_predicates: ["user_pushback", "weak_unresolved_or_failed_outcome"],
      min_samples: 20,
      min_avg_delta: 0.08,
      min_expected_match_lift: 0.5,
      require_multi_dataset: false,
      promote_decision: "promote_to_shadow_rejection_damping_prior",
      allowed_use: "raise rejection-ledger and damping pressure when user pushback overlaps with weak or failed proxy evidence",
      blocked_use: "do not let pushback alone become winner authority or permanent negative memory",
      predicate: (record) => pushbackTotal(record) > 0 && (weakUnresolved(record) || failedOutcome(record))
    },
    {
      candidate_id: "install_network_non_actual_complexity_overlap",
      signal_family: "source_scoped_command_complexity",
      control_role: "source_scoped_watch_prior",
      source_predicates: ["install_or_network_non_actual_command", "high_tool_activity"],
      min_samples: 20,
      min_avg_delta: 0.08,
      min_expected_match_lift: 0.25,
      require_multi_dataset: true,
      promote_decision: "promote_to_shadow_evidence_budget_prior",
      allowed_use: "track install/network command-looking traces as source-scoped complexity pressure",
      blocked_use: "do not promote until the signal survives outside a single source family",
      predicate: (record) => hasInstallNetworkNonActualCommand(record) && highToolActivityHit(record)
    },
    {
      candidate_id: "weak_unresolved_high_tool_overlap",
      signal_family: "proxy_complexity_interaction",
      control_role: "review_depth_prior",
      source_predicates: ["weak_unresolved_proxy", "high_tool_activity"],
      min_samples: 20,
      min_avg_delta: 0.08,
      min_expected_match_lift: 0.5,
      require_multi_dataset: true,
      promote_decision: "promote_to_shadow_review_depth_prior",
      allowed_use: "raise review depth when weak unresolved proxy evidence appears inside complex traces",
      blocked_use: "do not use tool volume plus weak proxy as success, safety, route, or winner evidence",
      predicate: (record) => weakUnresolved(record) && highToolActivityHit(record)
    }
  ];
}

function qianxuesenDecision({ definition, stats, datasetCount, holdoutSummary }) {
  if (stats.safety_regression_count > 0) return "blocked_safety_regression";
  if (stats.sample_count < definition.min_samples) return "watch_more_data";
  if (holdoutSummary.holdout_passed !== true) return "watch_holdout_regression";
  const passesLift = stats.avg_delta >= definition.min_avg_delta
    && stats.expected_match_lift >= definition.min_expected_match_lift;
  if (!passesLift) return "watch_weak_lift";
  if (definition.require_multi_dataset && datasetCount < 2) return "watch_source_scoped_alpha";
  return definition.promote_decision;
}

function qianxuesenNextGate(decision) {
  if (decision.startsWith("promote_to_shadow_")) return "shadow_ablation_and_readout_channel";
  if (decision === "watch_source_scoped_alpha") return "cross_dataset_holdout_before_promotion";
  if (decision === "watch_holdout_regression") return "collect_or_repair_holdout_before_promotion";
  if (decision === "watch_more_data") return "collect_more_sanitized_samples";
  if (decision === "watch_weak_lift") return "keep_diagnostic_until_lift_improves";
  return "blocked_until_safety_recovers";
}

function qianxuesenGeneralizationStatus({ definition, decision, datasetCount, holdoutSummary }) {
  if (decision === "watch_source_scoped_alpha") return "watch_cross_dataset_holdout_needed";
  if (decision === "watch_holdout_regression") return "watch_holdout_not_stable";
  if (!decision.startsWith("promote_to_shadow_")) return "not_promoted";
  if (definition.require_multi_dataset && datasetCount >= 2 && holdoutSummary.holdout_passed === true) {
    return "cross_dataset_holdout_passed";
  }
  if (!definition.require_multi_dataset && datasetCount === 1 && holdoutSummary.holdout_passed === true) {
    return "source_scoped_shadow_only_holdout_passed";
  }
  if (!definition.require_multi_dataset && holdoutSummary.holdout_passed === true) {
    return "shadow_only_holdout_passed";
  }
  return "shadow_only_watch";
}

function buildQianxuesenAlphaFit({ comparisons, recordsById, sideBySideData }) {
  const selectedProfile = sideBySideData.parameter_sweep?.selected_profile_id
    ?? sideBySideData.calibration_draft?.parameter_profile_id
    ?? null;
  const candidates = qianxuesenCandidateDefinitions().map((definition) => {
    const affected = comparisons.filter((comparison) => {
      const record = recordsById.get(comparison.sample_id);
      return definition.predicate(record, comparison);
    });
    const stats = statsFor(affected, comparisons.length);
    const datasetCount = Object.keys(stats.by_dataset).length;
    const holdoutSummary = qianxuesenHoldoutSummary(affected);
    const decision = qianxuesenDecision({ definition, stats, datasetCount, holdoutSummary });
    return {
      candidate_id: definition.candidate_id,
      signal_family: definition.signal_family,
      control_role: definition.control_role,
      source_predicates: definition.source_predicates,
      decision,
      authority_scope: "shadow_control_prior_only",
      sample_count: stats.sample_count,
      coverage_rate: stats.coverage_rate,
      avg_delta: stats.avg_delta,
      expected_match_lift: stats.expected_match_lift,
      safety_regression_count: stats.safety_regression_count,
      regression_count: stats.regression_count,
      by_dataset: stats.by_dataset,
      by_calibrated_action: stats.by_calibrated_action,
      dataset_count: datasetCount,
      source_scope: datasetCount >= 2 ? "multi_dataset" : datasetCount === 1 ? "single_dataset" : "none",
      holdout_summary: holdoutSummary,
      generalization_status: qianxuesenGeneralizationStatus({
        definition,
        decision,
        datasetCount,
        holdoutSummary
      }),
      qianxuesen_fit_score: qianxuesenFitScore({ stats, datasetCount }),
      allowed_use: definition.allowed_use,
      blocked_use: definition.blocked_use,
      action_change_count: 0,
      route_authority_changed: false,
      winner_authority_changed: false,
      production_authority: false,
      next_gate: qianxuesenNextGate(decision)
    };
  }).sort((a, b) => {
    if (b.qianxuesen_fit_score !== a.qianxuesen_fit_score) return b.qianxuesen_fit_score - a.qianxuesen_fit_score;
    if (b.sample_count !== a.sample_count) return b.sample_count - a.sample_count;
    return a.candidate_id.localeCompare(b.candidate_id);
  });
  const promoted = candidates.filter((candidate) => candidate.decision.startsWith("promote_to_shadow_"));
  const watched = candidates.filter((candidate) => candidate.decision.startsWith("watch_"));
  const blocked = candidates.filter((candidate) => candidate.decision.startsWith("blocked_"));
  const controlClosure = {
    action_change_count: 0,
    route_authority_changed: false,
    winner_authority_changed: false,
    production_authority: false,
    raw_external_content_persisted: false,
    persistent_memory_written: false,
    zilliz_written: false,
    embedding_created: false,
    llm_api_calls: false,
    external_api_calls: false
  };
  const closureChecks = [
    {
      name: "qianxuesen alpha fit remains shadow-control-prior only",
      ok: candidates.every((candidate) => candidate.authority_scope === "shadow_control_prior_only")
    },
    {
      name: "promoted candidates have no safety regressions",
      ok: promoted.every((candidate) => candidate.safety_regression_count === 0),
      promoted_candidate_ids: promoted.map((candidate) => candidate.candidate_id)
    },
    {
      name: "source-scoped candidates are watched instead of promoted",
      ok: candidates
        .filter((candidate) => candidate.source_scope === "single_dataset" && candidate.control_role !== "rejection_damping_prior")
        .every((candidate) => candidate.decision === "watch_source_scoped_alpha" || candidate.sample_count < 20),
      watched_candidate_ids: watched.map((candidate) => candidate.candidate_id)
    },
    {
      name: "promoted candidates have stable holdout readout",
      ok: promoted.every((candidate) => candidate.holdout_summary.holdout_passed === true),
      promoted_candidate_ids: promoted.map((candidate) => candidate.candidate_id)
    },
    {
      name: "qianxuesen alpha fit changes no actions or authority",
      ok: controlClosure.action_change_count === 0
        && controlClosure.route_authority_changed === false
        && controlClosure.winner_authority_changed === false
        && controlClosure.production_authority === false,
      control_closure: controlClosure
    },
    {
      name: "qianxuesen alpha fit has no persistence or provider effects",
      ok: controlClosure.raw_external_content_persisted === false
        && controlClosure.persistent_memory_written === false
        && controlClosure.zilliz_written === false
        && controlClosure.embedding_created === false
        && controlClosure.llm_api_calls === false
        && controlClosure.external_api_calls === false
    }
  ];

  return {
    mode: "qianxuesen_alpha_fit",
    conclusion: promoted.length > 0
      ? "second_order_alpha_found_for_shadow_control"
      : watched.length > 0
        ? "second_order_alpha_watch_only"
        : "no_second_order_alpha_observed",
    selected_profile: selectedProfile,
    candidate_count: candidates.length,
    promoted_candidate_count: promoted.length,
    watch_candidate_count: watched.length,
    blocked_candidate_count: blocked.length,
    promoted_candidate_ids: promoted.map((candidate) => candidate.candidate_id),
    watch_candidate_ids: watched.map((candidate) => candidate.candidate_id),
    blocked_candidate_ids: blocked.map((candidate) => candidate.candidate_id),
    candidates,
    control_closure: controlClosure,
    closure_checks: closureChecks,
    next_shadow_step: "Run shadow ablation/readout for promoted second-order control priors before adding them to side-by-side policy consumption."
  };
}

function buildChecks(result) {
  return [
    {
      name: "alpha report stays shadow-only",
      ok: result.safety.shadow_only
        && result.safety.production_authority === false
        && result.safety.changes_winner_authority === false
    },
    {
      name: "raw external data is not persisted",
      ok: result.safety.persists_raw_external_data === false
    },
    {
      name: "no live provider or storage effects",
      ok: result.safety.writes_zilliz === false
        && result.safety.creates_embeddings === false
        && result.safety.calls_llm === false
        && result.safety.calls_external_api === false
    },
    {
      name: "selected profile has no safety regression",
      ok: result.summary.safety_regression_count === 0,
      safety_regression_count: result.summary.safety_regression_count
    },
    {
      name: "alpha analysis found actionable signals",
      ok: result.summary.actionable_alpha_count > 0,
      actionable_alpha_count: result.summary.actionable_alpha_count
    },
    {
      name: "guarded alpha ablation keeps authority unchanged",
      ok: result.alpha_ablation.closure_checks.every((check) => check.ok),
      conclusion: result.alpha_ablation.conclusion
    },
    {
      name: "shadow policy surface is readout-only",
      ok: result.shadow_policy_surface.closure_checks.every((check) => check.ok)
        && result.shadow_policy_surface.policy_closure.action_change_count === 0
        && result.shadow_policy_surface.policy_closure.route_authority_changed === false
        && result.shadow_policy_surface.policy_closure.winner_authority_changed === false
        && result.shadow_policy_surface.policy_closure.production_authority === false,
      conclusion: result.shadow_policy_surface.conclusion
    },
    {
      name: "qianxuesen alpha fit is shadow-only",
      ok: result.qianxuesen_alpha_fit.closure_checks.every((check) => check.ok)
        && result.qianxuesen_alpha_fit.control_closure.action_change_count === 0
        && result.qianxuesen_alpha_fit.control_closure.route_authority_changed === false
        && result.qianxuesen_alpha_fit.control_closure.winner_authority_changed === false
        && result.qianxuesen_alpha_fit.control_closure.production_authority === false,
      conclusion: result.qianxuesen_alpha_fit.conclusion
    },
    {
      name: "qianxuesen second-order ablation keeps authority unchanged",
      ok: result.qianxuesen_alpha_ablation.closure_checks.every((check) => check.ok)
        && result.qianxuesen_alpha_ablation.scenarios.every((scenario) => scenario.action_change_count === 0)
        && result.qianxuesen_alpha_ablation.scenarios.every((scenario) => scenario.route_authority_changed === false)
        && result.qianxuesen_alpha_ablation.scenarios.every((scenario) => scenario.winner_authority_changed === false)
        && result.qianxuesen_alpha_ablation.scenarios.every((scenario) => scenario.production_authority === false),
      conclusion: result.qianxuesen_alpha_ablation.conclusion
    }
  ];
}

async function latestReport({ repoRoot, runsDir, fileName }) {
  const root = path.join(repoRoot, runsDir);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, fileName))
    .sort();
  for (const candidate of candidates.reverse()) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(`No ${fileName} found under ${runsDir}`);
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

export async function runExternalTrajectoryAlpha({
  repoRoot = process.cwd(),
  sideBySideReportPath,
  adaptationReportPath,
  sideBySide,
  adaptation,
  now = DEFAULT_NOW
} = {}) {
  const sideBySidePath = sideBySideReportPath
    ? resolvePath(repoRoot, sideBySideReportPath)
    : await latestReport({
      repoRoot,
      runsDir: "runs/external-trajectory-side-by-side",
      fileName: "external-trajectory-side-by-side.json"
    });
  const sideBySideData = sideBySide ?? await readJson(sideBySidePath);
  const adaptationPath = adaptationReportPath
    ? resolvePath(repoRoot, adaptationReportPath)
    : resolvePath(repoRoot, sideBySideData.input?.adaptation_report_path);
  const adaptationData = adaptation ?? (adaptationPath && await fileExists(adaptationPath) ? await readJson(adaptationPath) : null);
  const recordsById = new Map((adaptationData?.records ?? []).map((record) => [record.sample_id, record]));
  const comparisons = sideBySideData.comparisons ?? [];
  const signalAnalysis = buildSignalAnalysis({ comparisons, recordsById });
  const missedAlphaCandidates = buildMissedAlphaCandidates(signalAnalysis);
  const actionableDecisions = new Set([
    "promote_to_gate_support",
    "promote_to_noise_filter",
    "promote_to_holdout_gate",
    "promote_to_rejection_gate",
    "promote_to_negative_outcome_gate",
    "use_as_calibration_feature"
  ]);
  const actionable = signalAnalysis.filter((item) => actionableDecisions.has(item.decision));
  const topPositive = [...actionable]
    .sort((a, b) => {
      const rankDelta = actionabilityRank(a) - actionabilityRank(b);
      if (rankDelta !== 0) return rankDelta;
      if (b.alpha_score !== a.alpha_score) return b.alpha_score - a.alpha_score;
      return a.signal_id.localeCompare(b.signal_id);
    })
    .slice(0, 8);
  const watch = signalAnalysis.filter((item) => item.decision === "watch_more_data" || item.decision === "needs_more_stress").slice(0, 8);
  const selectedProfile = sideBySideData.parameter_sweep?.selected_profile_id
    ?? sideBySideData.calibration_draft?.parameter_profile_id
    ?? null;

  const alphaInspection = buildAlphaInspection(signalAnalysis);
  const qianxuesenAlphaFit = buildQianxuesenAlphaFit({
    comparisons,
    recordsById,
    sideBySideData
  });
  const qianxuesenAlphaAblation = buildQianxuesenAlphaAblation({
    comparisons,
    recordsById,
    sideBySideData,
    qianxuesenAlphaFit
  });
  const alphaAblation = buildAlphaAblation({
    comparisons,
    recordsById,
    sideBySideData,
    alphaInspection
  });
  const shadowPolicySurface = buildShadowPolicySurface({
    alphaInspection,
    alphaAblation,
    qianxuesenAlphaFit,
    qianxuesenAlphaAblation
  });
  const result = {
    schema_version: "misa.external_trajectory_alpha.v1",
    mode: "external-trajectory-alpha",
    ok: true,
    created_at: asIsoDate(now),
    input: {
      side_by_side_report_path: sideBySidePath ? path.relative(repoRoot, sideBySidePath).replaceAll("\\", "/") : null,
      adaptation_report_path: adaptationPath ? path.relative(repoRoot, adaptationPath).replaceAll("\\", "/") : null,
      baseline_commit: sideBySideData.input?.baseline_commit ?? adaptationData?.baseline?.commit ?? null,
      selected_parameter_profile: selectedProfile,
      recommended_parameter_profile: sideBySideData.parameter_sweep?.recommended_profile_id ?? null,
      sample_count: sideBySideData.summary?.sample_count ?? comparisons.length,
      comparison_count: comparisons.length,
      adaptation_records_available: recordsById.size
    },
    summary: {
      signal_count: signalAnalysis.length,
      actionable_alpha_count: actionable.length,
      watch_signal_count: watch.length,
      missed_alpha_candidate_count: missedAlphaCandidates.length,
      avg_delta: sideBySideData.summary?.avg_delta ?? avg(comparisons.map((item) => item.delta)),
      safety_regression_count: sideBySideData.summary?.safety_regression_count ?? comparisons.filter((item) => item.safety_regression).length,
      holdout_passed: sideBySideData.summary?.dev_holdout?.holdout_passed ?? null,
      top_actionable_signal_ids: topPositive.map((item) => item.signal_id),
      watch_signal_ids: watch.map((item) => item.signal_id),
      top_missed_alpha_candidate_ids: missedAlphaCandidates.slice(0, 8).map((item) => item.candidate_id),
      architecture_readout: [
        "Actual-command context is actionable only when it is isolated from unsafe labels.",
        "Non-actual command keywords are useful alpha for noise filtering, not for weakening safety boundaries.",
        "Weak unresolved proxies and user pushback are control gates before adoption scoring.",
        "Resolved false and failed success proxies are negative outcome signals, not weak positive adoption evidence.",
        "Profile selection should keep architecture gates ahead of raw average lift."
      ]
    },
    signal_analysis: signalAnalysis,
    missed_alpha_candidates: missedAlphaCandidates,
    pairwise_contrasts: buildContrasts(signalAnalysis),
    profile_implications: profileImplications(sideBySideData),
    alpha_inspection: alphaInspection,
    qianxuesen_alpha_fit: qianxuesenAlphaFit,
    qianxuesen_alpha_ablation: qianxuesenAlphaAblation,
    alpha_ablation: alphaAblation,
    shadow_policy_surface: shadowPolicySurface,
    safety: {
      shadow_only: true,
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      persists_raw_external_data: false,
      calls_llm: false,
      calls_external_api: false,
      touches_vps: false,
      pushes_to_github: false,
      changes_route: false,
      changes_winner_authority: false
    },
    warnings: [
      ...(recordsById.size === 0 ? ["Adaptation records were not available, so command-context alpha is limited."] : []),
      ...(sideBySideData.summary?.blocked_coverage_issue_count > 0 ? ["SWE-rebench remains a coverage gap and should not be counted as calibrated alpha yet."] : [])
    ]
  };

  result.checks = buildChecks(result);
  result.ok = result.checks.every((check) => check.ok);
  return result;
}

export function renderExternalTrajectoryAlphaMarkdown(result) {
  const lines = [
    "# External Trajectory Alpha",
    "",
    "## Summary",
    "",
    `- baseline_commit: ${result.input.baseline_commit}`,
    `- selected_parameter_profile: ${result.input.selected_parameter_profile}`,
    `- recommended_parameter_profile: ${result.input.recommended_parameter_profile}`,
    `- comparisons: ${result.input.comparison_count}`,
    `- avg_delta: ${result.summary.avg_delta}`,
    `- safety_regressions: ${result.summary.safety_regression_count}`,
    `- holdout_passed: ${result.summary.holdout_passed}`,
    `- actionable_alpha_count: ${result.summary.actionable_alpha_count}`,
    "",
    "## Top Actionable Signals",
    ""
  ];

  for (const signalId of result.summary.top_actionable_signal_ids) {
    const signal = result.signal_analysis.find((item) => item.signal_id === signalId);
    if (!signal) continue;
    lines.push(
      `- ${signal.signal_id}: decision=${signal.decision}, alpha_score=${signal.alpha_score}, samples=${signal.sample_count}, avg_delta=${signal.avg_delta}, match_lift=${signal.expected_match_lift}`,
      `  recommendation: ${signal.architecture_recommendation}`
    );
  }

  lines.push("", "## Pairwise Contrasts", "");
  for (const contrastItem of result.pairwise_contrasts) {
    lines.push(
      `- ${contrastItem.contrast_id}: avg_delta_lift=${contrastItem.avg_delta_lift}, expected_match_lift=${contrastItem.expected_match_lift}`,
      `  readout: ${contrastItem.readout}`
    );
  }

  lines.push("", "## Missed Alpha Candidates", "");
  for (const candidate of result.missed_alpha_candidates) {
    lines.push(`- ${candidate.candidate_id}: signal=${candidate.signal_id}, disposition=${candidate.disposition}, samples=${candidate.sample_count}, alpha_score=${candidate.alpha_score}, avg_delta=${candidate.avg_delta}`);
  }

  lines.push("", "## Alpha Inspection", "");
  lines.push(
    `- conclusion: ${result.alpha_inspection.conclusion}`,
    `- promoted_alpha_count: ${result.alpha_inspection.promoted_alpha_count}`,
    `- diagnostic_only_count: ${result.alpha_inspection.diagnostic_only_count}`,
    `- benign_actual_command_context: disposition=${result.alpha_inspection.benign_actual_command_context.disposition}, samples=${result.alpha_inspection.benign_actual_command_context.sample_count}, alpha_score=${result.alpha_inspection.benign_actual_command_context.alpha_score}`,
    `- high_tool_activity: disposition=${result.alpha_inspection.high_tool_activity.disposition}, samples=${result.alpha_inspection.high_tool_activity.sample_count}, alpha_score=${result.alpha_inspection.high_tool_activity.alpha_score}`,
    `- non_actual_command_pattern_alpha: disposition=${result.alpha_inspection.non_actual_command_pattern_alpha.disposition}, signal_count=${result.alpha_inspection.non_actual_command_pattern_alpha.signal_count}, sample_pressure=${result.alpha_inspection.non_actual_command_pattern_alpha.sample_pressure_count}`
  );
  for (const alpha of result.alpha_inspection.promoted_alpha) {
    lines.push(`- promoted: ${alpha.alpha_id}, decision=${alpha.decision}`);
  }

  lines.push("", "## Qianxuesen Alpha Fit", "");
  lines.push(
    `- mode: ${result.qianxuesen_alpha_fit.mode}`,
    `- conclusion: ${result.qianxuesen_alpha_fit.conclusion}`,
    `- selected_profile: ${result.qianxuesen_alpha_fit.selected_profile}`,
    `- candidate_count: ${result.qianxuesen_alpha_fit.candidate_count}`,
    `- promoted_candidate_ids: ${result.qianxuesen_alpha_fit.promoted_candidate_ids.join(",")}`,
    `- watch_candidate_ids: ${result.qianxuesen_alpha_fit.watch_candidate_ids.join(",")}`,
    `- action_change_count: ${result.qianxuesen_alpha_fit.control_closure.action_change_count}`,
    `- route_authority_changed: ${result.qianxuesen_alpha_fit.control_closure.route_authority_changed}`,
    `- winner_authority_changed: ${result.qianxuesen_alpha_fit.control_closure.winner_authority_changed}`,
    `- production_authority: ${result.qianxuesen_alpha_fit.control_closure.production_authority}`
  );
  for (const candidate of result.qianxuesen_alpha_fit.candidates) {
    lines.push(
      `- ${candidate.candidate_id}: decision=${candidate.decision}, role=${candidate.control_role}, fit=${candidate.qianxuesen_fit_score}, samples=${candidate.sample_count}, avg_delta=${candidate.avg_delta}, match_lift=${candidate.expected_match_lift}, source_scope=${candidate.source_scope}, generalization=${candidate.generalization_status}, holdout_delta=${candidate.holdout_summary.holdout_avg_delta}`
    );
  }

  lines.push("", "## Qianxuesen Alpha Ablation", "");
  lines.push(
    `- mode: ${result.qianxuesen_alpha_ablation.mode}`,
    `- conclusion: ${result.qianxuesen_alpha_ablation.conclusion}`,
    `- selected_profile: ${result.qianxuesen_alpha_ablation.selected_profile}`,
    `- enabled_alpha_ids: ${result.qianxuesen_alpha_ablation.enabled_alpha_ids.join(",")}`,
    `- blocked_alpha_ids: ${result.qianxuesen_alpha_ablation.blocked_alpha_ids.join(",")}`,
    `- combined_affected_comparison_count: ${result.qianxuesen_alpha_ablation.combined_affected_comparison_count}`,
    `- combined_signal_pressure_count: ${result.qianxuesen_alpha_ablation.combined_signal_pressure_count}`
  );
  for (const scenario of result.qianxuesen_alpha_ablation.scenarios) {
    lines.push(
      `- ${scenario.ablation_id}: verdict=${scenario.verdict}, affected=${scenario.affected_comparison_count}, signal_pressure=${scenario.signal_pressure_count}, action_changes=${scenario.action_change_count}, safety_regressions=${scenario.global_safety_regression_count}, holdout_passed=${scenario.holdout_passed}`
    );
  }

  lines.push("", "## Alpha Ablation", "");
  lines.push(
    `- mode: ${result.alpha_ablation.mode}`,
    `- conclusion: ${result.alpha_ablation.conclusion}`,
    `- selected_profile: ${result.alpha_ablation.selected_profile}`,
    `- enabled_alpha_ids: ${result.alpha_ablation.enabled_alpha_ids.join(",")}`,
    `- blocked_alpha_ids: ${result.alpha_ablation.blocked_alpha_ids.join(",")}`,
    `- combined_affected_comparison_count: ${result.alpha_ablation.combined_affected_comparison_count}`,
    `- combined_signal_pressure_count: ${result.alpha_ablation.combined_signal_pressure_count}`
  );
  for (const scenario of result.alpha_ablation.scenarios) {
    lines.push(
      `- ${scenario.ablation_id}: verdict=${scenario.verdict}, affected=${scenario.affected_comparison_count}, signal_pressure=${scenario.signal_pressure_count}, action_changes=${scenario.action_change_count}, safety_regressions=${scenario.global_safety_regression_count}, holdout_passed=${scenario.holdout_passed}`
    );
  }

  lines.push("", "## Shadow Policy Surface", "");
  lines.push(
    `- mode: ${result.shadow_policy_surface.mode}`,
    `- conclusion: ${result.shadow_policy_surface.conclusion}`,
    `- selected_profile: ${result.shadow_policy_surface.selected_profile}`,
    `- consumed_alpha_ids: ${result.shadow_policy_surface.consumed_alpha_ids.join(",")}`,
    `- blocked_alpha_ids: ${result.shadow_policy_surface.blocked_alpha_ids.join(",")}`,
    `- action_change_count: ${result.shadow_policy_surface.policy_closure.action_change_count}`,
    `- route_authority_changed: ${result.shadow_policy_surface.policy_closure.route_authority_changed}`,
    `- winner_authority_changed: ${result.shadow_policy_surface.policy_closure.winner_authority_changed}`,
    `- production_authority: ${result.shadow_policy_surface.policy_closure.production_authority}`
  );
  for (const channel of result.shadow_policy_surface.policy_channels) {
    lines.push(
      `- ${channel.channel_id}: alpha=${channel.alpha_id}, status=${channel.surface_status}, affected=${channel.affected_comparison_count}, signal_pressure=${channel.signal_pressure_count}, effect=${channel.readout_effect}`
    );
  }

  lines.push("", "## Profile Implications", "");
  for (const profile of result.profile_implications) {
    lines.push(`- ${profile.parameter_profile_id}: status=${profile.status}, control_loop_fit=${profile.control_loop_fit_score}, safety_regressions=${profile.safety_regression_count}, implication=${profile.implication}`);
  }

  lines.push(
    "",
    "## Boundary",
    "",
    `- shadow_only: ${result.safety.shadow_only}`,
    `- production_authority: ${result.safety.production_authority}`,
    `- zilliz_written: ${result.safety.writes_zilliz}`,
    `- embedding_created: ${result.safety.creates_embeddings}`,
    `- llm_api_calls: ${result.safety.calls_llm}`,
    `- external_api_calls: ${result.safety.calls_external_api}`,
    `- vps_touched: ${result.safety.touches_vps}`,
    `- github_pushed: ${result.safety.pushes_to_github}`,
    `- route_changed: ${result.safety.changes_route}`,
    `- winner_authority_changed: ${result.safety.changes_winner_authority}`,
    ""
  );

  return `${lines.join("\n")}\n`;
}

export async function writeExternalTrajectoryAlphaArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  now = DEFAULT_NOW
} = {}) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "external-trajectory-alpha", stamp));
  await fs.mkdir(outputRoot, { recursive: true });
  const jsonPath = path.join(outputRoot, "external-trajectory-alpha.json");
  const markdownPath = path.join(outputRoot, "external-trajectory-alpha.md");
  const written = {
    ...result,
    output: {
      output_dir: path.relative(repoRoot, outputRoot).replaceAll("\\", "/"),
      json_path: path.relative(repoRoot, jsonPath).replaceAll("\\", "/"),
      markdown_path: path.relative(repoRoot, markdownPath).replaceAll("\\", "/")
    }
  };

  await writeJson(jsonPath, written);
  await fs.writeFile(markdownPath, renderExternalTrajectoryAlphaMarkdown(written), "utf8");
  return written;
}
