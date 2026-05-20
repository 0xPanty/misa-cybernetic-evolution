import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildL1L3SampleLibrary,
  runL1L3SampleLibrary
} from "../scripts/lib/l1-l3-sample-library.mjs";

function adaptationRecord(sourceId, { resolved = true, safety = false } = {}) {
  return {
    sample_id: sourceId,
    dataset: "swe-rebench-openhands",
    sample_type: "coding_replay_trajectory",
    source_ref: {
      path_hint: "swe-rebench-openhands/sanitized.jsonl",
      record_hint: sourceId
    },
    issues: [{
      kind: safety
        ? "swe_rebench_actual_command_context_requires_classification"
        : "keyword_risk_noise_requires_filter",
      calibration_target: safety ? "safety_regression_penalty" : "keyword_risk_context_classifier"
    }],
    resolved_proxy_sample: {
      available: true,
      resolved
    },
    rejection_reason_sample: {
      available: !resolved,
      reasons: resolved ? [] : ["fixture_failure"]
    },
    safety_boundary_sample: {
      available: safety
    }
  };
}

function l1Record(sourceId, {
  mode = "single",
  count = 1,
  signalFamily = "keyword_risk_noise",
  risk = "medium",
  route = "damping",
  observed = []
} = {}) {
  return {
    source_id: sourceId,
    observed_signals: observed,
    primary_route_pressure: route,
    l1_signal_profile: {
      l2_candidate_mode: mode,
      l2_candidate_count_hint: count,
      signal_family: signalFamily,
      risk_level: risk,
      route_hint: route,
      evidence_density: "high",
      uncertainty_level: risk === "high" ? "medium" : "low",
      strategy_axes: risk === "high" ? ["strict_safety_boundary"] : ["evidence_trace"]
    }
  };
}

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
      requested_candidate_count: 1
    },
    actionableTaskCount: status === "accepted_first_try" ? 4 : 2,
    weakTaskCount: status === "accepted_first_try" ? 0 : 3,
    gate_class: status === "accepted_first_try" ? "pass" : "hard_fail",
    violations: status === "accepted_first_try" ? [] : ["too_few_actionable_tasks", "too_many_weak_tasks"],
    l3_feedback: {
      final_status: status,
      attempts: status === "accepted_first_try" ? [] : [
        {
          gate_class: "hard_fail",
          violations: ["too_few_actionable_tasks", "too_many_weak_tasks"],
          actionableTaskCount: 2,
          weakTaskCount: 3
        },
        {
          gate_class: "hard_fail",
          violations: ["too_few_actionable_tasks", "too_many_weak_tasks"],
          actionableTaskCount: 2,
          weakTaskCount: 3
        }
      ]
    }
  };
}

test("L1/L3 sample library quantifies strict scope, labels, and backfill queue", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l1-l3-library-"));
  try {
    const adaptation = {
      summary: { sample_count: 4 },
      records: [
        adaptationRecord("strict-bad", { resolved: false }),
        adaptationRecord("strict-missing"),
        adaptationRecord("strict-clean"),
        adaptationRecord("high-risk", { safety: true })
      ]
    };
    const l1Alpha = {
      alpha_summary: {
        sample_count: 4,
        gemini_probe_set: {
          selected_source_ids: ["strict-missing"]
        }
      },
      online_shadow_report: {
        online_shadow_records: [
          l1Record("strict-bad"),
          l1Record("strict-missing"),
          l1Record("strict-clean"),
          l1Record("high-risk", {
            mode: "recheck",
            count: 2,
            signalFamily: "safety_boundary",
            risk: "high",
            route: "policy",
            observed: ["safety_boundary_available"]
          })
        ]
      }
    };
    await fs.mkdir(path.join(tempRoot, "runs", "fixture", "l3"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "runs", "fixture", "l3", "pool-decisions.jsonl"),
      [
        JSON.stringify(poolDecision("strict-bad", "exhausted_no_value")),
        JSON.stringify(poolDecision("strict-clean", "accepted_first_try"))
      ].join("\n") + "\n"
    );
    const adaptationPath = path.join(tempRoot, "adaptation.json");
    const l1Path = path.join(tempRoot, "l1-alpha.json");
    await fs.writeFile(adaptationPath, `${JSON.stringify(adaptation, null, 2)}\n`);
    await fs.writeFile(l1Path, `${JSON.stringify(l1Alpha, null, 2)}\n`);

    const result = await buildL1L3SampleLibrary({
      repoRoot: tempRoot,
      adaptationReportPath: adaptationPath,
      l1AlphaReportPath: l1Path,
      runsDir: path.join(tempRoot, "runs"),
      now: new Date("2026-05-20T01:00:00.000Z")
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.library_row_count, 4);
    assert.equal(result.summary.reflection_scope_count, 3);
    assert.equal(result.summary.reflection_bad_seed_count, 1);
    assert.equal(result.summary.reflection_clean_labeled_count, 1);
    assert.equal(result.summary.reflection_l3_missing_count, 1);
    assert.equal(result.summary.reflection_queue_count, 1);
    assert.equal(result.summary.product_gate.l1_auto_strategy_ready, false);
    assert.equal(result.queue.l2_l3_label_backfill[0].source_id, "strict-missing");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("L1/L3 sample library writes JSON, Markdown, rows, and queue artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l1-l3-library-write-"));
  try {
    const adaptation = {
      summary: { sample_count: 1 },
      records: [adaptationRecord("strict-missing")]
    };
    const l1Alpha = {
      alpha_summary: { sample_count: 1, gemini_probe_set: { selected_source_ids: [] } },
      online_shadow_report: {
        online_shadow_records: [l1Record("strict-missing")]
      }
    };
    await fs.mkdir(path.join(tempRoot, "runs"), { recursive: true });
    const adaptationPath = path.join(tempRoot, "adaptation.json");
    const l1Path = path.join(tempRoot, "l1-alpha.json");
    await fs.writeFile(adaptationPath, `${JSON.stringify(adaptation, null, 2)}\n`);
    await fs.writeFile(l1Path, `${JSON.stringify(l1Alpha, null, 2)}\n`);

    const result = await runL1L3SampleLibrary({
      repoRoot: tempRoot,
      adaptationReportPath: adaptationPath,
      l1AlphaReportPath: l1Path,
      runsDir: path.join(tempRoot, "runs"),
      outDir: path.join(tempRoot, "out"),
      now: new Date("2026-05-20T01:00:00.000Z")
    });

    assert.equal(result.output.output_dir, "out");
    assert.equal(await fs.stat(path.join(tempRoot, result.output.json_path)).then(() => true), true);
    assert.equal(await fs.stat(path.join(tempRoot, result.output.markdown_path)).then(() => true), true);
    assert.equal(await fs.stat(path.join(tempRoot, result.output.rows_jsonl_path)).then(() => true), true);
    assert.equal(await fs.stat(path.join(tempRoot, result.output.queue_jsonl_path)).then(() => true), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
