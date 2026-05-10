import { crystallizeMisaSkills } from "./skill-crystallization.mjs";

const GENERICAGENT_SOURCE = {
  name: "lsdefine/GenericAgent",
  url: "https://github.com/lsdefine/GenericAgent",
  inspected_commit: "9024af7499a04dbb4c2bab01584ce170ec9ba439",
  useful_patterns: [
    "contextual information density maximization",
    "layered pointer memory",
    "turn summary compaction",
    "verified memory updates only",
    "skill index with safety metadata"
  ],
  rejected_patterns: [
    "broad system tool authority",
    "autonomous scheduler",
    "automatic memory writes",
    "automatic production skill publication",
    "browser, keyboard, mouse, or ADB live control"
  ]
};

const BLOCKED_OPERATIONS = [
  "broad_tool_authority",
  "autonomous_scheduler",
  "automatic_memory_write",
  "production_skill_publication",
  "browser_keyboard_mouse_adb_control",
  "provider_route_change",
  "farcaster_publish",
  "zilliz_replacement"
];

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function countValues(values) {
  return Array.isArray(values) ? values.filter(Boolean).length : 0;
}

function reviewCandidate(candidate) {
  const artifactEvidence = candidate.evidence?.artifact_evidence ?? {};
  const referenced = countValues(artifactEvidence.referenced);
  const generatedFiles = countValues(candidate.self_repair?.write_scope);
  const verification = countValues(candidate.verification_commands);
  const procedure = countValues(candidate.procedure_outline);
  const triggers = countValues(candidate.trigger_conditions);
  const blocked = countValues(candidate.safety?.blocked_operations);
  const publicationBlocked = candidate.safety?.publication_allowed === false
    && candidate.quality?.ready_for_publish === false;
  const liveEffectsOff = !Object.values(candidate.safety?.live_effects ?? {}).some(Boolean);

  const evidenceScore = clamp((referenced + Number(candidate.evidence?.evidence_basis ? 1 : 0)) / 3);
  const procedureScore = clamp(procedure / 6);
  const triggerScore = clamp(triggers / 3);
  const verificationScore = clamp(verification / 7);
  const safetyScore = publicationBlocked && liveEffectsOff ? clamp(blocked / 6) : 0;
  const draftScore = generatedFiles >= 3 && candidate.self_repair?.requires_human_publish_approval ? 1 : 0.75;

  const score = round(
    evidenceScore * 0.2
    + procedureScore * 0.2
    + triggerScore * 0.1
    + verificationScore * 0.2
    + safetyScore * 0.2
    + draftScore * 0.1
  );

  const reasons = [];
  if (evidenceScore >= 0.67) reasons.push("has explicit artifact evidence or evidence basis");
  if (procedureScore >= 0.8) reasons.push("procedure outline is concrete enough to replay");
  if (verificationScore >= 0.8) reasons.push("verification chain includes density, replay, precheck, and tests");
  if (safetyScore >= 0.8) reasons.push("publication and live effects remain blocked");
  if (draftScore >= 1) reasons.push("self-repair output stays in draft/audit write scope");

  return {
    candidate_id: candidate.candidate_id,
    score,
    decision: score >= 0.82 ? "positive" : "hold",
    signal_count: triggers,
    evidence_reference_count: referenced,
    procedure_step_count: procedure,
    verification_command_count: verification,
    generated_scope_count: generatedFiles,
    reasons
  };
}

