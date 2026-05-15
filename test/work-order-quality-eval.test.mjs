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
  assert.equal(result.summary.variant_count, result.summary.comparison_count * 5);
  assert.equal(result.summary.by_split.local_regression, 24);
  assert.equal(result.summary.by_split.dev, 9);
  assert.equal(result.summary.by_split.test, 9);
  assert.equal(result.summary.dev_test.test.comparison_count, 9);
  assert.equal(result.summary.dev_test.holdout_passed, true);
  assert.equal(result.summary.positive_lift_rate, 1);
  assert.equal(result.summary.regression_count, 0);
  assert.equal(result.summary.safety_regression_count, 0);
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
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "expand_external_issue_pr_samples"));
  assert.ok(result.qianxuesen_adaptation.next_adaptation_candidates.some((item) => item.recommendation_id === "keep_dev_test_split_in_gate"));
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
    assert.equal(result.summary.dev_test.holdout_passed, true);
    assert.equal(result.summary.llm_api_calls, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
