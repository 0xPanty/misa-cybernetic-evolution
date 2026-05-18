import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateEvolutionTournamentGate,
  reviewEvolutionTournamentGate
} from "../scripts/lib/evolution-tournament-gate.mjs";
import { EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT } from "../scripts/lib/evolution-tournament-contract.mjs";

test("v0.17 tournament gate optimizes candidates without production authority", async () => {
  const result = await reviewEvolutionTournamentGate();
  const winnerIds = new Set(result.winner_queue.map((winner) => winner.variant_id));

  assert.equal(result.mode, "evolution-tournament-gate");
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.top_level_keys);
  assert.deepEqual(Object.keys(result.source), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.source_keys);
  assert.deepEqual(Object.keys(result.tournament_policy), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.tournament_policy_keys);
  assert.deepEqual(Object.keys(result.summary), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.summary_keys);
  assert.deepEqual(Object.keys(result.control_boundary), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.control_boundary_keys);
  assert.deepEqual(Object.keys(result.safety), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.safety_keys);
  assert.deepEqual(Object.keys(result.safety.live_effects), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.live_effect_keys);
  assert.deepEqual(Object.keys(result.quality_assessment.dimensions), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.quality_dimension_keys);
  assert.deepEqual(Object.keys(result.judge_escalation.dimensions), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.judge_escalation_dimension_keys);
  assert.equal(result.tournament_policy.route_owner, "qianxuesen");
  assert.equal(result.tournament_policy.candidate_generation, "multi_variant_local");
  assert.equal(result.tournament_policy.winner_surface, "draft_recommendation_only");
  assert.equal(result.tournament_policy.loser_policy, "advisory_pressure_only_no_hard_filter");
  assert.equal(result.control_boundary.optimizer_role, "candidate_layer_only");
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);
  assert.equal(result.control_boundary.automatic_promotion_allowed, false);
  assert.equal(result.summary.tournament_count, result.source.report_queue_count);
  assert.ok(result.summary.variant_count >= result.summary.tournament_count * 3);
  assert.equal(result.summary.winner_count, result.summary.tournament_count);
  assert.ok(result.summary.rejected_variant_count >= result.summary.tournament_count);
  assert.equal(result.summary.experience_ledger_count, result.experience_ledger.length);
  assert.equal(result.loser_review_context.mode, "loser-review-context");
  assert.equal(result.loser_review_context.safety.hard_filter_allowed, false);
  assert.equal(result.loser_review_context.safety.changes_winner, false);
  assert.equal(result.loser_review_context.safety.changes_route, false);
  assert.equal(result.loser_review_context.safety.writes_memory, false);
  assert.equal(result.loser_review_context.safety.embedding_created, false);
  assert.equal(result.loser_review_context.safety.llm_api_calls, 0);
  assert.equal(result.loser_review_context.deployment_readiness.status, "release_candidate_shadow_advisory");
  assert.equal(result.loser_review_context.deployment_readiness.runtime_profile, "shadow_advisory");
  assert.equal(result.loser_review_context.deployment_readiness.safe_to_consume, true);
  assert.deepEqual(result.loser_review_context.deployment_readiness.release_blockers, []);
  assert.equal(result.loser_review_context.deployment_readiness.operational_limits.active_recall_top_k <= 12, true);
  assert.equal(result.loser_review_context.deployment_readiness.operational_limits.active_counterexample_pack <= 5, true);
  assert.equal(result.loser_review_context.deployment_readiness.operational_limits.llm_api_call_budget, 0);
  assert.equal(result.loser_review_context.deployment_readiness.operational_limits.zilliz_write_budget, 0);
  assert.ok(result.loser_review_context.deployment_readiness.blocked_surfaces.includes("candidate_hard_filter"));
  assert.ok(result.loser_review_context.deployment_readiness.blocked_surfaces.includes("zilliz_write"));
  assert.ok(result.loser_review_context.deployment_readiness.kill_switch.env.includes("MISA_LOSER_REVIEW_CONTEXT=0"));
  assert.equal(result.loser_review_context.deployment_readiness.rollback.data_migration_required, false);
  assert.deepEqual(result.loser_review_context.capabilities_landed, [
    "winner_loser_vector_prototype_recall",
    "route_specific_loser_index",
    "top_k_diversified_counterexample_packing",
    "winner_loser_rehabilitation_joint_recall",
    "loser_reservoir_prototype_compression",
    "weak_model_perturbation_harness_zero_call",
    "strong_model_high_dispute_sampling_plan_zero_call",
    "l3_l4_consumption_plan"
  ]);
  assert.equal(result.loser_review_context.summary.tournament_count, result.summary.tournament_count);
  assert.equal(result.loser_review_context.summary.prototype_count > result.summary.tournament_count, true);
  assert.equal(result.loser_review_context.route_specific_loser_index.length > 0, true);
  assert.equal(result.loser_review_context.prototype_reservoir.length > 0, true);
  assert.equal(result.loser_review_context.tournaments.every((review) => (
    review.recall.backend === "local-token-prototype-recall-v1"
      && review.recall.embedding_created === false
      && review.recall.zilliz_written === false
      && review.diversified_counterexample_pack.items.length > 0
      && review.weak_model_perturbation.model_api_calls === 0
      && review.strong_model_sampling.llm_api_calls === 0
      && review.l3_l4_consumption.l3_gate.may_change_winner === false
      && review.l3_l4_consumption.l3_gate.may_filter_candidate === false
      && review.l3_l4_consumption.l4_context.final_judgment_retained_by_l4 === true
      && review.l3_l4_consumption.l4_context.may_change_route === false
      && review.l3_l4_consumption.l4_context.may_write_memory === false
  )), true);
  assert.ok(result.experience_ledger.length >= result.summary.rejected_variant_count);
  assert.ok(result.experience_ledger.some((item) => item.retained_as === "damping_or_case_evidence"));
  assert.ok(result.experience_ledger.some((item) => item.retained_as === "non_winning_experience"));
  assert.equal(result.experience_ledger.every((item) => item.production_authority === false && item.publication_allowed === false), true);
  assert.ok(result.experience_ledger.some((item) => item.loser_class === "unsafe"));
  assert.ok(result.experience_ledger.some((item) => item.loser_class === "promising" || item.loser_class === "weak"));
  assert.equal(result.experience_ledger.filter((item) => item.source === "tournament_variant").every((item) => (
    item.candidate_pool_effect
      && item.failure_type
      && item.selection_hint
      && item.candidate_pool_authority === "advisory_pressure_only"
      && item.hard_filter_allowed === false
      && item.agent_review_required === true
      && item.candidate_pool_action
      && item.review_path
      && item.review_trigger
      && item.reactivation_conditions.length > 0
      && item.rehabilitation_record?.authority === "advisory_reentry_only"
      && item.rehabilitation_record?.record_required_before_pressure_change === true
      && item.observed_at
      && item.last_triggered_at
      && Number.isInteger(item.source_count)
      && typeof item.decay_weight === "number"
      && typeof item.confidence === "number"
      && item.contrast?.winner_variant_id
  )), true);
  assert.equal(result.safety.production_authority, false);
  assert.equal(result.safety.publication_allowed, false);
  assert.equal(result.safety.automatic_write_allowed, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  assert.equal(result.judge_escalation.mode, "judge_escalation_gate.v1");
  assert.equal(result.judge_escalation.recommended, false);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.equal(result.judge_escalation.llm_api_calls, 0);
  assert.equal(result.judge_escalation.reasons.includes("null"), false);
  assert.equal(result.judge_escalation.llm_review_value.level, "none");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "do_not_call");
  assert.equal(result.judge_escalation.llm_review_value.should_change_winner, false);
  assert.equal(result.judge.mode, "advise");
  assert.equal(result.judge.status, "advice_only");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.equal(result.quality_assessment.llm_api_calls, 0);
  assert.equal(result.quality_comparison.status, "baseline_only");
  assert.ok(result.algorithm_adaptation.borrowed.includes("multi-variant candidate search"));
  assert.ok(result.algorithm_adaptation.rejected.includes("automatic memory writes"));
  assert.ok(result.rejected_variant_ledger.some((item) => (
    item.blocked_requests.includes("skill_publication")
  )));

  for (const tournament of result.tournaments) {
    assert.ok(winnerIds.has(tournament.winner.variant_id));
    assert.equal(tournament.winner.publication_allowed, false);
    assert.equal(tournament.winner.production_authority, false);
    assert.equal(tournament.variants.some((variant) => variant.tournament_status === "rejected"), true);
    assert.deepEqual(Object.keys(tournament.winner), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.winner_keys);

    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    assert.ok(winner);
    assert.equal(winner.constraints.hard_gate_passed, true);
    assert.equal(winner.route_target, tournament.route_target);
    assert.deepEqual(Object.keys(winner.scores), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.variant_score_keys);
    assert.equal(typeof winner.scores.strategy_fit, "number");
    assert.equal(Object.values(winner.safety.live_effects).some(Boolean), false);

    const unsafeLosers = tournament.loser_ledger.filter((loser) => loser.loser_class === "unsafe");
    const nonUnsafeLosers = tournament.loser_ledger.filter((loser) => loser.loser_class !== "unsafe");
    assert.ok(unsafeLosers.length >= 1);
    assert.equal(unsafeLosers.every((loser) => (
      loser.candidate_pool_effect === "strong_suppression"
        && loser.failure_type === "safety_boundary"
        && loser.candidate_pool_authority === "advisory_pressure_only"
        && loser.candidate_pool_action === "retain_with_strong_pressure"
        && loser.hard_filter_allowed === false
        && loser.agent_review_required === true
        && loser.l4_review_required === true
        && loser.reactivation_conditions.includes("blocked_operations_removed")
        && loser.rehabilitation_record.status === "blocked_until_boundary_reopened"
        && loser.rehabilitation_record.authority === "advisory_reentry_only"
        && loser.observed_at === result.created_at
        && loser.last_triggered_at === result.created_at
        && loser.source_count === 1
        && loser.decay_weight > 0
        && loser.confidence > 0
        && loser.contrast.winner_variant_id === tournament.winner.variant_id
    )), true);
    assert.equal(nonUnsafeLosers.every((loser) => (
      loser.candidate_pool_effect !== "strong_suppression"
        && loser.failure_type !== "safety_boundary"
        && loser.candidate_pool_authority === "advisory_pressure_only"
        && loser.hard_filter_allowed === false
        && loser.agent_review_required === true
        && loser.reactivation_conditions.length > 0
        && loser.rehabilitation_record.authority === "advisory_reentry_only"
        && loser.rehabilitation_record.record_required_before_pressure_change === true
        && loser.observed_at === result.created_at
        && loser.last_triggered_at === result.created_at
        && loser.source_count === 1
        && loser.contrast.winner_strategy === tournament.winner.strategy
    )), true);
  }

  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("loser review context fails closed for unsupported runtime profiles", async () => {
  const result = await reviewEvolutionTournamentGate({
    loserRuntimeProfile: "live_hard_filter"
  });

  assert.equal(result.ok, false);
  assert.equal(result.loser_review_context.ok, false);
  assert.equal(result.loser_review_context.deployment_readiness.status, "blocked");
  assert.equal(result.loser_review_context.deployment_readiness.safe_to_consume, false);
  assert.ok(result.loser_review_context.deployment_readiness.release_blockers.includes("unsupported_runtime_profile:live_hard_filter"));
  assert.ok(result.violations.includes("loser_review_context_not_release_candidate"));
  assert.equal(result.loser_review_context.safety.hard_filter_allowed, false);
  assert.equal(result.loser_review_context.safety.changes_winner, false);
  assert.equal(result.loser_review_context.safety.changes_route, false);
  assert.equal(result.loser_review_context.safety.llm_api_calls, 0);
});

