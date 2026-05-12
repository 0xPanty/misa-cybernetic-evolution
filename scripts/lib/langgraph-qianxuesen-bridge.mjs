import { routeWorkOrders } from "./work-order-router.mjs";
import {
  CHECKPOINTER_FIELDS,
  DEFAULT_STATE_INPUTS,
  GOVERNANCE_STAGES,
  INTERRUPT_DECISIONS,
  INTERRUPT_TRIGGER_SOURCES,
  LANGGRAPH_CARRIER_LAYER,
  LANGGRAPH_OWNS,
  LLM_MAY,
  LLM_MUST_NOT,
  QIANXUESEN_CONTROL_LAYER,
  QIANXUESEN_OWNER,
  QIANXUESEN_OWNS,
  RESUME_REQUIRES,
  SAFETY_FALSE_FIELDS
} from "./langgraph-qianxuesen-contract.mjs";

function stableSlug(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90) || "unknown";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sourceRefIds(workOrders) {
  const refs = [];
  for (const order of workOrders) {
    refs.push(order.source?.source_id);
    refs.push(...(order.source_refs ?? []).map((ref) => ref.id));
  }
  return unique(refs);
}

function buildGovernanceHooks() {
  return GOVERNANCE_STAGES.map((stage) => ({
    stage_id: stage.stage_id,
    from_node: stage.from_node,
    to_node: stage.to_node,
    after_node: stage.from_node,
    hook: stage.hook,
    owner: QIANXUESEN_OWNER,
    input_from_state: [...stage.input_from_state],
    output_to_state: [...stage.output_to_state],
    must_be_deterministic: true,
    llm_may_override: false
  }));
}

function buildCustomNodes() {
  return GOVERNANCE_STAGES.map((stage) => ({
    stage_id: stage.stage_id,
    node_id: stage.node_id,
    owner: QIANXUESEN_OWNER,
    calls: stage.calls,
    llm_decision_allowed: false,
    description: stage.description
  }));
}

function interruptReason(order) {
  if (order.suggested_executor?.executor_type === "human_owner") {
    return "work order routes to human owner";
  }
  if (order.execution_policy?.requires_user_confirmation) {
    return "work order requires user confirmation";
  }
  if (order.execution_policy?.durable_or_public_effect_allowed === false) {
    return "durable/public effects are blocked unless a human resumes";
  }
  return "human boundary required before execution";
}

function inferBlockedSurfaces(order) {
  const text = [
    ...(order.traceability?.forbidden_scope ?? []),
    order.source?.source_kind,
    order.category
  ].join(" ").toLowerCase();
  const surfaces = [];
  if (/memory|journal|zilliz/.test(text)) surfaces.push("persistent_memory");
  if (/public|publisher|farcaster|discord|mail|post/.test(text)) surfaces.push("public_or_channel_output");
  if (/vps|service|runtime|timer/.test(text)) surfaces.push("runtime_service");
  if (/provider|credential|env|key/.test(text)) surfaces.push("provider_or_credential");
  if (/skill/.test(text)) surfaces.push("skill_publication");
  return unique(surfaces);
}

function effectBoundaryForWorkOrder(order, durableOrPublicEffect) {
  return {
    durable_or_public_effect: durableOrPublicEffect,
    execution_allowed_without_human: false,
    requires_interrupt: order.execution_policy?.requires_user_confirmation !== false
      || durableOrPublicEffect
      || order.suggested_executor?.executor_type === "human_owner",
    blocked_surfaces: inferBlockedSurfaces(order),
    source_policy: "work_order.execution_policy plus traceability.forbidden_scope"
  };
}

function interruptFromWorkOrder(order) {
  const durableOrPublicEffect = order.execution_policy?.durable_or_public_effect_allowed === true
    || order.suggested_executor?.executor_type === "human_owner"
    || order.traceability?.rollback_required === true;
  const effectBoundary = effectBoundaryForWorkOrder(order, durableOrPublicEffect);

  return {
    interrupt_id: `interrupt-${stableSlug(order.work_order_id)}`,
    source_type: "work_order",
    source_id: order.work_order_id,
    title: order.title,
    reason: interruptReason(order),
    suggested_executor: order.suggested_executor?.executor_type ?? "primary_agent",
    requires_user_confirmation: order.execution_policy?.requires_user_confirmation !== false,
    durable_or_public_effect: durableOrPublicEffect,
    effect_boundary: effectBoundary,
    resume_policy: {
      human_owner_required: durableOrPublicEffect || order.suggested_executor?.executor_type === "human_owner",
      accepted_decisions: [...INTERRUPT_DECISIONS],
      require_source_refs: true,
      require_approval_record: true
    }
  };
}

