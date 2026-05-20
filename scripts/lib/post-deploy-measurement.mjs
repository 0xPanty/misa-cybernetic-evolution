import { countBy, round, safeId } from "./evolution-tournament-utils.mjs";

export const POST_DEPLOY_DECISIONS = Object.freeze([
  "pending",
  "confirmed_positive",
  "confirmed_negative",
  "null_effect"
]);

const CANDIDATE_KINDS = new Set(["skill", "memory", "case", "policy"]);
const DIRECTIONS = new Set(["minimize", "maximize", "hold_within"]);
const MEASUREMENT_WINDOW_KINDS = new Set(["days", "sessions", "samples"]);

function measurementSafety() {
  return {
    production_authority: false,
    publication_allowed: false,
    persistent_write_allowed: false,
    rollback_executed: false,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function asFiniteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${field} must be a finite number`);
  }
  return number;
}

function normalizeDirection(direction) {
  if (!DIRECTIONS.has(direction)) {
    throw new Error(`unsupported deployment ticket direction: ${direction}`);
  }
  return direction;
}

function normalizeCandidateKind(kind) {
  if (!CANDIDATE_KINDS.has(kind)) {
    throw new Error(`unsupported deployment ticket candidate kind: ${kind}`);
  }
  return kind;
}

function normalizeMeasurementWindow(window) {
  return {
    kind: MEASUREMENT_WINDOW_KINDS.has(window?.kind) ? window.kind : "sessions",
    value: Number.isInteger(window?.value) && window.value > 0 ? window.value : 50
  };
}

function distanceToTarget(value, target, direction) {
  if (direction === "minimize") {
    return Math.max(0, value - target);
  }
  if (direction === "maximize") {
    return Math.max(0, target - value);
  }
  return Math.abs(value - target);
}

function classifyDelta({ preDistance, postDistance, tolerance }) {
  if (postDistance === null) {
    return "pending";
  }
  const delta = preDistance - postDistance;
  if (delta > tolerance || (preDistance > tolerance && postDistance <= tolerance)) {
    return "confirmed_positive";
  }
  if (delta < -tolerance) {
    return "confirmed_negative";
  }
  return "null_effect";
}

function rollbackForDecision(decision, metricId) {
  if (decision !== "confirmed_negative") {
    return {
      recommended: false,
      executed: false,
      authority: "human_or_production_plane_only",
      reason: null
    };
  }

  return {
    recommended: true,
    executed: false,
    authority: "human_or_production_plane_only",
    reason: `${metricId} moved away from its setpoint; local plane may recommend rollback but cannot execute it.`
  };
}

function dampingForDecision(decision, metricId) {
  if (decision !== "confirmed_negative") {
    return {
      recommended: false,
      case_candidate: false,
      reason: null
    };
  }

  return {
    recommended: true,
    case_candidate: true,
    reason: `${metricId} negative post-deploy result should enter damping as failed-outcome evidence.`
  };
}

export function measurePostDeployTicket(ticket, { now = new Date() } = {}) {
  const direction = normalizeDirection(ticket.direction);
  const candidateKind = normalizeCandidateKind(ticket.candidate_kind);
  const routeTarget = ticket.route_target ?? candidateKind;
  if (routeTarget !== candidateKind) {
    throw new Error("deployment ticket route_target must match candidate_kind");
  }

  const targetValue = asFiniteNumber(ticket.target_value, "target_value");
  const tolerance = Math.max(0, asFiniteNumber(ticket.tolerance, "tolerance"));
  const preDeployValue = asFiniteNumber(ticket.pre_deploy_value, "pre_deploy_value");
  const postDeployValue = ticket.post_deploy_value === null || ticket.post_deploy_value === undefined
    ? null
    : asFiniteNumber(ticket.post_deploy_value, "post_deploy_value");
  const preDistance = round(distanceToTarget(preDeployValue, targetValue, direction));
  const postDistance = postDeployValue === null
    ? null
    : round(distanceToTarget(postDeployValue, targetValue, direction));
  const decision = classifyDelta({ preDistance, postDistance, tolerance });
  const delta = postDistance === null ? null : round(preDistance - postDistance);

  return {
    schema_version: "misa.deployment_ticket.v1",
    deployment_id: ticket.deployment_id ?? `deploy-${safeId(ticket.candidate_id)}-${safeId(ticket.setpoint_metric_id)}`,
    candidate_id: ticket.candidate_id,
    candidate_kind: candidateKind,
    route_target: routeTarget,
    review_route: "post_deploy_review",
    setpoint_metric_id: ticket.setpoint_metric_id,
    target_value: targetValue,
    tolerance,
    direction,
    pre_deploy_value: preDeployValue,
    post_deploy_value: postDeployValue,
    measurement_window: normalizeMeasurementWindow(ticket.measurement_window),
    decision_at_window_end: decision,
    measurement: {
      classifier: "deterministic_distance_to_setpoint_v1",
      pre_distance_to_target: preDistance,
      post_distance_to_target: postDistance,
      delta_toward_target: delta,
      within_tolerance: postDistance === null ? null : postDistance <= tolerance,
      llm_api_calls: 0
    },
    rollback: rollbackForDecision(decision, ticket.setpoint_metric_id),
    damping: dampingForDecision(decision, ticket.setpoint_metric_id),
    safety: measurementSafety(),
    evidence: [
      ...(Array.isArray(ticket.evidence) ? ticket.evidence : []),
      {
        source: "post_deploy_measurement",
        note: `Measured by deterministic post-deploy classifier at ${now.toISOString()}.`
      }
    ]
  };
}

function compactHistoricalResult(ticket) {
  return {
    deployment_id: ticket.deployment_id,
    candidate_id: ticket.candidate_id,
    candidate_kind: ticket.candidate_kind,
    route_target: ticket.route_target,
    setpoint_metric_id: ticket.setpoint_metric_id,
    direction: ticket.direction,
    decision_at_window_end: ticket.decision_at_window_end,
    pre_deploy_value: ticket.pre_deploy_value,
    post_deploy_value: ticket.post_deploy_value,
    target_value: ticket.target_value,
    tolerance: ticket.tolerance,
    measurement_window: ticket.measurement_window,
    rollback_recommended: ticket.rollback.recommended,
    rollback_executed: ticket.rollback.executed,
    damping_recommended: ticket.damping.recommended,
    production_authority: ticket.safety.production_authority,
    llm_api_calls: ticket.safety.llm_api_calls
  };
}

export function summarizeHistoricalPostDeployResults(results = [], { now = new Date() } = {}) {
  const measured = results.map((result) => measurePostDeployTicket(result, { now }));
  const compact = measured.map(compactHistoricalResult);
  const negativeResults = compact.filter((result) => result.decision_at_window_end === "confirmed_negative");

  return {
    mode: "historical-post-deploy-results",
    summary: {
      result_count: compact.length,
      decision_counts: countBy(compact, (result) => result.decision_at_window_end),
      route_counts: countBy(compact, (result) => result.route_target),
      metric_counts: countBy(compact, (result) => result.setpoint_metric_id),
      confirmed_negative_count: negativeResults.length,
      llm_api_calls: 0
    },
    results: compact,
    safety: measurementSafety()
  };
}

export function reviewPostDeployTickets({ tickets = samplePostDeployTickets(), now = new Date() } = {}) {
  const results = tickets.map((ticket) => measurePostDeployTicket(ticket, { now }));
  const summary = summarizeHistoricalPostDeployResults(results, { now });

  return {
    schema_version: "misa.post_deploy_measurement_review.v1",
    mode: "post-deploy-measurement",
    ok: true,
    created_at: now.toISOString(),
    summary: summary.summary,
    post_deploy_results: results,
    rollback_recommendations: results
      .filter((result) => result.rollback.recommended)
      .map((result) => ({
        deployment_id: result.deployment_id,
        candidate_id: result.candidate_id,
        reason: result.rollback.reason,
        executed: false
      })),
    damping_recommendations: results
      .filter((result) => result.damping.recommended)
      .map((result) => ({
        deployment_id: result.deployment_id,
        candidate_id: result.candidate_id,
        route: "post_deploy_review",
        reason: result.damping.reason
      })),
    safety: measurementSafety(),
    warnings: [
      "Negative post-deploy results recommend rollback and damping only; this local plane does not execute production rollback."
    ],
    violations: []
  };
}

export function samplePostDeployTickets() {
  return [
    {
      deployment_id: "deploy-skill-replay-pass-rate-001",
      candidate_id: "adaptive-skill-sample",
      candidate_kind: "skill",
      route_target: "skill",
      setpoint_metric_id: "skill.replay_pass_rate",
      target_value: 0.85,
      tolerance: 0.02,
      direction: "maximize",
      pre_deploy_value: 0.78,
      post_deploy_value: 0.88,
      measurement_window: { kind: "sessions", value: 50 },
      evidence: [
        {
          source: "local_replay_window",
          note: "Replay pass rate improved after the candidate landed."
        }
      ]
    },
    {
      deployment_id: "deploy-provider-timeout-rate-001",
      candidate_id: "provider-timeout-case-adjustment",
      candidate_kind: "case",
      route_target: "case",
      setpoint_metric_id: "provider.timeout_rate",
      target_value: 0.05,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.08,
      post_deploy_value: 0.12,
      measurement_window: { kind: "days", value: 7 },
      evidence: [
        {
          source: "local_failure_window",
          note: "Timeout rate worsened after the candidate landed."
        }
      ]
    },
    {
      deployment_id: "deploy-memory-pollution-rate-001",
      candidate_id: "memory-boundary-refinement",
      candidate_kind: "memory",
      route_target: "memory",
      setpoint_metric_id: "memory.pollution_rate",
      target_value: 0.02,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.05,
      post_deploy_value: 0.045,
      measurement_window: { kind: "samples", value: 30 },
      evidence: [
        {
          source: "local_memory_audit",
          note: "Pollution rate moved too little to count as positive."
        }
      ]
    }
  ];
}
