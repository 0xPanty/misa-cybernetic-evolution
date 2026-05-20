import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { buildL2L3SelectionAuditReport } from "../lib/l2-l3-selection-audit.mjs";
import {
  buildL4WorkOrderReviewPacket,
  buildL4WorkOrderReviewReport,
  writeL4WorkOrderReviewArtifacts
} from "../lib/l4-work-order-review.mjs";

const execFileAsync = promisify(execFile);

function draftFor(sourceId, { weak = false, missingEvidence = false, highRiskAction = false } = {}) {
  const concreteTasks = [
    `In experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs, check source_id=${sourceId}; expected result is no route change.`,
    `In experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs, check evidence ref:${sourceId}; expected result is pass without memory writes.`,
    `In experiments/selection-audit/lib/l2-l3-selection-audit.mjs, check l4_forward for ${sourceId}; expected result is review-only handoff.`,
    weak ? "Review the logic." : `In experiments/selection-audit/test/l2-l3-selection-audit.test.mjs, check pool for ${sourceId}; expected result is no work-order execution.`
  ];
  if (highRiskAction) {
    concreteTasks.push("Push the branch to the remote repository and deploy the change to production after local tests pass.");
  }

  return {
    title: `${sourceId} no-context work order`,
    problem: `${sourceId} needs a local review of route and memory boundaries.`,
    evidence_refs: missingEvidence ? [] : [`ref:${sourceId}`],
    concrete_tasks: concreteTasks,
    acceptance_criteria: [
      "No route, winner, memory, Zilliz, embedding, VPS, GitHub, or public publish effect is requested.",
      "Verification commands are local and whitelisted.",
      `Evidence ref:${sourceId} stays attached to the review.`
    ],
    verification_commands: ["npm test", "npm run precheck"],
    forbidden_scope: [
      "do_not_change_route",
      "do_not_change_winner",
      "do_not_write_memory",
      "do_not_write_zilliz",
      "do_not_create_embeddings",
      "do_not_call_external_api",
      "do_not_touch_vps",
      "do_not_push_github",
      "do_not_publish_publicly"
    ],
    risk_notes: ["Review only; do not execute the work order."],
    stop_condition: "Stop after local review output is recorded."
  };
}

function l2Item({
  sourceId,
  gateOk = true,
  quality = 1,
  actionable = 4,
  weak = 0,
  violations = [],
  missingEvidence = false,
  highRiskAction = false
}) {
  return {
    source_id: sourceId,
    provider: "hermes-delegate",
    model: "gemini-3-flash-preview",
    llm_api_calls: 1,
    packet: {
      evidence_refs: missingEvidence ? [] : [`ref:${sourceId}`],
      readout_family: "safety_boundary_pressure",
      route_hint: "policy",
      relevant_files: [
        "experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs",
        "experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs"
      ],
      observed_signals: ["no_write_boundary"],
      allowed_verification_commands: ["npm test", "npm run precheck"]
    },
    l3_feedback: {
      final_status: "accepted_first_try",
      total_draft_runs: 1,
      rechecked: false
    },
    candidate_selection: null,
    candidates: null,
    winner_candidate_id: null,
    winner_strategy: null,
    draft: draftFor(sourceId, { weak: weak > 0, missingEvidence, highRiskAction }),
    provider_error: null,
    gate: {
      ok: gateOk,
      violations,
      soft_violations: weak > 0 ? ["too_many_weak_tasks"] : [],
      warning_codes: weak > 0 ? ["near_pass_single_weak_task"] : [],
      gate_class: gateOk ? "pass" : "hard_fail",
      quality_score: quality,
      checks: {
        actionableTaskCount: actionable,
        weakTaskCount: weak,
        specificityHits: 8,
        providerError: null
      }
    }
  };
}

