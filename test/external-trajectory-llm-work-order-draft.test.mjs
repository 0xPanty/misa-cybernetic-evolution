import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExternalTrajectoryOnlineShadowContractReport } from "../scripts/lib/external-trajectory-online-shadow-contract.mjs";
import {
  buildExternalTrajectoryLlmWorkOrderDraftReport,
  buildLlmWorkOrderDraftingPackets,
  gateLlmWorkOrderDraft
} from "../scripts/lib/external-trajectory-llm-work-order-draft.mjs";

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

test("LLM work-order packets include context anchors and command whitelist", () => {
  const onlineShadow = onlineShadowFixture();
  const packets = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: onlineShadow,
    perceptionDigestPath: "test-fixture-digest",
    sourceIds: ["shadow-public-memory-risk-001"]
  });

  assert.equal(packets.length, 1);
  assert.equal(packets[0].context.source_class, "public_boundary");
  assert.ok(packets[0].context.context_anchors.includes("public_posting_boundary"));
  assert.ok(packets[0].context.relevant_files.includes("test/curiosity-signal-gate.test.mjs"));
  assert.ok(packets[0].allowed_verification_commands.includes("npm test"));
  assert.ok(packets[0].allowed_verification_commands.some((command) => command.startsWith("npm run external:online-shadow")));
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
  assert.equal(result.results.every((item) => item.gate.quality_score >= 0.74), true);
  assert.ok(result.results[0].draft.verification_commands.every((command) => (
    result.results[0].packet.allowed_verification_commands.includes(command)
  )));
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
