import { simulateLearningCycle } from "./learning-loop.mjs";

const LIVE_EFFECTS_OFF = {
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
};

const BLOCKED_OPERATIONS = [
  "automatic_agents_md_write",
  "automatic_memory_write",
  "automatic_skill_installation",
  "automatic_context_injection",
  "memory_provider_takeover",
  "llm_owned_learning_route",
  "production_runtime_mutation",
  "public_channel_send",
  "vps_or_service_change"
];

const ROUTE_VOCAB = ["memory", "skill", "case", "policy", "damping", "ignore"];

const READ_TOOLS = new Set([
  "read_file",
  "grep",
  "find",
  "ls",
  "memory_search",
  "memory_get",
  "memory_smart_search",
  "memory_context",
  "memory_verify"
]);
const WRITE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "save_json",
  "apply_patch",
  "patch",
  "replace_file",
  "create_file",
  "file_write",
  "write",
  "edit",
  "append_file"
]);
const RUNTIME_TOOLS = new Set(["bash", "process_kill"]);

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function eventType(event) {
  return String(event.type ?? event.event_type ?? "").trim().toLowerCase();
}

function eventTool(event) {
  return String(event.tool ?? event.tool_name ?? event.action ?? "").trim();
}

function eventPath(event) {
  return String(event.path ?? event.file ?? event.target_path ?? event.metadata?.path ?? "").trim();
}

function eventText(event) {
  const metadata = event.metadata ?? {};
  return [
    eventType(event),
    eventTool(event),
    eventPath(event),
    event.hook_type,
    event.hookType,
    metadata.hook_type,
    metadata.hookType,
    metadata.endpoint,
    metadata.memory_provider,
    metadata.provider,
    metadata.config,
    metadata.context_destination,
    event.description,
    event.error,
    event.command,
    event.message
  ].map((item) => String(item ?? "")).join(" ").toLowerCase();
}

function stableSlug(value) {
  return String(value ?? "omniagent-footprint")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "omniagent-footprint";
}

function normalizeEvents(footprint) {
  return Array.isArray(footprint?.events) ? footprint.events : [];
}

function inferInputProfile(footprint) {
  const raw = [
    footprint?.metadata?.input_profile,
    footprint?.input_profile,
    footprint?.schema_version,
    footprint?.source_type,
    footprint?.task_type
  ].map((item) => String(item ?? "").toLowerCase()).join(" ");

  return /agentmemory/.test(raw)
    ? "agentmemory_footprint_profile"
    : "omniagent_footprint_profile";
}

function inferSourceId(footprint) {
  return footprint?.source_id ?? footprint?.session_id ?? "omniagent-footprint";
}

function inferSessionId(footprint, events) {
  return footprint?.session_id
    ?? events.find((event) => event.session_id)?.session_id
    ?? inferSourceId(footprint);
}

function inferCreatedAt(footprint, events, now) {
  return footprint?.created_at
    ?? events.find((event) => event.timestamp)?.timestamp
    ?? now.toISOString();
}

function inferChannel(footprint) {
  const channel = footprint?.metadata?.channel ?? footprint?.channel ?? "local";
  return ["discord", "farcaster", "agentmail", "local", "other"].includes(channel) ? channel : "other";
}

function inferTaskType(footprint) {
  return footprint?.metadata?.task_type ?? footprint?.task_type ?? "external-agent-footprint";
}

function inferTaskSummary(footprint, events) {
  return footprint?.task
    ?? events.find((event) => event.task)?.task
    ?? events.find((event) => event.prompt)?.prompt
    ?? "OmniAgent execution footprint";
}

function inferOutcome(footprint, events) {
  if (footprint?.outcome) return footprint.outcome;
  const end = [...events].reverse().find((event) => eventType(event) === "agent_end");
  if (!end) return "unknown";
  if (end.success === true || end.status === "success") return "success";
  if (end.success === false || end.status === "failure") return "failure";
  return "unknown";
}

