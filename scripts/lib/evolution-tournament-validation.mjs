export function evaluateEvolutionTournamentGate(result) {
  const violations = [];
  const allowedFailureTypes = new Set([
    "safety_boundary",
    "quality_inferior",
    "evidence_deficit",
    "context_mismatch",
    "stale_or_freshness",
    "overfit_or_holdout_regression",
    "cost_or_operational_risk"
  ]);
  const allowedConvergenceStatuses = new Set([
    "running",
    "incumbent_retained_x1",
    "incumbent_retained_x2",
    "scope_drift_suspected",
    "awaiting_new_evidence"
  ]);

  if (result.control_boundary?.route_owner !== "qianxuesen") {
    violations.push("route_owner_must_remain_qianxuesen");
  }
  if (result.control_boundary?.optimizer_role !== "candidate_layer_only") {
    violations.push("optimizer_role_must_be_candidate_layer_only");
  }
  if (result.control_boundary?.llm_route_decision_allowed !== false) {
    violations.push("llm_route_decision_must_be_false");
  }
  if (result.tournament_ranking?.rule !== "deterministic_reducer") {
    violations.push("tournament_ranking_must_use_deterministic_reducer");
  }
  if (result.tournament_ranking?.llm_judge_allowed !== false) {
    violations.push("llm_judge_must_not_rank_tournament_winners");
  }
  if (result.tournament_ranking?.decision_authority !== "deterministic_qianxuesen_gate_only") {
    violations.push("tournament_ranking_authority_must_stay_deterministic");
  }
  if ("borda_summary" in (result.tournament_ranking ?? {})) {
    violations.push("borda_summary_name_must_not_be_used_for_advisory_critique");
  }
  const restraintContract = result.tournament_ranking?.restraint_contract;
  if (!allowedConvergenceStatuses.has(restraintContract?.convergence_status)) {
    violations.push("convergence_status_must_be_enum");
  }
  if (restraintContract?.scope_drift_calculator !== "deterministic_reducer"
    || restraintContract?.scope_drift_risk?.mode !== "deterministic_reducer"
    || restraintContract?.scope_drift_risk?.llm_api_calls !== 0) {
    violations.push("scope_drift_risk_must_be_deterministic_zero_call");
  }
  const critiqueSummary = result.tournament_ranking?.critique_summary;
  if (critiqueSummary?.decision_authority !== "none"
    || critiqueSummary?.ranking_authority !== false
    || critiqueSummary?.fresh_context_required !== true) {
    violations.push("critique_summary_must_remain_advisory_only");
  }
  const bridge = result.skill_evolution_bridge;
  if (!bridge) {
    violations.push("skill_evolution_bridge_missing");
  }
  if (bridge?.admission?.requires_replay !== true
    || bridge?.admission?.requires_tournament !== true
    || bridge?.admission?.can_promote_now !== false
    || bridge?.admission?.publication_allowed !== false
    || bridge?.admission?.production_authority !== false
    || bridge?.admission?.llm_judge_allowed !== false) {
    violations.push("skill_evolution_bridge_admission_boundary_invalid");
  }
  if (bridge?.summary?.llm_api_calls !== 0) {
    violations.push("skill_evolution_bridge_must_not_call_llm");
  }
  for (const ref of bridge?.candidate_refs ?? []) {
    if (ref.replay_required !== true || ref.tournament_required !== true || ref.can_promote_now !== false) {
      violations.push(`${ref.candidate_id}:skill_bridge_candidate_must_remain_replay_gated`);
    }
    if (ref.agentskills_format !== "agentskills.io-compatible-draft") {
      violations.push(`${ref.candidate_id}:skill_bridge_candidate_missing_agentskills_draft_format`);
    }
  }
  if (bridge?.enabled === true && bridge.summary?.admitted_candidate_count > 0) {
    const admittedIds = new Set(
      bridge.candidate_refs
        .filter((ref) => ref.status === "admitted")
        .map((ref) => ref.candidate_id)
    );
    const tournamentIds = new Set((result.tournaments ?? []).map((tournament) => tournament.candidate_id));
    for (const candidateId of admittedIds) {
      if (!tournamentIds.has(candidateId)) {
        violations.push(`${candidateId}:skill_bridge_admitted_candidate_missing_tournament`);
      }
    }
  }
  if (result.safety?.production_authority !== false) {
    violations.push("production_authority_must_be_false");
  }
  if (result.safety?.publication_allowed !== false) {
    violations.push("publication_allowed_must_be_false");
  }
  if (Object.values(result.safety?.live_effects ?? {}).some(Boolean)) {
    violations.push("live_effects_must_be_false");
  }
  if (result.judge_escalation?.recommended && result.judge_escalation?.llm_review_value?.level !== "high") {
    violations.push("llm_review_requires_high_expected_value");
  }
  if (result.judge_escalation?.recommended
    && result.judge_escalation?.llm_review_value?.call_policy !== "call_when_auto_enabled") {
    violations.push("llm_review_recommendation_requires_auto_call_policy");
  }
  if (result.judge_escalation?.llm_review_value?.should_change_winner !== false) {
    violations.push("llm_review_must_not_change_winner");
  }
  if (!Array.isArray(result.experience_ledger)) {
    violations.push("experience_ledger_must_be_array");
  }
  for (const entry of result.experience_ledger ?? []) {
    for (const key of [
      "iteration_id",
      "change_diff_hash",
      "plant_model_version",
      "metric_registry_version",
      "metric_id",
      "metric_value",
      "decision",
      "reason_ref",
      "timestamp",
      "last_sample_ts"
    ]) {
      if (!(key in entry)) {
        violations.push(`${entry.ledger_id ?? "ledger_entry"}:missing_honest_ledger_field_${key}`);
      }
    }
    if (!Number.isInteger(entry.consecutive_no_change_count) || entry.consecutive_no_change_count < 0) {
      violations.push(`${entry.ledger_id}:invalid_consecutive_no_change_count`);
    }
    if (!allowedConvergenceStatuses.has(entry.convergence_status)) {
      violations.push(`${entry.ledger_id}:invalid_convergence_status`);
    }
    if (entry.plant_model_version !== "misa.plant_model.v1") {
      violations.push(`${entry.ledger_id}:invalid_plant_model_version`);
    }
    if (entry.metric_registry_version !== "misa.metric_registry.v1") {
      violations.push(`${entry.ledger_id}:invalid_metric_registry_version`);
    }
    if (entry.metric_id !== "evolution_tournament.deterministic_score") {
      violations.push(`${entry.ledger_id}:invalid_ledger_metric_id`);
    }
    if (!["keep", "revert", "skip"].includes(entry.decision)) {
      violations.push(`${entry.ledger_id}:invalid_ledger_decision`);
    }
  }
  const postDeployHistory = result.historical_post_deploy_results;
  if (postDeployHistory?.safety?.production_authority !== false
    || postDeployHistory?.safety?.llm_api_calls !== 0
    || postDeployHistory?.safety?.external_api_calls !== 0
    || postDeployHistory?.safety?.rollback_executed !== false) {
    violations.push("historical_post_deploy_results_must_remain_local_measurement_only");
  }
  for (const item of postDeployHistory?.results ?? []) {
    if (item.production_authority !== false || item.llm_api_calls !== 0) {
      violations.push(`${item.deployment_id}:post_deploy_history_exceeds_authority`);
    }
    if (item.decision_at_window_end === "confirmed_negative"
      && (item.rollback_recommended !== true || item.damping_recommended !== true || item.rollback_executed !== false)) {
      violations.push(`${item.deployment_id}:negative_post_deploy_result_requires_rollback_and_damping_recommendation`);
    }
  }
  if (result.loser_review_context?.safety?.hard_filter_allowed !== false
    || result.loser_review_context?.safety?.changes_winner !== false
    || result.loser_review_context?.safety?.changes_route !== false
    || result.loser_review_context?.safety?.llm_api_calls !== 0
    || result.loser_review_context?.safety?.embedding_created !== false) {
    violations.push("loser_review_context_must_remain_advisory_only");
  }
  const deployment = result.loser_review_context?.deployment_readiness;
  if (result.loser_review_context?.ok !== true
    || deployment?.status !== "release_candidate_shadow_advisory"
    || deployment?.runtime_profile !== "shadow_advisory"
    || deployment?.safe_to_consume !== true
    || (deployment?.release_blockers ?? []).length !== 0) {
    violations.push("loser_review_context_not_release_candidate");
  }
  for (const blockedSurface of [
    "candidate_hard_filter",
    "winner_change",
    "route_change",
    "memory_write",
    "zilliz_write",
    "embedding_provider_call",
    "llm_provider_call"
  ]) {
    if (!(deployment?.blocked_surfaces ?? []).includes(blockedSurface)) {
      violations.push(`loser_review_context_missing_blocked_surface_${blockedSurface}`);
    }
  }
  const limits = deployment?.operational_limits ?? {};
  if (limits.active_recall_top_k > limits.max_recall_top_k
    || limits.active_counterexample_pack > limits.max_counterexample_pack
    || limits.active_reservoir_items > limits.max_reservoir_items
    || limits.external_api_call_budget !== 0
    || limits.llm_api_call_budget !== 0
    || limits.zilliz_write_budget !== 0) {
    violations.push("loser_review_context_operational_limits_invalid");
  }
  const landed = result.loser_review_context?.capabilities_landed ?? [];
  for (const capability of [
    "winner_loser_vector_prototype_recall",
    "route_specific_loser_index",
    "top_k_diversified_counterexample_packing",
    "winner_loser_rehabilitation_joint_recall",
    "loser_reservoir_prototype_compression",
    "weak_model_perturbation_harness_zero_call",
    "strong_model_high_dispute_sampling_plan_zero_call",
    "l3_l4_consumption_plan"
  ]) {
    if (!landed.includes(capability)) {
      violations.push(`loser_review_context_missing_${capability}`);
    }
  }

  for (const tournament of result.tournaments ?? []) {
    if ((tournament.variants ?? []).length < 3) {
      violations.push(`${tournament.tournament_id}:needs_at_least_three_variants`);
    }
    if (!tournament.winner?.variant_id) {
      violations.push(`${tournament.tournament_id}:missing_winner`);
    }
    if (!allowedConvergenceStatuses.has(tournament.restraint?.convergence_status)) {
      violations.push(`${tournament.tournament_id}:invalid_restraint_convergence_status`);
    }
    if (tournament.restraint?.scope_drift_risk?.mode !== "deterministic_reducer"
      || tournament.restraint?.scope_drift_risk?.llm_api_calls !== 0) {
      violations.push(`${tournament.tournament_id}:scope_drift_risk_must_be_deterministic`);
    }
    if (tournament.restraint?.critique_summary?.decision_authority !== "none"
      || tournament.restraint?.critique_summary?.ranking_authority !== false) {
      violations.push(`${tournament.tournament_id}:critique_summary_must_be_advisory_only`);
    }
    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    if (!winner) {
      violations.push(`${tournament.tournament_id}:winner_not_in_variants`);
      continue;
    }
    const incumbent = tournament.variants.find((variant) => variant.control_footprint?.role === "incumbent_unchanged");
    if (!incumbent) {
      violations.push(`${tournament.tournament_id}:missing_incumbent_unchanged_variant`);
    }
    if (winner.control_footprint?.role === "synthesis_candidate"
      && tournament.restraint?.restraint_comparison?.synthesis_can_beat_revision !== true) {
      violations.push(`${tournament.tournament_id}:synthesis_winner_must_be_more_restrained_than_revision`);
    }
    if (!winner.constraints.hard_gate_passed) {
      violations.push(`${tournament.tournament_id}:winner_failed_constraints`);
    }
    if (winner.route_target !== tournament.route_target) {
      violations.push(`${tournament.tournament_id}:winner_changed_route`);
    }
    if (Object.values(winner.safety.live_effects).some(Boolean)) {
      violations.push(`${tournament.tournament_id}:winner_has_live_effects`);
    }
    if (!tournament.variants.some((variant) => variant.tournament_status === "rejected")) {
      violations.push(`${tournament.tournament_id}:missing_negative_rejected_variant`);
    }
    for (const loser of tournament.loser_ledger ?? []) {
      if (!["unsafe", "weak", "promising"].includes(loser.loser_class)) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_loser_class`);
      }
      if (!allowedFailureTypes.has(loser.failure_type)) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_failure_type`);
      }
      if (!loser.candidate_pool_effect || !loser.selection_hint) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_candidate_pool_effect`);
      }
      if (loser.candidate_pool_authority !== "advisory_pressure_only") {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:loser_must_be_advisory_pressure_only`);
      }
      if (loser.hard_filter_allowed !== false) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:loser_must_not_hard_filter_candidates`);
      }
      if (!loser.candidate_pool_action || !loser.review_path || !loser.review_trigger) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_loser_review_path`);
      }
      if (loser.agent_review_required !== true) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:loser_requires_agent_review`);
      }
      if (!Array.isArray(loser.reactivation_conditions) || loser.reactivation_conditions.length === 0) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_reactivation_conditions`);
      }
      if (!loser.rehabilitation_record?.authority
        || loser.rehabilitation_record.authority !== "advisory_reentry_only"
        || loser.rehabilitation_record.record_required_before_pressure_change !== true
        || !Array.isArray(loser.rehabilitation_record.required_evidence)
        || loser.rehabilitation_record.required_evidence.length === 0) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_rehabilitation_record`);
      }
      if (!loser.observed_at || !loser.last_triggered_at) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_loser_time_fields`);
      }
      if (!Number.isInteger(loser.source_count) || loser.source_count < 1) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:invalid_loser_source_count`);
      }
      if (typeof loser.decay_weight !== "number" || loser.decay_weight < 0 || loser.decay_weight > 1) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:invalid_loser_decay_weight`);
      }
      if (typeof loser.confidence !== "number" || loser.confidence < 0 || loser.confidence > 1) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:invalid_loser_confidence`);
      }
      if (!loser.contrast?.winner_variant_id || loser.contrast.winner_variant_id !== winner.variant_id) {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:missing_winner_contrast`);
      }
      if (loser.status === "rejected" && loser.loser_class !== "unsafe") {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:rejected_loser_must_be_unsafe`);
      }
      if (loser.loser_class === "unsafe" && loser.candidate_pool_effect !== "strong_suppression") {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:unsafe_loser_needs_strong_suppression`);
      }
      if (loser.loser_class === "unsafe" && loser.failure_type !== "safety_boundary") {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:unsafe_loser_needs_safety_boundary_failure_type`);
      }
      if (loser.loser_class !== "unsafe" && loser.candidate_pool_effect === "strong_suppression") {
        violations.push(`${tournament.tournament_id}:${loser.variant_id}:safe_loser_must_not_be_strong_suppressed`);
      }
    }
  }
  for (const review of result.loser_review_context?.tournaments ?? []) {
    if (!review.recall?.hits?.length) {
      violations.push(`${review.tournament_id}:missing_loser_recall_hits`);
    }
    if (!review.diversified_counterexample_pack?.items?.length) {
      violations.push(`${review.tournament_id}:missing_counterexample_pack`);
    }
    if (review.l3_l4_consumption?.l3_gate?.may_filter_candidate !== false
      || review.l3_l4_consumption?.l4_context?.may_change_route !== false
      || review.l3_l4_consumption?.l4_context?.may_write_memory !== false) {
      violations.push(`${review.tournament_id}:loser_l3_l4_context_exceeds_authority`);
    }
  }

  return violations;
}
