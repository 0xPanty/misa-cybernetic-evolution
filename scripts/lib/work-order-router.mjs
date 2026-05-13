import fs from "node:fs/promises";
import path from "node:path";
import { reviewRepairTickets } from "./repair-ticket.mjs";

const DEFAULT_RECEIVER_SLOTS = {
  primary_agent: {
    label: "Primary agent",
    role: "Receives the work order first, self-reviews it, and either resolves within scope or reports upward based on routing policy."
  },
  persona_operator_agent: {
    label: "Persona or operator agent",
    role: "Reviews voice, content quality, topic choice, and operator behavior."
  },
  specialized_engineering_agent: {
    label: "Specialized engineering agent",
    role: "Edits code, tests, schemas, documentation, deployment scripts, or rollback tooling."
  },
  stronger_model: {
    label: "Stronger model",
    role: "Handles high-complexity repair or design work after the user chooses to escalate."
  },
  human_owner: {
    label: "Human owner",
    role: "Approves high-risk, durable, public, credential, or production-impacting actions."
  }
};

const DEFAULT_ROUTING_POLICY = {
  mode: "risk_graded_default",
  auto_execute_allowed: true,
  max_auto_severity: "P3",
  auto_execute_categories: ["*"],
  primary_agent_report_first: false,
  stronger_model_policy: "recommend_when_high_risk_or_complex",
  durable_or_public_effect_policy: "human_owner_required"
};

const ROUTING_POLICY_MODE_DEFAULTS = {
  report_only: {
    auto_execute_allowed: false,
    auto_execute_categories: [],
    primary_agent_report_first: true
  },
  ask_before_execution: {
    auto_execute_allowed: false,
    auto_execute_categories: [],
    primary_agent_report_first: true
  },
  risk_graded_default: {
    auto_execute_allowed: true,
    auto_execute_categories: ["*"],
    primary_agent_report_first: false
  },
  agent_autonomous_low_risk: {
    auto_execute_allowed: false,
    auto_execute_categories: [],
    primary_agent_report_first: false
  },
  agent_autonomous_within_scope: {
    auto_execute_allowed: false,
    auto_execute_categories: [],
    primary_agent_report_first: false
  },
  full_agent: {
    auto_execute_allowed: false,
    auto_execute_categories: ["*"],
    primary_agent_report_first: false
  }
};

const SEVERITY_RISK = {
  P0: "critical",
  P1: "high",
  P2: "medium",
  P3: "low"
};

function stampFor(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function stableSlug(value) {
  return String(value || "work-order")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120) || "work-order";
}

function severityRank(severity) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[severity] ?? 3;
}

function normalizeRoutingPolicy(routingPolicy = {}) {
  const mode = routingPolicy.mode ?? DEFAULT_ROUTING_POLICY.mode;
  const policy = {
    ...DEFAULT_ROUTING_POLICY,
    ...(ROUTING_POLICY_MODE_DEFAULTS[mode] ?? {}),
    ...routingPolicy,
    mode
  };
  if (["report_only", "ask_before_execution"].includes(mode)) {
    return {
      ...policy,
      auto_execute_allowed: false,
      auto_execute_categories: [],
      primary_agent_report_first: true
    };
  }
  return policy;
}

function mergeReceiverSlots(receiverSlots = {}) {
  return {
    ...DEFAULT_RECEIVER_SLOTS,
    ...receiverSlots
  };
}

function severityAllowedForAuto(severity, maxAutoSeverity) {
  return severityRank(severity) >= severityRank(maxAutoSeverity);
}

function categoryAllowedForAuto(category, categories = []) {
  return categories.includes("*") || categories.includes(category);
}

function modeAllowsAutonomousExecution(mode) {
  return [
    "risk_graded_default",
    "agent_autonomous_low_risk",
    "agent_autonomous_within_scope",
    "full_agent"
  ].includes(mode);
}

function modePrefersAgentReviewFirst(mode) {
  return [
    "risk_graded_default",
    "agent_autonomous_low_risk",
    "agent_autonomous_within_scope",
    "full_agent"
  ].includes(mode);
}

