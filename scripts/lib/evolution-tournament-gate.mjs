import path from "node:path";
import { evaluateMisaEvolution } from "./evolution-evaluator.mjs";
import {
  buildJudgeEscalationGate,
  buildQualityComparison,
  runOptionalJudge
} from "./evolution-tournament-judge.mjs";
import { buildTournamentExperienceLedger } from "./evolution-tournament-ledger.mjs";
import { buildLoserReviewContext } from "./evolution-tournament-loser-context.mjs";
import { buildQualityAssessment } from "./evolution-tournament-quality.mjs";
import { buildTournament } from "./evolution-tournament-scoring.mjs";
import { loadSkillEvolutionTournamentBridge } from "./skill-evolution-tournament-bridge.mjs";
import {
  commonSafety,
  countBy,
  noLiveEffects,
  round,
  safeId,
  uniqueStrings
} from "./evolution-tournament-utils.mjs";
import { evaluateEvolutionTournamentGate } from "./evolution-tournament-validation.mjs";
import { summarizeHistoricalPostDeployResults } from "./post-deploy-measurement.mjs";
import {
  distillLocalMisaSources,
  loadLocalDistillationSources
} from "./session-distiller.mjs";
import { simulateLearningCycle } from "./learning-loop.mjs";
import { loadVpsConversationSources } from "./vps-conversation-sources.mjs";
import {
  CONVERGENCE_K,
  DEFAULT_RESTRAINT_SETPOINTS,
  MAX_VARIANTS_PER_CANDIDATE,
  NOUS_SELF_EVOLUTION_COMMIT
} from "./evolution-tournament-contract.mjs";

export { evaluateEvolutionTournamentGate } from "./evolution-tournament-validation.mjs";

function candidateById(evolution) {
  return new Map(evolution.optimization_candidates.map((candidate) => [candidate.candidate_id, candidate]));
}

function reportableCandidates(evolution) {
  const byId = candidateById(evolution);
  return evolution.report_queue
    .map((report) => byId.get(report.candidate_id))
    .filter(Boolean);
}

function routeValue(route) {
  return {
    skill: 0.9,
    memory: 0.84,
    case: 0.82,
    policy: 0.8,
    damping: 0.58,
    ignore: 0
  }[route] ?? 0.2;
}

function riskPenalty(riskLevel) {
  return {
    low: 0,
    medium: 0.04,
    high: 0.08,
    critical: 0.16
  }[riskLevel] ?? 0.06;
}

async function loadSourceBackedDistillation({ repoRoot, sourceDir, vpsRawDir }) {
  const sources = vpsRawDir
    ? await loadVpsConversationSources({
        rawDir: path.isAbsolute(vpsRawDir) ? vpsRawDir : path.join(repoRoot, vpsRawDir)
      })
    : await loadLocalDistillationSources({
        repoRoot,
        sourceDir: sourceDir ?? path.join("examples", "misa-distillation")
      });

  const distillation = await distillLocalMisaSources({
    repoRoot,
    sources,
    requireTemplateCoverage: !sourceDir && !vpsRawDir
  });

  return { sources, distillation };
}

function scoreTraceCandidate(trace) {
  const evidenceScore = Math.min(trace.observe.evidence_count ?? 0, 4) / 4;
  const routeScore = routeValue(trace.route.target);
  const safetyScore = noLiveEffects(trace.result.live_effects) && trace.candidate_review.publication_allowed === false ? 1 : 0;
  const stateScore = trace.candidate_review.state === "staged" ? 1 : 0.65;
  return round(
    evidenceScore * 0.32
      + routeScore * 0.28
      + safetyScore * 0.26
      + stateScore * 0.14
      - riskPenalty(trace.observe.risk_level)
  );
}

