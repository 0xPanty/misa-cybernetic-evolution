import { JUDGE_NEAR_THRESHOLD_MARGIN } from "./evolution-tournament-contract.mjs";
import {
  average,
  clamp01,
  round,
  uniqueStrings
} from "./evolution-tournament-utils.mjs";

function topWinnerPairs(tournaments) {
  return tournaments
    .map((tournament) => tournament.variants
      .filter((variant) => variant.constraints.hard_gate_passed)
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, 2)
      .map((variant) => ({ tournament, variant })))
    .filter((top) => top.length === 2)
    .map(([winner, runnerUp]) => ({
      tournament: winner.tournament,
      winner: winner.variant,
      runner_up: runnerUp.variant,
      margin: round(winner.variant.scores.composite - runnerUp.variant.scores.composite)
    }));
}

function rejectionReasonClusters(rejectedLedger) {
  return uniqueStrings((rejectedLedger ?? []).flatMap((item) => [
    ...(item.violations ?? []),
    ...(item.blocked_requests ?? []).map((request) => `blocked:${request}`)
  ]));
}

function winnerNoveltyAverage(result) {
  const variantsById = new Map(result.tournaments
    .flatMap((tournament) => tournament.variants)
    .map((variant) => [variant.variant_id, variant]));
  return average(result.winner_queue.map((winner) => (
    variantsById.get(winner.variant_id)?.scores.novelty ?? 0
  )));
}

function reviewTargetPriority(score) {
  if (score >= 0.78) {
    return "high";
  }
  if (score >= 0.58) {
    return "medium";
  }
  return "low";
}

function buildLlmReviewValue({
  result,
  routes,
  sourceBacked,
  realVpsSample,
  closeWinnerPairs,
  closeWinnerCount,
  highScoreNarrowStrategy,
  repeatedRejectionPattern,
  lowSourceCoverage,
  policySkillPressure,
  policyMemoryPressure,
  largeBatchReview
}) {
  const tournamentCount = Math.max(1, result.summary.tournament_count);
  const routeCounts = result.summary.route_counts ?? {};
  const closeWinnerRatio = round(closeWinnerCount / tournamentCount);
  const reviewableStrategyBias = highScoreNarrowStrategy
    && (routes.length >= 2 || result.summary.winner_count >= 5);
  const dampingClosePairs = closeWinnerPairs.filter((pair) => (
    pair.tournament.route_target === "damping"
      && pair.margin <= 0.005
  ));
  const targets = [];
  const pushTarget = (target, score, sampleCount, evidence) => {
    if (sampleCount <= 0) {
      return;
    }
    targets.push({
      target,
      priority: reviewTargetPriority(score),
      score: round(score),
      sample_count: sampleCount,
      evidence: uniqueStrings(evidence)
    });
  };

  pushTarget("public_boundary", 0.86, realVpsSample ? tournamentCount : 0, [
    "source_kind=vps_sanitized_conversation_artifacts",
    "review redaction, public-channel wording, and no-live-effect boundary"
  ]);
  pushTarget("batch_pattern_review", 0.84, largeBatchReview ? tournamentCount : 0, [
    `tournament_count=${result.summary.tournament_count}`,
    `routes=${routes.join(",")}`
  ]);
  pushTarget("damping_vs_compact", 0.82, dampingClosePairs.length, [
    `tight_damping_margin_count=${dampingClosePairs.length}`,
    `min_damping_margin=${dampingClosePairs.length ? Math.min(...dampingClosePairs.map((pair) => pair.margin)) : null}`,
    "review whether weak evidence should stay damped instead of being compacted"
  ]);
  pushTarget("winner_strategy_bias", 0.82, reviewableStrategyBias ? result.summary.winner_count : 0, [
    "high deterministic score with narrow winner strategy",
    "review whether one strategy is hiding route-specific alternatives across enough route/sample pressure"
  ]);
  pushTarget("policy_skill_boundary", 0.72, policySkillPressure ? (routeCounts.policy ?? 0) + (routeCounts.skill ?? 0) : 0, [
    `policy_count=${routeCounts.policy ?? 0}`,
    `skill_count=${routeCounts.skill ?? 0}`,
    "review whether reusable workflow pressure should become a skill or stay policy-bound"
  ]);
  pushTarget("policy_memory_boundary", 0.64, policyMemoryPressure ? (routeCounts.policy ?? 0) + (routeCounts.memory ?? 0) : 0, [
    `policy_count=${routeCounts.policy ?? 0}`,
    `memory_count=${routeCounts.memory ?? 0}`,
    "review whether policy pressure is being over-compressed into memory"
  ]);
  pushTarget("close_tiebreak_review", 0.55, closeWinnerCount >= 2 && closeWinnerRatio >= 0.5 ? closeWinnerCount : 0, [
    `close_winner_count=${closeWinnerCount}`,
    `close_winner_ratio=${closeWinnerRatio}`,
    "review only the rationale, not deterministic winner authority"
  ]);
  pushTarget("rejection_pattern_review", 0.58, repeatedRejectionPattern ? result.summary.rejected_variant_count : 0, [
    "few repeated rejection clusters",
    "review whether one blocked shape needs a better negative fixture"
  ]);
  pushTarget("source_sampling_gap", 0.36, sourceBacked && lowSourceCoverage ? result.summary.tournament_count : 0, [
    `source_coverage=${result.quality_assessment.dimensions.source_coverage}`,
    "review sample coverage before spending model calls on conclusions"
  ]);

  const maxTargetScore = targets.length
    ? Math.max(...targets.map((target) => target.score))
    : 0;
  const diversityBoost = Math.min(0.06, Math.max(0, targets.length - 1) * 0.015);
  const score = round(clamp01(maxTargetScore + diversityBoost));
  const level = score >= 0.78
    ? "high"
    : score >= 0.58
      ? "medium"
      : score >= 0.35
        ? "low"
        : "none";

  return {
    mode: "llm_review_value.v1",
    level,
    score,
    expected_value: level === "none"
      ? "none"
      : level === "low"
        ? "diagnostic_note_only"
        : "critique_only",
    should_change_winner: false,
    call_policy: level === "high"
      ? "call_when_auto_enabled"
      : level === "medium"
        ? "deterministic_default_review_optional"
        : "do_not_call",
    waste_risk: level === "high"
      ? "low"
      : level === "medium"
        ? "medium"
        : "high",
    close_winner_ratio: closeWinnerRatio,
    targets,
    notes: [
      targets.length > 0
        ? `Concrete review targets: ${targets.map((target) => target.target).join(", ")}.`
        : "No concrete LLM review target was found.",
      level === "high"
        ? "Auto mode may spend one offline LLM call because expected critique value is high."
        : level === "medium"
          ? "Default stays deterministic; review is optional because expected value is not high enough for auto spend."
          : "Do not spend an LLM call unless a human explicitly overrides the gate."
    ]
  };
}