function taskGateForRepairTicket(ticket) {
  const reproduction = ticket.reproduction_commands ?? [];
  const acceptance = ticket.acceptance_criteria ?? [];
  const mayEdit = ticket.codex_scope?.may_edit ?? [];
  const highRisk = ticket.severity === "P0";
  const valuable = ticket.status !== "observe_only";
  const doable = reproduction.length > 0 && acceptance.length > 0 && mayEdit.length > 0;
  const complex = ticket.severity !== "P3" || mayEdit.length > 1 || reproduction.length > 1;

  return {
    complex_enough: complex,
    valuable_enough: valuable,
    doable_enough: doable,
    error_discovery_cost: highRisk ? "high" : "medium",
    verdict: highRisk
      ? "human_owner_review_before_delegate"
      : valuable && doable
        ? "ask_user_then_delegate"
        : "hold_or_observe",
    reasons: [
      complex ? "The ticket has enough scope to justify a work order." : "The ticket is too small for execution now.",
      valuable ? "The ticket represents a real repair candidate." : "The ticket is observe-only evidence.",
      doable ? "The ticket includes reproduction commands, acceptance criteria, and edit scope." : "The ticket needs clearer execution evidence.",
      highRisk ? "High error cost requires human owner review." : "Error discovery cost is bounded by local reproduction and acceptance checks."
    ]
  };
}

function executorForRepairTicket(ticket) {
  if (ticket.severity === "P0") {
    return {
      executor_type: "human_owner",
      label: DEFAULT_RECEIVER_SLOTS.human_owner.label,
      reason: "The ticket crosses or may cross a live-effect boundary."
    };
  }
  if (ticket.status === "observe_only") {
    return {
      executor_type: "primary_agent",
      label: DEFAULT_RECEIVER_SLOTS.primary_agent.label,
      reason: "The ticket is evidence to explain or hold, not a repair pass yet."
    };
  }
  return {
    executor_type: "specialized_engineering_agent",
    label: DEFAULT_RECEIVER_SLOTS.specialized_engineering_agent.label,
    reason: "The ticket includes code/schema/test scope and concrete acceptance checks."
  };
}

function escalationForRepairTicket(ticket) {
  const rank = severityRank(ticket.severity);
  return {
    allowed: ticket.status !== "observe_only",
    recommended_when: rank <= 1
      ? "Escalate if the primary agent cannot finish the repair safely or the diff spans multiple subsystems."
      : "Escalate only if local reproduction exposes broader design risk.",
    stronger_model_slots: rank <= 1 ? ["stronger_model", "specialized_engineering_agent"] : ["stronger_model"],
    user_can_decline_execution: true
  };
}

function promptForWorkOrder({ title, summary, executorLabel, riskLevel, riskContext }) {
  return [
    `I received a work order: ${title}.`,
    `Summary: ${summary}`,
    `Suggested executor: ${executorLabel}.`,
    riskContext ? `Risk level: ${riskLevel} (${riskContext}).` : `Risk level: ${riskLevel}.`,
    "Do you want me to handle it, keep it pending, or hand it to a stronger model?"
  ].join(" ");
}

function modelHandoffForOrder(order, routingPolicy) {
  const highRisk = ["critical", "high"].includes(order.risk_level);
  const broadEdit = (order.traceability.editable_scope ?? []).length >= 4;
  const complexGate = order.task_gate.complex_enough && order.task_gate.error_discovery_cost !== "low";
  const strongerRecommended = highRisk || broadEdit || complexGate;
  const fullAgentMode = routingPolicy?.mode === "full_agent";
  const blockedEffects = order.execution_policy.durable_or_public_effect_allowed === false
    ? " Durable or public effects remain blocked."
    : "";

  return {
    current_model_fit: strongerRecommended ? "use_for_intake_or_small_patch_only" : "suitable_for_first_pass",
    stronger_model_recommended: strongerRecommended,
    reason: strongerRecommended
      ? fullAgentMode
        ? `The work order is high risk, broad, or complex enough that a stronger model is still recommended, but full_agent treats this as advisory for non-durable in-scope work.${blockedEffects}`
        : `The work order is high risk, broad, or complex enough that a stronger model should be offered before execution.${blockedEffects}`
      : "The work order is bounded enough for the current agent to attempt after user choice.",
    stronger_model_slots: order.escalation.stronger_model_slots,
    user_can_override: true
  };
}

