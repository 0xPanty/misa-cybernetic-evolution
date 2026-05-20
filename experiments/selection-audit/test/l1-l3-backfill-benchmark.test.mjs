import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  runL1L3BackfillBenchmark
} from "../lib/l1-l3-backfill-benchmark.mjs";

function l1Profile(sourceId) {
  return {
    schema_version: "misa.l1_signal_profile.v1",
    source_id: sourceId,
    advice_only: true,
    l2_eligible: true,
    l2_candidate_mode: "single",
    l2_candidate_count_hint: 1,
    l2_eligibility_reasons: ["evidence_high", "new_evidence", "route_damping"],
    suppress_reasons: [],
    pool_group_id: sourceId,
    canonical_source_id: sourceId,
    dedupe_status: "unique",
    signal_family: "keyword_context_filter",
    risk_level: "medium",
    route_hint: "damping",
    priority_score: 60,
    novelty_status: "new",
    repeat_count: 1,
    evidence_refs: [`issue:${sourceId}`, "fixture-sidecar.jsonl"],
    new_evidence_refs: [`issue:${sourceId}`, "fixture-sidecar.jsonl"],
    evidence_density: "high",
    missing_evidence: false,
    strategy_axes: ["damping_repair", "evidence_trace"],
    uncertainty_level: "low",
    conflict_signals: [],
    dimension_hits: {
      l2_eligible: true,
      dedupe_pool: false,
      strategy_axes: true,
      risk_level: false,
      novelty_repeat: true,
      evidence_density: true,
      uncertainty_conflict: false
    }
  };
}

function onlineShadowFixture(sourceIds) {
  return {
    schema_version: "misa.external_trajectory_online_shadow_contract.v1",
    mode: "external-trajectory-online-observe-only-shadow-contract",
    ok: true,
    created_at: "2026-05-20T02:00:00.000Z",
    input: {
      perception_digest_path: "fixture-perception-digest.json",
      source_count: sourceIds.length
    },
    online_shadow_records: sourceIds.map((sourceId) => ({
      record_id: `online-shadow-${sourceId}`,
      source_id: sourceId,
      source_kind: "external_swe_rebench_openhands",
      source_refs: [sourceId, `issue:${sourceId}`, "fixture-sidecar.jsonl"],
      signal_fingerprint_id: sourceId,
      observed_signals: [
        "coding_replay_trajectory",
        "keyword_risk_context_classifier",
        "keyword_risk_noise_requires_filter",
        "resolved_false",
        "swe_rebench_openhands",
        "swe_rebench_sidecar"
      ],
      route_pressure: { damping: 1 },
      primary_route_pressure: "damping",
      suggested_priority: 60,
      readout_family: "damping_or_failure_pressure",
      l1_signal_profile: l1Profile(sourceId)
    })),
    review_hints: [],
    repair_ticket_drafts: sourceIds.map((sourceId) => ({
      source_id: sourceId,
      severity: "P2"
    })),
    work_order_drafts: sourceIds.map((sourceId) => ({
      source_id: sourceId,
      title: `Review ${sourceId} keyword-risk context filter`,
      status: "draft",
      authority: "suggestion_only",
      route_hint: "damping",
      evidence_refs: [`issue:${sourceId}`, "fixture-sidecar.jsonl", sourceId],
      review_tasks: [
        "Check sanitized keyword-risk context classification.",
        "Confirm no route or winner authority changes."
      ],
      non_goals: [
        "Do not execute the external trajectory.",
        "Do not call external APIs."
      ]
    }))
  };
}

function adaptationFixture(sourceIds) {
  return {
    summary: { sample_count: sourceIds.length },
    records: sourceIds.map((sourceId) => ({
      sample_id: sourceId,
      dataset: "swe-rebench-openhands",
      sample_type: "coding_replay_trajectory",
      source_ref: {
        path_hint: "fixture-sidecar.jsonl",
        record_hint: sourceId
      },
      issues: [{
        kind: "keyword_risk_noise_requires_filter",
        calibration_target: "keyword_risk_context_classifier"
      }],
      resolved_proxy_sample: {
        available: true,
        resolved: false
      },
      rejection_reason_sample: {
        available: true,
        reasons: ["fixture_failure"]
      },
      safety_boundary_sample: {
        available: false
      }
    }))
  };
}

test("L1/L3 backfill benchmark writes clean new labels without polluting old baseline into the label pool", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l1-l3-backfill-"));
  try {
    const sourceIds = ["swe-rebench-openhands:fixture-a", "swe-rebench-openhands:fixture-b"];
    const runsDir = path.join(tempRoot, "runs");
    const queuePath = path.join(tempRoot, "queue.jsonl");
    const onlineShadowPath = path.join(tempRoot, "online-shadow-report.json");
    const adaptationPath = path.join(tempRoot, "adaptation.json");
    const l1AlphaPath = path.join(tempRoot, "l1-alpha.json");
    await fs.mkdir(runsDir, { recursive: true });
    await fs.writeFile(queuePath, sourceIds.map((sourceId) => JSON.stringify({
      source_id: sourceId,
      queue_bucket: "strict_unlabeled_l2_l3_priority",
      l3_label_state: "missing_l3_label",
      priority_score: 96
    })).join("\n") + "\n");
    const onlineShadow = onlineShadowFixture(sourceIds);
    await fs.writeFile(onlineShadowPath, `${JSON.stringify(onlineShadow, null, 2)}\n`);
    await fs.writeFile(adaptationPath, `${JSON.stringify(adaptationFixture(sourceIds), null, 2)}\n`);
    await fs.writeFile(l1AlphaPath, `${JSON.stringify({
      alpha_summary: { sample_count: sourceIds.length },
      online_shadow_report: onlineShadow
    }, null, 2)}\n`);

    const result = await runL1L3BackfillBenchmark({
      repoRoot: tempRoot,
      queuePath,
      onlineShadowReportPath: onlineShadowPath,
      adaptationReportPath: adaptationPath,
      l1AlphaReportPath: l1AlphaPath,
      runsDir,
      outDir: path.join(runsDir, "benchmark"),
      limit: 2,
      now: new Date("2026-05-20T02:00:00.000Z")
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.selected_source_count, 2);
    assert.equal(result.summary.old_bad_or_review_count, 2);
    assert.equal(result.summary.new_clean_count, 2);
    assert.equal(result.summary.improved_to_green_count, 2);
    assert.equal(result.summary.regressed_from_green_count, 0);
    assert.equal(result.summary.post_sample_library.reflection_clean_labeled_count, 2);
    assert.equal(result.summary.post_sample_library.reflection_l3_missing_count, 0);
    assert.equal(result.summary.post_sample_library.product_gate.l1_auto_strategy_ready, false);

    const oldPoolPath = path.join(runsDir, "benchmark", "comparison-bundle", "01-old-template", "pool-decisions.jsonl");
    const newPoolPath = path.join(runsDir, "benchmark", "new-backfill-l3", "pool-decisions.jsonl");
    assert.equal(await fs.stat(oldPoolPath).then(() => true, () => false), false);
    assert.equal(await fs.stat(newPoolPath).then(() => true), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
