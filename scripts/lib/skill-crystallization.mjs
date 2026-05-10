import { simulateMisaLearning } from "./learning-loop.mjs";

const LIVE_EFFECTS_OFF = {
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
};

const BLOCKED_OPERATIONS = [
  "persistent_memory_write",
  "zilliz_replacement",
  "farcaster_publish",
  "skill_publication",
  "session_mechanic_replacement",
  "timer_or_service_start"
];

const VERIFICATION_COMMANDS = [
  "npm run crystallize:misa",
  "npm run simulate:misa",
  "npm run validate:schemas",
  "npm run precheck",
  "npm test"
];

function normalizeSummary(summary) {
  return summary.replace(/^Draft skill candidate:\s*/, "").trim();
}

function buildProcedureOutline(trace) {
  const affected = trace.proposed_change.affected_artifacts.join(", ") || "skill:new-candidate";

  return [
    `Confirm the triggering situation still matches ${trace.source_event_id} and its setpoint.`,
    `Read or cite the named evidence artifacts before changing ${affected}.`,
    "Run local replay and precheck again; keep publication disabled unless a separate gate approves it."
  ];
}

function toCandidate(trace) {
  return {
    schema_version: "misa.skill_crystallization_candidate.v1",
    candidate_id: `skill-candidate-${trace.source_event_id}`,
    source_event_id: trace.source_event_id,
    source_cycle_id: trace.cycle_id,
    one_line_summary: normalizeSummary(trace.proposed_change.summary),
    trigger_conditions: [
      ...trace.observe.signals,
      `setpoint:${trace.identify.setpoint}`
    ],
    route: {
      target: "skill",
      candidate_action: trace.proposed_change.candidate_action,
      affected_artifacts: trace.proposed_change.affected_artifacts
    },
    evidence: {
      evidence_basis: trace.candidate_review.evidence_basis,
      artifact_evidence: trace.artifact_evidence
    },
    procedure_outline: buildProcedureOutline(trace),
    verification_commands: [...VERIFICATION_COMMANDS],
    safety: {
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    },
    created_at: trace.created_at
  };
}

export async function crystallizeMisaSkills({ repoRoot = process.cwd() } = {}) {
  const simulation = await simulateMisaLearning({ repoRoot });
  const candidates = simulation.traces
    .filter((trace) => trace.route.target === "skill")
    .filter((trace) => trace.candidate_review.state === "staged")
    .map(toCandidate);

  const violations = [...simulation.violations];
  const ids = new Set();

  for (const candidate of candidates) {
    if (ids.has(candidate.candidate_id)) {
      violations.push(`duplicate crystallization candidate ${candidate.candidate_id}`);
    }
    ids.add(candidate.candidate_id);

    if (candidate.safety.publication_allowed) {
      violations.push(`${candidate.candidate_id} unexpectedly allows publication`);
    }

    if (Object.values(candidate.safety.live_effects).some(Boolean)) {
      violations.push(`${candidate.candidate_id} has live effects`);
    }
  }

  return {
    mode: "read-only-crystallization",
    ok: simulation.ok && violations.length === 0,
    source: {
      simulation_mode: simulation.mode,
      fixture_stats: simulation.fixtureStats,
      route_counts: simulation.routeCounts
    },
    index: {
      total_candidates: candidates.length,
      skill_candidates: candidates.length,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      inspired_by: "GenericAgent skill crystallization pattern; runtime tool authority not imported"
    },
    candidates,
    warnings: simulation.warnings,
    violations
  };
}
