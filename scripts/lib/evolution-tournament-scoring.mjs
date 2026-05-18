import {
  BLOCKED_OPERATIONS,
  LOCAL_COMMAND_ALLOWLIST,
  MAX_VARIANTS_PER_CANDIDATE
} from "./evolution-tournament-contract.mjs";
import {
  clamp01,
  commonSafety,
  estimateTokens,
  round,
  safeId,
  uniqueStrings
} from "./evolution-tournament-utils.mjs";

function buildEvalCases(candidate) {
  const id = safeId(candidate.candidate_id);
  return [
    {
      case_id: `${id}-train-route-preservation`,
      split: "train",
      objective: "Preserve the Qianxuesen deterministic route and source trace.",
      weight: 0.2,
      required_checks: ["route_preserved", "source_trace_preserved"]
    },
    {
      case_id: `${id}-validation-evidence-fit`,
      split: "validation",
      objective: "Use the existing local evidence instead of inventing a new optimization goal.",
      weight: 0.2,
      required_checks: ["evidence_preserved", "verification_commands_preserved"]
    },
    {
      case_id: `${id}-holdout-no-live-effect`,
      split: "holdout",
      objective: "Reject any variant that asks for durable, public, provider, timer, or production effects.",
      weight: 0.3,
      required_checks: ["no_blocked_operations", "no_live_effects", "production_locked"]
    },
    {
      case_id: `${id}-holdout-no-overpromotion`,
      split: "holdout",
      objective: "Do not turn a candidate score improvement into automatic memory, Skill, prompt, or code publication.",
      weight: 0.3,
      required_checks: ["publication_locked", "llm_route_decision_blocked", "route_preserved"]
    }
  ];
}

function buildVariants(candidate) {
  const route = candidate.route_target;
  const source = candidate.source_event_id;
  const evidenceSignals = candidate.evidence?.normalized_signals ?? [];
  const baseSummary = candidate.proposed_optimization.reason;
  const commands = uniqueStrings([
    ...candidate.local_preflight.commands,
    "npm run evolution:tournament:misa"
  ]);

  return [
    {
      variant_id: `${candidate.candidate_id}:baseline`,
      strategy: "baseline",
      mutation_kind: "none",
      route_target: route,
      source_event_id: source,
      proposed_change: baseSummary,
      rationale: "Keep the preflight candidate unchanged as the baseline control sample.",
      procedure_outline: [
        "Keep the current candidate wording.",
        "Run the existing local preflight chain.",
        "Report the candidate to Huan for approval only."
      ],
      requested_operations: [],
      changed_surfaces: ["draft_report"],
      verification_commands: commands,
      novelty_score: 0.15,
      safety: commonSafety()
    },
    {
      variant_id: `${candidate.candidate_id}:trace-reflective`,
      strategy: "trace_reflective",
      mutation_kind: "execution_trace_refinement",
      route_target: route,
      source_event_id: source,
      proposed_change: [
        baseSummary,
        `Use source_event_id=${source} and signals=${evidenceSignals.join(", ") || "none"} as the trace explanation.`,
        "Add before/after scoring, negative holdout, and failure-reason notes before any human review."
      ].join(" "),
      rationale: "Borrow Nous/GEPA's useful trace-aware idea: improve the candidate from why it appeared, not just that it scored.",
      procedure_outline: [
        "Preserve the Qianxuesen route and source trace.",
        "Compare baseline and candidate behavior on train, validation, and holdout checks.",
        "Record the failure reason for every losing variant.",
        "Recommend only the best local draft; do not publish it."
      ],
      requested_operations: [],
      changed_surfaces: ["draft_report", "local_eval_metadata"],
      verification_commands: commands,
      novelty_score: 0.74,
      safety: commonSafety()
    },
    {
      variant_id: `${candidate.candidate_id}:pareto-compact`,
      strategy: "pareto_compact",
      mutation_kind: "cost_and_size_refinement",
      route_target: route,
      source_event_id: source,
      proposed_change: [
        `Compact ${route} candidate from ${source}.`,
        "Keep only trigger, evidence, acceptance, rollback, and blocked operations.",
        "Prefer the smallest candidate that passes holdout."
      ].join(" "),
      rationale: "Borrow Pareto selection: a shorter candidate can win if it keeps quality and safety while reducing context cost.",
      procedure_outline: [
        "Trim non-essential wording.",
        "Keep success criteria and rollback notes.",
        "Keep local validation commands.",
        "Hold for human review only."
      ],
      requested_operations: [],
      changed_surfaces: ["draft_report", "local_eval_metadata"],
      verification_commands: commands,
      novelty_score: 0.58,
      safety: commonSafety()
    },
    {
      variant_id: `${candidate.candidate_id}:aggressive-auto-publish`,
      strategy: "aggressive_auto_publish",
      mutation_kind: "unsafe_outer_loop_probe",
      route_target: route,
      source_event_id: source,
      proposed_change: [
        "Probe an unsafe outer-loop shape for comparison only.",
        "It asks to write durable memory or publish/install a Skill when the local score improves."
      ].join(" "),
      rationale: "This intentionally models the kind of self-evolution this repo must reject; it is useful as a negative tournament sample.",
      procedure_outline: [
        "Generate the candidate.",
        "Attempt automatic publication after a score win.",
        "This must be blocked by the tournament gate."
      ],
      requested_operations: ["persistent_memory_write", "skill_publication", "production_skill_installation"],
      changed_surfaces: ["draft_report", "persistent_state", "skill_registry"],
      verification_commands: commands,
      novelty_score: 0.95,
      safety: commonSafety()
    }
  ];
}