function applyRoutingPolicy(order, routingPolicy) {
  const policy = normalizeRoutingPolicy(routingPolicy);
  const autonomousMode = modeAllowsAutonomousExecution(policy.mode);
  const fullAgentMode = policy.mode === "full_agent";
  const autoCandidate = Boolean(policy.auto_execute_allowed)
    && autonomousMode
    && order.execution_policy.self_evolution_allowed
    && !order.execution_policy.durable_or_public_effect_allowed
    && (
      fullAgentMode
      || (
        severityAllowedForAuto(order.severity, policy.max_auto_severity)
        && categoryAllowedForAuto(order.category, policy.auto_execute_categories)
      )
    );

  const agentReviewOnly = !autoCandidate
    && modePrefersAgentReviewFirst(policy.mode)
    && order.execution_policy.agent_self_review_allowed;

  const deliveryPolicy = policy.mode === "report_only"
    ? "report_only_wait_for_user"
    : autoCandidate
      ? "notify_then_execute_within_scope"
      : agentReviewOnly
        ? "deliver_to_agent_for_review"
        : "report_to_user_before_execution";

  const defaultNextStep = policy.mode === "report_only"
    ? "report_only_wait"
    : autoCandidate
      ? "execute_within_scope"
      : agentReviewOnly
        ? order.task_gate.verdict === "hold_or_observe"
          ? "agent_review_then_hold"
          : "agent_self_review_then_report_owner"
        : order.execution_policy.default_next_step;

  const ownerReportRequired = policy.mode === "report_only"
    ? true
    : autoCandidate
      ? false
      : agentReviewOnly
        ? true
        : order.execution_policy.owner_report_required;

  const requiresUserConfirmation = policy.mode === "report_only"
    ? true
    : autoCandidate || agentReviewOnly
      ? false
      : order.execution_policy.requires_user_confirmation;

  const status = autoCandidate
    ? "agent_ready_to_execute"
    : agentReviewOnly
      ? "pending_agent_review"
      : order.status;

  return {
    ...order,
    status,
    delivery: {
      ...order.delivery,
      delivery_policy: deliveryPolicy,
      reason: autoCandidate
        ? "The routing policy allows this bounded low-risk work order to run within scope after notifying the user."
        : agentReviewOnly
          ? "The routing policy sends the work order to the primary agent first so it can self-review, capture experience, and report upward only if needed."
        : order.delivery.reason
    },
    execution_policy: {
      ...order.execution_policy,
      requires_user_confirmation: requiresUserConfirmation,
      auto_execute_allowed: autoCandidate,
      agent_may_self_resolve: autoCandidate,
      owner_report_required: ownerReportRequired,
      default_next_step: defaultNextStep
    },
    model_handoff: modelHandoffForOrder(order, policy)
  };
}

function repairTicketSourceRefs(ticket) {
  const refs = [
    {
      kind: "repair_ticket",
      id: ticket.ticket_id
    },
    {
      kind: "source_kind",
      id: ticket.source_kind
    }
  ];

  for (const promotion of ticket.bad_promotions ?? []) {
    refs.push({
      kind: "source_event",
      id: promotion.source_event_id,
      note: promotion.repair_hint
    });
  }

  return refs;
}

function repairTicketRiskContext(ticket) {
  const evidence = ticket.evidence ?? {};
  if (
    ticket.status === "repair_candidate"
    && evidence.minimal_non_skill_promoted_count === 0
    && evidence.verdict === "minimal_positive_is_safer"
  ) {
    return "local design/regression risk; minimal-positive mode already blocked the bad export";
  }
  if (ticket.source_kind === "json_handoff_contract") {
    return "machine handoff reliability risk; no production mutation happened";
  }
  return "durable and public effects remain blocked";
}

