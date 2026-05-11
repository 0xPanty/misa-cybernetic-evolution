const LIVE_EFFECTS_OFF = {
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
};

const BLOCKED_OPERATIONS = [
  "persistent_memory_write",
  "zilliz_replacement",
  "farcaster_publish",
  "skill_publication",
  "production_skill_installation",
  "session_mechanic_replacement",
  "timer_or_service_start",
  "provider_route_change"
];

const ROUTES = ["memory", "skill", "case", "policy", "damping", "ignore"];

function sourceContract({
  id,
  channel,
  intake_mode,
  scan_interval_minutes,
  default_input,
  raw_lookup,
  full_raw_default,
  candidate_pool,
  durable_learning_rollup,
  immediate_exception_queue,
  signals,
  routes
}) {
  return {
    id,
    channel,
    intake_mode,
    scan_interval_minutes,
    read_policy: {
      default_input,
      raw_lookup,
      full_raw_default
    },
    learning_policy: {
      candidate_pool,
      durable_learning_rollup,
      immediate_exception_queue,
      routes
    },
    signals
  };
}

function buildContract() {
  return {
    cadence: {
      signal_scan_interval_minutes: 30,
      learning_rollup_interval_hours: 24,
      session_distiller_idle_minutes: 30,
      farcaster_defense_mode: "per_candidate_reply",
      farcaster_post_feedback_delays_hours: [2, 24],
      exception_queue: "immediate_signal_only"
    },
    source_contracts: [
      sourceContract({
        id: "session_distiller_success",
        channel: "chat",
        intake_mode: "summary_first",
        scan_interval_minutes: 30,
        default_input: "distilled_summary",
        raw_lookup: "conditional_source_ref_fragments",
        full_raw_default: false,
        candidate_pool: true,
        durable_learning_rollup: "daily",
        immediate_exception_queue: false,
        signals: [
          "stable_user_preference",
          "stable_project_fact",
          "reusable_workflow",
          "explicit_user_boundary"
        ],
        routes: [...ROUTES]
      }),
      sourceContract({
        id: "session_distiller_failure",
        channel: "runtime",
        intake_mode: "failure_log_signal",
        scan_interval_minutes: 30,
        default_input: "distiller_failure_summary",
        raw_lookup: "failure_log_context_only",
        full_raw_default: false,
        candidate_pool: true,
        durable_learning_rollup: "daily",
        immediate_exception_queue: true,
        signals: [
          "single_failure",
          "repeated_failure_pattern",
          "reusable_workflow",
          "explicit_user_boundary"
        ],
        routes: ["damping", "case", "skill", "policy", "ignore"]
      }),
      sourceContract({
        id: "farcaster_behavior",
        channel: "farcaster",
        intake_mode: "pre_reply_defense_then_feedback",
        scan_interval_minutes: 30,
        default_input: "action_audit_and_post_feedback",
        raw_lookup: "public_thread_hash_or_url_only",
        full_raw_default: false,
        candidate_pool: true,
        durable_learning_rollup: "daily",
        immediate_exception_queue: true,
        signals: [
          "farcaster_reply_success",
          "farcaster_low_quality_reply",
          "farcaster_off_voice",
          "farcaster_public_memory_risk",
          "farcaster_overposting_risk",
          "farcaster_good_topic_pattern",
          "farcaster_bad_topic_pattern"
        ],
        routes: [...ROUTES]
      })
    ],
    api_policy: {
      farcaster_local_rule_gate_always: true,
      farcaster_extra_judge_api_default: false,
      farcaster_generation_api_is_reply_generation: true,
      farcaster_extra_judge_required_when: [
        "public_memory_risk",
        "argument_or_troll_risk",
        "identity_or_policy_boundary",
        "high_frequency_reply",
        "uncertain_should_reply"
      ],
      engagement_is_not_quality_by_itself: true
    },
    approval_boundaries: [
      {
        id: "durable_memory_write",
        requires_huan_approval: true,
        production_effect: "blocked"
      },
      {
        id: "public_persona_or_frequency_change",
        requires_huan_approval: true,
        production_effect: "blocked"
      },
      {
        id: "policy_boundary_change",
        requires_huan_approval: true,
        production_effect: "blocked"
      },
      {
        id: "vps_or_service_update",
        requires_huan_approval: true,
        production_effect: "blocked"
      }
    ],
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    }
  };
}

function makeCheck(id, ok, reason) {
  return { id, ok, reason };
}

