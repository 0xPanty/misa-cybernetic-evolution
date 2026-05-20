import { reviewAdaptiveCandidateGate } from "./adaptive-candidate-gate.mjs";
import { evaluateMisaEvolution } from "./evolution-evaluator.mjs";
import { reviewEvolutionTournamentGate } from "./evolution-tournament-gate.mjs";
import { reviewGenericAgentContextDensity } from "./genericagent-density.mjs";
import { simulateMisaLearning } from "./learning-loop.mjs";
import { reviewMemoryLayerComparison } from "./memory-layer.mjs";
import { reviewRepairTickets } from "./repair-ticket.mjs";
import { validateJsonData } from "./schema-validation.mjs";
import { distillLocalMisaSources } from "./session-distiller.mjs";
import { reviewSignalCandidateRollup } from "./signal-candidate-rollup.mjs";
import { reviewSignalIntakeContract } from "./signal-intake-contract.mjs";
import { crystallizeMisaSkills } from "./skill-crystallization.mjs";
import { reviewStabilityIndicators } from "./stability-monitor.mjs";
import { buildWorkOrderRouting } from "./work-order-router.mjs";
import { PHASES, checkResult } from "./precheck-shared.mjs";

const CURRENT_LINE_VALIDATION_IDS = new Set([
  "cycle-misa-distilled-local-window-zilliz-boundary-005",
  "misa-distilled-local-window-zilliz-boundary-005"
]);

function smokeCheck(name, ok, details = {}) {
  return checkResult(name, ok, {
    phase: PHASES.smoke,
    ...details
  });
}

function validationPhase(data) {
  const id = data?.cycle_id ?? data?.event_id ?? null;
  return CURRENT_LINE_VALIDATION_IDS.has(id)
    ? PHASES.currentLine
    : PHASES.contracts;
}

function phasedValidation(args) {
  return validateJsonData({
    ...args,
    phase: validationPhase(args.data)
  });
}

