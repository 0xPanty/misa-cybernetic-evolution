export const QIANXUESEN_OWNER = "qianxuesen_deterministic";
export const LANGGRAPH_CARRIER_LAYER = "LangGraph";
export const QIANXUESEN_CONTROL_LAYER = "Qianxuesen";

export const DEFAULT_STATE_INPUTS = [
  "evidence_refs",
  "distillates",
  "learning_events",
  "route_decisions",
  "repair_tickets",
  "work_orders",
  "human_decisions"
];

export const CHECKPOINTER_FIELDS = [
  "thread_id",
  "checkpoint_id",
  "source_refs",
  "route_decisions",
  "repair_ticket_ids",
  "work_order_ids",
  "interrupt_decisions"
];

export const INTERRUPT_TRIGGER_SOURCES = [
  "repair_ticket",
  "work_order",
  "durable_or_public_effect",
  "human_owner_route"
];

export const RESUME_REQUIRES = [
  "decision",
  "approver",
  "source_refs"
];

export const INTERRUPT_DECISIONS = [
  "execute_locally",
  "hold",
  "escalate",
  "reject"
];

export const QIANXUESEN_OWNS = [
  "distillation",
  "route_decision",
  "damping_decision",
  "repair_ticket_creation",
  "work_order_routing",
  "memory_or_skill_promotion",
  "durable_or_public_effect_boundary"
];

export const LANGGRAPH_OWNS = [
  "state_container",
  "node_orchestration",
  "durable_checkpoint",
  "interrupt_and_resume",
  "tool_interface",
  "execution_trace"
];

export const LLM_MAY = [
  "summarize_evidence_after_deterministic_routing",
  "draft_candidate_text_for_review",
  "explain_work_order_to_user",
  "run bounded executor steps after human approval"
];

export const LLM_MUST_NOT = [
  "choose_learning_route",
  "override_qianxuesen_route",
  "promote_memory_or_skill",
  "approve_durable_or_public_effect",
  "resume_after_interrupt_without_human_decision",
  "change_provider_route",
  "write_persistent_memory",
  "publish_skill",
  "touch_vps_or_services"
];

export const SAFETY_FALSE_FIELDS = [
  "production_authority",
  "writes_persistent_memory",
  "publishes_skill",
  "posts_publicly",
  "touches_vps_or_services",
  "provider_route_change_allowed",
  "llm_route_decision_allowed",
  "graph_can_execute_live_effects"
];

export const GOVERNANCE_STAGES = [
  {
    stage_id: "distill",
    from_node: "evidence_ingest",
    to_node: "qianxuesen_distill_node",
    hook: "qianxuesen_distill",
    node_id: "qianxuesen_distill_node",
    calls: "distillLocalMisaSources or Hermes mapping output",
    input_from_state: ["evidence_refs"],
    output_to_state: ["distillates", "learning_events"],
    description: "Convert evidence into local learning inputs before any agent reasoning."
  },
  {
    stage_id: "route",
    from_node: "qianxuesen_distill_node",
    to_node: "qianxuesen_route_node",
    hook: "qianxuesen_route",
    node_id: "qianxuesen_route_node",
    calls: "Misa route rules for memory, skill, case, policy, damping, or ignore",
    input_from_state: ["learning_events"],
    output_to_state: ["route_decisions"],
    description: "Own the learning route so LangGraph agents cannot decide what Misa learns."
  },
  {
    stage_id: "repair_ticket",
    from_node: "qianxuesen_route_node",
    to_node: "qianxuesen_repair_ticket_node",
    hook: "qianxuesen_repair_ticket",
    node_id: "qianxuesen_repair_ticket_node",
    calls: "reviewRepairTickets",
    input_from_state: ["route_decisions"],
    output_to_state: ["repair_tickets"],
    description: "Turn unsafe or unclear learning evidence into local repair tickets."
  },
  {
    stage_id: "work_order",
    from_node: "qianxuesen_repair_ticket_node",
    to_node: "qianxuesen_work_order_node",
    hook: "qianxuesen_work_order_route",
    node_id: "qianxuesen_work_order_node",
    calls: "buildWorkOrderRouting",
    input_from_state: ["repair_tickets"],
    output_to_state: ["work_orders"],
    description: "Choose handoff packet, suggested executor, and escalation without executing."
  }
];