function inferOccurrenceCount(footprint) {
  const raw = footprint?.occurrence_count ?? footprint?.metadata?.occurrence_count ?? footprint?.metadata?.evidence_count;
  const count = Number.parseInt(String(raw ?? "1"), 10);
  return Number.isFinite(count) && count >= 0 ? count : 1;
}

function isToolEnd(event) {
  const type = eventType(event);
  return type === "tool_execution_end" || type === "tool_end" || type === "action_end";
}

function isToolSuccess(event) {
  if (event.success === false || event.status === "failure" || event.status === "error") return false;
  return true;
}

function isWriteLikeEvent(event) {
  const tool = eventTool(event).toLowerCase();
  const text = eventText(event);
  return WRITE_TOOLS.has(tool)
    || /\b(apply_patch|patch|replace|create|append|write|edit|save)\b/.test(text);
}

function isAutoAgentsMdWrite(event) {
  const text = eventText(event);
  return /agents\.md/.test(text)
    && (isWriteLikeEvent(event) || /(promot|learned rule|rule)/.test(text));
}

function isAutoMemoryWrite(event) {
  const text = eventText(event);
  if (/memory_write|persistent_memory|memory_save|on_memory_write|agentmemory\/remember|mem::remember|remember endpoint|remember tool/.test(text)) return true;
  return /(memory\.db|zilliz)/.test(text) && isWriteLikeEvent(event);
}

function isAutoSkillWrite(event) {
  const text = eventText(event);
  if (/(skill_compiled|skill_install|publish.*skill|trial skill)/.test(text)) return true;
  return /(\.omniagent[\\/]+skills|skill\.md)/.test(text) && isWriteLikeEvent(event);
}

function isPublicSend(event) {
  const text = eventText(event);
  return /(farcaster|discord|telegram|feishu|public|post|send_message|publish)/.test(text)
    && /(send|publish|post)/.test(text);
}

function isRuntimeMutation(event) {
  const text = eventText(event);
  return /(vps|systemd|service|timer|provider_route|env|credential|process_kill)/.test(text)
    && /(change|start|stop|restart|kill|write|update|mutate)/.test(text);
}

function isContextInjectionRisk(event) {
  const text = eventText(event);
  return /agentmemory_inject_context=true/.test(text)
    || /system_prompt_block|on_pre_compress|pre[-_ ]?llm|pre[-_ ]?compact/.test(text)
    || /(prefetch|inject|injected|recall_context|context packet|context_packet|memory_context|agentmemory\/context)/.test(text)
      && /(prompt|context|llm|system)/.test(text);
}

function isMemoryProviderTakeoverRisk(event) {
  const text = eventText(event);
  return /memory\.provider[:= ]+agentmemory/.test(text)
    || /memory_provider[:= ]+agentmemory/.test(text)
    || /provider[:= ]+agentmemory/.test(text) && /memory/.test(text)
    || /integrations[\\/]hermes|agentmemory plugin|hermes agentmemory plugin/.test(text)
    || /on_memory_write|memory_save|agentmemory\/remember|mem::remember|remember endpoint|remember tool/.test(text)
    || /(replace|replac|takeover|switch|set|enable|install|mirror|sync).{0,80}(memory provider|agentmemory|memory\.md|user\.md)/.test(text);
}

function inferRiskLevel(events, autoWriteIndicators) {
  if (
    autoWriteIndicators.public_send
    || autoWriteIndicators.runtime_mutation
    || autoWriteIndicators.memory_provider_takeover
  ) return "critical";
  if (
    autoWriteIndicators.agents_md_write
    || autoWriteIndicators.memory_write
    || autoWriteIndicators.skill_write
    || autoWriteIndicators.context_injection
  ) {
    return "high";
  }
  if (events.some((event) => RUNTIME_TOOLS.has(eventTool(event)))) return "medium";
  return "low";
}

