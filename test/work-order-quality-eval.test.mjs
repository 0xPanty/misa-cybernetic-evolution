import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  runWorkOrderQualityEvaluation,
  writeWorkOrderQualityArtifacts
} from "../scripts/lib/work-order-quality-eval.mjs";

const execFileAsync = promisify(execFile);
const WORK_ORDER_QUALITY_GOLDEN_SNAPSHOT = path.join(
  process.cwd(),
  "test",
  "fixtures",
  "work-order-quality",
  "quality-eval-golden-snapshot.json"
);
const WORK_ORDER_QUALITY_GOLDEN_ROWS = Object.freeze([
  ["operator_tighten", "golden-quality-01"],
  ["dev-auth-boundary-regression", "golden-quality-01"],
  ["dev-cache-replay-regression", "golden-quality-01"],
  ["dev-doc-command-scope", "golden-quality-01"],
  ["test-queue-replay-timeout", "golden-quality-02"]
]);

function runNpm(args) {
  const options = {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 20
  };
  if (process.platform === "win32") {
    return execFileAsync("cmd.exe", ["/d", "/c", "npm", ...args], options);
  }
  return execFileAsync("npm", args, options);
}

function scoreGoldenSnapshot(score) {
  return {
    surface: score.surface,
    variant_id: score.variant_id ?? null,
    strategy: score.strategy ?? null,
    dimensions: score.dimensions
  };
}

function comparisonGoldenSnapshot(item) {
  return {
    source_label: item.source_label,
    source_kind: item.source_kind,
    split: item.split,
    seed: item.seed,
    work_order_id: item.work_order_id,
    category: item.category,
    severity: item.severity,
    risk_level: item.risk_level,
    baseline: scoreGoldenSnapshot(item.baseline),
    winner: scoreGoldenSnapshot(item.winner),
    delta: item.delta,
    positive_lift: item.positive_lift,
    safety_regression: item.safety_regression,
    budget_control: {
      policy: item.budget_control.policy,
      population_size: item.budget_control.population_size,
      required_strategies: item.budget_control.required_strategies,
      generated_variant_count: item.budget_control.generated_variant_count,
      saved_variant_count_against_fixed5: item.budget_control.saved_variant_count_against_fixed5
    },
    selection_update: item.selection_update,
    diversity_guard: {
      policy: item.diversity_guard.policy,
      applied: item.diversity_guard.applied,
      selected_strategy_before_guard: item.diversity_guard.selected_strategy_before_guard,
      selected_strategy_after_guard: item.diversity_guard.selected_strategy_after_guard,
      retained_variant_id: item.diversity_guard.retained_variant_id,
      retained_strategy: item.diversity_guard.retained_strategy,
      retained_delta: item.diversity_guard.retained_delta
    },
    llm_mutation_crossover_gate: {
      candidate_value: item.llm_mutation_crossover_gate.candidate_value,
      call_policy: item.llm_mutation_crossover_gate.call_policy,
      primary_agent_review_required: item.llm_mutation_crossover_gate.primary_agent_review_required,
      route_or_winner_authority: item.llm_mutation_crossover_gate.route_or_winner_authority,
      llm_api_calls: item.llm_mutation_crossover_gate.llm_api_calls
    },
    model_role_separation: item.model_role_separation,
    qianxuesen_signals: item.qianxuesen_signals
  };
}

