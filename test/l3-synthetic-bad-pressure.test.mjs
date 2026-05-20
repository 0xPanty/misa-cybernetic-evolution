import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildSyntheticBadPressureReport,
  observeSemanticConsistency,
  selectSyntheticBadBaseTasks,
  syntheticBadTaskRequirementsForProfile,
  writeSyntheticBadPressureArtifacts
} from "../scripts/lib/l3-synthetic-bad-pressure.mjs";

function baseTask(category, index, overrides = {}) {
  const instanceId = `${category.replaceAll("_", "-")}-${String(index).padStart(2, "0")}`;
  const loop = category === "loop_max_iteration";
  const timeout = category === "timeout_provider_error";
  return {
    schema_version: "misa.synthetic_bad_base_task.v1",
    source_id: `swe-rebench-openhands:fixture__${instanceId}`,
    dataset: "swe-rebench-openhands",
    instance_id: `fixture__${instanceId}`,
    repo: `fixture/${category}`,
    resolved_proxy: false,
    exit_status: loop
      ? "RuntimeError: Agent reached maximum iteration. Current iteration: 100, max iteration: 100"
      : timeout
        ? "Timeout: litellm.Timeout: APITimeoutError - Request timed out."
        : "submit",
    model_patch_available: category !== "missing_patch_or_generated_tests_failed",
    gen_tests_correct: category === "missing_patch_or_generated_tests_failed" ? 0 : 1,
    pred_passes_gen_tests: category === "missing_patch_or_generated_tests_failed" ? 0 : 1,
    reason_codes: [
      "resolved_proxy_false",
      ...(loop ? ["loop_or_iteration_limit"] : []),
      ...(timeout ? ["provider_or_runtime_error_status"] : []),
      ...(category === "missing_patch_or_generated_tests_failed" ? ["generated_tests_failed_proxy"] : [])
    ],
    task_category: category,
    base_task_boundary: "real SWE-rebench metadata base; synthetic_bad work order is stress-test only",
    ...overrides
  };
}

function fixtureBaseTasks() {
  return [
    ...Array.from({ length: 10 }, (_, index) => baseTask("loop_max_iteration", index)),
    ...Array.from({ length: 10 }, (_, index) => baseTask("resolved_false_submit", index)),
    ...Array.from({ length: 5 }, (_, index) => baseTask("timeout_provider_error", index)),
    ...Array.from({ length: 5 }, (_, index) => baseTask("missing_patch_or_generated_tests_failed", index))
  ];
}

test("synthetic_bad pressure report keeps fake bad work orders out of durable bad seeds", () => {
  const result = buildSyntheticBadPressureReport({
    baseTasks: fixtureBaseTasks(),
    variantProfile: "obvious",
    now: new Date("2026-05-20T04:00:00.000Z")
  });

  assert.equal(result.mode, "l3-synthetic-bad-pressure");
  assert.equal(result.ok, true);
  assert.equal(result.gate_all_blocked, true);
  assert.equal(result.needs_rule_review, false);
  assert.equal(result.summary.variant_profile, "obvious");
  assert.equal(result.summary.base_task_count, 30);
  assert.equal(result.summary.synthetic_sample_count, 90);
  assert.equal(result.summary.l3_intercept_count, 90);
  assert.equal(result.summary.feedback_trigger_count, 90);
  assert.equal(result.summary.candidate_count_2_suggestion_count, 90);
  assert.equal(result.summary.primary_agent_suggestion_count, 90);
  assert.equal(result.summary.false_pass_count, 0);
  assert.equal(result.summary.semantic_observer_enabled, true);
  assert.equal(result.summary.semantic_trigger_count, 0);
  assert.equal(result.summary.semantic_false_pass_caught_count, 0);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.safety.touches_vps, false);
  assert.equal(result.safety.pushes_github, false);
  assert.equal(result.safety.writes_durable_bad_seed, false);
  assert.equal(result.safety.writes_pool_decisions_jsonl, false);
  assert.equal(result.boundary.durable_bad_seed_status, "not_written");
  assert.deepEqual(result.summary.variant_counts, {
    empty_acceptance: 30,
    too_broad: 30,
    too_vague: 30
  });
});

