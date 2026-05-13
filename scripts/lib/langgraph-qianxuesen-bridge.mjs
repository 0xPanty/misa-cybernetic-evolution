import { routeWorkOrders } from "./work-order-router.mjs";
import { createHash } from "node:crypto";
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

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function workOrdersFromRouting(workOrderRouting) {
  if (Array.isArray(workOrderRouting?.work_orders)) {
    return workOrderRouting.work_orders;
  }
  if (workOrderRouting?.work_order) {
    return [workOrderRouting.work_order];
  }
  return [];
}

function executorTypeForOrder(order) {
  return order.suggested_executor?.executor_type
    ?? order.suggested_executor
    ?? "primary_agent";
}

function requiresUserConfirmation(order) {
  return order.execution_policy?.requires_user_confirmation
    ?? order.requires_user_confirmation
    ?? true;
}

function durableOrPublicEffectAllowed(order) {
  return order.execution_policy?.durable_or_public_effect_allowed === true;
}

function rollbackRequired(order) {
  return order.traceability?.rollback_required
    ?? order.rollback_required
    ?? false;
}

function forbiddenScopeForOrder(order) {
  return order.traceability?.forbidden_scope
    ?? order.forbidden_scope
    ?? [];
}

function sourceRefIds(workOrders) {
  const refs = [];
  for (const order of workOrders) {
    refs.push(order.source?.source_id);
    refs.push(...(order.source_refs ?? []).map((ref) => ref.id));
  }
  return unique(refs);
}

