import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  buildL1L4WorkOrderPipelineReport,
  writeL1L4WorkOrderPipelineArtifacts
} from "../lib/l1-l4-work-order-pipeline.mjs";

const execFileAsync = promisify(execFile);

const FORBIDDEN_SCOPE = [
  "do_not_change_route",
  "do_not_change_winner",
  "do_not_write_persistent_memory",
  "do_not_write_vector_store",
  "do_not_touch_production",
  "do_not_push_repository",
  "do_not_public_publish"
];

function draftFor(sourceId, { highRisk = false } = {}) {
  const concreteTasks = [
    `In experiments/selection-audit/lib/l2-l3-selection-audit.mjs, check source_id=${sourceId}; expected result is L3 forwards only valid handoff rows.`,
    `In experiments/selection-audit/test/l2-l3-selection-audit.test.mjs, check pool assignment for ${sourceId}; expected result is green and review-only.`,
    `In experiments/selection-audit/lib/l4-work-order-review.mjs, check handoff target for ${sourceId}; expected result is no work-order execution.`,
    `In experiments/selection-audit/test/l4-work-order-review.test.mjs, check authorization fields for ${sourceId}; expected result is recommendation-only metadata.`
  ];
  if (highRisk) {
    concreteTasks.push("Push the branch to the remote repository and deploy the change to production after local tests pass.");
  }
  return {
    title: `${sourceId} pipeline handoff work order`,
    problem: `${sourceId} should pass through L1-L4 as a local report-only handoff check.`,
    evidence_refs: [`ref:${sourceId}`],
    concrete_tasks: concreteTasks,
    acceptance_criteria: [
      `Evidence ref:${sourceId} stays attached to the handoff review.`,
      "No route, winner, persistent state, production, repository push, or public publish effect is executed.",
      "The L4 review writes recommendation-only handoff metadata."
    ],
    verification_commands: ["npm test", "npm run precheck"],
    forbidden_scope: FORBIDDEN_SCOPE,
    risk_notes: ["Local report-only pipeline test."],
    stop_condition: "Stop after L4 handoff review is recorded."
  };
}

function l2Item(sourceId, { highRisk = false } = {}) {
  return {
    source_id: sourceId,
    provider: "mock",
    model: "mock-work-order",
    llm_api_calls: 0,
    packet: {
      evidence_refs: [`ref:${sourceId}`],
      readout_family: "generic_work_order_handoff",
      route_hint: "damping",
      relevant_files: [
        "experiments/selection-audit/lib/l2-l3-selection-audit.mjs",
        "experiments/selection-audit/lib/l4-work-order-review.mjs"
      ],
      observed_signals: ["work_order_handoff_check"],
      allowed_verification_commands: ["npm test", "npm run precheck"],
      l1_signal_profile: {
        signal_family: "keyword_risk_noise",
        risk_level: "medium",
        route_hint: "damping",
        l2_candidate_mode: "single",
        l2_candidate_count_hint: 1,
        l2_eligible: true
      }
    },
    candidate_count_decision: {
      policy: "l1_control",
      trigger: "l1_light_single",
      requested_candidate_count: 1,
      l1_control: {
        generate_l2: true,
        candidate_count: 1,
        handoff_floor: "no_context_agent"
      }
    },
    l3_feedback: {
      final_status: "accepted_first_try",
      total_draft_runs: 1,
      max_draft_runs: 2,
      rechecked: false
    },
    candidate_selection: null,
    candidates: null,
    winner_candidate_id: null,
    winner_strategy: null,
    draft: draftFor(sourceId, { highRisk }),
    provider_error: null,
    gate: {
      ok: true,
      violations: [],
      soft_violations: [],
      warning_codes: [],
      gate_class: "pass",
      quality_score: 1,
      checks: {
        actionableTaskCount: highRisk ? 5 : 4,
        weakTaskCount: 0,
        specificityHits: 8,
        providerError: null
      }
    }
  };
}

