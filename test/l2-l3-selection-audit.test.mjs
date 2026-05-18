import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  buildL2L3SelectionAuditReport,
  classifyL2L3PoolDecision,
  runL2L3SelectionAudit,
  writeL2L3SelectionAuditArtifacts
} from "../scripts/lib/l2-l3-selection-audit.mjs";

const execFileAsync = promisify(execFile);

function makeL2Item({
  sourceId,
  gateOk,
  quality,
  actionable = 4,
  weak = 0,
  violations = [],
  providerError = null,
  candidates = null,
  winnerCandidateId = null,
  winnerStrategy = null,
  l1SignalProfile = null,
  l3Feedback = null
}) {
  return {
    source_id: sourceId,
    provider: "hermes-delegate",
    model: "gemini-3-flash-preview",
    llm_api_calls: providerError ? 1 : 1,
    packet: {
      evidence_refs: [`ref:${sourceId}`],
      readout_family: "safety_boundary_pressure",
      route_hint: "policy",
      l1_signal_profile: l1SignalProfile
    },
    l3_feedback: l3Feedback,
    candidate_selection: candidates ? {
      requested_candidate_count: 3,
      returned_candidate_count: candidates.length,
      expected_candidate_count_met: candidates.length === 3,
      winner_candidate_id: winnerCandidateId,
      winner_strategy: winnerStrategy,
      winner_quality_score: quality,
      candidate_quality_scores: candidates.map((candidate) => candidate.gate.quality_score),
      candidate_passed_gate_count: candidates.filter((candidate) => candidate.gate.ok).length,
      candidate_failed_gate_count: candidates.filter((candidate) => !candidate.gate.ok).length,
      avg_candidate_quality_score: candidates.reduce((sum, candidate) => sum + candidate.gate.quality_score, 0) / candidates.length
    } : null,
    candidates,
    winner_candidate_id: winnerCandidateId,
    winner_strategy: winnerStrategy,
    draft: providerError ? null : {
      title: `${sourceId} L2 audit`,
      evidence_refs: [`ref:${sourceId}`],
      concrete_tasks: Array.from({ length: actionable + weak }, (_, index) => `task-${index + 1}`)
    },
    provider_error: providerError,
    gate: {
      ok: gateOk,
      violations,
      quality_score: quality,
      checks: {
        actionableTaskCount: actionable,
        weakTaskCount: weak,
        specificityHits: 8,
        providerError
      }
    }
  };
}

function l1Profile({
  sourceId,
  mode = "single",
  risk = "high",
  axes = ["strict_safety_boundary"],
  hits = {}
}) {
  return {
    schema_version: "misa.l1_signal_profile.v1",
    source_id: sourceId,
    advice_only: true,
    l2_eligible: mode !== "suppress",
    l2_candidate_mode: mode,
    l2_candidate_count_hint: mode === "single" ? 1 : (mode === "suppress" ? 0 : 2),
    l2_eligibility_reasons: mode === "suppress" ? [] : ["risk_high"],
    suppress_reasons: mode === "suppress" ? ["duplicate_covered_by_canonical_source"] : [],
    pool_group_id: `pool:${sourceId}`,
    canonical_source_id: sourceId,
    dedupe_status: mode === "multi_pool" ? "canonical" : "unique",
    signal_family: "public_boundary",
    risk_level: risk,
    route_hint: "policy",
    priority_score: risk === "critical" ? 100 : 85,
    novelty_status: "new",
    repeat_count: mode === "multi_pool" ? 2 : 1,
    evidence_refs: [`ref:${sourceId}`],
    new_evidence_refs: [`ref:${sourceId}`],
    evidence_density: "low",
    missing_evidence: false,
    strategy_axes: axes,
    uncertainty_level: mode === "recheck" ? "high" : "low",
    conflict_signals: mode === "recheck" ? ["multiple_route_pressure"] : [],
    dimension_hits: {
      l2_eligible: mode !== "suppress",
      dedupe_pool: mode === "multi_pool" || mode === "suppress",
      strategy_axes: axes.length >= 2,
      risk_level: ["high", "critical"].includes(risk),
      novelty_repeat: true,
      evidence_density: false,
      uncertainty_conflict: mode === "recheck",
      ...hits
    }
  };
}

