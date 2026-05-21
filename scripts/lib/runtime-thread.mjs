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

function candidateResultRefs(candidateReducer) {
  return (candidateReducer?.candidate_results ?? []).map((candidate) => ({
    candidate_id: candidate.candidate_id,
    source_work_order_id: candidate.source_work_order_id,
    generator_id: candidate.generator_id,
    deterministic_fingerprint: candidate.deterministic_fingerprint,
    output_surface: candidate.output_surface,
    execution_allowed: candidate.execution_allowed,
    publication_allowed: candidate.publication_allowed
  }));
}

function initialBusinessState(thread) {
  const launchEvent = (thread.event_log ?? []).find((event) => event.event_type === "thread_launched");
  return {
    source_type: launchEvent?.payload?.source_type ?? thread.business_state?.source_type ?? "candidate_generation_context",
    source_id: launchEvent?.refs?.source_id ?? thread.business_state?.source_id ?? null,
    phase: "launched",
    pending_human_escalation_ids: [],
    approved_decision_count: 0,
    completed_step_count: 0,
    last_human_decision: null
  };
}

function applyBusinessStateEvent(state, event) {
  const next = clone(state);

  if (event.event_type === "candidate_context_ready") {
    next.phase = "context_ready";
  }

  if (event.event_type === "human_escalation_requested") {
    const escalationId = event.refs?.human_escalation_id ?? event.payload?.human_escalation_id;
    if (escalationId && !next.pending_human_escalation_ids.includes(escalationId)) {
      next.pending_human_escalation_ids.push(escalationId);
    }
    next.phase = "waiting_for_human";
  }

  if (event.event_type === "human_decision_recorded") {
    const decision = event.payload?.decision ?? null;
    const escalationId = event.payload?.human_escalation_id ?? event.refs?.human_escalation_id;
    next.last_human_decision = decision;
    next.approved_decision_count += ["approve", "choose_executor", "release_safe_mode"].includes(decision) ? 1 : 0;
    next.pending_human_escalation_ids = next.pending_human_escalation_ids
      .filter((id) => id !== escalationId);
    next.phase = decision === "hold" || decision === "reject" ? "held" : "resumed";
  }

  if (event.event_type === "local_gate_passed") {
    next.completed_step_count += 1;
    next.phase = "completed";
  }

  if (event.event_type === "thread_completed") {
    next.phase = "completed";
  }

  if (event.event_type === "thread_held") {
    next.phase = "held";
  }

  if (event.event_type === "runtime_error_compacted") {
    next.phase = "failed";
  }

  return next;
}

function businessStateFromEvents(thread) {
  return (thread.event_log ?? []).reduce(
    (state, event) => applyBusinessStateEvent(state, event),
    initialBusinessState(thread)
  );
}

