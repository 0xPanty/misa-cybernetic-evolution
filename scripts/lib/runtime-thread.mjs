import { buildDefaultCandidateGenerationContext } from "./candidate-generation-context.mjs";
import { buildFactorCandidateReducer } from "./factor-candidate-reducer.mjs";
import { humanEscalationsFromWorkOrderRouting } from "./human-escalation.mjs";
import { routeWorkOrders } from "./work-order-router.mjs";

const DEFAULT_NOW = new Date("2026-05-21T00:00:00Z");
const ACCEPTED_HUMAN_DECISIONS = Object.freeze([
  "approve",
  "reject",
  "modify",
  "choose_executor",
  "release_safe_mode",
  "hold"
]);

const RUNTIME_POLICY = Object.freeze({
  launch_api: "local_cli_only",
  pause_resume_supported: true,
  trigger_from_anywhere_ready: false,
  allowed_trigger_sources: [
    "cli",
    "work_order_routing",
    "candidate_generation_context",
    "human_decision_event"
  ],
  external_webhook_enabled: false,
  state_model: "event_log_plus_business_state",
  reducer: "determineNextStep(thread) -> next_step"
});

const EXECUTION = Object.freeze({
  tool_call_allowed: false,
  provider_call_allowed: false,
  external_api_allowed: false,
  live_effect_allowed: false,
  vps_touch_allowed: false,
  writes_persistent_memory: false,
  starts_service: false
});

const AUTHORITY = Object.freeze({
  control_owner: "qianxuesen",
  llm_may_choose_next_step: false,
  route_authority: false,
  winner_authority: false,
  human_owner_required_before_execution: true
});

const SAFETY = Object.freeze({
  production_authority: false,
  executes_work_orders: false,
  writes_persistent_memory: false,
  installs_skills: false,
  calls_model_providers: false,
  calls_external_api: false,
  touches_vps: false,
  starts_services: false,
  changes_route: false,
  changes_winner_authority: false
});

function iso(value) {
  const date = value instanceof Date ? value : new Date(value ?? DEFAULT_NOW);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "runtime-thread")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90) || "runtime-thread";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function eventId(threadId, index) {
  return `${threadId}-${String(index).padStart(4, "0")}`;
}

function nextEventIndex(thread) {
  return (thread.event_log?.length ?? 0) + 1;
}

function latestDecisionEvent(thread) {
  return [...(thread.event_log ?? [])]
    .reverse()
    .find((event) => event.event_type === "human_decision_recorded") ?? null;
}

function hasEvent(thread, eventType) {
  return (thread.event_log ?? []).some((event) => event.event_type === eventType);
}

function decidedEscalationIds(thread) {
  return new Set((thread.event_log ?? [])
    .filter((event) => event.event_type === "human_decision_recorded")
    .map((event) => event.payload?.human_escalation_id)
    .filter(Boolean));
}

function unresolvedEscalationId(thread) {
  const decided = decidedEscalationIds(thread);
  return (thread.business_state?.pending_human_escalation_ids ?? [])
    .find((id) => !decided.has(id)) ?? null;
}

function nextStepSnapshot(step) {
  return {
    step_id: step.step_id,
    step_type: step.step_type,
    reason: step.reason,
    human_escalation_id: step.human_escalation_id
  };
}

function statusForStep(stepType) {
  if (stepType === "pause_for_human") return "paused";
  if (stepType === "complete") return "completed";
  if (stepType === "hold") return "held";
  if (stepType === "error") return "failed";
  return "running";
}

function phaseForStep(stepType) {
  return {
    prepare_context: "launched",
    draft_candidate: "context_ready",
    pause_for_human: "waiting_for_human",
    resume_after_human: "resumed",
    run_local_gate: "local_gate",
    complete: "completed",
    hold: "held",
    error: "failed"
  }[stepType] ?? "launched";
}