function collectToolStats(events) {
  const toolNames = events
    .filter((event) => eventTool(event))
    .map(eventTool);
  const ended = events.filter(isToolEnd);
  const failed = ended.filter((event) => !isToolSuccess(event));
  const successfulTools = ended.filter(isToolSuccess).map(eventTool).filter(Boolean);

  return {
    tools_used: uniqueStrings(toolNames),
    successful_tools: successfulTools,
    failed_tools: failed.map(eventTool).filter(Boolean),
    tool_errors: uniqueStrings(failed.map((event) => event.error ?? `${eventTool(event)} failed`)),
    read_tool_count: successfulTools.filter((tool) => READ_TOOLS.has(tool)).length,
    write_tool_count: successfulTools.filter((tool) => WRITE_TOOLS.has(tool)).length,
    runtime_tool_count: successfulTools.filter((tool) => RUNTIME_TOOLS.has(tool)).length
  };
}

function collectAutoWriteIndicators(events) {
  const contextInjection = events.some(isContextInjectionRisk);
  const memoryProviderTakeover = events.some(isMemoryProviderTakeoverRisk);
  return {
    agents_md_write: events.some(isAutoAgentsMdWrite),
    memory_write: events.some(isAutoMemoryWrite),
    skill_write: events.some(isAutoSkillWrite),
    public_send: events.some(isPublicSend),
    runtime_mutation: events.some(isRuntimeMutation) || memoryProviderTakeover,
    context_injection: contextInjection,
    memory_provider_takeover: memoryProviderTakeover
  };
}

function collectArtifactEvidence(events, toolStats, autoWriteIndicators) {
  const read = [];
  const modified = [];
  const injected = [];

  for (const event of events) {
    const type = eventType(event);
    const tool = eventTool(event);
    const path = eventPath(event);

    if (/skill_(loaded|injected)|context_injected/.test(type)) {
      injected.push(`skill:${stableSlug(event.skill ?? event.name ?? "omniagent-context")}`);
    }
    if (READ_TOOLS.has(tool) && /skill|SKILL\.md/i.test(path)) {
      read.push(`skill:${stableSlug(path || "omniagent-skill-read")}`);
    }
    if (WRITE_TOOLS.has(tool) && /skill|SKILL\.md|\.omniagent[\\/]+skills/i.test(path)) {
      modified.push(`skill:${stableSlug(path || "omniagent-skill-write")}`);
    }
  }

  if (autoWriteIndicators.agents_md_write) modified.push("policy:omniagent-agents-md-auto-promotion");
  if (autoWriteIndicators.memory_write) modified.push("memory:omniagent-automatic-memory-write");
  if (autoWriteIndicators.skill_write) modified.push("skill:omniagent-automatic-skill-write");
  if (autoWriteIndicators.context_injection) injected.push("context:agentmemory-context-injection-risk");
  if (autoWriteIndicators.memory_provider_takeover) modified.push("policy:agentmemory-memory-provider-takeover");

  return {
    injected: uniqueStrings(injected),
    read: uniqueStrings(read),
    modified: uniqueStrings(modified),
    tool_errors: uniqueStrings(toolStats.tool_errors)
  };
}

function refFromRecallHit(hit) {
  const refs = [];
  if (hit?.obs_id) refs.push(`agentmemory:observation:${hit.obs_id}`);
  if (hit?.observation_id) refs.push(`agentmemory:observation:${hit.observation_id}`);
  if (hit?.session_id) refs.push(`agentmemory:session:${hit.session_id}`);
  if (hit?.memory_id) refs.push(`agentmemory:memory:${hit.memory_id}`);
  if (hit?.context_id) refs.push(`agentmemory:context_packet:${hit.context_id}`);
  if (hit?.context_packet_id) refs.push(`agentmemory:context_packet:${hit.context_packet_id}`);
  return refs;
}

