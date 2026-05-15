import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_HERMES_RUNTIME_EVENTS = "test/fixtures/hermes-runtime-adapter/hermes-self-improvement-events.json";
export const DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG = "~/.hermes/qianxuesen-runtime-events.ndjson";

const REQUIRED_HERMES_HOOKS = [
  "pre_tool_call",
  "post_tool_call",
  "pre_llm_call",
  "post_llm_call",
  "on_session_end"
];

const ROUTE_VOCAB = ["memory", "skill", "case", "policy", "damping", "ignore"];

const SKILL_WRITE_ACTIONS = new Set([
  "create",
  "patch",
  "edit",
  "delete",
  "write_file",
  "remove_file"
]);

const MEMORY_WRITE_ACTIONS = new Set([
  "add",
  "replace",
  "remove",
  "delete",
  "write"
]);

const EXTERNAL_INFORMATION_TOOLS = new Set([
  "session_search",
  "web_search",
  "web_extract",
  "search",
  "browser_search"
]);

const RESEARCH_SIGNALS = new Set([
  "external_framework_change",
  "competitor_change",
  "knowledge_gap",
  "research_needed",
  "user_correction",
  "repeated_terminology"
]);

const PUBLIC_BOUNDARY_SIGNALS = new Set([
  "farcaster_public_memory_risk",
  "public_posting_boundary",
  "explicit_user_boundary",
  "public_posting_boundary"
]);