function buildStep({
  thread,
  stepType,
  reason,
  inputRefs = [],
  humanEscalationId = null,
  now = DEFAULT_NOW,
  eventCountOffset = 0
}) {
  const eventCount = (thread.event_log?.length ?? 0) + eventCountOffset;
  return {
    schema_version: "misa.next_step.v1",
    mode: "runtime-next-step",
    created_at: iso(now),
    step_id: `next-step-${thread.thread_id}-${String(eventCount).padStart(4, "0")}`,
    step_type: stepType,
    thread_ref: {
      thread_id: thread.thread_id,
      status: statusForStep(stepType),
      event_count: eventCount
    },
    reason,
    input_refs: inputRefs,
    human_escalation_id: humanEscalationId,
    resume_policy: {
      resume_requires_human_event: stepType === "pause_for_human",
      accepted_decisions: stepType === "pause_for_human" ? [...ACCEPTED_HUMAN_DECISIONS] : [],
      replay_from_event_log: true,
      rebuild_context_after_resume: stepType === "pause_for_human" || stepType === "run_local_gate"
    },
    execution: { ...EXECUTION },
    authority: { ...AUTHORITY },
    warnings: [
      "Next step is a deterministic runtime control decision, not execution authority.",
      "The event log can be replayed locally; provider calls, live effects, and VPS touches stay blocked."
    ]
  };
}

export function createAgentThread({
  threadId,
  sourceType = "candidate_generation_context",
  sourceId = null,
  now = DEFAULT_NOW
} = {}) {
  const createdAt = iso(now);
  const id = threadId ?? `runtime-thread-${stableSlug(sourceType)}-${stableSlug(sourceId ?? "default")}`;
  const thread = {
    schema_version: "misa.agent_thread.v1",
    mode: "runtime-thread",
    thread_id: id,
    created_at: createdAt,
    updated_at: createdAt,
    status: "running",
    runtime_policy: { ...RUNTIME_POLICY },
    business_state: {
      source_type: sourceType,
      source_id: sourceId,
      phase: "launched",
      pending_human_escalation_ids: [],
      approved_decision_count: 0,
      completed_step_count: 0,
      last_human_decision: null
    },
    event_log: [],
    latest_next_step: {
      step_id: `next-step-${id}-0000`,
      step_type: "prepare_context",
      reason: "Runtime thread has launched and needs locked context before any candidate work.",
      human_escalation_id: null
    },
    safety: { ...SAFETY },
    warnings: [
      "Runtime thread is a local event log and next-step reducer only.",
      "Pause/resume records authority decisions; it does not grant execution authority."
    ]
  };

  return appendThreadEvent(thread, {
    event_type: "thread_launched",
    actor: "system",
    summary: "Runtime thread launched from a local trigger.",
    refs: { source_id: sourceId },
    payload: { source_type: sourceType }
  }, { now });
}

export function appendThreadEvent(thread, event, { now = DEFAULT_NOW } = {}) {
  const next = clone(thread);
  const eventIndex = nextEventIndex(next);
  const fullEvent = {
    event_id: event.event_id ?? eventId(next.thread_id, eventIndex),
    event_type: event.event_type,
    created_at: iso(event.created_at ?? now),
    actor: event.actor ?? "deterministic_runtime",
    summary: event.summary,
    refs: event.refs ?? {},
    payload: event.payload ?? {}
  };

  next.event_log.push(fullEvent);
  next.updated_at = fullEvent.created_at;

  if (fullEvent.event_type === "candidate_context_ready") {
    next.business_state.phase = "context_ready";
  }

  if (fullEvent.event_type === "human_escalation_requested") {
    const escalationId = fullEvent.refs.human_escalation_id ?? fullEvent.payload.human_escalation_id;
    if (escalationId && !next.business_state.pending_human_escalation_ids.includes(escalationId)) {
      next.business_state.pending_human_escalation_ids.push(escalationId);
    }
    next.business_state.phase = "waiting_for_human";
  }

  if (fullEvent.event_type === "human_decision_recorded") {
    const decision = fullEvent.payload.decision ?? null;
    const escalationId = fullEvent.payload.human_escalation_id ?? fullEvent.refs.human_escalation_id;
    next.business_state.last_human_decision = decision;
    next.business_state.approved_decision_count += ["approve", "choose_executor", "release_safe_mode"].includes(decision) ? 1 : 0;
    next.business_state.pending_human_escalation_ids = next.business_state.pending_human_escalation_ids
      .filter((id) => id !== escalationId);
    next.business_state.phase = decision === "hold" || decision === "reject" ? "held" : "resumed";
  }

  if (fullEvent.event_type === "local_gate_passed") {
    next.business_state.completed_step_count += 1;
    next.business_state.phase = "completed";
  }

  if (fullEvent.event_type === "runtime_error_compacted") {
    next.business_state.phase = "failed";
  }

  return next;
}