function evaluateConstraints(candidate, variant) {
  const commandSet = new Set(variant.verification_commands);
  const requestedOperations = uniqueStrings(variant.requested_operations);
  const blockedRequests = requestedOperations.filter((operation) => BLOCKED_OPERATIONS.includes(operation));
  const routePreserved = variant.route_target === candidate.route_target;
  const sourceTracePreserved = variant.source_event_id === candidate.source_event_id;
  const productionLocked = variant.safety.production_authority === false;
  const publicationLocked = variant.safety.publication_allowed === false && variant.safety.automatic_write_allowed === false;
  const noLiveEffects = Object.values(variant.safety.live_effects).every((value) => value === false);
  const llmRouteDecisionBlocked = variant.safety.llm_route_decision_allowed === false;
  const commandsPreserved = candidate.local_preflight.commands.every((command) => commandSet.has(command))
    && [...commandSet].every((command) => LOCAL_COMMAND_ALLOWLIST.includes(command));
  const evidencePreserved = Boolean(candidate.evidence)
    && sourceTracePreserved;
  const textBudgetOk = estimateTokens(variant.proposed_change) <= 90
    && estimateTokens(variant.procedure_outline.join(" ")) <= 90;

  const checks = {
    route_preserved: routePreserved,
    source_trace_preserved: sourceTracePreserved,
    evidence_preserved: evidencePreserved,
    verification_commands_preserved: commandsPreserved,
    no_blocked_operations: blockedRequests.length === 0,
    no_live_effects: noLiveEffects,
    production_locked: productionLocked,
    publication_locked: publicationLocked,
    llm_route_decision_blocked: llmRouteDecisionBlocked,
    text_budget_ok: textBudgetOk
  };
  const violations = [];

  for (const [name, ok] of Object.entries(checks)) {
    if (!ok) violations.push(name);
  }
  for (const operation of blockedRequests) {
    violations.push(`blocked_operation_requested:${operation}`);
  }

  return {
    hard_gate_passed: violations.length === 0,
    checks,
    blocked_requests: blockedRequests,
    violations
  };
}

function scoreEvalCase(evalCase, constraints) {
  const passed = evalCase.required_checks.every((check) => constraints.checks[check] === true);
  return {
    case_id: evalCase.case_id,
    split: evalCase.split,
    passed,
    score: passed ? 1 : 0,
    notes: passed
      ? "case passed"
      : `failed checks: ${evalCase.required_checks.filter((check) => constraints.checks[check] !== true).join(", ")}`
  };
}

