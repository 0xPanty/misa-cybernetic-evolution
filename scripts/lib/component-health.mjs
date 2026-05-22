import crypto from "node:crypto";

const DEFAULT_NOW = new Date("2026-05-22T00:00:00Z");
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const DEFAULT_SETPOINTS = Object.freeze({
  escalation_threshold: {
    metric_id: "component_health.escalation_threshold",
    target_value: 3,
    tolerance: 0,
    direction: "hold_within"
  },
  session_distiller_schema_pass_rate: {
    metric_id: "session_distiller.health_schema_pass_rate",
    target_value: 0.95,
    tolerance: 0.05,
    direction: "maximize"
  },
  runtime_thread_registered_actuator_rate: {
    metric_id: "runtime_thread.health_registered_actuator_rate",
    target_value: 1,
    tolerance: 0,
    direction: "maximize"
  },
  work_order_inbox_dead_letter_rate: {
    metric_id: "work_order_inbox.health_dead_letter_rate",
    target_value: 0,
    tolerance: 0,
    direction: "minimize"
  },
  work_order_inbox_median_ack_latency_ms: {
    metric_id: "work_order_inbox.health_median_ack_latency_ms",
    target_value: 24 * 60 * 60 * 1000,
    tolerance: 0,
    direction: "minimize"
  },
  vector_store_hit_rate: {
    metric_id: "vector_store.health_hit_rate",
    target_value: 1,
    tolerance: 0,
    direction: "maximize"
  },
  vector_store_write_failure_count: {
    metric_id: "vector_store.health_write_failure_count",
    target_value: 0,
    tolerance: 0,
    direction: "minimize"
  },
  tool_loop_integrity_rate: {
    metric_id: "tool_loop.health_integrity_rate",
    target_value: 1,
    tolerance: 0,
    direction: "maximize"
  },
  tool_loop_evidence_ref_rate: {
    metric_id: "tool_loop.health_evidence_ref_rate",
    target_value: 1,
    tolerance: 0,
    direction: "maximize"
  },
  tool_loop_failure_count: {
    metric_id: "tool_loop.health_failure_count",
    target_value: 0,
    tolerance: 0,
    direction: "minimize"
  }
});

const REGISTERED_RUNTIME_ACTUATORS = Object.freeze([
  "runtime.prepare_context",
  "runtime.draft_candidate",
  "runtime.pause_for_human",
  "runtime.resume_after_human",
  "runtime.run_local_gate",
  "runtime.complete",
  "runtime.hold",
  "runtime.error"
]);

const SAFETY = Object.freeze({
  diagnostic_only: true,
  auto_execute: false,
  production_authority: false,
  executes_work_orders: false,
  writes_persistent_memory: false,
  writes_zilliz: false,
  creates_embeddings: false,
  calls_model_providers: false,
  calls_external_api: false,
  touches_vps: false,
  starts_services: false,
  changes_route: false,
  changes_winner_authority: false
});

const STATUS_ORDER = Object.freeze({
  HEALTHY: 0,
  WARNING: 1,
  DEGRADED: 2,
  CRITICAL: 3
});

const COMPONENT_LABELS = Object.freeze({
  "work-order-route-dry-run": "Work-order routing",
  "session-distiller-review-dry-run": "Session distiller review",
  "evolution-tournament-misa-dry-run": "Evolution tournament",
  "vector-memory-classify-dry-run": "Vector memory classification",
  "work-order-variants-dry-run": "Work-order variants",
  "work-order-evaluate-dry-run": "Work-order quality evaluation",
  "vector-store-local-dry-run": "Local vector store",
  "skill-evolution-dry-run": "Skill evolution supervisor",
  "curiosity-signals-dry-run": "Curiosity signal gate",
  "hermes-adapt-runtime-dry-run": "Hermes runtime adapter",
  "hermes-work-order-dry-run": "Hermes work-order pipeline",
  "hermes-plugin-doctor-dry-run": "Hermes plugin doctor",
  "runtime-thread-dry-run": "Runtime thread",
  "zilliz-adapt-dry-run": "Zilliz adapter",
  "vector-memory-rank-dry-run": "Vector retrieval ranker",
  "no-live-writes-or-provider-calls": "Safety boundary"
});

function iso(value) {
  const date = value instanceof Date ? value : new Date(value ?? DEFAULT_NOW);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "component")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "component";
}

