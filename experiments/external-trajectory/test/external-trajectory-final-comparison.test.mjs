import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateJsonData } from "../../../scripts/lib/schema-validation.mjs";
import {
  runExternalTrajectoryFinalComparison,
  writeExternalTrajectoryFinalComparisonArtifacts
} from "../lib/external-trajectory-final-comparison.mjs";

function comparison({
  sampleId,
  dataset,
  expected,
  baselineAction,
  optimizedAction,
  baselineScore,
  optimizedScore
}) {
  return {
    sample_id: sampleId,
    dataset,
    sample_type: "fixture",
    expected_shadow_action: expected,
    baseline: {
      action: baselineAction,
      action_matches_expected: baselineAction === expected,
      dimensions: { total: baselineScore }
    },
    calibrated: {
      action: optimizedAction,
      action_matches_expected: optimizedAction === expected,
      dimensions: { total: optimizedScore },
      triggered_rules: []
    },
    delta: Math.round((optimizedScore - baselineScore) * 1000) / 1000,
    improved: optimizedScore > baselineScore,
    regressed: optimizedScore < baselineScore,
    safety_regression: false
  };
}

function sideBySideFixture() {
  const comparisons = [
    comparison({
      sampleId: "swe-chat:noise",
      dataset: "swe-chat",
      expected: "noise_filtered_review",
      baselineAction: "boundary_review",
      optimizedAction: "noise_filtered_review",
      baselineScore: 0.7,
      optimizedScore: 0.8
    }),
    comparison({
      sampleId: "atbench:safe",
      dataset: "atbench",
      expected: "accept_shadow_evidence",
      baselineAction: "accept_shadow_evidence",
      optimizedAction: "accept_shadow_evidence",
      baselineScore: 0.75,
      optimizedScore: 0.81
    }),
    comparison({
      sampleId: "swe-rebench:weak",
      dataset: "swe-rebench-openhands",
      expected: "weak_proxy_holdout",
      baselineAction: "adoption_candidate",
      optimizedAction: "weak_proxy_holdout",
      baselineScore: 0.72,
      optimizedScore: 0.9
    })
  ];

  return {
    schema_version: "misa.external_trajectory_side_by_side.v1",
    mode: "external-trajectory-side-by-side",
    ok: true,
    created_at: "2026-05-16T00:00:00.000Z",
    input: {
      baseline_commit: "a3f6cfb"
    },
    calibration_draft: {
      parameter_profile_id: "noise_tolerant_pushback_strict_v1"
    },
    parameter_sweep: {
      selected_profile_id: "noise_tolerant_pushback_strict_v1"
    },
    summary: {
      sample_count: comparisons.length,
      comparison_count: comparisons.length,
      avg_delta: 0.113,
      safety_regression_count: 0,
      dev_holdout: {
        holdout_passed: true
      }
    },
    shadow_policy_readout: {
      conclusion: "side_by_side_consumed_shadow_policy_surface",
      policy_closure: {
        action_change_count: 0,
        route_authority_changed: false,
        winner_authority_changed: false,
        production_authority: false,
        raw_external_content_persisted: false,
        persistent_memory_written: false,
        zilliz_written: false,
        embedding_created: false,
        llm_api_calls: false,
        external_api_calls: false
      }
    },
    comparisons
  };
}

function qianxuesenCandidate({
  id,
  decision = "promote_to_shadow_control_prior",
  samples = 10,
  holdoutPassed = true
}) {
  return {
    candidate_id: id,
    decision,
    authority_scope: "shadow_control_prior_only",
    sample_count: samples,
    avg_delta: 0.1,
    expected_match_lift: 0.2,
    safety_regression_count: 0,
    regression_count: 0,
    source_scope: "multi_dataset",
    generalization_status: holdoutPassed ? "generalizes_on_holdout" : "watch_more_data",
    holdout_summary: {
      holdout_passed: holdoutPassed,
      holdout_avg_delta: holdoutPassed ? 0.08 : 0
    },
    action_change_count: 0,
    route_authority_changed: false,
    winner_authority_changed: false,
    production_authority: false
  };
}

