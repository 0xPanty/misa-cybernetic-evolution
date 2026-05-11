import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_DIR = path.join("examples", "misa-distillation");

const SAFETY = {
  production_authority: false,
  publication_allowed: false,
  writes_persistent_memory: false,
  uses_zilliz_proxy: false,
  llm_api_calls: 0,
  external_api_calls: 0
};

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function expectedRouteFor(signals) {
  if (signals.includes("candidate_replay_failed")) return "damping";
  if (signals.includes("explicit_user_boundary") || signals.includes("public_posting_boundary")) return "policy";
  if (signals.includes("avoid_overreaction") || signals.includes("single_failure")) return "damping";
  if (signals.includes("reusable_workflow")) return "skill";
  if (signals.includes("repeated_failure_pattern")) return "case";
  if (signals.includes("stable_user_preference") || signals.includes("stable_project_fact")) return "memory";
  return "ignore";
}

function expectationFor(route) {
  if (route === "policy") {
    return {
      expected_status: "requires_approval",
      expected_publication_mode: "requires_approval",
      expected_candidate_state: "staged"
    };
  }

  if (route === "damping") {
    return {
      expected_status: "held",
      expected_publication_mode: "no_publish",
      expected_candidate_state: "held"
    };
  }

  if (route === "ignore") {
    return {
      expected_status: "rejected",
      expected_publication_mode: "no_publish",
      expected_candidate_state: "rejected"
    };
  }

  return {
    expected_status: "draft",
    expected_publication_mode: "draft_only",
    expected_candidate_state: "staged"
  };
}

function makeCheck(id, ok, reason) {
  return { id, ok, reason };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadLocalDistillationSources({ repoRoot = process.cwd() } = {}) {
  const sourceRoot = path.join(repoRoot, SOURCE_DIR);
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true }).catch(() => []);
  const sources = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    sources.push(await readJson(path.join(sourceRoot, entry.name)));
  }

  sources.sort((a, b) => a.source_id.localeCompare(b.source_id));
  return sources;
}

function buildLearningEvent(source) {
  const signals = uniqueStrings(source.signals);
  const expectedRoute = expectedRouteFor(signals);
  const expectation = expectationFor(expectedRoute);

  return {
    event_id: `misa-distilled-${source.source_id}`,
    channel: source.channel,
    summary: source.summary,
    signals,
    evidence_count: source.evidence_count,
    outcome: source.outcome,
    risk_level: source.risk_level,
    redaction_status: source.redaction_status,
    source_type: "redacted_realish",
    redaction_note: source.redaction_note,
    setpoint: source.setpoint,
    artifact_evidence: {
      injected: uniqueStrings(source.artifact_evidence?.injected),
      read: uniqueStrings(source.artifact_evidence?.read),
      modified: uniqueStrings(source.artifact_evidence?.modified),
      tool_errors: uniqueStrings(source.artifact_evidence?.tool_errors)
    },
    expected_route: expectedRoute,
    ...expectation,
    created_at: source.created_at
  };
}

function buildDistillate(source, learningEvent) {
  return {
    distillate_id: `distillate-${source.source_id}`,
    source_id: source.source_id,
    source_kind: source.source_kind,
    channel: source.channel,
    summary: source.summary,
    source_refs: uniqueStrings(source.source_refs),
    extracted_signals: uniqueStrings(source.signals),
    input_policy: {
      local_only: true,
      summary_first: true,
      raw_window_default: false,
      uses_zilliz_proxy: false,
      vector_lookup_required: false,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    learning_event_id: learningEvent.event_id
  };
}

function evaluateSources(sources, distillates, learningEvents) {
  const checks = [];
  const violations = [];

  checks.push(makeCheck(
    "has_local_sources",
    sources.length > 0,
    "At least one local source is needed for session distillation."
  ));
  checks.push(makeCheck(
    "local_only",
    sources.every((source) => source.local_only === true),
    "Distillation sources must be local-only."
  ));
  checks.push(makeCheck(
    "no_zilliz_proxy",
    sources.every((source) => source.uses_zilliz_proxy === false)
      && distillates.every((item) => item.input_policy.uses_zilliz_proxy === false),
    "Local distillation must not use Zilliz as the default intake proxy."
  ));
  checks.push(makeCheck(
    "no_vector_lookup_required",
    sources.every((source) => source.vector_lookup_required === false)
      && distillates.every((item) => item.input_policy.vector_lookup_required === false),
    "Window distillation must not require vector lookup before making a local learning event."
  ));
  checks.push(makeCheck(
    "summary_first_not_raw_window",
    sources.every((source) => source.raw_window_default === false)
      && distillates.every((item) => item.input_policy.raw_window_default === false),
    "The distiller should emit a compact summary and source refs, not reread full raw windows by default."
  ));
  checks.push(makeCheck(
    "no_api_calls",
    distillates.every((item) => item.input_policy.llm_api_calls === 0 && item.input_policy.external_api_calls === 0),
    "The local distiller must not call model providers or external APIs."
  ));
  checks.push(makeCheck(
    "learning_events_ready",
    learningEvents.length === sources.length && learningEvents.every((event) => event.evidence_count >= 1),
    "Every local source should become one learning event."
  ));

  for (const check of checks) {
    if (!check.ok) {
      violations.push(check.reason);
    }
  }

  return { checks, violations };
}

export async function distillLocalMisaSources({ repoRoot = process.cwd() } = {}) {
  const sources = await loadLocalDistillationSources({ repoRoot });
  const learningEvents = sources.map(buildLearningEvent);
  const distillates = sources.map((source, index) => buildDistillate(source, learningEvents[index]));
  const evaluation = evaluateSources(sources, distillates, learningEvents);

  return {
    schema_version: "misa.local_session_distillation.v1",
    mode: "local-session-distillation",
    ok: evaluation.violations.length === 0,
    summary: {
      source_count: sources.length,
      distillate_count: distillates.length,
      learning_event_count: learningEvents.length,
      llm_api_calls: 0,
      external_api_calls: 0,
      zilliz_proxy_used: false,
      vector_lookup_required: false,
      raw_window_default: false,
      production_authority: false
    },
    distillates,
    learning_events: learningEvents,
    safety: { ...SAFETY },
    checks: evaluation.checks,
    warnings: [
      "v0.12 uses local window distillation as an intake step; it does not replace Zilliz or write persistent memory.",
      "Distilled learning events enter the same local candidate queue as fixture events."
    ],
    violations: evaluation.violations
  };
}

export { loadLocalDistillationSources };
