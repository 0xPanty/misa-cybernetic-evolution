import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SKILL_EVOLUTION_CONTRACT = "examples/skill-evolution/farcaster_reply_operator.contract.json";
export const DEFAULT_BEHAVIOR_EVENT = "examples/behavior-events/farcaster_public_reply.event.json";

const RISK_ORDER = new Map([
  ["low", 1],
  ["medium", 2],
  ["high", 3],
  ["blocking", 4]
]);

const LIVE_AUTHORITIES = new Set(["gated_write", "live_write"]);
const REVIEW_STATUSES = new Set(["executed", "succeeded", "failed"]);

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-14T00:00:00Z").toISOString() : date.toISOString();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function resolvePath(repoRoot, relOrAbs) {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(repoRoot, relOrAbs);
}

function setIncludesMatch(values = [], candidate = "") {
  const normalized = candidate.toLowerCase();
  return values.some((value) => {
    const expected = String(value).toLowerCase();
    return normalized === expected || normalized.includes(expected);
  });
}

function riskAtLeast(actual, minimum) {
  return (RISK_ORDER.get(actual) ?? 0) >= (RISK_ORDER.get(minimum) ?? 0);
}

function gatePassed(event, gateName = "qianxuesen_gate") {
  return event.authority.gates_passed.includes(gateName);
}

function makeCheck(name, ok, details = {}) {
  return {
    name,
    ok,
    ...details
  };
}

function makeViolation(code, severity, message, details = {}) {
  return {
    code,
    severity,
    message,
    ...details
  };
}

function memoryClasses(event) {
  return event.inputs.memory_used.map((item) => item.memory_class);
}

function observedSignals(contract, event) {
  const signals = new Set(event.risk.triggers);
  if (event.effects.public_output) signals.add("public_output");
  if (event.effects.persistent_write) signals.add("persistent_write");
  if (event.effects.durable_effect) signals.add("durable_effect");
  if (event.effects.external_call) signals.add("external_call");
  if (event.actor.autonomous) signals.add("autonomous_actor");
  for (const memoryClass of memoryClasses(event)) {
    if (setIncludesMatch(contract.memory_policy.forbidden_memory_classes, memoryClass)) {
      signals.add("private_memory_used");
    }
  }
  if (riskAtLeast(event.risk.level, "high")) signals.add("high_risk");
  if (LIVE_AUTHORITIES.has(event.authority.requested_authority)) signals.add("live_write");
  return [...signals].sort();
}