function buildAdaptations() {
  return [
    {
      id: "contextual_information_density",
      source_pattern: "GenericAgent keeps high-signal summaries and small pointers in active context.",
      misa_adaptation: "Score staged Misa skill candidates for evidence density, concrete procedure, verification depth, and safety boundaries.",
      status: "adopted",
      positive_value: true,
      evidence_basis: [
        "GenericAgent README describes token-efficient layered memory and contextual information density.",
        "GenericAgent agent_loop.py folds earlier turns and keeps compact summaries in working memory."
      ],
      safety_boundary: [
        "no provider calls",
        "no memory write",
        "no production skill publication"
      ],
      blocked_operations: []
    },
    {
      id: "layered_pointer_memory",
      source_pattern: "GenericAgent separates L1 insight pointers, L2 facts, L3 SOPs, and L4 session archives.",
      misa_adaptation: "Keep Misa's core project files as the top-level source of truth, and make generated candidates point to evidence instead of copying raw logs.",
      status: "adopted",
      positive_value: true,
      evidence_basis: [
        "GenericAgent memory_management_sop.md defines pointer-first memory layers.",
        "Misa/Hermes already uses project-state, source-log, and execution-table as single source anchors."
      ],
      safety_boundary: [
        "do not create a second planning system",
        "do not copy private raw session text into generated artifacts"
      ],
      blocked_operations: []
    },
    {
      id: "verified_memory_only",
      source_pattern: "GenericAgent memory SOP says verified action results, not model guesses, may enter memory.",
      misa_adaptation: "Keep publication disabled until local replay, schema validation, precheck, tests, and human review gates pass.",
      status: "adopted",
      positive_value: true,
      evidence_basis: [
        "GenericAgent memory_management_sop.md uses action-verified-only memory rules.",
        "Misa v0.6 self-repair already records command logs and final reports before any human publication."
      ],
      safety_boundary: [
        "draft first",
        "human approval before publication",
        "rollback evidence for runtime changes"
      ],
      blocked_operations: []
    },
    {
      id: "skill_index_safety_metadata",
      source_pattern: "GenericAgent skill search indexes quality, environment, safety, credential, and blast-radius metadata.",
      misa_adaptation: "Keep Misa skill candidates carrying safety flags, blocked operations, verification commands, and human publish approval requirements.",
      status: "adopted",
      positive_value: true,
      evidence_basis: [
        "GenericAgent memory/skill_search models quality and autonomous safety metadata.",
        "Misa skill crystallization candidates already expose safety and blocked-operation fields."
      ],
      safety_boundary: [
        "metadata is advisory",
        "no remote skill-search dependency in Misa precheck"
      ],
      blocked_operations: []
    },
    {
      id: "genericagent_runtime_authority",
      source_pattern: "GenericAgent grants broad local computer control through code, browser, filesystem, keyboard/mouse, and ADB surfaces.",
      misa_adaptation: "Reject runtime authority import; Misa only borrows the learning-loop control logic.",
      status: "rejected",
      positive_value: true,
      evidence_basis: [
        "GenericAgent README describes strong execution and system-level control.",
        "Misa production sidecar must not touch live channel mechanics or system services without explicit approval."
      ],
      safety_boundary: [
        "keep sidecar non-daemon",
        "no browser or ADB control",
        "no arbitrary install authority"
      ],
      blocked_operations: [...BLOCKED_OPERATIONS]
    },
    {
      id: "autonomous_scheduler",
      source_pattern: "GenericAgent reflect scheduler can trigger tasks and L4 compression on intervals.",
      misa_adaptation: "Reject scheduler import; Misa session distiller and production timers stay governed by existing service gates.",
      status: "rejected",
      positive_value: true,
      evidence_basis: [
        "GenericAgent reflect/scheduler.py runs periodic task and L4 archive checks.",
        "Misa cybernetic layer must not create new timers, cron, or systemd units."
      ],
      safety_boundary: [
        "no cron",
        "no systemd",
        "no autonomous wake-up"
      ],
      blocked_operations: ["autonomous_scheduler", "timer_or_service_start"]
    }
  ];
}

export async function reviewGenericAgentContextDensity({ repoRoot = process.cwd() } = {}) {
  const crystallization = await crystallizeMisaSkills({ repoRoot });
  const candidateReviews = crystallization.candidates.map(reviewCandidate);
  const adaptations = buildAdaptations();
  const adopted = adaptations.filter((item) => item.status === "adopted");
  const rejected = adaptations.filter((item) => item.status === "rejected");
  const averageCandidateScore = candidateReviews.length
    ? candidateReviews.reduce((sum, item) => sum + item.score, 0) / candidateReviews.length
    : 0;
  const adoptionScore = adopted.length / Math.max(adaptations.length, 1);
  const rejectionScore = rejected.every((item) => item.blocked_operations.length > 0) ? 1 : 0;
  const overallScore = round(averageCandidateScore * 0.55 + adoptionScore * 0.25 + rejectionScore * 0.2);
  const violations = [];

  if (!crystallization.ok) {
    violations.push("skill crystallization must pass before context-density review");
  }

  for (const review of candidateReviews) {
    if (review.decision !== "positive") {
      violations.push(`${review.candidate_id} did not pass positive density review`);
    }
  }

  for (const blocked of BLOCKED_OPERATIONS) {
    const explicitlyRejected = rejected.some((item) => item.blocked_operations.includes(blocked));
    if (!explicitlyRejected) {
      violations.push(`blocked GenericAgent operation is not explicitly rejected: ${blocked}`);
    }
  }

  if (overallScore < 0.82) {
    violations.push(`overall context-density score ${overallScore} below 0.82`);
  }

  return {
    schema_version: "misa.genericagent_context_density.v1",
    mode: "genericagent-context-density-review",
    ok: violations.length === 0,
    source: { ...GENERICAGENT_SOURCE },
    density_contract: {
      min_overall_score: 0.82,
      required_adaptations: [
        "contextual_information_density",
        "layered_pointer_memory",
        "verified_memory_only",
        "skill_index_safety_metadata"
      ],
      blocked_imports: [...BLOCKED_OPERATIONS]
    },
    summary: {
      overall_score: overallScore,
      adopted_count: adopted.length,
      rejected_count: rejected.length,
      candidate_reviews_count: candidateReviews.length
    },
    adaptations,
    candidate_reviews: candidateReviews,
    warnings: [
      "GenericAgent is a reference source only; Misa does not import its runtime authority.",
      "This review is local and deterministic; it does not call GenericAgent services or model providers."
    ],
    violations
  };
}
