import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { buildCuriositySignalGateFromDigest } from "../scripts/lib/curiosity-signal-gate.mjs";
import { buildPerceptionDigest } from "../scripts/lib/perception-sidecar.mjs";
import { loadVpsConversationSources } from "../scripts/lib/vps-conversation-sources.mjs";

const REVIEW_WORTHY_SHADOW_SOURCES = [
  "shadow-public-memory-risk-001",
  "shadow-candidate-replay-failed-002",
  "shadow-provider-timeout-repeat-003",
  "shadow-repeatable-validation-workflow-a-004",
  "shadow-repeatable-validation-workflow-b-005",
  "shadow-work-order-router-drift-009",
  "shadow-public-memory-risk-discord-010"
];

const NOISE_SHADOW_SOURCES = [
  "shadow-smalltalk-noise-007",
  "shadow-background-note-noise-008"
];

const REVIEW_WORTHY_REALISTIC_SOURCES = [
  "curiosity-farcaster-protocol-drift-001",
  "curiosity-langgraph-doc-drift-002",
  "curiosity-user-correction-qianxuesen-003",
  "curiosity-competitor-change-agent-framework-004"
];

const NOISE_REALISTIC_SOURCES = [
  "curiosity-one-off-buzzword-noise-005",
  "curiosity-marketing-note-noise-006",
  "curiosity-term-only-noise-007"
];

function bySource(gate) {
  return new Map(gate.source_decisions.map((decision) => [decision.source_id, decision]));
}

test("curiosity signal gate catches high-value shadow signals without selecting noise", async () => {
  const signatures = [];

  for (let round = 0; round < 5; round += 1) {
    const digest = await buildPerceptionDigest({
      sourceDir: path.join("test", "fixtures", "perception", "shadow-sources"),
      ledgerFile: path.join("test", "fixtures", "perception", "handled-signal-ledger.json"),
      now: new Date(`2026-05-14T03:0${round}:00Z`)
    });
    const gate = buildCuriositySignalGateFromDigest(digest, {
      expectedReviewWorthySourceIds: REVIEW_WORTHY_SHADOW_SOURCES,
      expectedNoiseSourceIds: NOISE_SHADOW_SOURCES
    });
    const decisions = bySource(gate);

    signatures.push(gate.source_decisions.map((decision) => `${decision.source_id}:${decision.decision}`).join(">"));
    assert.equal(gate.ok, true);
    assert.equal(gate.summary.evaluated_source_count, 10);
    assert.equal(gate.summary.llm_variant_generation_count, 3);
    assert.equal(gate.summary.deterministic_review_optional_count, 4);
    assert.equal(gate.summary.review_worthy_count, 7);
    assert.equal(gate.summary.missed_review_worthy_count, 0);
    assert.equal(gate.summary.noise_selected_count, 0);
    assert.equal(gate.summary.llm_api_calls, 0);
    assert.equal(gate.safety.production_authority, false);
    assert.equal(gate.safety.changes_route, false);
    assert.equal(gate.safety.changes_winner, false);

    assert.equal(decisions.get("shadow-public-memory-risk-001").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("shadow-candidate-replay-failed-002").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("shadow-public-memory-risk-discord-010").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("shadow-provider-timeout-repeat-003").decision, "deterministic_review_optional");
    assert.equal(decisions.get("shadow-repeatable-validation-workflow-a-004").decision, "deterministic_review_optional");
    assert.equal(decisions.get("shadow-stable-style-memory-006").decision, "suppress_as_already_handled");
    assert.equal(decisions.get("shadow-smalltalk-noise-007").decision, "suppress_as_low_value_noise");
    assert.equal(decisions.get("shadow-background-note-noise-008").decision, "suppress_as_low_value_noise");
  }

  assert.equal(new Set(signatures).size, 1);
});

