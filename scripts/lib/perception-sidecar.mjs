import fs from "node:fs/promises";
import path from "node:path";
import { distillLocalMisaSources } from "./session-distiller.mjs";
import {
  PERCEPTION_NOVELTY_SIGNAL_HINTS,
  PERCEPTION_RISK_SIGNAL_HINTS,
  PERCEPTION_ROUTE_PRIORITY,
  PERCEPTION_SIGNAL_FAMILIES
} from "./signal-taxonomy.mjs";

const LEDGER_STATUSES = new Set(["open", "handled", "resolved", "damping_only", "ignored"]);

const RISK_SIGNALS = new Map(PERCEPTION_RISK_SIGNAL_HINTS);
const NOVELTY_SIGNALS = new Map(PERCEPTION_NOVELTY_SIGNAL_HINTS);

const BLOCKED_EFFECTS = [
  "persistent_memory_write",
  "zilliz_write",
  "embedding_creation",
  "skill_installation",
  "public_publish",
  "provider_route_change",
  "winner_change",
  "route_change",
  "service_start"
];

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function strongestRoute(routeCounts) {
  return Object.keys(routeCounts)
    .sort((a, b) => (PERCEPTION_ROUTE_PRIORITY[b] ?? 0) - (PERCEPTION_ROUTE_PRIORITY[a] ?? 0) || a.localeCompare(b))[0] ?? "ignore";
}

function signalFamilyFor(signals) {
  for (const [family, familySignals] of PERCEPTION_SIGNAL_FAMILIES) {
    if (familySignals.some((signal) => signals.includes(signal))) {
      return family;
    }
  }
  return "no_actionable_signal";
}

function sourceKey(sourceId, suffix) {
  return `${sourceId}-${suffix}`.replace(/[^A-Za-z0-9_.:-]+/g, "-");
}

function fingerprintKey(route, sourceKind, family) {
  return `signal:${route}:${sourceKind}:${family}`.replace(/[^A-Za-z0-9_.:-]+/g, "-");
}

function indexDistillationBySource(distillation) {
  const distillateBySource = new Map();
  const eventsBySource = new Map();

  for (const distillate of distillation.distillates) {
    if (!distillateBySource.has(distillate.source_id)) {
      distillateBySource.set(distillate.source_id, distillate);
    }
  }

  for (const event of distillation.learning_events) {
    const events = eventsBySource.get(event.source_id) ?? [];
    events.push(event);
    eventsBySource.set(event.source_id, events);
  }

  return { distillateBySource, eventsBySource };
}

function signalsFor(distillate, events) {
  return uniqueStrings([
    ...(distillate?.extracted_signals ?? []),
    ...events.flatMap((event) => event.signals ?? [])
  ]);
}

function sourceRefsFor(distillate, events) {
  return uniqueStrings([
    ...(distillate?.source_refs ?? []),
    ...events.flatMap((event) => event.source_refs ?? [])
  ]);
}

function sourceFingerprintFor({ sourceKind, routeCounts, signals }) {
  const route = strongestRoute(routeCounts);
  const family = signalFamilyFor(signals);
  return {
    fingerprint_id: fingerprintKey(route, sourceKind, family),
    route,
    family
  };
}

function hasPolicyPressure(signals) {
  return signals.includes("farcaster_public_memory_risk")
    || signals.includes("public_posting_boundary")
    || signals.includes("explicit_user_boundary");
}

function priorityFor(events, signals) {
  const routeScore = Math.max(0, ...events.map((event) => PERCEPTION_ROUTE_PRIORITY[event.expected_route] ?? 30));
  const signalBoost = signals.reduce((score, signal) => {
    if (signal === "farcaster_public_memory_risk" || signal === "public_posting_boundary") return score + 10;
    if (signal === "explicit_user_boundary" || signal === "candidate_replay_failed") return score + 8;
    if (signal === "knowledge_gap" || signal === "research_needed" || signal === "user_correction") return score + 7;
    if (signal === "external_framework_change" || signal === "competitor_change") return score + 6;
    if (signal === "reusable_workflow" || signal === "repeated_failure_pattern") return score + 5;
    if (signal === "repeated_terminology") return score + 3;
    return score;
  }, 0);

  return clamp(routeScore + signalBoost, 0, 100);
}

function normalizeLedgerEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const handledStatus = LEDGER_STATUSES.has(entry.handled_status)
    ? entry.handled_status
    : "open";
  return {
    fingerprint_id: String(entry.fingerprint_id ?? ""),
    handled_status: handledStatus,
    handled_result: String(entry.handled_result ?? "unknown"),
    first_seen: entry.first_seen,
    last_seen: entry.last_seen,
    seen_count: Number.isInteger(entry.seen_count) ? entry.seen_count : 0,
    handled_at: entry.handled_at,
    evidence_refs: uniqueStrings(entry.evidence_refs),
    notes: entry.notes
  };
}

function normalizeSignalLedger(ledger) {
  const entries = new Map();
  for (const rawEntry of ledger?.entries ?? []) {
    const entry = normalizeLedgerEntry(rawEntry);
    if (entry?.fingerprint_id) {
      entries.set(entry.fingerprint_id, entry);
    }
  }
  return {
    schema_version: ledger?.schema_version ?? "misa.signal_ledger.v1",
    entries
  };
}

function difference(values, knownValues) {
  const known = new Set(knownValues);
  return uniqueStrings(values).filter((value) => !known.has(value));
}

function ledgerStatusFor(fingerprint, ledgerEntry) {
  const currentRefs = fingerprint.source_refs;
  const newEvidenceRefs = ledgerEntry
    ? difference(currentRefs, ledgerEntry.evidence_refs)
    : currentRefs;
  const totalSeenCount = (ledgerEntry?.seen_count ?? 0) + fingerprint.source_ids.length;
  const hasNewEvidence = newEvidenceRefs.length > 0;

  if (!ledgerEntry) {
    return {
      ledger_status: "new_signal",
      handled_status: "not_seen",
      handled_result: "none",
      seen_count: totalSeenCount,
      new_evidence_refs: newEvidenceRefs,
      priority_adjustment: 0,
      recommended_action: "send_to_qianxuesen",
      status_reason: "new fingerprint with no prior ledger entry"
    };
  }

  if ((ledgerEntry.handled_status === "handled" || ledgerEntry.handled_status === "resolved") && !hasNewEvidence) {
    return {
      ledger_status: "already_processed",
      handled_status: ledgerEntry.handled_status,
      handled_result: ledgerEntry.handled_result,
      seen_count: totalSeenCount,
      new_evidence_refs: [],
      priority_adjustment: -70,
      recommended_action: "suppress_and_update_seen_count",
      status_reason: "same fingerprint and evidence were already handled"
    };
  }

  if ((ledgerEntry.handled_status === "handled" || ledgerEntry.handled_status === "resolved") && hasNewEvidence) {
    return {
      ledger_status: "recurring_after_fix",
      handled_status: ledgerEntry.handled_status,
      handled_result: ledgerEntry.handled_result,
      seen_count: totalSeenCount,
      new_evidence_refs: newEvidenceRefs,
      priority_adjustment: 12,
      recommended_action: "open_recurrence_repair_or_work_order",
      status_reason: "handled fingerprint appeared again with new evidence"
    };
  }

  if (ledgerEntry.handled_status === "damping_only" && totalSeenCount >= 3) {
    return {
      ledger_status: "damping_repeated_to_case",
      handled_status: ledgerEntry.handled_status,
      handled_result: ledgerEntry.handled_result,
      seen_count: totalSeenCount,
      new_evidence_refs: newEvidenceRefs,
      priority_adjustment: 18,
      recommended_action: "promote_from_damping_to_case_or_repair_review",
      status_reason: "a previously damped signal crossed the repeat threshold"
    };
  }

  if (hasNewEvidence) {
    return {
      ledger_status: "seen_with_new_evidence",
      handled_status: ledgerEntry.handled_status,
      handled_result: ledgerEntry.handled_result,
      seen_count: totalSeenCount,
      new_evidence_refs: newEvidenceRefs,
      priority_adjustment: 6,
      recommended_action: "merge_delta_then_send_to_qianxuesen",
      status_reason: "known fingerprint has new evidence that should be merged, not relearned from scratch"
    };
  }

  return {
    ledger_status: "seen_open",
    handled_status: ledgerEntry.handled_status,
    handled_result: ledgerEntry.handled_result,
    seen_count: totalSeenCount,
    new_evidence_refs: [],
    priority_adjustment: -12,
    recommended_action: "merge_with_existing_open_item",
    status_reason: "known fingerprint is already open with no new evidence"
  };
}