function workOrderFromRepairTicket(ticket, index) {
  const riskLevel = SEVERITY_RISK[ticket.severity] ?? "low";
  const suggestedExecutor = executorForRepairTicket(ticket);
  const taskGate = taskGateForRepairTicket(ticket);
  const summary = ticket.problem_statement;
  const riskContext = repairTicketRiskContext(ticket);

  return {
    work_order_id: `wo-${stableSlug(ticket.ticket_id || index)}`,
    title: ticket.title,
    category: "engineering_repair",
    severity: ticket.severity,
    risk_level: riskLevel,
    status: "pending_user_choice",
    source: {
      source_type: "repair_ticket",
      source_id: ticket.ticket_id,
      source_kind: ticket.source_kind
    },
    summary,
    source_refs: repairTicketSourceRefs(ticket),
    delivery: {
      receiver_type: "primary_agent",
      receiver_label: DEFAULT_RECEIVER_SLOTS.primary_agent.label,
      delivery_policy: "report_to_user_before_execution",
      reason: "The primary agent is the user's front door for deciding whether to execute, hold, or escalate."
    },
    suggested_executor: suggestedExecutor,
    task_gate: taskGate,
    traceability: {
      evidence: ticket.evidence ?? {},
      reproduction_commands: ticket.reproduction_commands ?? [],
      acceptance_criteria: ticket.acceptance_criteria ?? [],
      editable_scope: ticket.codex_scope?.may_edit ?? [],
      forbidden_scope: ticket.codex_scope?.must_not_edit ?? [],
      audit_required: true,
      rollback_required: ticket.severity === "P0",
      source_refs_required: true
    },
    execution_policy: {
      requires_user_confirmation: true,
      auto_execute_allowed: false,
      self_evolution_allowed: ticket.status !== "observe_only" && ticket.severity !== "P0",
      agent_self_review_allowed: ticket.status !== "observe_only",
      agent_may_self_resolve: false,
      owner_report_required: true,
      durable_or_public_effect_allowed: false,
      experience_capture_mode: ticket.status === "observe_only"
        ? "none"
        : "candidate_log_only",
      default_next_step: taskGate.verdict === "hold_or_observe"
        ? "explain_and_hold"
        : "ask_user_to_choose_executor"
    },
    escalation: escalationForRepairTicket(ticket),
    user_prompt: promptForWorkOrder({
      title: ticket.title,
      summary,
      executorLabel: suggestedExecutor.label,
      riskLevel,
      riskContext
    })
  };
}

function verdictFromOperatorQuality(report) {
  const quality = report.operator_quality ?? {};
  const verdict = quality.verdict ?? "watch";
  if (verdict === "tighten") return { severity: "P1", risk: "high" };
  if (verdict === "watch") return { severity: "P2", risk: "medium" };
  return { severity: "P3", risk: "low" };
}

