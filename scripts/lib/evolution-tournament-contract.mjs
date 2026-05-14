export const NOUS_SELF_EVOLUTION_COMMIT = "4693c8f0eed21e39f065c6f38d98d2a403a04095";
export const MAX_VARIANTS_PER_CANDIDATE = 4;
export const JUDGE_NEAR_THRESHOLD_MARGIN = 0.03;

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
    "summary",
    "tournaments",
    "winner_queue",
    "rejected_variant_ledger",
    "experience_ledger",
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
    "tournament_candidate_count"
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
  summary_keys: Object.freeze([
    "tournament_count",
    "variant_count",
    "winner_count",
    "rejected_variant_count",
    "experience_ledger_count",
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