function priorityWithLedger(basePriority, ledgerState) {
  if (ledgerState.ledger_status === "already_processed") {
    return clamp(Math.min(basePriority, 20) + ledgerState.priority_adjustment, 0, 100);
  }
  return clamp(basePriority + ledgerState.priority_adjustment, 0, 100);
}

function buildRiskHints(sourceId, signals, refs, events) {
  const hints = [];
  for (const signal of signals) {
    if (!RISK_SIGNALS.has(signal)) continue;
    const { kind, level, reason } = RISK_SIGNALS.get(signal);
    hints.push({
      hint_id: sourceKey(sourceId, `risk-${signal}`),
      source_id: sourceId,
      kind,
      level,
      reason,
      source_refs: refs,
      authority: "hint_only"
    });
  }

  if (events.some((event) => event.risk_level === "critical" || event.risk_level === "high")) {
    hints.push({
      hint_id: sourceKey(sourceId, "risk-high-event"),
      source_id: sourceId,
      kind: "high_risk_event",
      level: "high",
      reason: "one or more distilled events already carry high risk",
      source_refs: refs,
      authority: "hint_only"
    });
  }

  return hints;
}

function buildNoveltyHints(sourceId, signals, refs, routeCounts) {
  const hints = [];
  for (const signal of signals) {
    if (!NOVELTY_SIGNALS.has(signal)) continue;
    if (signal === "reusable_workflow" && hasPolicyPressure(signals)) continue;
    const { kind, reason } = NOVELTY_SIGNALS.get(signal);
    hints.push({
      hint_id: sourceKey(sourceId, `novelty-${kind}`),
      source_id: sourceId,
      kind,
      reason,
      source_refs: refs,
      authority: "hint_only"
    });
  }

  const activeRoutes = Object.keys(routeCounts).filter((route) => route !== "ignore" && routeCounts[route] > 0);
  if (activeRoutes.length > 1) {
    hints.push({
      hint_id: sourceKey(sourceId, "novelty-compound-route-pressure"),
      source_id: sourceId,
      kind: "compound_route_pressure",
      reason: "one source produced multiple downstream route pressures, so it should keep trace continuity",
      source_refs: refs,
      authority: "hint_only"
    });
  }

  return hints;
}

function attentionReasons(signals, routeCounts) {
  const reasons = [];
  if (signals.includes("farcaster_public_memory_risk") || signals.includes("public_posting_boundary")) {
    reasons.push("public-boundary signal needs early attention");
  }
  if (signals.includes("explicit_user_boundary")) {
    reasons.push("explicit user boundary should be preserved");
  }
  if (signals.includes("candidate_replay_failed") || signals.includes("repeated_failure_pattern")) {
    reasons.push("failure pattern may need damping, case, or repair handoff");
  }
  if (
    signals.includes("knowledge_gap")
    || signals.includes("research_needed")
    || signals.includes("user_correction")
  ) {
    reasons.push("knowledge gap or user correction may need research before behavior changes");
  }
  if (signals.includes("external_framework_change") || signals.includes("competitor_change")) {
    reasons.push("external change may be useful evolution pressure after replay");
  }
  if (signals.includes("reusable_workflow") && !hasPolicyPressure(signals)) {
    reasons.push("workflow signal may become a skill candidate after Qianxuesen checks");
  }
  if (Object.keys(routeCounts).length > 1) {
    reasons.push("multiple route pressures should keep source trace intact");
  }
  return reasons.length ? reasons : ["low-risk evidence can wait behind higher-priority sources"];
}

