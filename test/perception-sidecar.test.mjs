import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  attachPerceptionDigestToDistillation,
  buildPerceptionDigest
} from "../scripts/lib/perception-sidecar.mjs";
import { distillMisaSources } from "../scripts/lib/session-distiller.mjs";
import {
  PERCEPTION_NOVELTY_SIGNAL_HINTS,
  PERCEPTION_RISK_SIGNAL_HINTS,
  PERCEPTION_ROUTE_PRIORITY,
  PERCEPTION_SIGNAL_FAMILIES
} from "../scripts/lib/signal-taxonomy.mjs";

test("perception signal taxonomy centralizes risk, novelty, family, and priority constants", () => {
  assert.equal(PERCEPTION_ROUTE_PRIORITY.policy > PERCEPTION_ROUTE_PRIORITY.memory, true);
  assert.equal(PERCEPTION_RISK_SIGNAL_HINTS.length, 10);
  assert.equal(PERCEPTION_NOVELTY_SIGNAL_HINTS.length, 9);
  assert.equal(PERCEPTION_SIGNAL_FAMILIES.length, 15);
  assert.ok(PERCEPTION_RISK_SIGNAL_HINTS.some(([signal, hint]) => (
    signal === "farcaster_public_memory_risk"
    && hint.kind === "public_boundary"
    && hint.level === "high"
  )));
  assert.ok(PERCEPTION_SIGNAL_FAMILIES.some(([family, signals]) => (
    family === "workflow"
    && signals.includes("reusable_workflow")
  )));
  assert.ok(PERCEPTION_SIGNAL_FAMILIES.some(([family, signals]) => (
    family === "knowledge_gap"
    && signals.includes("research_needed")
  )));
});

function source(overrides) {
  return {
    schema_version: "misa.local_distillation_source.v1",
    source_id: overrides.source_id,
    source_kind: overrides.source_kind ?? "chat_window",
    channel: overrides.channel ?? "local",
    created_at: "2026-05-14T00:00:00Z",
    local_only: true,
    uses_zilliz_proxy: false,
    vector_lookup_required: false,
    raw_window_default: false,
    redaction_status: "redacted",
    redaction_note: "test fixture with no secrets",
    artifact_evidence: {
      injected: [],
      read: overrides.read ?? [`fixture:${overrides.source_id}`],
      modified: [],
      tool_errors: overrides.tool_errors ?? []
    },
    turns: overrides.turns
  };
}

test("perception digest prioritizes public and failure signals without controller authority", async () => {
  const digest = await buildPerceptionDigest({
    now: new Date("2026-05-14T00:00:00Z"),
    sources: [
      source({
        source_id: "public-memory-risk",
        source_kind: "farcaster_audit",
        channel: "farcaster",
        turns: [
          {
            speaker: "audit",
            ref: "farcaster:audit:001",
            text: "Candidate public reply mentioned private project memory. Block public memory risk before posting."
          }
        ]
      }),
      source({
        source_id: "provider-timeout-repeat",
        source_kind: "failure_log",
        tool_errors: ["tool:provider-timeout"],
        turns: [
          {
            speaker: "system",
            ref: "failure:provider:001",
            text: "Provider read timeout failed twice during local validation. Retry recovered before any route change."
          }
        ]
      })
    ]
  });

  assert.equal(digest.mode, "shadow-perception-digest");
  assert.equal(digest.shadow_only, true);
  assert.equal(digest.downstream_contract.role, "sensor_prioritizer_only");
  assert.equal(digest.downstream_contract.route_authority, "qianxuesen");
  assert.equal(digest.downstream_contract.controller_authority, false);
  assert.equal(digest.safety.writes_persistent_memory, false);
  assert.equal(digest.safety.changes_route, false);
  assert.equal(digest.safety.changes_winner, false);
  assert.equal(digest.summary.llm_api_calls, 0);
  assert.equal(digest.summary.external_api_calls, 0);
  assert.deepEqual(digest.violations, []);
  assert.equal(digest.attention_queue[0].source_id, "public-memory-risk");
  assert.ok(digest.risk_hints.some((hint) => hint.kind === "public_boundary" && hint.level === "high"));
  assert.ok(digest.risk_hints.some((hint) => hint.kind === "reliability_failure"));
  assert.ok(digest.expected_review_value_hints.some((hint) => hint.source_id === "public-memory-risk" && hint.level === "high"));
  assert.ok(digest.trace_continuity_hints.every((hint) => hint.preserve_fields.includes("source_refs")));
});

