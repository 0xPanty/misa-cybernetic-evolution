const HIGH_VALUE_SIGNALS = new Set([
  "farcaster_public_memory_risk",
  "public_posting_boundary",
  "explicit_user_boundary",
  "candidate_replay_failed",
  "repeated_failure_pattern",
  "reusable_workflow",
  "external_framework_change",
  "competitor_change",
  "knowledge_gap",
  "research_needed",
  "user_correction"
]);

const PUBLIC_BOUNDARY_SIGNALS = new Set([
  "farcaster_public_memory_risk",
  "public_posting_boundary"
]);

const REVIEW_WORTHY_DECISIONS = new Set([
  "llm_variant_generation_recommended",
  "deterministic_review_optional"
]);

const RESEARCH_PRESSURE_SIGNALS = new Set([
  "external_framework_change",
  "competitor_change",
  "knowledge_gap",
  "research_needed",
  "user_correction"
]);

function uniqueStrings(values) {
  return [...new Set((values ?? [])
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function groupBySource(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const values = grouped.get(item.source_id) ?? [];
    values.push(item);
    grouped.set(item.source_id, values);
  }
  return grouped;
}

function duplicateSources(clusters = []) {
  return new Set(clusters.flatMap((cluster) => cluster.source_ids ?? []));
}

function hasAny(signals, expected) {
  return signals.some((signal) => expected.has(signal));
}

function activeRoutes(routePressure = {}) {
  return Object.entries(routePressure)
    .filter(([, count]) => count > 0)
    .map(([route]) => route);
}

function scoreSource({
  source,
  attention,
  fingerprint,
  reviewHint,
  riskHints,
  noveltyHints,
  isDuplicate
}) {
  const signals = uniqueStrings(source.observed_signals);
  const routes = activeRoutes(source.route_pressure);
  const publicBoundary = hasAny(signals, PUBLIC_BOUNDARY_SIGNALS);
  const replayFailure = signals.includes("candidate_replay_failed");
  const repeatedFailure = signals.includes("repeated_failure_pattern");
  const workflowCandidate = signals.includes("reusable_workflow");
  const explicitBoundary = signals.includes("explicit_user_boundary");
  const externalFrameworkChange = signals.includes("external_framework_change");
  const competitorChange = signals.includes("competitor_change");
  const knowledgeGap = signals.includes("knowledge_gap");
  const researchNeeded = signals.includes("research_needed");
  const userCorrection = signals.includes("user_correction");
  const repeatedTerminology = signals.includes("repeated_terminology");
  const researchPressure = hasAny(signals, RESEARCH_PRESSURE_SIGNALS);
  const researchPair = (externalFrameworkChange || competitorChange) && (knowledgeGap || researchNeeded || userCorrection || repeatedTerminology);
  const correctionPair = userCorrection && (knowledgeGap || researchNeeded || externalFrameworkChange || competitorChange || repeatedTerminology);
  const alreadyProcessed = fingerprint?.ledger_status === "already_processed";
  const recurrence = fingerprint?.ledger_status === "recurring_after_fix";
  const dampingRepeated = fingerprint?.ledger_status === "damping_repeated_to_case";
  const priority = attention?.priority ?? source.suggested_priority ?? 0;
  const termOnlySignal = repeatedTerminology
    && !researchPressure
    && !publicBoundary
    && !replayFailure
    && !repeatedFailure
    && !workflowCandidate
    && !explicitBoundary;
  const noActionableSignal = signals.length === 0
    || ((!hasAny(signals, HIGH_VALUE_SIGNALS) || termOnlySignal) && routes.every((route) => route === "ignore" || route === "memory"));

  let score = priority * 0.0042;
  if (publicBoundary) score += 0.35;
  if (explicitBoundary) score += 0.12;
  if (replayFailure) score += 0.24;
  if (repeatedFailure) score += 0.18;
  if (workflowCandidate && !publicBoundary) score += 0.12;
  if (researchPair) score += 0.34;
  else if (correctionPair) score += 0.3;
  else if (externalFrameworkChange || competitorChange) score += 0.18;
  else if (knowledgeGap || researchNeeded || userCorrection) score += 0.16;
  if (repeatedTerminology && researchPressure) score += 0.08;
  if (repeatedTerminology && !researchPressure) score += 0.02;
  if (routes.length > 1) score += 0.08;
  if (isDuplicate && workflowCandidate) score += 0.06;
  if (isDuplicate && researchPressure) score += 0.04;
  if (recurrence) score += 0.2;
  if (dampingRepeated) score += 0.25;
  if (reviewHint?.level === "high") score += 0.15;
  if (reviewHint?.level === "medium") score += 0.06;
  if (reviewHint?.level === "low") score -= 0.04;
  if (riskHints.length > 0) score += Math.min(0.08, riskHints.length * 0.03);
  if (noveltyHints.length > 0 && !publicBoundary) score += Math.min(0.05, noveltyHints.length * 0.02);
  if (alreadyProcessed) score -= 0.65;
  if (noActionableSignal && priority <= 45) score -= 0.25;

  const forceHigh = (publicBoundary && (priority >= 85 || recurrence))
    || (replayFailure && dampingRepeated)
    || (researchPair && priority >= 74)
    || (correctionPair && priority >= 76);
  const suppress = alreadyProcessed || (noActionableSignal && priority <= 35);
  const boundedScore = suppress ? 0 : round(clamp01(score));
  const level = suppress
    ? "none"
    : forceHigh || boundedScore >= 0.78
      ? "high"
      : boundedScore >= 0.52
        ? "medium"
        : boundedScore >= 0.28
          ? "low"
          : "none";

  return {
    score: boundedScore,
    level,
    signals,
    routes,
    flags: {
      public_boundary: publicBoundary,
      replay_failure: replayFailure,
      repeated_failure: repeatedFailure,
      workflow_candidate: workflowCandidate,
      explicit_boundary: explicitBoundary,
      external_framework_change: externalFrameworkChange,
      competitor_change: competitorChange,
      knowledge_gap: knowledgeGap,
      research_needed: researchNeeded,
      user_correction: userCorrection,
      repeated_terminology: repeatedTerminology,
      research_pressure: researchPressure,
      research_pair: researchPair,
      correction_pair: correctionPair,
      recurrence,
      damping_repeated: dampingRepeated,
      already_processed: alreadyProcessed,
      duplicate_evidence: isDuplicate,
      no_actionable_signal: noActionableSignal
    }
  };
}

function decisionForLevel(level, flags) {
  if (flags.already_processed) return "suppress_as_already_handled";
  if (flags.no_actionable_signal && level === "none") return "suppress_as_low_value_noise";
  if (level === "high") return "llm_variant_generation_recommended";
  if (level === "medium") return "deterministic_review_optional";
  return "ordinary_candidate_flow";
}

function callPolicyForLevel(level) {
  if (level === "high") return "call_when_auto_enabled";
  if (level === "medium") return "deterministic_default_review_optional";
  return "do_not_call";
}

function reasonsFor(scored, fingerprint, reviewHint) {
  return uniqueStrings([
    scored.flags.public_boundary ? "public_boundary" : null,
    scored.flags.explicit_boundary ? "explicit_user_boundary" : null,
    scored.flags.replay_failure ? "replay_failure" : null,
    scored.flags.repeated_failure ? "repeated_failure_pattern" : null,
    scored.flags.workflow_candidate ? "workflow_candidate" : null,
    scored.flags.recurrence ? "recurring_after_fix" : null,
    scored.flags.external_framework_change ? "external_framework_change" : null,
    scored.flags.competitor_change ? "competitor_change" : null,
    scored.flags.knowledge_gap ? "knowledge_gap" : null,
    scored.flags.research_needed ? "research_needed" : null,
    scored.flags.user_correction ? "user_correction" : null,
    scored.flags.repeated_terminology ? "repeated_terminology" : null,
    scored.flags.research_pair ? "external_or_correction_plus_gap" : null,
    scored.flags.damping_repeated ? "damping_repeated_to_case" : null,
    scored.flags.duplicate_evidence ? "duplicate_evidence" : null,
    scored.flags.already_processed ? "already_processed" : null,
    scored.flags.no_actionable_signal ? "low_value_noise" : null,
    reviewHint?.level ? `review_hint_${reviewHint.level}` : null,
    fingerprint?.ledger_status ? `ledger_${fingerprint.ledger_status}` : null
  ]);
}

function decisionRecord({
  source,
  attention,
  fingerprint,
  reviewHint,
  riskHints,
  noveltyHints,
  isDuplicate
}) {
  const scored = scoreSource({
    source,
    attention,
    fingerprint,
    reviewHint,
    riskHints,
    noveltyHints,
    isDuplicate
  });
  const decision = decisionForLevel(scored.level, scored.flags);
  const suggestedDownstream = decision.startsWith("suppress_")
    ? []
    : attention?.suggested_downstream ?? [];

  return {
    source_id: source.source_id,
    source_kind: source.source_kind,
    signal_fingerprint_id: source.signal_fingerprint_id ?? null,
    ledger_status: fingerprint?.ledger_status ?? source.ledger_status ?? "unknown",
    priority: attention?.priority ?? source.suggested_priority ?? 0,
    route_pressure: source.route_pressure,
    observed_signals: scored.signals,
    llm_review_value: {
      level: scored.level,
      score: scored.score,
      call_policy: callPolicyForLevel(scored.level),
      expected_value: scored.level === "high"
        ? "candidate_variant_generation"
        : scored.level === "medium"
          ? "diagnostic_note_or_manual_review"
          : "deterministic_flow_only"
    },
    decision,
    selected_for_llm_variant_generation: decision === "llm_variant_generation_recommended",
    review_worthy: REVIEW_WORTHY_DECISIONS.has(decision),
    suggested_downstream: suggestedDownstream,
    evidence_refs: uniqueStrings([
      ...(source.source_refs ?? []),
      ...(fingerprint?.new_evidence_refs ?? [])
    ]),
    reasons: reasonsFor(scored, fingerprint, reviewHint),
    authority: "advice_only"
  };
}

function qualityProbeFor(decisions, {
  expectedReviewWorthySourceIds = [],
  expectedNoiseSourceIds = []
} = {}) {
  const bySource = new Map(decisions.map((decision) => [decision.source_id, decision]));
  const reviewWorthyIds = new Set(decisions
    .filter((decision) => decision.review_worthy)
    .map((decision) => decision.source_id));
  const missedReviewWorthySourceIds = expectedReviewWorthySourceIds
    .filter((sourceId) => !reviewWorthyIds.has(sourceId));
  const noiseSelectedSourceIds = expectedNoiseSourceIds
    .filter((sourceId) => bySource.get(sourceId)?.review_worthy);

  return {
    expected_review_worthy_source_ids: expectedReviewWorthySourceIds,
    detected_review_worthy_source_ids: [...reviewWorthyIds].sort(),
    missed_review_worthy_source_ids: missedReviewWorthySourceIds,
    expected_noise_source_ids: expectedNoiseSourceIds,
    noise_selected_source_ids: noiseSelectedSourceIds,
    missed_review_worthy_count: missedReviewWorthySourceIds.length,
    noise_selected_count: noiseSelectedSourceIds.length
  };
}

export function buildCuriositySignalGateFromDigest(digest, {
  expectedReviewWorthySourceIds = [],
  expectedNoiseSourceIds = []
} = {}) {
  const attentionBySource = new Map(digest.attention_queue.map((item) => [item.source_id, item]));
  const fingerprintById = new Map(digest.signal_fingerprints.map((item) => [item.fingerprint_id, item]));
  const reviewHintBySource = new Map(digest.expected_review_value_hints.map((item) => [item.source_id, item]));
  const riskHintsBySource = groupBySource(digest.risk_hints);
  const noveltyHintsBySource = groupBySource(digest.novelty_hints);
  const duplicateSourceIds = duplicateSources(digest.duplicate_clusters);

  const decisions = digest.source_refs
    .map((source) => decisionRecord({
      source,
      attention: attentionBySource.get(source.source_id),
      fingerprint: fingerprintById.get(source.signal_fingerprint_id),
      reviewHint: reviewHintBySource.get(source.source_id),
      riskHints: riskHintsBySource.get(source.source_id) ?? [],
      noveltyHints: noveltyHintsBySource.get(source.source_id) ?? [],
      isDuplicate: duplicateSourceIds.has(source.source_id)
    }))
    .sort((left, right) => (
      right.llm_review_value.score - left.llm_review_value.score
        || right.priority - left.priority
        || left.source_id.localeCompare(right.source_id)
    ));
  const qualityProbe = qualityProbeFor(decisions, {
    expectedReviewWorthySourceIds,
    expectedNoiseSourceIds
  });
  const checks = [
    {
      name: "expected review-worthy signals selected",
      ok: qualityProbe.missed_review_worthy_count === 0,
      missed_source_ids: qualityProbe.missed_review_worthy_source_ids
    },
    {
      name: "noise stayed below llm threshold",
      ok: qualityProbe.noise_selected_count === 0,
      noise_selected_source_ids: qualityProbe.noise_selected_source_ids
    },
    {
      name: "llm gate stays advisory and call-free",
      ok: true,
      llm_api_calls: 0,
      external_api_calls: 0,
      production_authority: false
    }
  ];

  return {
    schema_version: "misa.curiosity_signal_gate.v1",
    mode: "curiosity-signal-gate",
    ok: checks.every((check) => check.ok),
    source: {
      digest_id: digest.digest_id,
      source_count: digest.summary.source_count,
      shadow_only: digest.shadow_only
    },
    summary: {
      evaluated_source_count: decisions.length,
      llm_variant_generation_count: decisions.filter((decision) => decision.decision === "llm_variant_generation_recommended").length,
      deterministic_review_optional_count: decisions.filter((decision) => decision.decision === "deterministic_review_optional").length,
      ordinary_candidate_flow_count: decisions.filter((decision) => decision.decision === "ordinary_candidate_flow").length,
      suppressed_count: decisions.filter((decision) => decision.decision.startsWith("suppress_")).length,
      review_worthy_count: decisions.filter((decision) => decision.review_worthy).length,
      missed_review_worthy_count: qualityProbe.missed_review_worthy_count,
      noise_selected_count: qualityProbe.noise_selected_count,
      llm_api_calls: 0,
      external_api_calls: 0,
      production_authority: false
    },
    source_decisions: decisions,
    quality_probe: qualityProbe,
    safety: {
      production_authority: false,
      writes_persistent_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      changes_route: false,
      changes_winner: false,
      publication_allowed: false,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    checks,
    notes: [
      "Curiosity gate only decides whether a signal is worth LLM or GEPA-style variant generation.",
      "It does not create a new candidate pool, change routes, call providers, write memory, or choose winners."
    ]
  };
}