function l2ReportFixture() {
  const results = [
    l2Item("safe-handoff"),
    l2Item("needs-authorization", { highRisk: true })
  ];
  return {
    schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
    mode: "external-trajectory-llm-work-order-draft",
    ok: true,
    created_at: "2026-05-20T08:00:00.000Z",
    provider: "mock",
    model: "mock-work-order",
    input: {
      candidate_count_policy: "l1_control",
      candidate_mode: "light_single_default"
    },
    summary: {
      sample_count: results.length,
      draft_count: results.length,
      l1_suppressed_count: 0,
      candidate_mode: "light_single_default",
      l1_handoff_floor_counts: { no_context_agent: 2 },
      passed_gate_count: 2,
      failed_gate_count: 0,
      l3_recheck_triggered_count: 0,
      l3_accepted_after_recheck_count: 0,
      l3_exhausted_no_value_count: 0,
      llm_api_calls: 0,
      external_api_calls: 0,
      route_changes: 0,
      winner_changes: 0,
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      vps_touches: 0,
      github_pushes: 0,
      public_publishes: 0
    },
    safety: {
      local_only: true,
      executes_work_orders: false
    },
    results
  };
}

test("L1-L4 pipeline chains L2 report through L3 and L4 mock review", async () => {
  const result = await buildL1L4WorkOrderPipelineReport({
    l2Report: l2ReportFixture(),
    now: new Date("2026-05-20T08:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.l2_sample_count, 2);
  assert.equal(result.summary.l3_l4_forward_count, 2);
  assert.equal(result.summary.l4_sample_count, 2);
  assert.deepEqual(result.summary.l4_verdict_counts, {
    accept: 1,
    owner_needed: 1
  });
  assert.equal(result.summary.l4_requires_user_authorization_count, 1);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.executes_work_orders, false);
  assert.equal(result.safety.requests_user_authorization, true);

  const byId = new Map(result.l4_reviews.map((review) => [review.source_id, review]));
  assert.equal(byId.get("safe-handoff").handoff_target, "no_context_worker");
  assert.equal(byId.get("needs-authorization").handoff_target, "maintainer_or_owner");
  assert.equal(byId.get("needs-authorization").recommended_next_step, "request_user_authorization");
});

test("L1-L4 pipeline writes a compact index plus detailed subreports", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l1-l4-pipeline-"));
  try {
    const result = await buildL1L4WorkOrderPipelineReport({
      l2Report: l2ReportFixture(),
      now: new Date("2026-05-20T08:00:00Z")
    });
    const written = await writeL1L4WorkOrderPipelineArtifacts({
      result,
      outDir: tempRoot,
      now: new Date("2026-05-20T08:00:00Z")
    });

    assert.equal(Boolean(written.output.json_path), true);
    assert.equal(Boolean(written.output.l2_report_path), true);
    assert.equal(Boolean(written.output.l3_report_path), true);
    assert.equal(Boolean(written.output.l4_report_path), true);

    const compact = JSON.parse(await fs.readFile(path.join(tempRoot, "l1-l4-work-order-pipeline.json"), "utf8"));
    assert.equal(compact.summary.l4_requires_user_authorization_count, 1);
    assert.equal("reports" in compact, false);
    assert.equal((await fs.readdir(path.join(tempRoot, "l4"))).includes("l4-review.jsonl"), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("L1-L4 pipeline CLI can run from an existing L2 report without LLM calls", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l1-l4-pipeline-cli-"));
  try {
    const l2Path = path.join(tempRoot, "l2.json");
    await fs.writeFile(l2Path, `${JSON.stringify(l2ReportFixture(), null, 2)}\n`, "utf8");
    const { stdout } = await execFileAsync(process.execPath, [
      "experiments/selection-audit/scripts/l1-l4-work-order-pipeline.mjs",
      "--l2-report",
      l2Path,
      "--out-dir",
      tempRoot,
      "--now",
      "2026-05-20T08:00:00.000Z"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5
    });

    assert.match(stdout, /l1-l4-work-order-pipeline ok=true/);
    assert.match(stdout, /l4_samples=2/);
    assert.match(stdout, /requires_user_authorization=1/);
    const compact = JSON.parse(await fs.readFile(path.join(tempRoot, "l1-l4-work-order-pipeline.json"), "utf8"));
    assert.equal(compact.summary.llm_api_calls, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