function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 12);
}

function componentIdFor(check) {
  return stableSlug(check?.name ?? "component");
}

function componentLabel(componentId, check) {
  return COMPONENT_LABELS[componentId] ?? check?.label ?? check?.name ?? componentId;
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolValue(value) {
  return value === true;
}

function mergedSetpoints(overrides = {}) {
  return {
    ...DEFAULT_SETPOINTS,
    ...overrides
  };
}

function setpointTarget(setpoints, key) {
  return numberValue(setpoints?.[key]?.target_value ?? DEFAULT_SETPOINTS[key]?.target_value);
}

function pushRisk(risks, severity, code, reason, details = {}) {
  risks.push({ severity, code, reason, details });
}

function riskSignalsForCheck(check) {
  const risks = [];
  const criticalTrueFields = [
    "production_authority",
    "live_effect_allowed",
    "durable_or_public_effect_allowed",
    "zilliz_written",
    "embedding_created",
    "writes_persistent_memory",
    "local_vector_store_written",
    "executes_work_orders",
    "installs_skills",
    "calls_model_providers",
    "calls_external_api",
    "touches_vps",
    "starts_services",
    "blocks_runtime",
    "changes_route",
    "changes_winner",
    "changes_winner_authority",
    "controller_authority",
    "supervisor_changes_skill",
    "control_plane_write_deny_failed"
  ];

  for (const field of criticalTrueFields) {
    if (boolValue(check[field])) {
      pushRisk(risks, "critical", field, `${field} became true`, { value: check[field] });
    }
  }

  for (const field of ["llm_api_calls", "external_api_calls", "safety_regressions", "metadata_violations"]) {
    if (numberValue(check[field]) > 0) {
      pushRisk(risks, "critical", field, `${field} is above zero`, { value: check[field] });
    }
  }

  if (typeof check.positive_lift_rate === "number" && check.positive_lift_rate < 1) {
    pushRisk(risks, "degraded", "positive_lift_rate", "winner lift is no longer consistently positive", {
      value: check.positive_lift_rate
    });
  }

  if (typeof check.avg_delta === "number" && check.avg_delta <= 0) {
    pushRisk(risks, "degraded", "avg_delta", "winner quality lift is not positive", {
      value: check.avg_delta
    });
  }

  for (const field of ["missed_review_worthy", "noise_selected"]) {
    if (numberValue(check[field]) > 0) {
      pushRisk(risks, "degraded", field, `${field} is above zero`, { value: check[field] });
    }
  }

  for (const field of [
    "failed_tool_result_count",
    "unmatched_tool_intent_count",
    "tool_events_missing_evidence_count",
    "tool_loop_failure_count"
  ]) {
    if (numberValue(check[field]) > 0) {
      pushRisk(risks, "degraded", field, `${field} is above zero`, { value: check[field] });
    }
  }

  if (typeof check.tool_loop_integrity_rate === "number" && check.tool_loop_integrity_rate < 1) {
    pushRisk(risks, "degraded", "tool_loop_integrity_rate", "tool loop integrity is below the registered setpoint", {
      value: check.tool_loop_integrity_rate
    });
  }

  if (typeof check.tool_loop_evidence_ref_rate === "number" && check.tool_loop_evidence_ref_rate < 1) {
    pushRisk(risks, "degraded", "tool_loop_evidence_ref_rate", "tool loop evidence refs are incomplete", {
      value: check.tool_loop_evidence_ref_rate
    });
  }

  if (numberValue(check.repair_work_orders) > 0) {
    pushRisk(risks, "warning", "repair_work_orders_opened", "review opened repair work orders", {
      value: check.repair_work_orders
    });
  }

  return risks;
}

function worstRiskStatus(risks) {
  if (risks.some((risk) => risk.severity === "critical")) return "CRITICAL";
  if (risks.some((risk) => risk.severity === "degraded")) return "DEGRADED";
  if (risks.some((risk) => risk.severity === "warning")) return "WARNING";
  return "HEALTHY";
}

function previousComponentState(history, componentId) {
  return history?.components?.[componentId] ?? {};
}

function registeredRuntimeActuatorForStep(stepType) {
  const actuator = `runtime.${String(stepType ?? "unknown")}`;
  return REGISTERED_RUNTIME_ACTUATORS.includes(actuator) ? actuator : null;
}

function explainDegradation({ check, risks, checkOk, consecutiveFailures, threshold, status }) {
  const reasons = [];
  if (!checkOk) {
    reasons.push("source check failed");
  }
  if (consecutiveFailures >= threshold) {
    reasons.push(`consecutive failures reached setpoint ${threshold}`);
  }
  for (const risk of risks) {
    reasons.push(risk.reason);
  }

  return {
    status,
    falsifiable: true,
    reducer_kind: "pure_deterministic_reducer",
    no_llm_scoring: true,
    explanation: reasons.length
      ? reasons.join("; ")
      : "no failing check, threshold breach, or risk signal was observed",
    counterfactual: "If the same source check passes and no risk signal breaches a registered setpoint, this component returns to HEALTHY or WARNING.",
    source_check_ok: checkOk,
    risk_count: risks.length
  };
}

function classifyComponent(check, { history = {}, now = DEFAULT_NOW, setpoints = DEFAULT_SETPOINTS } = {}) {
  const componentId = componentIdFor(check);
  const previous = previousComponentState(history, componentId);
  const risks = riskSignalsForCheck(check);
  const statusFromRisks = worstRiskStatus(risks);
  const checkOk = check?.ok === true;
  const escalationThreshold = Math.max(1, setpointTarget(setpoints, "escalation_threshold"));
  const consecutiveFailures = checkOk && statusFromRisks !== "CRITICAL" && statusFromRisks !== "DEGRADED"
    ? 0
    : numberValue(previous.consecutive_failures) + 1;
  const repeatedFailureStatus = consecutiveFailures >= escalationThreshold ? "CRITICAL" : "DEGRADED";
  const status = checkOk
    ? statusFromRisks
    : repeatedFailureStatus;
  const diagnosticEligible = ["DEGRADED", "CRITICAL"].includes(status);
  const lastDiagnosticAt = previous.last_diagnostic_at ? new Date(previous.last_diagnostic_at) : null;
  const cooldownActive = Boolean(
    diagnosticEligible
    && lastDiagnosticAt
    && !Number.isNaN(lastDiagnosticAt.getTime())
    && new Date(now).getTime() - lastDiagnosticAt.getTime() < COOLDOWN_MS
  );

  return {
    component_id: componentId,
    label: componentLabel(componentId, check),
    source_check: check.name,
    status,
    ok: ["HEALTHY", "WARNING"].includes(status),
    consecutive_failures: consecutiveFailures,
    previous_status: previous.last_status ?? null,
    risks,
    positive_feedback: positiveFeedbackForCheck(check, risks),
    degradation_evidence: explainDegradation({
      check,
      risks,
      checkOk,
      consecutiveFailures,
      threshold: escalationThreshold,
      status
    }),
    setpoint_refs: {
      escalation_threshold: {
        metric_id: setpoints.escalation_threshold.metric_id,
        target_value: escalationThreshold
      }
    },
    cooldown: {
      active: cooldownActive,
      last_diagnostic_at: previous.last_diagnostic_at ?? null,
      window_hours: 24
    },
    evidence: check
  };
}

function positiveFeedbackForCheck(check, risks) {
  const feedback = [];
  if (check.ok === true) feedback.push("dry-run check passed");
  if (check.production_authority === false) feedback.push("no production authority");
  if (check.writes_persistent_memory === false) feedback.push("no persistent memory write");
  if (check.zilliz_written === false || check.local_store_zilliz_written === false) feedback.push("no Zilliz write");
  if (check.embedding_created === false || check.local_store_embedding_created === false) feedback.push("no embedding creation");
  if (check.llm_api_calls === 0) feedback.push("no LLM call");
  if (check.external_api_calls === 0) feedback.push("no external API call");
  if (check.executes_work_orders === false) feedback.push("does not execute work orders");
  if (check.positive_lift_rate === 1) feedback.push("candidate winner kept positive lift");
  if (typeof check.avg_delta === "number" && check.avg_delta > 0) feedback.push("winner beat baseline score");
  if (check.safety_regressions === 0) feedback.push("no safety regression");
  if (check.tool_loop_integrity_rate === 1) feedback.push("tool loop integrity preserved");
  if (check.tool_loop_evidence_ref_rate === 1) feedback.push("tool loop events have evidence refs");
  if (check.tool_loop_failure_count === 0 || check.failed_tool_result_count === 0) feedback.push("no tool-loop failure");
  if (check.no_write === true) feedback.push("no-write supervisor mode");
  if (check.blocks_runtime === false) feedback.push("does not block runtime");
  if (check.touches_vps === false) feedback.push("does not touch VPS");
  if (check.next_step) feedback.push(`next step is deterministic: ${check.next_step}`);
  if (risks.length === 0 && feedback.length === 0) feedback.push("no risk signal detected");
  return [...new Set(feedback)];
}

function severityForStatus(status) {
  return status === "CRITICAL" ? "P1" : status === "DEGRADED" ? "P2" : "P3";
}

function candidateRouteForComponent(component) {
  if (component.status === "CRITICAL") return "damping";
  if (component.risks.some((risk) => [
    "positive_lift_rate",
    "avg_delta",
    "missed_review_worthy",
    "noise_selected",
    "repair_work_orders_opened"
  ].includes(risk.code))) {
    return "policy";
  }
  return component.status === "DEGRADED" ? "damping" : "ignore";
}

function routeIntent(route) {
  return {
    damping: "recommend pausing or dampening the affected local path until replay explains the regression",
    policy: "recommend slow-loop threshold or policy review after human approval",
    ignore: "archive the observation without changing behavior"
  }[route] ?? "archive the observation";
}

function diagnosticCandidateForComponent(component, { now = DEFAULT_NOW } = {}) {
  const route = candidateRouteForComponent(component);
  const hash = stableHash({
    component_id: component.component_id,
    status: component.status,
    risks: component.risks.map((risk) => risk.code),
    consecutive_failures: component.consecutive_failures,
    route
  });
  const replayKey = `component-health:${component.component_id}:${hash}`;

  return {
    schema_version: "misa.component_health_diagnostic_candidate.v1",
    candidate_id: `candidate-component-health-${component.component_id}-${hash}`,
    created_at: iso(now),
    severity: severityForStatus(component.status),
    status: "diagnostic_candidate",
    candidate_kind: "component_health_diagnostic",
    route,
    allowed_routes: ["damping", "policy", "ignore"],
    title: `${component.label} health regression`,
    problem_statement: `${component.label} is ${component.status.toLowerCase()} after local component-health review.`,
    source: {
      kind: "component_health",
      component_id: component.component_id,
      source_check: component.source_check,
      consecutive_failures: component.consecutive_failures
    },
    evidence_ref: {
      kind: "health_sequence",
      replay_key: replayKey,
      component_id: component.component_id,
      metric_id: component.setpoint_refs.escalation_threshold.metric_id
    },
    evidence: {
      risks: component.risks,
      source_check: component.evidence,
      degradation_evidence: component.degradation_evidence
    },
    recommended_next_actions: [
      "Reproduce with the component's existing local dry-run command.",
      "Compare the latest source check with the previous healthy output.",
      `Treat this as ${route} route evidence: ${routeIntent(route)}.`,
      "Run the focused component test before any wider gate."
    ],
    acceptance_criteria: [
      "component status returns to HEALTHY or WARNING",
      "same local dry-run command passes",
      "no live effects, provider calls, Zilliz writes, VPS touches, or memory writes are introduced"
    ],
    non_goals: [
      "Do not execute this diagnostic candidate from the diagnostic file.",
      "Do not change production services or credentials.",
      "Do not bypass replay, local gate, or human-owner approval."
    ],
    delivery: {
      receiver_type: "human_owner",
      receiver_label: "Human owner",
      reason: "The human escalation queue is the only consumer; agents produce diagnostics but do not auto-consume them."
    },
    human_escalation: {
      required: true,
      queue: "human_escalation",
      consumer: "human_owner",
      next_step_after_approval: route === "policy" ? "open_policy_candidate_for_slow_loop" : "route_candidate_through_existing_replay_path"
    },
    execution_policy: {
      auto_execute: false,
      agent_self_review_allowed: false,
      durable_or_public_effect_policy: "human_owner_required",
      production_service_change_policy: "human_owner_required",
      memory_write_policy: "human_owner_required"
    },
    replay: {
      replay_required: true,
      replay_key: replayKey,
      deterministic_fingerprint: hash,
      generator: "component_health_diagnostic_pure_reducer",
      llm_generated: false
    },
    cooldown: component.cooldown,
    safety: { ...SAFETY }
  };
}

function overallStatus(components) {
  return components.reduce((winner, component) => (
    STATUS_ORDER[component.status] > STATUS_ORDER[winner] ? component.status : winner
  ), "HEALTHY");
}

function normalizeComponentChecks(componentChecks) {
  return (componentChecks ?? [])
    .filter((check) => check?.name !== "health:components dry-run")
    .map((check) => ({ ...check }));
}

function findCheck(checks, name) {
  return checks.find((check) => check.name === name) ?? {};
}

function ratio(numerator, denominator) {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(3));
}