function workOrderQualityGoldenSnapshot(result) {
  return {
    sample_summary: result.sample_summary,
    summary: {
      comparison_count: result.summary.comparison_count,
      variant_count: result.summary.variant_count,
      positive_lift_rate: result.summary.positive_lift_rate,
      regression_count: result.summary.regression_count,
      safety_regression_count: result.summary.safety_regression_count,
      avg_baseline_score: result.summary.avg_baseline_score,
      avg_winner_score: result.summary.avg_winner_score,
      avg_delta: result.summary.avg_delta,
      min_delta: result.summary.min_delta,
      max_delta: result.summary.max_delta,
      by_winner_strategy: result.summary.by_winner_strategy,
      budget_control: result.summary.budget_control,
      selection_update: result.summary.selection_update,
      diversity_guard: result.summary.diversity_guard,
      llm_mutation_crossover: result.summary.llm_mutation_crossover,
      model_role_separation: result.summary.model_role_separation,
      qianxuesen_signal_fit: result.summary.qianxuesen_signal_fit,
      dev_test: result.summary.dev_test
    },
    comparisons: WORK_ORDER_QUALITY_GOLDEN_ROWS.map(([sourceLabel, seed]) => {
      const item = result.comparisons.find((comparison) => (
        comparison.source_label === sourceLabel && comparison.seed === seed
      ));
      assert.ok(item, `missing golden comparison ${sourceLabel} ${seed}`);
      return comparisonGoldenSnapshot(item);
    }),
    safety: result.safety
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

test("work-order quality evaluation golden snapshot protects baseline winner and aggregation", async () => {
  const result = await runWorkOrderQualityEvaluation({
    seeds: ["golden-quality-01", "golden-quality-02", "golden-quality-03"],
    now: new Date("2026-05-15T00:00:00Z")
  });
  const expected = await readJson(WORK_ORDER_QUALITY_GOLDEN_SNAPSHOT);

  assert.deepEqual(workOrderQualityGoldenSnapshot(result), expected);
});

test("work-order quality evaluation compares baseline and winner on Qianxuesen metrics", async () => {
  const result = await runWorkOrderQualityEvaluation({
    seeds: ["quality-test-01", "quality-test-02", "quality-test-03"],
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.mode, "work-order-quality-eval");
  assert.equal(result.ok, true);
  assert.equal(result.sample_summary.source_set_count, 14);
  assert.equal(result.sample_summary.work_order_count, 14);
  assert.equal(result.sample_summary.external_issue_pr_sample_count, 6);
  assert.equal(result.sample_summary.dev_sample_count, 3);
  assert.equal(result.sample_summary.test_sample_count, 3);
  assert.deepEqual(result.sample_summary.split_counts, {
    local_regression: 8,
    dev: 3,
    test: 3
  });
  assert.equal(result.summary.comparison_count, 42);
  assert.equal(result.summary.variant_count, 180);
  assert.equal(result.summary.budget_control.policy, "risk_adaptive");
  assert.equal(result.summary.budget_control.fixed5_variant_budget, result.summary.comparison_count * 5);
  assert.equal(result.summary.budget_control.saved_variant_count_against_fixed5, 30);
  assert.deepEqual(result.summary.budget_control.by_population_size, {
    3: 9,
    4: 12,
    5: 21
  });
  assert.equal(result.summary.by_split.local_regression, 24);
  assert.equal(result.summary.by_split.dev, 9);
  assert.equal(result.summary.by_split.test, 9);
  assert.equal(result.summary.dev_test.test.comparison_count, 9);
  assert.equal(result.summary.dev_test.holdout_passed, true);
  assert.equal(result.summary.positive_lift_rate, 1);
  assert.equal(result.summary.regression_count, 0);
  assert.equal(result.summary.safety_regression_count, 0);
  assert.equal(result.summary.llm_mutation_crossover.enabled_count, 0);
  assert.equal(result.summary.llm_mutation_crossover.mutation_candidate_allowed_count, 0);
  assert.equal(result.summary.llm_mutation_crossover.crossover_candidate_allowed_count, 0);
  assert.equal(result.summary.llm_mutation_crossover.route_or_winner_authority_count, 0);
  assert.equal(result.summary.llm_mutation_crossover.llm_api_calls, 0);
  assert.equal(result.summary.llm_mutation_crossover.primary_agent_inline_review_count, result.summary.llm_mutation_crossover.review_worthy_count);
  assert.equal(result.summary.llm_mutation_crossover.primary_agent_review_required_count, result.summary.llm_mutation_crossover.review_worthy_count);
  assert.equal(result.summary.llm_mutation_crossover.separate_llm_call_required_count, 0);
  assert.equal(result.summary.model_role_separation.clean_split_count, result.summary.comparison_count);
  assert.equal(result.summary.model_role_separation.evolution_model_call_count, 0);
  assert.equal(result.summary.model_role_separation.task_model_called_count, 0);
  assert.equal(result.summary.selection_update.policy, "quality_replacement");
  assert.equal(result.summary.selection_update.incumbent_retained_count, 0);
  assert.equal(result.summary.selection_update.replacement_allowed_count, result.summary.comparison_count);
  assert.equal(result.summary.selection_update.safety_passed_count, result.summary.comparison_count);
  assert.equal(result.summary.diversity_guard.policy, "strategy_guard");
  assert.ok(result.summary.diversity_guard.applied_count > 0);
  assert.ok(result.summary.diversity_guard.unique_winner_strategy_count >= 4);
  assert.ok(result.summary.avg_winner_score > result.summary.avg_baseline_score);
  assert.ok(result.summary.avg_delta > 0);
  assert.equal(result.summary.qianxuesen_signal_fit.high_risk_boundary_fit_count, result.summary.qianxuesen_signal_fit.high_risk_count);
  assert.equal(result.summary.qianxuesen_signal_fit.medium_risk_replay_or_compact_fit_count, result.summary.qianxuesen_signal_fit.medium_risk_count);
  assert.equal(result.summary.qianxuesen_signal_fit.low_risk_conservative_fit_count, result.summary.qianxuesen_signal_fit.low_risk_count);
  assert.equal(result.summary.qianxuesen_signal_fit.route_preserved_count, result.summary.comparison_count);
  assert.equal(result.summary.qianxuesen_signal_fit.source_trace_preserved_count, result.summary.comparison_count);
  assert.equal(result.safety.executes_work_orders, false);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.installs_skills, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.comparisons.every((item) => ["do_not_call", "primary_agent_inline_review"].includes(item.llm_mutation_crossover_gate.call_policy)), true);
  assert.equal(result.comparisons.every((item) => item.llm_mutation_crossover_gate.separate_llm_call_required === false), true);
  assert.equal(result.comparisons.every((item) => item.llm_mutation_crossover_gate.external_model_call_policy === "requires_explicit_enable"), true);
  assert.equal(result.comparisons.every((item) => item.model_role_separation.deterministic_controller_owns_selection), true);
  assert.equal(result.comparisons.every((item) => item.model_role_separation.task_model_called_by_eval === false), true);
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "expand_external_issue_pr_samples"));
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "keep_dev_test_split_in_gate"));
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "keep_quality_replacement_rule"));
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "keep_diversity_guard_for_medium_risk"));
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "keep_evolution_task_model_split"));
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "keep_llm_mutation_crossover_zero_call"));
});

