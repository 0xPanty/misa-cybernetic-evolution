import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { buildExternalTrajectoryOnlineShadowContractReport } from "../scripts/lib/external-trajectory-online-shadow-contract.mjs";
import {
  buildHermesDelegateDefaultArgs,
  buildHermesDelegateAuditPacket,
  buildExternalTrajectoryLlmWorkOrderDraftReport,
  buildLlmWorkOrderDraftingPackets,
  buildL3RepairObservation,
  gateLlmWorkOrderDraft
} from "../scripts/lib/external-trajectory-llm-work-order-draft.mjs";

const execFileAsync = promisify(execFile);

function perceptionDigestFixture() {
  return {
    schema_version: "misa.perception_digest.v1",
    digest_id: "perception-llm-work-order-test",
    mode: "shadow-perception-digest",
    generated_at: "2026-05-16T05:00:00.000Z",
    shadow_only: true,
    source_refs: [
      {
        source_id: "shadow-public-memory-risk-001",
        source_kind: "farcaster_audit",
        source_refs: ["shadow:farcaster:reply:001", "shadow:farcaster:reply:002"],
        observed_signals: [
          "public_posting_boundary",
          "farcaster_public_memory_risk",
          "explicit_user_boundary"
        ],
        route_pressure: { policy: 1 },
        signal_fingerprint_id: "signal:policy:farcaster:public-memory",
        suggested_priority: 100,
        authority: "hint_only"
      },
      {
        source_id: "custom-ci-failure-001",
        source_kind: "custom_workflow",
        source_refs: ["ci:run:123456", "github:example-org/example-repo:pull/42"],
        observed_signals: [
          "repeated_failure_pattern",
          "test_regression",
          "human_review_requested"
        ],
        route_pressure: { damping: 1, case: 1 },
        signal_fingerprint_id: "signal:damping:custom-workflow:ci",
        suggested_priority: 85,
        authority: "hint_only",
        full_perception_holdout: {
          source_project: "example-project",
          repo: "example-org/example-repo",
          time: "2026-05-16T05:00:00.000Z",
          task_family: "ci_regression_review"
        }
      }
    ],
    risk_hints: [
      {
        hint_id: "public-memory-risk",
        source_id: "shadow-public-memory-risk-001",
        kind: "public_boundary",
        level: "high",
        reason: "public memory risk needs policy attention before downstream learning",
        source_refs: ["shadow:farcaster:reply:001", "shadow:farcaster:reply:002"],
        authority: "hint_only"
      },
      {
        hint_id: "ci-risk",
        source_id: "custom-ci-failure-001",
        kind: "repeated_failure",
        level: "high",
        reason: "repeated CI failure should be reviewed before workflow behavior changes",
        source_refs: ["ci:run:123456", "github:example-org/example-repo:pull/42"],
        authority: "hint_only"
      }
    ],
    novelty_hints: [],
    expected_review_value_hints: [],
    trace_continuity_hints: [],
    summary: { source_count: 2 }
  };
}

function onlineShadowFixture() {
  return buildExternalTrajectoryOnlineShadowContractReport({
    perceptionDigest: perceptionDigestFixture(),
    perceptionDigestPath: "test-fixture-digest",
    now: new Date("2026-05-16T05:00:00Z")
  });
}

