import {
  DEFAULT_BEHAVIOR_EVENT,
  DEFAULT_SKILL_EVOLUTION_CONTRACT,
  runSkillEvolutionSupervisor
} from "./skill-evolution-supervisor.mjs";
import {
  commonSafety,
  round,
  safeId,
  uniqueStrings
} from "./evolution-tournament-utils.mjs";

const KNOWN_TOURNAMENT_ROUTES = new Set(["skill", "memory", "case", "policy", "damping"]);
const SKILL_BRIDGE_PREFLIGHT_COMMANDS = [
  "npm run skill:evolution",
  "npm run evolution:tournament:misa",
  "npm run validate:schemas",
  "npm run precheck",
  "npm test"
];

function bridgeSource({
  supervision,
  contractFile = DEFAULT_SKILL_EVOLUTION_CONTRACT,
  eventFile = DEFAULT_BEHAVIOR_EVENT
} = {}) {
  return {
    supervisor_mode: supervision?.mode ?? null,
    skill_id: supervision?.skill_id ?? null,
    event_id: supervision?.event_id ?? null,
    contract_file: contractFile,
    event_file: eventFile
  };
}

export function emptySkillEvolutionTournamentBridge() {
  return {
    mode: "skill-evolution-to-tournament-bridge",
    enabled: false,
    source: bridgeSource(),
    summary: {
      supervisor_ok: null,
      supervisor_candidate_count: 0,
      admitted_candidate_count: 0,
      blocked_candidate_count: 0,
      replay_required_count: 0,
      tournament_required_count: 0,
      agentskills_compatible_draft_count: 0,
      llm_api_calls: 0
    },
    admission: {
      output_surface: "tournament_input_candidates_only",
      requires_replay: true,
      requires_tournament: true,
      can_promote_now: false,
      publication_allowed: false,
      production_authority: false,
      llm_judge_allowed: false
    },
    candidate_refs: [],
    warnings: []
  };
}

function routeForCandidate(supervision, candidate) {
  const recommended = supervision?.routing?.recommended_route;
  if (KNOWN_TOURNAMENT_ROUTES.has(recommended)) return recommended;

  const target = String(candidate?.target ?? "");
  if (target.includes("damping") || target.includes("cooldown")) return "damping";
  if (target.includes("policy")) return "policy";
  if (target.includes("memory") || target.includes("retrieval")) return "memory";
  if (target.includes("case") || target.includes("pattern")) return "case";
  return "skill";
}

function riskLevelFor(supervision) {
  const observed = new Set(supervision?.observed_signals ?? []);
  if ((supervision?.violations ?? []).length > 0) return "high";
  if (observed.has("private_memory_used") || observed.has("high_risk") || observed.has("live_write")) return "high";
  if (observed.has("public_output") || observed.has("persistent_write")) return "medium";
  return "low";
}

function scoreForSkillCandidate(supervision, candidate, routeTarget) {
  const routeScore = {
    skill: 0.9,
    memory: 0.84,
    case: 0.8,
    policy: 0.78,
    damping: 0.58
  }[routeTarget] ?? 0.5;
  const evidenceScore = Math.min(Math.max(candidate.evidence_refs?.length ?? 0, 1), 4) / 4;
  const safetyScore = supervision?.safety?.no_write === true
    && supervision?.safety?.production_authority === false
    && supervision?.promotion_gate?.can_promote_now === false
    ? 1
    : 0;
  const allowedScore = candidate.allowed_space_match === true && candidate.forbidden_space_match === false ? 1 : 0;
  const replayScore = candidate.replay_required === true ? 1 : 0;
  const riskPenalty = { low: 0, medium: 0.04, high: 0.1 }[riskLevelFor(supervision)] ?? 0.06;

  return round(
    evidenceScore * 0.22
      + routeScore * 0.24
      + safetyScore * 0.3
      + allowedScore * 0.14
      + replayScore * 0.1
      - riskPenalty
  );
}

function admissionChecks(supervision, candidate, routeTarget) {
  return [
    {
      id: "supervisor_passed",
      ok: supervision.ok === true,
      reason: "Only passing skill supervision can feed tournament candidates."
    },
    {
      id: "candidate_replay_required",
      ok: candidate.replay_required === true && candidate.status === "replay_required",
      reason: "Skill evolution candidates must stay replay-required."
    },
    {
      id: "allowed_evolution_space",
      ok: candidate.allowed_space_match === true && candidate.forbidden_space_match === false,
      reason: "The target must be allowed by the skill evolution contract."
    },
    {
      id: "known_qianxuesen_route",
      ok: KNOWN_TOURNAMENT_ROUTES.has(routeTarget),
      reason: "Tournament candidates must map to an existing Qianxuesen route."
    },
    {
      id: "promotion_blocked",
      ok: supervision.promotion_gate?.can_promote_now === false,
      reason: "The bridge cannot promote, install, publish, or write a skill."
    },
    {
      id: "no_live_effects",
      ok: supervision.safety?.no_write === true
        && supervision.safety?.production_authority === false
        && supervision.safety?.live_effect_allowed === false
        && supervision.safety?.llm_api_calls === 0
        && supervision.safety?.external_api_calls === 0,
      reason: "Skill bridge inputs must stay local, deterministic, and no-write."
    }
  ];
}

function candidateReason(candidate) {
  return [
    `Replay skill evolution target ${candidate.target} as an agentskills-compatible draft only.`,
    "No install, publish, memory write, or production authority."
  ].join(" ");
}

