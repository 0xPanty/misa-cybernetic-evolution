#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INPUT = "examples/external-trajectory-online-shadow/generic-workflow-adapter/input.workflow-events.json";
const ROUTE_TIEBREAK_ORDER = Object.freeze([
  "policy",
  "damping",
  "case",
  "skill",
  "memory",
  "ignore"
]);

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-16T04:30:00.000Z").toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 100) || "unknown";
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function primaryRoute(routePressure = {}) {
  const rank = (route) => {
    const index = ROUTE_TIEBREAK_ORDER.indexOf(route);
    return index >= 0 ? index : ROUTE_TIEBREAK_ORDER.length;
  };
  const [route = "ignore"] = Object.entries(routePressure)
    .sort(([leftRoute, leftCount], [rightRoute, rightCount]) => (
      rightCount - leftCount
        || rank(leftRoute) - rank(rightRoute)
        || leftRoute.localeCompare(rightRoute)
    ))[0] ?? [];
  return route;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sourceRefFor(event) {
  const route = primaryRoute(event.route_pressure);
  const signalFamily = event.signal_family ?? event.risk?.kind ?? "custom_workflow_signal";
  return {
    source_id: event.event_id,
    source_kind: event.source_kind ?? "custom_workflow",
    source_refs: uniqueStrings(event.source_refs),
    observed_signals: uniqueStrings(event.observed_signals),
    route_pressure: event.route_pressure ?? { [route]: 1 },
    signal_fingerprint_id: `signal:${route}:${event.source_kind ?? "custom_workflow"}:${stableSlug(signalFamily)}`,
    ledger_status: "new_signal",
    suggested_priority: event.priority ?? 50,
    authority: "hint_only",
    full_perception_holdout: {
      source_project: event.source_project,
      repo: event.repo,
      time: asIsoDate(event.time),
      task_family: event.task_family
    }
  };
}

function hintFor(event, kind) {
  const value = event[kind];
  if (!value) return null;
  return {
    hint_id: `${event.event_id}-${kind}-${stableSlug(value.kind ?? kind)}`,
    source_id: event.event_id,
    kind: value.kind ?? kind,
    level: value.level ?? "medium",
    reason: value.reason ?? `${kind} signal should be reviewed before downstream learning`,
    source_refs: uniqueStrings(event.source_refs),
    authority: "hint_only"
  };
}

function reviewValueHintFor(event) {
  const value = event.expected_review_value;
  if (!value) return null;
  return {
    hint_id: `${event.event_id}-review-value`,
    source_id: event.event_id,
    level: value.level ?? "medium",
    expected_value: value.text ?? "custom workflow evidence may be useful after observe-only review",
    call_policy: "optional_downstream_review",
    source_refs: uniqueStrings(event.source_refs),
    authority: "hint_only"
  };
}

function traceHintFor(event) {
  return {
    hint_id: `${event.event_id}-trace-continuity`,
    source_id: event.event_id,
    preserve_fields: [
      "source_id",
      "source_project",
      "repo",
      "time",
      "task_family",
      "source_refs",
      "observed_signals",
      "route_pressure"
    ],
    source_refs: uniqueStrings(event.source_refs),
    reason: "custom workflow adapters should preserve enough lineage for later independent holdout review",
    authority: "hint_only"
  };
}

function signalFingerprintFor(event, sourceRef) {
  const route = primaryRoute(event.route_pressure);
  return {
    fingerprint_id: sourceRef.signal_fingerprint_id,
    source_ids: [event.event_id],
    source_kind: sourceRef.source_kind,
    route,
    signal_family: event.signal_family ?? "custom_workflow_signal",
    observed_signals: sourceRef.observed_signals,
    source_refs: sourceRef.source_refs,
    base_priority: sourceRef.suggested_priority,
    priority: sourceRef.suggested_priority,
    ledger_status: "new_signal",
    handled_status: "not_seen",
    handled_result: "none",
    seen_count: 1,
    new_evidence_refs: sourceRef.source_refs,
    priority_adjustment: 0,
    recommended_action: "send_to_external_trajectory_readout",
    status_reason: "new custom workflow signal with no prior ledger entry",
    authority: "hint_only"
  };
}

function actionRecommendationFor(event, sourceRef) {
  return {
    recommendation_id: `recommendation-${sourceRef.signal_fingerprint_id}`,
    fingerprint_id: sourceRef.signal_fingerprint_id,
    ledger_status: "new_signal",
    priority: sourceRef.suggested_priority,
    recommended_action: "send_to_external_trajectory_readout",
    handoff_mode: "full_source",
    source_ids: [event.event_id],
    evidence_refs: sourceRef.source_refs,
    downstream_targets: ["external:online-shadow"],
    rationale: "custom workflow evidence can be reviewed as observe-only trajectory pressure",
    authority: "hint_only"
  };
}

function ledgerProposalFor(event, sourceRef, generatedAt) {
  return {
    proposal_id: `ledger-update-${sourceRef.signal_fingerprint_id}`,
    operation: "insert",
    fingerprint_id: sourceRef.signal_fingerprint_id,
    reason: "new_signal",
    set: {
      last_seen: generatedAt,
      seen_count: 1,
      handled_status: "open"
    },
    append: {
      evidence_refs: sourceRef.source_refs
    },
    no_write: true,
    authority: "proposal_only",
    rationale: "ledger update is proposed only so future observe-only passes can recognize repeats"
  };
}

function attentionItemFor(event, sourceRef) {
  return {
    item_id: `${event.event_id}-attention`,
    source_id: event.event_id,
    signal_fingerprint_id: sourceRef.signal_fingerprint_id,
    ledger_status: "new_signal",
    recommended_action: "send_to_external_trajectory_readout",
    priority: sourceRef.suggested_priority,
    reasons: [
      "custom workflow signal should not become an automatic behavior change",
      "human review is useful before turning the signal into future calibration data"
    ],
    suggested_downstream: ["external:online-shadow"],
    authority: "hint_only"
  };
}

function countHighReviewValue(events) {
  return events.filter((event) => (event.priority ?? 0) >= 80).length;
}

export function buildGenericWorkflowPerceptionDigest({
  adapterInput,
  now = adapterInput?.generated_at ?? "2026-05-16T04:30:00.000Z"
} = {}) {
  if (!adapterInput) throw new Error("adapterInput is required");
  const generatedAt = asIsoDate(now);
  const events = adapterInput.events ?? [];
  const sourceRefs = events.map(sourceRefFor);
  const sourceById = new Map(sourceRefs.map((source) => [source.source_id, source]));
  const riskHints = events.map((event) => hintFor(event, "risk")).filter(Boolean);
  const noveltyHints = events.map((event) => hintFor(event, "novelty")).filter(Boolean);
  const expectedReviewValueHints = events.map(reviewValueHintFor).filter(Boolean);
  const traceContinuityHints = events.map(traceHintFor);
  const signalFingerprints = events.map((event) => signalFingerprintFor(event, sourceById.get(event.event_id)));
  const actionRecommendations = events.map((event) => actionRecommendationFor(event, sourceById.get(event.event_id)));
  const ledgerUpdateProposals = events.map((event) => ledgerProposalFor(event, sourceById.get(event.event_id), generatedAt));
  const attentionQueue = events.map((event) => attentionItemFor(event, sourceById.get(event.event_id)));

  return {
    schema_version: "misa.perception_digest.v1",
    digest_id: `${adapterInput.adapter_id ?? "generic-workflow"}-${generatedAt.replace(/[:.]/g, "-")}`,
    mode: "shadow-perception-digest",
    generated_at: generatedAt,
    shadow_only: true,
    source_refs: sourceRefs,
    risk_hints: riskHints,
    novelty_hints: noveltyHints,
    duplicate_clusters: [],
    signal_fingerprints: signalFingerprints,
    action_recommendations: actionRecommendations,
    ledger_update_proposals: ledgerUpdateProposals,
    attention_queue: attentionQueue,
    expected_review_value_hints: expectedReviewValueHints,
    trace_continuity_hints: traceContinuityHints,
    downstream_contract: {
      role: "sensor_prioritizer_only",
      route_authority: "qianxuesen",
      controller_authority: false,
      allowed_effects: ["produce_local_digest"],
      blocked_effects: [
        "persistent_memory_write",
        "zilliz_write",
        "embedding_creation",
        "skill_installation",
        "public_publish",
        "provider_route_change",
        "winner_change",
        "route_change",
        "service_start"
      ]
    },
    summary: {
      source_count: sourceRefs.length,
      learning_event_count: sourceRefs.length,
      attention_queue_count: attentionQueue.length,
      risk_hint_count: riskHints.length,
      novelty_hint_count: noveltyHints.length,
      duplicate_cluster_count: 0,
      signal_fingerprint_count: signalFingerprints.length,
      action_recommendation_count: actionRecommendations.length,
      ledger_update_proposal_count: ledgerUpdateProposals.length,
      recurring_after_fix_count: 0,
      already_processed_count: 0,
      damping_repeated_to_case_count: 0,
      high_review_value_count: countHighReviewValue(events),
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
    checks: [
      {
        name: "generic workflow adapter stays observe-only",
        ok: true,
        reason: "adapter output is sanitized signal evidence, not execution authority"
      }
    ],
    violations: []
  };
}

const isCli = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  const inputPath = readArg("input") ?? DEFAULT_INPUT;
  const input = await readJson(inputPath);
  const nowArg = readArg("now");
  const digest = buildGenericWorkflowPerceptionDigest({
    adapterInput: input,
    now: nowArg ?? input.generated_at
  });
  const outFile = readArg("out-file");
  if (outFile) {
    await writeJson(outFile, digest);
  }
  if (hasArg("json")) {
    console.log(JSON.stringify(digest, null, 2));
  } else {
    console.log(`generic-workflow-adapter ok=${digest.violations.length === 0}`);
    console.log(`digest_id=${digest.digest_id}`);
    console.log(`source_count=${digest.summary.source_count}`);
    console.log(`risk_hint_count=${digest.summary.risk_hint_count}`);
    console.log(`novelty_hint_count=${digest.summary.novelty_hint_count}`);
    console.log(`llm_api_calls=${digest.summary.llm_api_calls}`);
    console.log(`external_api_calls=${digest.summary.external_api_calls}`);
    console.log(`production_authority=${digest.summary.production_authority}`);
    if (outFile) console.log(`out_file=${outFile}`);
  }
}
