import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  runL1L3LocalExhaustReport
} from "../lib/l1-l3-local-exhaust-report.mjs";

function poolDecision(sourceId, status) {
  return {
    source_id: sourceId,
    l1_signal_profile: {
      signal_family: "keyword_risk_noise",
      risk_level: "medium",
      route_hint: "damping"
    },
    l1_candidate_mode: "single",
    l1_handoff_floor: "no_context_agent",
    candidate_count_decision: {
      requested_candidate_count: 1,
      l1_control: {
        handoff_floor: "no_context_agent"
      }
    },
    actionableTaskCount: status === "accepted_first_try" ? 4 : 2,
    weakTaskCount: status === "accepted_first_try" ? 0 : 3,
    gate_class: status === "accepted_first_try" ? "pass" : "hard_fail",
    violations: status === "accepted_first_try" ? [] : ["too_few_actionable_tasks"],
    l3_feedback: {
      final_status: status,
      attempts: []
    }
  };
}

test("local exhaust report quantifies historical labels, sample library, parquet metadata, and future probes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-local-exhaust-"));
  try {
    await fs.mkdir(path.join(tempRoot, "runs", "fixture", "l3"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "runs", "fixture", "l3", "pool-decisions.jsonl"),
      [
        JSON.stringify(poolDecision("swe-rebench-openhands:bad-001", "exhausted_no_value")),
        JSON.stringify(poolDecision("swe-rebench-openhands:clean-001", "accepted_first_try"))
      ].join("\n") + "\n"
    );

    const sampleLibrary = {
      summary: {
        library_row_count: 3,
        reflection_scope_count: 3,
        reflection_l3_labeled_count: 3,
        reflection_l3_missing_count: 0,
        reflection_bad_seed_count: 1,
        reflection_clean_labeled_count: 2,
        reflection_conflict_count: 0,
        l3_source_coverage_count: 3,
        l3_source_coverage_rate: 1,
        queue_bucket_counts: {
          strict_bad_seed: 1,
          strict_clean_holdout: 2
        },
        product_gate: {
          l1_auto_strategy_ready: false,
          reason: "fixture keeps L1 automatic strategy blocked"
        }
      },
      rows: [
        { source_id: "swe-rebench-openhands:bad-001" },
        { source_id: "swe-rebench-openhands:clean-001" },
        { source_id: "swe-rebench-openhands:clean-002" }
      ]
    };
    const sampleLibraryPath = path.join(tempRoot, "runs", "fixture", "l1-l3-sample-library.json");
    await fs.writeFile(sampleLibraryPath, `${JSON.stringify(sampleLibrary, null, 2)}\n`);
    const partialPath = path.join(tempRoot, "partial.jsonl");
    await fs.writeFile(partialPath, "{\"a\":1}\n{\"a\":2}\n");

    const result = await runL1L3LocalExhaustReport({
      repoRoot: tempRoot,
      runsDir: path.join(tempRoot, "runs"),
      sampleLibraryPath,
      parquetSummary: {
        schema_version: "misa.swe_rebench_parquet_metadata.v1",
        parquet_path: "F:/fixtures/trajectories.parquet",
        dataset: "swe-rebench-openhands",
        row_count: 10,
        resolved_true_count: 4,
        resolved_false_count: 6,
        resolved_null_count: 0,
        non_submit_count: 3,
        model_patch_missing_count: 1,
        pred_gen_tests_failed_count: 5,
        exit_status_counts: {
          submit: 7,
          "AgentStuckInLoopError: Agent got stuck in a loop": 3
        },
        high_priority_candidate_count_excluding_sampled: 2
      },
      futureProbeCandidates: [
        {
          source_id: "swe-rebench-openhands:new-001",
          instance_id: "new-001",
          repo: "example/repo",
          resolved_proxy: false,
          exit_status: "AgentStuckInLoopError: Agent got stuck in a loop",
          model_patch_available: true,
          priority_score: 90,
          reason_codes: ["resolved_proxy_false", "loop_or_iteration_limit"]
        }
      ],
      partialFullJsonlPath: partialPath,
      outDir: path.join(tempRoot, "out"),
      now: new Date("2026-05-20T06:30:00.000Z")
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.historical_pool_decision_rows, 2);
    assert.equal(result.summary.historical_known_bad_unique_sources, 1);
    assert.equal(result.summary.reflection_l3_missing_count, 0);
    assert.equal(result.summary.parquet_row_count, 10);
    assert.equal(result.summary.parquet_resolved_false_count, 6);
    assert.equal(result.summary.future_probe_candidate_written_count, 1);
    assert.equal(result.summary.can_create_more_real_l3_labels_without_llm, false);
    assert.equal(result.partial_full_jsonl.line_count, 2);
    assert.equal(result.partial_full_jsonl.usable_as_full_dataset, false);
    assert.equal(result.future_real_probe_candidates[0].source_id, "swe-rebench-openhands:new-001");
    assert.equal(await fs.stat(path.join(tempRoot, result.output.json_path)).then(() => true), true);
    assert.equal(await fs.stat(path.join(tempRoot, result.output.markdown_path)).then(() => true), true);
    assert.equal(await fs.stat(path.join(tempRoot, result.output.future_probe_candidates_path)).then(() => true), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