test("work-order quality replacement and diversity compare side by side without lowering holdout quality", async () => {
  const common = {
    seeds: ["side-by-side-01", "side-by-side-02", "side-by-side-03"],
    now: new Date("2026-05-15T00:00:00Z")
  };
  const baseline = await runWorkOrderQualityEvaluation({
    ...common,
    selectionPolicy: "legacy",
    diversityPolicy: "off",
    budgetPolicy: "fixed_5"
  });
  const replacement = await runWorkOrderQualityEvaluation({
    ...common,
    selectionPolicy: "quality_replacement",
    diversityPolicy: "off",
    budgetPolicy: "fixed_5"
  });
  const diverse = await runWorkOrderQualityEvaluation({
    ...common,
    selectionPolicy: "quality_replacement",
    diversityPolicy: "strategy_guard",
    budgetPolicy: "fixed_5"
  });
  const budgeted = await runWorkOrderQualityEvaluation({
    ...common,
    selectionPolicy: "quality_replacement",
    diversityPolicy: "strategy_guard",
    budgetPolicy: "risk_adaptive"
  });

  assert.equal(baseline.summary.safety_regression_count, 0);
  assert.equal(replacement.summary.safety_regression_count, 0);
  assert.equal(diverse.summary.safety_regression_count, 0);
  assert.equal(replacement.summary.avg_delta >= baseline.summary.avg_delta, true);
  assert.equal(diverse.summary.avg_delta >= replacement.summary.avg_delta, true);
  assert.equal(replacement.summary.dev_test.holdout_passed, true);
  assert.equal(diverse.summary.dev_test.holdout_passed, true);
  assert.equal(diverse.summary.positive_lift_rate, 1);
  assert.equal(diverse.summary.llm_api_calls, 0);
  assert.ok(diverse.summary.diversity_guard.applied_count > replacement.summary.diversity_guard.applied_count);
  assert.equal(budgeted.summary.variant_count < diverse.summary.variant_count, true);
  assert.equal(budgeted.summary.avg_delta, diverse.summary.avg_delta);
  assert.equal(budgeted.summary.dev_test.test.avg_delta, diverse.summary.dev_test.test.avg_delta);
  assert.equal(budgeted.summary.dev_test.holdout_passed, true);
  assert.equal(budgeted.summary.positive_lift_rate, 1);
  assert.equal(budgeted.summary.safety_regression_count, 0);
  assert.equal(budgeted.summary.llm_api_calls, 0);
  assert.equal(budgeted.summary.llm_mutation_crossover.enabled_count, 0);
  assert.equal(budgeted.summary.llm_mutation_crossover.separate_llm_call_required_count, 0);
  assert.equal(budgeted.summary.llm_mutation_crossover.primary_agent_inline_review_count, budgeted.summary.llm_mutation_crossover.review_worthy_count);
  assert.equal(budgeted.summary.model_role_separation.clean_split_count, budgeted.summary.comparison_count);
});

