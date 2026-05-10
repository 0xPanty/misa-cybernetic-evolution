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
  "npm run self-repair:misa -- --no-verify",
  "npm run density:misa",
  "npm run adaptive:misa",
  "npm run simulate:misa",
  "npm run validate:schemas",
  "npm run precheck",
  "npm test"
];

function normalizeSummary(summary) {
  return summary.replace(/^Draft skill candidate:\s*/, "").trim();
}

function candidateProfile(trace) {
  if (trace.source_event_id === "misa-skill-readonly-audit-002") {
    return {
      proposedSkill: {
        slug: "misa-bridge-readonly-audit",
        title: "Misa Bridge Read-only Audit",
        action: "create",
        proposed_path: "generated/skill-drafts/misa-bridge-readonly-audit.md",
        target_surface: "draft_skill"
      },
      procedure: [
        "Identify the bridge or service under inspection and keep live-message tests disabled by default.",
        "Check systemd state first with service-specific is-active/status evidence.",
        "Review recent journal lines for startup, provider, rate-limit, timeout, and permission errors.",
        "Check the process list for duplicate, stale, or stuck bridge processes.",
        "Review artifact, temp-file, and secret-scan cleanliness before any live user-visible test.",
        "If a live Discord, AgentMail, or Farcaster message is still needed, stop and ask Huan for explicit approval first."
      ],
      quality: {
        score: 0.86,
        ready_for_draft: true,
        ready_for_publish: false,
        missing_fields: [
          "needs the concrete service name at run time",
          "needs human approval before any live message"
        ],
        rationale: [
          "The candidate has a repeatable bridge-audit sequence.",
          "The live-message boundary is explicit and testable."
        ]
      }
    };
  }

  if (trace.source_event_id === "misa-skill-recovery-workflow-001") {
    return {
      proposedSkill: {
        slug: "misa-hermes-recovery-refinement",
        title: "Misa Hermes Recovery Refinement",
        action: "improve",
        proposed_path: "generated/skill-drafts/misa-hermes-recovery-refinement.md",
        target_surface: "draft_skill"
      },
      procedure: [
        "Read the three core Misa/Hermes project files before changing project state.",
        "Locate the current execution-table section and use it as the active boundary.",
        "Restate the current phase, formal source, active lane, and blocker in one short block.",
        "Avoid broad backlog reads unless the active section names them.",
        "When a key decision or runtime change is made, update state, source log, and execution table before closeout.",
        "Do not create a second planning system beside the core project files."
      ],
      quality: {
        score: 0.9,
        ready_for_draft: true,
        ready_for_publish: false,
        missing_fields: [
          "needs manual review before changing the installed global recovery skill"
        ],
        rationale: [
          "The candidate matches an existing high-value recovery routine.",
          "The affected existing skill was explicitly read, so improvement evidence is stronger than prompt injection alone."
        ]
      }
    };
  }

  return {
    proposedSkill: {
      slug: trace.source_event_id.replace(/^misa-skill-/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
      title: normalizeSummary(trace.proposed_change.summary).slice(0, 80),
      action: trace.proposed_change.candidate_action,
      proposed_path: `generated/skill-drafts/${trace.source_event_id}.md`,
      target_surface: "draft_skill"
    },
    procedure: buildGenericProcedureOutline(trace),
    quality: {
      score: 0.7,
      ready_for_draft: true,
      ready_for_publish: false,
      missing_fields: ["needs domain-specific steps before publication"],
      rationale: ["The candidate is repeatable but still needs a sharper draft."]
    }
  };
}

function buildGenericProcedureOutline(trace) {
  const affected = trace.proposed_change.affected_artifacts.join(", ") || "skill:new-candidate";

  return [
    `Confirm the triggering situation still matches ${trace.source_event_id} and its setpoint.`,
    `Read or cite the named evidence artifacts before changing ${affected}.`,
    "Convert the repeatable behavior into a draft skill with explicit stop conditions.",
    "Run local replay and precheck again; keep publication disabled unless a separate gate approves it."
  ];
}

function buildProcedureOutline(trace) {
  return candidateProfile(trace).procedure;
}

function toCandidate(trace) {
  const profile = candidateProfile(trace);

  return {
    schema_version: "misa.skill_crystallization_candidate.v2",
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
    proposed_skill: profile.proposedSkill,
    procedure_outline: buildProcedureOutline(trace),
    quality: profile.quality,
    verification_commands: [...VERIFICATION_COMMANDS],
    self_repair: {
      allowed: true,
      mode: "draft_only",
      write_scope: [
        "generated/skill-drafts",
        "generated/repair-plans",
        "runs/self-repair"
      ],
      max_auto_fix_attempts: 1,
      requires_human_publish_approval: true
    },
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

    if (candidate.quality.ready_for_publish) {
      violations.push(`${candidate.candidate_id} unexpectedly reports publish readiness`);
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
      self_repair_allowed: true,
      self_repair_mode: "draft_only",
      live_effects: { ...LIVE_EFFECTS_OFF },
      inspired_by: "GenericAgent skill crystallization pattern; runtime tool authority not imported"
    },
    candidates,
    warnings: simulation.warnings,
    violations
  };
}