function attentionReasonsWithLedger(reasons, ledgerState) {
  if (ledgerState.ledger_status === "new_signal") return reasons;
  return [
    ...reasons,
    `ledger status: ${ledgerState.ledger_status}`,
    ledgerState.status_reason
  ];
}

function handoffModeFor(ledgerStatus) {
  if (ledgerStatus === "already_processed") return "suppress";
  if (ledgerStatus === "seen_open") return "merge_only";
  if (ledgerStatus === "new_signal") return "full_source";
  return "delta_only";
}

function downstreamForRecommendation(ledgerStatus) {
  if (ledgerStatus === "already_processed") return [];
  if (ledgerStatus === "seen_open") return ["merge_with_existing_open_item"];
  if (ledgerStatus === "recurring_after_fix" || ledgerStatus === "damping_repeated_to_case") {
    return ["repair-ticket:misa", "work-order:route"];
  }
  return ["distill:misa", "memory-layer:misa", "evolution:tournament:misa"];
}

function evidenceRefsForRecommendation(fingerprint) {
  if (fingerprint.ledger_status === "new_signal") {
    return fingerprint.source_refs;
  }
  if (fingerprint.new_evidence_refs.length > 0) {
    return fingerprint.new_evidence_refs;
  }
  return [];
}

function buildActionRecommendation(fingerprint) {
  return {
    recommendation_id: `recommendation-${fingerprint.fingerprint_id}`,
    fingerprint_id: fingerprint.fingerprint_id,
    ledger_status: fingerprint.ledger_status,
    priority: fingerprint.priority,
    recommended_action: fingerprint.recommended_action,
    handoff_mode: handoffModeFor(fingerprint.ledger_status),
    source_ids: fingerprint.source_ids,
    evidence_refs: evidenceRefsForRecommendation(fingerprint),
    downstream_targets: downstreamForRecommendation(fingerprint.ledger_status),
    rationale: fingerprint.status_reason,
    authority: "hint_only"
  };
}

function buildLedgerUpdateProposal(fingerprint, now) {
  const operation = fingerprint.handled_status === "not_seen" ? "insert" : "update";
  const proposedHandledStatus = fingerprint.ledger_status === "already_processed"
    ? fingerprint.handled_status
    : "open";

  return {
    proposal_id: `ledger-update-${fingerprint.fingerprint_id}`,
    operation,
    fingerprint_id: fingerprint.fingerprint_id,
    reason: fingerprint.ledger_status,
    set: {
      last_seen: now.toISOString(),
      seen_count: fingerprint.seen_count,
      handled_status: proposedHandledStatus
    },
    append: {
      evidence_refs: fingerprint.new_evidence_refs
    },
    no_write: true,
    authority: "proposal_only",
    rationale: fingerprint.ledger_status === "already_processed"
      ? "keep the prior handling result and only update sighting metadata if a human accepts it"
      : "ledger update is proposed so the next shadow pass can suppress repeats or detect recurrence"
  };
}

function reviewValueFor(sourceId, priority, signals, refs) {
  const publicBoundary = signals.includes("farcaster_public_memory_risk") || signals.includes("public_posting_boundary");
  const failurePattern = signals.includes("candidate_replay_failed") || signals.includes("repeated_failure_pattern");
  const workflowCandidate = signals.includes("reusable_workflow");
  const researchPressure = signals.includes("knowledge_gap")
    || signals.includes("research_needed")
    || signals.includes("user_correction")
    || signals.includes("external_framework_change")
    || signals.includes("competitor_change");
  const level = publicBoundary && priority >= 90
    ? "high"
    : failurePattern || workflowCandidate || researchPressure
      ? "medium"
      : "low";

  return {
    hint_id: sourceKey(sourceId, "review-value"),
    source_id: sourceId,
    level,
    expected_value: level === "high"
      ? "strong downstream review value because a public or authority boundary is present"
      : level === "medium"
        ? "possible downstream review value if Qianxuesen turns this into a repair, research digest, or skill candidate"
        : "deterministic routing should be enough unless later evidence changes",
    call_policy: level === "high" ? "optional_downstream_review" : "hint_only",
    source_refs: refs,
    authority: "hint_only"
  };
}