function l2ReportFixture(results) {
  const candidateCount = results.reduce((sum, item) => sum + (item.candidates?.length ?? 0), 0);
  return {
    schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
    mode: "external-trajectory-llm-work-order-draft",
    ok: results.every((item) => item.gate.ok),
    created_at: "2026-05-17T12:00:00.000Z",
    provider: "hermes-delegate",
    model: "gemini-3-flash-preview",
    summary: {
      sample_count: results.length,
      draft_count: results.filter((item) => item.draft).length,
      requested_candidate_count: candidateCount ? 3 : 1,
      candidate_count: candidateCount || results.length,
      expected_candidate_count_met: candidateCount ? results.filter((item) => item.candidate_selection?.expected_candidate_count_met).length : null,
      expected_candidate_count_miss: candidateCount ? results.filter((item) => !item.candidate_selection?.expected_candidate_count_met).length : null,
      winner_selected_count: results.filter((item) => item.winner_candidate_id || item.draft).length,
      passed_gate_count: results.filter((item) => item.gate.ok).length,
      failed_gate_count: results.filter((item) => !item.gate.ok).length,
      provider_error_count: results.filter((item) => item.provider_error).length,
      avg_quality_score: 0.9,
      llm_api_calls: results.length,
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      route_changes: 0,
      winner_changes: 0,
      vps_touches: 0,
      github_pushes: 0,
      public_publishes: 0
    },
    safety: {
      no_write: true,
      changes_route: false,
      changes_winner: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false
    },
    results
  };
}

test("L2/L3 pool classifier forwards green and yellow but holds red", () => {
  const green = classifyL2L3PoolDecision(makeL2Item({
    sourceId: "green-001",
    gateOk: true,
    quality: 1
  }));
  const yellow = classifyL2L3PoolDecision(makeL2Item({
    sourceId: "yellow-001",
    gateOk: false,
    quality: 0.975,
    actionable: 4,
    weak: 1,
    violations: ["too_many_weak_tasks"]
  }));
  const red = classifyL2L3PoolDecision(makeL2Item({
    sourceId: "red-001",
    gateOk: false,
    quality: 0.89,
    actionable: 3,
    weak: 2,
    violations: ["too_few_actionable_tasks", "too_many_weak_tasks"]
  }));

  assert.equal(green.pool, "green");
  assert.equal(green.l4_forward, true);
  assert.equal(green.l1_signal_profile, null);
  assert.equal(yellow.pool, "yellow");
  assert.equal(yellow.l4_forward, true);
  assert.ok(yellow.reason_codes.includes("possible_false_reject"));
  assert.equal(red.pool, "red");
  assert.equal(red.l4_forward, false);
});

test("L2/L3 selection audit quantifies L1 signal dimensions against L2 quality", () => {
  const l2Report = l2ReportFixture([
    makeL2Item({
      sourceId: "l1-recheck-green",
      gateOk: true,
      quality: 1,
      actionable: 5,
      l1SignalProfile: l1Profile({
        sourceId: "l1-recheck-green",
        mode: "recheck",
        risk: "critical",
        axes: ["strict_safety_boundary", "counterexample_check"],
        hits: { uncertainty_conflict: true }
      })
    }),
    makeL2Item({
      sourceId: "l1-multipool-yellow",
      gateOk: false,
      quality: 0.975,
      actionable: 4,
      weak: 1,
      violations: ["too_many_weak_tasks"],
      l1SignalProfile: l1Profile({
        sourceId: "l1-multipool-yellow",
        mode: "multi_pool",
        axes: ["damping_repair", "source_dedupe_pool"],
        hits: { dedupe_pool: true, strategy_axes: true }
      })
    }),
    makeL2Item({
      sourceId: "l1-single-red",
      gateOk: false,
      quality: 0.7,
      actionable: 2,
      weak: 2,
      violations: ["too_few_actionable_tasks"],
      l1SignalProfile: l1Profile({
        sourceId: "l1-single-red",
        mode: "single",
        axes: ["strict_safety_boundary"]
      })
    })
  ]);
  const result = buildL2L3SelectionAuditReport({
    l2Report,
    batchSize: 50,
    thresholds: { red_spot_check_min: 1, red_spot_check_max: 1 },
    now: new Date("2026-05-17T12:00:00Z")
  });
  const strategyAxes = result.l1_signal_dimension_metrics.dimensions.find((item) => item.dimension === "strategy_axes");
  const riskLevel = result.l1_signal_dimension_metrics.dimensions.find((item) => item.dimension === "risk_level");

  assert.equal(result.l1_signal_dimension_metrics.with_l1_profile_count, 3);
  assert.equal(strategyAxes.sample_count, 2);
  assert.equal(strategyAxes.pool_counts.green, 1);
  assert.equal(strategyAxes.pool_counts.yellow, 1);
  assert.equal(strategyAxes.recheck_or_multi_pool_count, 2);
  assert.equal(strategyAxes.verdict, "positive_for_candidate_pool");
  assert.equal(riskLevel.sample_count, 3);
  assert.equal(result.decisions[0].l1_candidate_mode, "recheck");
  assert.ok(result.decisions[0].l1_strategy_axes.includes("counterexample_check"));
});