test("perception digest clusters duplicate local evidence before downstream promotion", async () => {
  const digest = await buildPerceptionDigest({
    now: new Date("2026-05-14T00:00:00Z"),
    sources: [
      source({
        source_id: "duplicate-workflow-a",
        turns: [
          {
            speaker: "codex",
            ref: "dup:a",
            text: "Reusable workflow: validate schemas, run precheck, run tests, then hand off local evidence."
          }
        ]
      }),
      source({
        source_id: "duplicate-workflow-b",
        turns: [
          {
            speaker: "codex",
            ref: "dup:b",
            text: "Reusable workflow: validate schemas, run precheck, run tests, then hand off local evidence."
          }
        ]
      })
    ]
  });

  assert.equal(digest.summary.duplicate_cluster_count, 1);
  assert.deepEqual(digest.duplicate_clusters[0].source_ids, ["duplicate-workflow-a", "duplicate-workflow-b"]);
  assert.equal(digest.duplicate_clusters[0].authority, "hint_only");
});

test("distillation can carry a perception summary without changing learning events", async () => {
  const sources = [
    source({
      source_id: "workflow-carry",
      turns: [
        {
          speaker: "codex",
          ref: "workflow:carry:001",
          text: "Reusable workflow: collect source refs, validate schemas, run precheck, and hold for review."
        }
      ]
    })
  ];
  const distillation = await distillMisaSources(sources, { requireTemplateCoverage: false });
  const digest = await buildPerceptionDigest({
    now: new Date("2026-05-14T00:00:00Z"),
    distillation
  });
  const attached = attachPerceptionDigestToDistillation(distillation, digest);

  assert.deepEqual(
    attached.learning_events.map((event) => event.event_id),
    distillation.learning_events.map((event) => event.event_id)
  );
  assert.equal(attached.perception_digest.shadow_only, true);
  assert.equal(attached.perception_digest.route_authority, "qianxuesen");
  assert.equal(attached.perception_digest.changes_route, false);
});

test("shadow calibration separates optimization signals from noise deterministically", async () => {
  const signatures = [];

  for (let i = 0; i < 5; i += 1) {
    const digest = await buildPerceptionDigest({
      sourceDir: path.join("test", "fixtures", "perception", "shadow-sources"),
      now: new Date("2026-05-14T02:00:00Z")
    });
    const ordered = digest.attention_queue.map((item) => item.source_id);
    signatures.push(ordered.join(">"));

    assert.equal(digest.summary.source_count, 10);
    assert.equal(digest.summary.learning_event_count, 10);
    assert.equal(digest.downstream_contract.controller_authority, false);
    assert.equal(digest.safety.writes_persistent_memory, false);
    assert.equal(digest.safety.changes_route, false);
    assert.equal(digest.safety.changes_winner, false);
    assert.equal(digest.summary.llm_api_calls, 0);
    assert.equal(digest.summary.external_api_calls, 0);
    assert.deepEqual(digest.violations, []);

    assert.deepEqual(ordered.slice(0, 5), [
      "shadow-public-memory-risk-001",
      "shadow-public-memory-risk-discord-010",
      "shadow-candidate-replay-failed-002",
      "shadow-provider-timeout-repeat-003",
      "shadow-work-order-router-drift-009"
    ]);
    assert.deepEqual(ordered.slice(-2), [
      "shadow-background-note-noise-008",
      "shadow-smalltalk-noise-007"
    ]);

    const topPriorities = digest.attention_queue.slice(0, 5).map((item) => item.priority);
    const noisePriorities = digest.attention_queue.slice(-2).map((item) => item.priority);
    assert.ok(Math.min(...topPriorities) > Math.max(...noisePriorities));
    assert.ok(digest.expected_review_value_hints.some((hint) => hint.source_id === "shadow-public-memory-risk-001" && hint.level === "high"));
    assert.ok(digest.expected_review_value_hints.every((hint) => {
      if (hint.source_id.includes("noise")) return hint.level === "low";
      return true;
    }));
    assert.ok(digest.duplicate_clusters.some((cluster) => {
      const ids = cluster.source_ids;
      return ids.includes("shadow-repeatable-validation-workflow-a-004")
        && ids.includes("shadow-repeatable-validation-workflow-b-005");
    }));
  }

  assert.equal(new Set(signatures).size, 1);
});