export function workOrderFromOperationalQualityReport(report, {
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const quality = report.operator_quality ?? {};
  const { severity, risk } = verdictFromOperatorQuality(report);
  const recommendations = quality.recommendations ?? report.recommendations ?? [];
  const reportDate = report.report_date ?? now.toISOString().slice(0, 10);
  const summary = recommendations.length
    ? recommendations.join(" ")
    : "Review the operator quality report before changing behavior.";
  const title = `Operator quality review for ${reportDate}`;
  const executor = {
    executor_type: "persona_operator_agent",
    label: DEFAULT_RECEIVER_SLOTS.persona_operator_agent.label,
    reason: "The issue concerns voice, content quality, topic choice, or operating posture."
  };

  return {
    work_order_id: `wo-operator-quality-${stableSlug(reportDate)}`,
    title,
    category: "operator_quality",
    severity,
    risk_level: risk,
    status: "pending_user_choice",
    source: {
      source_type: "operational_quality_report",
      source_id: report.report_id ?? report.report_date ?? "operator-quality-report",
      source_kind: report.schema ?? "operator_quality_report"
    },
    summary,
    source_refs: [
      {
        kind: "daily_report",
        id: report.report_id ?? report.report_date ?? "unknown"
      },
      {
        kind: "operator_quality",
        id: quality.schema ?? "operator_quality"
      }
    ],
    delivery: {
      receiver_type: "primary_agent",
      receiver_label: DEFAULT_RECEIVER_SLOTS.primary_agent.label,
      delivery_policy: "report_to_user_before_execution",
      reason: "The primary agent should explain the quality issue and ask whether the persona/operator agent should self-review."
    },
    suggested_executor: executor,
    task_gate: {
      complex_enough: severity !== "P3",
      valuable_enough: severity !== "P3",
      doable_enough: recommendations.length > 0,
      error_discovery_cost: risk === "high" ? "medium" : "low",
      verdict: severity === "P3" ? "hold_or_observe" : "ask_user_then_delegate",
      reasons: [
        "Operational quality is learned from pooled history, not a single cast.",
        recommendations.length ? "The report includes concrete recommendations." : "The report needs more evidence before action.",
        "Behavior changes stay behind user choice and do not directly publish."
      ]
    },
    traceability: {
      evidence: {
        counts: report.counts ?? {},
        operator_quality: quality,
        recommendations
      },
      reproduction_commands: [],
      acceptance_criteria: [
        "the agent reports the work order to the user before execution",
        "the persona/operator agent proposes changes before durable mutation",
        "high-risk public or memory effects require owner approval"
      ],
      editable_scope: ["operator prompt or policy candidates", "content strategy candidates"],
      forbidden_scope: ["live publisher", "credentials", "private memory", "production services"],
      audit_required: true,
      rollback_required: false,
      source_refs_required: true
    },
    execution_policy: {
      requires_user_confirmation: true,
      auto_execute_allowed: false,
      self_evolution_allowed: true,
      agent_self_review_allowed: true,
      agent_may_self_resolve: false,
      owner_report_required: true,
      durable_or_public_effect_allowed: false,
      experience_capture_mode: "candidate_log_only",
      default_next_step: severity === "P3" ? "explain_and_hold" : "ask_user_to_choose_executor"
    },
    escalation: {
      allowed: true,
      recommended_when: "Escalate if the persona/operator agent cannot explain the quality failure or proposes broad identity changes.",
      stronger_model_slots: ["stronger_model"],
      user_can_decline_execution: true
    },
    user_prompt: promptForWorkOrder({
      title,
      summary,
      executorLabel: executor.label,
      riskLevel: risk,
      riskContext: "persona/operator behavior can change only after user choice"
    })
  };
}

function sortWorkOrders(orders) {
  return [...orders].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)
    || a.work_order_id.localeCompare(b.work_order_id));
}

