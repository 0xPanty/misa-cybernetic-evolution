import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_DIR = path.join("examples", "misa-distillation");
const VECTOR_BACKEND = "local-token-vector-v1";
const REQUIRED_SOURCE_KINDS = ["chat_window", "failure_log", "farcaster_audit"];

const SAFETY = {
  production_authority: false,
  publication_allowed: false,
  writes_persistent_memory: false,
  uses_zilliz_proxy: false,
  llm_api_calls: 0,
  external_api_calls: 0
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "be", "before", "but", "by", "can", "for",
  "from", "has", "have", "in", "into", "is", "it", "of", "on", "or", "that",
  "the", "then", "this", "to", "with", "without", "should", "must", "not"
]);

export const SIGNAL_RULES = [
  ["candidate_replay_failed", /\b(replay failed|validation failed|回放失败|验证失败)\b/iu],
  ["avoid_overreaction", /\b(overreact|overreaction|too complicated|过度反应|太复杂|别搞这么麻烦|不要搞这么麻烦)\b/iu],
  ["single_failure", /\b(single|once|transient|单次|偶发)\b/iu],
  ["repeated_failure_pattern", /\b(timeout|failure|failed|error|retry|exception|失败|报错|重试|超时)\b/iu],
  ["explicit_user_boundary", /\b(do not|don't|without|must not|blocked|approval|不要|不用|不能|别|必须|禁止)\b/iu],
  ["public_posting_boundary", /\b(farcaster|post|reply|cast|publisher|webhook|x402|public[- ]?(?:post|reply|channel|thread)|公开|帖子|回复)\b/iu],
  ["farcaster_public_memory_risk", /\b(public memory|private|secret|leak|privacy|隐私|秘密|记忆泄露)\b/iu],
  ["farcaster_reply_success", /\b(good reply|reply success|useful reply|thread result|回复成功|效果好)\b/iu],
  ["farcaster_low_quality_reply", /\b(low quality|off voice|bad reply|overposting|跑偏|低质量|过度回复)\b/iu],
  ["reusable_workflow", /\b(workflow|template|procedure|steps|run|validate|preflight|simulate|流程|模板|步骤|模拟|验证)\b/iu],
  ["stable_user_preference", /\b(wants|asked|prefers|preference|要求|希望|想让|要的是)\b/iu],
  ["stable_project_fact", /\b(local|zilliz|vector|repo|vps|github|window|distill|本地|向量|窗口|蒸馏|仓库)\b/iu]
];

export const LESSON_ROUTE_ORDER = ["policy", "damping", "skill", "case", "memory"];

export const LESSON_ROUTE_SIGNALS = {
  policy: ["explicit_user_boundary", "public_posting_boundary", "farcaster_public_memory_risk"],
  damping: ["candidate_replay_failed", "avoid_overreaction", "single_failure"],
  skill: ["reusable_workflow"],
  case: ["repeated_failure_pattern"],
  memory: ["stable_user_preference", "stable_project_fact"]
};

export const LESSON_ALLOWED_SIGNALS = {
  policy: [
    "explicit_user_boundary",
    "public_posting_boundary",
    "farcaster_public_memory_risk",
    "stable_user_preference",
    "stable_project_fact"
  ],
  damping: ["candidate_replay_failed", "avoid_overreaction", "single_failure"],
  skill: ["reusable_workflow", "stable_project_fact", "stable_user_preference"],
  case: ["repeated_failure_pattern", "stable_project_fact"],
  memory: ["stable_user_preference", "stable_project_fact"]
};

export const LESSON_FALLBACK_SIGNAL = {
  policy: "explicit_user_boundary",
  damping: "single_failure",
  skill: "reusable_workflow",
  case: "repeated_failure_pattern",
  memory: "stable_project_fact"
};

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function hasAnySignal(signals, candidates) {
  return candidates.some((candidate) => signals.includes(candidate));
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function redactText(value) {
  return String(value ?? "")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, "[REDACTED:PRIVATE_KEY]")
    .replace(/\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|NOVAI|NEYNAR|DISCORD|FARCASTER|AGENTMAIL)_API_KEY\s*=\s*[^\s]+/gi, "[REDACTED:API_KEY]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED:SECRET]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED:GITHUB_TOKEN]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED:EMAIL]")
    .replace(/https?:\/\/[^\s)]+/gi, "[REDACTED:URL]")
    .trim();
}