function tokenizeForDuplicate(text) {
  return uniqueStrings(String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/g)
    .filter((token) => token.length > 3));
}

function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function buildDuplicateClusters(distillation) {
  const fingerprints = distillation.distillates.map((distillate) => ({
    source_id: distillate.source_id,
    tokens: tokenizeForDuplicate([
      distillate.summary,
      ...(distillate.segments ?? []).map((segment) => segment.redacted_text)
    ].join(" "))
  }));
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < fingerprints.length; i += 1) {
    if (used.has(fingerprints[i].source_id)) continue;
    const members = [fingerprints[i].source_id];
    let maxSimilarity = 0;

    for (let j = i + 1; j < fingerprints.length; j += 1) {
      if (used.has(fingerprints[j].source_id)) continue;
      const similarity = jaccard(fingerprints[i].tokens, fingerprints[j].tokens);
      if (similarity >= 0.55) {
        members.push(fingerprints[j].source_id);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
    }

    if (members.length > 1) {
      for (const member of members) used.add(member);
      clusters.push({
        cluster_id: `duplicate-cluster-${String(clusters.length + 1).padStart(2, "0")}`,
        source_ids: members,
        similarity: Number(maxSimilarity.toFixed(3)),
        reason: "similar local source text should be reviewed as one attention cluster before downstream promotion",
        authority: "hint_only"
      });
    }
  }

  return clusters;
}

function checkResult(name, ok, reason) {
  return { name, ok, reason };
}

export function summarizePerceptionDigest(digest) {
  return {
    schema_version: digest.schema_version,
    digest_id: digest.digest_id,
    mode: digest.mode,
    shadow_only: digest.shadow_only,
    source_count: digest.summary.source_count,
    attention_queue_count: digest.summary.attention_queue_count,
    risk_hint_count: digest.summary.risk_hint_count,
    novelty_hint_count: digest.summary.novelty_hint_count,
    duplicate_cluster_count: digest.summary.duplicate_cluster_count,
    signal_fingerprint_count: digest.summary.signal_fingerprint_count,
    action_recommendation_count: digest.summary.action_recommendation_count,
    ledger_update_proposal_count: digest.summary.ledger_update_proposal_count,
    recurring_after_fix_count: digest.summary.recurring_after_fix_count,
    already_processed_count: digest.summary.already_processed_count,
    route_authority: digest.downstream_contract.route_authority,
    controller_authority: digest.downstream_contract.controller_authority,
    writes_persistent_memory: digest.safety.writes_persistent_memory,
    changes_route: digest.safety.changes_route,
    changes_winner: digest.safety.changes_winner,
    llm_api_calls: digest.safety.llm_api_calls,
    external_api_calls: digest.safety.external_api_calls,
    source_refs: digest.source_refs.map((source) => ({
      source_id: source.source_id,
      suggested_priority: source.suggested_priority
    }))
  };
}

export function attachPerceptionDigestToDistillation(distillation, digest) {
  return {
    ...distillation,
    perception_digest: summarizePerceptionDigest(digest)
  };
}

export async function readPerceptionDigest(filePath, { repoRoot = process.cwd() } = {}) {
  const target = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const raw = await fs.readFile(target, "utf8");
  return JSON.parse(raw);
}

export async function readSignalLedger(filePath, { repoRoot = process.cwd() } = {}) {
  if (!filePath) return { schema_version: "misa.signal_ledger.v1", entries: [] };
  const target = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const raw = await fs.readFile(target, "utf8");
  return JSON.parse(raw);
}

