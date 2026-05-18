import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { buildGenericWorkflowPerceptionDigest } from "../examples/external-trajectory-online-shadow/generic-workflow-adapter/adapter.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  buildExternalTrajectoryOnlineShadowContractReport,
  runExternalTrajectoryOnlineShadowContract,
  writeExternalTrajectoryOnlineShadowContractArtifacts
} from "../scripts/lib/external-trajectory-online-shadow-contract.mjs";

const execFileAsync = promisify(execFile);

function perceptionDigestFixture() {
  return {
    schema_version: "misa.perception_digest.v1",
    digest_id: "perception-online-shadow-test",
    mode: "shadow-perception-digest",
    generated_at: "2026-05-16T04:00:00.000Z",
    shadow_only: true,
    source_refs: [
      {
        source_id: "farcaster-public-boundary-001",
        source_kind: "farcaster_audit",
        source_refs: ["farcaster:audit:reply:001"],
        observed_signals: [
          "public_posting_boundary",
          "farcaster_public_memory_risk",
          "explicit_user_boundary"
        ],
        route_pressure: { policy: 2 },
        signal_fingerprint_id: "signal:policy:farcaster:public-boundary",
        suggested_priority: 100,
        authority: "hint_only",
        full_perception_holdout: {
          source_project: "misa",
          repo: "misa-cybernetic-evolution",
          time: "2026-05-16T04:00:00.000Z",
          task_family: "public_boundary_review"
        }
      },
      {
        source_id: "provider-timeout-repeat-002",
        source_kind: "runtime_failure",
        source_refs: ["runtime:failure:timeout:002"],
        observed_signals: ["repeated_failure_pattern"],
        route_pressure: { damping: 1 },
        signal_fingerprint_id: "signal:damping:provider-timeout",
        suggested_priority: 75,
        authority: "hint_only"
      },
      {
        source_id: "provider-timeout-repeat-003",
        source_kind: "runtime_failure",
        source_refs: ["runtime:failure:timeout:003"],
        observed_signals: ["repeated_failure_pattern"],
        route_pressure: { damping: 1 },
        signal_fingerprint_id: "signal:damping:provider-timeout",
        suggested_priority: 70,
        authority: "hint_only"
      }
    ],
    risk_hints: [
      {
        hint_id: "public-boundary-risk",
        source_id: "farcaster-public-boundary-001",
        kind: "public_boundary",
        level: "critical",
        reason: "public boundary needs review before downstream learning",
        source_refs: ["farcaster:audit:reply:001"],
        authority: "hint_only"
      }
    ],
    novelty_hints: [],
    expected_review_value_hints: [
      {
        hint_id: "provider-timeout-review-value",
        source_id: "provider-timeout-repeat-002",
        level: "medium",
        expected_value: "repeated runtime timeout may be useful damping evidence",
        source_refs: ["runtime:failure:timeout:002"],
        authority: "hint_only"
      }
    ],
    trace_continuity_hints: [],
    duplicate_clusters: [
      {
        cluster_id: "cluster-provider-timeout-repeat",
        source_ids: ["provider-timeout-repeat-002", "provider-timeout-repeat-003"],
        similarity: 0.96,
        reason: "same provider timeout pattern across adjacent runtime refs",
        authority: "hint_only"
      }
    ],
    signal_fingerprints: [
      {
        fingerprint_id: "signal:policy:farcaster:public-boundary",
        source_ids: ["farcaster-public-boundary-001"],
        source_kind: "farcaster_audit",
        route: "policy",
        signal_family: "public_boundary",
        observed_signals: [
          "public_posting_boundary",
          "farcaster_public_memory_risk",
          "explicit_user_boundary"
        ],
        source_refs: ["farcaster:audit:reply:001"],
        base_priority: 100,
        priority: 100,
        ledger_status: "new_signal",
        handled_status: "not_seen",
        handled_result: "none",
        seen_count: 1,
        new_evidence_refs: ["farcaster:audit:reply:001"],
        priority_adjustment: 0,
        recommended_action: "send_to_qianxuesen",
        status_reason: "new boundary signal",
        authority: "hint_only"
      },
      {
        fingerprint_id: "signal:damping:provider-timeout",
        source_ids: ["provider-timeout-repeat-002", "provider-timeout-repeat-003"],
        source_kind: "runtime_failure",
        route: "damping",
        signal_family: "provider_timeout",
        observed_signals: ["repeated_failure_pattern"],
        source_refs: ["runtime:failure:timeout:002", "runtime:failure:timeout:003"],
        base_priority: 75,
        priority: 82,
        ledger_status: "seen_with_new_evidence",
        handled_status: "open",
        handled_result: "none",
        seen_count: 3,
        new_evidence_refs: ["runtime:failure:timeout:003"],
        priority_adjustment: 7,
        recommended_action: "send_to_qianxuesen",
        status_reason: "repeat with new evidence",
        authority: "hint_only"
      }
    ],
    summary: {
      source_count: 3
    }
  };
}