test("L2/L3 selection audit uses the L2-selected candidate winner", () => {
  const candidates = [
    {
      candidate_id: "boundary_safety",
      strategy: "boundary_safety",
      gate: { ok: false, quality_score: 0.72, violations: ["too_few_actionable_tasks"] }
    },
    {
      candidate_id: "evidence_trace",
      strategy: "evidence_trace",
      gate: { ok: true, quality_score: 1, violations: [] }
    },
    {
      candidate_id: "replay_verification",
      strategy: "replay_verification",
      gate: { ok: false, quality_score: 0.975, violations: ["too_many_weak_tasks"] }
    }
  ];
  const result = buildL2L3SelectionAuditReport({
    l2Report: l2ReportFixture([
      makeL2Item({
        sourceId: "multi-candidate-001",
        gateOk: true,
        quality: 1,
        candidates,
        winnerCandidateId: "evidence_trace",
        winnerStrategy: "evidence_trace"
      })
    ]),
    batchSize: 50,
    now: new Date("2026-05-17T12:00:00Z")
  });

  assert.equal(result.summary.candidate_count, 3);
  assert.equal(result.summary.winner_selected_count, 1);
  assert.equal(result.summary.candidate_best_found_count, 1);
  assert.equal(result.summary.candidate_best_found_rate, 1);
  assert.equal(result.summary.pool_counts.green, 1);
  assert.equal(result.decisions[0].winner_candidate_id, "evidence_trace");
  assert.equal(result.decisions[0].candidate_count, 3);
  assert.equal(result.decisions[0].l4_forward, true);
});

test("L2/L3 selection audit creates green yellow red pools and red spot checks", () => {
  const l2Report = l2ReportFixture([
    makeL2Item({ sourceId: "green-strong", gateOk: true, quality: 1, actionable: 5 }),
    makeL2Item({ sourceId: "green-borderline", gateOk: true, quality: 0.82, actionable: 4 }),
    makeL2Item({ sourceId: "yellow-high-score", gateOk: false, quality: 0.975, actionable: 4, weak: 1, violations: ["too_many_weak_tasks"] }),
    makeL2Item({
      sourceId: "red-low-action",
      gateOk: false,
      quality: 0.89,
      actionable: 3,
      weak: 2,
      violations: ["too_few_actionable_tasks"],
      l3Feedback: {
        final_status: "exhausted_no_value",
        total_draft_runs: 2,
        max_draft_runs: 2,
        rechecked: true
      }
    }),
    makeL2Item({ sourceId: "red-provider", gateOk: false, quality: 0, actionable: 0, weak: 0, violations: ["provider_call_failed"], providerError: { code: "provider_error" } })
  ]);
  const result = buildL2L3SelectionAuditReport({
    l2Report,
    l2ReportPath: "runs/test-l2.json",
    batchSize: 50,
    thresholds: { red_spot_check_min: 1, red_spot_check_max: 1 },
    now: new Date("2026-05-17T12:00:00Z")
  });

  assert.equal(result.mode, "l2-l3-selection-audit");
  assert.equal(result.summary.batch_status, "accumulating");
  assert.equal(result.summary.samples_until_next_periodic_review, 45);
  assert.deepEqual(result.summary.pool_counts, { green: 2, yellow: 1, red: 2 });
  assert.equal(result.summary.l3_feedback_counts.exhausted_no_value, 1);
  assert.equal(result.summary.l4_forward_count, 3);
  assert.equal(result.summary.possible_false_reject_count, 1);
  assert.equal(result.summary.low_quality_pass_count, 1);
  assert.equal(result.summary.red_spot_check_count, 1);
  assert.equal(result.safety.calls_llm, false);
  assert.equal(result.safety.writes_memory, false);
  assert.equal(result.safety.changes_route, false);
  assert.ok(result.decisions.find((decision) => decision.source_id === "red-low-action").l4_spot_check);
  assert.ok(result.decisions.find((decision) => decision.source_id === "red-low-action").reason_codes.includes("l3_feedback:exhausted_no_value"));
  assert.ok(result.l4_handoff.preview.some((item) => item.source_id === "yellow-high-score"));
  assert.equal(result.candidate_recheck.policy.default_mode, "light_single_default");
  assert.equal(result.candidate_recheck.policy.default_candidate_count, 1);
  assert.equal(result.candidate_recheck.policy.recheck_candidate_count, 2);
  assert.ok(result.candidate_recheck.recommended_source_ids.includes("yellow-high-score"));
  assert.ok(result.candidate_recheck.recommended_source_ids.includes("red-low-action"));
  assert.equal(result.candidate_recheck.recommended.find((item) => item.source_id === "red-low-action").reason, "red_spot_check");
});