test("curiosity signal gate treats VPS sanitized samples as review-worthy without provider calls", async () => {
  const sources = await loadVpsConversationSources({
    rawDir: path.join("test", "fixtures", "evolution", "vps-real-conversation-source")
  });
  const digest = await buildPerceptionDigest({
    sources,
    now: new Date("2026-05-14T04:00:00Z")
  });
  const gate = buildCuriositySignalGateFromDigest(digest);
  const decisions = bySource(gate);

  assert.equal(gate.ok, true);
  assert.equal(gate.summary.evaluated_source_count, 3);
  assert.equal(gate.summary.review_worthy_count, 3);
  assert.equal(gate.summary.llm_variant_generation_count, 1);
  assert.equal(gate.summary.deterministic_review_optional_count, 2);
  assert.equal(gate.summary.missed_review_worthy_count, 0);
  assert.equal(gate.summary.noise_selected_count, 0);
  assert.equal(gate.safety.llm_api_calls, 0);
  assert.equal(gate.safety.external_api_calls, 0);

  assert.equal(
    decisions.get("vps-offline-higher-order-4b-sanitized-public-boundary").decision,
    "llm_variant_generation_recommended"
  );
  assert.equal(
    decisions.get("vps-live-higher-order-sanitized-higher-order-case").decision,
    "deterministic_review_optional"
  );
  assert.equal(
    decisions.get("vps-live-edge-redaction-sanitized-redaction-workflow").decision,
    "deterministic_review_optional"
  );
});

test("curiosity signal gate catches external-change and knowledge-gap pressure without buzzword noise", async () => {
  const signatures = [];

  for (let round = 0; round < 5; round += 1) {
    const digest = await buildPerceptionDigest({
      sourceDir: path.join("test", "fixtures", "perception", "curiosity-realistic-sources"),
      now: new Date(`2026-05-14T05:1${round}:00Z`)
    });
    const gate = buildCuriositySignalGateFromDigest(digest, {
      expectedReviewWorthySourceIds: REVIEW_WORTHY_REALISTIC_SOURCES,
      expectedNoiseSourceIds: NOISE_REALISTIC_SOURCES
    });
    const decisions = bySource(gate);

    signatures.push(gate.source_decisions.map((decision) => `${decision.source_id}:${decision.decision}`).join(">"));
    assert.equal(gate.ok, true);
    assert.equal(gate.summary.evaluated_source_count, 7);
    assert.equal(gate.summary.llm_variant_generation_count, 4);
    assert.equal(gate.summary.deterministic_review_optional_count, 0);
    assert.equal(gate.summary.review_worthy_count, 4);
    assert.equal(gate.summary.missed_review_worthy_count, 0);
    assert.equal(gate.summary.noise_selected_count, 0);
    assert.equal(gate.summary.llm_api_calls, 0);
    assert.equal(gate.safety.external_api_calls, 0);
    assert.equal(gate.safety.changes_route, false);
    assert.equal(gate.safety.changes_winner, false);

    assert.equal(decisions.get("curiosity-farcaster-protocol-drift-001").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("curiosity-langgraph-doc-drift-002").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("curiosity-user-correction-qianxuesen-003").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("curiosity-competitor-change-agent-framework-004").decision, "llm_variant_generation_recommended");
    assert.equal(decisions.get("curiosity-one-off-buzzword-noise-005").decision, "ordinary_candidate_flow");
    assert.equal(decisions.get("curiosity-marketing-note-noise-006").decision, "suppress_as_low_value_noise");
    assert.equal(decisions.get("curiosity-term-only-noise-007").decision, "suppress_as_low_value_noise");

    assert.equal(
      decisions.get("curiosity-langgraph-doc-drift-002").observed_signals.includes("external_framework_change"),
      true
    );
    assert.equal(
      decisions.get("curiosity-user-correction-qianxuesen-003").observed_signals.includes("user_correction"),
      true
    );
    assert.equal(
      decisions.get("curiosity-competitor-change-agent-framework-004").observed_signals.includes("competitor_change"),
      true
    );
    assert.equal(
      decisions.get("curiosity-term-only-noise-007").review_worthy,
      false
    );
  }

  assert.equal(new Set(signatures).size, 1);
});