function buildInterruptQueue(workOrderRouting) {
  return (workOrderRouting?.work_orders ?? [])
    .filter((order) => (
      order.execution_policy?.requires_user_confirmation !== false
      || order.suggested_executor?.executor_type === "human_owner"
      || order.execution_policy?.durable_or_public_effect_allowed === true
    ))
    .map(interruptFromWorkOrder);
}

function includesAll(actual = [], required = []) {
  const actualSet = new Set(actual);
  return required.every((item) => actualSet.has(item));
}

function stageIds(values = []) {
  return values.map((item) => item.stage_id).filter(Boolean);
}

function violationsForBridge(bridge) {
  const violations = [];
  const customNodes = bridge.langgraph_contract.custom_nodes ?? [];
  const hooks = bridge.governance_hooks ?? [];
  const forbidden = bridge.decision_boundary.llm_agent_must_not ?? [];
  const llmForbidden = bridge.langgraph_contract.llm_nodes?.forbidden_learning_decisions ?? [];
  const requiredStageIds = GOVERNANCE_STAGES.map((stage) => stage.stage_id);

  if (bridge.integration_principle.control_layer !== QIANXUESEN_CONTROL_LAYER) {
    violations.push("control_layer_must_remain_qianxuesen");
  }
  if (bridge.integration_principle.carrier_layer !== LANGGRAPH_CARRIER_LAYER) {
    violations.push("carrier_layer_must_be_langgraph");
  }
  if (customNodes.some((node) => node.owner !== QIANXUESEN_OWNER || node.llm_decision_allowed)) {
    violations.push("custom_governance_nodes_must_be_deterministic");
  }
  if (hooks.some((hook) => hook.owner !== QIANXUESEN_OWNER || hook.llm_may_override)) {
    violations.push("governance_hooks_must_not_be_llm_overridable");
  }
  if (!includesAll(stageIds(customNodes), requiredStageIds)) {
    violations.push("custom_governance_node_stage_missing");
  }
  if (!includesAll(stageIds(hooks), requiredStageIds)) {
    violations.push("governance_hook_stage_missing");
  }
  for (const stage of GOVERNANCE_STAGES) {
    const hook = hooks.find((item) => item.stage_id === stage.stage_id);
    if (hook && (hook.from_node !== stage.from_node || hook.to_node !== stage.to_node || hook.hook !== stage.hook)) {
      violations.push(`governance_hook_edge_mismatch_${stage.stage_id}`);
    }
  }
  if (!bridge.langgraph_contract.checkpointer.required) {
    violations.push("langgraph_checkpointer_required");
  }
  if (!includesAll(bridge.langgraph_contract.state_inputs, DEFAULT_STATE_INPUTS)) {
    violations.push("langgraph_state_inputs_missing");
  }
  if (!includesAll(bridge.langgraph_contract.checkpointer.persist_fields, CHECKPOINTER_FIELDS)) {
    violations.push("langgraph_checkpointer_fields_missing");
  }
  if (!bridge.langgraph_contract.interrupt.required) {
    violations.push("langgraph_interrupt_required");
  }
  if (!includesAll(bridge.langgraph_contract.interrupt.trigger_sources, INTERRUPT_TRIGGER_SOURCES)) {
    violations.push("langgraph_interrupt_triggers_missing");
  }
  if (!includesAll(bridge.langgraph_contract.interrupt.resume_requires, RESUME_REQUIRES)) {
    violations.push("langgraph_interrupt_resume_requirements_missing");
  }
  if (!includesAll(forbidden, LLM_MUST_NOT) || !includesAll(llmForbidden, LLM_MUST_NOT)) {
    violations.push("llm_learning_route_boundary_missing");
  }
  for (const field of SAFETY_FALSE_FIELDS) {
    if (bridge.safety[field] !== false) {
      violations.push(`${field}_must_be_false`);
    }
  }
  for (const item of bridge.interrupt_queue ?? []) {
    if (!includesAll(item.resume_policy?.accepted_decisions, INTERRUPT_DECISIONS)) {
      violations.push("interrupt_resume_decisions_missing");
    }
    if (item.resume_policy?.require_source_refs !== true || item.resume_policy?.require_approval_record !== true) {
      violations.push("interrupt_resume_record_required");
    }
    if (item.effect_boundary?.requires_interrupt !== true || item.effect_boundary?.execution_allowed_without_human !== false) {
      violations.push("interrupt_effect_boundary_must_hold");
    }
  }
  if (bridge.summary.llm_owned_learning_decision_count !== 0) {
    violations.push("llm_owned_learning_decision_count_must_be_zero");
  }

  return violations;
}

