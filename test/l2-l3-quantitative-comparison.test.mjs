import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  buildL2L3QuantitativeComparison,
  loadRunsFromBundle
} from "../scripts/lib/l2-l3-quantitative-comparison.mjs";

const execFileAsync = promisify(execFile);

function l2Report({ label, qualities, candidateCount = 1 }) {
  const results = qualities.map((quality, index) => {
    const sourceId = `source-${index + 1}`;
    const candidates = candidateCount > 1
      ? Array.from({ length: candidateCount }, (_, candidateIndex) => ({
        candidate_id: `candidate-${candidateIndex + 1}`,
        strategy: `strategy-${candidateIndex + 1}`,
        gate: {
          ok: candidateIndex === 0,
          quality_score: candidateIndex === 0 ? quality : Math.max(0, quality - 0.1),
          violations: candidateIndex === 0 ? [] : ["too_many_weak_tasks"]
        }
      }))
      : [];
    return {
      source_id: sourceId,
      gate: { ok: quality >= 1, quality_score: quality },
      candidates,
      candidate_selection: candidateCount > 1 ? {
        winner_quality_score: quality,
        candidate_quality_scores: candidates.map((candidate) => candidate.gate.quality_score)
      } : null
    };
  });
  return {
    provider: "hermes-delegate",
    model: "test-model",
    summary: {
      sample_count: qualities.length,
      requested_candidate_count: candidateCount,
      candidate_count: qualities.length * candidateCount,
      passed_gate_count: qualities.filter((quality) => quality >= 1).length,
      failed_gate_count: qualities.filter((quality) => quality < 1).length,
      provider_error_count: 0,
      avg_quality_score: Math.round(1000 * qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length) / 1000,
      llm_api_calls: qualities.length,
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      route_changes: 0,
      winner_changes: 0,
      vps_touches: 0,
      github_pushes: 0,
      public_publishes: 0
    },
    results,
    test_label: label
  };
}

function l3Report({ qualities, pools }) {
  const decisions = qualities.map((quality, index) => ({
    source_id: `source-${index + 1}`,
    pool: pools[index],
    quality_score: quality,
    actionableTaskCount: pools[index] === "red" ? 3 : 4,
    weakTaskCount: pools[index] === "green" ? 0 : 1,
    specificityHits: 8,
    violations: pools[index] === "green" ? [] : ["too_many_weak_tasks"],
    l4_forward: pools[index] !== "red",
    l4_spot_check: pools[index] === "red"
  }));
  const poolCounts = {
    green: pools.filter((pool) => pool === "green").length,
    yellow: pools.filter((pool) => pool === "yellow").length,
    red: pools.filter((pool) => pool === "red").length
  };
  return {
    summary: {
      sample_count: qualities.length,
      pool_counts: poolCounts,
      hard_gate_pass_count: poolCounts.green,
      hard_gate_fail_count: qualities.length - poolCounts.green,
      l4_forward_count: poolCounts.green + poolCounts.yellow,
      red_spot_check_count: poolCounts.red,
      possible_false_reject_count: poolCounts.yellow,
      low_quality_pass_count: 0,
      provider_error_count: 0,
      avg_quality_score: Math.round(1000 * qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length) / 1000,
      violation_counts: { too_many_weak_tasks: poolCounts.yellow + poolCounts.red },
      llm_api_calls: qualities.length,
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      route_changes: 0,
      winner_changes: 0,
      vps_touches: 0,
      github_pushes: 0,
      public_publishes: 0
    },
    decisions
  };
}

