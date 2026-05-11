import { simulateMisaLearning } from "./learning-loop.mjs";
import { crystallizeMisaSkills } from "./skill-crystallization.mjs";

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
  "production_skill_installation",
  "session_mechanic_replacement",
  "timer_or_service_start",
  "provider_route_change",
  "external_worker_or_hub_execution"
];

const VALIDATION_COMMANDS = [
  "npm run crystallize:misa",
  "npm run self-repair:misa -- --no-verify",
  "npm run distill:misa",
  "npm run density:misa",
  "npm run adaptive:misa",
  "npm run intake:misa",
  "npm run rollup:misa",
  "npm run evolution:evaluate:misa",
  "npm run simulate:misa",
  "npm run validate:schemas",
  "npm run precheck",
  "npm test"
];

const SOURCE_ADAPTATIONS = [
  {
    source: "lsdefine/GenericAgent",
    inspected_commit: "9024af7499a04dbb4c2bab01584ce170ec9ba439",
    borrowed: [
      "high-signal candidate summaries",
      "layered pointer evidence",
      "verified memory only"
    ],
    rejected: [
      "broad runtime authority",
      "autonomous scheduler",
      "automatic memory writes"
    ]
  },
  {
    source: "EvoMap/evolver",
    inspected_commit: "17e1c79bbbd3e80536d654ecf1925c5f97c0fcd8",
    borrowed: [
      "wide mutation candidate generation",
      "adaptive strategy switching after repair loops",
      "hard and soft failure classification",
      "candidate suppression after failed replay",
      "blast-radius aware validation"
    ],
    rejected: [
      "daemon loop import",
      "Hub worker execution",
      "marketplace or ATP auto-delivery",
      "host-runtime sessions_spawn authority"
    ]
  }
];

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function countBy(values, selector) {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function routeStrategy(routeTarget, signals) {
  if (signals.includes("candidate_replay_failed")) return "suppress_failed_candidate";
  if (signals.includes("repeated_failure_pattern")) return "repair_pattern_to_case";
  if (signals.includes("reusable_workflow")) return "crystallize_repeatable_skill";
  if (routeTarget === "policy") return "harden_future_boundary";
  if (routeTarget === "memory") return "stabilize_verified_fact";
  if (routeTarget === "damping") return "observe_more_before_learning";
  return "wide_candidate_review";
}

function classifyFailure(trace) {
  const signals = trace.observe.signals ?? [];
  const toolErrors = trace.artifact_evidence?.tool_errors ?? [];

  if (signals.includes("candidate_replay_failed")) {
    return {
      class: "soft_validation_failure",
      retryable: true,
      suppress_candidate: true,
      rationale: "Candidate replay failed, so the candidate is suppressed before publication."
    };
  }

  if (signals.includes("explicit_user_boundary") || signals.includes("public_posting_boundary")) {
    return {
      class: "none",
      retryable: false,
      suppress_candidate: false,
      rationale: "Boundary signal is valid but production action still needs human approval."
    };
  }

  if (toolErrors.length > 0 && trace.route.target === "case") {
    return {
      class: "known_failure_pattern",
      retryable: true,
      suppress_candidate: false,
      rationale: "Repeated tool errors are converted into a case candidate."
    };
  }

  return {
    class: "none",
    retryable: false,
    suppress_candidate: false,
    rationale: "No failure suppression is required."
  };
}

function makeGate(name, ok, state, reason) {
  return { name, ok, state, reason };
}

function buildGeneratedSignals(trace) {
  return uniqueStrings([
    ...trace.observe.signals,
    `route:${trace.route.target}`,
    `status:${trace.result.status}`,
    `risk:${trace.observe.risk_level}`,
    `control:${trace.identify.control_category}`,
    `error:${trace.identify.error_class}`,
    `setpoint:${trace.identify.setpoint}`
  ]);
}

function classifyDecision(trace, failureMode) {
  if (failureMode.suppress_candidate || trace.result.status === "rejected") {
    return "rejected";
  }

  if (trace.route.target === "damping") {
    return "held_for_more_evidence";
  }

  if (trace.result.positive_value && trace.observe.evidence_count >= 2) {
    return "validation_ready";
  }

  return "held_for_more_evidence";
}

function buildAdaptiveCandidate(trace, skillCandidateBySource) {
  const generatedSignals = buildGeneratedSignals(trace);
  const failureMode = classifyFailure(trace);
  const decision = classifyDecision(trace, failureMode);
  const skillCandidate = skillCandidateBySource.get(trace.source_event_id);
  const hasLiveEffects = Object.values(trace.result.live_effects ?? {}).some(Boolean);
  const evidenceOk = trace.observe.evidence_count >= 2;
  const commandsAllowed = VALIDATION_COMMANDS.every((command) => command.startsWith("npm run ") || command === "npm test");
  const entersVerification = decision === "validation_ready";
  const productionLocked = true;

  const gates = [
    makeGate(
      "candidate_generation",
      true,
      "allowed",
      "v0.8 allows wide local candidate generation before filtering."
    ),
    makeGate(
      "evidence",
      evidenceOk,
      evidenceOk ? "passed" : "held",
      evidenceOk ? "At least two evidence points are present." : "Evidence is thin, so the candidate is held."
    ),
    makeGate(
      "live_effects",
      !hasLiveEffects,
      !hasLiveEffects ? "passed" : "rejected",
      "Candidates with live effects cannot enter validation."
    ),
    makeGate(
      "validation_command_allowlist",
      commandsAllowed,
      commandsAllowed ? "passed" : "rejected",
      "Validation commands must stay inside known local npm scripts."
    ),
    makeGate(
      "production_authority",
      productionLocked,
      "blocked_by_design",
      "Production authority remains false even for validation-ready candidates."
    )
  ];

  if (failureMode.suppress_candidate) {
    gates.push(makeGate(
      "candidate_suppression",
      true,
      "suppressed",
      failureMode.rationale
    ));
  }

  return {
    candidate_id: `adaptive-${trace.source_event_id}`,
    source_event_id: trace.source_event_id,
    source_cycle_id: trace.cycle_id,
    route_target: trace.route.target,
    summary: trace.proposed_change.summary,
    generated_signals: generatedSignals,
    decision,
    strategy: routeStrategy(trace.route.target, trace.observe.signals ?? []),
    blast_radius: {
      max_files: trace.route.target === "skill" ? 3 : 2,
      max_generated_artifacts: skillCandidate ? skillCandidate.self_repair.write_scope.length : 1,
      source: "operator_v0_8_profile"
    },
    failure_mode: failureMode,
    safety: {
      production_authority: false,
      publication_allowed: false,
      requires_human_approval_for_production: true,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    },
    safety_gates: gates,
    verification: {
      level: "L1",
      enters_verification: entersVerification,
      commands: entersVerification ? [...VALIDATION_COMMANDS] : [],
      allowlist: "misa-known-local-npm-scripts"
    },
    linked_skill_candidate_id: skillCandidate?.candidate_id ?? null,
    suppression: {
      applied: failureMode.suppress_candidate,
      reason: failureMode.suppress_candidate ? failureMode.rationale : "",
      suppresses_candidate_ids: failureMode.suppress_candidate
        ? uniqueStrings(trace.proposed_change.affected_artifacts)
        : []
    }
  };
}

function summarizeSignals(candidates) {
  const all = candidates.flatMap((candidate) => candidate.generated_signals);
  const routeBySignal = new Map();

  for (const candidate of candidates) {
    for (const signal of candidate.generated_signals) {
      const routes = routeBySignal.get(signal) ?? new Set();
      routes.add(candidate.route_target);
      routeBySignal.set(signal, routes);
    }
  }

  return [...countBy(all, (value) => value).entries()]
    .map(([signal, count]) => ({
      signal,
      count,
      routes: [...routeBySignal.get(signal)].sort()
    }))
    .sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal));
}