export function determineNextStep(thread, { now = DEFAULT_NOW, eventCountOffset = 0 } = {}) {
  const unresolved = unresolvedEscalationId(thread);
  const latestDecision = latestDecisionEvent(thread);
  const latestDecisionValue = latestDecision?.payload?.decision ?? null;

  if (hasEvent(thread, "runtime_error_compacted") || thread.status === "failed") {
    return buildStep({
      thread,
      stepType: "error",
      reason: "A compacted runtime error is present; hold the thread for repair before continuing.",
      inputRefs: ["runtime_error_compacted"],
      now,
      eventCountOffset
    });
  }

  if (unresolved) {
    return buildStep({
      thread,
      stepType: "pause_for_human",
      reason: "A human escalation is pending, so the runtime thread must pause before any execution surface.",
      inputRefs: [unresolved],
      humanEscalationId: unresolved,
      now,
      eventCountOffset
    });
  }

  if (["hold", "reject"].includes(latestDecisionValue)) {
    return buildStep({
      thread,
      stepType: "hold",
      reason: `Human decision '${latestDecisionValue}' keeps the runtime thread held.`,
      inputRefs: [latestDecision?.event_id].filter(Boolean),
      now,
      eventCountOffset
    });
  }

  if (latestDecision && !hasEvent(thread, "local_gate_passed")) {
    return buildStep({
      thread,
      stepType: "run_local_gate",
      reason: "A human decision was recorded; replay the event log and run the local gate before any bounded work continues.",
      inputRefs: [latestDecision.event_id],
      now,
      eventCountOffset
    });
  }

  if (!hasEvent(thread, "candidate_context_ready")) {
    return buildStep({
      thread,
      stepType: "prepare_context",
      reason: "The runtime thread needs a locked candidate context before candidate work can start.",
      now,
      eventCountOffset
    });
  }

  if (!hasEvent(thread, "candidate_reducer_ready")) {
    return buildStep({
      thread,
      stepType: "draft_candidate",
      reason: "Locked context is present; produce deterministic draft candidate surfaces only.",
      inputRefs: ["misa.candidate_generation_context.v1"],
      now,
      eventCountOffset
    });
  }

  return buildStep({
    thread,
    stepType: "complete",
    reason: "Runtime thread has no unresolved human escalation and only local draft surfaces remain.",
    inputRefs: ["misa.factor_candidate_reducer.v1"],
    now,
    eventCountOffset
  });
}

export function recordNextStep(thread, nextStep, { now = DEFAULT_NOW } = {}) {
  const withEvent = appendThreadEvent(thread, {
    event_type: "next_step_determined",
    actor: "deterministic_runtime",
    summary: `Next step is ${nextStep.step_type}.`,
    refs: { step_id: nextStep.step_id },
    payload: {
      step_type: nextStep.step_type,
      human_escalation_id: nextStep.human_escalation_id
    }
  }, { now });

  return {
    ...withEvent,
    status: statusForStep(nextStep.step_type),
    business_state: {
      ...withEvent.business_state,
      phase: phaseForStep(nextStep.step_type)
    },
    latest_next_step: nextStepSnapshot(nextStep)
  };
}

