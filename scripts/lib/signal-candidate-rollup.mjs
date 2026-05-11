import { simulateMisaLearning } from "./learning-loop.mjs";
import { reviewAdaptiveCandidateGate } from "./adaptive-candidate-gate.mjs";
import { reviewSignalIntakeContract } from "./signal-intake-contract.mjs";

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

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function countBy(values, selector) {
  const counts = Object.fromEntries(ROUTES.map((route) => [route, 0]));

  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function makeCheck(id, ok, reason) {
  return { id, ok, reason };
}

function contractById(contract) {
  return new Map(contract.source_contracts.map((source) => [source.id, source]));
}

function sourceContractForTrace(trace, contracts) {
  const signals = trace.observe.signals ?? [];
  const toolErrors = trace.artifact_evidence.tool_errors ?? [];

  if (trace.observe.channel === "farcaster") {
    return contracts.get("farcaster_behavior");
  }

  if (
    toolErrors.length > 0
    || signals.includes("single_failure")
    || signals.includes("repeated_failure_pattern")
    || signals.includes("candidate_replay_failed")
  ) {
    return contracts.get("session_distiller_failure");
  }

  return contracts.get("session_distiller_success");
}

function queueStateFor(candidate) {
  if (candidate.decision === "validation_ready") return "ready_for_daily_rollup";
  if (candidate.decision === "held_for_more_evidence") return "watch_for_more_evidence";
  return "rejected_suppression";
}

function priorityFor(trace, candidate) {
  if (candidate.decision === "rejected") return "low";
  if (trace.observe.risk_level === "high" || candidate.route_target === "policy") return "high";
  if (candidate.decision === "validation_ready") return "medium";
  return "low";
}

function buildAdaptedSignal({ trace, candidate, sourceContract }) {
  return {
    signal_id: `signal-${trace.source_event_id}`,
    source_event_id: trace.source_event_id,
    source_cycle_id: trace.cycle_id,
    source_contract_id: sourceContract.id,
    channel: sourceContract.channel,
    adapter: {
      default_input: sourceContract.read_policy.default_input,
      raw_lookup: sourceContract.read_policy.raw_lookup,
      full_raw_default: sourceContract.read_policy.full_raw_default
    },
    cadence: {
      scan_interval_minutes: sourceContract.scan_interval_minutes,
      durable_learning_rollup: sourceContract.learning_policy.durable_learning_rollup,
      immediate_exception_queue: sourceContract.learning_policy.immediate_exception_queue
    },
    normalized_signals: uniqueStrings([
      ...trace.observe.signals,
      ...candidate.generated_signals
    ]),
    route_target: candidate.route_target,
    evidence: {
      evidence_count: trace.observe.evidence_count,
      risk_level: trace.observe.risk_level,
      redaction_status: trace.observe.redaction_status,
      positive_value: trace.result.positive_value
    },
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF }
    }
  };
}

function buildSignalAdapters(adaptedSignals, intakeContract) {
  return intakeContract.source_contracts.map((source) => {
    const mapped = adaptedSignals.filter((signal) => signal.source_contract_id === source.id);

    return {
      source_contract_id: source.id,
      channel: source.channel,
      intake_mode: source.intake_mode,
      input_surface: source.read_policy.default_input,
      raw_lookup: source.read_policy.raw_lookup,
      full_raw_default: source.read_policy.full_raw_default,
      scan_interval_minutes: source.scan_interval_minutes,
      durable_learning_rollup: source.learning_policy.durable_learning_rollup,
      immediate_exception_queue: source.learning_policy.immediate_exception_queue,
      mapped_signal_count: mapped.length
    };
  });
}

function buildQueueItem({ candidate, trace }) {
  return {
    queue_id: `queue-${candidate.source_event_id}`,
    candidate_id: candidate.candidate_id,
    source_signal_id: `signal-${candidate.source_event_id}`,
    route_target: candidate.route_target,
    decision: candidate.decision,
    queue_state: queueStateFor(candidate),
    priority: priorityFor(trace, candidate),
    scheduled_rollup: "daily",
    verification_required: candidate.verification.enters_verification,
    verification_commands: candidate.verification.commands,
    approval_required_for_production: true,
    suppression_applied: candidate.suppression.applied,
    production_authority: false
  };
}

function summarizeDailyRollup(items, adaptedSignals) {
  const ready = items.filter((item) => item.queue_state === "ready_for_daily_rollup");
  const held = items.filter((item) => item.queue_state === "watch_for_more_evidence");
  const rejected = items.filter((item) => item.queue_state === "rejected_suppression");

  return {
    rollup_id: "qianxuesen-daily-local-rollup",
    window_hours: 24,
    cadence_source: "misa.signal_intake_contract.v1",
    candidate_counts: {
      ready_for_daily_rollup: ready.length,
      watch_for_more_evidence: held.length,
      rejected_suppression: rejected.length
    },
    route_counts: countBy(items, (item) => item.route_target),
    source_contract_counts: countBy(adaptedSignals, (signal) => signal.route_target),
    included_candidate_ids: ready.map((item) => item.candidate_id),
    held_candidate_ids: held.map((item) => item.candidate_id),
    rejected_candidate_ids: rejected.map((item) => item.candidate_id),
    next_actions: [
      "Keep validation-ready candidates in local validation only.",
      "Hold thin candidates until the next signal scan or daily rollup.",
      "Keep rejected candidates as suppression evidence, not publication evidence.",
      "Ask Huan before durable memory, policy, persona, VPS, service, or public-channel changes."
    ],
    durable_outputs: {
      memory_candidates: items.filter((item) => item.route_target === "memory").length,
      skill_candidates: items.filter((item) => item.route_target === "skill").length,
      case_candidates: items.filter((item) => item.route_target === "case").length,
      policy_candidates: items.filter((item) => item.route_target === "policy").length,
      publication_allowed: false,
      writes_persistent_memory: false
    }
  };
}