function buildHealthReducers(checks, { history = {}, setpoints = DEFAULT_SETPOINTS } = {}) {
  const session = findCheck(checks, "session-distiller:review dry-run");
  const runtime = findCheck(checks, "runtime:thread dry-run");
  const inbox = findCheck(checks, "work-order:inbox dry-run");
  const vectorStore = findCheck(checks, "vector-store:local dry-run");
  const vectorRank = findCheck(checks, "vector-memory:rank dry-run");
  const explicitToolLoop = findCheck(checks, "tool-loop dry-run");
  const toolLoop = explicitToolLoop.name
    ? explicitToolLoop
    : findCheck(checks, "hermes:adapt-runtime dry-run");
  const runtimeActuator = registeredRuntimeActuatorForStep(runtime.next_step);
  const sessionValidOutputs = numberValue(
    session.schema_valid_outputs
    ?? session.valid_schema_outputs
    ?? session.schema_valid_count
    ?? (session.name && session.ok ? 1 : 0)
  );
  const sessionTotalOutputs = numberValue(
    session.total_distiller_outputs
    ?? session.total_outputs
    ?? session.schema_total_count
    ?? (session.name ? 1 : 0)
  );
  const runtimeRegisteredHits = numberValue(
    runtime.registered_actuator_hits
    ?? runtime.registered_next_step_actuator_hits
    ?? (runtimeActuator ? 1 : 0)
  );
  const runtimeDecisionTotal = numberValue(
    runtime.total_next_step_decisions
    ?? (runtime.name ? 1 : 0)
  );
  const inboxAckLatencies = Array.isArray(inbox.ack_latencies_ms) ? inbox.ack_latencies_ms.slice().sort((a, b) => a - b) : [];
  const inboxMedian = inboxAckLatencies.length
    ? inboxAckLatencies[Math.floor(inboxAckLatencies.length / 2)]
    : null;
  const inboxLastSampleTs = inbox.last_sample_ts
    ?? inbox.last_ack_at
    ?? inbox.updated_at
    ?? null;
  const inboxDeadLetters = numberValue(inbox.dead_letters);
  const inboxTotal = numberValue(inbox.total_messages ?? inbox.total_work_orders ?? inboxAckLatencies.length + inboxDeadLetters);
  const inboxLatencyTarget = setpointTarget(setpoints, "work_order_inbox_median_ack_latency_ms");
  const inboxDeadLetterRate = inbox.name ? ratio(inboxDeadLetters, Math.max(1, inboxTotal)) : null;
  const explicitWriteFailureCount = optionalNumber(vectorStore.write_failure_count)
    ?? optionalNumber(vectorStore.local_write_failure_count)
    ?? optionalNumber(vectorRank.write_failure_count);
  const forbiddenWriteCount = [
    vectorStore.local_vector_store_written === false ? 0 : 1,
    vectorStore.zilliz_written === false ? 0 : 1,
    vectorStore.embedding_created === false ? 0 : 1
  ].reduce((total, value) => total + value, 0);
  const writeFailureCount = explicitWriteFailureCount ?? forbiddenWriteCount;
  const vectorHitRate = optionalNumber(vectorRank.top1_exact_recall)
    ?? optionalNumber(vectorStore.hit_rate);
  const hasVectorHitSample = vectorHitRate !== null;
  const toolEventCount = numberValue(toolLoop.tool_event_count);
  const toolResultCount = numberValue(toolLoop.tool_result_count);
  const failedToolResultCount = numberValue(
    toolLoop.failed_tool_result_count
    ?? toolLoop.tool_loop_failure_count
  );
  const unmatchedToolIntentCount = numberValue(toolLoop.unmatched_tool_intent_count);
  const toolEventsMissingEvidenceCount = numberValue(toolLoop.tool_events_missing_evidence_count);
  const toolEventsWithEvidenceCount = numberValue(toolLoop.tool_events_with_evidence_refs);
  const toolLoopFailureCount = failedToolResultCount + unmatchedToolIntentCount + toolEventsMissingEvidenceCount;
  const toolLoopIntegrityRate = toolEventCount > 0
    ? Number((1 - Math.min(toolLoopFailureCount, toolEventCount) / toolEventCount).toFixed(3))
    : null;
  const toolLoopEvidenceRefRate = toolEventCount > 0
    ? ratio(toolEventsWithEvidenceCount, toolEventCount)
    : null;
  const toolLoopHealthOk = toolLoop.name
    && toolEventCount > 0
    && toolLoopIntegrityRate >= setpoints.tool_loop_integrity_rate.target_value
    && toolLoopEvidenceRefRate >= setpoints.tool_loop_evidence_ref_rate.target_value
    && toolLoopFailureCount <= setpoints.tool_loop_failure_count.target_value;

  return [
    {
      reducer_id: "session_distiller_health",
      metric_id: setpoints.session_distiller_schema_pass_rate.metric_id,
      metric_ids: [setpoints.session_distiller_schema_pass_rate.metric_id],
      plant_state_component: "session_distiller.health_schema_pass_rate",
      plant_state_components: ["session_distiller.health_schema_pass_rate"],
      formula: "schema_valid_outputs / total_distiller_outputs",
      value: session.name ? ratio(sessionValidOutputs, sessionTotalOutputs) : null,
      target_value: setpoints.session_distiller_schema_pass_rate.target_value,
      status: session.name && sessionTotalOutputs > 0 && ratio(sessionValidOutputs, sessionTotalOutputs) >= setpoints.session_distiller_schema_pass_rate.target_value
        ? "HEALTHY"
        : session.name ? "DEGRADED" : "NO_DATA",
      inputs: { schema_valid_outputs: sessionValidOutputs, total_distiller_outputs: sessionTotalOutputs },
      window_size: sessionTotalOutputs,
      pure_reducer: true,
      llm_scoring_allowed: false
    },
    {
      reducer_id: "runtime_thread_health",
      metric_id: setpoints.runtime_thread_registered_actuator_rate.metric_id,
      metric_ids: [setpoints.runtime_thread_registered_actuator_rate.metric_id],
      plant_state_component: "runtime_thread.health_registered_actuator_rate",
      plant_state_components: ["runtime_thread.health_registered_actuator_rate"],
      formula: "registered_next_step_actuator_hits / total_next_step_decisions",
      value: runtime.name ? ratio(runtimeRegisteredHits, runtimeDecisionTotal) : null,
      target_value: setpoints.runtime_thread_registered_actuator_rate.target_value,
      status: runtime.name && runtimeDecisionTotal > 0 && ratio(runtimeRegisteredHits, runtimeDecisionTotal) >= setpoints.runtime_thread_registered_actuator_rate.target_value
        ? "HEALTHY"
        : runtime.name ? "DEGRADED" : "NO_DATA",
      inputs: {
        next_step: runtime.next_step ?? null,
        registered_actuator: runtimeActuator,
        registered_actuator_hits: runtimeRegisteredHits,
        total_next_step_decisions: runtimeDecisionTotal
      },
      window_size: runtimeDecisionTotal,
      pure_reducer: true,
      llm_scoring_allowed: false
    },
    {
      reducer_id: "work_order_inbox_health",
      metric_id: setpoints.work_order_inbox_dead_letter_rate.metric_id,
      metric_ids: [
        setpoints.work_order_inbox_dead_letter_rate.metric_id,
        setpoints.work_order_inbox_median_ack_latency_ms.metric_id
      ],
      plant_state_component: "work_order_inbox.health_dead_letter_rate",
      plant_state_components: [
        "work_order_inbox.health_dead_letter_rate",
        "work_order_inbox.health_median_ack_latency_ms"
      ],
      formula: "dead_letters / total_messages, with median_ack_latency_ms as diagnostic context",
      value: inboxDeadLetterRate,
      target_value: setpoints.work_order_inbox_dead_letter_rate.target_value,
      status: inbox.name
        ? inboxDeadLetterRate <= setpoints.work_order_inbox_dead_letter_rate.target_value
          && (inboxMedian === null || inboxMedian <= inboxLatencyTarget) ? "HEALTHY" : "DEGRADED"
        : "NO_DATA",
      inputs: {
        median_ack_latency_ms: inboxMedian,
        median_ack_latency_metric_id: setpoints.work_order_inbox_median_ack_latency_ms.metric_id,
        median_ack_latency_target_ms: inboxLatencyTarget,
        dead_letters: inbox.name ? inboxDeadLetters : null,
        total_messages: inbox.name ? inboxTotal : null,
        last_sample_ts: inbox.name ? inboxLastSampleTs : null
      },
      window_size: inbox.name ? inboxTotal : 0,
      pure_reducer: true,
      llm_scoring_allowed: false,
      no_data_policy: "does_not_degrade_current_line"
    },
    {
      reducer_id: "vector_store_health",
      metric_id: setpoints.vector_store_hit_rate.metric_id,
      metric_ids: [
        setpoints.vector_store_hit_rate.metric_id,
        setpoints.vector_store_write_failure_count.metric_id
      ],
      plant_state_component: "vector_store.health_hit_rate",
      plant_state_components: [
        "vector_store.health_hit_rate",
        "vector_store.health_write_failure_count"
      ],
      formula: "retrieval_hit_rate - write_failure_penalty",
      value: vectorRank.name || vectorStore.name ? vectorHitRate : null,
      target_value: setpoints.vector_store_hit_rate.target_value,
      status: hasVectorHitSample && vectorHitRate >= setpoints.vector_store_hit_rate.target_value && writeFailureCount === 0
        ? "HEALTHY"
        : hasVectorHitSample || writeFailureCount > 0 ? "DEGRADED" : "NO_DATA",
      inputs: {
        hit_rate: vectorRank.name || vectorStore.name ? vectorHitRate : null,
        write_failure_count: writeFailureCount,
        write_failure_metric_id: setpoints.vector_store_write_failure_count.metric_id
      },
      window_size: numberValue(vectorRank.scenarios ?? vectorRank.scenario_count ?? vectorStore.records),
      pure_reducer: true,
      llm_scoring_allowed: false
    },
    {
      reducer_id: "tool_loop_health",
      metric_id: setpoints.tool_loop_integrity_rate.metric_id,
      metric_ids: [
        setpoints.tool_loop_integrity_rate.metric_id,
        setpoints.tool_loop_evidence_ref_rate.metric_id,
        setpoints.tool_loop_failure_count.metric_id
      ],
      plant_state_component: "tool_loop.health_integrity_rate",
      plant_state_components: [
        "tool_loop.health_integrity_rate",
        "tool_loop.health_evidence_ref_rate",
        "tool_loop.health_failure_count"
      ],
      formula: "1 - (failed_tool_results + unmatched_tool_intents + missing_evidence_refs) / observed_tool_events",
      value: toolLoopIntegrityRate,
      target_value: setpoints.tool_loop_integrity_rate.target_value,
      status: toolLoop.name
        ? toolEventCount > 0
          ? toolLoopHealthOk ? "HEALTHY" : "DEGRADED"
          : "NO_DATA"
        : "NO_DATA",
      inputs: {
        tool_event_count: toolLoop.name ? toolEventCount : null,
        tool_intent_count: toolLoop.name ? numberValue(toolLoop.tool_intent_count) : null,
        tool_result_count: toolLoop.name ? toolResultCount : null,
        failed_tool_result_count: toolLoop.name ? failedToolResultCount : null,
        unmatched_tool_intent_count: toolLoop.name ? unmatchedToolIntentCount : null,
        tool_events_with_evidence_refs: toolLoop.name ? toolEventsWithEvidenceCount : null,
        tool_events_missing_evidence_count: toolLoop.name ? toolEventsMissingEvidenceCount : null,
        evidence_ref_rate: toolLoopEvidenceRefRate,
        failure_count: toolLoop.name ? toolLoopFailureCount : null,
        failure_metric_id: setpoints.tool_loop_failure_count.metric_id,
        evidence_ref_metric_id: setpoints.tool_loop_evidence_ref_rate.metric_id,
        last_sample_ts: toolLoop.name ? toolLoop.last_sample_ts ?? null : null
      },
      window_size: toolLoop.name ? toolEventCount : 0,
      pure_reducer: true,
      llm_scoring_allowed: false,
      no_data_policy: "does_not_degrade_current_line"
    }
  ];
}