test("synthetic_bad adversarial profile records pass-like bad work orders that slip through", () => {
  const result = buildSyntheticBadPressureReport({
    baseTasks: fixtureBaseTasks(),
    variantProfile: "adversarial",
    now: new Date("2026-05-20T04:30:00.000Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.gate_all_blocked, false);
  assert.equal(result.needs_rule_review, true);
  assert.equal(result.summary.variant_profile, "adversarial");
  assert.equal(result.summary.base_task_count, 30);
  assert.equal(result.summary.synthetic_sample_count, 240);
  assert.equal(result.summary.obvious_sample_count, 90);
  assert.equal(result.summary.adversarial_sample_count, 150);
  assert.equal(result.summary.obvious_false_pass_count, 0);
  assert.ok(result.summary.adversarial_false_pass_count > 0);
  assert.equal(result.summary.semantic_observer_enabled, true);
  assert.equal(result.summary.semantic_observer_mode, "record_only");
  assert.equal(result.summary.semantic_false_pass_caught_count, result.summary.adversarial_false_pass_count);
  assert.equal(result.summary.semantic_false_pass_recall, 1);
  assert.equal(result.summary.semantic_adversarial_trigger_count, result.summary.adversarial_sample_count);
  assert.equal(result.summary.observer_candidate_count_2_suggestion_count, 90);
  assert.equal(result.summary.observer_primary_agent_suggestion_count, 60);
  assert.equal(result.summary.observer_recommendation_executed_count, 0);
  assert.equal(result.summary.observer_formal_gate_mutation_count, 0);
  assert.ok(result.samples.every((sample) => sample.semantic_observation.authority === "recommendation_only_does_not_change_l3_gate"));
  assert.ok(result.samples.every((sample) => sample.semantic_observation.recommendation_only === true));
  assert.ok(result.samples.every((sample) => sample.semantic_recommendation_executed === false));
  assert.ok(result.samples.every((sample) => sample.semantic_formal_gate_mutated === false));
  assert.ok(result.false_pass_samples.some((sample) => (
    sample.bad_dimensions.includes("wrong_objective")
  )));
  assert.equal(result.safety.writes_durable_bad_seed, false);
  assert.equal(result.safety.modifies_l1_thresholds, false);
});

test("semantic observer recommendations stay advisory and do not consume a second count2 budget", () => {
  const result = buildSyntheticBadPressureReport({
    baseTasks: fixtureBaseTasks(),
    variantProfile: "adversarial",
    now: new Date("2026-05-20T04:30:00.000Z")
  });

  const wrongObjective = result.samples.find((sample) => sample.bad_dimensions.includes("wrong_objective"));
  assert.ok(wrongObjective);
  assert.equal(wrongObjective.gate_ok, true);
  assert.equal(wrongObjective.false_pass, true);
  assert.deepEqual(wrongObjective.semantic_recommended_actions, ["candidate_count_2"]);
  assert.equal("semantic_actions" in wrongObjective, false);
  assert.equal(wrongObjective.semantic_recommendation_executed, false);
  assert.equal(wrongObjective.semantic_formal_gate_mutated, false);
  assert.equal(wrongObjective.semantic_lifecycle_budget.used_count2, false);
  assert.equal(wrongObjective.semantic_lifecycle_budget.count2_remaining, true);

  const budgetConsumed = observeSemanticConsistency({
    task: wrongObjective.base_task,
    variant: {
      draft: wrongObjective.draft,
      bad_dimensions: wrongObjective.bad_dimensions
    },
    sample: {
      ...wrongObjective,
      candidate_count: 2
    }
  });
  assert.equal(budgetConsumed.lifecycle_budget.used_count2, true);
  assert.deepEqual(budgetConsumed.recommended_actions, ["primary_agent_review_suggested"]);
  assert.deepEqual(budgetConsumed.budget_reason_codes, ["count2_budget_already_used"]);
  assert.equal(budgetConsumed.recommendation_executed, false);
  assert.equal(budgetConsumed.formal_gate_mutated, false);
});

test("semantic observer sends boundary and no-op warnings to terminal primary-agent recommendation only", () => {
  const result = buildSyntheticBadPressureReport({
    baseTasks: fixtureBaseTasks(),
    variantProfile: "adversarial",
    now: new Date("2026-05-20T04:30:00.000Z")
  });

  const boundary = result.samples.find((sample) => sample.bad_dimensions.includes("boundary_contradiction"));
  const anchor = result.samples.find((sample) => sample.bad_dimensions.includes("anchor_stuffing"));
  for (const sample of [boundary, anchor]) {
    assert.ok(sample);
    assert.deepEqual(sample.semantic_recommended_actions, ["primary_agent_review_suggested"]);
    assert.equal(sample.semantic_lifecycle_budget.terminal_recommendation, true);
    assert.equal(sample.semantic_lifecycle_budget.recommended_terminal_route, "primary_agent_review_suggested");
    assert.equal(sample.semantic_recommendation_executed, false);
    assert.equal(sample.semantic_formal_gate_mutated, false);
  }
});

test("synthetic_bad selector preserves requested category counts", () => {
  const futureCandidates = Array.from({ length: 10 }, (_, index) => baseTask("loop_max_iteration", index));
  const parquetRowsByCategory = {
    resolved_false_submit: Array.from({ length: 10 }, (_, index) => baseTask("resolved_false_submit", index)),
    timeout_provider_error: Array.from({ length: 5 }, (_, index) => baseTask("timeout_provider_error", index)),
    missing_patch_or_generated_tests_failed: Array.from({ length: 5 }, (_, index) => baseTask("missing_patch_or_generated_tests_failed", index))
  };

  const selected = selectSyntheticBadBaseTasks({
    futureCandidates,
    parquetRowsByCategory
  });

  assert.equal(selected.length, 30);
  assert.equal(new Set(selected.map((item) => item.source_id)).size, 30);
  assert.deepEqual(
    selected.reduce((counts, item) => {
      counts[item.task_category] = (counts[item.task_category] ?? 0) + 1;
      return counts;
    }, {}),
    {
      loop_max_iteration: 10,
      missing_patch_or_generated_tests_failed: 5,
      resolved_false_submit: 10,
      timeout_provider_error: 5
    }
  );
});

test("synthetic_bad selector supports a larger local pressure profile", () => {
  const requirements = syntheticBadTaskRequirementsForProfile("massive");
  const futureCandidates = Array.from({ length: requirements.loop_max_iteration }, (_, index) => baseTask("loop_max_iteration", index));
  const parquetRowsByCategory = {
    resolved_false_submit: Array.from({ length: requirements.resolved_false_submit }, (_, index) => baseTask("resolved_false_submit", index)),
    timeout_provider_error: Array.from({ length: requirements.timeout_provider_error }, (_, index) => baseTask("timeout_provider_error", index)),
    missing_patch_or_generated_tests_failed: Array.from({ length: requirements.missing_patch_or_generated_tests_failed }, (_, index) => baseTask("missing_patch_or_generated_tests_failed", index))
  };

  const selected = selectSyntheticBadBaseTasks({
    futureCandidates,
    parquetRowsByCategory,
    requirements
  });

  assert.equal(selected.length, 636);
  assert.deepEqual(
    selected.reduce((counts, item) => {
      counts[item.task_category] = (counts[item.task_category] ?? 0) + 1;
      return counts;
    }, {}),
    {
      loop_max_iteration: 200,
      missing_patch_or_generated_tests_failed: 200,
      resolved_false_submit: 200,
      timeout_provider_error: 36
    }
  );
});

test("synthetic_bad artifacts avoid pool-decisions filename", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l3-synthetic-bad-"));
  try {
    const result = buildSyntheticBadPressureReport({
      baseTasks: fixtureBaseTasks(),
      now: new Date("2026-05-20T04:00:00.000Z")
    });
    const written = await writeSyntheticBadPressureArtifacts({
      result,
      outDir: tempRoot,
      now: new Date("2026-05-20T04:00:00.000Z")
    });
    const files = await fs.readdir(tempRoot);
    assert.equal(files.includes("pool-decisions.jsonl"), false);
    assert.equal(files.includes("synthetic-bad-samples.jsonl"), true);
    assert.equal(written.safety.writes_durable_bad_seed, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