function alphaFixture() {
  return {
    schema_version: "misa.external_trajectory_alpha.v1",
    mode: "external-trajectory-alpha",
    ok: true,
    qianxuesen_alpha_fit: {
      candidates: [
        qianxuesenCandidate({ id: "failed_outcome_without_unsafe_boundary" }),
        qianxuesenCandidate({ id: "non_actual_command_failed_outcome_overlap" }),
        qianxuesenCandidate({ id: "pushback_failed_or_weak_proxy_overlap" }),
        qianxuesenCandidate({
          id: "weak_unresolved_high_tool_overlap",
          decision: "watch_more_data",
          samples: 4,
          holdoutPassed: false
        }),
        qianxuesenCandidate({
          id: "install_network_non_actual_complexity_overlap",
          decision: "watch_more_data",
          samples: 3,
          holdoutPassed: false
        })
      ]
    }
  };
}

test("external trajectory final comparison quantifies optimized lift without authority changes", async () => {
  const result = await runExternalTrajectoryFinalComparison({
    sideBySide: sideBySideFixture(),
    alpha: alphaFixture(),
    baselineCommit: "3e79083",
    optimizedCommit: "HEAD",
    now: new Date("2026-05-16T02:20:00Z")
  });

  assert.equal(result.mode, "external-trajectory-final-comparison");
  assert.equal(result.ok, true);
  assert.equal(result.baseline.commit, "3e79083");
  assert.equal(result.optimized.branch_tip_aligned, true);
  assert.ok(result.optimized.commit);
  assert.equal(result.optimized.selected_profile, "noise_tolerant_pushback_strict_v1");
  assert.equal(result.overall.count, 3);
  assert.ok(result.overall.optimized_avg_score > result.overall.baseline_avg_score);
  assert.equal(result.overall.regression_count, 0);
  assert.equal(result.overall.safety_regression_count, 0);
  assert.equal(result.overall.baseline_to_optimized_action_change_count, 2);
  assert.equal(result.action_score_separation.action_level.action_improvement_count, 2);
  assert.equal(result.action_score_separation.action_level.action_regression_count, 0);
  assert.equal(result.action_score_separation.score_level.same_action_improved_count, 1);
  assert.equal(result.grouped_holdout.conclusion, "grouped_holdout_passed_without_regression");
  assert.equal(result.shadow_readout_closure.action_change_count, 0);
  assert.equal(result.shadow_readout_closure.route_authority_changed, false);
  assert.equal(result.shadow_readout_closure.winner_authority_changed, false);
  assert.equal(result.shadow_readout_closure.production_authority, false);
  assert.equal(result.boundaries.zilliz_written, false);
  assert.equal(result.boundaries.embedding_created, false);
  assert.equal(result.boundaries.llm_api_calls, false);
  assert.equal(result.boundaries.external_api_calls, false);
  assert.equal(result.by_dataset["swe-chat"].avg_delta, 0.1);
  assert.equal(result.by_expected_shadow_action.weak_proxy_holdout.baseline_to_optimized_action_change_count, 1);
  assert.equal(result.qianxuesen_generalization.length, 5);
  assert.equal(result.verdict, "optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression");
});

test("external trajectory final comparison validates against schema", async () => {
  const result = await runExternalTrajectoryFinalComparison({
    sideBySide: sideBySideFixture(),
    alpha: alphaFixture(),
    baselineCommit: "3e79083",
    optimizedCommit: "HEAD",
    now: new Date("2026-05-16T02:20:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/external_trajectory_final_comparison.schema.json",
    data: result,
    name: "validate external trajectory final comparison"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("external trajectory final comparison writes local reports only", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-external-final-comparison-"));
  try {
    const result = await runExternalTrajectoryFinalComparison({
      sideBySide: sideBySideFixture(),
      alpha: alphaFixture(),
      baselineCommit: "3e79083",
      optimizedCommit: "HEAD",
      now: new Date("2026-05-16T02:20:00Z")
    });
    const written = await writeExternalTrajectoryFinalComparisonArtifacts({
      result,
      outDir,
      now: new Date("2026-05-16T02:20:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "external-trajectory-final-comparison");
    assert.equal(persisted.boundaries.github_pushed, false);
    assert.match(markdown, /# External Trajectory Final Comparison/);
    assert.match(markdown, /verdict: optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression/);
    assert.match(markdown, /zilliz_written: false/);
    assert.match(markdown, /github_pushed: false/);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