export function buildJudgeEscalationGate(result, { threshold = 0.65 } = {}) {
  const normalizedThreshold = clamp01(threshold);
  const routes = Object.keys(result.summary.route_counts ?? {})
    .filter((route) => (result.summary.route_counts[route] ?? 0) > 0);
  const routeSet = new Set(routes);
  const winnerStrategies = uniqueStrings(result.winner_queue.map((winner) => winner.strategy));
  const sourceKind = result.source.source_kind ?? "default_candidate_preflight";
  const sourceBacked = sourceKind !== "default_candidate_preflight";
  const realVpsSample = sourceKind === "vps_sanitized_conversation_artifacts";
  const closePairs = topWinnerPairs(result.tournaments);
  const margins = closePairs.map((pair) => pair.margin);
  const closeWinnerCount = margins.filter((margin) => margin <= 0.03).length;
  const rejectionClusters = rejectionReasonClusters(result.rejected_variant_ledger);
  const winnerStrategyMonoculture = winnerStrategies.length <= 1 && result.summary.winner_count >= 2;
  const highScoreNarrowStrategy = Boolean(
    winnerStrategyMonoculture
      && result.quality_assessment.overall_quality_score >= 0.9
      && result.summary.winner_count >= 2
  );
  const lowSourceCoverage = result.quality_assessment.dimensions.source_coverage < 0.5;
  const repeatedRejectionPattern = Boolean(
    result.summary.rejected_variant_count >= 3
      && rejectionClusters.length > 0
      && rejectionClusters.length <= 2
  );
  const policySkillPressure = routeSet.has("policy") && routeSet.has("skill");
  const policyMemoryPressure = routeSet.has("policy") && routeSet.has("memory");
  const mixedRoutePressure = routes.length >= 3;
  const largeBatchReview = result.summary.tournament_count >= 20;

  const uncertainty = clamp01(Math.max(
    closeWinnerCount / Math.max(1, result.summary.tournament_count),
    winnerStrategyMonoculture ? 0.55 : 0,
    highScoreNarrowStrategy ? 0.72 : 0
  ));
  const value = clamp01(Math.max(
    realVpsSample ? 0.82 : 0,
    sourceBacked ? 0.62 : 0,
    largeBatchReview ? 0.78 : 0,
    routeSet.has("policy") ? 0.58 : 0,
    result.summary.tournament_count >= 5 ? 0.45 : 0
  ));
  const conflict = clamp01(Math.max(
    routes.length >= 5 ? 0.9 : 0,
    mixedRoutePressure ? 0.68 : 0,
    policySkillPressure ? 0.74 : 0,
    policyMemoryPressure ? 0.7 : 0
  ));
  const novelty = clamp01(Math.max(
    sourceBacked ? 0.46 : 0,
    routes.length >= 4 ? 0.62 : 0,
    winnerNoveltyAverage(result)
  ));
  const anomaly = clamp01(Math.max(
    highScoreNarrowStrategy ? 0.82 : 0,
    repeatedRejectionPattern ? 0.58 : 0,
    lowSourceCoverage ? 0.66 : 0
  ));
  const score = round(
    uncertainty * 0.3
      + value * 0.25
      + conflict * 0.2
      + novelty * 0.15
      + anomaly * 0.1
  );
  const llmReviewValue = buildLlmReviewValue({
    result,
    routes,
    sourceBacked,
    realVpsSample,
    closeWinnerPairs: closePairs,
    closeWinnerCount,
    highScoreNarrowStrategy,
    repeatedRejectionPattern,
    lowSourceCoverage,
    policySkillPressure,
    policyMemoryPressure,
    largeBatchReview
  });
  const recommended = llmReviewValue.level === "high"
    && score >= normalizedThreshold - JUDGE_NEAR_THRESHOLD_MARGIN;
  const reviewValueAtLeastMedium = ["medium", "high"].includes(llmReviewValue.level);
  const nearThreshold = !recommended && (
    reviewValueAtLeastMedium
      && (score >= normalizedThreshold - JUDGE_NEAR_THRESHOLD_MARGIN
        || (llmReviewValue.level === "medium" && score >= 0.45))
  );
  const thresholdDelta = round(score - normalizedThreshold);
  const reasons = uniqueStrings([
    closeWinnerCount > 0 ? "close_variant_scores" : null,
    winnerStrategyMonoculture ? "winner_strategy_monoculture" : null,
    highScoreNarrowStrategy ? "high_score_but_narrow_strategy" : null,
    realVpsSample ? "real_vps_sample" : null,
    sourceBacked && !realVpsSample ? "source_backed_sample" : null,
    mixedRoutePressure ? "mixed_route_pressure" : null,
    policySkillPressure ? "policy_skill_pressure" : null,
    policyMemoryPressure ? "policy_memory_pressure" : null,
    largeBatchReview ? "large_batch_review" : null,
    repeatedRejectionPattern ? "repeated_rejection_pattern" : null,
    lowSourceCoverage ? "low_source_coverage" : null,
    llmReviewValue.level !== "none" ? `llm_review_value_${llmReviewValue.level}` : null,
    nearThreshold ? "near_threshold" : null
  ]);

  return {
    mode: "judge_escalation_gate.v1",
    recommended,
    near_threshold: nearThreshold,
    score,
    threshold: normalizedThreshold,
    threshold_delta: thresholdDelta,
    near_threshold_margin: JUDGE_NEAR_THRESHOLD_MARGIN,
    suggested_mode: recommended
      ? "auto_or_llm_review_only"
      : nearThreshold
        ? "deterministic_default_review_optional"
        : "deterministic_only",
    authority: "llm_cannot_change_route_or_winner",
    llm_api_calls: 0,
    dimensions: {
      uncertainty: round(uncertainty),
      value: round(value),
      conflict: round(conflict),
      novelty: round(novelty),
      anomaly: round(anomaly)
    },
    llm_review_value: llmReviewValue,
    signals: {
      source_kind: sourceKind,
      source_backed: sourceBacked,
      real_vps_sample: realVpsSample,
      route_kinds: routes.length,
      route_targets: routes,
      winner_strategy_diversity: winnerStrategies.length,
      winner_strategy_monoculture: winnerStrategyMonoculture,
      close_winner_count: closeWinnerCount,
      rejected_reason_cluster_count: rejectionClusters.length,
      repeated_rejection_pattern: repeatedRejectionPattern
    },
    reasons,
    notes: [
      "Escalation advice is deterministic and local; it never calls an LLM by itself.",
      recommended
        ? "The sample has high concrete review value, so auto mode may call one offline LLM for critique only."
        : nearThreshold
          ? "Default stays deterministic, but this sample is worth human awareness or optional review if the decision matters."
          : "The deterministic proxy is enough for this sample unless a human forces LLM review."
    ]
  };
}