function goodProviderDraft(packet, note = "good") {
  const fileA = packet.context.relevant_files[0];
  const fileB = packet.context.relevant_files[1] ?? fileA;
  const signal = packet.record.observed_signals[0];
  return {
    title: `${note} ${packet.source_id} observe-only L2 audit`,
    problem: `${packet.source_id} carries ${signal}; keep the L2 draft no-write and useful for L3 review.`,
    evidence_refs: [...packet.workOrder.evidence_refs],
    concrete_tasks: [
      `In ${fileA}, check source_id=${packet.source_id} field=execution_policy.route_change_allowed; expected result is false and winner_change_allowed=false.`,
      `In ${fileB}, check signal=${signal} field=persistent_memory_write_allowed; expected result is false and zilliz_write_allowed=false.`,
      `In ${fileA}, check evidence_ref=${packet.workOrder.evidence_refs[0]} field=authority; expected result is suggestion_only, not execution authority.`,
      `In ${fileB}, check allowed_verification_commands for ${packet.source_id}; expected result is only whitelisted local commands and no VPS/GitHub/public publish action.`
    ],
    acceptance_criteria: [
      `${packet.source_id} preserves every evidence ref and keeps route_change_allowed=false.`,
      "The draft remains observe-only and does not request memory, Zilliz, embedding, VPS, GitHub, public publish, or external API effects."
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
    risk_notes: [
      `${signal} is review pressure only.`,
      "L3 feedback may select this draft, but still must not execute it."
    ],
    stop_condition: "Stop after L2 candidate scoring; do not execute the work order.",
    llm_notes: `${note} fixture candidate.`
  };
}

function badProviderDraft(packet) {
  return {
    title: "Explain external trajectory signal",
    problem: "Review the issue.",
    evidence_refs: [...packet.workOrder.evidence_refs],
    concrete_tasks: [
      "Review the logic",
      "Check tests",
      "Improve the process",
      "Discuss with the team"
    ],
    acceptance_criteria: ["Looks good"],
    verification_commands: ["./fake.sh", "npm test"],
    forbidden_scope: [],
    risk_notes: [],
    stop_condition: "Fix it",
    llm_notes: "bad fixture"
  };
}

async function writeHermesDelegateStub(body) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-hermes-delegate-stub-"));
  const stubPath = path.join(dir, "delegate-stub.mjs");
  await fs.writeFile(stubPath, body, "utf8");
  return stubPath;
}

const passingHermesDelegateStub = `
let stdin = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) stdin += chunk;
const input = JSON.parse(stdin);
const audit = input.audit_packet;
const source = audit.source;
const fileA = source.relevant_files[0];
const fileB = source.relevant_files[1] ?? fileA;
const signal = source.observed_signals[0] ?? source.readout_family;
const commandA = source.allowed_verification_commands[0];
const commandB = source.allowed_verification_commands.includes("npm run precheck")
  ? "npm run precheck"
  : source.allowed_verification_commands[1] ?? commandA;

process.stdout.write(JSON.stringify({
  title: source.source_class + ": " + source.source_id + " L2 observe-only audit",
  problem: source.source_id + " carries " + signal + " evidence; L2 should draft only and keep route/winner/memory authority blocked.",
  evidence_refs: source.evidence_refs,
  concrete_tasks: [
    "In " + fileA + ", check source_id=" + source.source_id + " signal=" + signal + " field=execution_policy.route_change_allowed; expected result route_change_allowed=false and winner_change_allowed=false.",
    "In " + fileB + ", verify evidence_refs=" + source.evidence_refs.join(", ") + " field=persistent_memory_write_allowed; expected result persistent_memory_write_allowed=false and zilliz_write_allowed=false.",
    "In " + fileA + ", inspect source_class=" + source.source_class + " and readout_family=" + source.readout_family + "; expected result authority remains hint_only/suggestion_only, not execution authority.",
    "In " + fileB + ", confirm allowed_verification_commands contains only whitelisted local commands; expected result no task executes a real work order, VPS action, GitHub push, memory write, Zilliz write, or embedding creation."
  ],
  acceptance_criteria: [
    source.source_id + " preserves every original evidence ref and keeps route_change_allowed=false.",
    "The L2 draft uses only whitelisted verification commands and keeps execute_work_order=false."
  ],
  verification_commands: [commandA, commandB],
  forbidden_scope: audit.output_contract.required_forbidden_scope,
  risk_notes: [
    "Hermes L2 receives only this audit packet and must not inherit parent chat history.",
    "Any output that changes route, winner, memory, Zilliz, embedding, VPS, GitHub, public publish, or execution authority fails the gate."
  ],
  stop_condition: "Stop after observe-only L2 draft validation; do not execute the work order.",
  llm_notes: "Stubbed Hermes delegate bridge returned a direct JSON draft for provider integration tests."
}));
`;

test("LLM work-order packets include context anchors and command whitelist", () => {
  const onlineShadow = onlineShadowFixture();
  const packets = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadow,
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0].context.source_class, "public_boundary");
  assert.equal(packets[0].record.l1_signal_profile.l2_candidate_mode, "recheck");
  assert.ok(packets[0].record.l1_signal_profile.strategy_axes.includes("strict_safety_boundary"));
  assert.ok(packets[0].context.context_anchors.includes("public_posting_boundary"));
  assert.ok(packets[0].context.relevant_files.includes("test/curiosity-signal-gate.test.mjs"));
  assert.ok(packets[0].allowed_verification_commands.includes("npm test"));
  assert.ok(packets[0].allowed_verification_commands.some((command) => command.startsWith("npm run external:online-shadow")));
});

