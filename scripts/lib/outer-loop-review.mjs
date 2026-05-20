import fs from "node:fs/promises";
import path from "node:path";
import { average, countBy, round, safeId } from "./evolution-tournament-utils.mjs";

export const DEFAULT_REVIEW_WINDOW = Object.freeze({
  kind: "days",
  value: 7
});

export const OUTER_LOOP_RECOMMENDATION_TYPES = Object.freeze([
  "setpoint_adjustment_candidate",
  "route_recalibration_candidate",
  "metric_registry_expansion_candidate",
  "no_change"
]);

const HUMAN_REVIEW_AUTHORITY = "human_review_required_before_mutation";

function outerLoopSafety() {
  return {
    production_authority: false,
    route_predicate_mutated: false,
    metric_registry_mutated: false,
    setpoint_mutated: false,
    writes_persistent_memory: false,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function proposedMutation() {
  return {
    changes_setpoint: false,
    changes_route_predicate: false,
    changes_metric_registry: false,
    touches_production: false
  };
}

function controlHierarchy() {
  return {
    inner: {
      loop_id: "inner",
      label: "fast actuator and output guard",
      timescale: "milliseconds_to_seconds",
      authority: "block_or_allow_single_local_action",
      commands: [
        "governance dry-run checks",
        "redaction gates",
        "control contract actuator budget checks"
      ],
      may_mutate_route_predicates: false,
      may_mutate_metric_registry: false,
      may_mutate_production: false
    },
    middle: {
      loop_id: "middle",
      label: "candidate evaluation and post-deploy feedback",
      timescale: "hours_to_days",
      authority: "rank_candidates_and_measure_landed_effects",
      commands: [
        "npm run evolution:evaluate:misa",
        "npm run evolution:tournament:misa",
        "npm run post-deploy:measure",
        "npm run stability:monitor"
      ],
      may_mutate_route_predicates: false,
      may_mutate_metric_registry: false,
      may_mutate_production: false
    },
    outer: {
      loop_id: "outer",
      label: "slow setpoint and route-criteria review",
      timescale: "weeks_to_months",
      authority: "recommend_human_review_for_control_contract_changes",
      commands: [
        "npm run outer-loop:review",
        "npm run calibrate:current-line",
        "npm run health:qianxuesen",
        "npm run precheck"
      ],
      may_mutate_route_predicates: false,
      may_mutate_metric_registry: false,
      may_mutate_production: false
    }
  };
}

function windowBounds(now, reviewWindow) {
  const endedAt = now.toISOString();
  const started = new Date(now);
  if (reviewWindow.kind === "days") {
    started.setUTCDate(started.getUTCDate() - reviewWindow.value);
  }
  return {
    kind: reviewWindow.kind,
    value: reviewWindow.value,
    started_at: started.toISOString(),
    ended_at: endedAt
  };
}

function distanceToTarget({ direction, target_value: targetValue }, value) {
  if (direction === "minimize") {
    return Math.max(0, value - targetValue);
  }
  if (direction === "maximize") {
    return Math.max(0, targetValue - value);
  }
  return Math.abs(value - targetValue);
}

function lastValue(values) {
  return values.length === 0 ? null : values[values.length - 1];
}

function recommendationBase({ recommendationId, recommendationType, targetSurface, metricId, routeTarget, reason, evidence }) {
  return {
    recommendation_id: recommendationId,
    recommendation_type: recommendationType,
    status: recommendationType === "no_change" ? "no_change" : "candidate",
    target_surface: targetSurface,
    metric_id: metricId ?? null,
    route_target: routeTarget ?? null,
    reason,
    authority: HUMAN_REVIEW_AUTHORITY,
    proposed_mutation: proposedMutation(),
    evidence
  };
}

function reviewMetricTrend(trend) {
  const samples = (trend.samples ?? []).map(Number).filter(Number.isFinite);
  const latest = lastValue(samples);
  if (latest === null) {
    return recommendationBase({
      recommendationId: `outer-${safeId(trend.metric_id)}-no-data`,
      recommendationType: "no_change",
      targetSurface: "setpoint",
      metricId: trend.metric_id,
      routeTarget: trend.route_target,
      reason: "No numeric samples were available in the outer-loop review window.",
      evidence: {
        sample_count: 0
      }
    });
  }

  const first = samples[0];
  const firstDistance = distanceToTarget(trend, first);
  const latestDistance = distanceToTarget(trend, latest);
  const improvement = firstDistance - latestDistance;
  const outsideTolerance = latestDistance > trend.tolerance;
  const insufficientProgress = improvement < trend.tolerance;
  const recommendationType = outsideTolerance && insufficientProgress
    ? "setpoint_adjustment_candidate"
    : "no_change";

  return recommendationBase({
    recommendationId: `outer-${safeId(trend.metric_id)}-${recommendationType}`,
    recommendationType,
    targetSurface: "setpoint",
    metricId: trend.metric_id,
    routeTarget: trend.route_target,
    reason: recommendationType === "setpoint_adjustment_candidate"
      ? "Metric stayed outside tolerance without enough movement toward the registered setpoint."
      : "Metric trend is within tolerance or moving toward the registered setpoint.",
    evidence: {
      plant_state_component: trend.plant_state_component,
      direction: trend.direction,
      target_value: trend.target_value,
      tolerance: trend.tolerance,
      sample_count: samples.length,
      first_value: round(first),
      latest_value: round(latest),
      average_value: round(average(samples)),
      first_distance_to_target: round(firstDistance),
      latest_distance_to_target: round(latestDistance),
      improvement: round(improvement)
    }
  });
}

function reviewRouteOutcome(outcome) {
  const evaluated = Math.max(0, Number(outcome.evaluated_count ?? 0));
  const rejected = Math.max(0, Number(outcome.rejected_count ?? 0));
  const postDeploy = Math.max(0, Number(outcome.post_deploy_count ?? 0));
  const negative = Math.max(0, Number(outcome.confirmed_negative_count ?? 0));
  const rejectionRate = evaluated === 0 ? 0 : rejected / evaluated;
  const negativeRate = postDeploy === 0 ? 0 : negative / postDeploy;
  const threshold = outcome.thresholds ?? {};
  const rejectionThreshold = threshold.rejection_rate ?? 0.45;
  const negativeThreshold = threshold.post_deploy_negative_rate ?? 0.4;
  const shouldRecalibrate = rejectionRate >= rejectionThreshold || negativeRate >= negativeThreshold;

  if (!shouldRecalibrate) {
    return null;
  }

  return recommendationBase({
    recommendationId: `outer-${safeId(outcome.route_target)}-route-recalibration`,
    recommendationType: "route_recalibration_candidate",
    targetSurface: "route_criteria",
    metricId: outcome.metric_id ?? null,
    routeTarget: outcome.route_target,
    reason: "Route outcomes crossed the slow-loop recalibration threshold.",
    evidence: {
      evaluated_count: evaluated,
      rejected_count: rejected,
      rejection_rate: round(rejectionRate),
      rejection_rate_threshold: rejectionThreshold,
      post_deploy_count: postDeploy,
      confirmed_negative_count: negative,
      post_deploy_negative_rate: round(negativeRate),
      post_deploy_negative_rate_threshold: negativeThreshold
    }
  });
}

function reviewMetricRegistryGap(gap) {
  return recommendationBase({
    recommendationId: `outer-${safeId(gap.metric_id)}-metric-registry`,
    recommendationType: "metric_registry_expansion_candidate",
    targetSurface: "metric_registry",
    metricId: gap.metric_id,
    routeTarget: gap.route_target ?? null,
    reason: gap.reason ?? "Repeated evidence references a plant state component without a registered metric.",
    evidence: {
      plant_state_component: gap.plant_state_component,
      observed_signal: gap.observed_signal,
      evidence_count: gap.evidence_count ?? 1
    }
  });
}

function summarizeRecommendations(recommendations) {
  const typeCounts = countBy(recommendations, (item) => item.recommendation_type);
  for (const type of OUTER_LOOP_RECOMMENDATION_TYPES) {
    typeCounts[type] ??= 0;
  }
  const metricIds = [...new Set(recommendations.map((item) => item.metric_id).filter(Boolean))].sort();

  return {
    recommendation_count: recommendations.length,
    actionable_recommendation_count: recommendations.filter((item) => item.status === "candidate").length,
    setpoint_adjustment_candidate_count: typeCounts.setpoint_adjustment_candidate,
    route_recalibration_candidate_count: typeCounts.route_recalibration_candidate,
    metric_registry_expansion_candidate_count: typeCounts.metric_registry_expansion_candidate,
    no_change_count: typeCounts.no_change,
    route_counts: countBy(recommendations, (item) => item.route_target ?? "unscoped"),
    metric_ids: metricIds,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

export function reviewOuterLoop({
  metricTrends = sampleOuterLoopMetricTrends(),
  routeOutcomes = sampleOuterLoopRouteOutcomes(),
  metricRegistryGaps = sampleOuterLoopMetricRegistryGaps(),
  reviewWindow = DEFAULT_REVIEW_WINDOW,
  now = new Date()
} = {}) {
  const metricRecommendations = (metricTrends ?? []).map(reviewMetricTrend);
  const routeRecommendations = (routeOutcomes ?? [])
    .map(reviewRouteOutcome)
    .filter(Boolean);
  const registryRecommendations = (metricRegistryGaps ?? []).map(reviewMetricRegistryGap);
  const recommendations = [
    ...metricRecommendations,
    ...routeRecommendations,
    ...registryRecommendations
  ];
  const violations = [];

  return {
    schema_version: "misa.outer_loop_review.v1",
    mode: "outer-loop-review",
    ok: violations.length === 0,
    created_at: now.toISOString(),
    review_window: windowBounds(now, reviewWindow),
    summary: summarizeRecommendations(recommendations),
    recommendations,
    control_hierarchy: controlHierarchy(),
    safety: outerLoopSafety(),
    warnings: recommendations.some((item) => item.status === "candidate")
      ? ["Outer-loop candidates are recommendations only; human review is required before changing setpoints, route predicates, or metric registry entries."]
      : [],
    violations
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function runOuterLoopReview({
  metricTrends,
  routeOutcomes,
  metricRegistryGaps,
  reviewWindow,
  now = new Date(),
  outFile
} = {}) {
  const report = reviewOuterLoop({
    metricTrends,
    routeOutcomes,
    metricRegistryGaps,
    reviewWindow,
    now
  });
  if (outFile) {
    await writeJson(outFile, report);
  }
  return report;
}

export function sampleOuterLoopMetricTrends() {
  return [
    {
      metric_id: "skill.replay_pass_rate",
      plant_state_component: "skills.replay_pass_rate",
      route_target: "skill",
      direction: "maximize",
      target_value: 0.92,
      tolerance: 0.03,
      samples: [0.78, 0.79, 0.8]
    },
    {
      metric_id: "memory.pollution_rate",
      plant_state_component: "memory.pollution_rate",
      route_target: "memory",
      direction: "minimize",
      target_value: 0.02,
      tolerance: 0.01,
      samples: [0.042, 0.034, 0.028]
    },
    {
      metric_id: "provider.timeout_rate",
      plant_state_component: "providers.timeout_rate",
      route_target: "case",
      direction: "minimize",
      target_value: 0.05,
      tolerance: 0.02,
      samples: [0.09, 0.095, 0.11]
    }
  ];
}

export function sampleOuterLoopRouteOutcomes() {
  return [
    {
      route_target: "memory",
      metric_id: "memory.pollution_rate",
      evaluated_count: 8,
      rejected_count: 2,
      post_deploy_count: 4,
      confirmed_negative_count: 2
    },
    {
      route_target: "skill",
      metric_id: "skill.replay_pass_rate",
      evaluated_count: 10,
      rejected_count: 2,
      post_deploy_count: 3,
      confirmed_negative_count: 0
    }
  ];
}

export function sampleOuterLoopMetricRegistryGaps() {
  return [
    {
      metric_id: "mail_triage.tool_selection_failure_rate",
      plant_state_component: "mail_triage.tool_selection_failure_rate",
      route_target: "case",
      observed_signal: "tool_selection_failure",
      evidence_count: 4,
      reason: "Mail triage actuator checks can pass while tool-selection failures remain unmeasured."
    }
  ];
}