test("external trajectory online shadow contract keeps real signals observe-only", async () => {
  const result = buildExternalTrajectoryOnlineShadowContractReport({
    perceptionDigest: perceptionDigestFixture(),
    perceptionDigestPath: "test-fixture",
    now: new Date("2026-05-16T04:00:00Z")
  });

  assert.equal(result.mode, "external-trajectory-online-observe-shadow-contract");
  assert.equal(result.ok, true);
  assert.equal(result.input.source_count, 3);
  assert.equal(result.summary.readout_record_count, 3);
  assert.equal(result.summary.review_hint_count, 2);
  assert.equal(result.summary.repair_ticket_draft_count, 2);
  assert.equal(result.summary.work_order_draft_count, 2);
  assert.equal(result.summary.l1_l2_eligible_count, 2);
  assert.equal(result.summary.l1_recheck_recommended_count, 1);
  assert.equal(result.summary.l1_multi_pool_recommended_count, 1);
  assert.equal(result.summary.l1_suppressed_count, 1);
  assert.equal(result.online_shadow_records[0].readout_family, "safety_boundary_pressure");
  assert.equal(result.online_shadow_records[0].l1_signal_profile.l2_candidate_mode, "recheck");
  assert.equal(result.online_shadow_records[1].l1_signal_profile.l2_candidate_mode, "multi_pool");
  assert.equal(result.online_shadow_records[2].l1_signal_profile.l2_candidate_mode, "suppress");
  assert.equal(result.online_shadow_records[2].l1_signal_profile.dedupe_status, "duplicate");
  assert.equal(result.online_shadow_records[2].l1_signal_profile.canonical_source_id, "provider-timeout-repeat-002");
  assert.ok(result.l1_signal_profile_quantification.dimensions.find((item) => item.dimension === "dedupe_pool").suppressed_count >= 1);
  assert.ok(result.l1_signal_profile_quantification.dimensions.find((item) => item.dimension === "strategy_axes").multi_pool_count >= 1);
  assert.equal(result.online_shadow_records[0].external_trajectory_readout.authority, "hint_only");
  assert.equal(result.online_shadow_records[0].holdout_fields.status, "available");
  assert.equal(result.online_shadow_records[1].holdout_fields.status, "planned_required_when_full_perception_is_available");
  assert.equal(result.repair_ticket_drafts[0].status, "draft_no_write");
  assert.equal(result.work_order_drafts[0].execution_policy.auto_execute_allowed, false);
  assert.equal(result.contract.readout_policy.can_change_route, false);
  assert.equal(result.contract.readout_policy.can_change_winner, false);
  assert.equal(result.safety.route_authority, false);
  assert.equal(result.safety.winner_authority, false);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_zilliz, false);
  assert.equal(result.safety.creates_embeddings, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
});