export function buildComponentHealthDiagnostics({
  componentChecks = [],
  history = {},
  setpoints: setpointOverrides = {},
  now = DEFAULT_NOW
} = {}) {
  const setpoints = mergedSetpoints(setpointOverrides);
  const checks = normalizeComponentChecks(componentChecks);
  const healthReducers = buildHealthReducers(checks, { history, setpoints });
  const components = checks.map((check) => classifyComponent(check, { history, now, setpoints }));
  const status = overallStatus(components);
  const diagnosticCandidates = components
    .filter((component) => ["DEGRADED", "CRITICAL"].includes(component.status) && !component.cooldown.active)
    .map((component) => diagnosticCandidateForComponent(component, { now }));
  const suppressedDiagnostics = components
    .filter((component) => ["DEGRADED", "CRITICAL"].includes(component.status) && component.cooldown.active)
    .map((component) => ({
      component_id: component.component_id,
      status: component.status,
      reason: "cooldown_active",
      cooldown: component.cooldown
    }));
  const nextHistory = {
    schema_version: "misa.component_health_history.v1",
    updated_at: iso(now),
    components: Object.fromEntries(components.map((component) => [
      component.component_id,
      {
        last_status: component.status,
        consecutive_failures: component.consecutive_failures,
        last_checked_at: iso(now),
        last_diagnostic_at: diagnosticCandidates.some((candidate) => candidate.source.component_id === component.component_id)
          ? iso(now)
          : component.cooldown.last_diagnostic_at
      }
    ]))
  };

  return {
    schema_version: "misa.component_health_diagnostics.v1",
    mode: "component-health-diagnostics",
    ok: !["DEGRADED", "CRITICAL"].includes(status),
    created_at: iso(now),
    status,
    summary: {
      component_count: components.length,
      healthy_count: components.filter((component) => component.status === "HEALTHY").length,
      warning_count: components.filter((component) => component.status === "WARNING").length,
      degraded_count: components.filter((component) => component.status === "DEGRADED").length,
      critical_count: components.filter((component) => component.status === "CRITICAL").length,
      diagnostic_work_order_count: diagnosticCandidates.length,
      diagnostic_candidate_count: diagnosticCandidates.length,
      suppressed_diagnostic_count: suppressedDiagnostics.length,
      positive_feedback_count: components.reduce((total, component) => total + component.positive_feedback.length, 0),
      auto_execute: false
    },
    reducer_policy: {
      pure_reducer: true,
      llm_scoring_allowed: false,
      llm_generated_recommendations_allowed: false,
      route_authority: false,
      setpoint_source: "metric_registry_and_control_contract",
      allowed_candidate_routes: ["damping", "policy", "ignore"],
      human_owner_is_only_consumer: true
    },
    setpoints,
    health_reducers: healthReducers,
    components,
    diagnostic_candidates: diagnosticCandidates,
    diagnostic_work_orders: diagnosticCandidates,
    suppressed_diagnostics: suppressedDiagnostics,
    next_history: nextHistory,
    safety: { ...SAFETY },
    warnings: [
      "Component health is diagnostic only.",
      "Diagnostic candidates are not execution authority.",
      "Repeated failures can open local diagnostic candidates, but auto_execute stays false."
    ]
  };
}

export function summarizeComponentHealthForSmoke(componentHealth) {
  return {
    ok: componentHealth.ok,
    status: componentHealth.status,
    components: componentHealth.summary.component_count,
    healthy: componentHealth.summary.healthy_count,
    warnings: componentHealth.summary.warning_count,
    degraded: componentHealth.summary.degraded_count,
    critical: componentHealth.summary.critical_count,
    diagnostic_candidates: componentHealth.summary.diagnostic_candidate_count,
    diagnostic_work_orders: componentHealth.summary.diagnostic_work_order_count,
    suppressed_diagnostics: componentHealth.summary.suppressed_diagnostic_count,
    positive_feedback: componentHealth.summary.positive_feedback_count,
    auto_execute: componentHealth.safety.auto_execute,
    executes_work_orders: componentHealth.safety.executes_work_orders,
    writes_persistent_memory: componentHealth.safety.writes_persistent_memory,
    calls_external_api: componentHealth.safety.calls_external_api,
    touches_vps: componentHealth.safety.touches_vps
  };
}