test("Hermes delegate audit packet is no-context observe-only", () => {
  const [packet] = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"]
  });
  const auditPacket = buildHermesDelegateAuditPacket(packet);

  assert.equal(auditPacket.layer, "L2");
  assert.equal(auditPacket.role, "no-context-auditor");
  assert.equal(auditPacket.context_policy.inherit_chat_history, false);
  assert.equal(auditPacket.execution_policy.observe_only, true);
  assert.equal(auditPacket.execution_policy.route_change_allowed, false);
  assert.equal(auditPacket.execution_policy.winner_change_allowed, false);
  assert.equal(auditPacket.execution_policy.memory_write_allowed, false);
  assert.equal(auditPacket.execution_policy.zilliz_write_allowed, false);
  assert.equal(auditPacket.execution_policy.embedding_creation_allowed, false);
  assert.equal(auditPacket.execution_policy.execute_work_order, false);
  assert.equal(auditPacket.source.l1_signal_hint.l2_candidate_mode, "recheck");
  assert.equal(auditPacket.source.l1_signal_hint.role, "branch_hint_only");
  assert.equal(auditPacket.source.l1_signal_hint.dimension_hits, undefined);
});

test("Hermes delegate defaults to one-shot no-rules delegation args", () => {
  const args = buildHermesDelegateDefaultArgs({
    prompt: "return json only",
    provider: "novai",
    model: "gemini-3-flash-preview"
  });

  assert.deepEqual(args, [
    "--ignore-rules",
    "--provider",
    "novai",
    "--model",
    "gemini-3-flash-preview",
    "-t",
    "delegation",
    "-z",
    "return json only"
  ]);
});

test("LLM work-order gate rejects fake commands and generic tasks", () => {
  const [packet] = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["custom-ci-failure-001"]
  });
  const draft = {
    title: "CI 构建失败修复",
    problem: "CI failed.",
    evidence_refs: ["ci:run:123456", "github:example-org/example-repo:pull/42"],
    concrete_tasks: [
      "审查最近几次 CI 构建的日志，找出失败的具体原因",
      "更新测试脚本",
      "优化构建流程",
      "与团队成员讨论并获得认可"
    ],
    acceptance_criteria: ["CI works", "Team approves"],
    verification_commands: ["./build.sh --dry-run", "npm test"],
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
    risk_notes: [],
    stop_condition: "stop",
    llm_notes: "test"
  };
  const gate = gateLlmWorkOrderDraft({ packet, draft });

  assert.equal(gate.ok, false);
  assert.ok(gate.violations.includes("non_whitelisted_verification_command"));
  assert.ok(gate.violations.includes("live_effect_language_detected"));
  assert.ok(gate.violations.includes("too_many_generic_tasks"));
  assert.ok(gate.violations.includes("too_few_actionable_tasks"));
  assert.ok(gate.violations.includes("too_many_weak_tasks"));
});

test("LLM work-order gate treats mandatory human-in-the-loop as an explicit expectation", () => {
  const [packet] = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"]
  });
  const draft = {
    title: "Audit shadow-public-memory-risk-001 public memory boundary",
    problem: "shadow-public-memory-risk-001 carries public_posting_boundary and memory-risk evidence that must remain observe-only.",
    evidence_refs: [...packet.workOrder.evidence_refs],
    concrete_tasks: [
      "In scripts/lib/external-trajectory-online-shadow-contract.mjs, check source_id=shadow-public-memory-risk-001 field=execution_policy.route_change_allowed; expected result is false and winner_change_allowed=false.",
      `In test/fixtures/perception/shadow-sources/01-public-memory-risk.json, check evidence_ref=${packet.workOrder.evidence_refs[0]} field=publication_allowed; expected result is false with no public publish path.`,
      "In test/curiosity-signal-gate.test.mjs, check signal=public_posting_boundary field=execution_policy.observe_only; expected result is true and the gate passes only as review pressure.",
      "In scripts/lib/perception-sidecar.mjs, check signal=farcaster_reply_success field=memory write boundary; expected result is a mandatory human-in-the-loop flag before trajectory promotion."
    ],
    acceptance_criteria: [
      "shadow-public-memory-risk-001 preserves every evidence ref and stays suggestion_only.",
      "No task requests route, winner, memory, Zilliz, embedding, VPS, GitHub, public publish, or external API effects."
    ],
    verification_commands: [
      "npm test",
      "npm run precheck"
    ],
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
    risk_notes: [
      "public_posting_boundary must remain review pressure only.",
      "mandatory human-in-the-loop wording is an explicit expected result, not a vague task."
    ],
    stop_condition: "Stop after observe-only gate validation; do not execute the work order.",
    llm_notes: "Fixture mirrors high-quality L2 wording returned by Hermes delegate."
  };
  const gate = gateLlmWorkOrderDraft({ packet, draft });

  assert.equal(gate.ok, true);
  assert.equal(gate.checks.actionableTaskCount, 4);
  assert.equal(gate.checks.weakTaskCount, 0);
});