function evaluateChecks(contract, event) {
  const actionAllowed = contract.action_policy.allowed_actions.includes(event.action);
  const actionForbidden = contract.action_policy.forbidden_actions.includes(event.action);
  const usedMemory = memoryClasses(event);
  const forbiddenMemory = usedMemory.filter((item) => (
    setIncludesMatch(contract.memory_policy.forbidden_memory_classes, item)
  ));
  const unknownMemory = usedMemory.filter((item) => (
    !setIncludesMatch(contract.memory_policy.allowed_memory_classes, item)
    && !setIncludesMatch(contract.memory_policy.forbidden_memory_classes, item)
  ));
  const observed = observedSignals(contract, event);
  const gateRequiredSignals = observed.filter((signal) => (
    contract.action_policy.gate_required_for.includes(signal)
  ));
  const highRiskGateRequired = riskAtLeast(event.risk.level, "high")
    && contract.action_policy.gate_required_for.includes("high_risk");
  const publicPublishNeedsGate = event.effects.public_output
    && event.effects.persistent_write
    && contract.action_policy.public_output_policy !== "gated_publish_allowed";
  const persistentWriteNeedsGate = event.effects.persistent_write
    && ["forbidden", "gated_only"].includes(contract.action_policy.persistent_write_policy);
  const liveAuthorityNeedsGate = LIVE_AUTHORITIES.has(event.authority.requested_authority);
  const hasGate = gatePassed(event);
  const candidate = event.evolution?.candidate ?? null;
  const candidateAllowed = candidate
    ? contract.evolution_policy.allowed_evolution_space.includes(candidate.target)
    : true;
  const candidateForbidden = candidate
    ? contract.evolution_policy.forbidden_evolution_space.includes(candidate.target)
    : false;

  const checks = [
    makeCheck("skill id matches contract", event.skill_id === contract.skill_id, {
      contract_skill_id: contract.skill_id,
      event_skill_id: event.skill_id
    }),
    makeCheck("action is not forbidden", !actionForbidden, {
      action: event.action
    }),
    makeCheck("action is in allowed action set", actionAllowed, {
      action: event.action,
      allowed: contract.action_policy.allowed_actions
    }),
    makeCheck("forbidden memory classes are absent", forbiddenMemory.length === 0, {
      forbidden_memory: forbiddenMemory
    }),
    makeCheck("persistent write has gate when required", !persistentWriteNeedsGate || hasGate, {
      persistent_write: event.effects.persistent_write,
      policy: contract.action_policy.persistent_write_policy,
      gate_passed: hasGate
    }),
    makeCheck("public durable output has gate when required", !publicPublishNeedsGate || hasGate, {
      public_output: event.effects.public_output,
      persistent_write: event.effects.persistent_write,
      gate_passed: hasGate
    }),
    makeCheck("high-risk behavior has gate when required", !highRiskGateRequired || hasGate, {
      risk_level: event.risk.level,
      gate_passed: hasGate
    }),
    makeCheck("live authority is not requested without gate", !liveAuthorityNeedsGate || hasGate, {
      requested_authority: event.authority.requested_authority,
      gate_passed: hasGate
    }),
    makeCheck("evolution candidate stays inside allowed space", candidateAllowed && !candidateForbidden, {
      candidate_target: candidate?.target ?? null,
      allowed_space: contract.evolution_policy.allowed_evolution_space,
      forbidden_space: contract.evolution_policy.forbidden_evolution_space
    })
  ];

  const violations = [];
  const warnings = [];

  if (event.skill_id !== contract.skill_id) {
    violations.push(makeViolation("skill_id_mismatch", "blocking", "Behavior event skill_id does not match the contract."));
  }
  if (actionForbidden) {
    violations.push(makeViolation("forbidden_action", "blocking", "Behavior event uses an explicitly forbidden action.", {
      action: event.action
    }));
  }
  if (!actionAllowed) {
    const severity = contract.action_policy.gate_required_for.includes("unknown_action") ? "high" : "medium";
    warnings.push(makeViolation("unknown_action", severity, "Behavior action is outside the declared allowed action set.", {
      action: event.action
    }));
  }
  if (forbiddenMemory.length) {
    violations.push(makeViolation("forbidden_memory_used", "blocking", "Behavior event used memory classes forbidden by the skill contract.", {
      memory_classes: forbiddenMemory
    }));
  }
  if (unknownMemory.length) {
    warnings.push(makeViolation("unknown_memory_class", "medium", "Behavior event used memory classes not listed in the contract.", {
      memory_classes: unknownMemory
    }));
  }
  if ((persistentWriteNeedsGate || publicPublishNeedsGate || highRiskGateRequired || liveAuthorityNeedsGate) && !hasGate) {
    violations.push(makeViolation("missing_qianxuesen_gate", "high", "Behavior requires a Qianxuesen gate but none was recorded.", {
      required_for: gateRequiredSignals,
      requested_authority: event.authority.requested_authority
    }));
  }
  if (candidateForbidden) {
    violations.push(makeViolation("forbidden_evolution_target", "blocking", "Evolution candidate targets a forbidden evolution space.", {
      target: candidate.target
    }));
  } else if (candidate && !candidateAllowed) {
    warnings.push(makeViolation("unknown_evolution_target", "medium", "Evolution candidate target is not in the allowed evolution space.", {
      target: candidate.target
    }));
  }

  return {
    checks,
    violations,
    warnings,
    observed,
    candidate
  };
}