test("v0.17 tournament gate can compare source-backed VPS samples without LLM calls", async () => {
  const result = await reviewEvolutionTournamentGate({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source"
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.source_kind, "vps_sanitized_conversation_artifacts");
  assert.equal(result.source.vps_raw_dir, "test/fixtures/evolution/vps-real-conversation-source");
  assert.equal(result.summary.tournament_count, 3);
  assert.equal(result.summary.experience_ledger_count, result.experience_ledger.length);
  assert.ok(result.experience_ledger.some((item) => item.source === "source_backed_preflight"));
  assert.ok(result.experience_ledger.some((item) => item.source === "tournament_variant"));
  assert.equal(result.experience_ledger.every((item) => item.production_authority === false), true);
  assert.equal(result.summary.route_counts.skill, 1);
  assert.equal(result.summary.route_counts.case, 1);
  assert.equal(result.summary.route_counts.policy, 1);
  assert.equal(result.judge_escalation.recommended, true);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.ok(result.judge_escalation.score >= result.judge_escalation.threshold);
  assert.ok(result.judge_escalation.reasons.includes("real_vps_sample"));
  assert.ok(result.judge_escalation.reasons.includes("policy_skill_pressure"));
  assert.equal(result.judge_escalation.llm_review_value.level, "high");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "call_when_auto_enabled");
  assert.equal(result.judge_escalation.llm_review_value.waste_risk, "low");
  assert.ok(result.judge_escalation.llm_review_value.targets.some((target) => target.target === "public_boundary"));
  assert.equal(result.judge_escalation.reasons.includes("null"), false);
  assert.ok(result.judge_escalation.signals.winner_strategy_diversity >= 2);
  assert.equal(result.judge.mode, "advise");
  assert.equal(result.judge.status, "advice_only");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.equal(result.quality_assessment.llm_api_calls, 0);
  assert.ok(result.quality_assessment.overall_quality_score > 0.8);
  assert.equal(result.quality_comparison.decision_authority, "deterministic_qianxuesen_gate_only");
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("v0.17 tournament gate picks route-sensitive winners for compact fixture samples", async () => {
  const result = await reviewEvolutionTournamentGate({
    sourceDir: "test/fixtures/evolution/route-sensitive-sources"
  });
  const winnerStrategies = new Set(result.winner_queue.map((winner) => winner.strategy));

  assert.equal(result.ok, true);
  assert.equal(result.source.source_kind, "local_distillation_sources");
  assert.ok(result.summary.tournament_count >= 5);
  assert.ok(winnerStrategies.has("baseline"));
  assert.ok(winnerStrategies.has("trace_reflective"));
  assert.ok(winnerStrategies.has("pareto_compact"));
  assert.equal(result.tournaments.every((tournament) => (
    tournament.variants.every((variant) => typeof variant.scores.strategy_fit === "number")
  )), true);
  assert.equal(result.judge_escalation.recommended, true);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.equal(result.judge_escalation.llm_review_value.level, "high");
  assert.ok(result.judge_escalation.llm_review_value.targets.some((target) => target.target === "batch_pattern_review"));
  assert.equal(result.judge_escalation.signals.winner_strategy_monoculture, false);
  assert.equal(result.judge_escalation.reasons.includes("null"), false);
  assert.ok(result.judge_escalation.reasons.includes("large_batch_review"));
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("near-threshold judge samples stay deterministic but are surfaced", async () => {
  const result = await reviewEvolutionTournamentGate({
    sourceDir: "test/fixtures/evolution/judge-calibration-sources",
    judgeMode: "auto"
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge_escalation.recommended, false);
  assert.equal(result.judge_escalation.near_threshold, true);
  assert.equal(result.judge_escalation.llm_review_value.level, "medium");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "deterministic_default_review_optional");
  assert.equal(result.judge_escalation.llm_review_value.waste_risk, "medium");
  assert.equal(result.judge_escalation.suggested_mode, "deterministic_default_review_optional");
  assert.ok(result.judge_escalation.score < result.judge_escalation.threshold);
  assert.ok(result.judge_escalation.threshold_delta < 0);
  assert.ok(Math.abs(result.judge_escalation.threshold_delta) <= result.judge_escalation.near_threshold_margin);
  assert.ok(result.judge_escalation.reasons.includes("near_threshold"));
  assert.equal(result.judge.mode, "auto");
  assert.equal(result.judge.status, "skipped_not_recommended");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.ok(result.judge.notes.some((note) => note.includes("near threshold")));
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("auto judge stays at zero calls when escalation gate says deterministic is enough", async () => {
  const result = await reviewEvolutionTournamentGate({
    judgeMode: "auto"
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge_escalation.recommended, false);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.equal(result.judge_escalation.llm_review_value.level, "none");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "do_not_call");
  assert.equal(result.judge.mode, "auto");
  assert.equal(result.judge.status, "skipped_not_recommended");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.equal(result.quality_comparison.status, "baseline_only");
});

test("auto judge calls the optional reviewer only when escalation gate recommends it", async () => {
  const result = await reviewEvolutionTournamentGate({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source",
    judgeMode: "auto",
    judgeModel: "mock-judge",
    llmJudge: async () => ({
      overall_quality_score: 0.89,
      dimensions: {
        route_preservation: 1,
        safety_lock: 1,
        holdout_strength: 0.88,
        failure_learning: 0.84,
        compactness: 0.74,
        source_coverage: 1
      },
      notes: ["Mock judge adds reflection only."],
      suggested_next_experiments: ["Add one mixed-route holdout sample."]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge_escalation.recommended, true);
  assert.equal(result.judge_escalation.llm_review_value.level, "high");
  assert.equal(result.judge.mode, "auto");
  assert.equal(result.judge.status, "completed");
  assert.equal(result.judge.llm_api_calls, 1);
  assert.equal(result.quality_comparison.status, "completed");
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);
});

test("optional LLM judge adds comparison data without changing the deterministic winner", async () => {
  const result = await reviewEvolutionTournamentGate({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source",
    judgeMode: "llm",
    judgeModel: "mock-judge",
    llmJudge: async () => ({
      overall_quality_score: 0.91,
      dimensions: {
        route_preservation: 1,
        safety_lock: 1,
        holdout_strength: 0.9,
        failure_learning: 0.88,
        compactness: 0.78,
        source_coverage: 1
      },
      notes: ["Mock judge sees clean route preservation and useful loser evidence."],
      suggested_next_experiments: ["Run one more local holdout with mixed skill-policy signals."]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge.mode, "llm");
  assert.equal(result.judge.status, "completed");
  assert.equal(result.judge.llm_api_calls, 1);
  assert.equal(result.judge.model, "mock-judge");
  assert.equal(result.quality_comparison.status, "completed");
  assert.equal(result.quality_comparison.llm_overall_quality_score, 0.91);
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);

  for (const tournament of result.tournaments) {
    assert.equal(tournament.winner.production_authority, false);
    assert.equal(tournament.winner.publication_allowed, false);
    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    assert.equal(winner.route_target, tournament.route_target);
  }
});
