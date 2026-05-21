const DEFAULT_NOW = new Date("2026-05-21T00:00:00Z");

const SAFETY = Object.freeze({
  production_authority: false,
  executes_work_orders: false,
  writes_persistent_memory: false,
  installs_skills: false,
  calls_model_providers: false,
  calls_external_api: false,
  touches_vps: false
});

function iso(value) {
  const date = value instanceof Date ? value : new Date(value ?? DEFAULT_NOW);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "human-escalation")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 100) || "human-escalation";
}

function severityFromRisk(riskLevel) {
  return {
    critical: "P0",
    high: "P1",
    medium: "P2",
    low: "P3"
  }[riskLevel] ?? "P2";
}

export function buildHumanEscalation({
  escalationId,
  triggerSource = "control_boundary",
  severity = "P2",
  summary,
  structuredEvidence = {},
  suggestedActions = [],
  requiredHumanDecision = "hold",
  resumeAfterDecision = "manual_resume",
  now = DEFAULT_NOW
} = {}) {
  return {
    schema_version: "misa.human_escalation.v1",
    mode: "human-escalation",
    created_at: iso(now),
    escalation_id: escalationId ?? `human-escalation-${stableSlug(triggerSource)}-${stableSlug(summary)}`,
    trigger_source: triggerSource,
    severity,
    summary,
    structured_evidence: structuredEvidence,
    suggested_actions: suggestedActions.length ? suggestedActions : [
      {
        action_id: "hold",
        label: "Hold",
        effect: "Keep the candidate pending until the human owner gives a clearer decision."
      }
    ],
    required_human_decision: requiredHumanDecision,
    authority_policy: {
      human_owner_required: true,
      agent_may_execute_without_decision: false,
      llm_may_change_decision: false,
      resume_after_decision: resumeAfterDecision
    },
    safety: { ...SAFETY },
    warnings: [
      "This packet asks for a human decision; it does not grant execution authority.",
      "An LLM may summarize this packet but may not approve, reject, or modify the authority decision."
    ]
  };
}

export function humanEscalationFromWorkOrder(order, { now = DEFAULT_NOW } = {}) {
  const summary = [
    order.title,
    order.summary
  ].filter(Boolean).join(": ");
  return buildHumanEscalation({
    escalationId: `human-escalation-${stableSlug(order.work_order_id)}`,
    triggerSource: "work_order",
    severity: severityFromRisk(order.risk_level),
    summary,
    structuredEvidence: {
      work_order_id: order.work_order_id,
      category: order.category,
      risk_level: order.risk_level,
      suggested_executor: order.suggested_executor?.executor_type ?? null,
      source_refs: order.source_refs ?? [],
      forbidden_scope: order.traceability?.forbidden_scope ?? []
    },
    suggestedActions: [
      {
        action_id: "approve-local-only",
        label: "Approve local-only handling",
        effect: "Allow the primary or specialized agent to handle only the bounded local scope."
      },
      {
        action_id: "choose-stronger-model",
        label: "Escalate to stronger model",
        effect: "Use a stronger model for review or implementation while preserving the same boundaries."
      },
      {
        action_id: "hold",
        label: "Hold",
        effect: "Keep this work order pending."
      }
    ],
    requiredHumanDecision: "choose_executor",
    resumeAfterDecision: "manual_resume",
    now
  });
}

export function humanEscalationsFromWorkOrderRouting(workOrderRouting, { now = DEFAULT_NOW } = {}) {
  return (workOrderRouting?.work_orders ?? [])
    .filter((order) => (
      order.suggested_executor?.executor_type === "human_owner"
      || order.execution_policy?.requires_user_confirmation === true
      || ["critical", "high"].includes(order.risk_level)
      || order.model_handoff?.stronger_model_recommended === true
    ))
    .map((order) => humanEscalationFromWorkOrder(order, { now }));
}