function candidateFromTrace(trace) {
  const passed = trace.verification.passed
    && trace.result.positive_value
    && noLiveEffects(trace.result.live_effects)
    && trace.route.target !== "ignore";
  const commands = uniqueStrings([
    ...trace.verification.commands,
    "npm run memory-layer:misa",
    "npm run repair-ticket:misa",
    "npm run evolution:tournament:misa",
    "npm run validate:schemas",
    "npm run precheck",
    "npm test"
  ]);

  return {
    candidate_id: `source-${safeId(trace.source_event_id)}`,
    source_event_id: trace.source_event_id,
    route_target: trace.route.target,
    queue_state: passed ? "ready_for_daily_rollup" : "watch_for_more_evidence",
    proposed_optimization: {
      action: passed ? "report_to_huan_for_approval" : "do_not_report_yet",
      reason: trace.proposed_change.summary,
      requires_huan_approval: true,
      production_authority: false
    },
    local_preflight: {
      status: passed ? "preflight_passed" : "held_for_more_evidence",
      score: scoreTraceCandidate(trace),
      checks: [
        {
          id: "source_trace_replayed",
          ok: Boolean(trace.source_event_id),
          reason: "The candidate must preserve the source event id."
        },
        {
          id: "qianxuesen_route_selected",
          ok: trace.route.target !== "ignore",
          reason: "The source-backed candidate must stay on a known Qianxuesen route."
        },
        {
          id: "no_live_effects",
          ok: noLiveEffects(trace.result.live_effects),
          reason: "Source-backed tournament candidates remain local shadow recommendations only."
        }
      ],
      commands: passed ? commands : [],
      simulated_before_report: passed,
      report_to_huan: passed
    },
    candidate_hygiene: {
      reportable: passed,
      verdict: passed ? "passes_source_backed_shadow_gate" : "hold_or_reduce_scope"
    },
    evidence: {
      evidence_count: trace.observe.evidence_count,
      risk_level: trace.observe.risk_level,
      redaction_status: trace.observe.redaction_status,
      normalized_signals: trace.observe.signals
    },
    prediction: passed ? "safe_to_report_after_local_preflight" : "hold_until_more_evidence",
    label: passed ? "source_backed_ready" : "source_backed_hold",
    trajectory: [
      "source_loader",
      "local_distillation",
      "qianxuesen_route",
      `candidate:${safeId(trace.source_event_id)}`,
      passed ? "report_queue" : "internal_only"
    ],
    safety: commonSafety()
  };
}

function buildSourceBackedExperienceLedger(candidates) {
  return candidates.map((candidate) => {
    const passed = candidate.local_preflight.status === "preflight_passed";
    return {
      ledger_id: `exp-source-${safeId(candidate.source_event_id)}-${candidate.route_target}`,
      source: "source_backed_preflight",
      candidate_id: candidate.candidate_id,
      source_event_id: candidate.source_event_id,
      route_target: candidate.route_target,
      status: passed ? "shadow_reportable" : "held_for_more_evidence",
      retained_as: passed ? "source_backed_shadow_evidence" : "hold_queue_evidence",
      lesson: passed
        ? "Keep source-backed candidates reportable only after local preflight and human review; do not promote directly."
        : "Hold this source-backed candidate until new evidence or a changed verifier appears.",
      score: candidate.local_preflight.score,
      evidence_count: candidate.evidence?.evidence_count ?? 0,
      risk_level: candidate.evidence?.risk_level ?? "medium",
      production_authority: false,
      publication_allowed: false
    };
  });
}

async function evaluateSourceBackedEvolution({ repoRoot, sourceDir, vpsRawDir }) {
  const { sources, distillation } = await loadSourceBackedDistillation({ repoRoot, sourceDir, vpsRawDir });
  const traces = distillation.learning_events.map((event) => simulateLearningCycle(event));
  const candidates = traces.map(candidateFromTrace);
  const experienceLedger = buildSourceBackedExperienceLedger(candidates);
  const reportQueue = candidates
    .filter((candidate) => candidate.local_preflight.report_to_huan)
    .sort((a, b) => b.local_preflight.score - a.local_preflight.score)
    .map((candidate, index) => ({
      report_id: `report-${candidate.source_event_id}`,
      rank: index + 1,
      candidate_id: candidate.candidate_id,
      source_event_id: candidate.source_event_id,
      route_target: candidate.route_target,
      score: candidate.local_preflight.score,
      hygiene_verdict: candidate.candidate_hygiene.verdict,
      clarification_status: "resolved_by_source_trace",
      next_unresolved_question: null,
      terminology_status: "aligned",
      summary: candidate.proposed_optimization.reason,
      ask_huan: "Approve or reject this source-backed optimization before any durable change.",
      allowed_next_step: "human_review_only",
      report_policy: "source_backed_shadow_candidates",
      production_authority: false
    }));
  const violations = [...distillation.violations];

  if (sources.length === 0) {
    violations.push("Source-backed tournament found no local sources.");
  }
  if (reportQueue.length === 0) {
    violations.push("Source-backed tournament produced no reportable candidates.");
  }

  return {
    mode: "source-backed-candidate-preflight",
    ok: violations.length === 0,
    source_kind: vpsRawDir ? "vps_sanitized_conversation_artifacts" : "local_distillation_sources",
    source_dir: sourceDir ?? null,
    vps_raw_dir: vpsRawDir ?? null,
    summary: {
      source_count: sources.length,
      optimization_candidate_count: candidates.length,
      report_queue_count: reportQueue.length,
      experience_ledger_count: experienceLedger.length
    },
    optimization_candidates: candidates,
    report_queue: reportQueue,
    hold_queue: candidates.filter((candidate) => candidate.local_preflight.status !== "preflight_passed"),
    experience_ledger: experienceLedger,
    safety: commonSafety(),
    warnings: [
      "Source-backed tournament input reads local artifacts only; it does not update VPS or production services."
    ],
    violations
  };
}