function toTournamentCandidate(supervision, skillCandidate) {
  const routeTarget = routeForCandidate(supervision, skillCandidate);
  const checks = admissionChecks(supervision, skillCandidate, routeTarget);
  const admitted = checks.every((check) => check.ok);
  const candidateId = `skill-bridge-${safeId(skillCandidate.candidate_id)}`;
  const evidenceSignals = uniqueStrings([
    ...supervision.observed_signals,
    skillCandidate.target,
    skillCandidate.change_type
  ]);

  return {
    admitted,
    ref: {
      candidate_id: candidateId,
      source_event_id: supervision.event_id,
      route_target: routeTarget,
      skill_id: supervision.skill_id,
      target: skillCandidate.target,
      status: admitted ? "admitted" : "blocked",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false,
      agentskills_format: "agentskills.io-compatible-draft",
      reason_ref: skillCandidate.candidate_id
    },
    candidate: {
      candidate_id: candidateId,
      source_event_id: supervision.event_id,
      route_target: routeTarget,
      queue_state: admitted ? "ready_for_tournament_replay" : "blocked",
      proposed_optimization: {
        action: admitted ? "admit_to_tournament_as_replay_required_skill_draft" : "do_not_report_yet",
        reason: candidateReason(skillCandidate),
        requires_huan_approval: true,
        production_authority: false
      },
      local_preflight: {
        status: admitted ? "preflight_passed" : "blocked",
        score: admitted ? scoreForSkillCandidate(supervision, skillCandidate, routeTarget) : 0,
        checks,
        commands: admitted ? [...SKILL_BRIDGE_PREFLIGHT_COMMANDS] : [],
        simulated_before_report: admitted,
        report_to_huan: admitted
      },
      candidate_hygiene: {
        source: "skill-evolution-to-tournament-bridge",
        reportable: admitted,
        verdict: admitted ? "replay_required_skill_draft_admitted" : "blocked_before_tournament",
        bridge_policy: "agentskills_metadata_only_no_skill_write"
      },
      evidence: {
        evidence_count: Math.max(skillCandidate.evidence_refs?.length ?? 0, 1),
        risk_level: riskLevelFor(supervision),
        redaction_status: "contractual_behavior_event",
        normalized_signals: evidenceSignals
      },
      prediction: admitted ? "safe_to_tournament_as_local_draft_only" : "blocked_before_tournament",
      label: "skill_evolution_bridge",
      trajectory: [
        "skill_evolution_supervisor",
        `skill:${safeId(supervision.skill_id)}`,
        `event:${safeId(supervision.event_id)}`,
        `target:${safeId(skillCandidate.target)}`,
        "tournament_input_candidate"
      ],
      skill_draft: {
        format: "agentskills.io-compatible-draft",
        source_skill_id: supervision.skill_id,
        target: skillCandidate.target,
        change_type: skillCandidate.change_type,
        proposed_change: skillCandidate.proposed_change,
        expected_gain: skillCandidate.expected_gain,
        evidence_refs: [...(skillCandidate.evidence_refs ?? [])],
        replay_required: true,
        tournament_required: true,
        can_promote_now: false,
        install_allowed: false,
        publication_allowed: false
      },
      safety: commonSafety()
    }
  };
}

export function buildSkillEvolutionTournamentBridge({
  supervision,
  contractFile = DEFAULT_SKILL_EVOLUTION_CONTRACT,
  eventFile = DEFAULT_BEHAVIOR_EVENT
} = {}) {
  if (!supervision) {
    throw new Error("supervision is required");
  }

  const bridged = (supervision.evolution_candidates ?? []).map((candidate) => (
    toTournamentCandidate(supervision, candidate)
  ));
  const admitted = bridged.filter((item) => item.admitted);
  const blocked = bridged.filter((item) => !item.admitted);

  return {
    bridge: {
      mode: "skill-evolution-to-tournament-bridge",
      enabled: true,
      source: bridgeSource({ supervision, contractFile, eventFile }),
      summary: {
        supervisor_ok: supervision.ok === true,
        supervisor_candidate_count: supervision.evolution_candidates?.length ?? 0,
        admitted_candidate_count: admitted.length,
        blocked_candidate_count: blocked.length,
        replay_required_count: bridged.filter((item) => item.ref.replay_required).length,
        tournament_required_count: bridged.filter((item) => item.ref.tournament_required).length,
        agentskills_compatible_draft_count: admitted.length,
        llm_api_calls: supervision.safety?.llm_api_calls ?? 0
      },
      admission: {
        output_surface: "tournament_input_candidates_only",
        requires_replay: true,
        requires_tournament: true,
        can_promote_now: false,
        publication_allowed: false,
        production_authority: false,
        llm_judge_allowed: false
      },
      candidate_refs: bridged.map((item) => item.ref),
      warnings: [
        "Skill evolution bridge only converts replay-required draft metadata into tournament input candidates.",
        "The bridge cannot install, publish, write memory, or change the deterministic tournament winner."
      ]
    },
    tournamentCandidates: admitted.map((item) => item.candidate)
  };
}

export async function loadSkillEvolutionTournamentBridge({
  repoRoot = process.cwd(),
  enabled = false,
  contractFile = DEFAULT_SKILL_EVOLUTION_CONTRACT,
  eventFile = DEFAULT_BEHAVIOR_EVENT,
  now = new Date()
} = {}) {
  if (!enabled) {
    return {
      bridge: emptySkillEvolutionTournamentBridge(),
      tournamentCandidates: []
    };
  }

  const supervision = await runSkillEvolutionSupervisor({
    repoRoot,
    contractFile,
    eventFile,
    now
  });

  return buildSkillEvolutionTournamentBridge({
    supervision,
    contractFile,
    eventFile
  });
}