test("LLM work-order gate recognizes project-specific state labels as expectations", () => {
  const [packet] = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"]
  });
  const draft = {
    title: "Audit shadow-public-memory-risk-001 public posting boundary",
    problem: "shadow-public-memory-risk-001 must keep public posting and memory pressure in local shadow review.",
    evidence_refs: [...packet.workOrder.evidence_refs],
    concrete_tasks: [
      "In scripts/lib/external-trajectory-online-shadow-contract.mjs, check source_id shadow-public-memory-risk-001 for the publication_allowed field; expected result is false.",
      "In test/external-trajectory-online-shadow-contract.test.mjs, check the farcaster_public_memory_risk signal; expected result is a draft_no_write status with no state mutation.",
      "In test/fixtures/perception/shadow-sources/01-public-memory-risk.json, check the explicit_user_boundary field; expected result is a safety_boundary_pressure classification.",
      "In test/curiosity-signal-gate.test.mjs, check source_id shadow-public-memory-risk-001; expected result is successful gating of the public_posting_boundary signal."
    ],
    acceptance_criteria: [
      "All project-specific expected state labels are recognized as concrete outcomes.",
      "No route, winner, memory, Zilliz, embedding, VPS, GitHub, public publish, or external API effects are requested."
    ],
    verification_commands: [
      "npm test",
      "npm run precheck"
    ],
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
    risk_notes: [
      "draft_no_write and safety_boundary_pressure are concrete project states.",
      "successful gating is tied to public_posting_boundary, not a generic success claim."
    ],
    stop_condition: "Stop after local shadow review; do not execute the work order.",
    llm_notes: "Fixture mirrors real Hermes L2 state-label wording."
  };
  const gate = gateLlmWorkOrderDraft({ packet, draft });

  assert.equal(gate.ok, true);
  assert.equal(gate.checks.actionableTaskCount, 4);
  assert.equal(gate.checks.weakTaskCount, 0);
});

test("LLM work-order gate recognizes concrete no-effect expectation wording", () => {
  const [packet] = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["custom-ci-failure-001"]
  });
  const signal = packet.record.observed_signals[0];
  const draft = {
    title: "Audit custom-ci-failure-001 damping and no-effect boundary",
    problem: "custom-ci-failure-001 must stay in observe-only review with no route, winner, memory, or embedding effects.",
    evidence_refs: [...packet.workOrder.evidence_refs],
    concrete_tasks: [
      `In scripts/lib/perception-sidecar.mjs, check signal=${signal} for ${packet.source_id}; expected result is correct classification without triggering a memory-write request.`,
      `In test/curiosity-signal-gate.test.mjs, check ${signal} gate logic for ${packet.source_id}; expected result is suppression of all memory-write requests and Zilliz updates.`,
      `In test/governance.test.mjs, check the no-context-auditor role boundary for ${packet.source_id}; expected result is an empty write-set for Zilliz collection updates and embedding generation calls.`,
      `In test/external-trajectory-online-shadow-contract.test.mjs, check l2_candidate_mode and candidate_count for ${packet.source_id}; expected result is enforcement of a single candidate count in the shadow contract.`
    ],
    acceptance_criteria: [
      `${packet.source_id} keeps every evidence ref and no effect request reaches route, winner, memory, Zilliz, or embeddings.`,
      "No task asks for live execution or persistent writes."
    ],
    verification_commands: [
      "npm test",
      "npm run precheck"
    ],
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
    risk_notes: [
      "The wording names concrete no-effect outcomes, not vague success.",
      "The gate should not force only false/zero vocabulary when equivalent no-effect phrasing is present."
    ],
    stop_condition: "Stop after local gate validation; do not execute the work order.",
    llm_notes: "Fixture mirrors real Gemini wording from the VPS rerun."
  };
  const gate = gateLlmWorkOrderDraft({ packet, draft });

  assert.equal(gate.ok, true);
  assert.equal(gate.checks.actionableTaskCount, 4);
  assert.equal(gate.checks.weakTaskCount, 0);
});