function aggregateScopeDriftRisk(tournaments) {
  const risks = tournaments
    .map((tournament) => tournament.restraint?.scope_drift_risk)
    .filter(Boolean);
  const maxRisk = risks.reduce((selected, risk) => (
    !selected || risk.score > selected.score ? risk : selected
  ), null);

  return maxRisk ?? {
    mode: "deterministic_reducer",
    llm_api_calls: 0,
    window_size: 0,
    level: "none",
    score: 0,
    affected_setpoints_unique_count: 0,
    affected_actuators_unique_count: 0,
    diff_hash_unique_count: 0,
    metric_gain_over_initial_baseline: 0,
    complexity_growth_over_initial_baseline: 0,
    reasons: ["no_tournaments"]
  };
}

function aggregateConvergenceStatus({ maxNoChangeCount, scopeDriftRisk }) {
  if (scopeDriftRisk.level === "high") return "scope_drift_suspected";
  if (maxNoChangeCount >= CONVERGENCE_K) return "incumbent_retained_x2";
  if (maxNoChangeCount === 1) return "incumbent_retained_x1";
  return "running";
}

function maxNoChangeCountFromLedger(experienceLedger) {
  return Math.max(
    0,
    ...experienceLedger
      .filter((entry) => entry.source === "tournament_variant" && entry.status === "winner")
      .map((entry) => entry.consecutive_no_change_count ?? 0)
  );
}

function buildRestraintContract(tournaments, { experienceLedger = [] } = {}) {
  const maxNoChangeCount = Math.max(
    maxNoChangeCountFromLedger(experienceLedger),
    ...tournaments.map((tournament) => tournament.restraint?.consecutive_no_change_count ?? 0)
  );
  const scopeDriftRisk = aggregateScopeDriftRisk(tournaments);

  return {
    mode: "tournament_restraint_contract.v1",
    incumbent_role: "incumbent_unchanged",
    do_nothing_candidate_required: true,
    convergence_k: CONVERGENCE_K,
    metric_regression_tolerance: { ...DEFAULT_RESTRAINT_SETPOINTS.metric_regression_tolerance },
    consecutive_no_change_count: maxNoChangeCount,
    convergence_status: aggregateConvergenceStatus({
      maxNoChangeCount,
      scopeDriftRisk
    }),
    scope_drift_calculator: "deterministic_reducer",
    scope_drift_risk: scopeDriftRisk,
    tie_breaker: "incumbent_unchanged_on_exact_tie"
  };
}

function buildCritiqueSummary({ judge, judgeEscalation }) {
  return {
    mode: "critique_summary.v1",
    role: "advisory_notes_only",
    decision_authority: "none",
    fresh_context_required: true,
    ranking_authority: false,
    llm_api_calls: judge?.llm_api_calls ?? 0,
    notes: [
      "This field replaces any Borda-style naming; critique is not a ranking authority.",
      judgeEscalation?.recommended
        ? "Escalation can request optional fresh-context critique, but deterministic ranking keeps authority."
        : "Deterministic reducer found no high-value reason to call an optional critique model."
    ]
  };
}