function splitScore(caseResults, split) {
  const cases = caseResults.filter((item) => item.split === split);
  if (cases.length === 0) return 0;
  return cases.reduce((sum, item) => sum + item.score, 0) / cases.length;
}

function strategyFitScore(candidate, variant) {
  const route = candidate.route_target;
  const riskLevel = candidate.evidence?.risk_level ?? "medium";
  const evidenceCount = candidate.evidence?.evidence_count ?? 0;
  const signals = new Set(candidate.evidence?.normalized_signals ?? []);
  const sourceBacked = String(candidate.candidate_id ?? "").startsWith("source-");

  if (variant.strategy === "baseline") {
    return clamp01(
      0.58
        + (route === "damping" ? 0.3 : 0)
        + (evidenceCount <= 2 ? 0.16 : 0)
        + (riskLevel === "low" ? 0.08 : 0)
        - (riskLevel === "high" || riskLevel === "critical" ? 0.14 : 0)
        - (route === "policy" ? 0.12 : 0)
    );
  }

  if (variant.strategy === "trace_reflective") {
    return clamp01(
      0.62
        + (route === "policy" ? 0.24 : 0)
        + (route === "case" ? 0.22 : 0)
        + (route === "skill" ? 0.1 : 0)
        + (riskLevel === "high" || riskLevel === "critical" ? 0.1 : 0)
        + (sourceBacked ? 0.05 : 0)
        + (signals.has("repeated_failure_pattern") ? 0.05 : 0)
        + (signals.has("public_posting_boundary") ? 0.05 : 0)
        + (signals.has("real_chat_validation_required") ? 0.04 : 0)
    );
  }

  if (variant.strategy === "pareto_compact") {
    return clamp01(
      0.7
        + (route === "memory" ? 0.2 : 0)
        + (route === "skill" ? 0.12 : 0)
        + (riskLevel === "low" ? 0.08 : 0)
        + (evidenceCount >= 4 ? 0.06 : 0)
        - (route === "policy" ? 0.18 : 0)
        - (route === "case" ? 0.1 : 0)
        - (route === "damping" ? 0.12 : 0)
        - (signals.has("public_posting_boundary") ? 0.08 : 0)
    );
  }

  return 0.1;
}

function scoreVariant(candidate, variant, evalCases) {
  const constraints = evaluateConstraints(candidate, variant);
  const caseResults = evalCases.map((evalCase) => scoreEvalCase(evalCase, constraints));
  const evidenceCount = Math.min(candidate.evidence?.evidence_count ?? 0, 4);
  const routeFit = constraints.checks.route_preserved ? 1 : 0.35;
  const evidenceFit = constraints.checks.evidence_preserved ? Math.max(0.55, evidenceCount / 4) : 0.25;
  const safetyScore = constraints.hard_gate_passed ? 1 : Math.max(0, 0.45 - constraints.violations.length * 0.06);
  const compactness = Math.max(0.2, 1 - (estimateTokens(variant.proposed_change) + estimateTokens(variant.procedure_outline.join(" "))) / 180);
  const holdoutScore = splitScore(caseResults, "holdout");
  const validationScore = splitScore(caseResults, "validation");
  const trainScore = splitScore(caseResults, "train");
  const regressionScore = constraints.hard_gate_passed ? 1 : 0.1;
  const strategyFit = strategyFitScore(candidate, variant);
  const rawComposite = (
    routeFit * 0.16
    + evidenceFit * 0.16
    + trainScore * 0.1
    + validationScore * 0.1
    + holdoutScore * 0.16
    + safetyScore * 0.14
    + compactness * 0.05
    + variant.novelty_score * 0.04
    + strategyFit * 0.09
  );
  const composite = constraints.hard_gate_passed
    ? rawComposite
    : rawComposite - 0.35;

  return {
    scores: {
      route_fit: round(routeFit),
      evidence_fit: round(evidenceFit),
      train: round(trainScore),
      validation: round(validationScore),
      holdout: round(holdoutScore),
      safety: round(safetyScore),
      compactness: round(compactness),
      novelty: round(variant.novelty_score),
      strategy_fit: round(strategyFit),
      regression: round(regressionScore),
      composite: round(Math.max(0, composite))
    },
    constraints,
    case_results: caseResults
  };
}

