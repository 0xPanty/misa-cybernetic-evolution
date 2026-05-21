export const ROUTE_GENERATOR_CHARTERS = Object.freeze([
  {
    generator_id: "memory-candidate-generator",
    route_kind: "memory",
    purpose: "Draft memory candidates only from stable, source-backed preference or project fact context.",
    allowed_inputs: [
      "memory route work_order_context",
      "metric_context",
      "versioned prompt template"
    ],
    output_surface: "draft_candidate_only",
    forbidden_actions: [
      "write_memory",
      "read_private_raw_memory",
      "change_route",
      "call_provider",
      "touch_vps"
    ],
    persistent_state: false,
    max_steps: 8
  },
  {
    generator_id: "skill-candidate-generator",
    route_kind: "skill",
    purpose: "Draft replay-required skill candidates only from reusable workflow context.",
    allowed_inputs: [
      "skill route work_order_context",
      "replay metric_context",
      "versioned prompt template"
    ],
    output_surface: "draft_candidate_only",
    forbidden_actions: [
      "install_skill",
      "publish_skill",
      "skip_replay",
      "call_provider",
      "touch_vps"
    ],
    persistent_state: false,
    max_steps: 10
  },
  {
    generator_id: "case-candidate-generator",
    route_kind: "case",
    purpose: "Draft known-failure case candidates only from repeated failure or recovery context.",
    allowed_inputs: [
      "case route work_order_context",
      "provider or repair metric_context",
      "versioned prompt template"
    ],
    output_surface: "draft_candidate_only",
    forbidden_actions: [
      "change_provider_route",
      "write_runtime_case_store",
      "restart_service",
      "call_provider",
      "touch_vps"
    ],
    persistent_state: false,
    max_steps: 8
  },
  {
    generator_id: "policy-candidate-generator",
    route_kind: "policy",
    purpose: "Draft policy candidates only from public, durable, credential, or authority-boundary context.",
    allowed_inputs: [
      "policy route work_order_context",
      "guardrail metric_context",
      "versioned prompt template"
    ],
    output_surface: "draft_candidate_only",
    forbidden_actions: [
      "publish_policy",
      "change_runtime_behavior",
      "weaken_guardrail",
      "call_provider",
      "touch_vps"
    ],
    persistent_state: false,
    max_steps: 8
  },
  {
    generator_id: "damping-candidate-generator",
    route_kind: "damping",
    purpose: "Draft damping or hold candidates only from weak, one-off, or unstable evidence context.",
    allowed_inputs: [
      "damping route work_order_context",
      "stability metric_context",
      "versioned prompt template"
    ],
    output_surface: "draft_candidate_only",
    forbidden_actions: [
      "promote_candidate",
      "write_memory",
      "install_skill",
      "change_route",
      "call_provider"
    ],
    persistent_state: false,
    max_steps: 6
  },
  {
    generator_id: "work-order-candidate-generator",
    route_kind: "work_order",
    purpose: "Draft bounded work-order candidates when the source route is already a work-order packet.",
    allowed_inputs: [
      "work_order_context",
      "metric_context",
      "versioned prompt template"
    ],
    output_surface: "draft_candidate_only",
    forbidden_actions: [
      "execute_work_order",
      "change_executor_without_policy",
      "write_memory",
      "install_skill",
      "call_provider",
      "touch_vps"
    ],
    persistent_state: false,
    max_steps: 10
  }
]);

export function generatorForRoute(routeKind = "work_order") {
  return ROUTE_GENERATOR_CHARTERS.find((charter) => charter.route_kind === routeKind)
    ?? ROUTE_GENERATOR_CHARTERS.find((charter) => charter.route_kind === "work_order");
}

export function buildRouteGeneratorScope({ routeKinds = [] } = {}) {
  const wanted = new Set(routeKinds.length ? routeKinds : ROUTE_GENERATOR_CHARTERS.map((item) => item.route_kind));
  const charters = ROUTE_GENERATOR_CHARTERS.filter((charter) => wanted.has(charter.route_kind));
  return {
    routing: "small-focused-route-generators",
    charters
  };
}