export function buildRuntimeThreadFromPackets({
  candidateContext,
  candidateReducer,
  humanEscalations = [],
  humanDecision = null,
  now = DEFAULT_NOW
} = {}) {
  let thread = createAgentThread({
    sourceType: "candidate_generation_context",
    sourceId: candidateContext?.source?.source_id ?? candidateContext?.mode ?? null,
    now
  });

  thread = appendThreadEvent(thread, {
    event_type: "candidate_context_ready",
    actor: "deterministic_runtime",
    summary: "Candidate context is locked for reducer replay.",
    refs: {
      schema_version: candidateContext?.schema_version ?? "misa.candidate_generation_context.v1",
      source_id: candidateContext?.source?.source_id ?? null
    },
    payload: {
      work_order_count: candidateContext?.work_order_contexts?.length ?? 0,
      runtime_fetch_allowed: candidateContext?.context_policy?.runtime_fetch_allowed ?? false,
      llm_tool_calls_allowed: candidateContext?.context_policy?.llm_tool_calls_allowed ?? false
    }
  }, { now });

  thread = appendThreadEvent(thread, {
    event_type: "candidate_reducer_ready",
    actor: "deterministic_runtime",
    summary: "Candidate reducer produced deterministic draft surfaces.",
    refs: {
      schema_version: candidateReducer?.schema_version ?? "misa.factor_candidate_reducer.v1",
      seed: candidateReducer?.seed ?? null
    },
    payload: {
      candidate_count: candidateReducer?.summary?.candidate_count ?? 0,
      human_escalation_required_count: candidateReducer?.summary?.human_escalation_required_count ?? 0
    }
  }, { now });

  for (const escalation of humanEscalations) {
    thread = appendThreadEvent(thread, {
      event_type: "human_escalation_requested",
      actor: "deterministic_runtime",
      summary: escalation.summary,
      refs: {
        human_escalation_id: escalation.escalation_id,
        trigger_source: escalation.trigger_source
      },
      payload: {
        required_human_decision: escalation.required_human_decision,
        severity: escalation.severity
      }
    }, { now });
  }

  if (humanDecision) {
    const escalation = humanEscalations[0] ?? null;
    thread = appendThreadEvent(thread, {
      event_type: "human_decision_recorded",
      actor: "human_owner",
      summary: `Human decision recorded: ${humanDecision}.`,
      refs: {
        human_escalation_id: escalation?.escalation_id ?? null
      },
      payload: {
        decision: humanDecision,
        human_escalation_id: escalation?.escalation_id ?? null
      }
    }, { now });
  }

  const nextStep = determineNextStep(thread, { now, eventCountOffset: 1 });
  thread = recordNextStep(thread, nextStep, { now });
  return { thread, nextStep };
}

export async function buildDefaultRuntimeThreadReview({
  repoRoot = process.cwd(),
  now = DEFAULT_NOW,
  seed = "runtime-thread-v1",
  humanDecision = null
} = {}) {
  const workOrderRouting = await routeWorkOrders({ repoRoot, now });
  const candidateContext = await buildDefaultCandidateGenerationContext({
    repoRoot,
    workOrderRouting,
    now
  });
  const candidateReducer = buildFactorCandidateReducer({
    candidateContext,
    seed,
    now
  });
  const humanEscalations = humanEscalationsFromWorkOrderRouting(workOrderRouting, { now });
  const { thread, nextStep } = buildRuntimeThreadFromPackets({
    candidateContext,
    candidateReducer,
    humanEscalations,
    humanDecision,
    now
  });

  return {
    schema_version: "misa.runtime_thread_review.v1",
    mode: "runtime-thread-review",
    ok: true,
    created_at: iso(now),
    summary: {
      thread_id: thread.thread_id,
      status: thread.status,
      event_count: thread.event_log.length,
      next_step_type: nextStep.step_type,
      pending_human_escalation_count: thread.business_state.pending_human_escalation_ids.length,
      human_decision_count: thread.event_log.filter((event) => event.event_type === "human_decision_recorded").length
    },
    thread,
    next_step: nextStep,
    safety: { ...SAFETY },
    warnings: [
      "Runtime thread review is local and dry-run only.",
      "Launch/pause/resume semantics are represented as event-log transitions, not live execution."
    ]
  };
}
