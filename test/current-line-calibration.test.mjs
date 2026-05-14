import assert from "node:assert/strict";
import { test } from "node:test";
import { runCurrentLineCalibration } from "../scripts/lib/current-line-calibration.mjs";

test("current-line calibration runs redacted samples in shadow mode", async () => {
  const result = await runCurrentLineCalibration({
    now: new Date("2026-05-14T00:00:00Z")
  });
  const byId = new Map(result.sample_sets.map((sample) => [sample.sample_set_id, sample]));

  assert.equal(result.mode, "current-line-calibration");
  assert.equal(result.ok, true);
  assert.equal(result.summary.sample_set_count, 5);
  assert.equal(result.summary.source_count, 18);
  assert.equal(result.summary.atomic_lesson_count, 49);
  assert.equal(result.summary.repair_ticket_count, 5);
  assert.equal(result.summary.work_order_count, 5);
  assert.equal(result.summary.tournament_count, 49);
  assert.equal(result.summary.signal_layer_count, 6);
  assert.equal(result.summary.observed_signal_count, 9);
  assert.equal(result.summary.perception_replay_count, 1);
  assert.equal(result.summary.perception_replay_ok, true);
  assert.equal(result.summary.perception_attention_queue_count, 10);
  assert.equal(result.summary.perception_duplicate_cluster_count, 1);
  assert.equal(result.summary.perception_recurring_after_fix_count, 1);
  assert.equal(result.summary.perception_already_processed_count, 1);
  assert.equal(result.summary.perception_damping_repeated_to_case_count, 1);
  assert.equal(result.summary.retrieval_probe_count, 5);
  assert.equal(result.summary.retrieval_top1_exact_recall, 1);
  assert.deepEqual(result.summary.route_counts, {
    case: 11,
    damping: 5,
    memory: 12,
    policy: 11,
    skill: 10
  });
  assert.equal(result.summary.judge_recommended_count, 2);
  assert.equal(result.summary.judge_near_threshold_count, 3);
  assert.equal(result.summary.high_value_llm_review_count, 2);
  assert.equal(result.summary.production_authority, false);
  assert.equal(result.summary.publication_allowed, false);
  assert.equal(result.summary.live_effect_allowed, false);
  assert.equal(result.summary.zilliz_written, false);
  assert.equal(result.summary.embedding_created, false);
  assert.equal(result.summary.writes_persistent_memory, false);
  assert.equal(result.summary.external_api_calls, 0);
  assert.equal(result.summary.llm_api_calls, 0);
  assert.deepEqual(Object.keys(result.summary.signal_counts).sort(), [
    "avoid_overreaction",
    "explicit_user_boundary",
    "farcaster_public_memory_risk",
    "public_posting_boundary",
    "repeated_failure_pattern",
    "reusable_workflow",
    "single_failure",
    "stable_project_fact",
    "stable_user_preference"
  ]);
  assert.deepEqual(result.signal_layers.map((layer) => layer.layer_id), [
    "source_distillation_signals",
    "qianxuesen_route_signals",
    "shadow_perception_signals",
    "work_order_signals",
    "retrieval_ranker_signals",
    "tournament_quality_signals"
  ]);
  assert.equal(
    result.signal_layers.find((layer) => layer.layer_id === "shadow_perception_signals").authority,
    "hint_only"
  );
  assert.deepEqual(
    result.signal_layers.find((layer) => layer.layer_id === "shadow_perception_signals").taxonomy,
    {
      risk_signal_count: 5,
      novelty_signal_count: 4,
      signal_family_count: 10
    }
  );
  assert.deepEqual(
    result.signal_layers.find((layer) => layer.layer_id === "shadow_perception_signals").replay,
    {
      ok: true,
      source_count: 10,
      attention_queue_count: 10,
      duplicate_cluster_count: 1,
      top_attention_source_id: "shadow-candidate-replay-failed-002"
    }
  );
  assert.equal(
    result.signal_layers.find((layer) => layer.layer_id === "retrieval_ranker_signals").ranking_inputs.includes("lexical_intent_match"),
    true
  );
  assert.equal(
    result.signal_layers.find((layer) => layer.layer_id === "tournament_quality_signals").production_authority,
    false
  );

  for (const sample of result.sample_sets) {
    assert.equal(sample.ok, true, sample.sample_set_id);
    assert.ok(Object.keys(sample.source.signal_counts).length > 0, sample.sample_set_id);
    assert.equal(sample.retrieval_probe.top1_exact_match, true, sample.sample_set_id);
    assert.equal(sample.retrieval_probe.top1_kind_match, true, sample.sample_set_id);
    assert.equal(sample.retrieval_probe.safety.zilliz_written, false);
    assert.equal(sample.retrieval_probe.safety.embedding_created, false);
    assert.equal(sample.work_order.durable_or_public_effect_allowed, false);
    assert.equal(sample.tournament.production_authority, false);
    assert.equal(sample.tournament.judge.llm_api_calls, 0);
  }

  assert.equal(byId.get("default_redacted_examples").tournament.judge_escalation.near_threshold, true);
  assert.equal(byId.get("default_redacted_examples").tournament.judge_escalation.llm_review_value, "medium");
  assert.equal(byId.get("route_sensitive_sources").tournament.judge_escalation.recommended, true);
  assert.equal(byId.get("route_sensitive_sources").tournament.judge_escalation.llm_review_value, "high");
  assert.equal(byId.get("judge_calibration_sources").tournament.judge_escalation.near_threshold, true);
  assert.equal(byId.get("vps_sanitized_conversation").source.source_kind, "vps_sanitized_conversation_artifacts");
  assert.equal(byId.get("vps_sanitized_conversation").tournament.judge_escalation.recommended, true);
  assert.equal(byId.get("redacted_holdout_samples").source.source_count, 4);
  assert.deepEqual(byId.get("redacted_holdout_samples").tournament.route_counts, {
    case: 1,
    damping: 1,
    memory: 3,
    policy: 1,
    skill: 1
  });
  assert.equal(byId.get("redacted_holdout_samples").tournament.judge_escalation.recommended, false);
  assert.equal(byId.get("redacted_holdout_samples").tournament.judge_escalation.near_threshold, true);
  assert.equal(byId.get("redacted_holdout_samples").tournament.judge_escalation.llm_review_value, "medium");

  assert.equal(result.perception_shadow_replay.ok, true);
  assert.equal(result.perception_shadow_replay.top_attention_source_id, "shadow-candidate-replay-failed-002");
  assert.deepEqual(result.perception_shadow_replay.ledger_statuses, {
    public_memory_risk: "recurring_after_fix",
    candidate_replay_failed: "damping_repeated_to_case",
    stable_style_memory: "already_processed",
    repeatable_workflow: "seen_with_new_evidence"
  });
  assert.equal(result.perception_shadow_replay.safety.production_authority, false);
  assert.equal(result.perception_shadow_replay.safety.writes_persistent_memory, false);
  assert.equal(result.perception_shadow_replay.safety.writes_zilliz, false);
  assert.equal(result.perception_shadow_replay.safety.changes_route, false);
  assert.equal(result.perception_shadow_replay.safety.changes_winner, false);
  assert.equal(result.perception_shadow_replay.safety.llm_api_calls, 0);
  assert.equal(result.perception_shadow_replay.safety.external_api_calls, 0);
  assert.equal(
    result.checks.some((check) => check.name === "perception shadow replay passed" && check.ok),
    true
  );
});