test("L3 repair observation names failed task anchors for the next repair prompt", () => {
  const [packet] = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"]
  });
  const gate = gateLlmWorkOrderDraft({ packet, draft: badProviderDraft(packet) });
  const observation = buildL3RepairObservation(gate);

  assert.equal(observation.schema_version, "misa.l3_repair_observation.v1");
  assert.ok(observation.violations.includes("too_few_actionable_tasks"));
  assert.ok(observation.rewrite_task_indices.length >= 1);
  assert.ok(observation.failed_tasks[0].missing_anchor_types.includes("file_or_test"));
  assert.equal(observation.counts.target_actionableTaskCount, 4);
});

test("LLM work-order draft report passes with context-specific mock provider", async () => {
  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001", "custom-ci-failure-001"],
    provider: "mock",
    maxSamples: 2,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.sample_count, 2);
  assert.equal(result.summary.passed_gate_count, 2);
  assert.equal(result.summary.llm_api_calls, 0);
  assert.equal(result.summary.external_api_calls, 0);
  assert.equal(result.safety.changes_route, false);
  assert.equal(result.safety.writes_memory, false);
  assert.equal(result.results.every((item) => item.gate.quality_score >= 0.82), true);
  assert.equal(result.results.every((item) => item.gate.checks.actionableTaskCount >= 4), true);
  assert.equal(result.results.every((item) => item.gate.checks.weakTaskCount === 0), true);
  assert.ok(result.results[0].draft.verification_commands.every((command) => (
    result.results[0].packet.allowed_verification_commands.includes(command)
  )));
});

test("LLM work-order draft report lets L1 control candidate count before L3 feedback", async () => {
  const fixture = onlineShadowFixture();
  fixture.online_shadow_records[0].l1_signal_profile.l2_candidate_mode = "recheck";
  fixture.online_shadow_records[0].l1_signal_profile.l2_candidate_count_hint = 2;
  fixture.online_shadow_records[1].l1_signal_profile.l2_candidate_mode = "single";
  fixture.online_shadow_records[1].l1_signal_profile.l2_candidate_count_hint = 1;

  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: fixture,
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001", "custom-ci-failure-001"],
    provider: "mock",
    repairAttempts: 0,
    maxSamples: 2,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(result.summary.candidate_count_policy, "l1_control");
  assert.deepEqual(result.summary.requested_candidate_count_histogram, { 1: 1, 2: 1 });
  assert.equal(result.summary.requested_candidate_count, 2);
  assert.equal(result.summary.candidate_count, 3);
  assert.equal(result.summary.l1_dynamic_recheck_count, 1);
  assert.equal(result.summary.l1_recheck_hint_count, 1);
  assert.equal(result.summary.light_single_count, 1);
  assert.equal(result.results[0].candidate_selection.requested_candidate_count, 2);
  assert.equal(result.results[0].candidates.length, 2);
  assert.equal(result.results[0].candidate_count_decision.trigger, "l1_multi_candidate");
  assert.equal(result.results[0].candidate_count_decision.l1_candidate_mode, "recheck");
  assert.equal(result.results[0].candidate_count_decision.l1_control.candidate_count, 2);
  assert.equal(result.results[0].candidate_count_decision.l1_control.handoff_floor, "human_owner");
  assert.equal(result.results[1].candidate_selection.requested_candidate_count, 1);
  assert.equal(result.results[1].candidates.length, 1);
  assert.equal(result.results[1].candidate_count_decision.trigger, "l1_light_single");
});