function collectSourceRefs({ footprint, events, sourceId }) {
  const refs = [
    ...(Array.isArray(footprint?.source_refs) ? footprint.source_refs : [])
  ];

  for (const event of events) {
    refs.push(...(Array.isArray(event.source_refs) ? event.source_refs : []));
    refs.push(...(Array.isArray(event.metadata?.source_refs) ? event.metadata.source_refs : []));
    if (event.obs_id) refs.push(`agentmemory:observation:${event.obs_id}`);
    if (event.observation_id) refs.push(`agentmemory:observation:${event.observation_id}`);
    if (event.session_id) refs.push(`agentmemory:session:${event.session_id}`);
    if (event.context_packet_id) refs.push(`agentmemory:context_packet:${event.context_packet_id}`);
    if (event.metadata?.context_packet_id) refs.push(`agentmemory:context_packet:${event.metadata.context_packet_id}`);
    if (Array.isArray(event.metadata?.recall_hits)) {
      refs.push(...event.metadata.recall_hits.flatMap(refFromRecallHit));
    }
  }

  return uniqueStrings([`omniagent-footprint:${sourceId}`, ...refs]);
}

function isAgentMemorySpecificRef(ref) {
  return /^agentmemory:(observation|session|memory|context_packet):/.test(String(ref));
}

function isExternalFootprintRef(ref) {
  return /^agentmemory:/.test(String(ref)) || /^omniagent-footprint:/.test(String(ref));
}

function isInternalCorroborationRef(ref) {
  return /^(hermes|zilliz|local|repo|test|session-distiller|journal|chunk):/.test(String(ref));
}

function buildProvenanceGate({ inputProfile, sourceRefs }) {
  const hasAgentMemoryProvenance = sourceRefs.some(isAgentMemorySpecificRef);
  const hasInternalCorroboration = sourceRefs.some(isInternalCorroborationRef);
  const externalOnly = sourceRefs.length > 0 && sourceRefs.every(isExternalFootprintRef);
  const agentmemoryProfile = inputProfile === "agentmemory_footprint_profile";
  const passed = !agentmemoryProfile || hasAgentMemoryProvenance || hasInternalCorroboration;

  return {
    gate: "footprint_provenance_gate",
    state: passed ? "passed" : "held",
    source_ref_count: sourceRefs.length,
    has_agentmemory_provenance: hasAgentMemoryProvenance,
    has_internal_corroboration: hasInternalCorroboration,
    external_only: externalOnly
  };
}

function inferSignals({ outcome, occurrenceCount, toolStats, autoWriteIndicators, inputProfile, provenanceGate }) {
  const signals = [];
  const hasAutoWrite = Object.values(autoWriteIndicators).some(Boolean);
  const hasUsefulToolSequence = toolStats.successful_tools.length >= 2
    && (toolStats.read_tool_count > 0 || toolStats.write_tool_count > 0);

  if (autoWriteIndicators.public_send) signals.push("public_posting_boundary");
  if (autoWriteIndicators.context_injection) signals.push("context_injection_risk");
  if (autoWriteIndicators.memory_provider_takeover) signals.push("memory_provider_takeover_risk");
  if (
    autoWriteIndicators.agents_md_write
    || autoWriteIndicators.memory_write
    || autoWriteIndicators.skill_write
    || autoWriteIndicators.runtime_mutation
    || autoWriteIndicators.context_injection
    || autoWriteIndicators.memory_provider_takeover
  ) {
    signals.push("explicit_user_boundary");
  }

  if (
    inputProfile === "agentmemory_footprint_profile"
    && provenanceGate.state === "held"
    && !autoWriteIndicators.context_injection
    && !autoWriteIndicators.memory_provider_takeover
  ) {
    signals.push("avoid_overreaction");
  }

  if (outcome === "failure" || toolStats.tool_errors.length > 0) {
    if (occurrenceCount >= 2 || toolStats.tool_errors.length >= 2) {
      signals.push("repeated_failure_pattern");
    } else {
      signals.push("single_failure", "avoid_overreaction");
    }
  }

  if (!hasAutoWrite && outcome === "success" && hasUsefulToolSequence) {
    signals.push("reusable_workflow");
    if (occurrenceCount < 2) {
      signals.push("avoid_overreaction");
    }
  }

  if (signals.length === 0) {
    signals.push("single_failure", "avoid_overreaction");
  }

  return uniqueStrings(signals);
}

