import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  buildL2GateInterceptAnalysis,
  writeL2GateInterceptAnalysisArtifacts
} from "../lib/l2-gate-intercept-analysis.mjs";

const execFileAsync = promisify(execFile);

const allowedCommands = [
  "npm test",
  "npm run precheck",
  "npm run validate:schemas -- --json",
  "node --test experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs",
  "node --test test/curiosity-signal-gate.test.mjs",
  "node --test test/governance.test.mjs",
  "node --test test/ci-workflow.test.mjs"
];

const forbiddenScope = [
  "do_not_change_route",
  "do_not_change_winner",
  "do_not_write_memory",
  "do_not_write_zilliz",
  "do_not_create_embeddings",
  "do_not_call_external_api",
  "do_not_touch_vps",
  "do_not_push_github",
  "do_not_publish_publicly"
];

function packet(sourceId) {
  return {
    source_class: "trajectory_review",
    readout_family: "safety_boundary_pressure",
    route_hint: "policy",
    observed_signals: ["public_memory_boundary", "draft_no_write"],
    evidence_refs: [`ref:${sourceId}`, "runs:test-fixture"],
    relevant_files: [
      "experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs",
      "experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs",
      "test/curiosity-signal-gate.test.mjs",
      "scripts/lib/perception-sidecar.mjs"
    ],
    allowed_verification_commands: allowedCommands
  };
}

function nearPassDraft(sourceId) {
  return {
    title: `Audit ${sourceId} shadow boundary`,
    problem: `${sourceId} carries signal=public_memory_boundary and must remain observe-only.`,
    evidence_refs: [`ref:${sourceId}`, "runs:test-fixture"],
    concrete_tasks: [
      `In experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs, check source_id=${sourceId} field=authority; expected result is suggestion_only.`,
      `In experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs, check signal=public_memory_boundary for ${sourceId}; expected result is no route change.`,
      `In test/curiosity-signal-gate.test.mjs, check field=memory_write_allowed for ${sourceId}; expected result is false.`,
      `In scripts/lib/perception-sidecar.mjs, check evidence_ref=ref:${sourceId}; expected result is draft_no_write.`,
      "Review the related note before final handoff."
    ],
    acceptance_criteria: [
      "All evidence refs are preserved in the local draft.",
      "No route, winner, memory, Zilliz, embedding, VPS, GitHub, public publish, or external API effect is requested."
    ],
    verification_commands: [
      "npm test",
      "npm run precheck"
    ],
    forbidden_scope: forbiddenScope,
    risk_notes: [
      "The weak fifth task is a review reminder, but the first four tasks are concrete enough for L4.",
      "The draft stays observe-only."
    ],
    stop_condition: "Stop after local audit; do not execute the work order.",
    llm_notes: "Test fixture for old gate false rejection analysis."
  };
}

function hardFailDraft(sourceId) {
  return {
    title: "Explain external trajectory signal",
    problem: "Generic issue.",
    evidence_refs: [],
    concrete_tasks: [
      "Review logs",
      "Fix the workflow"
    ],
    acceptance_criteria: ["Works"],
    verification_commands: ["./deploy.sh"],
    forbidden_scope: [],
    risk_notes: [],
    stop_condition: "Deploy it",
    llm_notes: "bad fixture"
  };
}

function l2Item({ sourceId, draft, oldQuality, oldViolations }) {
  return {
    source_id: sourceId,
    provider: "hermes-delegate",
    model: "gemini-3-flash-preview",
    packet: packet(sourceId),
    draft,
    gate: {
      ok: false,
      violations: oldViolations,
      quality_score: oldQuality,
      checks: {
        actionableTaskCount: oldQuality >= 0.9 ? 4 : 1,
        weakTaskCount: oldQuality >= 0.9 ? 1 : 2,
        specificityHits: oldQuality >= 0.9 ? 9 : 0
      }
    }
  };
}

async function writeFixtureReport(repoRoot) {
  const reportDir = path.join(repoRoot, "runs", "fixture", "l2");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "external-trajectory-llm-work-order-draft.json");
  await fs.writeFile(reportPath, JSON.stringify({
    schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
    results: [
      l2Item({
        sourceId: "near-pass-001",
        draft: nearPassDraft("near-pass-001"),
        oldQuality: 0.975,
        oldViolations: ["too_many_weak_tasks"]
      }),
      l2Item({
        sourceId: "hard-fail-001",
        draft: hardFailDraft("hard-fail-001"),
        oldQuality: 0.42,
        oldViolations: ["too_many_weak_tasks", "too_few_actionable_tasks"]
      })
    ]
  }, null, 2), "utf8");
  return reportPath;
}

test("L2 gate intercept analysis separates old false rejects from hard fails", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-gate-intercepts-"));
  await writeFixtureReport(repoRoot);

  const result = await buildL2GateInterceptAnalysis({
    repoRoot,
    runsDir: "runs",
    now: new Date("2026-05-18T10:00:00Z")
  });

  assert.equal(result.input.l2_report_count, 1);
  assert.equal(result.input.deduped_result_count, 2);
  assert.equal(result.summary.old_blocked_count, 2);
  assert.equal(result.summary.old_blocked_near_pass_count, 1);
  assert.equal(result.summary.old_blocked_hard_fail_count, 1);
  assert.equal(result.summary.soft_violation_counts.too_many_weak_tasks, 1);
  assert.equal(result.top_old_blocked_near_pass[0].source_id, "near-pass-001");
  assert.equal(result.top_old_blocked_hard_fail[0].source_id, "hard-fail-001");
});

test("L2 gate intercept analysis writes local artifacts and CLI output", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-gate-intercepts-cli-"));
  await writeFixtureReport(repoRoot);

  const written = await writeL2GateInterceptAnalysisArtifacts({
    repoRoot,
    runsDir: "runs",
    outDir: "runs/gate-analysis",
    now: new Date("2026-05-18T10:05:00Z")
  });
  assert.equal(written.output.output_dir, "runs/gate-analysis");
  assert.ok(await fs.readFile(path.join(repoRoot, "runs", "gate-analysis", "gate-intercept-analysis.md"), "utf8"));

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(process.cwd(), "experiments", "selection-audit", "scripts", "l2-gate-intercept-analysis.mjs"),
    "--runs-dir",
    "runs",
    "--dry-run"
  ], { cwd: repoRoot });

  assert.match(stdout, /old_blocked_near_pass_count=1/);
  assert.match(stdout, /old_blocked_hard_fail_count=1/);
});