function l2ReportFixture(results) {
  return {
    schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
    mode: "external-trajectory-llm-work-order-draft",
    ok: true,
    created_at: "2026-05-18T12:00:00.000Z",
    provider: "hermes-delegate",
    model: "gemini-3-flash-preview",
    summary: {
      sample_count: results.length,
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
    results
  };
}

test("L4 review packet is no-context and review-only", () => {
  const item = l2Item({ sourceId: "green-good" });
  const packet = buildL4WorkOrderReviewPacket({
    l2Item: item,
    l3Decision: {
      source_id: item.source_id,
      pool: "green",
      quality_score: 1,
      reason_codes: ["hard_gate_passed"]
    },
    l2Report: l2ReportFixture([item]),
    l3Report: { created_at: "2026-05-18T12:00:00.000Z" }
  });

  assert.equal(packet.layer, "L4");
  assert.equal(packet.context_policy.parent_context_allowed, false);
  assert.equal(packet.context_policy.memory_lookup_allowed, false);
  assert.equal(packet.context_policy.repo_file_reads_allowed, false);
  assert.equal(packet.execution_policy.execute_work_order, false);
  assert.equal(packet.execution_policy.github_push_allowed, false);
});

test("L4 review uses existing L3 handoff and writes l4-review ledger", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l4-work-order-review-"));
  try {
    const l2Report = l2ReportFixture([
      l2Item({ sourceId: "green-good" }),
      l2Item({ sourceId: "green-weak", quality: 0.975, weak: 1 }),
      l2Item({ sourceId: "yellow-gap", gateOk: false, quality: 0.975, actionable: 4, weak: 1, violations: ["too_many_weak_tasks"] }),
      l2Item({ sourceId: "red-spot", gateOk: false, quality: 0.86, actionable: 3, weak: 2, violations: ["too_few_actionable_tasks"] })
    ]);
    const l3Report = buildL2L3SelectionAuditReport({
      l2Report,
      l2ReportPath: "fixtures/l2.json",
      thresholds: { red_spot_check_min: 1, red_spot_check_max: 1 },
      now: new Date("2026-05-18T12:00:00Z")
    });

    const result = await buildL4WorkOrderReviewReport({
      l2Report,
      l3Report,
      provider: "mock",
      now: new Date("2026-05-18T12:00:00Z")
    });
    const written = await writeL4WorkOrderReviewArtifacts({
      result,
      outDir: tempRoot,
      l3Report,
      now: new Date("2026-05-18T12:00:00Z")
    });

    assert.equal(result.summary.sample_count, 4);
    assert.equal(result.summary.accept_count, 1);
    assert.equal(result.summary.revise_count, 3);
    assert.equal(result.summary.requires_user_authorization_count, 0);
    assert.equal(result.summary.llm_api_calls, 0);
    assert.equal(result.safety.executes_work_orders, false);
    assert.equal(result.reviews.find((review) => review.source_id === "green-weak").review.verdict, "revise");
    assert.equal(result.reviews.find((review) => review.source_id === "red-spot").l3_pool, "red");

    const ledger = await fs.readFile(written.output.l4_review_path, "utf8");
    assert.equal(ledger.trim().split(/\r?\n/).length, 4);
    const report = JSON.parse(await fs.readFile(written.output.l4_review_report_json_path, "utf8"));
    assert.equal(report.summary.feedback_signal_counts.policy_clean, 1);
    assert.equal(report.summary.feedback_signal_counts.low_revision_needed, 3);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("L4 mock review requests user authorization for high-risk side effects", async () => {
  const item = l2Item({
    sourceId: "green-high-risk",
    actionable: 5,
    highRiskAction: true
  });
  const l2Report = l2ReportFixture([item]);
  const l3Report = buildL2L3SelectionAuditReport({
    l2Report,
    l2ReportPath: "fixtures/l2.json",
    now: new Date("2026-05-18T12:00:00Z")
  });

  const result = await buildL4WorkOrderReviewReport({
    l2Report,
    l3Report,
    provider: "mock",
    now: new Date("2026-05-18T12:00:00Z")
  });

  assert.equal(result.summary.sample_count, 1);
  assert.equal(result.summary.owner_needed_count, 1);
  assert.equal(result.summary.requires_user_authorization_count, 1);
  assert.equal(result.summary.llm_api_calls, 0);
  assert.equal(result.safety.requests_user_authorization, true);
  assert.equal(result.safety.executes_work_orders, false);

  const review = result.reviews[0].review;
  assert.equal(review.verdict, "owner_needed");
  assert.equal(review.handoff_target, "maintainer_or_owner");
  assert.equal(review.requires_user_authorization, true);
  assert.equal(review.authorization_reason, "work_order_requests_high_risk_external_or_persistent_side_effects");
  assert.ok(review.authorization_scopes.includes("repository_push_or_publish"));
  assert.ok(review.authorization_scopes.includes("release_or_deployment"));
  assert.ok(review.authorization_scopes.includes("production_or_remote_runtime"));
  assert.equal(review.recommended_next_step, "request_user_authorization");
  assert.equal(review.recommendation_only, true);
  assert.equal(review.executes_work_order, false);
});

test("L4 review CLI can call Hermes delegate through a local bridge stub", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l4-work-order-review-cli-"));
  try {
    const l2Report = l2ReportFixture([l2Item({ sourceId: "green-cli" })]);
    const l3Report = buildL2L3SelectionAuditReport({
      l2Report,
      l2ReportPath: "l2.json",
      now: new Date("2026-05-18T12:00:00Z")
    });
    const l2Path = path.join(tempRoot, "l2.json");
    const l3Path = path.join(tempRoot, "quality-report.json");
    const stubPath = path.join(tempRoot, "hermes-delegate-stub.mjs");
    await fs.writeFile(l2Path, `${JSON.stringify(l2Report, null, 2)}\n`, "utf8");
    await fs.writeFile(l3Path, `${JSON.stringify(l3Report, null, 2)}\n`, "utf8");
    await fs.writeFile(stubPath, `
process.stdout.write(JSON.stringify({
  verdict: "accept",
  execution_readiness_score: 0.91,
  can_execute_without_parent_context: true,
  blocking_reasons: [],
  context_gaps: [],
  task_specificity_notes: ["stub accepted"],
  feedback_signals: ["policy_clean"],
  recommended_next_step: "forward_to_execution_trial",
  llm_notes: "stub"
}));
`, "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      "experiments/selection-audit/scripts/l4-work-order-review.mjs",
      "--l2-report",
      l2Path,
      "--l3-report",
      l3Path,
      "--out-dir",
      tempRoot,
      "--provider",
      "hermes-delegate",
      "--hermes-delegate-command",
      process.execPath,
      "--hermes-delegate-args-json",
      JSON.stringify([stubPath]),
      "--hermes-delegate-provider",
      "novai",
      "--hermes-delegate-model",
      "gemini-3-flash-preview"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5
    });

    assert.match(stdout, /l4-work-order-review ok=true/);
    assert.match(stdout, /hermes_delegate=novai\/gemini-3-flash-preview/);
    const report = JSON.parse(await fs.readFile(path.join(tempRoot, "l4-review-report.json"), "utf8"));
    assert.equal(report.summary.llm_api_calls, 1);
    assert.equal(report.reviews[0].review.verdict, "accept");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