function repairTicketIdsFromWorkOrders(workOrders) {
  const ids = [];
  for (const order of workOrders) {
    if (order.source?.source_type === "repair_ticket") {
      ids.push(order.source.source_id);
    }
    for (const ref of order.source_refs ?? []) {
      if (ref.kind === "repair_ticket") {
        ids.push(ref.id);
      }
    }
  }
  return unique(ids);
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

function buildDeterminismContract() {
  return {
    claim_scope: "qianxuesen_sidecar_after_input_ingest",
    input_boundary: {
      upstream_artifacts_may_be_llm_generated: true,
      upstream_artifacts_are_evidence_not_authority: true,
      raw_private_content_persisted: false
    },
    distill: {
      implementation: "rule_symbolic_local_token_vector",
      deterministic_after_input: true,
      uses_llm: false,
      llm_api_calls: 0,
      external_api_calls: 0,
      vector_backend: "local-token-vector-v1",
      vector_lookup_required: false
    },
    route: {
      implementation: "signal_rules_and_route_table",
      deterministic_after_input: true,
      uses_llm: false,
      llm_may_override: false,
      route_vocab: ["memory", "skill", "case", "policy", "damping", "ignore"]
    },
    handoff: {
      implementation: "repair_ticket_work_order_interrupt",
      durable_effects_require_interrupt: true,
      execution_without_human: false
    }
  };
}

function effectiveDecisionForBridge(workOrders, interruptQueue) {
  if (interruptQueue.length > 0) return "require_interrupt";
  if (workOrders.length > 0) return "allow_bounded_local_work";
  return "allow_readonly_projection";
}

function matchedRuleForEffectiveDecision(effectiveDecision) {
  if (effectiveDecision === "require_interrupt") {
    return "require_interrupt_for_durable_or_public_effect";
  }
  if (effectiveDecision === "allow_bounded_local_work") {
    return "allow_bounded_local_work_after_policy";
  }
  return "allow_qianxuesen_readonly_projection";
}

function buildActionPolicyContract(workOrders, interruptQueue) {
  const effectiveDecision = effectiveDecisionForBridge(workOrders, interruptQueue);

  return {
    policy_engine: {
      kind: "qianxuesen_local_rule_matrix",
      default_action: "deny",
      conflict_resolution: "deny_overrides",
      evaluation_timing: "before_control_action",
      fail_closed: true,
      llm_in_decision_loop: false,
      allowed_outcomes: [
        "allow_readonly_projection",
        "allow_bounded_local_work",
        "require_interrupt",
        "deny"
      ]
    },
    rules: [
      {
        rule_id: "deny_llm_learning_authority",
        stage_id: "route",
        priority: 1000,
        match: "actor=llm_agent and action in llm_agent_must_not",
        decision: "deny"
      },
      {
        rule_id: "require_interrupt_for_durable_or_public_effect",
        stage_id: "work_order",
        priority: 900,
        match: "durable_or_public_effect=true or suggested_executor=human_owner",
        decision: "require_interrupt"
      },
      {
        rule_id: "allow_qianxuesen_readonly_projection",
        stage_id: "distill",
        priority: 500,
        match: "owner=qianxuesen_deterministic and raw_private_content_persisted=false",
        decision: "allow_readonly_projection"
      },
      {
        rule_id: "allow_bounded_local_work_after_policy",
        stage_id: "work_order",
        priority: 300,
        match: "requires_user_confirmation=false and durable_or_public_effect=false",
        decision: "allow_bounded_local_work"
      }
    ],
    evaluated_action: {
      action_type: "learning_route_and_work_order_handoff",
      work_order_count: workOrders.length,
      interrupt_count: interruptQueue.length,
      durable_or_public_effect_count: interruptQueue.filter((item) => item.durable_or_public_effect).length
    },
    decision_trace: [
      {
        stage_id: "distill",
        matched_rule: "allow_qianxuesen_readonly_projection",
        decision: "allow_readonly_projection"
      },
      {
        stage_id: "route",
        matched_rule: "deny_llm_learning_authority",
        decision: "deny",
        applied_to_llm_attempts_only: true,
        observed_llm_attempt_count: 0
      },
      {
        stage_id: "work_order",
        matched_rule: matchedRuleForEffectiveDecision(effectiveDecision),
        decision: effectiveDecision
      }
    ],
    effective_decision: effectiveDecision
  };
}

function buildDecisionBom({
  bridgeCore,
  actionPolicyContract,
  workOrders,
  interruptQueue,
  now
}) {
  const requiredFields = [
    {
      name: "control_owner",
      category: "identity",
      value: QIANXUESEN_OWNER,
      source: "integration_principle.control_layer",
      present: bridgeCore.integration_principle.control_layer === QIANXUESEN_CONTROL_LAYER,
      inferred: false
    },
    {
      name: "policy_rules_evaluated",
      category: "policy",
      value: actionPolicyContract.rules.map((rule) => rule.rule_id),
      source: "action_policy_contract.rules",
      present: actionPolicyContract.rules.length >= 4,
      inferred: false
    },
    {
      name: "action_type",
      category: "action",
      value: actionPolicyContract.evaluated_action.action_type,
      source: "action_policy_contract.evaluated_action",
      present: true,
      inferred: false
    },
    {
      name: "decision_outcome",
      category: "outcome",
      value: actionPolicyContract.effective_decision,
      source: "action_policy_contract.effective_decision",
      present: true,
      inferred: false
    },
    {
      name: "evidence_source_refs",
      category: "lineage",
      value: bridgeCore.state_projection.evidence_source_ids,
      source: "state_projection.evidence_source_ids",
      present: bridgeCore.state_projection.evidence_source_ids.length > 0 || workOrders.length === 0,
      inferred: false
    },
    {
      name: "human_boundary_status",
      category: "boundary",
      value: interruptQueue.length > 0 ? "interrupt_required" : "no_interrupt_required",
      source: "interrupt_queue",
      present: true,
      inferred: false
    }
  ];
  const missingRequiredFields = requiredFields
    .filter((field) => !field.present)
    .map((field) => field.name);
  const completenessScore = requiredFields.length === 0
    ? 0
    : Number(((requiredFields.length - missingRequiredFields.length) / requiredFields.length).toFixed(4));
  const bomCore = {
    schema_version: "misa.qianxuesen_decision_bom.v1",
    reconstruction_mode: "from_existing_bridge_signals",
    decision_id: `bridge-${stableHash({
      created_at: bridgeCore.created_at,
      source_ids: bridgeCore.state_projection.evidence_source_ids,
      work_order_ids: workOrders.map((order) => order.work_order_id),
      effective_decision: actionPolicyContract.effective_decision
    }).slice(0, 16)}`,
    reconstructed_at: now.toISOString(),
    sources_queried: [
      "state_projection",
      "governance_hooks",
      "action_policy_contract",
      "interrupt_queue",
      "decision_boundary"
    ],
    required_fields: requiredFields,
    missing_required_fields: missingRequiredFields,
    completeness_score: completenessScore
  };

  return {
    ...bomCore,
    integrity_hash: stableHash(bomCore)
  };
}

function interruptReason(order) {
  if (executorTypeForOrder(order) === "human_owner") {
    return "work order routes to human owner";
  }
  if (requiresUserConfirmation(order)) {
    return "work order requires user confirmation";
  }
  if (durableOrPublicEffectAllowed(order) === false) {
    return "durable/public effects are blocked unless a human resumes";
  }
  return "human boundary required before execution";
}

function inferBlockedSurfaces(order) {
  const text = [
    ...forbiddenScopeForOrder(order),
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
    requires_interrupt: requiresUserConfirmation(order) !== false
      || durableOrPublicEffect
      || executorTypeForOrder(order) === "human_owner",
    blocked_surfaces: inferBlockedSurfaces(order),
    source_policy: "work_order.execution_policy plus traceability.forbidden_scope"
  };
}

function interruptFromWorkOrder(order) {
  const executorType = executorTypeForOrder(order);
  const durableOrPublicEffect = durableOrPublicEffectAllowed(order)
    || executorType === "human_owner"
    || rollbackRequired(order) === true;
  const effectBoundary = effectBoundaryForWorkOrder(order, durableOrPublicEffect);

  return {
    interrupt_id: `interrupt-${stableSlug(order.work_order_id)}`,
    source_type: "work_order",
    source_id: order.work_order_id,
    title: order.title ?? order.work_order_id,
    reason: interruptReason(order),
    suggested_executor: executorType,
    requires_user_confirmation: requiresUserConfirmation(order) !== false,
    durable_or_public_effect: durableOrPublicEffect,
    effect_boundary: effectBoundary,
    resume_policy: {
      human_owner_required: durableOrPublicEffect || executorType === "human_owner",
      accepted_decisions: [...INTERRUPT_DECISIONS],
      require_source_refs: true,
      require_approval_record: true
    }
  };
}

function buildInterruptQueue(workOrderRouting) {
  return workOrdersFromRouting(workOrderRouting)
    .filter((order) => (
      requiresUserConfirmation(order) !== false
      || executorTypeForOrder(order) === "human_owner"
      || durableOrPublicEffectAllowed(order)
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
  if (!bridge.determinism_contract) {
    violations.push("determinism_contract_required");
  } else {
    const contract = bridge.determinism_contract;
    if (contract.claim_scope !== "qianxuesen_sidecar_after_input_ingest") {
      violations.push("determinism_claim_scope_must_be_bounded");
    }
    if (
      contract.input_boundary?.upstream_artifacts_may_be_llm_generated !== true
      || contract.input_boundary?.upstream_artifacts_are_evidence_not_authority !== true
    ) {
      violations.push("upstream_llm_boundary_must_be_explicit");
    }
    if (
      contract.distill?.uses_llm !== false
      || contract.distill?.llm_api_calls !== 0
      || contract.distill?.external_api_calls !== 0
      || contract.distill?.vector_backend !== "local-token-vector-v1"
    ) {
      violations.push("distill_determinism_contract_mismatch");
    }
    if (
      contract.route?.uses_llm !== false
      || contract.route?.llm_may_override !== false
      || !includesAll(contract.route?.route_vocab, ["memory", "skill", "case", "policy", "damping", "ignore"])
    ) {
      violations.push("route_determinism_contract_mismatch");
    }
    if (
      contract.handoff?.durable_effects_require_interrupt !== true
      || contract.handoff?.execution_without_human !== false
    ) {
      violations.push("handoff_determinism_contract_mismatch");
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
  const actionPolicy = bridge.action_policy_contract;
  if (!actionPolicy) {
    violations.push("action_policy_contract_required");
  } else {
    if (
      actionPolicy.policy_engine?.default_action !== "deny"
      || actionPolicy.policy_engine?.conflict_resolution !== "deny_overrides"
      || actionPolicy.policy_engine?.fail_closed !== true
      || actionPolicy.policy_engine?.llm_in_decision_loop !== false
    ) {
      violations.push("action_policy_engine_must_be_fail_closed");
    }
    const ruleIds = (actionPolicy.rules ?? []).map((rule) => rule.rule_id);
    if (!includesAll(ruleIds, [
      "deny_llm_learning_authority",
      "require_interrupt_for_durable_or_public_effect",
      "allow_qianxuesen_readonly_projection",
      "allow_bounded_local_work_after_policy"
    ])) {
      violations.push("action_policy_rules_missing");
    }
    const allowedOutcomes = actionPolicy.policy_engine?.allowed_outcomes ?? [];
    if (
      !allowedOutcomes.includes(actionPolicy.effective_decision)
      || (actionPolicy.decision_trace ?? []).some((item) => !allowedOutcomes.includes(item.decision))
    ) {
      violations.push("action_policy_decision_outcome_unknown");
    }
    const hasInterrupts = (bridge.interrupt_queue ?? []).length > 0;
    if (hasInterrupts && actionPolicy.effective_decision !== "require_interrupt") {
      violations.push("interrupts_must_force_require_interrupt_decision");
    }
  }
  const bom = bridge.decision_bom;
  if (!bom) {
    violations.push("decision_bom_required");
  } else {
    const missing = bom.missing_required_fields ?? [];
    if (bom.completeness_score !== 1 || missing.length > 0) {
      violations.push("decision_bom_must_be_complete");
    }
    const { integrity_hash: integrityHash, ...bomCore } = bom;
    if (!integrityHash || integrityHash !== stableHash(bomCore)) {
      violations.push("decision_bom_integrity_hash_mismatch");
    }
    if (actionPolicy && bom.required_fields?.find((field) => field.name === "decision_outcome")?.value !== actionPolicy.effective_decision) {
      violations.push("decision_bom_outcome_must_match_policy");
    }
  }

  return violations;
}

export function buildLangGraphQianxuesenBridge({
  workOrderRouting,
  repairTicketReview,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const workOrders = workOrdersFromRouting(workOrderRouting);
  const repairTicketCount = repairTicketReview?.summary?.ticket_count
    ?? repairTicketIdsFromWorkOrders(workOrders).length;
  const customNodes = buildCustomNodes();
  const governanceHooks = buildGovernanceHooks();
  const interruptQueue = buildInterruptQueue(workOrderRouting);
  const actionPolicyContract = buildActionPolicyContract(workOrders, interruptQueue);

  const bridgeCore = {
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
    determinism_contract: buildDeterminismContract(),
    state_projection: {
      evidence_source_ids: sourceRefIds(workOrders),
      repair_ticket_count: repairTicketCount,
      work_order_count: workOrders.length,
      high_risk_work_order_count: workOrders.filter((order) => ["P0", "P1"].includes(order.severity)).length,
      human_owner_work_order_count: workOrders.filter((order) => executorTypeForOrder(order) === "human_owner").length
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
    action_policy_contract: actionPolicyContract,
    summary: {
      work_order_count: workOrders.length,
      interrupt_count: interruptQueue.length,
      deterministic_governance_node_count: customNodes.length,
      governance_hook_count: governanceHooks.length,
      llm_owned_learning_decision_count: 0,
      live_effect_allowed: false,
      action_policy_effective_decision: actionPolicyContract.effective_decision,
      decision_bom_completeness_score: 1,
      verifier: "passed"
    },
    warnings: [
      "This is a local integration contract, not a LangGraph runtime install.",
      "LangGraph State is evidence input; Qianxuesen route output remains authoritative.",
      "Any repair ticket or durable/public work order should become an interrupt before execution."
    ],
    violations: []
  };
  const bridge = {
    ...bridgeCore,
    decision_bom: buildDecisionBom({
      bridgeCore,
      actionPolicyContract,
      workOrders,
      interruptQueue,
      now
    })
  };

  bridge.violations = violationsForBridge(bridge);
  bridge.ok = bridge.violations.length === 0;
  bridge.summary.verifier = bridge.ok ? "passed" : "failed";
  bridge.summary.decision_bom_completeness_score = bridge.decision_bom.completeness_score;

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