test("LLM work-order draft report lets L1 suppress low-value sources before provider calls", async () => {
  const fixture = onlineShadowFixture();
  fixture.online_shadow_records[0].l1_signal_profile.l2_candidate_mode = "suppress";
  fixture.online_shadow_records[0].l1_signal_profile.l2_candidate_count_hint = 0;
  fixture.online_shadow_records[0].l1_signal_profile.l2_eligible = false;
  fixture.online_shadow_records[0].l1_signal_profile.suppress_reasons = ["duplicate_covered_by_canonical_source"];
  fixture.online_shadow_records[1].l1_signal_profile.l2_candidate_mode = "single";
  fixture.online_shadow_records[1].l1_signal_profile.l2_candidate_count_hint = 1;

  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: fixture,
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001", "custom-ci-failure-001"],
    provider: "mock",
    repairAttempts: 0,
    maxSamples: 2,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(result.summary.sample_count, 2);
  assert.equal(result.summary.draft_count, 1);
  assert.deepEqual(result.summary.requested_candidate_count_histogram, { 0: 1, 1: 1 });
  assert.equal(result.summary.l1_suppressed_count, 1);
  assert.equal(result.summary.llm_api_calls, 0);
  assert.equal(result.results[0].suppressed, true);
  assert.equal(result.results[0].llm_api_calls, 0);
  assert.equal(result.results[0].candidate_count_decision.trigger, "l1_suppress");
  assert.equal(result.results[0].candidate_selection.requested_candidate_count, 0);
  assert.deepEqual(result.results[0].candidates, []);
  assert.equal(result.results[1].suppressed, undefined);
  assert.equal(result.results[1].candidate_count_decision.trigger, "l1_light_single");
});

