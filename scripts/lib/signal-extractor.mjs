import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const RULE_FILE = new URL("./signal-rules.json", import.meta.url);
const DEFAULT_RULE_DECK = JSON.parse(fs.readFileSync(RULE_FILE, "utf8"));
const FIXTURE_DIR = path.join("examples", "misa-learning");

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function artifactValues(artifactEvidence = {}) {
  return uniqueStrings([
    ...asArray(artifactEvidence.injected),
    ...asArray(artifactEvidence.read),
    ...asArray(artifactEvidence.modified),
    ...asArray(artifactEvidence.referenced),
    ...asArray(artifactEvidence.tool_errors)
  ]);
}

function eventTextParts(event = {}) {
  const turns = Array.isArray(event.turns)
    ? event.turns.map((turn) => turn.text)
    : [];

  return uniqueStrings([
    event.text,
    event.summary,
    event.setpoint,
    event.redaction_note,
    event.channel,
    event.source_type,
    event.source_kind,
    event.source_id,
    ...turns,
    ...artifactValues(event.artifact_evidence)
  ]);
}

function normalizeInput(input, metadata = {}) {
  if (typeof input === "string") {
    return {
      text: input,
      metadata
    };
  }

  const event = input ?? {};
  const mergedMetadata = {
    ...event,
    ...metadata,
    artifact_evidence: metadata.artifact_evidence ?? event.artifact_evidence
  };

  return {
    text: eventTextParts(mergedMetadata).join("\n"),
    metadata: mergedMetadata
  };
}

function compilePattern(pattern) {
  return new RegExp(pattern, "iu");
}

function patternMatches(patterns, text) {
  const matches = [];
  for (const pattern of patterns ?? []) {
    const matcher = compilePattern(pattern);
    if (matcher.test(text)) {
      matches.push({ kind: "pattern", value: pattern });
    }
  }
  return matches;
}

function toolErrorMatches(patterns, artifactEvidence) {
  const toolErrors = uniqueStrings(artifactEvidence?.tool_errors);
  const matches = [];
  for (const pattern of patterns ?? []) {
    const matcher = compilePattern(pattern);
    for (const toolError of toolErrors) {
      if (matcher.test(toolError)) {
        matches.push({ kind: "tool_error", value: toolError, pattern });
      }
    }
  }
  return matches;
}

function artifactPrefixMatches(prefixes, artifactEvidence) {
  const artifacts = artifactValues(artifactEvidence);
  const matches = [];
  for (const prefix of prefixes ?? []) {
    for (const artifact of artifacts) {
      if (artifact.startsWith(prefix)) {
        matches.push({ kind: "artifact_prefix", value: artifact, prefix });
      }
    }
  }
  return matches;
}

function exactMetadataMatches(values, actual, kind) {
  const normalizedActual = String(actual ?? "").trim();
  if (!normalizedActual) return [];

  return (values ?? [])
    .filter((value) => String(value) === normalizedActual)
    .map((value) => ({ kind, value }));
}

function ruleMatches(rule, text, metadata) {
  const negativeMatches = patternMatches(rule.negative_patterns, text);
  if (negativeMatches.length > 0) {
    return [];
  }

  return [
    ...patternMatches(rule.patterns, text),
    ...toolErrorMatches(rule.tool_error_patterns, metadata.artifact_evidence),
    ...artifactPrefixMatches(rule.artifact_prefixes, metadata.artifact_evidence),
    ...exactMetadataMatches(rule.channels, metadata.channel, "channel"),
    ...exactMetadataMatches(rule.source_kinds, metadata.source_kind, "source_kind")
  ];
}

function confidenceFor(matches) {
  if (matches.length === 0) return 0;
  const total = matches.reduce((sum, match) => sum + match.confidence, 0);
  return Number((total / matches.length).toFixed(3));
}

function evidenceCountFor(metadata, matches) {
  const provided = Number(metadata.evidence_count);
  if (Number.isFinite(provided) && provided > 0) {
    return provided;
  }

  const evidenceRefs = new Set();
  for (const match of matches) {
    for (const hit of match.hits) {
      evidenceRefs.add(`${hit.kind}:${hit.value}`);
    }
  }

  return Math.max(1, Math.min(4, evidenceRefs.size || matches.length));
}

export const SIGNAL_RULE_DECK = DEFAULT_RULE_DECK;
export const SIGNAL_RULES = DEFAULT_RULE_DECK.rules.map((rule) => [rule.signal, rule]);

