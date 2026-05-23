import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateEvolutionTournamentGate,
  reviewEvolutionTournamentGate
} from "../scripts/lib/evolution-tournament-gate.mjs";
import {
  DEFAULT_RESTRAINT_SETPOINTS,
  EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT,
  METRIC_GAMING_RISK_ID,
  SAFETY_CRITICAL_METRIC_IDS
} from "../scripts/lib/evolution-tournament-contract.mjs";
import { buildTournamentExperienceLedger } from "../scripts/lib/evolution-tournament-ledger.mjs";
import { buildTournament } from "../scripts/lib/evolution-tournament-scoring.mjs";
import { loadDefaultMetricRegistry } from "../scripts/lib/metric-registry.mjs";

test("v0.17 tournament gate optimizes candidates without production authority", async () => {
  const result = await reviewEvolutionTournamentGate();
  const winnerIds = new Set(result.winner_queue.map((winner) => winner.variant_id));

  assert.equal(result.mode, "evolution-tournament-gate");
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.top_level_keys);
  assert.deepEqual(Object.keys(result.source), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.source_keys);
  assert.deepEqual(Object.keys(result.tournament_policy), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.tournament_policy_keys);
  assert.deepEqual(Object.keys(result.tournament_ranking), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.tournament_ranking_keys);
  assert.deepEqual(Object.keys(result.skill_evolution_bridge), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.skill_evolution_bridge_keys);
  assert.deepEqual(Object.keys(result.skill_evolution_bridge.source), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.skill_evolution_bridge_source_keys);
  assert.deepEqual(Object.keys(result.skill_evolution_bridge.summary), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.skill_evolution_bridge_summary_keys);
  assert.deepEqual(Object.keys(result.skill_evolution_bridge.admission), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.skill_evolution_bridge_admission_keys);
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
  assert.equal(result.tournament_ranking.rule, "deterministic_reducer");
  assert.equal(result.tournament_ranking.llm_judge_allowed, false);
  assert.equal(result.tournament_ranking.decision_authority, "deterministic_qianxuesen_gate_only");
  assert.equal(result.tournament_ranking.restraint_contract.mode, "tournament_restraint_contract.v1");
  assert.equal(result.tournament_ranking.restraint_contract.do_nothing_candidate_required, true);
  assert.equal(result.tournament_ranking.restraint_contract.convergence_k, 2);
  assert.deepEqual(
    result.tournament_ranking.restraint_contract.metric_regression_tolerance,
    DEFAULT_RESTRAINT_SETPOINTS.metric_regression_tolerance
  );
  assert.ok([
    "running",
    "incumbent_retained_x1",
    "incumbent_retained_x2",
    "scope_drift_suspected",
    "awaiting_new_evidence"
  ].includes(result.tournament_ranking.restraint_contract.convergence_status));
  assert.equal(result.tournament_ranking.restraint_contract.scope_drift_calculator, "deterministic_reducer");
  assert.equal(result.tournament_ranking.restraint_contract.scope_drift_risk.mode, "deterministic_reducer");
  assert.equal(result.tournament_ranking.restraint_contract.scope_drift_risk.llm_api_calls, 0);
  assert.ok(["none", "low", "medium", "high"].includes(result.tournament_ranking.restraint_contract.scope_drift_risk.level));
  assert.equal(typeof result.tournament_ranking.restraint_contract.scope_drift_risk.score, "number");
  assert.equal(result.tournament_ranking.restraint_contract.metric_gaming_risk.mode, "deterministic_reducer");
  assert.equal(result.tournament_ranking.restraint_contract.metric_gaming_risk.metric_id, METRIC_GAMING_RISK_ID);
  assert.equal(result.tournament_ranking.restraint_contract.metric_gaming_risk.llm_api_calls, 0);
  assert.equal(result.tournament_ranking.restraint_contract.metric_gaming_risk.decision_authority, "none");
  assert.equal(result.tournament_ranking.restraint_contract.metric_gaming_risk.changes_winner, false);
  assert.ok(["none", "low", "medium", "high"].includes(result.tournament_ranking.restraint_contract.metric_gaming_risk.level));
  assert.equal(result.tournament_ranking.critique_summary.mode, "critique_summary.v1");
  assert.equal(result.tournament_ranking.critique_summary.decision_authority, "none");
  assert.equal(result.tournament_ranking.critique_summary.ranking_authority, false);
  assert.equal(result.tournament_ranking.critique_summary.fresh_context_required, true);
  assert.equal("borda_summary" in result.tournament_ranking, false);
  assert.equal(result.skill_evolution_bridge.enabled, false);
  assert.equal(result.skill_evolution_bridge.summary.admitted_candidate_count, 0);
  assert.equal(result.skill_evolution_bridge.admission.can_promote_now, false);
  assert.equal(result.skill_evolution_bridge.admission.llm_judge_allowed, false);
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
  assert.equal(result.experience_ledger.every((item) => (
    item.replay_proof.mode === "tournament_replay_proof.v1"
      && item.replay_proof.repo_commit.length > 0
      && typeof item.replay_proof.worktree_dirty === "boolean"
      && item.replay_proof.eval_command === "npm run evolution:tournament:misa -- --json"
      && item.replay_proof.replay_command === "npm run evolution:tournament:misa -- --json"
      && item.replay_proof.replay_idempotent === true
      && item.replay_proof.replay_writes_ledger === false
      && item.replay_proof.iteration_id === item.iteration_id
      && item.replay_proof.schema_ref === "schemas/evolution_tournament_gate.schema.json"
      && item.replay_proof.proof_surface === "local_dry_run_only"
      && item.replay_proof.human_approval_required === true
      && item.replay_proof.can_promote_now === false
      && item.replay_proof.advisory_only === true
  )), true);
  assert.ok(result.experience_ledger.some((item) => item.loser_class === "unsafe"));
  assert.ok(result.experience_ledger.some((item) => item.loser_class === "promising" || item.loser_class === "weak"));
  const tournamentWinnerLedger = result.experience_ledger.filter((item) => (
    item.source === "tournament_variant" && item.status === "winner"
  ));
  const tournamentLoserLedger = result.experience_ledger.filter((item) => (
    item.source === "tournament_variant" && item.status !== "winner"
  ));
  assert.equal(tournamentWinnerLedger.length, result.summary.tournament_count);
  assert.equal(tournamentWinnerLedger.every((item) => (
    (
      item.retained_as === "selected_draft_experience"
        || item.retained_as === "incumbent_unchanged_retained"
    )
      && Number.isInteger(item.consecutive_no_change_count)
      && [
        "running",
        "incumbent_retained_x1",
        "incumbent_retained_x2",
        "scope_drift_suspected",
        "awaiting_new_evidence"
      ].includes(item.convergence_status)
      && item.production_authority === false
      && item.publication_allowed === false
      && item.decision === "keep"
  )), true);
  assert.equal(tournamentLoserLedger.every((item) => (
    item.candidate_pool_effect
      && item.failure_type
      && item.selection_hint
      && item.candidate_pool_authority === "advisory_pressure_only"
      && item.hard_filter_allowed === false
      && item.agent_review_required === true
      && item.candidate_pool_action
      && item.iteration_id
      && item.change_diff_hash
      && item.plant_model_version === "misa.plant_model.v1"
      && item.metric_registry_version === "misa.metric_registry.v1"
      && item.metric_id === "evolution_tournament.deterministic_score"
      && ["keep", "revert", "skip"].includes(item.decision)
      && item.reason_ref
      && item.timestamp
      && item.last_sample_ts
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
      && item.consecutive_no_change_count === 0
      && item.convergence_status === "running"
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
    assert.equal(tournament.restraint.mode, "tournament_restraint_layer.v1");
    assert.equal(tournament.restraint.convergence_k, 2);
    assert.equal(tournament.restraint.scope_drift_risk.mode, "deterministic_reducer");
    assert.equal(tournament.restraint.scope_drift_risk.llm_api_calls, 0);
    assert.equal(tournament.restraint.metric_gaming_risk.mode, "deterministic_reducer");
    assert.equal(tournament.restraint.metric_gaming_risk.metric_id, METRIC_GAMING_RISK_ID);
    assert.equal(tournament.restraint.metric_gaming_risk.llm_api_calls, 0);
    assert.equal(tournament.restraint.metric_gaming_risk.decision_authority, "none");
    assert.equal(tournament.restraint.metric_gaming_risk.changes_winner, false);
    assert.equal(tournament.restraint.critique_summary.decision_authority, "none");
    assert.equal(tournament.restraint.critique_summary.ranking_authority, false);
    assert.ok(tournament.restraint.a_b_ab_shape.incumbent_variant_id);

    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    assert.ok(winner);
    assert.equal(winner.constraints.hard_gate_passed, true);
    assert.equal(winner.route_target, tournament.route_target);
    assert.deepEqual(Object.keys(winner.scores), EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT.variant_score_keys);
    assert.equal(typeof winner.scores.strategy_fit, "number");
    assert.equal(typeof winner.control_footprint.restraint_score, "number");
    assert.equal(Object.values(winner.safety.live_effects).some(Boolean), false);
    assert.ok(tournament.variants.some((variant) => variant.control_footprint.role === "incumbent_unchanged"));
    if (winner.control_footprint.role === "synthesis_candidate") {
      assert.equal(tournament.restraint.restraint_comparison.synthesis_can_beat_revision, true);
    }
    assert.deepEqual(
      tournament.restraint.restraint_comparison.safety_metric_subset.metric_ids,
      SAFETY_CRITICAL_METRIC_IDS
    );
    assert.deepEqual(
      tournament.restraint.restraint_comparison.safety_metric_subset.score_keys,
      ["safety", "holdout", "regression"]
    );

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

test("skill evolution bridge admits replay-required drafts into deterministic tournament only", async () => {
  const result = await reviewEvolutionTournamentGate({
    includeSkillEvolutionCandidates: true,
    now: new Date("2026-05-14T12:50:00Z")
  });

  const bridge = result.skill_evolution_bridge;
  const admittedRefs = bridge.candidate_refs.filter((ref) => ref.status === "admitted");
  const admittedIds = new Set(admittedRefs.map((ref) => ref.candidate_id));
  const bridgedTournaments = result.tournaments.filter((tournament) => admittedIds.has(tournament.candidate_id));

  assert.equal(result.ok, true);
  assert.equal(bridge.enabled, true);
  assert.equal(bridge.source.supervisor_mode, "skill-evolution-supervisor");
  assert.equal(bridge.source.skill_id, "farcaster_reply_operator");
  assert.equal(bridge.source.event_id, "behavior-farcaster-public-reply-001");
  assert.equal(bridge.summary.supervisor_ok, true);
  assert.equal(bridge.summary.supervisor_candidate_count, 1);
  assert.equal(bridge.summary.admitted_candidate_count, 1);
  assert.equal(bridge.summary.blocked_candidate_count, 0);
  assert.equal(bridge.summary.replay_required_count, 1);
  assert.equal(bridge.summary.tournament_required_count, 1);
  assert.equal(bridge.summary.agentskills_compatible_draft_count, 1);
  assert.equal(bridge.summary.llm_api_calls, 0);
  assert.equal(bridge.admission.output_surface, "tournament_input_candidates_only");
  assert.equal(bridge.admission.requires_replay, true);
  assert.equal(bridge.admission.requires_tournament, true);
  assert.equal(bridge.admission.can_promote_now, false);
  assert.equal(bridge.admission.publication_allowed, false);
  assert.equal(bridge.admission.production_authority, false);
  assert.equal(bridge.admission.llm_judge_allowed, false);
  assert.equal(admittedRefs.every((ref) => (
    ref.replay_required === true
      && ref.tournament_required === true
      && ref.can_promote_now === false
      && ref.agentskills_format === "agentskills.io-compatible-draft"
  )), true);
  assert.equal(result.source.tournament_candidate_count, result.source.report_queue_count + admittedRefs.length);
  assert.equal(result.summary.tournament_count, result.source.tournament_candidate_count);
  assert.equal(bridgedTournaments.length, admittedRefs.length);
  assert.equal(result.tournament_ranking.rule, "deterministic_reducer");
  assert.equal(result.tournament_ranking.llm_judge_allowed, false);
  assert.equal(result.quality_assessment.llm_api_calls, 0);
  assert.equal(result.judge.llm_api_calls, 0);

  for (const tournament of bridgedTournaments) {
    assert.equal(tournament.source_event_id, "behavior-farcaster-public-reply-001");
    assert.equal(tournament.route_target, "skill");
    assert.equal(tournament.winner.recommended_surface, "local_draft_report_only");
    assert.equal(tournament.winner.publication_allowed, false);
    assert.equal(tournament.winner.production_authority, false);
    assert.equal(tournament.variants.every((variant) => (
      variant.safety.production_authority === false
        && variant.safety.publication_allowed === false
        && variant.safety.automatic_write_allowed === false
        && variant.safety.llm_route_decision_allowed === false
        && Object.values(variant.safety.live_effects).every((value) => value === false)
    )), true);
  }

  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("honest ledger versions are injected by writer, not accepted from candidates", () => {
  const ledger = buildTournamentExperienceLedger({
    preflight: {
      experience_ledger: [
        {
          ledger_id: "exp-bogus-version",
          source: "candidate_preflight",
          candidate_id: "candidate-bogus-version",
          source_event_id: "source-bogus-version",
          route_target: "skill",
          status: "shadow_reportable",
          retained_as: "source_backed_shadow_evidence",
          lesson: "candidate supplied stale world versions",
          plant_model_version: "misa.plant_model.v0",
          metric_registry_version: "misa.metric_registry.v0",
          metric_id: "stale.metric",
          replay_proof: {
            mode: "candidate_supplied_fake_proof",
            repo_commit: "fake",
            worktree_dirty: false,
            eval_command: "fake",
            replay_command: "fake",
            replay_idempotent: false,
            replay_writes_ledger: true,
            iteration_id: "fake",
            schema_ref: "fake",
            proof_surface: "fake",
            human_approval_required: false,
            can_promote_now: true,
            advisory_only: false
          },
          score: 0.7
        }
      ]
    },
    tournaments: [],
    now: new Date("2026-05-14T13:00:00Z")
  });

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].plant_model_version, "misa.plant_model.v1");
  assert.equal(ledger[0].metric_registry_version, "misa.metric_registry.v1");
  assert.equal(ledger[0].metric_id, "evolution_tournament.deterministic_score");
  assert.equal(ledger[0].decision, "keep");
  assert.equal(ledger[0].replay_proof.mode, "tournament_replay_proof.v1");
  assert.notEqual(ledger[0].replay_proof.repo_commit, "fake");
  assert.equal(ledger[0].replay_proof.eval_command, "npm run evolution:tournament:misa -- --json");
  assert.equal(ledger[0].replay_proof.replay_idempotent, true);
  assert.equal(ledger[0].replay_proof.replay_writes_ledger, false);
  assert.equal(ledger[0].replay_proof.iteration_id, "exp-bogus-version");
  assert.equal(ledger[0].replay_proof.human_approval_required, true);
  assert.equal(ledger[0].replay_proof.can_promote_now, false);
  assert.equal(ledger[0].replay_proof.advisory_only, true);
});

test("tournament restraint setpoints and safety subset are registered metrics", () => {
  const registry = loadDefaultMetricRegistry();
  const metrics = new Map(registry.metrics.map((metric) => [metric.metric_id, metric]));
  const tolerance = metrics.get(DEFAULT_RESTRAINT_SETPOINTS.metric_regression_tolerance.metric_id);
  const metricGamingRisk = metrics.get(METRIC_GAMING_RISK_ID);

  assert.equal(tolerance.direction, "hold_within");
  assert.equal(tolerance.bounds.min, 0);
  assert.equal(tolerance.bounds.max, 1);
  assert.equal(metricGamingRisk.direction, "minimize");
  assert.equal(metricGamingRisk.measurement_kind, "guardrail");
  assert.equal(metricGamingRisk.bounds.min, 0);
  assert.equal(metricGamingRisk.bounds.max, 1);
  assert.equal(metricGamingRisk.source_contract.reducer_id, "buildMetricGamingRisk");
  assert.equal(metricGamingRisk.source_contract.deterministic_only, true);
  assert.equal(metricGamingRisk.source_contract.provider_calls_allowed, false);
  assert.equal(metricGamingRisk.source_contract.external_api_allowed, false);
  for (const metricId of SAFETY_CRITICAL_METRIC_IDS) {
    const metric = metrics.get(metricId);
    assert.equal(metric.safety_critical, true);
    assert.equal(metric.direction, "maximize");
    assert.equal(metric.source_contract.reducer_id, "scoreVariant");
    assert.equal(metric.source_contract.deterministic_only, true);
    assert.equal(metric.source_contract.provider_calls_allowed, false);
    assert.equal(metric.source_contract.external_api_allowed, false);
  }
});

test("ledger writer records enum convergence status and ignores candidate no-change self-report", () => {
  const tournament = buildTournament({
    candidate_id: "candidate-damping-no-change",
    source_event_id: "source-damping-no-change",
    route_target: "damping",
    proposed_optimization: {
      reason: "Hold the damping candidate unless new evidence appears."
    },
    local_preflight: {
      score: 0.72,
      commands: ["npm run evolution:evaluate:misa"]
    },
    evidence: {
      evidence_count: 1,
      risk_level: "low",
      normalized_signals: []
    },
    restraint_state: {
      consecutive_no_change_count: 99
    }
  }, {
    now: new Date("2026-05-14T13:10:00Z")
  });

  assert.equal(tournament.winner.strategy, "baseline");
  assert.equal(tournament.restraint.incumbent_retained, true);
  assert.equal(tournament.restraint.consecutive_no_change_count, 1);
  assert.equal(tournament.restraint.convergence_status, "incumbent_retained_x1");
  assert.equal(tournament.restraint.scope_drift_risk.mode, "deterministic_reducer");
  assert.equal(tournament.restraint.scope_drift_risk.llm_api_calls, 0);

  const ledger = buildTournamentExperienceLedger({
    preflight: {
      experience_ledger: [
        {
          ledger_id: "exp-previous-incumbent",
          source: "tournament_variant",
          candidate_id: "candidate-damping-no-change",
          source_event_id: "source-damping-no-change",
          route_target: "damping",
          status: "winner",
          retained_as: "incumbent_unchanged_retained",
          lesson: "Previous ledger-owned no-change decision.",
          consecutive_no_change_count: 1,
          convergence_status: "incumbent_retained_x1",
          score: 0.9
        }
      ]
    },
    tournaments: [tournament],
    now: new Date("2026-05-14T13:10:00Z")
  });
  const winnerEntry = ledger.find((entry) => (
    entry.source === "tournament_variant"
    && entry.status === "winner"
    && entry.tournament_id === tournament.tournament_id
  ));

  assert.equal(winnerEntry.retained_as, "incumbent_unchanged_retained");
  assert.equal(winnerEntry.consecutive_no_change_count, 2);
  assert.equal(winnerEntry.convergence_status, "incumbent_retained_x2");
  assert.equal(winnerEntry.change_diff_hash, "diff-empty");
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