function tokenize(text) {
  return redactText(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}:/_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function extractSignalsFromText(text, sourceKind) {
  const signals = [];
  for (const [signal, pattern] of SIGNAL_RULES) {
    if (pattern.test(text)) {
      signals.push(signal);
    }
  }

  if (sourceKind === "failure_log") {
    signals.push("repeated_failure_pattern");
  }
  if (sourceKind === "farcaster_audit") {
    signals.push("farcaster_reply_success");
  }

  return uniqueStrings(signals);
}

function expectedRouteFor(signals) {
  if (signals.includes("candidate_replay_failed")) return "damping";
  if (
    (signals.includes("avoid_overreaction") || signals.includes("single_failure"))
    && !signals.includes("public_posting_boundary")
    && !signals.includes("farcaster_public_memory_risk")
  ) {
    return "damping";
  }
  if (
    signals.includes("explicit_user_boundary")
    || signals.includes("public_posting_boundary")
    || signals.includes("farcaster_public_memory_risk")
  ) {
    return "policy";
  }
  if (signals.includes("avoid_overreaction") || signals.includes("single_failure")) return "damping";
  if (signals.includes("reusable_workflow")) return "skill";
  if (signals.includes("repeated_failure_pattern")) return "case";
  if (signals.includes("stable_user_preference") || signals.includes("stable_project_fact")) return "memory";
  return "ignore";
}

function isPolicySignal(signals) {
  return hasAnySignal(signals, LESSON_ROUTE_SIGNALS.policy);
}

function isDampingSignal(signals) {
  return hasAnySignal(signals, LESSON_ROUTE_SIGNALS.damping);
}

function segmentSupportsLessonRoute(segment, route) {
  const signals = segment.signals ?? [];

  if (route === "policy") {
    return isPolicySignal(signals);
  }

  if (route === "damping") {
    return isDampingSignal(signals) && !isPolicySignal(signals);
  }

  if (route === "skill") {
    return signals.includes("reusable_workflow")
      && !isPolicySignal(signals)
      && !isDampingSignal(signals);
  }

  if (route === "case") {
    return signals.includes("repeated_failure_pattern")
      && !signals.includes("reusable_workflow")
      && !isPolicySignal(signals)
      && !isDampingSignal(signals);
  }

  if (route === "memory") {
    return hasAnySignal(signals, LESSON_ROUTE_SIGNALS.memory)
      && !signals.includes("reusable_workflow")
      && !signals.includes("repeated_failure_pattern")
      && !isPolicySignal(signals)
      && !isDampingSignal(signals);
  }

  return false;
}

function sourceLevelFallbackAllowed(sourceSignals, route) {
  if (!hasAnySignal(sourceSignals, LESSON_ROUTE_SIGNALS[route])) {
    return false;
  }

  if (route === "policy") {
    return true;
  }

  if (route === "damping") {
    return true;
  }

  if (route === "skill") {
    return !isPolicySignal(sourceSignals) && !isDampingSignal(sourceSignals);
  }

  if (route === "case") {
    return !sourceSignals.includes("reusable_workflow")
      && !isPolicySignal(sourceSignals)
      && !isDampingSignal(sourceSignals);
  }

  if (route === "memory") {
    return !sourceSignals.includes("reusable_workflow")
      && !sourceSignals.includes("repeated_failure_pattern")
      && !isPolicySignal(sourceSignals)
      && !isDampingSignal(sourceSignals);
  }

  return false;
}

function clipText(text, maxLength = 180) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function lessonSummaryFor(route, source, segments) {
  const labels = {
    policy: "Policy boundary",
    damping: "Damping hold",
    skill: "Reusable workflow",
    case: "Failure case",
    memory: "Stable memory"
  };
  const text = segments.length > 0
    ? segments.map((segment) => segment.redacted_text).join(" ")
    : source.summary ?? source.setpoint ?? source.source_id;

  return `${labels[route]} distilled: ${clipText(text)}`;
}

function lessonSetpointFor(route, source) {
  const defaults = {
    policy: "keep future behavior or public-memory boundaries behind approval",
    damping: "hold weak or single-sample evidence to avoid overreaction",
    skill: "turn repeatable local behavior into a draft skill only after replay",
    case: "record repeated failure patterns before changing runtime behavior",
    memory: "preserve stable facts or preferences as draft memory candidates"
  };

  return defaults[route] ?? source.setpoint ?? "use local distilled evidence before candidate generation";
}

function lessonRiskFor(route, source, signals) {
  if (route === "policy") {
    return signals.includes("farcaster_public_memory_risk") || signals.includes("public_posting_boundary")
      ? "high"
      : source.risk_level ?? "medium";
  }
  if (route === "damping" || route === "case") return "medium";
  if (route === "skill") return source.risk_level === "critical" || source.risk_level === "high" ? "medium" : source.risk_level ?? "low";
  return source.risk_level === "critical" ? "high" : source.risk_level ?? "low";
}

function lessonOutcomeFor(route, source) {
  if (route === "damping") return source.outcome === "failure" ? "failure" : "partial";
  if (route === "case") return source.outcome === "success" ? "partial" : source.outcome ?? "partial";
  return source.outcome ?? "success";
}

function lessonEvidenceCountFor(route, source, segments, signals) {
  const required = route === "damping" ? 1 : 2;
  const observed = Math.max(
    source.evidence_count ?? 0,
    segments.length + signals.length
  );
  return Math.max(required, observed || required);
}

function lessonSignalsFor(route, sourceSignals, segments) {
  const segmentSignals = uniqueStrings(segments.flatMap((segment) => segment.signals ?? []));
  const allowed = new Set(LESSON_ALLOWED_SIGNALS[route] ?? []);
  const signals = uniqueStrings([
    ...segmentSignals,
    ...sourceSignals.filter((signal) => allowed.has(signal))
  ]).filter((signal) => allowed.has(signal));

  if (!hasAnySignal(signals, LESSON_ROUTE_SIGNALS[route])) {
    signals.push(LESSON_FALLBACK_SIGNAL[route]);
  }

  return uniqueStrings(signals);
}

function lessonArtifactEvidenceFor(route, source, segments) {
  const evidence = source.artifact_evidence ?? {};
  const sourceRefs = segments.map((segment) => segment.source_ref);
  const includeToolErrors = route === "case" || route === "damping";

  return {
    injected: uniqueStrings(evidence.injected),
    read: uniqueStrings([...(evidence.read ?? []), ...sourceRefs]),
    modified: uniqueStrings(evidence.modified),
    tool_errors: includeToolErrors ? uniqueStrings(evidence.tool_errors) : []
  };
}

function buildAtomicLessons(source, distillate) {
  const sourceSignals = distillate.extracted_signals;
  const lessons = [];

  for (const route of LESSON_ROUTE_ORDER) {
    let segments = distillate.segments.filter((segment) => segmentSupportsLessonRoute(segment, route));
    if (segments.length === 0 && !sourceLevelFallbackAllowed(sourceSignals, route)) {
      continue;
    }

    if (segments.length === 0) {
      segments = distillate.segments;
    }

    const signals = lessonSignalsFor(route, sourceSignals, segments);
    const expectedRoute = expectedRouteFor(signals);
    if (expectedRoute !== route) {
      continue;
    }

    lessons.push({
      lesson_id: `${source.source_id}-lesson-${route}-${String(lessons.length + 1).padStart(2, "0")}`,
      route,
      summary: lessonSummaryFor(route, source, segments),
      source_refs: uniqueStrings([
        ...(source.source_refs ?? []),
        ...segments.map((segment) => segment.source_ref)
      ]),
      segment_ids: segments.map((segment) => segment.segment_id),
      signals,
      evidence_count: lessonEvidenceCountFor(route, source, segments, signals),
      outcome: lessonOutcomeFor(route, source),
      risk_level: lessonRiskFor(route, source, signals),
      setpoint: lessonSetpointFor(route, source),
      artifact_evidence: lessonArtifactEvidenceFor(route, source, segments)
    });
  }

  if (lessons.length > 0) {
    return lessons;
  }

  return [{
    lesson_id: `${source.source_id}-lesson-ignore-01`,
    route: "ignore",
    summary: summarizeSource(source, distillate.segments, sourceSignals),
    source_refs: distillate.source_refs,
    segment_ids: distillate.segments.map((segment) => segment.segment_id),
    signals: sourceSignals.length > 0 ? sourceSignals : ["unsupported_signal"],
    evidence_count: source.evidence_count ?? 1,
    outcome: inferOutcome(source, sourceSignals),
    risk_level: inferRiskLevel(source, sourceSignals),
    setpoint: inferSetpoint(source, sourceSignals),
    artifact_evidence: distillate.extraction.artifact_evidence
  }];
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

function inferRiskLevel(source, signals) {
  if (source.risk_level) return source.risk_level;
  if (signals.includes("farcaster_public_memory_risk") || signals.includes("explicit_user_boundary")) return "high";
  if (signals.includes("repeated_failure_pattern") || signals.includes("farcaster_low_quality_reply")) return "medium";
  return "low";
}

function inferOutcome(source, signals) {
  if (source.outcome) return source.outcome;
  if (signals.includes("candidate_replay_failed") || signals.includes("repeated_failure_pattern")) return "failure";
  if (signals.includes("farcaster_low_quality_reply")) return "partial";
  return "success";
}

function inferSetpoint(source, signals) {
  if (source.setpoint) return source.setpoint;
  if (signals.includes("repeated_failure_pattern")) return "convert repeated local failures into case candidates before changing runtime behavior";
  if (signals.includes("public_posting_boundary")) return "keep public-channel behavior behind local checks and approval";
  if (signals.includes("reusable_workflow")) return "turn repeated local behavior into a draft skill only after replay";
  return "use local distilled evidence before candidate generation";
}

function summarizeSource(source, segments, signals) {
  if (source.summary) return source.summary;
  const useful = segments.find((segment) => segment.speaker !== "system") ?? segments[0];
  const text = useful?.redacted_text ?? `Local ${source.source_kind} source ${source.source_id}`;
  const clipped = text.length > 180 ? `${text.slice(0, 177)}...` : text;

  if (source.source_kind === "failure_log") {
    return `Local failure log distilled: ${clipped}`;
  }
  if (source.source_kind === "farcaster_audit") {
    return `Local Farcaster audit distilled: ${clipped}`;
  }
  if (signals.includes("stable_project_fact")) {
    return `Local window distilled: ${clipped}`;
  }
  return clipped;
}

function extractArtifacts(source, segments) {
  const text = segments.map((segment) => segment.redacted_text).join("\n");
  const artifactMatches = text.match(/\b(?:skill|repo|docs|case|policy|memory):[A-Za-z0-9_.:/-]+|docs\/[A-Za-z0-9_.\/-]+/g) ?? [];
  const evidence = source.artifact_evidence ?? {};

  return {
    injected: uniqueStrings(evidence.injected),
    read: uniqueStrings([...(evidence.read ?? []), ...artifactMatches.filter((item) => item.startsWith("docs/"))]),
    modified: uniqueStrings(evidence.modified),
    tool_errors: uniqueStrings(evidence.tool_errors)
  };
}

function makeCheck(id, ok, reason) {
  return { id, ok, reason };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function loadLocalDistillationSources({ repoRoot = process.cwd(), sourceDir = SOURCE_DIR } = {}) {
  const sourceRoot = path.isAbsolute(sourceDir)
    ? sourceDir
    : path.join(repoRoot, sourceDir);
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

function buildSegments(source) {
  const turns = Array.isArray(source.turns) && source.turns.length > 0
    ? source.turns
    : [{
        speaker: source.source_kind,
        ref: `${source.source_id}:summary`,
        text: source.summary ?? source.setpoint ?? source.source_id
      }];

  return turns.map((turn, index) => {
    const sourceRef = turn.ref || `${source.source_id}:turn:${index + 1}`;
    const redacted = redactText(turn.text);
    const tokens = tokenize(redacted);

    return {
      segment_id: `${source.source_id}-seg-${String(index + 1).padStart(2, "0")}`,
      source_ref: sourceRef,
      speaker: String(turn.speaker ?? source.source_kind),
      redacted_text: redacted || "[REDACTED:EMPTY_SEGMENT]",
      token_count: tokens.length || 1,
      tokens,
      signals: extractSignalsFromText(redacted, source.source_kind)
    };
  });
}

function buildLocalVectorIndex(segments) {
  const tokenCounts = new Map();
  for (const segment of segments) {
    for (const token of segment.tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
  }

  const dimensions = [...tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16)
    .map(([token]) => token);

  return {
    backend: VECTOR_BACKEND,
    persistence: "in_memory_report",
    dimensions,
    item_count: segments.length,
    uses_zilliz_proxy: false,
    external_api_calls: 0,
    vectors: segments.map((segment) => {
      const weights = {};
      for (const dimension of dimensions) {
        const count = segment.tokens.filter((token) => token === dimension).length;
        if (count > 0) {
          weights[dimension] = count;
        }
      }

      return {
        segment_id: segment.segment_id,
        source_ref: segment.source_ref,
        weights
      };
    })
  };
}

function distillSource(source) {
  const segments = buildSegments(source);
  const segmentSignals = segments.flatMap((segment) => segment.signals);
  const signals = uniqueStrings([
    ...(source.signals ?? []),
    ...segmentSignals
  ]);
  const evidenceCount = source.evidence_count ?? Math.max(1, Math.min(4, segments.length + signals.length));
  const summary = summarizeSource(source, segments, signals);
  const extraction = {
    summary,
    setpoint: inferSetpoint(source, signals),
    evidence_count: evidenceCount,
    outcome: inferOutcome(source, signals),
    risk_level: inferRiskLevel(source, signals),
    artifact_evidence: extractArtifacts(source, segments)
  };
  const distillate = {
    distillate_id: `distillate-${source.source_id}`,
    source_id: source.source_id,
    source_kind: source.source_kind,
    channel: source.channel,
    summary,
    source_refs: uniqueStrings([
      ...(source.source_refs ?? []),
      ...segments.map((segment) => segment.source_ref)
    ]),
    segments: segments.map(({ tokens, ...segment }) => segment),
    extracted_signals: signals,
    extraction,
    local_vector_index: buildLocalVectorIndex(segments),
    input_policy: {
      local_only: true,
      summary_first: true,
      raw_window_default: false,
      uses_zilliz_proxy: false,
      local_vector_index: true,
      vector_lookup_required: false,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    learning_event_id: `misa-distilled-${source.source_id}`
  };
  const lessons = buildAtomicLessons(source, distillate);
  const learningEvents = lessons.map((lesson) => buildLearningEvent(source, distillate, lesson, lessons.length));
  distillate.learning_event_id = learningEvents[0]?.event_id ?? `misa-distilled-${source.source_id}`;
  distillate.learning_event_ids = learningEvents.map((event) => event.event_id);
  distillate.atomic_lesson_count = learningEvents.length;

  return { distillate, learningEvents };
}

function buildLearningEvent(source, distillate, lesson, lessonCount) {
  const signals = lesson?.signals ?? distillate.extracted_signals;
  const expectedRoute = expectedRouteFor(signals);
  const expectation = expectationFor(expectedRoute);
  const singleLesson = lessonCount === 1;
  const eventId = lesson && !singleLesson
    ? `misa-distilled-${lesson.lesson_id}`
    : `misa-distilled-${source.source_id}`;

  return {
    event_id: eventId,
    channel: source.channel,
    summary: lesson?.summary ?? distillate.extraction.summary,
    signals,
    evidence_count: lesson?.evidence_count ?? distillate.extraction.evidence_count,
    outcome: lesson?.outcome ?? distillate.extraction.outcome,
    risk_level: lesson?.risk_level ?? distillate.extraction.risk_level,
    redaction_status: source.redaction_status,
    source_type: "redacted_realish",
    redaction_note: source.redaction_note,
    setpoint: lesson?.setpoint ?? distillate.extraction.setpoint,
    artifact_evidence: lesson?.artifact_evidence ?? distillate.extraction.artifact_evidence,
    source_id: source.source_id,
    parent_distillate_id: distillate.distillate_id,
    lesson_id: lesson?.lesson_id ?? `${source.source_id}-lesson-${expectedRoute}-01`,
    lesson_route: expectedRoute,
    lesson_scope: singleLesson ? "source" : "atomic",
    source_refs: lesson?.source_refs ?? distillate.source_refs,
    segment_ids: lesson?.segment_ids ?? distillate.segments.map((segment) => segment.segment_id),
    expected_route: expectedRoute,
    ...expectation,
    created_at: source.created_at
  };
}

function evaluateSources(sources, distillates, learningEvents, { requireTemplateCoverage = true } = {}) {
  const checks = [];
  const violations = [];
  const sourceKindCounts = countBy(sources, (source) => source.source_kind);
  const eventSourceIds = new Set(learningEvents.map((event) => event.source_id));

  checks.push(makeCheck(
    "has_local_sources",
    sources.length > 0,
    "At least one local source is needed for session distillation."
  ));
  if (requireTemplateCoverage) {
    checks.push(makeCheck(
      "covers_all_distillation_templates",
      REQUIRED_SOURCE_KINDS.every((kind) => (sourceKindCounts[kind] ?? 0) > 0),
      "Local distillation examples must cover chat windows, failure logs, and Farcaster audits."
    ));
  }
  checks.push(makeCheck(
    "local_only",
    sources.every((source) => source.local_only === true),
    "Distillation sources must be local-only."
  ));
  checks.push(makeCheck(
    "no_zilliz_proxy",
    sources.every((source) => source.uses_zilliz_proxy === false)
      && distillates.every((item) => item.input_policy.uses_zilliz_proxy === false && item.local_vector_index.uses_zilliz_proxy === false),
    "Local distillation must not use Zilliz as the default intake proxy."
  ));
  checks.push(makeCheck(
    "local_vector_index_present",
    distillates.every((item) => item.local_vector_index.backend === VECTOR_BACKEND && item.local_vector_index.item_count === item.segments.length),
    "Every distillate must carry a local token vector index for source lookup."
  ));
  checks.push(makeCheck(
    "no_vector_lookup_required",
    sources.every((source) => source.vector_lookup_required === false)
      && distillates.every((item) => item.input_policy.vector_lookup_required === false),
    "Window distillation can build a local vector index but must not require vector lookup before making a learning event."
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
    learningEvents.length >= sources.length
      && sources.every((source) => eventSourceIds.has(source.source_id))
      && learningEvents.every((event) => event.evidence_count >= 1),
    "Every local source should become at least one learning event."
  ));
  checks.push(makeCheck(
    "atomic_lesson_splitter_ready",
    distillates.every((item) => item.atomic_lesson_count >= 1 && item.learning_event_ids.length === item.atomic_lesson_count),
    "Compound windows should expose one or more atomic lessons without losing source refs."
  ));

  for (const check of checks) {
    if (!check.ok) {
      violations.push(check.reason);
    }
  }

  return { checks, violations };
}

export async function distillMisaSources(sources, { requireTemplateCoverage = true } = {}) {
  const distilled = sources.map(distillSource);
  const distillates = distilled.map((item) => item.distillate);
  const learningEvents = distilled.flatMap((item) => item.learningEvents);
  const evaluation = evaluateSources(sources, distillates, learningEvents, { requireTemplateCoverage });
  const segmentCount = distillates.reduce((sum, item) => sum + item.segments.length, 0);
  const compoundSourceCount = distillates.filter((item) => item.atomic_lesson_count > 1).length;

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
      local_vector_index_used: true,
      vector_store_backend: VECTOR_BACKEND,
      vector_lookup_required: false,
      raw_window_default: false,
      segment_count: segmentCount,
      atomic_lesson_count: learningEvents.length,
      compound_source_count: compoundSourceCount,
      production_authority: false
    },
    distillates,
    learning_events: learningEvents,
    lesson_splitter: {
      enabled: true,
      mode: "deterministic-atomic-lessons-v1",
      source_count: sources.length,
      atomic_lesson_count: learningEvents.length,
      compound_source_count: compoundSourceCount,
      route_counts: countBy(learningEvents, (event) => event.expected_route),
      local_only: true,
      writes_persistent_memory: false,
      installs_skills: false,
      updates_vps: false,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    safety: { ...SAFETY },
    checks: evaluation.checks,
    warnings: [
      "v0.13 performs local window distillation with redaction, segmentation, signal extraction, atomic lesson splitting, and a local token vector index.",
      "The local vector index is not Zilliz and does not call embedding providers or external APIs."
    ],
    violations: evaluation.violations
  };
}

export async function distillLocalMisaSources({
  repoRoot = process.cwd(),
  sourceDir = SOURCE_DIR,
  sources,
  requireTemplateCoverage = true
} = {}) {
  const loadedSources = sources ?? await loadLocalDistillationSources({ repoRoot, sourceDir });
  return distillMisaSources(loadedSources, { requireTemplateCoverage });
}

export { loadLocalDistillationSources };