test("work-order quality evaluation validates against schema", async () => {
  const result = await runWorkOrderQualityEvaluation({
    seeds: ["schema-quality-01", "schema-quality-02", "schema-quality-03"],
    now: new Date("2026-05-15T00:00:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/work_order_quality_eval.schema.json",
    data: result,
    name: "validate work-order quality evaluation"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("work-order quality artifacts write local reports only", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-work-order-quality-"));

  try {
    const result = await runWorkOrderQualityEvaluation({
      seeds: ["artifact-quality-01"],
      now: new Date("2026-05-15T00:00:00Z")
    });
    const written = await writeWorkOrderQualityArtifacts({
      result,
      outDir: tempRoot,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "work-order-quality-eval");
    assert.equal(persisted.safety.executes_work_orders, false);
    assert.match(markdown, /# Work Order Quality Evaluation/);
    assert.match(markdown, /positive_lift_rate:/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("work-order quality CLI writes clean JSON handoff artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-work-order-quality-cli-"));
  const outFile = path.join(tempRoot, "quality.json");

  try {
    await runNpm([
      "run",
      "work-order:evaluate",
      "--",
      "--json",
      "--dry-run",
      "--seeds",
      "cli-quality-01,cli-quality-02,cli-quality-03",
      "--out-file",
      outFile
    ]);
    const result = JSON.parse(await fs.readFile(outFile, "utf8"));
    assert.equal(result.mode, "work-order-quality-eval");
    assert.equal(result.ok, true);
    assert.equal(result.seeds.length, 3);
    assert.equal(result.sample_summary.external_issue_pr_sample_count, 6);
    assert.equal(result.summary.budget_control.policy, "risk_adaptive");
    assert.equal(result.summary.budget_control.saved_variant_count_against_fixed5, 30);
    assert.equal(result.summary.llm_mutation_crossover.enabled_count, 0);
    assert.equal(result.summary.model_role_separation.task_model_called_count, 0);
    assert.equal(result.summary.dev_test.holdout_passed, true);
    assert.equal(result.summary.llm_api_calls, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