function evaluateRollup({ intakeContract, adaptiveGate, signalAdapters, adaptedSignals, queueItems, dailyRollup }) {
  const checks = [];
  const violations = [
    ...intakeContract.violations,
    ...adaptiveGate.violations
  ];

  checks.push(makeCheck(
    "source_adapters_cover_all_contracts",
    signalAdapters.every((adapter) => adapter.mapped_signal_count > 0),
    "The v0.10 adapter layer must exercise chat success, failure-log, and Farcaster signal contracts."
  ));
  checks.push(makeCheck(
    "queue_contains_every_adapted_signal",
    queueItems.length === adaptedSignals.length,
    "Every adapted signal must enter exactly one candidate queue item."
  ));
  checks.push(makeCheck(
    "daily_rollup_is_24_hours",
    dailyRollup.window_hours === 24,
    "Durable learning stays on the daily rollup cadence."
  ));
  checks.push(makeCheck(
    "ready_candidates_have_verification",
    queueItems
      .filter((item) => item.queue_state === "ready_for_daily_rollup")
      .every((item) => item.verification_required && item.verification_commands.includes("npm run rollup:misa")),
    "Validation-ready candidates must require the local v0.10 rollup check."
  ));
  checks.push(makeCheck(
    "held_and_rejected_do_not_enter_publication",
    queueItems
      .filter((item) => item.queue_state !== "ready_for_daily_rollup")
      .every((item) => !item.production_authority && item.approval_required_for_production),
    "Held and rejected candidates remain queue evidence only."
  ));
  checks.push(makeCheck(
    "farcaster_remains_pooled_daily_learning",
    adaptedSignals
      .filter((signal) => signal.source_contract_id === "farcaster_behavior")
      .every((signal) => signal.cadence.durable_learning_rollup === "daily"),
    "Farcaster feedback is pooled into daily learning, not learned per cast."
  ));
  checks.push(makeCheck(
    "production_authority_is_false",
    !Object.values(LIVE_EFFECTS_OFF).some(Boolean),
    "The v0.10 closed loop has no live effects."
  ));

  for (const check of checks) {
    if (!check.ok) {
      violations.push(check.reason);
    }
  }

  if (dailyRollup.durable_outputs.publication_allowed) {
    violations.push("Daily rollup unexpectedly allows publication.");
  }

  if (dailyRollup.durable_outputs.writes_persistent_memory) {
    violations.push("Daily rollup unexpectedly writes persistent memory.");
  }

  return { checks, violations };
}

export async function reviewSignalCandidateRollup({ repoRoot = process.cwd() } = {}) {
  const intakeContract = reviewSignalIntakeContract();
  const adaptiveGate = await reviewAdaptiveCandidateGate({ repoRoot });
  const simulation = await simulateMisaLearning({ repoRoot });
  const contracts = contractById(intakeContract);
  const traceByEvent = new Map(simulation.traces.map((trace) => [trace.source_event_id, trace]));
  const adaptedSignals = [];
  const queueItems = [];

  for (const candidate of adaptiveGate.candidates) {
    const trace = traceByEvent.get(candidate.source_event_id);
    if (!trace) {
      continue;
    }

    const sourceContract = sourceContractForTrace(trace, contracts);
    adaptedSignals.push(buildAdaptedSignal({ trace, candidate, sourceContract }));
    queueItems.push(buildQueueItem({ candidate, trace }));
  }

  const signalAdapters = buildSignalAdapters(adaptedSignals, intakeContract);
  const dailyRollup = summarizeDailyRollup(queueItems, adaptedSignals);
  const evaluation = evaluateRollup({
    intakeContract,
    adaptiveGate,
    signalAdapters,
    adaptedSignals,
    queueItems,
    dailyRollup
  });

  return {
    schema_version: "misa.signal_candidate_rollup.v1",
    mode: "signal-candidate-daily-rollup",
    ok: evaluation.violations.length === 0,
    source: {
      intake_contract_mode: intakeContract.mode,
      adaptive_gate_mode: adaptiveGate.mode,
      simulation_mode: simulation.mode
    },
    summary: {
      adapted_signal_count: adaptedSignals.length,
      queue_item_count: queueItems.length,
      daily_rollup_window_hours: dailyRollup.window_hours,
      validation_ready_count: queueItems.filter((item) => item.queue_state === "ready_for_daily_rollup").length,
      held_count: queueItems.filter((item) => item.queue_state === "watch_for_more_evidence").length,
      rejected_count: queueItems.filter((item) => item.queue_state === "rejected_suppression").length,
      production_authority: false
    },
    signal_adapters: signalAdapters,
    adapted_signals: adaptedSignals,
    candidate_queue: {
      queue_policy: {
        source: "v0.10 local closed loop",
        enqueue_all_adapted_signals: true,
        durable_learning_rollup: "daily",
        production_authority: false,
        approval_required_for_production: true
      },
      items: queueItems
    },
    daily_rollup: dailyRollup,
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    },
    checks: evaluation.checks,
    warnings: [
      "This is a local closed-loop report only; it does not create timers, call providers, publish Farcaster posts, write memory, or update VPS.",
      "The queue is a review surface, not a background worker."
    ],
    violations: evaluation.violations
  };
}