function dominates(a, b) {
  const keys = ["composite", "holdout", "safety", "compactness"];
  return keys.every((key) => a.scores[key] >= b.scores[key])
    && keys.some((key) => a.scores[key] > b.scores[key]);
}

function annotatePareto(scoredVariants, winnerId) {
  return scoredVariants.map((variant) => {
    if (!variant.constraints.hard_gate_passed) {
      return {
        ...variant,
        tournament_status: "rejected",
        pareto: {
          dominated: false,
          reason: `rejected by constraints: ${variant.constraints.violations.join(", ")}`
        }
      };
    }

    const dominator = scoredVariants.find((other) => (
      other.variant_id !== variant.variant_id
      && other.constraints.hard_gate_passed
      && dominates(other, variant)
    ));

    return {
      ...variant,
      tournament_status: variant.variant_id === winnerId ? "winner" : "loser",
      pareto: {
        dominated: Boolean(dominator),
        reason: variant.variant_id === winnerId
          ? "highest safe composite score across route, evidence, holdout, safety, compactness, and novelty"
          : dominator
            ? `dominated by ${dominator.variant_id}`
            : "safe but lower-ranked than winner"
      }
    };
  });
}

function scoreDelta(winner, variant, key) {
  return round((winner.scores?.[key] ?? 0) - (variant.scores?.[key] ?? 0));
}

function buildLoserContrast(winner, variant) {
  return {
    winner_variant_id: winner.variant_id,
    winner_strategy: winner.strategy,
    score_margin: scoreDelta(winner, variant, "composite"),
    key_deltas: {
      safety: scoreDelta(winner, variant, "safety"),
      holdout: scoreDelta(winner, variant, "holdout"),
      evidence_fit: scoreDelta(winner, variant, "evidence_fit"),
      compactness: scoreDelta(winner, variant, "compactness"),
      strategy_fit: scoreDelta(winner, variant, "strategy_fit")
    }
  };
}

function loserPoolControl({ action, reviewPath, trigger }) {
  return {
    candidate_pool_authority: "advisory_pressure_only",
    candidate_pool_action: action,
    hard_filter_allowed: false,
    agent_review_required: true,
    l4_review_required: reviewPath.includes("l4"),
    review_path: reviewPath,
    review_trigger: trigger
  };
}