export async function reviewAdaptiveCandidateGate({ repoRoot = process.cwd() } = {}) {
  const simulation = await simulateMisaLearning({ repoRoot });
  const crystallization = await crystallizeMisaSkills({ repoRoot });
  const skillCandidateBySource = new Map(
    crystallization.candidates.map((candidate) => [candidate.source_event_id, candidate])
  );
  const candidates = simulation.traces.map((trace) => buildAdaptiveCandidate(trace, skillCandidateBySource));
  const validationReady = candidates.filter((candidate) => candidate.decision === "validation_ready");
  const held = candidates.filter((candidate) => candidate.decision === "held_for_more_evidence");
  const rejected = candidates.filter((candidate) => candidate.decision === "rejected");
  const learningSignals = summarizeSignals(candidates);
  const violations = [...simulation.violations, ...crystallization.violations];
  const warnings = [
    "v0.8 widens local candidate generation but does not widen production authority.",
    "EvoMap/evolver is used as a logic reference only; daemon, Hub worker, and marketplace execution are not imported."
  ];

  for (const candidate of candidates) {
    if (candidate.safety.production_authority) {
      violations.push(`${candidate.candidate_id} unexpectedly has production authority`);
    }

    if (candidate.safety.publication_allowed) {
      violations.push(`${candidate.candidate_id} unexpectedly allows publication`);
    }

    if (Object.values(candidate.safety.live_effects).some(Boolean)) {
      violations.push(`${candidate.candidate_id} unexpectedly has live effects`);
    }

    if (candidate.decision !== "validation_ready" && candidate.verification.enters_verification) {
      violations.push(`${candidate.candidate_id} enters verification despite decision ${candidate.decision}`);
    }

    if (candidate.decision === "validation_ready" && candidate.verification.commands.length === 0) {
      violations.push(`${candidate.candidate_id} is validation-ready without validation commands`);
    }

    for (const command of candidate.verification.commands) {
      if (!VALIDATION_COMMANDS.includes(command)) {
        violations.push(`${candidate.candidate_id} uses non-allowlisted validation command ${command}`);
      }
    }
  }

  if (candidates.length <= crystallization.candidates.length) {
    violations.push("adaptive generation did not widen beyond skill crystallization candidates");
  }

  if (validationReady.length === 0) {
    violations.push("adaptive gate produced no validation-ready candidates");
  }

  if (!rejected.some((candidate) => candidate.suppression.applied)) {
    violations.push("adaptive gate did not suppress the failed replay candidate");
  }

  return {
    schema_version: "misa.adaptive_candidate_gate.v1",
    mode: "adaptive-candidate-gate",
    ok: violations.length === 0,
    operator_safety_profile: {
      id: "misa-v0.8-wide-generate-filtered-verify",
      candidate_generation: "wide",
      filter_mode: "strict_safety_gate",
      validation_mode: "local_allowlisted_commands",
      production_authority: false,
      production_gate: "hard_locked_until_explicit_human_approval"
    },
    source_adaptations: SOURCE_ADAPTATIONS,
    strategy_rules: [
      {
        id: "wide_generate_first",
        rule: "Generate local candidates and learning signals before rejecting weak ideas.",
        production_effect: "none"
      },
      {
        id: "failed_replay_suppression",
        rule: "Suppress candidates that failed replay instead of retrying them blindly.",
        production_effect: "none"
      },
      {
        id: "repair_loop_escape",
        rule: "Repeated repair failures may switch to innovation, but blast radius is reduced.",
        production_effect: "none"
      },
      {
        id: "production_hard_gate",
        rule: "No validation-ready candidate can publish, write memory, start services, or touch live channels.",
        production_effect: "blocked"
      }
    ],
    summary: {
      source_trace_count: simulation.traces.length,
      generated_candidate_count: candidates.length,
      validation_ready_count: validationReady.length,
      held_count: held.length,
      rejected_count: rejected.length,
      generated_signal_count: learningSignals.length,
      skill_candidate_count: crystallization.candidates.length,
      production_authority: false
    },
    learning_signals: learningSignals,
    candidates,
    warnings,
    violations
  };
}