test("LLM work-order draft report can select the best of three candidates from one call", async () => {
  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: async ({ packet }) => {
      const fileA = packet.context.relevant_files[0];
      const fileB = packet.context.relevant_files[1] ?? fileA;
      const signal = packet.record.observed_signals[0];
      const goodDraft = (candidateId, taskSuffix = "") => ({
        candidate_id: candidateId,
        strategy: candidateId,
        title: `${candidateId} ${packet.source_id} observe-only audit`,
        problem: `${packet.source_id} carries ${signal}; keep L2 output as a no-write draft for L4 review.`,
        evidence_refs: [...packet.workOrder.evidence_refs],
        concrete_tasks: [
          `In ${fileA}, check source_id=${packet.source_id} field=execution_policy.route_change_allowed; expected result is false and winner_change_allowed=false.${taskSuffix}`,
          `In ${fileB}, check signal=${signal} field=persistent_memory_write_allowed; expected result is false with zilliz_write_allowed=false.${taskSuffix}`,
          `In ${fileA}, check evidence_ref=${packet.workOrder.evidence_refs[0]} field=authority; expected result is suggestion_only and not execution authority.${taskSuffix}`,
          `In ${fileB}, check allowed_verification_commands for ${packet.source_id}; expected result is only whitelisted local commands and no VPS/GitHub/public publish action.${taskSuffix}`
        ],
        acceptance_criteria: [
          `${packet.source_id} preserves every evidence ref and keeps route_change_allowed=false.`,
          "The draft remains observe-only and does not request memory, Zilliz, embedding, VPS, GitHub, public publish, or external API effects."
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
        risk_notes: [
          `${signal} is review pressure only.`,
          "Candidate selection is local scoring only, not route or winner authority."
        ],
        stop_condition: "Stop after L2 candidate scoring; do not execute the work order.",
        llm_notes: `${candidateId} fixture candidate.`
      });
      return JSON.stringify({
        candidates: [
          {
            candidate_id: "boundary_safety",
            strategy: "boundary_safety",
            title: "Weak generic draft",
            problem: "Review the thing.",
            evidence_refs: [...packet.workOrder.evidence_refs],
            concrete_tasks: ["review logic", "check tests", "improve process", "discuss with team"],
            acceptance_criteria: ["looks good", "team approves"],
            verification_commands: ["./fake.sh", "npm test"],
            forbidden_scope: [],
            risk_notes: [],
            stop_condition: "stop",
            llm_notes: "bad fixture"
          },
          goodDraft("evidence_trace"),
          goodDraft("replay_verification", " Confirm the replayable expected result is explicit.")
        ]
      });
    },
    candidateCount: 3,
    repairAttempts: 0,
    maxSamples: 1,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(result.summary.sample_count, 1);
  assert.equal(result.summary.llm_api_calls, 1);
  assert.equal(result.summary.requested_candidate_count, 3);
  assert.equal(result.summary.candidate_count, 3);
  assert.equal(result.summary.winner_selected_count, 1);
  assert.equal(result.results[0].candidates.length, 3);
  assert.equal(result.results[0].winner_candidate_id, "evidence_trace");
  assert.equal(result.results[0].gate.ok, true);
  assert.equal(result.results[0].loser_ledger.length, 2);
  assert.ok(result.results[0].loser_ledger.some((item) => item.candidate_id === "boundary_safety"));
});

test("LLM work-order draft report lets L3 feedback trigger one light-single recheck", async () => {
  let calls = 0;
  const prompts = [];
  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: async ({ packet, prompt, previousFailure }) => {
      calls += 1;
      prompts.push(prompt);
      if (calls === 2) {
        assert.ok(previousFailure);
        assert.match(prompt, /L3 repair observation/);
        assert.match(prompt, /rewrite_task_indices/);
        assert.match(prompt, /missing_anchor_types/);
      }
      return JSON.stringify(calls === 1
        ? badProviderDraft(packet)
        : goodProviderDraft(packet, "rechecked"));
    },
    repairAttempts: 1,
    maxSamples: 1,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(calls, 2);
  assert.doesNotMatch(prompts[0], /L3 repair observation/);
  assert.equal(result.summary.llm_api_calls, 2);
  assert.equal(result.summary.l3_recheck_triggered_count, 1);
  assert.equal(result.summary.l3_accepted_after_recheck_count, 1);
  assert.equal(result.summary.l3_exhausted_no_value_count, 0);
  assert.equal(result.results[0].gate.ok, true);
  assert.equal(result.results[0].l3_feedback.final_status, "accepted_after_l3_recheck");
  assert.equal(result.results[0].l3_feedback.total_draft_runs, 2);
  assert.equal(result.results[0].l3_feedback.max_draft_runs, 2);
  assert.equal(result.results[0].l3_feedback.attempts[0].repair_observation.schema_version, "misa.l3_repair_observation.v1");
});

test("LLM work-order draft report stops after two L3-gated runs with no value", async () => {
  let calls = 0;
  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: async ({ packet }) => {
      calls += 1;
      return JSON.stringify(badProviderDraft(packet));
    },
    repairAttempts: 5,
    maxSamples: 1,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(calls, 2);
  assert.equal(result.ok, false);
  assert.equal(result.summary.llm_api_calls, 2);
  assert.equal(result.summary.l3_recheck_triggered_count, 1);
  assert.equal(result.summary.l3_exhausted_no_value_count, 1);
  assert.equal(result.summary.l3_repeated_failure_shape_count, 1);
  assert.equal(result.summary.l1_feedback_suggestion_count, 1);
  assert.equal(result.summary.l1_feedback_candidate_count_upgrade_count, 0);
  assert.equal(result.summary.l1_feedback_handoff_floor_upgrade_count, 0);
  assert.equal(result.results[0].gate.ok, false);
  assert.equal(result.results[0].l3_feedback.final_status, "exhausted_no_value");
  assert.equal(result.results[0].l3_feedback.no_value_after_recheck, true);
  assert.equal(result.results[0].l3_feedback.repeated_failure_shape, true);
  assert.equal(result.results[0].l1_feedback_suggestion.authority, "suggestion_only");
  assert.equal(result.results[0].l1_feedback_suggestion.suggestion.repair_prompt_mode, "task_level_l3_observation");
  assert.equal(result.results[0].l3_feedback.total_draft_runs, 2);
});

test("LLM work-order CLI candidate-recheck switch requests two candidates", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l2-recheck-cli-"));
  try {
    const reportPath = path.join(tempRoot, "online-shadow.json");
    const outDir = path.join(tempRoot, "out");
    await fs.writeFile(reportPath, JSON.stringify(onlineShadowFixture(), null, 2), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/external-trajectory-llm-work-order-draft.mjs",
      "--online-shadow-report",
      reportPath,
      "--source-ids",
      "shadow-public-memory-risk-001",
      "--provider",
      "mock",
      "--candidate-recheck",
      "--max-samples",
      "1",
      "--out-dir",
      outDir
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 5
    });

    assert.match(stdout, /candidate_mode=explicit_candidate_recheck/);
    assert.match(stdout, /requested_candidate_count=2/);

    const json = JSON.parse(await fs.readFile(path.join(outDir, "external-trajectory-llm-work-order-draft.json"), "utf8"));
    assert.equal(json.summary.candidate_mode, "explicit_candidate_recheck");
    assert.equal(json.summary.requested_candidate_count, 2);
    assert.equal(json.results[0].candidates.length, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("Hermes delegate provider passes through a local JSON bridge stub", async () => {
  const stubPath = await writeHermesDelegateStub(passingHermesDelegateStub);
  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: "hermes-delegate",
    hermesDelegateCommand: process.execPath,
    hermesDelegateArgs: [stubPath],
    maxSamples: 1,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider, "hermes-delegate");
  assert.equal(result.summary.sample_count, 1);
  assert.equal(result.summary.passed_gate_count, 1);
  assert.equal(result.summary.llm_api_calls, 1);
  assert.equal(result.summary.memory_writes, 0);
  assert.equal(result.summary.zilliz_writes, 0);
  assert.equal(result.summary.embedding_creations, 0);
  assert.equal(result.summary.route_changes, 0);
  assert.equal(result.summary.winner_changes, 0);
  assert.equal(result.safety.executes_work_orders, false);
  assert.equal(result.safety.writes_memory, false);
  assert.equal(result.safety.writes_zilliz, false);
  assert.equal(result.safety.creates_embeddings, false);
  assert.equal(result.safety.changes_route, false);
  assert.equal(result.safety.changes_winner, false);
  assert.equal(result.results[0].gate.checks.weakTaskCount, 0);
});

test("LLM work-order draft report contains provider failures instead of throwing", async () => {
  const result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: async () => {
      throw new Error("local model timed out");
    },
    repairAttempts: 1,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.sample_count, 1);
  assert.equal(result.summary.draft_count, 0);
  assert.equal(result.summary.passed_gate_count, 0);
  assert.equal(result.summary.failed_gate_count, 1);
  assert.equal(result.summary.provider_error_count, 1);
  assert.equal(result.summary.llm_api_calls, 1);
  assert.equal(result.results[0].provider_error.code, "provider_error");
  assert.ok(result.results[0].gate.violations.includes("provider_call_failed"));
  assert.ok(result.results[0].gate.violations.includes("draft_missing"));
  assert.equal(result.safety.executes_work_orders, false);
  assert.equal(result.safety.writes_memory, false);
});

test("Hermes delegate unavailable and malformed output become failed gates", async () => {
  const missingResult = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: "hermes-delegate",
    hermesDelegateCommand: path.join(os.tmpdir(), "missing-hermes-delegate-command"),
    hermesDelegateArgs: [],
    repairAttempts: 0,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.summary.failed_gate_count, 1);
  assert.equal(missingResult.summary.provider_error_count, 1);
  assert.ok(missingResult.results[0].gate.violations.includes("provider_call_failed"));
  assert.equal(missingResult.safety.executes_work_orders, false);
  assert.equal(missingResult.safety.writes_memory, false);

  const badJsonStub = await writeHermesDelegateStub("process.stdout.write('not json');\n");
  const malformedResult = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: "hermes-delegate",
    hermesDelegateCommand: process.execPath,
    hermesDelegateArgs: [badJsonStub],
    repairAttempts: 0,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(malformedResult.ok, false);
  assert.equal(malformedResult.summary.failed_gate_count, 1);
  assert.equal(malformedResult.summary.provider_error_count, 0);
  assert.ok(malformedResult.results[0].gate.violations.includes("json_parse_failed"));
  assert.ok(malformedResult.results[0].gate.violations.includes("draft_missing"));
  assert.equal(malformedResult.safety.executes_work_orders, false);
  assert.equal(malformedResult.safety.writes_zilliz, false);

  const providerErrorStub = await writeHermesDelegateStub("process.stdout.write('API call failed after 3 retries: HTTP 429 RESOURCE_EXHAUSTED quota exceeded');\n");
  const providerErrorResult = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    onlineShadowReport: onlineShadowFixture(),
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"],
    provider: "hermes-delegate",
    hermesDelegateCommand: process.execPath,
    hermesDelegateArgs: [providerErrorStub],
    repairAttempts: 0,
    now: new Date("2026-05-16T05:00:00Z")
  });

  assert.equal(providerErrorResult.ok, false);
  assert.equal(providerErrorResult.summary.failed_gate_count, 1);
  assert.equal(providerErrorResult.summary.provider_error_count, 1);
  assert.equal(providerErrorResult.results[0].provider_error.code, "hermes_delegate_provider_error");
  assert.ok(providerErrorResult.results[0].gate.violations.includes("provider_call_failed"));
  assert.equal(providerErrorResult.safety.writes_memory, false);
});
