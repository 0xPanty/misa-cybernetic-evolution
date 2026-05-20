import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  buildL3FeedbackReflectionReplayReport,
  collectL3FeedbackReflectionSamples,
  evaluateReflectionSample,
  runL3FeedbackReflectionReplay,
  writeL3FeedbackReflectionReplayArtifacts
} from "../scripts/lib/l3-feedback-reflection-replay.mjs";
import {
  runL3FeedbackReflectionStress
} from "../scripts/lib/l3-feedback-reflection-stress.mjs";

const execFileAsync = promisify(execFile);

function sample({
  sourceId,
  status,
  actionableTaskCount,
  weakTaskCount,
  candidateCount = 1,
  currentFeedback = null,
  repeatedFailureShape = false
}) {
  return {
    schema_version: "misa.l3_feedback_reflection_sample.v1",
    sample_id: `${sourceId}::fixture`,
    source_id: sourceId,
    source_file: "fixtures/reflection.jsonl",
    source_line: 1,
    status,
    is_bad: status !== "accepted_first_try",
    current_feedback: currentFeedback,
    current_feedback_actions: currentFeedback?.suggestion?.candidate_count ? ["candidate_count_2"] : [],
    candidate_count: candidateCount,
    l1_candidate_mode: "single",
    l1_handoff_floor: "no_context_agent",
    risk_level: "medium",
    route_hint: "damping",
    signal_family: "keyword_risk_noise",
    actionableTaskCount,
    weakTaskCount,
    quality_score: 0.9,
    gate_class: status === "accepted_first_try" ? "pass" : "hard_fail",
    violations: status === "accepted_first_try" ? [] : ["too_few_actionable_tasks", "too_many_weak_tasks"],
    repeated_failure_shape: Boolean(repeatedFailureShape),
    l3_feedback_status: status,
    baseline_feedback_present: Boolean(currentFeedback),
    baseline_candidate_count_upgrade: Boolean(currentFeedback?.suggestion?.candidate_count),
    baseline_primary_agent_upgrade: Boolean(currentFeedback?.suggestion?.handoff_floor)
  };
}

test("evaluateReflectionSample returns the narrow reflection actions", () => {
  const good = evaluateReflectionSample(sample({
    sourceId: "good-001",
    status: "accepted_first_try",
    actionableTaskCount: 5,
    weakTaskCount: 0
  }));
  const thin = evaluateReflectionSample(sample({
    sourceId: "bad-001",
    status: "exhausted_no_value",
    actionableTaskCount: 3,
    weakTaskCount: 2
  }));
  const severe = evaluateReflectionSample(sample({
    sourceId: "bad-002",
    status: "exhausted_no_value",
    actionableTaskCount: 2,
    weakTaskCount: 3,
    repeatedFailureShape: true
  }));

  assert.equal(good.trigger, false);
  assert.deepEqual(good.actions, []);
  assert.ok(thin.actions.includes("rewrite_work_order_more_concrete"));
  assert.ok(thin.actions.includes("candidate_count_2"));
  assert.ok(!thin.actions.includes("primary_agent_review_suggested"));
  assert.ok(severe.actions.includes("primary_agent_review_suggested"));
});

test("evaluateReflectionSample does not fire outside the documented alpha scope", () => {
  const differentSignal = evaluateReflectionSample({
    ...sample({
      sourceId: "bad-other-signal",
      status: "exhausted_no_value",
      actionableTaskCount: 2,
      weakTaskCount: 3
    }),
    signal_family: "other_signal"
  });
  const alreadyMultiCandidate = evaluateReflectionSample(sample({
    sourceId: "bad-count2",
    status: "exhausted_no_value",
    actionableTaskCount: 2,
    weakTaskCount: 3,
    candidateCount: 2
  }));

  assert.equal(differentSignal.trigger, false);
  assert.equal(alreadyMultiCandidate.trigger, false);
});