test("L2/L3 selection audit marks 50-sample batches ready for self-review", () => {
  const results = Array.from({ length: 50 }, (_, index) => makeL2Item({
    sourceId: `green-${index + 1}`,
    gateOk: true,
    quality: 1,
    actionable: 4
  }));
  const result = buildL2L3SelectionAuditReport({
    l2Report: l2ReportFixture(results),
    batchSize: 50,
    now: new Date("2026-05-17T12:00:00Z")
  });

  assert.equal(result.summary.sample_count, 50);
  assert.equal(result.summary.batch_status, "ready_for_periodic_review");
  assert.equal(result.summary.samples_until_next_periodic_review, 0);
  assert.equal(result.quality_review.does_not_call_llm, true);
});

test("L2/L3 selection audit writes local ledger artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l2-l3-selection-audit-"));
  try {
    const l2Report = l2ReportFixture([
      makeL2Item({ sourceId: "green-001", gateOk: true, quality: 1 }),
      makeL2Item({ sourceId: "yellow-001", gateOk: false, quality: 0.975, actionable: 4, weak: 1, violations: ["too_many_weak_tasks"] })
    ]);
    const result = buildL2L3SelectionAuditReport({
      l2Report,
      l2ReportPath: "fixtures/l2.json",
      batchSize: 50,
      now: new Date("2026-05-17T12:00:00Z")
    });
    const written = await writeL2L3SelectionAuditArtifacts({
      result,
      l2Report,
      outDir: tempRoot,
      now: new Date("2026-05-17T12:00:00Z")
    });

    const quality = JSON.parse(await fs.readFile(written.output.quality_report_json_path, "utf8"));
    const manifest = JSON.parse(await fs.readFile(written.output.input_manifest_path, "utf8"));
    const poolLines = (await fs.readFile(written.output.pool_decisions_path, "utf8")).trim().split(/\r?\n/);
    const markdown = await fs.readFile(written.output.quality_report_markdown_path, "utf8");
    const l4Review = await fs.readFile(written.output.l4_review_path, "utf8");

    assert.equal(quality.summary.pool_counts.green, 1);
    assert.equal(quality.summary.pool_counts.yellow, 1);
    assert.equal(quality.candidate_recheck.policy.default_mode, "light_single_default");
    assert.equal(manifest.sample_count, 2);
    assert.equal(poolLines.length, 2);
    assert.equal(l4Review, "");
    assert.match(markdown, /# L2\/L3 Selection Audit/);
    assert.match(markdown, /## Candidate Recheck/);
    assert.match(markdown, /external:llm-work-order:recheck/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("L2/L3 selection audit CLI reads existing L2 report and writes review artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l2-l3-selection-audit-cli-"));
  try {
    const l2Path = path.join(tempRoot, "l2.json");
    await fs.writeFile(l2Path, JSON.stringify(l2ReportFixture([
      makeL2Item({ sourceId: "green-cli", gateOk: true, quality: 1 }),
      makeL2Item({ sourceId: "yellow-cli", gateOk: false, quality: 0.975, actionable: 4, weak: 1, violations: ["too_many_weak_tasks"] })
    ]), null, 2), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/l2-l3-selection-audit.mjs",
      "--l2-report",
      l2Path,
      "--out-dir",
      tempRoot,
      "--batch-size",
      "50"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5
    });

    assert.match(stdout, /l2-l3-selection-audit ok=true/);
    const quality = JSON.parse(await fs.readFile(path.join(tempRoot, "quality-report.json"), "utf8"));
    assert.equal(quality.summary.pool_counts.green, 1);
    assert.equal(quality.summary.pool_counts.yellow, 1);

    const loaded = await runL2L3SelectionAudit({
      l2ReportPath: l2Path,
      batchSize: 50,
      now: new Date("2026-05-17T12:00:00Z")
    });
    assert.equal(loaded.summary.l4_forward_count, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