function inferRouteRecommendation(contract, event, violations) {
  if (violations.some((violation) => violation.code === "forbidden_memory_used")) return "policy";
  if (violations.some((violation) => violation.code === "forbidden_action")) return "policy";
  if (event.result.feedback_signals.includes("policy_conflict")) return "policy";
  if (event.result.feedback_signals.includes("positive_engagement")) return "skill";
  if (event.result.status === "failed") return "damping";
  return contract.routing_policy.expected_routes.includes("case") ? "case" : contract.routing_policy.expected_routes[0];
}

function candidateFromEvent(contract, event, candidate, violations) {
  if (!candidate) return [];
  const forbidden = contract.evolution_policy.forbidden_evolution_space.includes(candidate.target);
  const allowed = contract.evolution_policy.allowed_evolution_space.includes(candidate.target);
  return [{
    candidate_id: `skill-evo-${event.event_id}-${candidate.target}`.replace(/[^a-zA-Z0-9_.-]/g, "-"),
    skill_id: contract.skill_id,
    source_event_id: event.event_id,
    target: candidate.target,
    change_type: candidate.change_type,
    proposed_change: candidate.proposed_change,
    expected_gain: candidate.expected_gain,
    evidence_refs: candidate.evidence_refs,
    status: violations.length || forbidden ? "blocked" : "replay_required",
    allowed_space_match: allowed,
    forbidden_space_match: forbidden,
    replay_required: true,
    promotion_gate: {
      can_promote_now: false,
      reason: "Skill evolution candidates must pass replay before promotion.",
      required_rules: contract.evolution_policy.promotion_rules
    }
  }];
}

function inferredCandidates(contract, event, existingCandidates) {
  if (existingCandidates.length > 0) return [];
  const signals = event.result.feedback_signals;
  const suggestions = [];
  if (signals.includes("positive_engagement") && signals.includes("policy_clean")) {
    const target = contract.evolution_policy.allowed_evolution_space.includes("successful_reply_pattern")
      ? "successful_reply_pattern"
      : contract.evolution_policy.allowed_evolution_space[0];
    suggestions.push({
      candidate_id: `skill-evo-${event.event_id}-${target}`,
      skill_id: contract.skill_id,
      source_event_id: event.event_id,
      target,
      change_type: "pattern_candidate",
      proposed_change: "Consider replaying this successful behavior as a reusable low-risk skill pattern.",
      expected_gain: "Improve future behavior ranking without changing authority.",
      evidence_refs: [event.event_id],
      status: "replay_required",
      allowed_space_match: true,
      forbidden_space_match: false,
      replay_required: true,
      promotion_gate: {
        can_promote_now: false,
        reason: "Inferred candidates are advisory until replay proves improvement.",
        required_rules: contract.evolution_policy.promotion_rules
      }
    });
  }
  if (signals.includes("policy_conflict")) {
    const target = contract.evolution_policy.allowed_evolution_space.includes("cooldown_damping")
      ? "cooldown_damping"
      : contract.evolution_policy.allowed_evolution_space[0];
    suggestions.push({
      candidate_id: `skill-evo-${event.event_id}-${target}`,
      skill_id: contract.skill_id,
      source_event_id: event.event_id,
      target,
      change_type: "damping_candidate",
      proposed_change: "Hold this as a damping or policy-route precision candidate instead of rewriting the skill directly.",
      expected_gain: "Reduce overreaction to noisy public-output failures.",
      evidence_refs: [event.event_id],
      status: "replay_required",
      allowed_space_match: true,
      forbidden_space_match: false,
      replay_required: true,
      promotion_gate: {
        can_promote_now: false,
        reason: "Policy conflict needs repeated evidence and replay.",
        required_rules: contract.evolution_policy.promotion_rules
      }
    });
  }
  return suggestions;
}

function reviewRequired(contract, event, violations, observed) {
  return violations.length > 0
    || observed.some((signal) => contract.review_policy.human_review_required_when.includes(signal))
    || (event.effects.public_output && REVIEW_STATUSES.has(event.result.status));
}