test("real historical replay finds the known cheap-route cluster without false positives", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l3-reflection-"));
  try {
    const result = await runL3FeedbackReflectionReplay({
      runsDir: "runs",
      outDir: path.join(tempRoot, "replay"),
      now: new Date("2026-05-19T12:30:00.000Z")
    });

    assert.equal(result.ok, true);
    assert.ok(result.summary.sample_count >= 30);
    assert.ok(result.summary.bad_sample_count >= 3);
    assert.ok(result.summary.accepted_first_try_count >= 27);
    assert.equal(result.summary.recorded_feedback_count, 2);
    assert.equal(result.summary.recorded_bad_caught_count, 2);
    assert.equal(result.summary.recorded_missing_baseline_caught_count, 1);
    assert.equal(result.summary.baseline_feedback_count, 3);
    assert.equal(result.summary.baseline_bad_caught_count, 3);
    assert.equal(result.summary.candidate_trigger_count, 3);
    assert.equal(result.summary.candidate_bad_caught_count, 3);
    assert.equal(result.summary.candidate_good_false_positive_count, 0);
    assert.equal(result.summary.newly_caught_count, 0);
    assert.equal(result.summary.current_vs_candidate_gain, 0);
    assert.equal(result.summary.baseline_primary_agent_review_suggested_count, 2);
    assert.equal(result.summary.candidate_primary_agent_review_suggested_count, 2);
    assert.ok(result.top_bad_samples.some((sampleRow) => sampleRow.source_id.includes("PyPSA__linopy-79")));
    assert.ok(result.top_bad_samples.some((sampleRow) => sampleRow.source_id.includes("numpy__numpydoc-101")));
    assert.ok(result.top_bad_samples.some((sampleRow) => sampleRow.source_id.includes("alexgolec__tda-api-37")));

    const replayJson = path.join(tempRoot, "replay", "l3-feedback-reflection-replay.json");
    const replayMd = path.join(tempRoot, "replay", "l3-feedback-reflection-replay.md");
    const libraryJsonl = path.join(tempRoot, "replay", "l3-feedback-reflection-library.jsonl");
    assert.equal(await fs.stat(replayJson).then(() => true), true);
    assert.equal(await fs.stat(replayMd).then(() => true), true);
    assert.equal(await fs.stat(libraryJsonl).then(() => true), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("reflection stress survives the full historical holdout and exposes over-broad variants", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l3-reflection-stress-"));
  try {
    const result = await runL3FeedbackReflectionStress({
      runsDir: "runs",
      outDir: path.join(tempRoot, "stress"),
      now: new Date("2026-05-20T05:00:00.000Z")
    });

    assert.equal(result.ok, true);
    assert.ok(result.summary.full_sample_count > result.summary.strict_seed_sample_count);
    assert.ok(result.summary.strict_seed_sample_count >= 30);
    assert.ok(result.summary.strict_seed_bad_count >= 3);
    assert.equal(result.summary.documented_strict_clean_good_false_positive_count, 0);
    assert.equal(result.summary.documented_strict_holdout_trigger_count, 0);
    assert.ok(result.summary.over_broad_holdout_trigger_count > 0);
    assert.equal(result.summary.strict_boundary_probe_trigger_count, 0);
    assert.ok(result.summary.widening_boundary_probe_trigger_count > 0);
    assert.equal(
      result.summary.l1_promotion_recommendation,
      "keep_shadow_collect_more_holdout_before_l1_strategy"
    );

    const stressJson = path.join(tempRoot, "stress", "l3-feedback-reflection-stress.json");
    const stressMd = path.join(tempRoot, "stress", "l3-feedback-reflection-stress.md");
    const fullLibraryJsonl = path.join(tempRoot, "stress", "l3-feedback-reflection-full-library.jsonl");
    assert.equal(await fs.stat(stressJson).then(() => true), true);
    assert.equal(await fs.stat(stressMd).then(() => true), true);
    assert.equal(await fs.stat(fullLibraryJsonl).then(() => true), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("reflection replay CLI emits the expected summary", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l3-reflection-cli-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/l3-feedback-reflection-replay.mjs",
      "--runs-dir",
      "runs",
      "--out-dir",
      path.join(tempRoot, "cli"),
      "--json"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024
    });
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.ok(result.summary.sample_count >= 30);
    assert.ok(result.summary.bad_sample_count >= 3);
    assert.equal(result.summary.recorded_missing_baseline_caught_count, 1);
    assert.equal(result.summary.candidate_trigger_count, 3);
    assert.equal(result.summary.newly_caught_count, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