export async function runSmokePrecheck({ repoRoot }) {
  const checks = [];

  const simulation = await simulateMisaLearning({ repoRoot });
  checks.push(smokeCheck("Misa learning loop simulation check", simulation.ok, {
    routeCounts: simulation.routeCounts,
    warnings: simulation.warnings,
    violations: simulation.violations
  }));

  for (const trace of simulation.traces) {
    checks.push(await phasedValidation({
      repoRoot,
      schemaRel: "schemas/learning_cycle_trace.schema.json",
      data: trace,
      name: `validate generated trace ${trace.cycle_id}`
    }));
  }

  const distillation = await distillLocalMisaSources({ repoRoot });
  checks.push(smokeCheck("Misa local session distillation check", distillation.ok, {
    sources: distillation.summary.source_count,
    learningEvents: distillation.summary.learning_event_count,
    zillizProxyUsed: distillation.summary.zilliz_proxy_used,
    localVectorIndexUsed: distillation.summary.local_vector_index_used,
    segmentCount: distillation.summary.segment_count,
    llmApiCalls: distillation.summary.llm_api_calls,
    externalApiCalls: distillation.summary.external_api_calls,
    violations: distillation.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/session_distillation_review.schema.json",
    data: distillation,
    name: "validate local session distillation review"
  }));

  for (const event of distillation.learning_events) {
    checks.push(await phasedValidation({
      repoRoot,
      schemaRel: "schemas/misa_learning_fixture.schema.json",
      data: event,
      name: `validate distilled learning event ${event.event_id}`
    }));
  }

  const crystallization = await crystallizeMisaSkills({ repoRoot });
  checks.push(smokeCheck("Misa skill crystallization check", crystallization.ok, {
    skillCandidates: crystallization.index.skill_candidates,
    warnings: crystallization.warnings,
    violations: crystallization.violations
  }));

  for (const candidate of crystallization.candidates) {
    checks.push(await phasedValidation({
      repoRoot,
      schemaRel: "schemas/skill_crystallization_candidate.schema.json",
      data: candidate,
      name: `validate skill crystallization candidate ${candidate.candidate_id}`
    }));
  }

  const densityReview = await reviewGenericAgentContextDensity({ repoRoot });
  checks.push(smokeCheck("GenericAgent context-density review check", densityReview.ok, {
    overallScore: densityReview.summary.overall_score,
    adoptedCount: densityReview.summary.adopted_count,
    rejectedCount: densityReview.summary.rejected_count,
    violations: densityReview.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/genericagent_context_density.schema.json",
    data: densityReview,
    name: "validate GenericAgent context-density review"
  }));

  const adaptiveGate = await reviewAdaptiveCandidateGate({ repoRoot });
  checks.push(smokeCheck("Misa adaptive candidate gate check", adaptiveGate.ok, {
    generatedCandidates: adaptiveGate.summary.generated_candidate_count,
    validationReady: adaptiveGate.summary.validation_ready_count,
    held: adaptiveGate.summary.held_count,
    rejected: adaptiveGate.summary.rejected_count,
    violations: adaptiveGate.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/adaptive_candidate_gate.schema.json",
    data: adaptiveGate,
    name: "validate adaptive candidate gate review"
  }));

  const signalIntake = reviewSignalIntakeContract();
  checks.push(smokeCheck("Misa signal intake cadence check", signalIntake.ok, {
    signalScanMinutes: signalIntake.cadence.signal_scan_interval_minutes,
    learningRollupHours: signalIntake.cadence.learning_rollup_interval_hours,
    farcasterDefense: signalIntake.cadence.farcaster_defense_mode,
    violations: signalIntake.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/signal_intake_contract.schema.json",
    data: signalIntake,
    name: "validate signal intake contract review"
  }));

  const signalRollup = await reviewSignalCandidateRollup({ repoRoot });
  checks.push(smokeCheck("Misa signal candidate rollup check", signalRollup.ok, {
    adaptedSignals: signalRollup.summary.adapted_signal_count,
    queueItems: signalRollup.summary.queue_item_count,
    dailyRollupHours: signalRollup.summary.daily_rollup_window_hours,
    validationReady: signalRollup.summary.validation_ready_count,
    violations: signalRollup.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/signal_candidate_rollup.schema.json",
    data: signalRollup,
    name: "validate signal candidate rollup review"
  }));

  const evolutionEvaluator = await evaluateMisaEvolution({ repoRoot });
  checks.push(smokeCheck("Misa evolution evaluator simulation check", evolutionEvaluator.ok, {
    mode: evolutionEvaluator.mode,
    optimizationCandidates: evolutionEvaluator.summary.optimization_candidate_count,
    preflightPassed: evolutionEvaluator.summary.preflight_passed_count,
    hygieneReportable: evolutionEvaluator.summary.hygiene_reportable_count,
    reportQueue: evolutionEvaluator.summary.report_queue_count,
    held: evolutionEvaluator.summary.held_count,
    suppressed: evolutionEvaluator.summary.suppressed_count,
    realChatPreflightStatus: evolutionEvaluator.summary.real_chat_preflight_status,
    violations: evolutionEvaluator.violations
  }));

  const evolutionTournament = await reviewEvolutionTournamentGate({
    repoRoot,
    now: new Date("2026-05-13T00:00:00Z")
  });
  checks.push(smokeCheck("Misa evolution tournament gate check", evolutionTournament.ok, {
    mode: evolutionTournament.mode,
    tournaments: evolutionTournament.summary.tournament_count,
    variants: evolutionTournament.summary.variant_count,
    winners: evolutionTournament.summary.winner_count,
    rejectedVariants: evolutionTournament.summary.rejected_variant_count,
    productionAuthority: evolutionTournament.summary.production_authority,
    violations: evolutionTournament.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/evolution_tournament_gate.schema.json",
    data: evolutionTournament,
    name: "validate evolution tournament gate review"
  }));

  const stability = reviewStabilityIndicators({
    now: new Date("2026-05-21T00:00:00Z")
  });
  checks.push(smokeCheck("Misa stability monitor check", stability.ok, {
    mode: stability.mode,
    safeMode: stability.safe_mode.state,
    indicators: stability.summary.indicator_count,
    incidents: stability.summary.safe_mode_incident_count,
    productionAuthority: stability.safety.production_authority,
    liveRouteTableMutated: stability.safety.live_route_table_mutated,
    llmApiCalls: stability.safety.llm_api_calls,
    violations: stability.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/stability-indicator.schema.json",
    data: stability,
    name: "validate stability monitor review"
  }));

  const memoryLayer = await reviewMemoryLayerComparison({ repoRoot });
  checks.push(smokeCheck("Misa memory layer comparison check", memoryLayer.ok, {
    rawTokens: memoryLayer.layers.l0_sources.raw_token_estimate,
    distillateTokens: memoryLayer.layers.l1_distillates.distillate_token_estimate,
    compressionRatio: memoryLayer.layers.l1_distillates.compression_ratio,
    originalL3: memoryLayer.original_auto_l3.skill_count,
    originalBadPromotions: memoryLayer.original_auto_l3.non_skill_promoted_count,
    minimalL3: memoryLayer.minimal_positive_l3.skill_count,
    minimalBadPromotions: memoryLayer.minimal_positive_l3.non_skill_promoted_count,
    verdict: memoryLayer.comparison.verdict,
    violations: memoryLayer.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/memory_layer.schema.json",
    data: memoryLayer,
    name: "validate memory layer comparison review"
  }));

  const repairTickets = await reviewRepairTickets({ repoRoot, memoryLayerReview: memoryLayer });
  checks.push(smokeCheck("Misa repair ticket queue check", repairTickets.ok, {
    ticketCount: repairTickets.summary.ticket_count,
    highestSeverity: repairTickets.summary.highest_severity,
    badPromotions: repairTickets.summary.bad_promotion_count,
    minimalBadPromotions: repairTickets.summary.minimal_non_skill_promoted_count,
    violations: repairTickets.violations
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/repair_ticket.schema.json",
    data: repairTickets,
    name: "validate repair ticket review"
  }));

  const workOrderRouting = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(smokeCheck("Misa work-order routing check", workOrderRouting.ok, {
    workOrderCount: workOrderRouting.summary.work_order_count,
    requiresUserConfirmation: workOrderRouting.summary.requires_user_confirmation_count,
    ownerReportRequired: workOrderRouting.summary.owner_report_required_count,
    autoExecutable: workOrderRouting.summary.auto_executable_count,
    escalationAvailable: workOrderRouting.summary.escalation_available_count,
    autoExecuteAllowed: workOrderRouting.safety.auto_execute_allowed,
    routingMode: workOrderRouting.routing_policy.mode
  }));
  checks.push(await phasedValidation({
    repoRoot,
    schemaRel: "schemas/work_order_routing.schema.json",
    data: workOrderRouting,
    name: "validate work-order routing review"
  }));

  return {
    checks,
    artifacts: {
      memoryLayer,
      repairTickets,
      workOrderRouting
    }
  };
}