function llmJudgeRecommended(contract, event, observed) {
  return observed.some((signal) => contract.review_policy.llm_judge_recommended_when.includes(signal))
    || event.result.feedback_signals.some((signal) => contract.review_policy.llm_judge_recommended_when.includes(signal));
}

export function superviseSkillEvolution({
  contract,
  behaviorEvent,
  now = new Date()
} = {}) {
  if (!contract) throw new Error("contract is required");
  if (!behaviorEvent) throw new Error("behaviorEvent is required");

  const evaluation = evaluateChecks(contract, behaviorEvent);
  const explicitCandidates = candidateFromEvent(contract, behaviorEvent, evaluation.candidate, evaluation.violations);
  const inferred = inferredCandidates(contract, behaviorEvent, explicitCandidates);
  const evolutionCandidates = [...explicitCandidates, ...inferred];
  const routeRecommendation = inferRouteRecommendation(contract, behaviorEvent, evaluation.violations);
  const humanReviewRequired = reviewRequired(contract, behaviorEvent, evaluation.violations, evaluation.observed);
  const llmReviewRecommended = llmJudgeRecommended(contract, behaviorEvent, evaluation.observed);
  const ok = evaluation.violations.length === 0 && evaluation.checks.every((check) => check.ok || check.name === "action is in allowed action set");
  const replayRequiredCount = evolutionCandidates.filter((candidate) => candidate.replay_required).length;

  return {
    schema_version: "misa.skill_evolution_supervision.v1",
    mode: "skill-evolution-supervisor",
    ok,
    created_at: asIsoDate(now),
    skill_id: contract.skill_id,
    event_id: behaviorEvent.event_id,
    surface: behaviorEvent.surface,
    summary: {
      status: ok ? (evaluation.warnings.length ? "warn" : "pass") : "fail",
      check_count: evaluation.checks.length,
      failed_check_count: evaluation.checks.filter((check) => !check.ok).length,
      violation_count: evaluation.violations.length,
      warning_count: evaluation.warnings.length,
      evolution_candidate_count: evolutionCandidates.length,
      replay_required_count: replayRequiredCount,
      human_review_required: humanReviewRequired,
      llm_judge_recommended: llmReviewRecommended
    },
    control_model: contract.control_model,
    observed_signals: evaluation.observed,
    checks: evaluation.checks,
    violations: evaluation.violations,
    warnings: evaluation.warnings,
    evolution_candidates: evolutionCandidates,
    routing: {
      owner: contract.routing_policy.route_owner,
      expected_routes: contract.routing_policy.expected_routes,
      recommended_route: routeRecommendation
    },
    promotion_gate: {
      can_promote_now: false,
      replay_required: replayRequiredCount > 0,
      promotion_rules: contract.evolution_policy.promotion_rules,
      rollback_triggers: contract.evolution_policy.rollback_triggers
    },
    safety: {
      no_write: true,
      controller_authority: false,
      production_authority: false,
      live_effect_allowed: false,
      supervisor_changes_skill: false,
      supervisor_changes_route: false,
      supervisor_changes_winner: false,
      llm_api_calls: 0,
      external_api_calls: 0,
      event_public_output: behaviorEvent.effects.public_output,
      event_persistent_write: behaviorEvent.effects.persistent_write,
      event_durable_effect: behaviorEvent.effects.durable_effect
    }
  };
}

export async function runSkillEvolutionSupervisor({
  repoRoot = process.cwd(),
  contractFile = DEFAULT_SKILL_EVOLUTION_CONTRACT,
  eventFile = DEFAULT_BEHAVIOR_EVENT,
  now = new Date()
} = {}) {
  const contract = await readJson(resolvePath(repoRoot, contractFile));
  const behaviorEvent = await readJson(resolvePath(repoRoot, eventFile));
  return superviseSkillEvolution({
    contract,
    behaviorEvent,
    now
  });
}
