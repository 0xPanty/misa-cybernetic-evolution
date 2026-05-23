export const NOUS_SELF_EVOLUTION_COMMIT = "4693c8f0eed21e39f065c6f38d98d2a403a04095";
export const MAX_VARIANTS_PER_CANDIDATE = 4;
export const JUDGE_NEAR_THRESHOLD_MARGIN = 0.03;
export const CONVERGENCE_K = 2;
export const PLANT_MODEL_VERSION = "misa.plant_model.v1";
export const METRIC_REGISTRY_VERSION = "misa.metric_registry.v1";
export const TOURNAMENT_LEDGER_METRIC_ID = "evolution_tournament.deterministic_score";
export const SYNTHESIS_METRIC_REGRESSION_TOLERANCE_ID = "evolution_tournament.synthesis_metric_regression_tolerance";
export const SAFETY_CRITICAL_METRIC_IDS = Object.freeze([
  "evolution_tournament.safety_score",
  "evolution_tournament.holdout_score",
  "evolution_tournament.regression_score"
]);

export const DEFAULT_RESTRAINT_SETPOINTS = Object.freeze({
  metric_regression_tolerance: Object.freeze({
    metric_id: SYNTHESIS_METRIC_REGRESSION_TOLERANCE_ID,
    target_value: 0.03,
    tolerance: 0,
    direction: "hold_within"
  })
});
export const SYNTHESIS_METRIC_EPSILON = DEFAULT_RESTRAINT_SETPOINTS.metric_regression_tolerance.target_value;

export const CONVERGENCE_STATUSES = Object.freeze([
  "running",
  "incumbent_retained_x1",
  "incumbent_retained_x2",
  "scope_drift_suspected",
  "awaiting_new_evidence"
]);

export const LIVE_EFFECTS_OFF = Object.freeze({
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
});

export const BLOCKED_OPERATIONS = Object.freeze([
  "persistent_memory_write",
  "zilliz_replacement",
  "farcaster_publish",
  "skill_publication",
  "production_skill_installation",
  "session_mechanic_replacement",
  "timer_or_service_start",
  "provider_route_change",
  "automatic_prompt_rewrite",
  "automatic_code_evolution"
]);

export const LOCAL_COMMAND_ALLOWLIST = Object.freeze([
  "npm run distill:misa",
  "npm run simulate:misa",
  "npm run adaptive:misa",
  "npm run rollup:misa",
  "npm run evolution:evaluate:misa",
  "npm run evolution:tournament:misa",
  "npm run memory-layer:misa",
  "npm run repair-ticket:misa",
  "npm run post-deploy:measure",
  "npm run stability:monitor",
  "npm run outer-loop:review",
  "npm run skill:evolution",
  "npm run validate:schemas",
  "npm run precheck",
  "npm test"
]);

export const EVOLUTION_TOURNAMENT_OUTPUT_CONTRACT = Object.freeze({
  schema_version: "misa.evolution_tournament_gate.v1",
  mode: "evolution-tournament-gate",
  scorer: "deterministic_proxy_v1",
  authority: "deterministic_qianxuesen_gate_only",
  frozen_scope: "output_shape_and_authority_only",
  top_level_keys: Object.freeze([
    "schema_version",
    "mode",
    "ok",
    "created_at",
    "source",
    "algorithm_adaptation",
    "tournament_policy",
    "tournament_ranking",
    "skill_evolution_bridge",
    "summary",
    "tournaments",
    "winner_queue",
    "rejected_variant_ledger",
    "experience_ledger",
    "historical_post_deploy_results",
    "loser_review_context",
    "control_boundary",
    "safety",
    "quality_assessment",
    "judge_escalation",
    "judge",
    "quality_comparison",
    "warnings",
    "violations"
  ]),
  source_keys: Object.freeze([
    "preflight_mode",
    "source_kind",
    "source_dir",
    "vps_raw_dir",
    "optimization_candidate_count",
    "report_queue_count",
    "tournament_candidate_count",
    "historical_post_deploy_result_count"
  ]),
  tournament_policy_keys: Object.freeze([
    "route_owner",
    "candidate_generation",
    "scorer",
    "max_variants_per_candidate",
    "winner_surface",
    "loser_policy",
    "production_effect"
  ]),
  tournament_ranking_keys: Object.freeze([
    "rule",
    "scorer",
    "llm_judge_allowed",
    "decision_authority",
    "optional_llm_review_role",
    "restraint_contract",
    "critique_summary"
  ]),
  skill_evolution_bridge_keys: Object.freeze([
    "mode",
    "enabled",
    "source",
    "summary",
    "admission",
    "candidate_refs",
    "warnings"
  ]),
  skill_evolution_bridge_source_keys: Object.freeze([
    "supervisor_mode",
    "skill_id",
    "event_id",
    "contract_file",
    "event_file"
  ]),
  skill_evolution_bridge_summary_keys: Object.freeze([
    "supervisor_ok",
    "supervisor_candidate_count",
    "admitted_candidate_count",
    "blocked_candidate_count",
    "replay_required_count",
    "tournament_required_count",
    "agentskills_compatible_draft_count",
    "llm_api_calls"
  ]),
  skill_evolution_bridge_admission_keys: Object.freeze([
    "output_surface",
    "requires_replay",
    "requires_tournament",
    "can_promote_now",
    "publication_allowed",
    "production_authority",
    "llm_judge_allowed"
  ]),
  summary_keys: Object.freeze([
    "tournament_count",
    "variant_count",
    "winner_count",
    "rejected_variant_count",
    "experience_ledger_count",
    "historical_post_deploy_result_count",
    "post_deploy_decision_counts",
    "route_counts",
    "production_authority"
  ]),
  control_boundary_keys: Object.freeze([
    "optimizer_role",
    "route_owner",
    "route_implementation",
    "llm_route_decision_allowed",
    "automatic_promotion_allowed",
    "promotion_surface"
  ]),
  winner_keys: Object.freeze([
    "variant_id",
    "strategy",
    "composite_score",
    "holdout_score",
    "safety_score",
    "recommended_surface",
    "publication_allowed",
    "production_authority",
    "rationale"
  ]),
  variant_score_keys: Object.freeze([
    "route_fit",
    "evidence_fit",
    "train",
    "validation",
    "holdout",
    "safety",
    "compactness",
    "novelty",
    "strategy_fit",
    "regression",
    "composite"
  ]),
  quality_dimension_keys: Object.freeze([
    "route_preservation",
    "safety_lock",
    "holdout_strength",
    "failure_learning",
    "compactness",
    "source_coverage"
  ]),
  judge_escalation_dimension_keys: Object.freeze([
    "uncertainty",
    "value",
    "conflict",
    "novelty",
    "anomaly"
  ]),
  safety_keys: Object.freeze([
    "production_authority",
    "publication_allowed",
    "automatic_write_allowed",
    "llm_route_decision_allowed",
    "requires_human_approval_for_production",
    "live_effects",
    "blocked_operations"
  ]),
  live_effect_keys: Object.freeze(Object.keys(LIVE_EFFECTS_OFF)),
  notes: Object.freeze([
    "This freezes the local report shape and authority boundary, not the scoring formula.",
    "New fields should be added only when they improve review evidence and tests/docs/schema are updated together."
  ])
});