function boolCheck(value) {
  return value === true;
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

export function replayRuntimeThread(thread, { now = DEFAULT_NOW } = {}) {
  const replayedBase = {
    ...clone(thread),
    status: "running",
    business_state: businessStateFromEvents(thread)
  };
  const nextStep = determineNextStep(replayedBase, { now });
  const lastEvent = replayedBase.event_log.at(-1) ?? null;
  const replayedThread = {
    ...replayedBase,
    status: statusForStep(nextStep.step_type),
    updated_at: lastEvent?.created_at ?? replayedBase.updated_at,
    business_state: {
      ...replayedBase.business_state,
      phase: phaseForStep(nextStep.step_type)
    },
    latest_next_step: nextStepSnapshot(nextStep)
  };

  return {
    schema_version: "misa.runtime_thread_replay.v1",
    mode: "runtime-thread-replay",
    ok: true,
    replayed_event_count: replayedThread.event_log.length,
    thread: replayedThread,
    next_step: nextStep,
    warnings: [
      "Replay rebuilds thread state from the event log only; it does not execute the next step."
    ]
  };
}

export function evaluateRuntimeLocalGate({
  thread,
  candidateContext,
  candidateReducer,
  now = DEFAULT_NOW
} = {}) {
  const eventTypes = new Set((thread?.event_log ?? []).map((event) => event.event_type));
  const reducerEvent = [...(thread?.event_log ?? [])]
    .reverse()
    .find((event) => event.event_type === "candidate_reducer_ready") ?? null;
  const reducerRefs = candidateResultRefs(candidateReducer);
  const eventReducerRefs = reducerEvent?.payload?.candidate_result_refs ?? [];
  const nextStep = determineNextStep(thread, { now });
  const replayed = replayRuntimeThread(thread, { now });
  const contextPolicy = candidateContext?.context_policy ?? {};
  const reducerPolicy = candidateReducer?.reducer_policy ?? reducerEvent?.payload?.reducer_policy ?? {};
  const candidateRefs = reducerRefs.length ? reducerRefs : eventReducerRefs;
  const candidateCount = candidateReducer?.summary?.candidate_count ?? reducerEvent?.payload?.candidate_count ?? 0;
  const checks = {
    event_log_has_candidate_context: eventTypes.has("candidate_context_ready"),
    event_log_has_candidate_reducer: eventTypes.has("candidate_reducer_ready"),
    candidate_layer_connected: reducerEvent !== null && candidateRefs.length === candidateCount,
    candidate_context_locked: contextPolicy.input_locked === true
      && contextPolicy.runtime_fetch_allowed === false
      && contextPolicy.llm_tool_calls_allowed === false
      && contextPolicy.route_authority === false
      && contextPolicy.winner_authority === false,
    reducer_deterministic: reducerPolicy.same_input_same_seed_same_output === true,
    reducer_no_runtime_fetch: reducerPolicy.runtime_fetch_allowed === false,
    reducer_no_llm_tool_calls: reducerPolicy.llm_tool_calls_allowed === false,
    reducer_no_route_or_winner_authority: reducerPolicy.route_or_winner_authority === false,
    candidate_results_draft_only: candidateRefs.every((candidate) => (
      candidate.output_surface === "draft_candidate_only"
      && candidate.execution_allowed === false
      && candidate.publication_allowed === false
    )),
    resumed_before_local_gate: eventTypes.has("human_decision_recorded")
      && !unresolvedEscalationId(thread)
      && nextStep.step_type === "run_local_gate",
    replay_matches_current_next_step: replayed.next_step.step_type === nextStep.step_type
      && replayed.thread.status === statusForStep(nextStep.step_type),
    no_live_authority: Object.values(thread?.safety ?? {}).every((value) => value === false)
  };
  const ok = Object.values(checks).every(boolCheck);

  return {
    schema_version: "misa.runtime_thread_local_gate.v1",
    mode: "runtime-thread-local-gate",
    ok,
    created_at: iso(now),
    gate_id: `local-gate-${thread?.thread_id ?? "unknown"}-${String((thread?.event_log?.length ?? 0) + 1).padStart(4, "0")}`,
    thread_ref: {
      thread_id: thread?.thread_id ?? null,
      event_count: thread?.event_log?.length ?? 0,
      next_step_type: nextStep.step_type
    },
    summary: {
      candidate_count: candidateCount,
      event_candidate_ref_count: eventReducerRefs.length,
      input_candidate_ref_count: reducerRefs.length,
      failed_check_count: Object.values(checks).filter((value) => value !== true).length
    },
    checks,
    safety: { ...SAFETY },
    warnings: [
      "Local gate checks candidate-layer handoff and replayability only.",
      "Passing the gate does not execute the work order or grant production authority."
    ]
  };
}

export function recordRuntimeErrorSignal(thread, {
  errorType = "runtime_error",
  summary = "Runtime error compacted into the thread event log.",
  refs = {},
  payload = {},
  now = DEFAULT_NOW
} = {}) {
  const errorSignal = {
    error_type: errorType,
    compacted: true,
    execution_allowed: false,
    repair_required: true
  };
  const withError = appendThreadEvent(thread, {
    event_type: "runtime_error_compacted",
    actor: "deterministic_runtime",
    summary,
    refs: {
      error_type: errorType,
      ...refs
    },
    payload: {
      ...errorSignal,
      ...payload
    }
  }, { now });
  const nextStep = determineNextStep(withError, { now, eventCountOffset: 1 });
  const recorded = recordNextStep(withError, nextStep, { now });

  return {
    thread: recorded,
    nextStep,
    errorSignal
  };
}

export function recordRuntimeLocalGate(thread, {
  candidateContext,
  candidateReducer,
  now = DEFAULT_NOW
} = {}) {
  const gate = evaluateRuntimeLocalGate({
    thread,
    candidateContext,
    candidateReducer,
    now
  });

  if (!gate.ok) {
    const failedChecks = Object.entries(gate.checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    return {
      ...recordRuntimeErrorSignal(thread, {
        errorType: "local_gate_failed",
        summary: "Runtime local gate failed; thread must stop for repair.",
        payload: {
          gate_id: gate.gate_id,
          failed_checks: failedChecks,
          gate
        },
        now
      }),
      gate
    };
  }

  const withGate = appendThreadEvent(thread, {
    event_type: "local_gate_passed",
    actor: "deterministic_runtime",
    summary: "Runtime local gate passed for replayed candidate-layer handoff.",
    refs: {
      gate_id: gate.gate_id
    },
    payload: gate
  }, { now });
  const nextStep = determineNextStep(withGate, { now, eventCountOffset: 1 });
  const recorded = recordNextStep(withGate, nextStep, { now });

  return {
    thread: recorded,
    nextStep,
    gate
  };
}

export function buildRuntimeThreadFromPackets({
  candidateContext,
  candidateReducer,
  humanEscalations = [],
  humanDecision = null,
  runLocalGate = false,
  runtimeError = null,
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
      human_escalation_required_count: candidateReducer?.summary?.human_escalation_required_count ?? 0,
      candidate_result_refs: candidateResultRefs(candidateReducer),
      reducer_policy: {
        same_input_same_seed_same_output: candidateReducer?.reducer_policy?.same_input_same_seed_same_output ?? false,
        runtime_fetch_allowed: candidateReducer?.reducer_policy?.runtime_fetch_allowed ?? null,
        llm_tool_calls_allowed: candidateReducer?.reducer_policy?.llm_tool_calls_allowed ?? null,
        route_or_winner_authority: candidateReducer?.reducer_policy?.route_or_winner_authority ?? null
      }
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

  let currentNextStep = nextStep;
  let localGate = null;
  let errorSignal = null;

  if (runLocalGate) {
    const gateResult = recordRuntimeLocalGate(thread, {
      candidateContext,
      candidateReducer,
      now
    });
    thread = gateResult.thread;
    currentNextStep = gateResult.nextStep;
    localGate = gateResult.gate;
    errorSignal = gateResult.errorSignal ?? null;
  }

  if (runtimeError) {
    const errorResult = recordRuntimeErrorSignal(thread, {
      ...(typeof runtimeError === "object" ? runtimeError : { errorType: String(runtimeError) }),
      now
    });
    thread = errorResult.thread;
    currentNextStep = errorResult.nextStep;
    errorSignal = errorResult.errorSignal;
  }

  return {
    thread,
    nextStep: currentNextStep,
    localGate,
    errorSignal
  };
}

export async function buildDefaultRuntimeThreadReview({
  repoRoot = process.cwd(),
  now = DEFAULT_NOW,
  seed = "runtime-thread-v1",
  humanDecision = null,
  runLocalGate = false,
  runtimeError = null
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
    runLocalGate,
    runtimeError,
    now
  });
  const replay = replayRuntimeThread(thread, { now });

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
      human_decision_count: thread.event_log.filter((event) => event.event_type === "human_decision_recorded").length,
      local_gate_passed_count: thread.event_log.filter((event) => event.event_type === "local_gate_passed").length,
      runtime_error_count: thread.event_log.filter((event) => event.event_type === "runtime_error_compacted").length,
      replay_next_step_type: replay.next_step.step_type
    },
    thread,
    next_step: nextStep,
    replay,
    safety: { ...SAFETY },
    warnings: [
      "Runtime thread review is local and dry-run only.",
      "Launch/pause/resume semantics are represented as event-log transitions, not live execution."
    ]
  };
}
