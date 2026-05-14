export function evaluateEvolutionTournamentGate(result) {
  const violations = [];

  if (result.control_boundary?.route_owner !== "qianxuesen") {
    violations.push("route_owner_must_remain_qianxuesen");
  }
  if (result.control_boundary?.optimizer_role !== "candidate_layer_only") {
    violations.push("optimizer_role_must_be_candidate_layer_only");
  }
  if (result.control_boundary?.llm_route_decision_allowed !== false) {
    violations.push("llm_route_decision_must_be_false");
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

  for (const tournament of result.tournaments ?? []) {
    if ((tournament.variants ?? []).length < 3) {
      violations.push(`${tournament.tournament_id}:needs_at_least_three_variants`);
    }
    if (!tournament.winner?.variant_id) {
      violations.push(`${tournament.tournament_id}:missing_winner`);
    }
    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    if (!winner) {
      violations.push(`${tournament.tournament_id}:winner_not_in_variants`);
      continue;
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
  }

  return violations;
}
