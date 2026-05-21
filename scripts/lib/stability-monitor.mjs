import fs from "node:fs/promises";
import path from "node:path";
import { measurePostDeployTicket } from "./post-deploy-measurement.mjs";
import { countBy, round, safeId } from "./evolution-tournament-utils.mjs";

export const ROUTES = Object.freeze(["memory", "skill", "case", "policy", "damping", "ignore"]);
export const SAFE_MODE_ALLOWED_ROUTES = Object.freeze(["damping", "ignore"]);
export const FROZEN_ROUTES = Object.freeze(["memory", "skill", "case", "policy"]);
export const DEFAULT_STABILITY_INCIDENT_ROOT = "runs/stability-incidents";

export const DEFAULT_STABILITY_THRESHOLDS = Object.freeze({
  memoryRollbackRatio: Object.freeze({
    indicator_id: "memory_route.promote_rollback_ratio",
    route_target: "memory",
    warning_threshold: 0.25,
    safe_mode_threshold: 0.5,
    min_samples: 3
  }),
  skillReplayFailureStreak: Object.freeze({
    indicator_id: "skill_route.replay_failure_streak",
    route_target: "skill",
    warning_threshold: 2,
    safe_mode_threshold: 3,
    min_samples: 3
  })
});

function monitorSafety() {
  return {
    production_authority: false,
    publication_allowed: false,
    live_route_table_mutated: false,
    writes_persistent_memory: false,
    incident_write_root: DEFAULT_STABILITY_INCIDENT_ROOT,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function statusFor({ sampleCount, minSamples, value, warningThreshold, safeModeThreshold }) {
  if (sampleCount < minSamples) return "insufficient_data";
  if (value >= safeModeThreshold) return "divergent";
  if (value >= warningThreshold) return "warning";
  return "stable";
}

function indicator({ indicatorId, routeTarget, value, sampleCount, warningThreshold, safeModeThreshold, minSamples, numerator, denominator, evidence }) {
  const status = statusFor({
    sampleCount,
    minSamples,
    value,
    warningThreshold,
    safeModeThreshold
  });
  return {
    indicator_id: indicatorId,
    route_target: routeTarget,
    value: round(value),
    warning_threshold: warningThreshold,
    safe_mode_threshold: safeModeThreshold,
    min_samples: minSamples,
    sample_count: sampleCount,
    numerator,
    denominator,
    status,
    safe_mode_triggered: status === "divergent",
    evidence
  };
}

function normalizePostDeployTickets(tickets, now) {
  return (tickets ?? []).map((ticket) => measurePostDeployTicket(ticket, { now }));
}

function memoryRollbackIndicator({ postDeployTickets, thresholds }) {
  const config = thresholds.memoryRollbackRatio ?? DEFAULT_STABILITY_THRESHOLDS.memoryRollbackRatio;
  const memoryTickets = postDeployTickets.filter((ticket) => (
    ticket.route_target === "memory"
    && ticket.decision_at_window_end !== "pending"
  ));
  const negativeTickets = memoryTickets.filter((ticket) => ticket.decision_at_window_end === "confirmed_negative");
  const value = memoryTickets.length === 0 ? 0 : negativeTickets.length / memoryTickets.length;

  return indicator({
    indicatorId: config.indicator_id,
    routeTarget: config.route_target,
    value,
    sampleCount: memoryTickets.length,
    warningThreshold: config.warning_threshold,
    safeModeThreshold: config.safe_mode_threshold,
    minSamples: config.min_samples,
    numerator: negativeTickets.length,
    denominator: memoryTickets.length,
    evidence: negativeTickets.map((ticket) => ticket.deployment_id)
  });
}

function normalizeReplayResult(result) {
  const passed = result.replay_passed ?? result.passed ?? result.ok ?? false;
  return {
    candidate_id: result.candidate_id ?? result.source_event_id ?? "unknown-skill-candidate",
    route_target: result.route_target ?? "skill",
    replay_passed: Boolean(passed),
    observed_at: result.observed_at ?? null
  };
}

function trailingFailureStreak(results) {
  let streak = 0;
  for (const result of [...results].reverse()) {
    if (result.replay_passed) break;
    streak += 1;
  }
  return streak;
}

function skillReplayFailureIndicator({ skillReplayResults, thresholds }) {
  const config = thresholds.skillReplayFailureStreak ?? DEFAULT_STABILITY_THRESHOLDS.skillReplayFailureStreak;
  const skillResults = (skillReplayResults ?? [])
    .map(normalizeReplayResult)
    .filter((result) => result.route_target === "skill");
  const streak = trailingFailureStreak(skillResults);
  const failedTail = skillResults.slice(Math.max(0, skillResults.length - streak));

  return indicator({
    indicatorId: config.indicator_id,
    routeTarget: config.route_target,
    value: streak,
    sampleCount: skillResults.length,
    warningThreshold: config.warning_threshold,
    safeModeThreshold: config.safe_mode_threshold,
    minSamples: config.min_samples,
    numerator: streak,
    denominator: skillResults.length,
    evidence: failedTail.map((result) => result.candidate_id)
  });
}

function buildIncidents(indicators, now) {
  return indicators
    .filter((item) => item.safe_mode_triggered)
    .map((item) => ({
      incident_id: `stability-${safeId(item.indicator_id)}-${safeId(now.toISOString())}`,
      indicator_id: item.indicator_id,
      route_target: item.route_target,
      severity: "safe_mode",
      reason: `${item.indicator_id} value ${item.value} reached safe-mode threshold ${item.safe_mode_threshold}.`,
      observed_at: now.toISOString(),
      allowed_routes: [...SAFE_MODE_ALLOWED_ROUTES],
      frozen_routes: [...FROZEN_ROUTES],
      requires_human_release: true,
      incident_path: null
    }));
}

function safeModeState(incidents) {
  const active = incidents.length > 0;
  return {
    active,
    state: active ? "safe_mode" : "normal",
    allowed_routes: active ? [...SAFE_MODE_ALLOWED_ROUTES] : [...ROUTES],
    frozen_routes: active ? [...FROZEN_ROUTES] : [],
    release_policy: active ? "human_owner_manual_release_only" : "not_required",
    requires_human_release: active,
    route_gate_output_only: true,
    live_route_table_mutated: false
  };
}

function summarizeIndicators(indicators, incidents, postDeployTickets, skillReplayResults) {
  return {
    indicator_count: indicators.length,
    divergent_indicator_count: indicators.filter((item) => item.status === "divergent").length,
    warning_indicator_count: indicators.filter((item) => item.status === "warning").length,
    insufficient_data_indicator_count: indicators.filter((item) => item.status === "insufficient_data").length,
    safe_mode_incident_count: incidents.length,
    post_deploy_ticket_count: postDeployTickets.length,
    skill_replay_result_count: skillReplayResults.length,
    route_counts: countBy(indicators, (item) => item.route_target),
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

export function reviewStabilityIndicators({
  postDeployTickets = sampleStablePostDeployTickets(),
  skillReplayResults = sampleStableSkillReplayResults(),
  thresholds = DEFAULT_STABILITY_THRESHOLDS,
  now = new Date()
} = {}) {
  const measuredTickets = normalizePostDeployTickets(postDeployTickets, now);
  const normalizedSkillReplayResults = (skillReplayResults ?? []).map(normalizeReplayResult);
  const indicators = [
    memoryRollbackIndicator({ postDeployTickets: measuredTickets, thresholds }),
    skillReplayFailureIndicator({ skillReplayResults: normalizedSkillReplayResults, thresholds })
  ];
  const incidents = buildIncidents(indicators, now);
  const safeMode = safeModeState(incidents);

  return {
    schema_version: "misa.stability_indicator.v1",
    mode: "stability-monitor",
    ok: !safeMode.active,
    created_at: now.toISOString(),
    review_window: {
      kind: "recent_local_evidence",
      post_deploy_ticket_count: measuredTickets.length,
      skill_replay_result_count: normalizedSkillReplayResults.length
    },
    summary: summarizeIndicators(indicators, incidents, measuredTickets, normalizedSkillReplayResults),
    safe_mode: safeMode,
    indicators,
    incidents,
    safety: monitorSafety(),
    warnings: safeMode.active
      ? ["Safe mode is active in the monitor output; only damping and ignore routes should be accepted until manual release."]
      : [],
    violations: []
  };
}

export function toSidecarStatus(review, { staleAfterMinutes = 60 } = {}) {
  const indicatorsById = new Map((review.indicators ?? []).map((indicatorItem) => [
    indicatorItem.indicator_id,
    indicatorItem
  ]));
  return {
    schema_version: "cybernetic.sidecar_status.v1",
    updated_at: review.created_at,
    stale_after_minutes: staleAfterMinutes,
    stability: {
      state: review.safe_mode.state,
      allowed_routes: [...review.safe_mode.allowed_routes],
      frozen_routes: [...review.safe_mode.frozen_routes],
      requires_human_release: review.safe_mode.requires_human_release,
      incidents: (review.incidents ?? []).map((incidentItem) => {
        const indicatorItem = indicatorsById.get(incidentItem.indicator_id);
        return {
          indicator_id: incidentItem.indicator_id,
          value: indicatorItem?.value ?? 0,
          threshold: indicatorItem?.safe_mode_threshold ?? 0,
          reason: incidentItem.reason
        };
      })
    },
    safety: {
      production_authority: false,
      is_recommendation_only: true,
      llm_api_calls: 0,
      external_api_calls: 0
    }
  };
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function withIncidentPaths(report, incidentRoot, repoRoot) {
  return {
    ...report,
    incidents: report.incidents.map((incident) => {
      const incidentPath = path.join(incidentRoot, `${incident.incident_id}.json`);
      const rel = path.relative(repoRoot, incidentPath);
      return {
        ...incident,
        incident_path: rel && !rel.startsWith("..") && !path.isAbsolute(rel)
          ? rel.split(path.sep).join("/")
          : incidentPath.split(path.sep).join("/")
      };
    })
  };
}

export async function runStabilityMonitor({
  repoRoot = process.cwd(),
  incidentRoot = DEFAULT_STABILITY_INCIDENT_ROOT,
  writeIncidents = false,
  now = new Date(),
  postDeployTickets,
  skillReplayResults,
  thresholds
} = {}) {
  const report = reviewStabilityIndicators({
    postDeployTickets,
    skillReplayResults,
    thresholds,
    now
  });
  if (!writeIncidents || report.incidents.length === 0) {
    return report;
  }

  const root = path.isAbsolute(incidentRoot) ? incidentRoot : path.join(repoRoot, incidentRoot);
  const withPaths = withIncidentPaths(report, root, repoRoot);
  for (const incident of withPaths.incidents) {
    await writeJson(path.join(root, `${incident.incident_id}.json`), {
      schema_version: "misa.stability_incident.v1",
      ...incident,
      safety: monitorSafety()
    });
  }
  return withPaths;
}

export function sampleStablePostDeployTickets() {
  return [
    {
      deployment_id: "deploy-memory-stability-001",
      candidate_id: "memory-boundary-stable-001",
      candidate_kind: "memory",
      route_target: "memory",
      setpoint_metric_id: "memory.pollution_rate",
      target_value: 0.02,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.05,
      post_deploy_value: 0.03,
      measurement_window: { kind: "sessions", value: 30 }
    },
    {
      deployment_id: "deploy-memory-stability-002",
      candidate_id: "memory-boundary-stable-002",
      candidate_kind: "memory",
      route_target: "memory",
      setpoint_metric_id: "memory.pollution_rate",
      target_value: 0.02,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.04,
      post_deploy_value: 0.03,
      measurement_window: { kind: "sessions", value: 30 }
    },
    {
      deployment_id: "deploy-memory-stability-003",
      candidate_id: "memory-boundary-stable-003",
      candidate_kind: "memory",
      route_target: "memory",
      setpoint_metric_id: "memory.pollution_rate",
      target_value: 0.02,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.03,
      post_deploy_value: 0.031,
      measurement_window: { kind: "sessions", value: 30 }
    }
  ];
}

export function sampleStableSkillReplayResults() {
  return [
    { candidate_id: "skill-stability-001", route_target: "skill", replay_passed: true },
    { candidate_id: "skill-stability-002", route_target: "skill", replay_passed: false },
    { candidate_id: "skill-stability-003", route_target: "skill", replay_passed: true }
  ];
}

export function sampleDivergentPostDeployTickets() {
  return [
    ...sampleStablePostDeployTickets().slice(0, 1),
    {
      deployment_id: "deploy-memory-divergent-001",
      candidate_id: "memory-rollback-001",
      candidate_kind: "memory",
      route_target: "memory",
      setpoint_metric_id: "memory.pollution_rate",
      target_value: 0.02,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.03,
      post_deploy_value: 0.08,
      measurement_window: { kind: "sessions", value: 30 }
    },
    {
      deployment_id: "deploy-memory-divergent-002",
      candidate_id: "memory-rollback-002",
      candidate_kind: "memory",
      route_target: "memory",
      setpoint_metric_id: "memory.pollution_rate",
      target_value: 0.02,
      tolerance: 0.01,
      direction: "minimize",
      pre_deploy_value: 0.04,
      post_deploy_value: 0.09,
      measurement_window: { kind: "sessions", value: 30 }
    }
  ];
}

export function sampleDivergentSkillReplayResults() {
  return [
    { candidate_id: "skill-replay-failed-001", route_target: "skill", replay_passed: true },
    { candidate_id: "skill-replay-failed-002", route_target: "skill", replay_passed: false },
    { candidate_id: "skill-replay-failed-003", route_target: "skill", replay_passed: false },
    { candidate_id: "skill-replay-failed-004", route_target: "skill", replay_passed: false }
  ];
}