test("signal ledger marks handled repeats, recurrence, and damping escalation", async () => {
  const digest = await buildPerceptionDigest({
    sourceDir: path.join("test", "fixtures", "perception", "shadow-sources"),
    ledgerFile: path.join("test", "fixtures", "perception", "handled-signal-ledger.json"),
    now: new Date("2026-05-14T02:10:00Z")
  });
  const byFingerprint = new Map(digest.signal_fingerprints.map((item) => [item.fingerprint_id, item]));
  const publicRisk = byFingerprint.get("signal:policy:farcaster_audit:public_memory_risk");
  const replayFailed = byFingerprint.get("signal:damping:failure_log:candidate_replay_failed");
  const styleMemory = byFingerprint.get("signal:memory:chat_window:user_preference");
  const workflow = byFingerprint.get("signal:skill:chat_window:workflow");

  assert.equal(publicRisk.ledger_status, "recurring_after_fix");
  assert.equal(publicRisk.recommended_action, "open_recurrence_repair_or_work_order");
  assert.deepEqual(publicRisk.new_evidence_refs, ["shadow:farcaster:reply:001", "shadow:farcaster:reply:002"]);

  assert.equal(replayFailed.ledger_status, "damping_repeated_to_case");
  assert.equal(replayFailed.recommended_action, "promote_from_damping_to_case_or_repair_review");
  assert.equal(replayFailed.seen_count, 3);

  assert.equal(styleMemory.ledger_status, "already_processed");
  assert.equal(styleMemory.recommended_action, "suppress_and_update_seen_count");
  assert.deepEqual(styleMemory.new_evidence_refs, []);

  assert.equal(workflow.ledger_status, "seen_with_new_evidence");
  assert.equal(workflow.recommended_action, "merge_delta_then_send_to_qianxuesen");
  assert.deepEqual(workflow.new_evidence_refs, [
    "shadow:workflow:validation:a",
    "shadow:workflow:validation:b"
  ]);

  const styleAttention = digest.attention_queue.find((item) => item.source_id === "shadow-stable-style-memory-006");
  const noiseAttention = digest.attention_queue.find((item) => item.source_id === "shadow-smalltalk-noise-007");
  assert.ok(styleAttention.priority < noiseAttention.priority);
  assert.deepEqual(styleAttention.suggested_downstream, []);
  assert.equal(digest.summary.recurring_after_fix_count, 1);
  assert.equal(digest.summary.already_processed_count, 1);
  assert.equal(digest.summary.damping_repeated_to_case_count, 1);
  assert.equal(digest.summary.action_recommendation_count, digest.summary.signal_fingerprint_count);
  assert.equal(digest.summary.ledger_update_proposal_count, digest.summary.signal_fingerprint_count);

  const recommendations = new Map(digest.action_recommendations.map((item) => [item.fingerprint_id, item]));
  const publicRiskRecommendation = recommendations.get("signal:policy:farcaster_audit:public_memory_risk");
  const replayRecommendation = recommendations.get("signal:damping:failure_log:candidate_replay_failed");
  const workflowRecommendation = recommendations.get("signal:skill:chat_window:workflow");
  const styleRecommendation = recommendations.get("signal:memory:chat_window:user_preference");

  assert.equal(publicRiskRecommendation.handoff_mode, "delta_only");
  assert.deepEqual(publicRiskRecommendation.downstream_targets, ["repair-ticket:misa", "work-order:route"]);
  assert.deepEqual(publicRiskRecommendation.evidence_refs, ["shadow:farcaster:reply:001", "shadow:farcaster:reply:002"]);

  assert.equal(replayRecommendation.handoff_mode, "delta_only");
  assert.deepEqual(replayRecommendation.downstream_targets, ["repair-ticket:misa", "work-order:route"]);
  assert.deepEqual(replayRecommendation.evidence_refs, ["shadow:replay:failed:002"]);

  assert.equal(workflowRecommendation.handoff_mode, "delta_only");
  assert.deepEqual(workflowRecommendation.downstream_targets, ["distill:misa", "memory-layer:misa", "evolution:tournament:misa"]);
  assert.deepEqual(workflowRecommendation.evidence_refs, ["shadow:workflow:validation:a", "shadow:workflow:validation:b"]);

  assert.equal(styleRecommendation.handoff_mode, "suppress");
  assert.deepEqual(styleRecommendation.downstream_targets, []);
  assert.deepEqual(styleRecommendation.evidence_refs, []);

  const proposals = new Map(digest.ledger_update_proposals.map((item) => [item.fingerprint_id, item]));
  assert.equal(proposals.get("signal:policy:farcaster_audit:public_memory_risk").operation, "update");
  assert.equal(proposals.get("signal:policy:farcaster_audit:public_memory_risk").set.handled_status, "open");
  assert.equal(proposals.get("signal:memory:chat_window:user_preference").set.handled_status, "handled");
  assert.equal(proposals.get("signal:memory:chat_window:user_preference").no_write, true);
  assert.equal(digest.safety.llm_api_calls, 0);
  assert.equal(digest.safety.external_api_calls, 0);
});