export function extractSignalsFromSession(input, options = {}) {
  const rules = options.rules ?? DEFAULT_RULE_DECK.rules;
  const { text, metadata } = normalizeInput(input, options.metadata);
  const matches = [];

  for (const rule of rules) {
    const hits = ruleMatches(rule, text, metadata);
    if (hits.length === 0) {
      continue;
    }

    matches.push({
      signal: rule.signal,
      route_hint: rule.route_hint,
      confidence: rule.confidence,
      hits
    });
  }

  const signals = uniqueStrings(matches.map((match) => match.signal));

  return {
    schema_version: "misa.signal_extraction.v1",
    mode: "deterministic-rule-matching",
    ok: signals.length > 0,
    signals,
    evidence_count: signals.length > 0 ? evidenceCountFor(metadata, matches) : 0,
    confidence: confidenceFor(matches),
    signal_count: signals.length,
    matches,
    safety: {
      production_authority: false,
      publication_allowed: false,
      llm_api_calls: 0,
      external_api_calls: 0,
      writes_persistent_memory: false
    }
  };
}

export function extractSignalsForEvent(event, options = {}) {
  return extractSignalsFromSession(event, options);
}

export function applyExtractedSignals(event, options = {}) {
  const extraction = extractSignalsForEvent(event, options);
  const handSignals = uniqueStrings(event?.signals);
  const hasHandSignals = handSignals.length > 0;

  return {
    ...event,
    signals_hand: hasHandSignals ? handSignals : undefined,
    signals_extracted: extraction.signals,
    signals: hasHandSignals ? handSignals : extraction.signals,
    evidence_count: event?.evidence_count ?? extraction.evidence_count,
    signal_extraction: extraction
  };
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function reviewSignalExtractorFixtures({ repoRoot = process.cwd() } = {}) {
  const fixtureRoot = path.join(repoRoot, FIXTURE_DIR);
  const entries = await fsp.readdir(fixtureRoot, { withFileTypes: true });
  const fixtureFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".fixture.json"))
    .map((entry) => entry.name)
    .sort();

  const fixtures = [];
  for (const fileName of fixtureFiles) {
    fixtures.push({
      file: fileName,
      event: await readJson(path.join(fixtureRoot, fileName))
    });
  }

  const reviews = fixtures.map(({ file, event }) => {
    const extraction = extractSignalsForEvent(event);
    const handSignals = uniqueStrings(event.signals);
    const missed = handSignals.filter((signal) => !extraction.signals.includes(signal));
    const extra = extraction.signals.filter((signal) => !handSignals.includes(signal));

    return {
      file,
      event_id: event.event_id,
      hand_signals: handSignals,
      extracted_signals: extraction.signals,
      missed_signals: missed,
      extra_signals: extra,
      evidence_count: extraction.evidence_count,
      confidence: extraction.confidence
    };
  });

  const handSignalNames = uniqueStrings(reviews.flatMap((review) => review.hand_signals)).sort();
  const extractedSignalNames = uniqueStrings(reviews.flatMap((review) => review.extracted_signals)).sort();
  const missedSignalNames = uniqueStrings(reviews.flatMap((review) => review.missed_signals)).sort();
  const handSignalCount = reviews.reduce((sum, review) => sum + review.hand_signals.length, 0);
  const missedSignalCount = reviews.reduce((sum, review) => sum + review.missed_signals.length, 0);
  const extractedSignalCount = reviews.reduce((sum, review) => sum + review.extracted_signals.length, 0);
  const truePositiveCount = extractedSignalCount - reviews.reduce((sum, review) => sum + review.extra_signals.length, 0);

  return {
    schema_version: "misa.signal_extractor_fixture_review.v1",
    mode: "signal-extractor-fixture-review",
    ok: missedSignalCount === 0,
    summary: {
      fixture_count: reviews.length,
      fixture_hand_signal_count: handSignalCount,
      unique_hand_signal_count: handSignalNames.length,
      unique_extracted_signal_count: extractedSignalNames.length,
      missed_signal_count: missedSignalCount,
      recall: handSignalCount === 0 ? 1 : Number(((handSignalCount - missedSignalCount) / handSignalCount).toFixed(3)),
      precision: extractedSignalCount === 0 ? 1 : Number((truePositiveCount / extractedSignalCount).toFixed(3)),
      llm_api_calls: 0,
      external_api_calls: 0
    },
    hand_signals: handSignalNames,
    extracted_signals: extractedSignalNames,
    missed_signals: missedSignalNames,
    fixture_reviews: reviews,
    safety: {
      production_authority: false,
      publication_allowed: false,
      llm_api_calls: 0,
      external_api_calls: 0,
      writes_persistent_memory: false
    }
  };
}