const KNOWN_TERMS = [
  "Farcaster",
  "Hermes",
  "Qianxuesen",
  "Curiosity Engine",
  "GEPA",
  "LangGraph",
  "skill_manage",
  "session_search",
  "memory",
  "curator"
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
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

function stableSlug(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90) || "unknown";
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function hasAny(values = [], expected) {
  return values.some((value) => expected.has(value));
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date("2026-05-15T00:00:00Z").toISOString()
    : date.toISOString();
}

function expandHome(relOrAbs) {
  if (relOrAbs === "~") return os.homedir();
  if (relOrAbs?.startsWith("~/") || relOrAbs?.startsWith("~\\")) {
    return path.join(os.homedir(), relOrAbs.slice(2));
  }
  return relOrAbs;
}

function resolvePath(repoRoot, relOrAbs) {
  const expanded = expandHome(relOrAbs);
  return path.isAbsolute(expanded) ? expanded : path.join(repoRoot, expanded);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function parseNdjson(raw, filePath) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid Hermes runtime NDJSON at ${filePath}:${index}: ${error.message}`);
      }
    });
}

export async function readHermesRuntimeEventLog(filePath) {
  return parseNdjson(await fs.readFile(filePath, "utf8"), filePath);
}

function collectText(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (typeof value === "object") return Object.values(value).flatMap(collectText);
  return [String(value)];
}

function extractKnownTerms(event) {
  const text = collectText(event).join(" ");
  const lower = text.toLowerCase();
  const contextTerms = event.context?.terms ?? [];
  return uniqueStrings([
    ...contextTerms,
    ...KNOWN_TERMS.filter((term) => lower.includes(term.toLowerCase()))
  ]);
}

function toolNameFor(event) {
  return event.tool_name ? String(event.tool_name) : null;
}

function actionFor(event) {
  return event.args?.action
    ?? event.context?.curator_action
    ?? event.action
    ?? null;
}

function eventSignals(event) {
  const toolName = toolNameFor(event);
  const action = actionFor(event);
  const signals = [
    ...(event.observed_signals ?? []),
    ...(event.context?.conversation_signals ?? []),
    ...(event.context?.signals ?? [])
  ];

  if (toolName === "skill_manage") {
    signals.push("hermes_skill_manage", "skill_self_modification");
    if (SKILL_WRITE_ACTIONS.has(String(action))) signals.push("skill_mutation_attempt");
  }
  if (toolName === "memory") {
    signals.push("hermes_memory_tool");
    if (MEMORY_WRITE_ACTIONS.has(String(action))) signals.push("persistent_memory_write");
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) {
    signals.push("external_information_channel", "research_needed");
  }
  if (event.context?.curator_action) {
    signals.push("hermes_curator_lifecycle", "background_skill_review");
  }
  if (event.result?.success === false || event.result?.status === "failed") {
    signals.push("tool_failure", "damping_pressure");
  }

  return uniqueStrings(signals);
}

function runtimeSurfaceFor(event) {
  if (event.context?.curator_action || event.context?.platform === "curator") {
    return "curator_background_review";
  }
  if (String(event.hook || "").includes("tool")) return "tool_call";
  if (String(event.hook || "").includes("llm")) return "llm_call";
  if (String(event.hook || "").includes("session")) return "session_lifecycle";
  return "runtime_event";
}

function qianxuesenEventTypeFor(event, signals) {
  const toolName = toolNameFor(event);
  const action = actionFor(event);
  if (toolName === "skill_manage" && SKILL_WRITE_ACTIONS.has(String(action))) {
    return "skill_mutation_attempt";
  }
  if (toolName === "memory" && MEMORY_WRITE_ACTIONS.has(String(action))) {
    return "memory_write_attempt";
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) {
    return "research_lookup";
  }
  if (signals.includes("background_skill_review")) {
    return "background_evolution_review";
  }
  if (signals.includes("tool_failure")) {
    return "execution_failure_trace";
  }
  return "execution_trace";
}

function routeTargetFor(event, signals) {
  const toolName = toolNameFor(event);
  if (signals.includes("damping_pressure")) return "damping";
  if (toolName === "skill_manage" || signals.includes("background_skill_review")) return "skill";
  if (toolName === "memory") {
    return hasAny(signals, PUBLIC_BOUNDARY_SIGNALS) ? "policy" : "memory";
  }
  if (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) return "case";
  if (hasAny(signals, RESEARCH_SIGNALS)) return "case";
  return "ignore";
}

function effectBoundaryFor(event, signals) {
  const toolName = toolNameFor(event);
  const action = actionFor(event);
  return {
    persistent_memory_write_requested: toolName === "memory" && MEMORY_WRITE_ACTIONS.has(String(action)),
    skill_write_requested: toolName === "skill_manage" && SKILL_WRITE_ACTIONS.has(String(action)),
    public_or_durable_effect_requested: Boolean(event.effects?.public_output || event.effects?.durable_effect),
    external_information_channel: (toolName && EXTERNAL_INFORMATION_TOOLS.has(toolName)) || hasAny(signals, RESEARCH_SIGNALS),
    direct_qianxuesen_write_allowed: false
  };
}

function controlDecisionFor(event, routeTarget, effectBoundary, signals) {
  if (effectBoundary.skill_write_requested) {
    return {
      decision: "candidate_pool_replay_required",
      reason: "Hermes can propose or mutate a skill, but Qianxuesen only treats it as a replay-gated candidate.",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false
    };
  }
  if (effectBoundary.persistent_memory_write_requested) {
    return {
      decision: hasAny(signals, PUBLIC_BOUNDARY_SIGNALS)
        ? "policy_candidate_replay_required"
        : "observe_only_memory_review",
      reason: "Memory writes are observed as pressure, not accepted as durable Qianxuesen memory.",
      replay_required: hasAny(signals, PUBLIC_BOUNDARY_SIGNALS),
      tournament_required: hasAny(signals, PUBLIC_BOUNDARY_SIGNALS),
      can_promote_now: false
    };
  }
  if (effectBoundary.external_information_channel) {
    return {
      decision: "research_digest_required",
      reason: "External or cross-session information should become digest evidence before variants are generated.",
      replay_required: false,
      tournament_required: false,
      can_promote_now: false
    };
  }
  if (signals.includes("background_skill_review")) {
    return {
      decision: "candidate_pool_replay_required",
      reason: "Hermes curator output is useful evolution pressure, but it cannot directly rewrite Qianxuesen state.",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false
    };
  }
  if (routeTarget === "damping") {
    return {
      decision: "damping_review_required",
      reason: "Execution failures should be replayed before damping rules or skill changes are promoted.",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false
    };
  }
  return {
    decision: "observe_only",
    reason: "Runtime trace is retained as evidence only.",
    replay_required: false,
    tournament_required: false,
    can_promote_now: false
  };
}

function normalizeHermesEvent(event, index) {
  const signals = eventSignals(event);
  const routeTarget = routeTargetFor(event, signals);
  const effectBoundary = effectBoundaryFor(event, signals);
  const sourceEventId = event.event_id ?? `hermes-event-${index + 1}`;
  const sourcePayloadFingerprint = stableHash({
    hook: event.hook,
    tool_name: event.tool_name,
    action: actionFor(event),
    context: event.context,
    result: event.result
  });

  return {
    normalized_event_id: `hermes-${stableSlug(sourceEventId)}-${sourcePayloadFingerprint.slice(0, 8)}`,
    source_event_id: sourceEventId,
    runtime_hook: event.hook ?? "unknown",
    runtime_surface: runtimeSurfaceFor(event),
    tool_name: toolNameFor(event),
    runtime_action: actionFor(event),
    qianxuesen_event_type: qianxuesenEventTypeFor(event, signals),
    route_target: routeTarget,
    observed_signals: signals,
    observed_terms: extractKnownTerms(event),
    evidence_refs: uniqueStrings([
      sourceEventId,
      ...(event.source_refs ?? []),
      ...(event.context?.evidence_refs ?? [])
    ]),
    source_payload_fingerprint: sourcePayloadFingerprint,
    effect_boundary: effectBoundary,
    control_decision: controlDecisionFor(event, routeTarget, effectBoundary, signals)
  };
}

function topicFor(event, normalized) {
  return event.args?.query
    ?? event.context?.topic
    ?? event.args?.name
    ?? event.context?.skill_name
    ?? normalized.observed_terms.slice(0, 2).join(" + ")
    ?? normalized.source_event_id;
}

function buildResearchDigests(normalizedEvents, originalEvents) {
  const originalById = new Map(originalEvents.map((event, index) => [
    event.event_id ?? `hermes-event-${index + 1}`,
    event
  ]));

  return normalizedEvents
    .filter((event) => (
      event.effect_boundary.external_information_channel
      || hasAny(event.observed_signals, RESEARCH_SIGNALS)
    ))
    .map((event) => {
      const original = originalById.get(event.source_event_id) ?? {};
      const topic = topicFor(original, event) || event.source_event_id;
      return {
        digest_id: `research-digest-${stableSlug(event.source_event_id)}`,
        source_event_ids: [event.source_event_id],
        topic,
        channel: event.tool_name ?? event.runtime_surface,
        observed_terms: event.observed_terms,
        knowledge_gap_signals: event.observed_signals.filter((signal) => RESEARCH_SIGNALS.has(signal)),
        summary: "Hold this runtime observation as research evidence before generating skill or policy variants.",
        evolution_pressure: event.control_decision.reason,
        candidate_policy: {
          candidate_pool: "research_digest",
          direct_memory_write: false,
          direct_skill_write: false,
          replay_or_tournament_required_before_promotion: true
        }
      };
    });
}

function proposedChangeFor(event) {
  if (event.tool_name === "skill_manage") {
    return `Replay Hermes skill_manage ${event.runtime_action ?? "change"} as a skill variant instead of applying it directly.`;
  }
  if (event.tool_name === "memory") {
    return "Replay this as a policy or memory-boundary candidate before any durable memory update.";
  }
  if (event.control_decision.decision === "research_digest_required") {
    return "Convert the digest into a bounded research follow-up, then generate variants only for high-value evidence.";
  }
  if (event.route_target === "damping") {
    return "Replay the failure trace before changing damping or cooldown rules.";
  }
  if (event.observed_signals.includes("background_skill_review")) {
    return "Treat Hermes curator lifecycle output as candidate pressure for skill maintenance.";
  }
  return "Keep as evidence for future candidate ranking.";
}

function expectedGainFor(event) {
  if (event.route_target === "skill") return "Improve reusable skill behavior while preserving replay gates.";
  if (event.route_target === "policy") return "Reduce public/private boundary mistakes before durable memory changes.";
  if (event.route_target === "case") return "Ground variants in current external or cross-session evidence.";
  if (event.route_target === "damping") return "Reduce repeated execution failures without overfitting a single trace.";
  return "Improve candidate ranking evidence.";
}

function candidateTypeFor(event) {
  if (event.tool_name === "skill_manage" || event.observed_signals.includes("background_skill_review")) {
    return "skill_variant";
  }
  if (event.tool_name === "memory") return "policy_boundary_variant";
  if (event.control_decision.decision === "research_digest_required") return "research_followup";
  if (event.route_target === "damping") return "damping_rule_candidate";
  return "runtime_trace_candidate";
}

function shouldCreateCandidate(event) {
  return event.control_decision.replay_required
    || event.control_decision.tournament_required
    || event.control_decision.decision === "research_digest_required"
    || event.observed_signals.includes("background_skill_review");
}

function buildEvolutionCandidates(normalizedEvents) {
  return normalizedEvents
    .filter(shouldCreateCandidate)
    .map((event) => ({
      candidate_id: `hermes-candidate-${stableSlug(event.source_event_id)}-${stableHash({
        route: event.route_target,
        type: event.qianxuesen_event_type,
        decision: event.control_decision.decision
      }).slice(0, 8)}`,
      source_event_ids: [event.source_event_id],
      candidate_type: candidateTypeFor(event),
      target_surface: event.route_target,
      pressure_signals: event.observed_signals,
      evidence_refs: event.evidence_refs,
      proposed_change: proposedChangeFor(event),
      expected_gain: expectedGainFor(event),
      status: "replay_required",
      replay_required: true,
      tournament_required: true,
      can_promote_now: false,
      promotion_gate: {
        required_rules: [
          "build_or_select_replay_dataset",
          "run_side_by_side_candidate_eval",
          "run_tournament_against_current_behavior",
          "promote_only_through_qianxuesen_gate"
        ],
        reason: "Runtime adapter output is pressure, not authority."
      }
    }));
}

function buildHookMapping() {
  return [
    {
      hook: "pre_tool_call",
      hermes_surface: "tool intent before execution",
      qianxuesen_stage: "observe_tool_intent",
      qianxuesen_event_type: "runtime_tool_intent",
      can_block_runtime: true,
      default_blocks_runtime: false
    },
    {
      hook: "post_tool_call",
      hermes_surface: "tool result after execution",
      qianxuesen_stage: "observe_tool_result",
      qianxuesen_event_type: "execution_trace",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "pre_llm_call",
      hermes_surface: "prompt and model request boundary",
      qianxuesen_stage: "observe_model_request",
      qianxuesen_event_type: "llm_context_trace",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "post_llm_call",
      hermes_surface: "assistant output and background review",
      qianxuesen_stage: "observe_model_output",
      qianxuesen_event_type: "llm_output_trace",
      can_block_runtime: false,
      default_blocks_runtime: false
    },
    {
      hook: "on_session_end",
      hermes_surface: "end-of-session review boundary",
      qianxuesen_stage: "flush_adapter_events",
      qianxuesen_event_type: "session_digest_boundary",
      can_block_runtime: false,
      default_blocks_runtime: false
    }
  ];
}

function buildPluginContract() {
  return {
    plugin_id: "qianxuesen-hermes-runtime-adapter",
    install_shape: "Hermes plugin hook module plus event log bridge",
    default_mode: "observe_only",
    attach_points: buildHookMapping().map((item) => ({
      hook: item.hook,
      purpose: item.qianxuesen_stage,
      can_block_runtime: item.can_block_runtime,
      default_action: "observe"
    })),
    event_output: {
      format: "ndjson",
      env_var: "QIANXUESEN_HERMES_EVENT_LOG",
      default_path: "~/.hermes/qianxuesen-runtime-events.ndjson",
      contains_raw_private_content: false
    },
    no_direct_authority: [
      "does_not_write_hermes_memory",
      "does_not_write_hermes_skills",
      "does_not_promote_qianxuesen_candidates",
      "does_not_call_llm_or_external_api"
    ],
    adapter_boundary: {
      universal_contract_stays_qianxuesen_owned: true,
      framework_specific_code_required: true,
      framework_specific_code_is_thin: true,
      runtime_install_required_before_live_capture: true
    }
  };
}

function safetySummary() {
  return {
    production_authority: false,
    writes_persistent_memory: false,
    writes_skills: false,
    changes_route: false,
    changes_winner: false,
    blocks_runtime: false,
    publication_allowed: false,
    starts_services: false,
    raw_private_content_persisted: false,
    llm_api_calls: 0,
    external_api_calls: 0
  };
}

function buildChecks({
  hookMapping,
  normalizedEvents,
  researchDigests,
  evolutionCandidates,
  safety,
  pluginContract
}) {
  const hooks = new Set(hookMapping.map((item) => item.hook));
  const skillEvents = normalizedEvents.filter((event) => event.tool_name === "skill_manage");
  const memoryWriteEvents = normalizedEvents.filter((event) => event.effect_boundary.persistent_memory_write_requested);
  const externalEvents = normalizedEvents.filter((event) => event.effect_boundary.external_information_channel);
  const candidateSourceIds = new Set(evolutionCandidates.flatMap((candidate) => candidate.source_event_ids));
  const directAuthorityOff = Object.values({
    production_authority: safety.production_authority,
    writes_persistent_memory: safety.writes_persistent_memory,
    writes_skills: safety.writes_skills,
    changes_route: safety.changes_route,
    changes_winner: safety.changes_winner,
    blocks_runtime: safety.blocks_runtime,
    publication_allowed: safety.publication_allowed,
    starts_services: safety.starts_services,
    raw_private_content_persisted: safety.raw_private_content_persisted
  }).every((value) => value === false);

  return [
    {
      name: "Hermes hook surface is mapped",
      ok: REQUIRED_HERMES_HOOKS.every((hook) => hooks.has(hook)),
      required_hooks: REQUIRED_HERMES_HOOKS,
      mapped_hooks: [...hooks].sort()
    },
    {
      name: "skill_manage changes become replay-gated candidates",
      ok: skillEvents.length === 0 || skillEvents.every((event) => (
        event.route_target === "skill"
        && event.effect_boundary.direct_qianxuesen_write_allowed === false
        && candidateSourceIds.has(event.source_event_id)
      )),
      skill_manage_events: skillEvents.length,
      candidate_source_ids: [...candidateSourceIds].sort()
    },
    {
      name: "memory writes cannot bypass policy review",
      ok: memoryWriteEvents.every((event) => (
        event.effect_boundary.direct_qianxuesen_write_allowed === false
        && event.control_decision.can_promote_now === false
      )),
      memory_write_events: memoryWriteEvents.length
    },
    {
      name: "external information becomes research digest evidence",
      ok: externalEvents.length === 0 || researchDigests.length >= externalEvents.length,
      external_information_events: externalEvents.length,
      research_digests: researchDigests.length
    },
    {
      name: "all adapter candidates require replay and tournament",
      ok: evolutionCandidates.every((candidate) => (
        candidate.replay_required === true
        && candidate.tournament_required === true
        && candidate.can_promote_now === false
      )),
      candidate_count: evolutionCandidates.length
    },
    {
      name: "adapter stays observe-only and call-free",
      ok: directAuthorityOff
        && safety.llm_api_calls === 0
        && safety.external_api_calls === 0,
      safety
    },
    {
      name: "plugin contract is thin runtime glue",
      ok: pluginContract.adapter_boundary.universal_contract_stays_qianxuesen_owned === true
        && pluginContract.adapter_boundary.framework_specific_code_required === true
        && pluginContract.adapter_boundary.framework_specific_code_is_thin === true,
      install_shape: pluginContract.install_shape,
      default_mode: pluginContract.default_mode
    }
  ];
}

function violationsForChecks(checks) {
  return checks
    .filter((check) => !check.ok)
    .map((check) => `failed_${stableSlug(check.name)}`);
}

export function buildHermesRuntimeAdapterReport({
  fixture,
  now = new Date("2026-05-15T00:00:00Z")
} = {}) {
  if (!fixture) throw new Error("fixture is required");

  const events = fixture.events ?? [];
  const hookMapping = buildHookMapping();
  const normalizedEvents = events.map(normalizeHermesEvent);
  const researchDigests = buildResearchDigests(normalizedEvents, events);
  const evolutionCandidates = buildEvolutionCandidates(normalizedEvents);
  const safety = safetySummary();
  const pluginContract = buildPluginContract();
  const checks = buildChecks({
    hookMapping,
    normalizedEvents,
    researchDigests,
    evolutionCandidates,
    safety,
    pluginContract
  });
  const violations = violationsForChecks(checks);

  return {
    schema_version: "misa.agent_runtime_adapter.v1",
    mode: "hermes-runtime-adapter",
    ok: violations.length === 0,
    created_at: asIsoDate(now),
    adapter: {
      adapter_id: "hermes-agent-runtime-adapter",
      runtime: fixture.source?.runtime ?? "hermes-agent",
      runtime_commit: fixture.source?.runtime_commit ?? "unknown",
      source_url: fixture.source?.source_url ?? "https://github.com/NousResearch/hermes-agent",
      entry_strategy: "Hermes plugin hooks plus offline NDJSON replay",
      default_mode: "observe_only"
    },
    universal_contract: {
      adapter_role: "runtime_event_normalizer",
      control_owner: "qianxuesen",
      framework_role: "carrier_runtime",
      route_vocab: ROUTE_VOCAB,
      accepts_external_information: true,
      candidate_pool_policy: "research_digest_or_evolution_candidate_only",
      direct_write_policy: "forbidden_by_default",
      runtime_specific_code_required: true
    },
    hook_mapping: hookMapping,
    normalized_events: normalizedEvents,
    research_digests: researchDigests,
    evolution_candidates: evolutionCandidates,
    plugin_contract: pluginContract,
    summary: {
      event_count: normalizedEvents.length,
      normalized_event_count: normalizedEvents.length,
      research_digest_count: researchDigests.length,
      evolution_candidate_count: evolutionCandidates.length,
      replay_required_count: evolutionCandidates.filter((candidate) => candidate.replay_required).length,
      tournament_required_count: evolutionCandidates.filter((candidate) => candidate.tournament_required).length,
      skill_manage_event_count: normalizedEvents.filter((event) => event.tool_name === "skill_manage").length,
      memory_write_event_count: normalizedEvents.filter((event) => event.effect_boundary.persistent_memory_write_requested).length,
      external_information_event_count: normalizedEvents.filter((event) => event.effect_boundary.external_information_channel).length,
      default_mode: "observe_only",
      verifier: violations.length === 0 ? "passed" : "failed"
    },
    safety,
    checks,
    warnings: [
      "This adapter report is local dry-run evidence, not a live Hermes plugin install.",
      "Hermes pre_tool_call can block at runtime, but this default contract only observes.",
      "Research digests and candidates must enter replay or tournament before promotion."
    ],
    violations
  };
}

export async function runHermesRuntimeAdapter({
  repoRoot = process.cwd(),
  fixtureFile = DEFAULT_HERMES_RUNTIME_EVENTS,
  eventLogFile,
  runtime = "hermes-agent",
  runtimeCommit = "unknown",
  sourceUrl = "local-hermes-plugin-event-log",
  now = new Date("2026-05-15T00:00:00Z")
} = {}) {
  const fixture = eventLogFile
    ? {
        fixture_id: `hermes-runtime-event-log-${stableSlug(path.basename(eventLogFile))}`,
        source: {
          runtime,
          runtime_commit: runtimeCommit,
          source_url: sourceUrl
        },
        events: await readHermesRuntimeEventLog(resolvePath(repoRoot, eventLogFile))
      }
    : await readJson(resolvePath(repoRoot, fixtureFile));

  return buildHermesRuntimeAdapterReport({
    fixture,
    now
  });
}