function buildJudgePayload(result) {
  return {
    mode: result.mode,
    source: result.source,
    summary: result.summary,
    quality_assessment: result.quality_assessment,
    judge_escalation: result.judge_escalation,
    llm_review_value: result.judge_escalation?.llm_review_value ?? null,
    tournaments: result.tournaments.map((tournament) => ({
      tournament_id: tournament.tournament_id,
      route_target: tournament.route_target,
      winner: tournament.winner,
      loser_ledger: tournament.loser_ledger,
      variants: tournament.variants.map((variant) => ({
        variant_id: variant.variant_id,
        strategy: variant.strategy,
        status: variant.tournament_status,
        scores: variant.scores,
        violations: variant.constraints.violations,
        blocked_requests: variant.constraints.blocked_requests,
        proposed_change: variant.proposed_change.slice(0, 600)
      }))
    }))
  };
}

function normalizeJudgeResponse(raw, { mode, model, calls }) {
  const dimensions = raw?.dimensions && typeof raw.dimensions === "object"
    ? raw.dimensions
    : {};
  const boundedScore = typeof raw?.overall_quality_score === "number"
    ? Math.min(1, Math.max(0, raw.overall_quality_score))
    : null;

  return {
    mode,
    status: "completed",
    llm_api_calls: calls,
    model,
    overall_quality_score: boundedScore,
    dimensions: {
      route_preservation: typeof dimensions.route_preservation === "number" ? round(dimensions.route_preservation) : null,
      safety_lock: typeof dimensions.safety_lock === "number" ? round(dimensions.safety_lock) : null,
      holdout_strength: typeof dimensions.holdout_strength === "number" ? round(dimensions.holdout_strength) : null,
      failure_learning: typeof dimensions.failure_learning === "number" ? round(dimensions.failure_learning) : null,
      compactness: typeof dimensions.compactness === "number" ? round(dimensions.compactness) : null,
      source_coverage: typeof dimensions.source_coverage === "number" ? round(dimensions.source_coverage) : null
    },
    notes: uniqueStrings(raw?.notes ?? raw?.reflection_notes ?? []),
    suggested_next_experiments: uniqueStrings(raw?.suggested_next_experiments ?? [])
  };
}