test("perception action-like outputs stay non-executable hints and proposals", async () => {
  const digest = await buildPerceptionDigest({
    sourceDir: path.join("test", "fixtures", "perception", "shadow-sources"),
    ledgerFile: path.join("test", "fixtures", "perception", "handled-signal-ledger.json"),
    now: new Date("2026-05-14T02:20:00Z")
  });

  assert.equal(digest.downstream_contract.role, "sensor_prioritizer_only");
  assert.equal(digest.downstream_contract.controller_authority, false);
  assert.deepEqual(digest.downstream_contract.allowed_effects, ["produce_local_digest"]);
  assert.ok(digest.downstream_contract.blocked_effects.includes("persistent_memory_write"));
  assert.ok(digest.downstream_contract.blocked_effects.includes("zilliz_write"));
  assert.ok(digest.downstream_contract.blocked_effects.includes("public_publish"));
  assert.ok(digest.downstream_contract.blocked_effects.includes("route_change"));
  assert.equal(digest.safety.changes_route, false);
  assert.equal(digest.safety.changes_winner, false);
  assert.equal(digest.safety.writes_persistent_memory, false);
  assert.equal(digest.safety.writes_zilliz, false);
  assert.equal(digest.safety.publication_allowed, false);

  assert.equal(digest.action_recommendations.length > 0, true);
  assert.equal(digest.action_recommendations.every((item) => item.authority === "hint_only"), true);
  assert.equal(digest.action_recommendations.every((item) => !("execute" in item)), true);
  assert.equal(digest.action_recommendations.every((item) => !("write" in item)), true);

  assert.equal(digest.attention_queue.length > 0, true);
  assert.equal(digest.attention_queue.every((item) => item.authority === "hint_only"), true);
  assert.equal(digest.attention_queue.every((item) => Array.isArray(item.suggested_downstream)), true);

  assert.equal(digest.ledger_update_proposals.length > 0, true);
  assert.equal(digest.ledger_update_proposals.every((proposal) => proposal.authority === "proposal_only"), true);
  assert.equal(digest.ledger_update_proposals.every((proposal) => proposal.no_write === true), true);
  assert.equal(digest.ledger_update_proposals.every((proposal) => !("write_allowed" in proposal)), true);
  assert.equal(digest.ledger_update_proposals.every((proposal) => !("auto_apply" in proposal)), true);
});