function evaluateContract(contract) {
  const violations = [];
  const checks = [];
  const byId = new Map(contract.source_contracts.map((source) => [source.id, source]));
  const sessionSuccess = byId.get("session_distiller_success");
  const sessionFailure = byId.get("session_distiller_failure");
  const farcaster = byId.get("farcaster_behavior");

  checks.push(makeCheck(
    "signal_scan_is_30_minutes",
    contract.cadence.signal_scan_interval_minutes === 30,
    "Qianxuesen scans for new signals every 30 minutes; this is discovery, not durable learning."
  ));
  checks.push(makeCheck(
    "daily_rollup_is_24_hours",
    contract.cadence.learning_rollup_interval_hours === 24,
    "Qianxuesen performs formal learning rollup once per day."
  ));
  checks.push(makeCheck(
    "session_distiller_is_summary_first",
    sessionSuccess?.read_policy.default_input === "distilled_summary"
      && sessionSuccess?.read_policy.raw_lookup === "conditional_source_ref_fragments"
      && sessionSuccess?.read_policy.full_raw_default === false,
    "Successful chat distillation starts from distilled summaries and only looks up source fragments when a candidate is valuable."
  ));
  checks.push(makeCheck(
    "session_failure_enters_exception_queue",
    sessionFailure?.learning_policy.immediate_exception_queue === true
      && sessionFailure?.learning_policy.routes.includes("case")
      && sessionFailure?.learning_policy.routes.includes("damping"),
    "Distiller failures become runtime signals and can be routed to damping, case, skill, or policy."
  ));
  checks.push(makeCheck(
    "farcaster_defense_is_per_reply",
    contract.cadence.farcaster_defense_mode === "per_candidate_reply",
    "Farcaster checks every candidate reply before publishing."
  ));
  checks.push(makeCheck(
    "farcaster_learning_is_daily_not_per_cast",
    farcaster?.learning_policy.durable_learning_rollup === "daily"
      && farcaster?.learning_policy.candidate_pool === true,
    "Farcaster behavior is pooled for daily learning instead of changing Misa from each short cast."
  ));
  checks.push(makeCheck(
    "farcaster_extra_judge_is_conditional",
    contract.api_policy.farcaster_extra_judge_api_default === false
      && contract.api_policy.farcaster_local_rule_gate_always === true,
    "Farcaster uses local defense first; extra judge API is reserved for risk or uncertainty."
  ));
  checks.push(makeCheck(
    "engagement_is_not_quality_alone",
    contract.api_policy.engagement_is_not_quality_by_itself === true,
    "Likes or replies alone cannot define reply quality."
  ));
  checks.push(makeCheck(
    "durable_changes_require_huan",
    contract.approval_boundaries.every((boundary) => boundary.requires_huan_approval),
    "Long-term memory, policy, persona, frequency, VPS, and service changes require Huan approval."
  ));
  checks.push(makeCheck(
    "production_authority_is_false",
    contract.safety.production_authority === false
      && contract.safety.publication_allowed === false
      && !Object.values(contract.safety.live_effects).some(Boolean),
    "The intake contract has no production authority or live effects."
  ));
  checks.push(makeCheck(
    "blocked_operations_are_complete",
    BLOCKED_OPERATIONS.every((operation) => contract.safety.blocked_operations.includes(operation)),
    "The signal intake contract must keep every production hard gate blocked."
  ));

  for (const check of checks) {
    if (!check.ok) {
      violations.push(check.reason);
    }
  }

  if (!farcaster?.signals.includes("farcaster_public_memory_risk")) {
    violations.push("Farcaster signals must include public memory risk.");
  }

  if (!contract.safety.blocked_operations.includes("farcaster_publish")) {
    violations.push("Farcaster publish must stay blocked by this learning-layer contract.");
  }

  return { checks, violations };
}

export function reviewSignalIntakeContract() {
  const contract = buildContract();
  const evaluation = evaluateContract(contract);
  const warnings = [
    "This contract describes local intake and learning cadence only; it does not install timers, call providers, publish Farcaster posts, or update VPS.",
    "The 30-minute cadence is signal discovery; daily rollup is the durable learning decision point."
  ];

  return {
    schema_version: "misa.signal_intake_contract.v1",
    mode: "signal-intake-contract",
    ok: evaluation.violations.length === 0,
    ...contract,
    checks: evaluation.checks,
    warnings,
    violations: evaluation.violations
  };
}