function expectationFromTrace(trace) {
  return {
    expected_route: trace.route.target,
    expected_status: trace.result.status,
    expected_publication_mode: trace.route.publication_mode,
    expected_candidate_state: trace.candidate_review.state
  };
}

function buildLearningEvent({ footprint, events, now }) {
  const sourceId = inferSourceId(footprint);
  const inputProfile = inferInputProfile(footprint);
  const sessionId = inferSessionId(footprint, events);
  const createdAt = inferCreatedAt(footprint, events, now);
  const outcome = inferOutcome(footprint, events);
  const occurrenceCount = inferOccurrenceCount(footprint);
  const toolStats = collectToolStats(events);
  const autoWriteIndicators = collectAutoWriteIndicators(events);
  const riskLevel = inferRiskLevel(events, autoWriteIndicators);
  const artifactEvidence = collectArtifactEvidence(events, toolStats, autoWriteIndicators);
  const sourceRefs = collectSourceRefs({ footprint, events, sourceId });
  const provenanceGate = buildProvenanceGate({ inputProfile, sourceRefs });
  const signals = inferSignals({
    outcome,
    occurrenceCount,
    toolStats,
    autoWriteIndicators,
    inputProfile,
    provenanceGate
  });
  const base = {
    event_id: `omniagent-${stableSlug(sourceId)}`,
    channel: inferChannel(footprint),
    summary: `OmniAgent footprint: ${inferTaskSummary(footprint, events)}`,
    signals,
    evidence_count: occurrenceCount,
    outcome,
    risk_level: riskLevel,
    redaction_status: footprint?.redaction_status ?? "redacted",
    source_type: footprint?.source_type ?? "synthetic",
    redaction_note: footprint?.redaction_note ?? "External event footprint only; raw private content is not required.",
    setpoint: "Use OmniAgent-style execution footprints as evidence only; Qianxuesen owns route and promotion decisions.",
    artifact_evidence: artifactEvidence,
    source_id: String(sourceId),
    source_refs: sourceRefs,
    expected_route: "ignore",
    expected_status: "rejected",
    expected_publication_mode: "no_publish",
    expected_candidate_state: "rejected",
    created_at: createdAt
  };

  const trace = simulateLearningCycle(base);
  const expected = expectationFromTrace(trace);
  const learningEvent = { ...base, ...expected };

  return {
    learningEvent,
    trace: simulateLearningCycle(learningEvent),
    toolStats,
    autoWriteIndicators,
    inputProfile,
    provenanceGate
  };
}

export function evaluateOmniAgentFootprintBridge(result) {
  const violations = [];

  if (result.control_boundary?.route_owner !== "qianxuesen") {
    violations.push("route_owner_must_remain_qianxuesen");
  }
  if (result.control_boundary?.footprint_role !== "sensor_input_only") {
    violations.push("footprint_role_must_be_sensor_input_only");
  }
  if (result.control_boundary?.llm_route_decision_allowed !== false) {
    violations.push("llm_route_decision_must_be_false");
  }
  if (result.control_boundary?.automatic_promotion_allowed !== false) {
    violations.push("automatic_promotion_must_be_false");
  }
  for (const [field, value] of Object.entries(result.safety?.live_effects ?? {})) {
    if (value !== false) {
      violations.push(`${field}_must_be_false`);
    }
  }
  if (!ROUTE_VOCAB.includes(result.route_summary?.selected_route)) {
    violations.push("selected_route_unknown");
  }
  if (result.omniagent_borrowed?.automatic_writes_imported !== false) {
    violations.push("automatic_writes_must_not_be_imported");
  }
  if (result.omniagent_borrowed?.auto_agents_md_promotion_imported !== false) {
    violations.push("agents_md_promotion_must_not_be_imported");
  }
  if (result.omniagent_borrowed?.auto_memory_write_imported !== false) {
    violations.push("memory_write_must_not_be_imported");
  }
  if (result.omniagent_borrowed?.auto_skill_install_imported !== false) {
    violations.push("skill_install_must_not_be_imported");
  }
  if (result.omniagent_borrowed?.llm_route_decision_imported !== false) {
    violations.push("llm_route_decision_must_not_be_imported");
  }
  if (result.source?.raw_private_content_persisted === true) {
    violations.push("raw_private_content_must_not_be_persisted");
  }

  return violations;
}