export async function reviewEvolutionTournamentGate({
  repoRoot = process.cwd(),
  now = new Date(),
  sourceDir,
  vpsRawDir,
  judgeMode = "advise",
  judgeModel,
  judgeApiKey,
  judgeBaseUrl,
  judgeEscalationThreshold,
  loserRuntimeProfile,
  historicalPostDeployResults = [],
  llmJudge,
  includeSkillEvolutionCandidates = false,
  skillEvolutionContractFile,
  skillEvolutionEventFile
} = {}) {
  const preflight = sourceDir || vpsRawDir
    ? await evaluateSourceBackedEvolution({ repoRoot, sourceDir, vpsRawDir })
    : await evaluateMisaEvolution({ repoRoot });
  const preflightCandidates = reportableCandidates(preflight);
  const skillEvolutionBridge = await loadSkillEvolutionTournamentBridge({
    repoRoot,
    enabled: includeSkillEvolutionCandidates,
    contractFile: skillEvolutionContractFile,
    eventFile: skillEvolutionEventFile,
    now
  });
  const candidates = [
    ...preflightCandidates,
    ...skillEvolutionBridge.tournamentCandidates
  ];
  const tournaments = candidates.map((candidate) => buildTournament(candidate, { now }));
  const variantList = tournaments.flatMap((tournament) => tournament.variants);
  const rejected = variantList.filter((variant) => variant.tournament_status === "rejected");
  const winners = tournaments.map((tournament) => tournament.winner);
  const experienceLedger = buildTournamentExperienceLedger({ preflight, tournaments, now });
  const restraintContract = buildRestraintContract(tournaments, { experienceLedger });
  const postDeployHistory = summarizeHistoricalPostDeployResults(historicalPostDeployResults, { now });
  const loserReviewContext = buildLoserReviewContext({
    tournaments,
    experienceLedger,
    now,
    runtimeProfile: loserRuntimeProfile ?? "shadow_advisory"
  });
  const warnings = [
    "Tournament winners are draft recommendations only; they do not publish Skills, write memory, update prompts, evolve code, or touch VPS.",
    "The current scorer is deterministic_proxy_v1, not an LLM judge. Future GEPA-style model calls must remain optional and offline."
  ];

  const result = {
    schema_version: "misa.evolution_tournament_gate.v1",
    mode: "evolution-tournament-gate",
    ok: true,
    created_at: now.toISOString(),
    source: {
      preflight_mode: preflight.mode,
      source_kind: preflight.source_kind ?? "default_candidate_preflight",
      source_dir: preflight.source_dir ?? null,
      vps_raw_dir: preflight.vps_raw_dir ?? null,
      optimization_candidate_count: preflight.summary.optimization_candidate_count,
      report_queue_count: preflight.summary.report_queue_count,
      tournament_candidate_count: candidates.length,
      historical_post_deploy_result_count: postDeployHistory.summary.result_count
    },
    algorithm_adaptation: {
      source: "NousResearch/hermes-agent-self-evolution",
      inspected_commit: NOUS_SELF_EVOLUTION_COMMIT,
      borrowed: [
        "multi-variant candidate search",
        "train-validation-holdout split",
        "trace-aware failure reflection",
        "Pareto-style winner selection",
        "before/after metric report"
      ],
      rejected: [
        "automatic Skill writes or installation",
        "automatic memory writes",
        "LLM-owned learning route decisions",
        "automatic prompt or code evolution",
        "continuous production self-improvement loop"
      ]
    },
    tournament_policy: {
      route_owner: "qianxuesen",
      candidate_generation: "multi_variant_local",
      scorer: "deterministic_proxy_v1",
      max_variants_per_candidate: MAX_VARIANTS_PER_CANDIDATE,
      winner_surface: "draft_recommendation_only",
      loser_policy: "advisory_pressure_only_no_hard_filter",
      production_effect: "blocked"
    },
    tournament_ranking: {
      rule: "deterministic_reducer",
      scorer: "deterministic_proxy_v1",
      llm_judge_allowed: false,
      decision_authority: "deterministic_qianxuesen_gate_only",
      optional_llm_review_role: "critique_only_no_winner_authority",
      restraint_contract: restraintContract,
      critique_summary: null
    },
    skill_evolution_bridge: skillEvolutionBridge.bridge,
    summary: {
      tournament_count: tournaments.length,
      variant_count: variantList.length,
      winner_count: winners.length,
      rejected_variant_count: rejected.length,
      experience_ledger_count: experienceLedger.length,
      historical_post_deploy_result_count: postDeployHistory.summary.result_count,
      post_deploy_decision_counts: postDeployHistory.summary.decision_counts,
      route_counts: countBy(tournaments, (tournament) => tournament.route_target),
      production_authority: false
    },
    tournaments,
    winner_queue: winners,
    rejected_variant_ledger: rejected.map((variant) => ({
      variant_id: variant.variant_id,
      strategy: variant.strategy,
      violations: variant.constraints.violations,
      blocked_requests: variant.constraints.blocked_requests,
      retained_as: "damping_or_case_evidence"
    })),
    experience_ledger: experienceLedger,
    historical_post_deploy_results: postDeployHistory,
    loser_review_context: loserReviewContext,
    control_boundary: {
      optimizer_role: "candidate_layer_only",
      route_owner: "qianxuesen",
      route_implementation: "existing_preflight_and_route_table",
      llm_route_decision_allowed: false,
      automatic_promotion_allowed: false,
      promotion_surface: "none"
    },
    safety: commonSafety(),
    quality_assessment: null,
    judge_escalation: null,
    judge: null,
    quality_comparison: null,
    warnings,
    violations: []
  };

  result.quality_assessment = buildQualityAssessment({
    tournaments,
    source: result.source
  });
  result.judge_escalation = buildJudgeEscalationGate(result, {
    threshold: judgeEscalationThreshold ?? 0.65
  });
  result.judge = await runOptionalJudge(result, {
    judgeMode,
    judgeModel,
    judgeApiKey,
    judgeBaseUrl,
    judgeEscalation: result.judge_escalation,
    llmJudge
  });
  result.tournament_ranking.critique_summary = buildCritiqueSummary({
    judge: result.judge,
    judgeEscalation: result.judge_escalation
  });
  result.quality_comparison = buildQualityComparison(result.quality_assessment, result.judge);
  result.violations = evaluateEvolutionTournamentGate(result);
  result.ok = preflight.ok && result.violations.length === 0;
  return result;
}