test("quantitative comparison selects light single default and keeps multi exploratory", () => {
  const initial = {
    label: "01-initial",
    l2Report: l2Report({ label: "initial", qualities: [1, 0.95, 0.95] }),
    l3Report: l3Report({ qualities: [1, 0.95, 0.95], pools: ["green", "yellow", "red"] })
  };
  const light = {
    label: "04-light-single",
    l2Report: l2Report({ label: "light", qualities: [1, 1, 0.95] }),
    l3Report: l3Report({ qualities: [1, 1, 0.95], pools: ["green", "green", "red"] })
  };
  const multi = {
    label: "05-multi3",
    l2Report: l2Report({ label: "multi", qualities: [1, 0.95, 0.95], candidateCount: 3 }),
    l3Report: l3Report({ qualities: [1, 0.95, 0.95], pools: ["green", "yellow", "yellow"] })
  };
  const result = buildL2L3QuantitativeComparison({
    runs: [initial, light, multi],
    now: new Date("2026-05-18T00:00:00Z")
  });

  assert.equal(result.recommendation.default_run, "light_single");
  assert.equal(result.recommendation.single_candidate_default_run, "light_single");
  assert.equal(result.recommendation.candidate_count_default_run, null);
  assert.equal(result.recommendation.multi_candidate_policy, "explicit_recheck_mode_not_default");
  assert.equal(result.candidate_marginal_analysis[0].label, "multi3");
  assert.equal(result.candidate_marginal_analysis[0].default_ready, false);
  assert.equal(result.sample_alignment.aligned, true);
});

test("quantitative comparison recommends default-ready candidate count separately", () => {
  const count1 = {
    label: "01-count1",
    l2Report: l2Report({ label: "count1", qualities: [0.95, 0.95, 1] }),
    l3Report: l3Report({ qualities: [0.95, 0.95, 1], pools: ["yellow", "red", "green"] })
  };
  const count2 = {
    label: "02-count2",
    l2Report: l2Report({ label: "count2", qualities: [0.97, 0.96, 1], candidateCount: 2 }),
    l3Report: l3Report({ qualities: [0.97, 0.96, 1], pools: ["yellow", "red", "green"] })
  };
  const count4 = {
    label: "03-count4",
    l2Report: l2Report({ label: "count4", qualities: [0.96, 0.96, 1], candidateCount: 4 }),
    l3Report: l3Report({ qualities: [0.96, 0.96, 1], pools: ["yellow", "red", "red"] })
  };

  const result = buildL2L3QuantitativeComparison({
    runs: [count1, count2, count4],
    baselineLabel: "count1",
    now: new Date("2026-05-18T00:00:00Z")
  });

  assert.equal(result.recommendation.single_candidate_default_run, "count1");
  assert.equal(result.recommendation.candidate_count_default_run, "count2");
  assert.equal(result.recommendation.multi_candidate_policy, "candidate_count_default_review_with_exploratory_modes");
  assert.equal(result.candidate_marginal_analysis.find((item) => item.label === "count2").default_ready, true);
  assert.equal(result.candidate_marginal_analysis.find((item) => item.label === "count4").default_ready, false);
});

test("quantitative comparison CLI loads bundle runs and writes artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l2-l3-quant-"));
  try {
    const bundle = path.join(tempRoot, "bundle");
    const runDir = path.join(bundle, "01-initial");
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, "l2.json"), JSON.stringify(l2Report({
      label: "initial",
      qualities: [1, 0.95]
    }), null, 2), "utf8");
    await fs.writeFile(path.join(runDir, "l3-quality-report.json"), JSON.stringify(l3Report({
      qualities: [1, 0.95],
      pools: ["green", "yellow"]
    }), null, 2), "utf8");

    const runs = await loadRunsFromBundle({ bundleDir: bundle });
    assert.equal(runs.length, 1);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/l2-l3-quantitative-comparison.mjs",
      "--bundle-dir",
      bundle,
      "--out-dir",
      tempRoot,
      "--now",
      "2026-05-18T00:00:00Z"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5
    });

    assert.match(stdout, /l2-l3-quantitative-comparison ok=true/);
    const report = JSON.parse(await fs.readFile(path.join(tempRoot, "quantitative-comparison.json"), "utf8"));
    assert.equal(report.run_summaries[0].label, "initial");
    const markdown = await fs.readFile(path.join(tempRoot, "quantitative-comparison.md"), "utf8");
    assert.match(markdown, /L2\/L3 Quantitative Comparison/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