export function reviewOmniAgentFootprintBridge({
  footprint = {},
  now = new Date("2026-05-13T00:00:00Z")
} = {}) {
  const events = normalizeEvents(footprint);
  const sourceId = inferSourceId(footprint);
  const { learningEvent, trace, toolStats, autoWriteIndicators, inputProfile, provenanceGate } = buildLearningEvent({
    footprint,
    events,
    now
  });
  const autoWriteSeen = Object.values(autoWriteIndicators).some(Boolean);
  const warnings = [];

  if (autoWriteSeen) {
    warnings.push("OmniAgent automatic write or public/runtime side effect appeared in the footprint; bridge keeps it as policy evidence only.");
  }
  if (learningEvent.signals.includes("avoid_overreaction")) {
    warnings.push("Bridge held thin evidence through damping instead of promoting from one footprint.");
  }
  if (provenanceGate.state === "held") {
    warnings.push("Agentmemory footprint lacks recall provenance; bridge keeps it as low-trust evidence.");
  }

  const result = {
    schema_version: "misa.omniagent_footprint_bridge.v1",
    mode: "omniagent-footprint-bridge",
    ok: true,
    created_at: now.toISOString(),
    source: {
      source_id: String(sourceId),
      event_count: events.length,
      session_id: inferSessionId(footprint, events),
      channel: learningEvent.channel,
      task_type: inferTaskType(footprint),
      input_profile: inputProfile,
      occurrence_count: inferOccurrenceCount(footprint),
      raw_private_content_persisted: footprint?.raw_private_content_persisted === true
    },
    omniagent_borrowed: {
      event_bus_lifecycle: events.some((event) => ["agent_start", "agent_end", "tool_execution_start", "tool_execution_end"].includes(eventType(event))),
      sentinel_like_complexity_signal: toolStats.successful_tools.length >= 4 || inferTaskSummary(footprint, events).split(/\s+/).length >= 8,
      guardian_like_risk_signal: learningEvent.risk_level === "high" || learningEvent.risk_level === "critical",
      reflexion_failure_signal: learningEvent.outcome === "failure" || toolStats.tool_errors.length > 0,
      automatic_writes_imported: false,
      auto_agents_md_promotion_imported: false,
      auto_memory_write_imported: false,
      auto_skill_install_imported: false,
      llm_route_decision_imported: false
    },
    footprint_summary: {
      tools_used: toolStats.tools_used,
      successful_tool_count: toolStats.successful_tools.length,
      failed_tool_count: toolStats.failed_tools.length,
      tool_error_count: toolStats.tool_errors.length,
      auto_write_indicators: autoWriteIndicators,
      provenance: provenanceGate
    },
    converted_learning_event: learningEvent,
    cycle_trace: trace,
    route_summary: {
      selected_route: trace.route.target,
      status: trace.result.status,
      publication_mode: trace.route.publication_mode,
      candidate_state: trace.candidate_review.state,
      qianxuesen_route_vocab: [...ROUTE_VOCAB]
    },
    control_boundary: {
      footprint_role: "sensor_input_only",
      route_owner: "qianxuesen",
      route_implementation: "existing_signal_rules_and_route_table",
      llm_route_decision_allowed: false,
      automatic_promotion_allowed: false,
      promotion_surface: "none"
    },
    safety: {
      production_authority: false,
      publication_allowed: false,
      blocked_operations: [...BLOCKED_OPERATIONS],
      live_effects: { ...LIVE_EFFECTS_OFF }
    },
    warnings,
    violations: []
  };

  result.violations = evaluateOmniAgentFootprintBridge(result);
  result.ok = result.violations.length === 0;
  return result;
}