export function buildWorkOrderRouting({
  repairTicketReview,
  operationalReports = [],
  receiverSlots,
  routingPolicy,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const policy = normalizeRoutingPolicy(routingPolicy);
  const workOrders = [];

  for (const [index, ticket] of (repairTicketReview?.tickets ?? []).entries()) {
    workOrders.push(workOrderFromRepairTicket(ticket, index));
  }

  for (const report of operationalReports) {
    const order = workOrderFromOperationalQualityReport(report, { now });
    if (order.severity !== "P3" || (report.operator_quality?.recommendations ?? []).length) {
      workOrders.push(order);
    }
  }

  const sorted = sortWorkOrders(workOrders).map((order) => applyRoutingPolicy(order, policy));
  return {
    schema_version: "misa.work_order_routing.v1",
    mode: "work-order-routing",
    ok: true,
    created_at: now.toISOString(),
    receiver_slots: mergeReceiverSlots(receiverSlots),
    routing_policy: policy,
    summary: {
      work_order_count: sorted.length,
      by_category: sorted.reduce((counts, order) => {
        counts[order.category] = (counts[order.category] ?? 0) + 1;
        return counts;
      }, {}),
      by_suggested_executor: sorted.reduce((counts, order) => {
        const key = order.suggested_executor.executor_type;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
      requires_user_confirmation_count: sorted.filter((order) => order.execution_policy.requires_user_confirmation).length,
      auto_executable_count: sorted.filter((order) => order.execution_policy.auto_execute_allowed).length,
      agent_self_review_count: sorted.filter((order) => order.execution_policy.agent_self_review_allowed).length,
      owner_report_required_count: sorted.filter((order) => order.execution_policy.owner_report_required).length,
      escalation_available_count: sorted.filter((order) => order.escalation.allowed).length,
      stronger_model_recommended_count: sorted.filter((order) => order.model_handoff.stronger_model_recommended).length
    },
    work_orders: sorted,
    safety: {
      auto_execute_allowed: policy.auto_execute_allowed,
      durable_or_public_effect_allowed: false,
      primary_agent_must_report_first: policy.primary_agent_report_first,
      agent_self_review_default: modePrefersAgentReviewFirst(policy.mode),
      user_may_escalate_to_stronger_model: true,
      traceability_required: true
    },
    warnings: [
      "Work orders are routing packets, not automatic execution.",
      modePrefersAgentReviewFirst(policy.mode)
        ? "The primary agent may self-review first, but durable or public effects still stay blocked from silent execution."
        : "The primary agent must explain the work order and ask the user before acting.",
      "Every suggested executor can be overridden by the user."
    ]
  };
}

export async function routeWorkOrders({
  repoRoot = process.cwd(),
  repairTicketReview,
  operationalReports = [],
  receiverSlots,
  routingPolicy,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const review = repairTicketReview ?? await reviewRepairTickets({ repoRoot, now });
  return buildWorkOrderRouting({
    repairTicketReview: review,
    operationalReports,
    receiverSlots,
    routingPolicy,
    now
  });
}

function renderMarkdown(routing) {
  const lines = [
    "# Work Order Routing",
    "",
    `- ok: ${routing.ok}`,
    `- created_at: ${routing.created_at}`,
    `- work_order_count: ${routing.summary.work_order_count}`,
    `- requires_user_confirmation_count: ${routing.summary.requires_user_confirmation_count}`,
    `- auto_executable_count: ${routing.summary.auto_executable_count}`,
    `- agent_self_review_count: ${routing.summary.agent_self_review_count}`,
    `- owner_report_required_count: ${routing.summary.owner_report_required_count}`,
    `- escalation_available_count: ${routing.summary.escalation_available_count}`,
    `- stronger_model_recommended_count: ${routing.summary.stronger_model_recommended_count}`,
    `- routing_mode: ${routing.routing_policy.mode}`,
    "",
    "## Safety",
    "",
    `- auto_execute_allowed: ${routing.safety.auto_execute_allowed}`,
    `- durable_or_public_effect_allowed: ${routing.safety.durable_or_public_effect_allowed}`,
    `- primary_agent_must_report_first: ${routing.safety.primary_agent_must_report_first}`,
    `- agent_self_review_default: ${routing.safety.agent_self_review_default}`,
    `- traceability_required: ${routing.safety.traceability_required}`,
    ""
  ];

  for (const order of routing.work_orders) {
    lines.push(
      `## ${order.work_order_id}`,
      "",
      `- title: ${order.title}`,
      `- category: ${order.category}`,
      `- severity: ${order.severity}`,
      `- risk_level: ${order.risk_level}`,
      `- delivery: ${order.delivery.receiver_type}`,
      `- suggested_executor: ${order.suggested_executor.executor_type}`,
      `- default_next_step: ${order.execution_policy.default_next_step}`,
      "",
      order.summary,
      "",
      "### User Prompt",
      "",
      order.user_prompt,
      "",
      "### Traceability",
      "",
      ...order.source_refs.map((ref) => `- ${ref.kind}: ${ref.id}`),
      "",
      "### Acceptance",
      "",
      ...order.traceability.acceptance_criteria.map((criterion) => `- ${criterion}`),
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function writeWorkOrderArtifacts({
  routing,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "work-orders", stampFor(now)));

  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "work-orders.json");
  const mdPath = path.join(outputRoot, "work-orders.md");
  const withOutput = {
    ...routing,
    output: {
      output_dir: outputRoot,
      json_path: jsonPath,
      markdown_path: mdPath
    }
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(withOutput, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderMarkdown(withOutput), "utf8");

  return withOutput;
}
