import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyExtractedSignals,
  extractSignalsFromSession,
  reviewSignalExtractorFixtures
} from "../scripts/lib/signal-extractor.mjs";
import { loadMisaLearningFixtures, simulateLearningCycle } from "../scripts/lib/learning-loop.mjs";

const PRIMARY_P2_SIGNALS = [
  "public_posting_boundary",
  "farcaster_public_memory_risk",
  "reusable_workflow",
  "repeated_failure_pattern",
  "single_failure",
  "avoid_overreaction",
  "stable_user_preference",
  "stable_project_fact",
  "candidate_replay_failed"
];

test("signal extractor covers every hand-labeled misa-learning fixture signal without LLM calls", async () => {
  const review = await reviewSignalExtractorFixtures();

  assert.equal(review.ok, true);
  assert.equal(review.summary.fixture_count, 12);
  assert.equal(review.summary.unique_hand_signal_count, 17);
  assert.equal(review.summary.missed_signal_count, 0);
  assert.equal(review.summary.recall, 1);
  assert.equal(review.summary.llm_api_calls, 0);
  assert.equal(review.summary.external_api_calls, 0);
  assert.deepEqual(review.hand_signals, [
    "avoid_overreaction",
    "candidate_replay_failed",
    "explicit_feedback",
    "explicit_user_boundary",
    "project_recovery_sequence",
    "provider_timeout",
    "public_posting_boundary",
    "read_only_verification",
    "real_chat_validation_required",
    "repeated_failure_pattern",
    "retrieval_noise",
    "reusable_workflow",
    "single_failure",
    "stable_project_fact",
    "stable_user_preference",
    "timer_restore_boundary",
    "verified_project_state"
  ]);

  for (const signal of PRIMARY_P2_SIGNALS) {
    if (signal === "farcaster_public_memory_risk") {
      const publicMemoryRisk = extractSignalsFromSession(
        "A Farcaster public reply mentioned private project memory before posting."
      );
      assert.ok(publicMemoryRisk.signals.includes(signal), `missing primary P2 signal: ${signal}`);
    } else {
      assert.ok(review.extracted_signals.includes(signal), `missing primary P2 signal: ${signal}`);
    }
  }
});

test("signal extractor output can feed simulateLearningCycle when hand signals are absent", async () => {
  const fixtures = await loadMisaLearningFixtures({ includeDistilled: false });

  for (const fixture of fixtures) {
    const { signals, ...withoutSignals } = fixture;
    const extractedEvent = applyExtractedSignals(withoutSignals);
    const trace = simulateLearningCycle(extractedEvent);

    assert.equal(trace.route.target, fixture.expected_route, fixture.event_id);
    assert.equal(trace.result.status, fixture.expected_status, fixture.event_id);
    assert.equal(trace.route.publication_mode, fixture.expected_publication_mode, fixture.event_id);
    assert.equal(trace.candidate_review.state, fixture.expected_candidate_state, fixture.event_id);
    for (const signal of signals) {
      assert.ok(extractedEvent.signals.includes(signal), `${fixture.event_id} missed ${signal}`);
    }
  }
});

test("signal extractor stays deterministic for the same text input", () => {
  const text = "Provider read timeout appeared repeatedly; retry recovered during validation.";
  const first = extractSignalsFromSession(text);
  const second = extractSignalsFromSession(text);

  assert.deepEqual(first.signals, second.signals);
  assert.equal(first.safety.llm_api_calls, 0);
  assert.equal(first.safety.external_api_calls, 0);
});