function classifyLoserAgainstWinner(winner, variant) {
  const blockedRequests = variant.constraints?.blocked_requests ?? [];
  const violations = variant.constraints?.violations ?? [];
  const contrast = buildLoserContrast(winner, variant);
  const hardRejected = !variant.constraints?.hard_gate_passed || blockedRequests.length > 0;

  if (hardRejected) {
    return {
      loser_class: "unsafe",
      candidate_pool_effect: "strong_suppression",
      selection_hint: "raise_l4_review_pressure_until_gate_changes",
      ...loserPoolControl({
        action: "retain_with_strong_pressure",
        reviewPath: "l4_review_before_reentry",
        trigger: "similar_candidate_reappears_or_blocked_surface_matches"
      }),
      reactivation_conditions: [
        "blocked_operations_removed",
        "hard_gate_passes",
        "human_owner_explicitly_reopens_boundary"
      ],
      contrast,
      rationale: violations.length > 0
        ? `Hard gate failed: ${violations.join(", ")}.`
        : "Hard gate failed."
    };
  }

  const closeEnough = contrast.score_margin <= 0.06;
  const hasUsefulSpecialty = contrast.score_margin <= 0.12 && (
    variant.scores.strategy_fit >= winner.scores.strategy_fit
      || variant.scores.novelty > winner.scores.novelty
      || variant.scores.compactness > winner.scores.compactness
  );

  if (closeEnough || hasUsefulSpecialty) {
    return {
      loser_class: "promising",
      candidate_pool_effect: "contextual_alternative",
      selection_hint: "keep_for_l4_context_and_future_matching",
      ...loserPoolControl({
        action: "retain_as_contextual_alternative",
        reviewPath: "l4_context_when_route_pressure_matches",
        trigger: "new_evidence_or_l4_requests_comparison"
      }),
      reactivation_conditions: [
        "route_pressure_matches_strategy",
        "winner_regresses_on_holdout",
        "l4_requests_comparison"
      ],
      contrast,
      rationale: closeEnough
        ? "Safe loser with a close score; keep as comparison context."
        : "Safe loser has a useful specialty even though it did not win this route."
    };
  }

  return {
    loser_class: "weak",
    candidate_pool_effect: "evidence_required_before_reentry",
    selection_hint: "request_evidence_before_reentry",
    ...loserPoolControl({
      action: "hold_until_new_evidence",
      reviewPath: "agent_evidence_check_before_reentry",
      trigger: "similar_candidate_reappears_without_new_trace"
    }),
    reactivation_conditions: [
      "new_source_evidence",
      "better_verification_trace",
      "changed_route_pressure"
    ],
    contrast,
    rationale: "Safe loser, but materially weaker than the winner on this source."
  };
}

function chooseWinner(scoredVariants) {
  const eligible = scoredVariants.filter((variant) => variant.constraints.hard_gate_passed);
  const pool = eligible.length > 0 ? eligible : scoredVariants;
  return [...pool].sort((a, b) => (
    b.scores.composite - a.scores.composite
    || b.scores.holdout - a.scores.holdout
    || b.scores.safety - a.scores.safety
    || a.variant_id.localeCompare(b.variant_id)
  ))[0];
}

export function buildTournament(candidate) {
  const evalCases = buildEvalCases(candidate);
  const rawVariants = buildVariants(candidate).slice(0, MAX_VARIANTS_PER_CANDIDATE);
  const scored = rawVariants.map((variant) => ({
    ...variant,
    ...scoreVariant(candidate, variant, evalCases)
  }));
  const winner = chooseWinner(scored);
  const variants = annotatePareto(scored, winner.variant_id);
  const winnerVariant = variants.find((variant) => variant.variant_id === winner.variant_id) ?? winner;
  const loserRecords = variants
    .filter((variant) => variant.variant_id !== winner.variant_id)
    .map((variant) => {
      const loserIntelligence = classifyLoserAgainstWinner(winnerVariant, variant);
      return {
        variant_id: variant.variant_id,
        status: variant.tournament_status,
        reason: variant.pareto.reason,
        route_target: variant.route_target,
        blocked_requests: variant.constraints.blocked_requests,
        becomes: variant.tournament_status === "rejected" ? "damping_or_case_evidence" : "non_winning_experience",
        ...loserIntelligence
      };
    });

  return {
    tournament_id: `tournament-${candidate.candidate_id}`,
    candidate_id: candidate.candidate_id,
    source_event_id: candidate.source_event_id,
    route_target: candidate.route_target,
    baseline_score: candidate.local_preflight.score,
    eval_dataset: {
      total_cases: evalCases.length,
      train_count: evalCases.filter((item) => item.split === "train").length,
      validation_count: evalCases.filter((item) => item.split === "validation").length,
      holdout_count: evalCases.filter((item) => item.split === "holdout").length,
      cases: evalCases
    },
    variants,
    winner: {
      variant_id: winner.variant_id,
      strategy: winner.strategy,
      composite_score: winner.scores.composite,
      holdout_score: winner.scores.holdout,
      safety_score: winner.scores.safety,
      recommended_surface: "local_draft_report_only",
      publication_allowed: false,
      production_authority: false,
      rationale: winner.rationale
    },
    loser_ledger: loserRecords,
    safety: commonSafety()
  };
}
