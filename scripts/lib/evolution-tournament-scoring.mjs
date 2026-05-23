import {
  BLOCKED_OPERATIONS,
  CONVERGENCE_K,
  LOCAL_COMMAND_ALLOWLIST,
  MAX_VARIANTS_PER_CANDIDATE,
  METRIC_GAMING_RISK_ID,
  SAFETY_CRITICAL_METRIC_IDS,
  SYNTHESIS_METRIC_EPSILON
} from "./evolution-tournament-contract.mjs";
import {
  clamp01,
  commonSafety,
  estimateTokens,
  round,
  safeId,
  stableHash,
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
      changed_surfaces: ["draft_report"],
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

function roleForStrategy(strategy) {
  if (strategy === "baseline") return "incumbent_unchanged";
  if (strategy === "trace_reflective") return "revision_candidate";
  if (strategy === "pareto_compact") return "synthesis_candidate";
  return "negative_probe";
}

function buildControlFootprint(candidate, variant) {
  const role = roleForStrategy(variant.strategy);
  const affectedSetpoints = role === "incumbent_unchanged"
    ? []
    : uniqueStrings([
        `route:${variant.route_target}`,
        role === "negative_probe" ? "promotion_surface" : null
      ]);
  const affectedActuators = role === "incumbent_unchanged"
    ? []
    : uniqueStrings([
        ...(variant.changed_surfaces ?? []).map((surface) => `surface:${surface}`),
        ...(variant.requested_operations ?? []).map((operation) => `operation:${operation}`)
      ]);
  const blockedOperationCount = (variant.requested_operations ?? [])
    .filter((operation) => BLOCKED_OPERATIONS.includes(operation))
    .length;
  const setpointDelta = {
    route_pressure: role === "incumbent_unchanged" ? 0 : round(variant.novelty_score ?? 0),
    surface_pressure: role === "incumbent_unchanged"
      ? 0
      : round(Math.min(1, affectedActuators.length / 4)),
    blocked_operation_pressure: round(Math.min(1, blockedOperationCount / 3))
  };
  const setpointDeltaL1 = round(Object.values(setpointDelta).reduce((sum, value) => sum + Math.abs(value), 0));
  const changeDiffHash = role === "incumbent_unchanged"
    ? "diff-empty"
    : `diff-${stableHash(JSON.stringify({
        candidate_id: candidate.candidate_id,
        variant_id: variant.variant_id,
        role,
        affectedSetpoints,
        affectedActuators,
        setpointDelta
      }))}`;

  return {
    role,
    affected_setpoints: affectedSetpoints,
    affected_actuators: affectedActuators,
    setpoint_delta: setpointDelta,
    setpoint_delta_l1: setpointDeltaL1,
    restraint_score: round(affectedSetpoints.length + affectedActuators.length + setpointDeltaL1),
    change_diff_hash: changeDiffHash
  };
}

function synthesisComparison(variants) {
  const revision = variants.find((variant) => variant.control_footprint.role === "revision_candidate");
  const synthesis = variants.find((variant) => variant.control_footprint.role === "synthesis_candidate");
  const metricEpsilon = SYNTHESIS_METRIC_EPSILON;
  const safetyScoreKeys = ["safety", "holdout", "regression"];

  if (!revision || !synthesis) {
    return {
      revision_variant_id: revision?.variant_id ?? null,
      synthesis_variant_id: synthesis?.variant_id ?? null,
      metric_epsilon: metricEpsilon,
      safety_metric_subset: {
        source: "metric_registry",
        safety_critical_required: true,
        metric_ids: [...SAFETY_CRITICAL_METRIC_IDS],
        score_keys: safetyScoreKeys
      },
      revision_restraint_score: revision?.control_footprint.restraint_score ?? null,
      synthesis_restraint_score: synthesis?.control_footprint.restraint_score ?? null,
      synthesis_more_restrained_than_revision: false,
      synthesis_metric_within_epsilon: false,
      synthesis_safety_at_least_revision: false,
      synthesis_can_beat_revision: false
    };
  }

  const moreRestrained = synthesis.control_footprint.restraint_score <= revision.control_footprint.restraint_score;
  const metricWithinEpsilon = synthesis.scores.composite >= revision.scores.composite * (1 - metricEpsilon);
  const safetyAtLeastRevision = safetyScoreKeys.every((key) => synthesis.scores[key] >= revision.scores[key]);

  return {
    revision_variant_id: revision.variant_id,
    synthesis_variant_id: synthesis.variant_id,
    metric_epsilon: metricEpsilon,
    safety_metric_subset: {
      source: "metric_registry",
      safety_critical_required: true,
      metric_ids: [...SAFETY_CRITICAL_METRIC_IDS],
      score_keys: safetyScoreKeys
    },
    revision_restraint_score: revision.control_footprint.restraint_score,
    synthesis_restraint_score: synthesis.control_footprint.restraint_score,
    synthesis_more_restrained_than_revision: moreRestrained,
    synthesis_metric_within_epsilon: metricWithinEpsilon,
    synthesis_safety_at_least_revision: safetyAtLeastRevision,
    synthesis_can_beat_revision: moreRestrained && metricWithinEpsilon && safetyAtLeastRevision
  };
}

function sortWinnerPool(pool) {
  return [...pool].sort((a, b) => (
    b.scores.composite - a.scores.composite
    || b.scores.holdout - a.scores.holdout
    || b.scores.safety - a.scores.safety
    || (a.control_footprint.role === "incumbent_unchanged" ? -1 : 0)
    || (b.control_footprint.role === "incumbent_unchanged" ? 1 : 0)
    || a.variant_id.localeCompare(b.variant_id)
  ));
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

function loserFailureType({ winner, variant, contrast, hardRejected }) {
  const blockedRequests = variant.constraints?.blocked_requests ?? [];
  if (hardRejected || blockedRequests.length > 0) return "safety_boundary";

  if ((contrast.key_deltas.holdout ?? 0) >= 0.2) return "overfit_or_holdout_regression";
  if ((contrast.key_deltas.evidence_fit ?? 0) >= 0.2) return "evidence_deficit";
  if ((contrast.key_deltas.compactness ?? 0) >= 0.2) return "cost_or_operational_risk";
  if (
    variant.scores.strategy_fit >= winner.scores.strategy_fit
    || variant.scores.novelty > winner.scores.novelty
  ) {
    return "context_mismatch";
  }

  return "quality_inferior";
}

function loserMemoryEvidence({ candidate, loserClass, observedAt }) {
  const weights = {
    unsafe: { decay_weight: 1, confidence: 0.88 },
    weak: { decay_weight: 0.72, confidence: 0.66 },
    promising: { decay_weight: 0.55, confidence: 0.58 }
  };
  const selected = weights[loserClass] ?? weights.weak;

  return {
    observed_at: observedAt,
    last_triggered_at: observedAt,
    evidence_count: candidate.evidence?.evidence_count ?? 0,
    source_count: 1,
    decay_weight: selected.decay_weight,
    confidence: selected.confidence
  };
}

function rehabilitationRecord({ status, reviewPath, reactivationConditions, requiredEvidence }) {
  return {
    status,
    review_path: reviewPath,
    required_evidence: requiredEvidence,
    reactivation_conditions: reactivationConditions,
    record_required_before_pressure_change: true,
    authority: "advisory_reentry_only"
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

function classifyLoserAgainstWinner(winner, variant, { candidate, observedAt }) {
  const blockedRequests = variant.constraints?.blocked_requests ?? [];
  const violations = variant.constraints?.violations ?? [];
  const contrast = buildLoserContrast(winner, variant);
  const hardRejected = !variant.constraints?.hard_gate_passed || blockedRequests.length > 0;
  const failureType = loserFailureType({ winner, variant, contrast, hardRejected });

  if (hardRejected) {
    const loserClass = "unsafe";
    const reactivationConditions = [
      "blocked_operations_removed",
      "hard_gate_passes",
      "human_owner_explicitly_reopens_boundary"
    ];
    const reviewPath = "l4_review_before_reentry";
    return {
      loser_class: loserClass,
      failure_type: failureType,
      candidate_pool_effect: "strong_suppression",
      selection_hint: "raise_l4_review_pressure_until_gate_changes",
      ...loserPoolControl({
        action: "retain_with_strong_pressure",
        reviewPath,
        trigger: "similar_candidate_reappears_or_blocked_surface_matches"
      }),
      reactivation_conditions: reactivationConditions,
      rehabilitation_record: rehabilitationRecord({
        status: "blocked_until_boundary_reopened",
        reviewPath,
        reactivationConditions,
        requiredEvidence: [
          "blocked_operations_removed",
          "hard_gate_passes",
          "human_owner_explicitly_reopens_boundary"
        ]
      }),
      ...loserMemoryEvidence({ candidate, loserClass, observedAt }),
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
    const loserClass = "promising";
    const reactivationConditions = [
      "route_pressure_matches_strategy",
      "winner_regresses_on_holdout",
      "l4_requests_comparison"
    ];
    const reviewPath = "l4_context_when_route_pressure_matches";
    return {
      loser_class: loserClass,
      failure_type: failureType,
      candidate_pool_effect: "contextual_alternative",
      selection_hint: "keep_for_l4_context_and_future_matching",
      ...loserPoolControl({
        action: "retain_as_contextual_alternative",
        reviewPath,
        trigger: "new_evidence_or_l4_requests_comparison"
      }),
      reactivation_conditions: reactivationConditions,
      rehabilitation_record: rehabilitationRecord({
        status: "eligible_for_contextual_reentry",
        reviewPath,
        reactivationConditions,
        requiredEvidence: [
          "route_pressure_matches_strategy",
          "winner_regresses_on_holdout",
          "l4_requests_comparison"
        ]
      }),
      ...loserMemoryEvidence({ candidate, loserClass, observedAt }),
      contrast,
      rationale: closeEnough
        ? "Safe loser with a close score; keep as comparison context."
        : "Safe loser has a useful specialty even though it did not win this route."
    };
  }

  const loserClass = "weak";
  const reactivationConditions = [
    "new_source_evidence",
    "better_verification_trace",
    "changed_route_pressure"
  ];
  const reviewPath = "agent_evidence_check_before_reentry";
  return {
    loser_class: loserClass,
    failure_type: failureType,
    candidate_pool_effect: "evidence_required_before_reentry",
    selection_hint: "request_evidence_before_reentry",
    ...loserPoolControl({
      action: "hold_until_new_evidence",
      reviewPath,
      trigger: "similar_candidate_reappears_without_new_trace"
    }),
    reactivation_conditions: reactivationConditions,
    rehabilitation_record: rehabilitationRecord({
      status: "pending_new_evidence",
      reviewPath,
      reactivationConditions,
      requiredEvidence: [
        "new_source_evidence",
        "better_verification_trace",
        "changed_route_pressure"
      ]
    }),
    ...loserMemoryEvidence({ candidate, loserClass, observedAt }),
    contrast,
    rationale: "Safe loser, but materially weaker than the winner on this source."
  };
}

function chooseWinner(scoredVariants) {
  const eligible = scoredVariants.filter((variant) => variant.constraints.hard_gate_passed);
  const pool = eligible.length > 0 ? eligible : scoredVariants;
  const comparison = synthesisComparison(pool);

  for (const variant of sortWinnerPool(pool)) {
    if (
      variant.control_footprint.role === "synthesis_candidate"
      && comparison.revision_variant_id
      && !comparison.synthesis_can_beat_revision
    ) {
      continue;
    }
    return variant;
  }

  return sortWinnerPool(pool)[0];
}

function riskLevel(score) {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  if (score > 0) return "low";
  return "none";
}

function buildScopeDriftRisk(variants, winner) {
  const incumbent = variants.find((variant) => variant.control_footprint.role === "incumbent_unchanged");
  const safeChanged = variants.filter((variant) => (
    variant.constraints.hard_gate_passed
    && variant.control_footprint.role !== "incumbent_unchanged"
    && variant.control_footprint.role !== "negative_probe"
  ));
  const affectedSetpoints = uniqueStrings(safeChanged.flatMap((variant) => variant.control_footprint.affected_setpoints));
  const affectedActuators = uniqueStrings(safeChanged.flatMap((variant) => variant.control_footprint.affected_actuators));
  const diffHashes = uniqueStrings(safeChanged.map((variant) => variant.control_footprint.change_diff_hash));
  const metricGain = incumbent
    ? round(Math.max(0, winner.scores.composite - incumbent.scores.composite))
    : 0;
  const complexityGrowth = incumbent
    ? round(Math.max(0, winner.control_footprint.restraint_score - incumbent.control_footprint.restraint_score))
    : 0;
  const lowGainComplexityPressure = metricGain < 0.01 && complexityGrowth > 0 ? 1 : 0;
  const score = round(clamp01(
    Math.min(1, affectedSetpoints.length / 4) * 0.18
      + Math.min(1, affectedActuators.length / 6) * 0.18
      + Math.min(1, diffHashes.length / 6) * 0.14
      + Math.min(1, complexityGrowth / 8) * 0.15
      + lowGainComplexityPressure * 0.35
  ));
  const reasons = [];
  if (affectedSetpoints.length > 1) reasons.push("multiple_setpoints_in_window");
  if (affectedActuators.length > 3) reasons.push("broad_actuator_surface");
  if (diffHashes.length > 3) reasons.push("many_distinct_diffs");
  if (complexityGrowth > 3) reasons.push("complexity_growth_over_baseline");
  if (lowGainComplexityPressure) reasons.push("complexity_growth_without_metric_gain");
  if (reasons.length === 0) reasons.push("deterministic_counts_within_restraint_band");

  return {
    mode: "deterministic_reducer",
    llm_api_calls: 0,
    window_size: safeChanged.length,
    level: riskLevel(score),
    score,
    affected_setpoints_unique_count: affectedSetpoints.length,
    affected_actuators_unique_count: affectedActuators.length,
    diff_hash_unique_count: diffHashes.length,
    metric_gain_over_initial_baseline: metricGain,
    complexity_growth_over_initial_baseline: complexityGrowth,
    reasons
  };
}

function hasSafetyCriticalRegression(variant, incumbent) {
  return ["safety", "holdout", "regression"].some((key) => (
    (variant.scores?.[key] ?? 0) < (incumbent.scores?.[key] ?? 0)
  ));
}

function hasMetricOnlyGain(variant, incumbent) {
  const compositeGain = (variant.scores?.composite ?? 0) > (incumbent.scores?.composite ?? 0);
  const safetyCriticalFlat = ["safety", "holdout", "regression"].every((key) => (
    (variant.scores?.[key] ?? 0) === (incumbent.scores?.[key] ?? 0)
  ));
  const splitFlat = ["train", "validation"].every((key) => (
    (variant.scores?.[key] ?? 0) === (incumbent.scores?.[key] ?? 0)
  ));
  const evidenceNotStronger = (variant.scores?.evidence_fit ?? 0) <= (incumbent.scores?.evidence_fit ?? 0);

  return compositeGain && safetyCriticalFlat && splitFlat && evidenceNotStronger;
}

function buildMetricGamingRisk(variants, winner) {
  const incumbent = variants.find((variant) => variant.control_footprint.role === "incumbent_unchanged");
  const safeChanged = variants.filter((variant) => (
    variant.constraints.hard_gate_passed
    && variant.control_footprint.role !== "incumbent_unchanged"
    && variant.control_footprint.role !== "negative_probe"
  ));
  const defaultRisk = {
    mode: "deterministic_reducer",
    metric_id: METRIC_GAMING_RISK_ID,
    llm_api_calls: 0,
    decision_authority: "none",
    changes_winner: false,
    window_size: safeChanged.length,
    level: "none",
    score: 0,
    composite_gain_over_incumbent: 0,
    metric_only_gain_count: 0,
    safety_critical_regression_count: 0,
    hard_gate_rejected_high_score_count: 0,
    low_evidence_winner: false,
    reasons: ["no_incumbent_for_metric_gaming_comparison"]
  };

  if (!incumbent) return defaultRisk;

  const compositeGain = round(Math.max(0, winner.scores.composite - incumbent.scores.composite));
  const metricOnlyGainCount = safeChanged.filter((variant) => hasMetricOnlyGain(variant, incumbent)).length;
  const safetyCriticalRegressionCount = safeChanged.filter((variant) => (
    (variant.scores.composite > incumbent.scores.composite)
    && hasSafetyCriticalRegression(variant, incumbent)
  )).length;
  const hardGateRejectedHighScoreCount = variants.filter((variant) => (
    !variant.constraints.hard_gate_passed
    && variant.scores.composite > incumbent.scores.composite
  )).length;
  const lowEvidenceWinner = winner.control_footprint.role !== "incumbent_unchanged"
    && winner.scores.evidence_fit < 0.75;
  const winnerMetricOnlyGain = winner.control_footprint.role !== "incumbent_unchanged"
    && hasMetricOnlyGain(winner, incumbent);
  const score = round(clamp01(
    (winnerMetricOnlyGain ? 0.1 : 0)
      + Math.min(0.2, metricOnlyGainCount * 0.04)
      + Math.min(0.25, hardGateRejectedHighScoreCount * 0.08)
      + Math.min(0.35, safetyCriticalRegressionCount * 0.18)
      + (lowEvidenceWinner ? 0.12 : 0)
  ));
  const reasons = [];

  if (winnerMetricOnlyGain) reasons.push("winner_gain_is_proxy_metric_only");
  if (metricOnlyGainCount > 0) reasons.push("metric_only_gain_candidates_need_heldout_review");
  if (safetyCriticalRegressionCount > 0) reasons.push("composite_gain_hides_safety_critical_regression");
  if (hardGateRejectedHighScoreCount > 0) reasons.push("high_scoring_variant_failed_hard_gate");
  if (lowEvidenceWinner) reasons.push("winner_evidence_fit_below_review_band");
  if (reasons.length === 0) reasons.push("no_metric_gaming_pressure_detected");

  return {
    mode: "deterministic_reducer",
    metric_id: METRIC_GAMING_RISK_ID,
    llm_api_calls: 0,
    decision_authority: "none",
    changes_winner: false,
    window_size: safeChanged.length,
    level: riskLevel(score),
    score,
    composite_gain_over_incumbent: compositeGain,
    metric_only_gain_count: metricOnlyGainCount,
    safety_critical_regression_count: safetyCriticalRegressionCount,
    hard_gate_rejected_high_score_count: hardGateRejectedHighScoreCount,
    low_evidence_winner: lowEvidenceWinner,
    reasons
  };
}

function convergenceStatus({ incumbentRetained, consecutiveNoChangeCount, scopeDriftRisk }) {
  if (scopeDriftRisk.level === "high") return "scope_drift_suspected";
  if (consecutiveNoChangeCount >= CONVERGENCE_K) return "incumbent_retained_x2";
  if (incumbentRetained) return "incumbent_retained_x1";
  return "running";
}

function buildTournamentRestraint({ variants, winner }) {
  const incumbent = variants.find((variant) => variant.control_footprint.role === "incumbent_unchanged");
  const revision = variants.find((variant) => variant.control_footprint.role === "revision_candidate");
  const synthesis = variants.find((variant) => variant.control_footprint.role === "synthesis_candidate");
  const negativeProbe = variants.find((variant) => variant.control_footprint.role === "negative_probe");
  const incumbentRetained = winner.control_footprint.role === "incumbent_unchanged";
  const consecutiveNoChangeCount = incumbentRetained ? 1 : 0;
  const scopeDriftRisk = buildScopeDriftRisk(variants, winner);
  const metricGamingRisk = buildMetricGamingRisk(variants, winner);
  const status = convergenceStatus({
    incumbentRetained,
    consecutiveNoChangeCount,
    scopeDriftRisk
  });

  return {
    mode: "tournament_restraint_layer.v1",
    a_b_ab_shape: {
      incumbent_variant_id: incumbent?.variant_id ?? null,
      revision_variant_id: revision?.variant_id ?? null,
      synthesis_variant_id: synthesis?.variant_id ?? null,
      negative_probe_variant_id: negativeProbe?.variant_id ?? null
    },
    incumbent_retained: incumbentRetained,
    convergence_k: CONVERGENCE_K,
    consecutive_no_change_count: consecutiveNoChangeCount,
    convergence_status: status,
    scope_drift_risk: scopeDriftRisk,
    metric_gaming_risk: metricGamingRisk,
    restraint_comparison: synthesisComparison(variants),
    critique_summary: {
      mode: "critique_summary.v1",
      role: "advisory_notes_only",
      decision_authority: "none",
      fresh_context_required: true,
      ranking_authority: false,
      llm_api_calls: 0,
      notes: [
        "No Borda ranking is used for winner selection.",
        "Optional critique can explain deterministic scores but cannot change the winner."
      ]
    }
  };
}

export function buildTournament(candidate, { now = new Date() } = {}) {
  const observedAt = now.toISOString();
  const evalCases = buildEvalCases(candidate);
  const rawVariants = buildVariants(candidate).slice(0, MAX_VARIANTS_PER_CANDIDATE);
  const scored = rawVariants.map((variant) => ({
    ...variant,
    ...scoreVariant(candidate, variant, evalCases)
  })).map((variant) => ({
    ...variant,
    control_footprint: buildControlFootprint(candidate, variant)
  }));
  const winner = chooseWinner(scored);
  const variants = annotatePareto(scored, winner.variant_id);
  const winnerVariant = variants.find((variant) => variant.variant_id === winner.variant_id) ?? winner;
  const restraint = buildTournamentRestraint({ variants, winner: winnerVariant });
  const loserRecords = variants
    .filter((variant) => variant.variant_id !== winner.variant_id)
    .map((variant) => {
      const loserIntelligence = classifyLoserAgainstWinner(winnerVariant, variant, {
        candidate,
        observedAt
      });
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
    restraint,
    safety: commonSafety()
  };
}