async function callOpenAiCompatibleJudge(payload, { model, apiKey, baseUrl }) {
  const response = await fetch(baseUrl ?? "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are an offline reviewer for a Qianxuesen control-theory learning gate.",
            "Return JSON only. You may score and reflect, but you cannot approve production changes.",
            "Keep route ownership with Qianxuesen and preserve no-live-effect boundaries.",
            "Spend attention only where llm_review_value lists concrete critique targets."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Score the tournament result for draft quality. Do not change the winner. If review targets are weak, say so instead of inventing value.",
            expected_json: {
              overall_quality_score: "number 0..1",
              dimensions: {
                route_preservation: "number 0..1",
                safety_lock: "number 0..1",
                holdout_strength: "number 0..1",
                failure_learning: "number 0..1",
                compactness: "number 0..1",
                source_coverage: "number 0..1"
              },
              notes: ["short actionable reflections"],
              suggested_next_experiments: ["local-only experiments"]
            },
            payload
          })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`judge request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("judge response did not include message content");
  }
  return JSON.parse(content);
}

function emptyJudgeDimensions() {
  return {
    route_preservation: null,
    safety_lock: null,
    holdout_strength: null,
    failure_learning: null,
    compactness: null,
    source_coverage: null
  };
}

function skippedJudge({ mode, status, model = null, notes, suggestedNextExperiments = [] }) {
  return {
    mode,
    status,
    llm_api_calls: 0,
    model,
    overall_quality_score: null,
    dimensions: emptyJudgeDimensions(),
    notes,
    suggested_next_experiments: suggestedNextExperiments
  };
}

export async function runOptionalJudge(result, {
  judgeMode = "advise",
  judgeModel = process.env.MISA_EVOLUTION_JUDGE_MODEL ?? "gpt-4.1-mini",
  judgeApiKey = process.env.MISA_EVOLUTION_JUDGE_API_KEY ?? process.env.OPENAI_API_KEY,
  judgeBaseUrl = process.env.MISA_EVOLUTION_JUDGE_BASE_URL,
  judgeEscalation,
  llmJudge
} = {}) {
  const reviewTargets = judgeEscalation?.llm_review_value?.targets?.map((target) => target.target) ?? [];
  const reviewTargetNote = reviewTargets.length > 0
    ? `Expected LLM review value targets: ${reviewTargets.join(", ")}.`
    : "No concrete LLM review value target was found.";

  if (judgeMode === "off") {
    return skippedJudge({
      mode: "off",
      status: "not_requested",
      notes: ["LLM judge is off; deterministic quality score is the comparison baseline."]
    });
  }

  if (judgeMode === "advise") {
    return skippedJudge({
      mode: "advise",
      status: "advice_only",
      notes: [
        judgeEscalation?.recommended
          ? "Escalation gate recommends optional LLM review because concrete critique value is high, but advise mode does not call a model."
          : judgeEscalation?.near_threshold
            ? "Escalation gate is near threshold or medium-value; advise mode keeps deterministic default and marks optional review as a human choice."
            : "Escalation gate does not recommend LLM review for this sample.",
        reviewTargetNote,
        "Use --judge-mode auto to call the judge only when the gate recommends it, or --judge-mode llm to force it."
      ],
      suggestedNextExperiments: judgeEscalation?.recommended
        ? ["Run --judge-mode auto on the same local sample if model-review notes are worth the cost."]
        : judgeEscalation?.near_threshold
          ? ["Keep deterministic default; force --judge-mode llm only if this near-threshold sample is decision-critical."]
          : []
    });
  }

  if (judgeMode === "auto" && !judgeEscalation?.recommended) {
    return skippedJudge({
      mode: "auto",
      status: "skipped_not_recommended",
      model: judgeModel,
      notes: [
        judgeEscalation?.near_threshold
          ? "Escalation gate is near threshold or medium-value, but auto mode only calls LLM when concrete critique value is high; it stayed at zero calls."
          : "Escalation gate did not find enough concrete review value; auto mode stayed at zero calls.",
        reviewTargetNote
      ]
    });
  }

  if (!["auto", "llm"].includes(judgeMode)) {
    return skippedJudge({
      mode: judgeMode,
      status: "unsupported_mode",
      notes: [`Unsupported judge mode: ${judgeMode}`]
    });
  }

  if (!llmJudge && !judgeApiKey) {
    return skippedJudge({
      mode: judgeMode,
      status: "skipped_missing_api_key",
      model: judgeModel,
      notes: ["Set MISA_EVOLUTION_JUDGE_API_KEY or OPENAI_API_KEY to run the optional offline LLM judge."]
    });
  }

  try {
    const payload = buildJudgePayload(result);
    const raw = llmJudge
      ? await llmJudge(payload)
      : await callOpenAiCompatibleJudge(payload, {
          model: judgeModel,
          apiKey: judgeApiKey,
          baseUrl: judgeBaseUrl
        });
    return normalizeJudgeResponse(raw, { mode: judgeMode, model: judgeModel, calls: 1 });
  } catch (error) {
    return {
      mode: judgeMode,
      status: "failed",
      llm_api_calls: llmJudge ? 0 : 1,
      model: judgeModel,
      overall_quality_score: null,
      dimensions: emptyJudgeDimensions(),
      notes: [`LLM judge failed: ${error.message}`],
      suggested_next_experiments: []
    };
  }
}

export function buildQualityComparison(qualityAssessment, judge) {
  const llmScore = judge.status === "completed" ? judge.overall_quality_score : null;
  const baselineOnly = ["off", "advise"].includes(judge.mode)
    || judge.status === "skipped_not_recommended";
  return {
    mode: "deterministic_vs_optional_llm",
    status: judge.status === "completed"
      ? "completed"
      : baselineOnly
        ? "baseline_only"
        : "llm_not_available",
    deterministic_overall_quality_score: qualityAssessment.overall_quality_score,
    llm_overall_quality_score: llmScore,
    delta: typeof llmScore === "number"
      ? round(llmScore - qualityAssessment.overall_quality_score)
      : null,
    decision_authority: "deterministic_qianxuesen_gate_only"
  };
}