export function buildLangGraphQianxuesenBridge({
  workOrderRouting,
  repairTicketReview,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const workOrders = workOrderRouting?.work_orders ?? [];
  const repairTicketCount = repairTicketReview?.summary?.ticket_count
    ?? workOrders.filter((order) => order.source?.source_type === "repair_ticket").length;
  const customNodes = buildCustomNodes();
  const governanceHooks = buildGovernanceHooks();
  const interruptQueue = buildInterruptQueue(workOrderRouting);

  const bridge = {
    schema_version: "misa.langgraph_qianxuesen_bridge.v1",
    mode: "langgraph-qianxuesen-bridge",
    ok: true,
    created_at: now.toISOString(),
    integration_principle: {
      carrier_layer: LANGGRAPH_CARRIER_LAYER,
      control_layer: QIANXUESEN_CONTROL_LAYER,
      llm_agent_role: "executor_or_summarizer_only",
      natural_fit: true,
      rule: "LangGraph can carry the loop; Qianxuesen owns what should be learned and when humans must resume."
    },
    langgraph_contract: {
      state_inputs: [...DEFAULT_STATE_INPUTS],
      checkpointer: {
        required: true,
        scope: "learning_cycle",
        persist_fields: [...CHECKPOINTER_FIELDS],
        must_not_persist_raw_private_content: true
      },
      interrupt: {
        required: true,
        trigger_sources: [...INTERRUPT_TRIGGER_SOURCES],
        human_boundary: "human_owner",
        resume_requires: [...RESUME_REQUIRES]
      },
      custom_nodes: customNodes,
      llm_nodes: {
        allowed_roles: [...LLM_MAY],
        forbidden_learning_decisions: [...LLM_MUST_NOT]
      }
    },
    state_projection: {
      evidence_source_ids: sourceRefIds(workOrders),
      repair_ticket_count: repairTicketCount,
      work_order_count: workOrders.length,
      high_risk_work_order_count: workOrders.filter((order) => ["P0", "P1"].includes(order.severity)).length,
      human_owner_work_order_count: workOrders.filter((order) => order.suggested_executor?.executor_type === "human_owner").length
    },
    governance_hooks: governanceHooks,
    interrupt_queue: interruptQueue,
    decision_boundary: {
      qianxuesen_owns: [...QIANXUESEN_OWNS],
      langgraph_owns: [...LANGGRAPH_OWNS],
      llm_agent_may: [...LLM_MAY],
      llm_agent_must_not: [...LLM_MUST_NOT]
    },
    safety: {
      production_authority: false,
      writes_persistent_memory: false,
      publishes_skill: false,
      posts_publicly: false,
      touches_vps_or_services: false,
      provider_route_change_allowed: false,
      llm_route_decision_allowed: false,
      graph_can_execute_live_effects: false,
      all_durable_public_effects_require_interrupt: true
    },
    summary: {
      work_order_count: workOrders.length,
      interrupt_count: interruptQueue.length,
      deterministic_governance_node_count: customNodes.length,
      governance_hook_count: governanceHooks.length,
      llm_owned_learning_decision_count: 0,
      live_effect_allowed: false,
      verifier: "passed"
    },
    warnings: [
      "This is a local integration contract, not a LangGraph runtime install.",
      "LangGraph State is evidence input; Qianxuesen route output remains authoritative.",
      "Any repair ticket or durable/public work order should become an interrupt before execution."
    ],
    violations: []
  };

  bridge.violations = violationsForBridge(bridge);
  bridge.ok = bridge.violations.length === 0;
  bridge.summary.verifier = bridge.ok ? "passed" : "failed";

  return bridge;
}

export async function reviewLangGraphQianxuesenBridge({
  repoRoot = process.cwd(),
  workOrderRouting,
  repairTicketReview,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const routing = workOrderRouting ?? await routeWorkOrders({
    repoRoot,
    repairTicketReview,
    now
  });
  return buildLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    repairTicketReview,
    now
  });
}

export function evaluateLangGraphQianxuesenBridge(bridge) {
  const violations = violationsForBridge(bridge);
  return {
    ...bridge,
    ok: violations.length === 0,
    violations,
    summary: {
      ...bridge.summary,
      verifier: violations.length === 0 ? "passed" : "failed"
    }
  };
}
