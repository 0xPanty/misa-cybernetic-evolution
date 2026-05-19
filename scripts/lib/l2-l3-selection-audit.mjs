import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_L2_L3_SELECTION_BATCH_SIZE = 50;
export const DEFAULT_L2_L3_SELECTION_THRESHOLDS = Object.freeze({
  yellow_quality_min: 0.9,
  yellow_actionable_task_min: 4,
  strong_green_quality_min: 0.9,
  red_spot_check_rate: 0.1,
  red_spot_check_min: 2,
  red_spot_check_max: 5,
  l4_preview_limit: 5
});

export const DEFAULT_CANDIDATE_RECHECK_POLICY = Object.freeze({
  default_mode: "light_single_default",
  default_candidate_count: 1,
  recheck_mode: "explicit_candidate_recheck",
  recheck_candidate_count: 2,
  switch_flag: "--candidate-recheck",
  default_enabled: false,
  near_yellow_quality_margin: 0.025
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
  return Number.isNaN(date.getTime()) ? new Date("2026-05-17T12:00:00.000Z").toISOString() : date.toISOString();
}

function roundRate(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : 0;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function providerErrorCode(item) {
  return item?.provider_error?.code ?? item?.gate?.checks?.providerError?.code ?? null;
}

function gateChecks(item) {
  return item?.gate?.checks ?? {};
}

function decisionReasonText(decision) {
  if (decision.pool === "suppressed") {
    return "L1 suppressed the source before any L2 provider call";
  }
  if (decision.pool === "green") {
    return "hard gate passed; forward to L4 for primary judgment";
  }
  if (decision.pool === "yellow") {
    return "high-score gate failure; keep for L4 review to prevent false rejection";
  }
  if (decision.l4_spot_check) {
    return "red pool sample selected for periodic L4 spot check";
  }
  return "hard gate failed below yellow threshold; hold for audit lookup";
}

function l1PolicyViolationsForItem(item, l1Control, candidateDecision) {
  if (!l1Control) return [];
  const violations = [];
  const llmApiCalls = Number(item?.llm_api_calls ?? 0);
  if (l1Control.generate_l2 === false) {
    if (llmApiCalls > 0) violations.push("l1_suppress_ignored");
    if (candidateDecision?.skip_l2 !== true && !item?.suppressed) {
      violations.push("l1_suppress_missing_skip_marker");
    }
    return violations;
  }
  if (candidateDecision?.policy === "l1_control") {
    const requested = Number(candidateDecision?.requested_candidate_count ?? NaN);
    const expected = Number(l1Control.candidate_count ?? NaN);
    if (Number.isFinite(requested) && Number.isFinite(expected) && requested !== expected) {
      violations.push("l1_candidate_count_mismatch");
    }
  }
  const requested = Number(item?.candidate_selection?.requested_candidate_count ?? candidateDecision?.requested_candidate_count ?? NaN);
  const returned = Number(item?.candidate_selection?.returned_candidate_count ?? item?.candidates?.length ?? NaN);
  if (
    Number.isFinite(requested)
    && Number.isFinite(returned)
    && requested > 0
    && returned < requested
  ) {
    violations.push("l1_candidate_count_underfilled");
  }
  return violations;
}

function candidateRecheckReason(decision, thresholds, policy) {
  if (decision.pool === "yellow") return "yellow_possible_false_reject";
  if (decision.l4_spot_check) return "red_spot_check";
  if (
    decision.pool === "red"
    && !decision.provider_error
    && decision.quality_score >= thresholds.yellow_quality_min - policy.near_yellow_quality_margin
  ) {
    return "near_yellow_threshold_red";
  }
  return null;
}

function buildCandidateRecheck({ decisions, thresholds }) {
  const policy = DEFAULT_CANDIDATE_RECHECK_POLICY;
  const recommended = decisions
    .map((decision) => {
      const reason = candidateRecheckReason(decision, thresholds, policy);
      if (!reason) return null;
      return {
        source_id: decision.source_id,
        pool: decision.pool,
        reason,
        quality_score: decision.quality_score,
        actionableTaskCount: decision.actionableTaskCount,
        weakTaskCount: decision.weakTaskCount,
        violations: decision.violations,
        command_hint: `npm run external:llm-work-order:recheck -- --source-ids ${decision.source_id}`
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.pool.localeCompare(right.pool)
      || right.quality_score - left.quality_score
      || left.source_id.localeCompare(right.source_id)
    ));

  return {
    policy,
    recommended_count: recommended.length,
    recommended_source_ids: recommended.map((item) => item.source_id),
    recommended
  };
}

export function classifyL2L3PoolDecision(item, {
  thresholds = DEFAULT_L2_L3_SELECTION_THRESHOLDS,
  createdAt = new Date()
} = {}) {
  const checks = gateChecks(item);
  const qualityScore = Number(item?.gate?.quality_score ?? 0);
  const actionableTaskCount = Number(checks.actionableTaskCount ?? 0);
  const weakTaskCount = Number(checks.weakTaskCount ?? 0);
  const specificityHits = Number(checks.specificityHits ?? 0);
  const violations = Array.isArray(item?.gate?.violations) ? item.gate.violations : [];
  const softViolations = Array.isArray(item?.gate?.soft_violations) ? item.gate.soft_violations : [];
  const warningCodes = Array.isArray(item?.gate?.warning_codes) ? item.gate.warning_codes : [];
  const gateClass = item?.gate?.gate_class ?? (item?.gate?.ok ? "pass" : "hard_fail");
  const providerError = providerErrorCode(item);
  const l1SignalProfile = item?.packet?.l1_signal_profile ?? null;
  const candidateDecision = item?.candidate_count_decision ?? null;
  const l1Control = item?.packet?.l1_control ?? candidateDecision?.l1_control ?? null;
  const l1PolicyViolations = l1PolicyViolationsForItem(item, l1Control, candidateDecision);
  const l1ControlFollowed = l1Control ? l1PolicyViolations.length === 0 : null;
  const l3Feedback = item?.l3_feedback ?? null;
  const l1FeedbackSuggestion = item?.l1_feedback_suggestion ?? l3Feedback?.l1_feedback_suggestion ?? null;
  const gateOk = Boolean(item?.gate?.ok);
  const suppressed = Boolean(item?.suppressed || gateClass === "suppressed" || candidateDecision?.skip_l2);

  if (suppressed) {
    const reasonCodes = [
      "l1_suppressed_before_l2",
      ...((l1Control?.reasons ?? []).map((reason) => `l1_reason:${reason}`)),
      ...l1PolicyViolations.map((violation) => `l1_policy_violation:${violation}`)
    ];
    for (const warning of warningCodes) {
      reasonCodes.push(`warning:${warning}`);
    }
    if (l3Feedback?.final_status) {
      reasonCodes.push(`l3_feedback:${l3Feedback.final_status}`);
    }
    return {
      schema_version: "misa.l2_l3_pool_decision.v1",
      created_at: asIsoDate(createdAt),
      source_id: item?.source_id ?? "unknown",
      pool: "suppressed",
      l4_forward: false,
      l4_spot_check: false,
      l4_review_mode: "l1_suppressed_no_handoff",
      reason_codes: [...new Set(reasonCodes)],
      decision_reason: null,
      gate_ok: gateOk,
      gate_class: gateClass,
      quality_score: qualityScore,
      violations,
      soft_violations: softViolations,
      warning_codes: warningCodes,
      actionableTaskCount,
      weakTaskCount,
      specificityHits,
      provider_error: providerError,
      candidate_selection: item?.candidate_selection ?? null,
      candidate_count: Array.isArray(item?.candidates) ? item.candidates.length : 0,
      candidate_count_decision: candidateDecision,
      winner_candidate_id: item?.winner_candidate_id ?? null,
      winner_strategy: item?.winner_strategy ?? null,
      draft_title: item?.draft?.title ?? null,
      evidence_refs: item?.packet?.evidence_refs ?? item?.draft?.evidence_refs ?? [],
      l1_signal_profile: l1SignalProfile,
      l1_candidate_mode: l1SignalProfile?.l2_candidate_mode ?? null,
      l1_strategy_axes: l1SignalProfile?.strategy_axes ?? [],
      l1_dimension_hits: l1SignalProfile?.dimension_hits ?? null,
      l1_control: l1Control,
      l1_handoff_floor: l1Control?.handoff_floor ?? null,
      l1_control_followed: l1ControlFollowed,
      l1_policy_violations: l1PolicyViolations,
      l1_feedback_suggestion: l1FeedbackSuggestion,
      l3_feedback: l3Feedback,
      l3_feedback_status: l3Feedback?.final_status ?? null,
      safety_counters: {
        memory_writes: 0,
        zilliz_writes: 0,
        embedding_creations: 0,
        route_changes: 0,
        winner_changes: 0,
        work_order_executions: 0
      }
    };
  }

  const highQualityFailedGate = !gateOk
    && !providerError
    && qualityScore >= thresholds.yellow_quality_min
    && actionableTaskCount >= thresholds.yellow_actionable_task_min;

  const reasonCodes = [];
  let pool = "red";
  let l4ReviewMode = "hold";

  if (gateOk) {
    pool = "green";
    l4ReviewMode = "forward";
    reasonCodes.push("hard_gate_passed");
    if (qualityScore >= thresholds.strong_green_quality_min) {
      reasonCodes.push("strong_quality_pass");
    }
  } else if (highQualityFailedGate) {
    pool = "yellow";
    l4ReviewMode = "forward_false_reject_check";
    reasonCodes.push("possible_false_reject");
    reasonCodes.push("high_quality_failed_gate");
  } else {
    pool = "red";
    l4ReviewMode = "hold_for_periodic_spot_check";
    reasonCodes.push(providerError ? "provider_error" : "hard_gate_failed");
    if (qualityScore < thresholds.yellow_quality_min) reasonCodes.push("below_yellow_quality_threshold");
    if (actionableTaskCount < thresholds.yellow_actionable_task_min) reasonCodes.push("below_yellow_actionable_task_threshold");
  }

  for (const violation of violations) {
    reasonCodes.push(`violation:${violation}`);
  }
  for (const violation of softViolations) {
    reasonCodes.push(`soft_violation:${violation}`);
  }
  for (const warning of warningCodes) {
    reasonCodes.push(`warning:${warning}`);
  }
  if (l3Feedback?.final_status) {
    reasonCodes.push(`l3_feedback:${l3Feedback.final_status}`);
  }

  return {
    schema_version: "misa.l2_l3_pool_decision.v1",
    created_at: asIsoDate(createdAt),
    source_id: item?.source_id ?? "unknown",
    pool,
    l4_forward: pool === "green" || pool === "yellow",
    l4_spot_check: false,
    l4_review_mode: l4ReviewMode,
    reason_codes: [...new Set(reasonCodes)],
    decision_reason: null,
    gate_ok: gateOk,
    gate_class: gateClass,
    quality_score: qualityScore,
    violations,
    soft_violations: softViolations,
    warning_codes: warningCodes,
    actionableTaskCount,
    weakTaskCount,
    specificityHits,
    provider_error: providerError,
    candidate_selection: item?.candidate_selection ?? null,
    candidate_count: Array.isArray(item?.candidates) ? item.candidates.length : null,
    candidate_count_decision: candidateDecision,
    winner_candidate_id: item?.winner_candidate_id ?? null,
    winner_strategy: item?.winner_strategy ?? null,
    draft_title: item?.draft?.title ?? null,
    evidence_refs: item?.packet?.evidence_refs ?? item?.draft?.evidence_refs ?? [],
    l1_signal_profile: l1SignalProfile,
    l1_candidate_mode: l1SignalProfile?.l2_candidate_mode ?? null,
    l1_strategy_axes: l1SignalProfile?.strategy_axes ?? [],
    l1_dimension_hits: l1SignalProfile?.dimension_hits ?? null,
    l1_control: l1Control,
    l1_handoff_floor: l1Control?.handoff_floor ?? null,
    l1_control_followed: l1ControlFollowed,
    l1_policy_violations: l1PolicyViolations,
    l1_feedback_suggestion: l1FeedbackSuggestion,
    l3_feedback: l3Feedback,
    l3_feedback_status: l3Feedback?.final_status ?? null,
    safety_counters: {
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      route_changes: 0,
      winner_changes: 0,
      work_order_executions: 0
    }
  };
}

function applyRedSpotChecks(decisions, thresholds) {
  const red = decisions
    .filter((decision) => decision.pool === "red")
    .sort((left, right) => (
      right.quality_score - left.quality_score
      || right.actionableTaskCount - left.actionableTaskCount
      || left.source_id.localeCompare(right.source_id)
    ));
  if (!red.length) return decisions;
  const targetCount = Math.min(
    red.length,
    thresholds.red_spot_check_max,
    Math.max(thresholds.red_spot_check_min, Math.ceil(red.length * thresholds.red_spot_check_rate))
  );
  const selected = new Set(red.slice(0, targetCount).map((decision) => decision.source_id));
  return decisions.map((decision) => {
    if (!selected.has(decision.source_id)) return decision;
    return {
      ...decision,
      l4_spot_check: true,
      l4_review_mode: "spot_check_red_pool",
      reason_codes: [...new Set([...decision.reason_codes, "red_pool_periodic_spot_check"])]
    };
  });
}

function summarizeDecisions({ decisions, l2Report, thresholds, batchSize }) {
  const poolCounts = {
    green: decisions.filter((decision) => decision.pool === "green").length,
    yellow: decisions.filter((decision) => decision.pool === "yellow").length,
    red: decisions.filter((decision) => decision.pool === "red").length
  };
  const activeDecisions = decisions.filter((decision) => decision.pool !== "suppressed");
  const violationCounts = {};
  const softViolationCounts = {};
  const warningCounts = {};
  const l3FeedbackCounts = {};
  const l1HandoffFloorCounts = {};
  for (const decision of decisions) {
    for (const violation of decision.violations) {
      violationCounts[violation] = (violationCounts[violation] ?? 0) + 1;
    }
    for (const violation of decision.soft_violations ?? []) {
      softViolationCounts[violation] = (softViolationCounts[violation] ?? 0) + 1;
    }
    for (const warning of decision.warning_codes ?? []) {
      warningCounts[warning] = (warningCounts[warning] ?? 0) + 1;
    }
    if (decision.l3_feedback_status) {
      l3FeedbackCounts[decision.l3_feedback_status] = (l3FeedbackCounts[decision.l3_feedback_status] ?? 0) + 1;
    }
    if (decision.l1_handoff_floor) {
      l1HandoffFloorCounts[decision.l1_handoff_floor] = (l1HandoffFloorCounts[decision.l1_handoff_floor] ?? 0) + 1;
    }
  }
  const providerErrorCounts = countBy(
    decisions.filter((decision) => decision.provider_error),
    (decision) => decision.provider_error
  );
  const l4ForwardCount = decisions.filter((decision) => decision.l4_forward).length;
  const redSpotCheckCount = decisions.filter((decision) => decision.l4_spot_check).length;
  const highQualityFailedCount = decisions.filter((decision) => decision.pool === "yellow").length;
  const sampleCount = decisions.length;
  const activeSampleCount = activeDecisions.length;
  const candidateSelections = decisions
    .map((decision) => decision.candidate_selection)
    .filter((selection) => selection
      && Array.isArray(selection.candidate_quality_scores)
      && selection.candidate_quality_scores.length);
  const candidateBestFoundCount = candidateSelections.filter((selection) => {
    const best = Math.max(...selection.candidate_quality_scores);
    return selection.winner_quality_score === best;
  }).length;
  const avgQualityScore = activeSampleCount
    ? Math.round(1000 * activeDecisions.reduce((sum, decision) => sum + decision.quality_score, 0) / activeSampleCount) / 1000
    : 0;

  return {
    sample_count: sampleCount,
    active_sample_count: activeSampleCount,
    batch_size: batchSize,
    batch_status: sampleCount >= batchSize ? "ready_for_periodic_review" : "accumulating",
    samples_until_next_periodic_review: sampleCount >= batchSize ? 0 : batchSize - sampleCount,
    pool_counts: poolCounts,
    suppressed_count: decisions.filter((decision) => decision.pool === "suppressed").length,
    hard_gate_pass_count: poolCounts.green,
    hard_gate_fail_count: activeSampleCount - poolCounts.green,
    hard_gate_pass_rate: roundRate(poolCounts.green, activeSampleCount),
    requested_candidate_count: l2Report?.summary?.requested_candidate_count ?? null,
    candidate_count: l2Report?.summary?.candidate_count ?? null,
    winner_selected_count: l2Report?.summary?.winner_selected_count ?? null,
    expected_candidate_count_met: l2Report?.summary?.expected_candidate_count_met ?? null,
    expected_candidate_count_miss: l2Report?.summary?.expected_candidate_count_miss ?? null,
    candidate_best_found_count: candidateSelections.length ? candidateBestFoundCount : null,
    candidate_best_found_rate: candidateSelections.length ? roundRate(candidateBestFoundCount, candidateSelections.length) : null,
    l4_forward_count: l4ForwardCount,
    red_spot_check_count: redSpotCheckCount,
    possible_false_reject_count: highQualityFailedCount,
    low_quality_pass_count: decisions.filter((decision) => (
      decision.pool === "green" && decision.quality_score < thresholds.strong_green_quality_min
    )).length,
    provider_error_count: decisions.filter((decision) => decision.provider_error).length,
    provider_error_counts: sortedObject(providerErrorCounts),
    l1_control_followed_count: decisions.filter((decision) => decision.l1_control_followed === true).length,
    l1_policy_violation_count: decisions.filter((decision) => (decision.l1_policy_violations ?? []).length).length,
    l1_policy_violation_counts: sortedObject(countBy(
      decisions.flatMap((decision) => decision.l1_policy_violations ?? []),
      (violation) => violation
    )),
    l1_handoff_floor_counts: sortedObject(l1HandoffFloorCounts),
    l1_feedback_suggestion_count: decisions.filter((decision) => decision.l1_feedback_suggestion).length,
    l1_feedback_candidate_count_upgrade_count: decisions.filter((decision) => (
      decision.l1_feedback_suggestion?.suggestion?.candidate_count
    )).length,
    l1_feedback_handoff_floor_upgrade_count: decisions.filter((decision) => (
      decision.l1_feedback_suggestion?.suggestion?.handoff_floor
    )).length,
    avg_quality_score: avgQualityScore,
    violation_counts: sortedObject(violationCounts),
    soft_violation_counts: sortedObject(softViolationCounts),
    warning_counts: sortedObject(warningCounts),
    l3_feedback_counts: sortedObject(l3FeedbackCounts),
    llm_api_calls: l2Report?.summary?.llm_api_calls ?? decisions.length,
    memory_writes: l2Report?.summary?.memory_writes ?? 0,
    zilliz_writes: l2Report?.summary?.zilliz_writes ?? 0,
    embedding_creations: l2Report?.summary?.embedding_creations ?? 0,
    route_changes: l2Report?.summary?.route_changes ?? 0,
    winner_changes: l2Report?.summary?.winner_changes ?? 0,
    vps_touches: l2Report?.summary?.vps_touches ?? 0,
    github_pushes: l2Report?.summary?.github_pushes ?? 0,
    public_publishes: l2Report?.summary?.public_publishes ?? 0
  };
}

function average(values) {
  return values.length
    ? Math.round(1000 * values.reduce((sum, value) => sum + Number(value), 0) / values.length) / 1000
    : 0;
}

function l1DimensionVerdict({ decisions, hitDecisions }) {
  if (!hitDecisions.length) return "no_current_l2_sample";
  const greenYellow = hitDecisions.filter((decision) => decision.pool === "green" || decision.pool === "yellow").length;
  const advancedMode = hitDecisions.filter((decision) => (
    ["recheck", "multi_pool"].includes(decision.l1_candidate_mode)
  )).length;
  const avgQuality = average(hitDecisions.map((decision) => decision.quality_score));
  if (greenYellow > 0 && advancedMode > 0) return "positive_for_candidate_pool";
  if (greenYellow > 0 && avgQuality >= 0.9) return "positive_for_l2_input";
  if (greenYellow === 0 && decisions.length >= 10) return "not_yet_proven_watch";
  return "needs_more_samples";
}

function buildL1SignalDimensionMetrics(decisions) {
  return {
    schema_version: "misa.l1_signal_dimension_metrics.v1",
    sample_count: decisions.length,
    with_l1_profile_count: decisions.filter((decision) => decision.l1_signal_profile).length,
    dimensions: Object.entries(L1_DIMENSION_HYPOTHESES).map(([dimension, hypothesis]) => {
      const hitDecisions = decisions.filter((decision) => decision.l1_dimension_hits?.[dimension] === true);
      const poolCounts = {
        green: hitDecisions.filter((decision) => decision.pool === "green").length,
        yellow: hitDecisions.filter((decision) => decision.pool === "yellow").length,
        red: hitDecisions.filter((decision) => decision.pool === "red").length
      };
      return {
        dimension,
        hypothesis,
        sample_count: hitDecisions.length,
        hit_rate: roundRate(hitDecisions.length, decisions.length),
        pool_counts: poolCounts,
        suppressed_count: hitDecisions.filter((decision) => decision.pool === "suppressed").length,
        l4_forward_count: hitDecisions.filter((decision) => decision.l4_forward).length,
        recheck_or_multi_pool_count: hitDecisions.filter((decision) => (
          ["recheck", "multi_pool"].includes(decision.l1_candidate_mode)
        )).length,
        avg_quality_score: average(hitDecisions.map((decision) => decision.quality_score)),
        avg_weak_task_count: average(hitDecisions.map((decision) => decision.weakTaskCount)),
        provider_error_count: hitDecisions.filter((decision) => decision.provider_error).length,
        verdict: l1DimensionVerdict({ decisions, hitDecisions })
      };
    })
  };
}

function topItems(decisions, filter, limit) {
  return decisions
    .filter(filter)
    .sort((left, right) => (
      right.quality_score - left.quality_score
      || right.actionableTaskCount - left.actionableTaskCount
      || left.source_id.localeCompare(right.source_id)
    ))
    .slice(0, limit)
    .map((decision) => ({
      source_id: decision.source_id,
      pool: decision.pool,
      quality_score: decision.quality_score,
      actionableTaskCount: decision.actionableTaskCount,
      weakTaskCount: decision.weakTaskCount,
      violations: decision.violations,
      reason_codes: decision.reason_codes,
      draft_title: decision.draft_title
    }));
}

export function buildL2L3SelectionAuditReport({
  l2Report,
  l2ReportPath,
  repoRoot = process.cwd(),
  batchSize = DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  thresholds = {},
  now = new Date()
} = {}) {
  if (!l2Report) throw new Error("l2Report is required");
  const effectiveThresholds = {
    ...DEFAULT_L2_L3_SELECTION_THRESHOLDS,
    ...thresholds
  };
  const createdAt = asIsoDate(now);
  let decisions = (l2Report.results ?? []).map((item) => classifyL2L3PoolDecision(item, {
    thresholds: effectiveThresholds,
    createdAt: now
  }));
  decisions = applyRedSpotChecks(decisions, effectiveThresholds)
    .map((decision) => ({
      ...decision,
      decision_reason: decisionReasonText(decision)
    }));
  const summary = summarizeDecisions({
    decisions,
    l2Report,
    thresholds: effectiveThresholds,
    batchSize
  });
  const candidateRecheck = buildCandidateRecheck({
    decisions,
    thresholds: effectiveThresholds
  });
  const l1SignalDimensionMetrics = buildL1SignalDimensionMetrics(decisions);

  return {
    schema_version: "misa.l2_l3_selection_audit.v1",
    mode: "l2-l3-selection-audit",
    ok: true,
    created_at: createdAt,
    input: {
      l2_report_path: normalizePathForReport(repoRoot, l2ReportPath),
      l2_schema_version: l2Report.schema_version ?? null,
      l2_provider: l2Report.provider ?? null,
      l2_model: l2Report.model ?? null
    },
    thresholds: effectiveThresholds,
    summary,
    candidate_recheck: candidateRecheck,
    l1_signal_dimension_metrics: l1SignalDimensionMetrics,
    l4_handoff: {
      policy: "green_and_yellow_forward_red_spot_check",
      summary_only_by_default: true,
      l4_final_judgment_retained: true,
      forwarded_pool_count: summary.l4_forward_count,
      red_spot_check_count: summary.red_spot_check_count,
      preview_limit: effectiveThresholds.l4_preview_limit,
      preview: [
        ...topItems(decisions, (decision) => decision.pool === "yellow", effectiveThresholds.l4_preview_limit),
        ...topItems(decisions, (decision) => decision.pool === "green", effectiveThresholds.l4_preview_limit),
        ...topItems(decisions, (decision) => decision.l4_spot_check, effectiveThresholds.l4_preview_limit)
      ].slice(0, effectiveThresholds.l4_preview_limit)
    },
    quality_review: {
      review_cadence: `every_${batchSize}_l2_samples`,
      does_not_call_llm: true,
      does_not_execute_work_orders: true,
      key_questions: [
        "Are green pool items actually useful to L4?",
        "How many yellow pool items were hard-gate false rejects?",
        "Did red spot checks find missed useful suggestions?",
        "Which gate violation most often causes false rejection?",
        "Did L4 override the hard gate, and should the gate be tuned?",
        "Which L1 dimensions produce better L2 drafts, recheck recommendations, or useful duplicate suppression?"
      ]
    },
    safety: {
      local_report_only: true,
      calls_llm: false,
      executes_work_orders: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      changes_route: false,
      changes_winner: false,
      touches_vps: false,
      pushes_github: false,
      publishes_publicly: false
    },
    decisions,
    warnings: [
      "Pool labels are audit tags, not final authority.",
      "Green and yellow samples should be handed to L4; red samples are held except deterministic spot checks.",
      "L4 review results should be appended to l4-review.jsonl and used to tune future thresholds."
    ]
  };
}

export async function runL2L3SelectionAudit({
  repoRoot = process.cwd(),
  l2Report,
  l2ReportPath,
  batchSize = DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  thresholds,
  now = new Date()
} = {}) {
  const resolvedReport = l2Report ?? await readJson(resolvePath(repoRoot, l2ReportPath));
  return buildL2L3SelectionAuditReport({
    l2Report: resolvedReport,
    l2ReportPath,
    repoRoot,
    batchSize,
    thresholds,
    now
  });
}

export function renderL2L3SelectionAuditMarkdown(result) {
  const lines = [
    "# L2/L3 Selection Audit",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- l2_provider: ${result.input.l2_provider ?? "unknown"}`,
    `- l2_model: ${result.input.l2_model ?? "unknown"}`,
    `- sample_count: ${result.summary.sample_count}`,
    `- active_sample_count: ${result.summary.active_sample_count}`,
    `- batch_size: ${result.summary.batch_size}`,
    `- batch_status: ${result.summary.batch_status}`,
    `- green: ${result.summary.pool_counts.green}`,
    `- yellow: ${result.summary.pool_counts.yellow}`,
    `- red: ${result.summary.pool_counts.red}`,
    `- suppressed: ${result.summary.suppressed_count}`,
    `- requested_candidate_count: ${result.summary.requested_candidate_count ?? "n/a"}`,
    `- candidate_count: ${result.summary.candidate_count ?? "n/a"}`,
    `- winner_selected_count: ${result.summary.winner_selected_count ?? "n/a"}`,
    `- candidate_best_found_count: ${result.summary.candidate_best_found_count ?? "n/a"}`,
    `- l4_forward_count: ${result.summary.l4_forward_count}`,
    `- red_spot_check_count: ${result.summary.red_spot_check_count}`,
    `- possible_false_reject_count: ${result.summary.possible_false_reject_count}`,
    `- low_quality_pass_count: ${result.summary.low_quality_pass_count}`,
    `- l1_control_followed_count: ${result.summary.l1_control_followed_count}`,
    `- l1_policy_violation_count: ${result.summary.l1_policy_violation_count}`,
    `- l1_handoff_floor_counts: ${JSON.stringify(result.summary.l1_handoff_floor_counts ?? {})}`,
    `- l1_feedback_suggestion_count: ${result.summary.l1_feedback_suggestion_count}`,
    `- l1_feedback_candidate_count_upgrade_count: ${result.summary.l1_feedback_candidate_count_upgrade_count}`,
    `- l1_feedback_handoff_floor_upgrade_count: ${result.summary.l1_feedback_handoff_floor_upgrade_count}`,
    `- avg_quality_score: ${result.summary.avg_quality_score}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    `- memory_writes/zilliz_writes/embedding_creations: ${result.summary.memory_writes}/${result.summary.zilliz_writes}/${result.summary.embedding_creations}`,
    `- route_changes/winner_changes/vps_touches: ${result.summary.route_changes}/${result.summary.winner_changes}/${result.summary.vps_touches}`,
    "",
    "## Pool Logic",
    "",
    "- green: hard gate passed; forward to L4.",
    "- yellow: high-quality hard-gate failure; forward to L4 as false-reject check.",
    "- red: hold for audit lookup, with deterministic spot checks.",
    "- suppressed: L1 blocked L2 generation before any provider call.",
    "",
    "## Candidate Recheck",
    "",
    `- default_mode: ${result.candidate_recheck.policy.default_mode}`,
    `- default_candidate_count: ${result.candidate_recheck.policy.default_candidate_count}`,
    `- switch: ${result.candidate_recheck.policy.switch_flag}`,
    `- recheck_mode: ${result.candidate_recheck.policy.recheck_mode}`,
    `- recheck_candidate_count: ${result.candidate_recheck.policy.recheck_candidate_count}`,
    `- recommended_count: ${result.candidate_recheck.recommended_count}`,
    "",
    ...(
      result.candidate_recheck.recommended.length
        ? result.candidate_recheck.recommended.map((item) => (
          `- ${item.source_id}: pool=${item.pool}, reason=${item.reason}, quality=${item.quality_score}, command=${item.command_hint}`
        ))
        : ["- none"]
    ),
    "",
    "## L1 Signal Dimension Metrics",
    "",
    `- with_l1_profile_count: ${result.l1_signal_dimension_metrics.with_l1_profile_count}`,
    ...result.l1_signal_dimension_metrics.dimensions.map((item) => (
      `- ${item.dimension}: samples=${item.sample_count}, green/yellow/red/suppressed=${item.pool_counts.green}/${item.pool_counts.yellow}/${item.pool_counts.red}/${item.suppressed_count}, recheck_or_multi=${item.recheck_or_multi_pool_count}, avg_quality=${item.avg_quality_score}, avg_weak=${item.avg_weak_task_count}, verdict=${item.verdict}`
    )),
    "",
    "## Violations",
    "",
    ...Object.entries(result.summary.violation_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## L3 Feedback",
    "",
    ...(
      Object.keys(result.summary.l3_feedback_counts ?? {}).length
        ? Object.entries(result.summary.l3_feedback_counts).map(([key, count]) => `- ${key}: ${count}`)
        : ["- none"]
    ),
    "",
    "## L4 Preview",
    ""
  ];

  if (!Object.keys(result.summary.violation_counts).length) {
    lines.splice(lines.indexOf("## L4 Preview") - 1, 0, "- none");
  }
  for (const item of result.l4_handoff.preview) {
    lines.push(`- ${item.source_id}: pool=${item.pool}, quality=${item.quality_score}, actionable=${item.actionableTaskCount}, weak=${item.weakTaskCount}, violations=${item.violations.join(", ") || "none"}`);
  }
  lines.push("", "## Decisions", "");
  for (const decision of result.decisions) {
    const l1Feedback = decision.l1_feedback_suggestion
      ? `, l1_feedback=${JSON.stringify(decision.l1_feedback_suggestion.suggestion)}`
      : "";
    lines.push(`- ${decision.source_id}: pool=${decision.pool}, l4=${decision.l4_review_mode}, quality=${decision.quality_score}${l1Feedback}, reason=${decision.reason_codes.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function artifactPaths({ repoRoot, outDir, now }) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "l2-l3-selection-audit", stamp));
  return {
    outputRoot,
    inputManifestPath: path.join(outputRoot, "input-manifest.json"),
    l2RawResultsPath: path.join(outputRoot, "l2-raw-results.json"),
    poolDecisionsPath: path.join(outputRoot, "pool-decisions.jsonl"),
    qualityReportJsonPath: path.join(outputRoot, "quality-report.json"),
    qualityReportMarkdownPath: path.join(outputRoot, "quality-report.md"),
    l4ReviewPath: path.join(outputRoot, "l4-review.jsonl")
  };
}

export async function writeL2L3SelectionAuditArtifacts({
  repoRoot = process.cwd(),
  result,
  l2Report,
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const paths = artifactPaths({ repoRoot, outDir, now });
  await fs.mkdir(paths.outputRoot, { recursive: true });

  const output = {
    output_dir: path.relative(repoRoot, paths.outputRoot).replaceAll("\\", "/"),
    input_manifest_path: path.relative(repoRoot, paths.inputManifestPath).replaceAll("\\", "/"),
    l2_raw_results_path: path.relative(repoRoot, paths.l2RawResultsPath).replaceAll("\\", "/"),
    pool_decisions_path: path.relative(repoRoot, paths.poolDecisionsPath).replaceAll("\\", "/"),
    quality_report_json_path: path.relative(repoRoot, paths.qualityReportJsonPath).replaceAll("\\", "/"),
    quality_report_markdown_path: path.relative(repoRoot, paths.qualityReportMarkdownPath).replaceAll("\\", "/"),
    l4_review_path: path.relative(repoRoot, paths.l4ReviewPath).replaceAll("\\", "/")
  };
  const written = {
    ...result,
    output
  };
  const inputManifest = {
    schema_version: "misa.l2_l3_selection_input_manifest.v1",
    created_at: result.created_at,
    input: result.input,
    batch_size: result.summary.batch_size,
    sample_count: result.summary.sample_count,
    source_ids: result.decisions.map((decision) => decision.source_id),
    thresholds: result.thresholds,
    safety: result.safety
  };

  await fs.writeFile(paths.inputManifestPath, `${JSON.stringify(inputManifest, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.l2RawResultsPath, `${JSON.stringify(l2Report ?? {}, null, 2)}\n`, "utf8");
  await fs.writeFile(
    paths.poolDecisionsPath,
    result.decisions.map((decision) => JSON.stringify(decision)).join("\n") + "\n",
    "utf8"
  );
  await fs.writeFile(paths.qualityReportJsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.qualityReportMarkdownPath, renderL2L3SelectionAuditMarkdown(written), "utf8");
  await fs.writeFile(paths.l4ReviewPath, "", "utf8");
  return written;
}