test("external trajectory online shadow contract validates against schema", async () => {
  const result = buildExternalTrajectoryOnlineShadowContractReport({
    perceptionDigest: perceptionDigestFixture(),
    perceptionDigestPath: "test-fixture",
    now: new Date("2026-05-16T04:00:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/external_trajectory_online_shadow_contract.schema.json",
    data: result,
    name: "validate external trajectory online shadow contract"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("external trajectory online shadow command can read the default perception digest", async () => {
  const result = await runExternalTrajectoryOnlineShadowContract({
    now: new Date("2026-05-16T04:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.input.perception_digest_path, "examples/perception_digest.example.json");
  assert.equal(result.summary.source_count, 1);
  assert.equal(result.safety.production_authority, false);
});

test("generic custom workflow digest documents the public adapter shape", async () => {
  const result = await runExternalTrajectoryOnlineShadowContract({
    perceptionDigestPath: "examples/external-trajectory-online-shadow/generic-workflow-digest.example.json",
    now: new Date("2026-05-16T04:30:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/perception_digest.schema.json",
    data: JSON.parse(await fs.readFile("examples/external-trajectory-online-shadow/generic-workflow-digest.example.json", "utf8")),
    name: "validate generic external trajectory workflow digest"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(result.ok, true);
  assert.equal(result.summary.source_count, 1);
  assert.equal(result.online_shadow_records[0].source_kind, "custom_workflow");
  assert.equal(result.online_shadow_records[0].holdout_fields.status, "available");
  assert.equal(result.online_shadow_records[0].holdout_fields.repo, "example-org/example-repo");
  assert.equal(result.online_shadow_records[0].primary_route_pressure, "damping");
  assert.equal(result.repair_ticket_drafts[0].status, "draft_no_write");
  assert.equal(result.safety.route_authority, false);
  assert.equal(result.safety.winner_authority, false);
});

test("generic workflow adapter converts custom events into the public socket input", async () => {
  const adapterInput = JSON.parse(await fs.readFile(
    "examples/external-trajectory-online-shadow/generic-workflow-adapter/input.workflow-events.json",
    "utf8"
  ));
  const digest = buildGenericWorkflowPerceptionDigest({
    adapterInput,
    now: "2026-05-16T04:30:00.000Z"
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/perception_digest.schema.json",
    data: digest,
    name: "validate generic workflow adapter digest"
  });
  const onlineShadow = await runExternalTrajectoryOnlineShadowContract({
    perceptionDigest: digest,
    perceptionDigestPath: "adapter-output",
    now: new Date("2026-05-16T04:30:00Z")
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(digest.summary.source_count, 1);
  assert.equal(digest.summary.llm_api_calls, 0);
  assert.equal(digest.summary.external_api_calls, 0);
  assert.equal(digest.summary.production_authority, false);
  assert.equal(digest.source_refs[0].full_perception_holdout.repo, "example-org/example-repo");
  assert.equal(digest.signal_fingerprints[0].route, "damping");
  assert.equal(onlineShadow.ok, true);
  assert.equal(onlineShadow.online_shadow_records[0].holdout_fields.status, "available");
  assert.equal(onlineShadow.repair_ticket_drafts[0].status, "draft_no_write");
});

test("generic workflow adapter CLI writes a digest that online shadow can consume", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-generic-workflow-adapter-"));
  const outFile = path.join(outDir, "digest.json");
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "examples/external-trajectory-online-shadow/generic-workflow-adapter/adapter.mjs",
      "--out-file",
      outFile,
      "--json",
      "--now",
      "2026-05-16T04:30:00.000Z"
    ]);
    const stdoutDigest = JSON.parse(stdout);
    const writtenDigest = JSON.parse(await fs.readFile(outFile, "utf8"));
    const onlineShadow = await runExternalTrajectoryOnlineShadowContract({
      perceptionDigestPath: outFile,
      now: new Date("2026-05-16T04:30:00Z")
    });

    assert.equal(stdoutDigest.schema_version, "misa.perception_digest.v1");
    assert.equal(writtenDigest.digest_id, stdoutDigest.digest_id);
    assert.equal(writtenDigest.safety.production_authority, false);
    assert.equal(onlineShadow.ok, true);
    assert.equal(onlineShadow.safety.route_authority, false);
    assert.equal(onlineShadow.safety.winner_authority, false);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});

test("external trajectory online shadow contract writes local reports only", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-external-online-shadow-"));
  try {
    const result = buildExternalTrajectoryOnlineShadowContractReport({
      perceptionDigest: perceptionDigestFixture(),
      perceptionDigestPath: "test-fixture",
      now: new Date("2026-05-16T04:00:00Z")
    });
    const written = await writeExternalTrajectoryOnlineShadowContractArtifacts({
      result,
      outDir,
      now: new Date("2026-05-16T04:00:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "external-trajectory-online-observe-shadow-contract");
    assert.equal(persisted.safety.touches_vps, false);
    assert.equal(persisted.safety.pushes_to_github, false);
    assert.match(markdown, /External Trajectory Online Observe-only Shadow Contract/);
    assert.match(markdown, /production_authority: false/);
    assert.match(markdown, /winner_authority: false/);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