export async function buildPerceptionDigest({
  repoRoot = process.cwd(),
  sourceDir,
  sources,
  distillation,
  signalLedger,
  ledgerFile,
  now = new Date()
} = {}) {
  const distillationResult = distillation ?? await distillLocalMisaSources({
    repoRoot,
    sourceDir,
    sources,
    requireTemplateCoverage: false
  });
  const normalizedLedger = normalizeSignalLedger(signalLedger ?? await readSignalLedger(ledgerFile, { repoRoot }));

  const sourceIds = uniqueStrings([
    ...distillationResult.distillates.map((distillate) => distillate.source_id),
    ...distillationResult.learning_events.map((event) => event.source_id)
  ]).sort();
  const { distillateBySource, eventsBySource } = indexDistillationBySource(distillationResult);
  const sourceRefs = [];
  const riskHints = [];
  const noveltyHints = [];
  const attentionQueue = [];
  const reviewHints = [];
  const traceHints = [];
  const sourceRecords = [];

  for (const sourceId of sourceIds) {
    const distillate = distillateBySource.get(sourceId);
    const events = eventsBySource.get(sourceId) ?? [];
    const signals = signalsFor(distillate, events);
    const refs = sourceRefsFor(distillate, events);
    const routeCounts = countBy(events, (event) => event.expected_route);
    const fingerprint = sourceFingerprintFor({
      sourceKind: distillate?.source_kind ?? "unknown",
      routeCounts,
      signals
    });
    const priority = priorityFor(events, signals);

    sourceRecords.push({
      source_id: sourceId,
      source_kind: distillate?.source_kind ?? "unknown",
      source_refs: refs,
      observed_signals: signals,
      route_pressure: routeCounts,
      base_priority: priority,
      fingerprint_id: fingerprint.fingerprint_id,
      signal_family: fingerprint.family,
      route: fingerprint.route
    });

    riskHints.push(...buildRiskHints(sourceId, signals, refs, events));
    noveltyHints.push(...buildNoveltyHints(sourceId, signals, refs, routeCounts));
    reviewHints.push(reviewValueFor(sourceId, priority, signals, refs));
    traceHints.push({
      hint_id: sourceKey(sourceId, "trace-continuity"),
      source_id: sourceId,
      preserve_fields: [
        "source_id",
        "source_refs",
        "segment_ids",
        "parent_distillate_id",
        "artifact_evidence",
        "expected_route"
      ],
      source_refs: refs,
      reason: "downstream Qianxuesen routing and tournament checks need replayable source lineage",
      authority: "hint_only"
    });
  }

  const fingerprintGroups = new Map();
  for (const record of sourceRecords) {
    const group = fingerprintGroups.get(record.fingerprint_id) ?? {
      fingerprint_id: record.fingerprint_id,
      source_ids: [],
      source_kind: record.source_kind,
      route: record.route,
      signal_family: record.signal_family,
      observed_signals: [],
      source_refs: [],
      base_priority: 0
    };
    group.source_ids.push(record.source_id);
    group.observed_signals = uniqueStrings([...group.observed_signals, ...record.observed_signals]);
    group.source_refs = uniqueStrings([...group.source_refs, ...record.source_refs]);
    group.base_priority = Math.max(group.base_priority, record.base_priority);
    fingerprintGroups.set(record.fingerprint_id, group);
  }

  const signalFingerprints = [...fingerprintGroups.values()]
    .sort((a, b) => b.base_priority - a.base_priority || a.fingerprint_id.localeCompare(b.fingerprint_id))
    .map((fingerprint) => {
      const ledgerEntry = normalizedLedger.entries.get(fingerprint.fingerprint_id);
      const ledgerState = ledgerStatusFor(fingerprint, ledgerEntry);
      const priority = priorityWithLedger(fingerprint.base_priority, ledgerState);
      return {
        ...fingerprint,
        priority,
        ...ledgerState,
        authority: "hint_only"
      };
    });
  const fingerprintById = new Map(signalFingerprints.map((fingerprint) => [fingerprint.fingerprint_id, fingerprint]));
  const actionRecommendations = signalFingerprints
    .map((fingerprint) => buildActionRecommendation(fingerprint))
    .sort((a, b) => b.priority - a.priority || a.fingerprint_id.localeCompare(b.fingerprint_id));
  const ledgerUpdateProposals = signalFingerprints
    .map((fingerprint) => buildLedgerUpdateProposal(fingerprint, now))
    .sort((a, b) => a.fingerprint_id.localeCompare(b.fingerprint_id));

  for (const record of sourceRecords) {
    const fingerprint = fingerprintById.get(record.fingerprint_id);
    const priority = priorityWithLedger(record.base_priority, fingerprint);
    const baseReasons = attentionReasons(record.observed_signals, record.route_pressure);
    sourceRefs.push({
      source_id: record.source_id,
      source_kind: record.source_kind,
      source_refs: record.source_refs,
      observed_signals: record.observed_signals,
      route_pressure: record.route_pressure,
      signal_fingerprint_id: record.fingerprint_id,
      ledger_status: fingerprint.ledger_status,
      suggested_priority: priority,
      authority: "hint_only"
    });

    attentionQueue.push({
      item_id: sourceKey(record.source_id, "attention"),
      source_id: record.source_id,
      signal_fingerprint_id: record.fingerprint_id,
      ledger_status: fingerprint.ledger_status,
      recommended_action: fingerprint.recommended_action,
      priority,
      reasons: attentionReasonsWithLedger(baseReasons, fingerprint),
      suggested_downstream: downstreamForRecommendation(fingerprint.ledger_status),
      authority: "hint_only"
    });
  }

  attentionQueue.sort((a, b) => b.priority - a.priority || a.source_id.localeCompare(b.source_id));
  const duplicateClusters = buildDuplicateClusters(distillationResult);
  const checks = [
    checkResult("shadow_only", true, "perception produces hints only"),
    checkResult("no_live_effects", true, "perception does not write memory, Zilliz, Skills, services, or public channels"),
    checkResult("qianxuesen_authority_preserved", true, "route and winner authority remain downstream"),
    checkResult("has_source_refs", sourceRefs.every((source) => source.source_refs.length > 0), "every source should preserve replayable refs"),
    checkResult("no_api_calls", distillationResult.summary.llm_api_calls === 0 && distillationResult.summary.external_api_calls === 0, "initial perception is deterministic and provider-free")
  ];
  const violations = checks.filter((check) => !check.ok).map((check) => check.reason);

  return {
    schema_version: "misa.perception_digest.v1",
    digest_id: `perception-${now.toISOString().replace(/[:.]/g, "-")}`,
    mode: "shadow-perception-digest",
    generated_at: now.toISOString(),
    shadow_only: true,
    source_refs: sourceRefs,
    risk_hints: riskHints,
    novelty_hints: noveltyHints,
    duplicate_clusters: duplicateClusters,
    signal_fingerprints: signalFingerprints,
    action_recommendations: actionRecommendations,
    ledger_update_proposals: ledgerUpdateProposals,
    attention_queue: attentionQueue,
    expected_review_value_hints: reviewHints,
    trace_continuity_hints: traceHints,
    downstream_contract: {
      role: "sensor_prioritizer_only",
      route_authority: "qianxuesen",
      controller_authority: false,
      allowed_effects: ["produce_local_digest"],
      blocked_effects: BLOCKED_EFFECTS
    },
    summary: {
      source_count: sourceIds.length,
      learning_event_count: distillationResult.learning_events.length,
      attention_queue_count: attentionQueue.length,
      risk_hint_count: riskHints.length,
      novelty_hint_count: noveltyHints.length,
      duplicate_cluster_count: duplicateClusters.length,
      signal_fingerprint_count: signalFingerprints.length,
      action_recommendation_count: actionRecommendations.length,
      ledger_update_proposal_count: ledgerUpdateProposals.length,
      recurring_after_fix_count: signalFingerprints.filter((fingerprint) => fingerprint.ledger_status === "recurring_after_fix").length,
      already_processed_count: signalFingerprints.filter((fingerprint) => fingerprint.ledger_status === "already_processed").length,
      damping_repeated_to_case_count: signalFingerprints.filter((fingerprint) => fingerprint.ledger_status === "damping_repeated_to_case").length,
      high_review_value_count: reviewHints.filter((hint) => hint.level === "high").length,
      llm_api_calls: 0,
      external_api_calls: 0,
      production_authority: false
    },
    safety: {
      production_authority: false,
      writes_persistent_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      installs_skills: false,
      publication_allowed: false,
      changes_route: false,
      changes_winner: false,
      starts_services: false,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    checks,
    violations
  };
}
