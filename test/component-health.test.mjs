import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { buildComponentHealthDiagnostics } from "../scripts/lib/component-health.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

const execFileAsync = promisify(execFile);
const FIXED_NOW = new Date("2026-05-22T00:00:00Z");

function healthyChecks() {
  return [
    {
      name: "runtime:thread dry-run",
      ok: true,
      status: "paused",
      next_step: "pause_for_human",
      production_authority: false,
      executes_work_orders: false,
      calls_model_providers: false,
      calls_external_api: false,
      touches_vps: false
    },
    {
      name: "work-order:evaluate dry-run",
      ok: true,
      positive_lift_rate: 1,
      avg_delta: 0.16,
      safety_regressions: 0,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    {
      name: "vector-store:local dry-run",
      ok: true,
      local_vector_store_written: false,
      zilliz_written: false,
      embedding_created: false
    }
  ];
}

test("component health records positive feedback without opening diagnostics for healthy checks", async () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: healthyChecks(),
    now: FIXED_NOW
  });
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/component_health_diagnostics.schema.json",
    data: result,
    name: "component health diagnostics"
  });

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.schema_version, "misa.component_health_diagnostics.v1");
  assert.equal(result.ok, true);
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.summary.component_count, 3);
  assert.equal(result.summary.healthy_count, 3);
  assert.equal(result.summary.diagnostic_work_order_count, 0);
  assert.equal(result.summary.auto_execute, false);
  assert.equal(result.summary.positive_feedback_count > 3, true);
  assert.equal(result.reducer_policy.pure_reducer, true);
  assert.equal(result.reducer_policy.llm_scoring_allowed, false);
  assert.deepEqual(result.reducer_policy.allowed_candidate_routes, ["damping", "policy", "ignore"]);
  assert.equal(result.reducer_policy.human_owner_is_only_consumer, true);
  assert.equal(result.setpoints.escalation_threshold.metric_id, "component_health.escalation_threshold");
  assert.equal(result.setpoints.work_order_inbox_median_ack_latency_ms.metric_id, "work_order_inbox.health_median_ack_latency_ms");
  assert.equal(result.health_reducers.length, 5);
  assert.equal(result.health_reducers.every((reducer) => reducer.pure_reducer && !reducer.llm_scoring_allowed), true);
  assert.equal(result.health_reducers.every((reducer) => reducer.metric_ids.includes(reducer.metric_id)), true);
  assert.equal(result.components.every((component) => component.degradation_evidence.falsifiable), true);
  assert.ok(result.health_reducers.some((reducer) => reducer.reducer_id === "session_distiller_health"));
  assert.ok(result.health_reducers.some((reducer) => reducer.reducer_id === "runtime_thread_health"));
  assert.ok(result.health_reducers.some((reducer) => reducer.reducer_id === "work_order_inbox_health"));
  assert.ok(result.health_reducers.some((reducer) => reducer.reducer_id === "vector_store_health"));
  assert.ok(result.health_reducers.some((reducer) => reducer.reducer_id === "tool_loop_health"));
  assert.equal(result.components.every((component) => component.positive_feedback.length > 0), true);
  assert.equal(result.safety.executes_work_orders, false);
  assert.equal(result.safety.calls_external_api, false);
  assert.equal(result.safety.touches_vps, false);
});

test("tool-loop health reducer detects failed or ungrounded tool events", () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "hermes:adapt-runtime dry-run",
        ok: true,
        tool_event_count: 3,
        tool_intent_count: 1,
        tool_result_count: 2,
        failed_tool_result_count: 1,
        unmatched_tool_intent_count: 0,
        tool_events_with_evidence_refs: 2,
        tool_events_missing_evidence_count: 1,
        tool_loop_failure_count: 2,
        tool_loop_integrity_rate: 1,
        tool_loop_evidence_ref_rate: 1,
        production_authority: false,
        writes_persistent_memory: false,
        calls_external_api: 0,
        touches_vps: false
      }
    ],
    now: FIXED_NOW
  });
  const reducer = result.health_reducers.find((item) => item.reducer_id === "tool_loop_health");
  const component = result.components[0];
  const candidate = result.diagnostic_candidates[0];

  assert.equal(result.ok, false);
  assert.equal(result.status, "DEGRADED");
  assert.equal(reducer.metric_id, "tool_loop.health_integrity_rate");
  assert.deepEqual(reducer.metric_ids, [
    "tool_loop.health_integrity_rate",
    "tool_loop.health_evidence_ref_rate",
    "tool_loop.health_failure_count"
  ]);
  assert.deepEqual(reducer.plant_state_components, [
    "tool_loop.health_integrity_rate",
    "tool_loop.health_evidence_ref_rate",
    "tool_loop.health_failure_count"
  ]);
  assert.equal(reducer.status, "DEGRADED");
  assert.equal(reducer.value, 0.333);
  assert.equal(reducer.inputs.failure_count, 2);
  assert.equal(reducer.inputs.evidence_ref_rate, 0.667);
  assert.equal(component.risks.some((risk) => risk.code === "failed_tool_result_count"), true);
  assert.equal(component.risks.some((risk) => risk.code === "tool_events_missing_evidence_count"), true);
  assert.equal(component.degradation_evidence.falsifiable, true);
  assert.equal(candidate.route, "damping");
  assert.equal(candidate.replay.replay_required, true);
  assert.equal(candidate.replay.llm_generated, false);
  assert.equal(candidate.execution_policy.auto_execute, false);
});

test("component health escalates repeated failures into replayable diagnostic candidates only", async () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "runtime:thread dry-run",
        ok: false,
        production_authority: false,
        executes_work_orders: false,
        calls_external_api: false,
        touches_vps: false
      }
    ],
    history: {
      components: {
        "runtime-thread-dry-run": {
          last_status: "DEGRADED",
          consecutive_failures: 2,
          last_checked_at: "2026-05-21T00:00:00.000Z"
        }
      }
    },
    now: FIXED_NOW
  });
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/component_health_diagnostics.schema.json",
    data: result,
    name: "component health diagnostics with candidate"
  });
  const order = result.diagnostic_work_orders[0];

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.ok, false);
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.summary.critical_count, 1);
  assert.equal(result.summary.diagnostic_work_order_count, 1);
  assert.equal(result.summary.diagnostic_candidate_count, 1);
  assert.equal(order.severity, "P1");
  assert.equal(order.schema_version, "misa.component_health_diagnostic_candidate.v1");
  assert.equal(order.route, "damping");
  assert.deepEqual(order.allowed_routes, ["damping", "policy", "ignore"]);
  assert.equal(order.delivery.receiver_type, "human_owner");
  assert.equal(order.human_escalation.required, true);
  assert.equal(order.human_escalation.queue, "human_escalation");
  assert.equal(order.human_escalation.consumer, "human_owner");
  assert.equal(order.execution_policy.auto_execute, false);
  assert.equal(order.execution_policy.agent_self_review_allowed, false);
  assert.equal(order.replay.replay_required, true);
  assert.equal(order.replay.llm_generated, false);
  assert.equal(order.safety.executes_work_orders, false);
  assert.equal(order.safety.calls_external_api, false);
  assert.equal(order.safety.touches_vps, false);
  assert.equal(result.next_history.components["runtime-thread-dry-run"].consecutive_failures, 3);
});

test("runtime-thread health reducer rejects unregistered next-step actuators", () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "runtime:thread dry-run",
        ok: true,
        status: "unknown",
        next_step: "invent_new_executor",
        production_authority: false,
        executes_work_orders: false,
        calls_external_api: false,
        touches_vps: false
      }
    ],
    now: FIXED_NOW
  });
  const reducer = result.health_reducers.find((item) => item.reducer_id === "runtime_thread_health");

  assert.equal(reducer.status, "DEGRADED");
  assert.equal(reducer.inputs.registered_actuator, null);
  assert.equal(reducer.metric_id, "runtime_thread.health_registered_actuator_rate");
  assert.deepEqual(reducer.plant_state_components, ["runtime_thread.health_registered_actuator_rate"]);
});

test("component health treats control-plane write-deny drift as critical evidence", () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "hermes:adapt-runtime dry-run",
        ok: true,
        control_plane_write_deny_failed: true,
        production_authority: false,
        writes_persistent_memory: false,
        calls_external_api: 0,
        touches_vps: false
      }
    ],
    now: FIXED_NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "CRITICAL");
  assert.equal(result.components[0].risks.some((risk) => risk.code === "control_plane_write_deny_failed"), true);
  assert.equal(result.components[0].degradation_evidence.falsifiable, true);
});

test("work-order inbox health preserves last_sample_ts for future liveness checks", () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "work-order:inbox dry-run",
        ok: true,
        total_messages: 2,
        dead_letters: 0,
        ack_latencies_ms: [1000, 2000],
        last_sample_ts: "2026-05-22T00:00:00.000Z"
      }
    ],
    now: FIXED_NOW
  });
  const reducer = result.health_reducers.find((item) => item.reducer_id === "work_order_inbox_health");

  assert.equal(reducer.status, "HEALTHY");
  assert.equal(reducer.inputs.last_sample_ts, "2026-05-22T00:00:00.000Z");
});

test("component health escalation threshold is a setpoint, not a hard-coded magic number", () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "runtime:thread dry-run",
        ok: false,
        production_authority: false,
        executes_work_orders: false,
        calls_external_api: false,
        touches_vps: false
      }
    ],
    history: {
      components: {
        "runtime-thread-dry-run": {
          last_status: "DEGRADED",
          consecutive_failures: 2
        }
      }
    },
    setpoints: {
      escalation_threshold: {
        metric_id: "component_health.escalation_threshold",
        target_value: 5,
        tolerance: 0,
        direction: "hold_within"
      }
    },
    now: FIXED_NOW
  });

  assert.equal(result.status, "DEGRADED");
  assert.equal(result.summary.critical_count, 0);
  assert.equal(result.components[0].setpoint_refs.escalation_threshold.target_value, 5);
  assert.equal(result.components[0].degradation_evidence.falsifiable, true);
});

test("component health suppresses repeated diagnostics during cooldown", () => {
  const result = buildComponentHealthDiagnostics({
    componentChecks: [
      {
        name: "work-order:evaluate dry-run",
        ok: true,
        positive_lift_rate: 0.4,
        avg_delta: -0.02,
        safety_regressions: 0,
        llm_api_calls: 0,
        external_api_calls: 0
      }
    ],
    history: {
      components: {
        "work-order-evaluate-dry-run": {
          last_status: "DEGRADED",
          consecutive_failures: 1,
          last_diagnostic_at: "2026-05-21T12:00:00.000Z"
        }
      }
    },
    now: FIXED_NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "DEGRADED");
  assert.equal(result.summary.diagnostic_work_order_count, 0);
  assert.equal(result.summary.suppressed_diagnostic_count, 1);
  assert.equal(result.suppressed_diagnostics[0].reason, "cooldown_active");
});

test("component health CLI reads smoke artifacts and writes strict JSON", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-component-health-"));
  const smokeFile = path.join(tempRoot, "smoke.json");
  const outFile = path.join(tempRoot, "component-health.json");
  await fs.writeFile(smokeFile, JSON.stringify({ checks: healthyChecks() }, null, 2), "utf8");

  await execFileAsync(process.execPath, [
    "scripts/component-health.mjs",
    "--now",
    FIXED_NOW.toISOString(),
    "--smoke-file",
    smokeFile,
    "--out-file",
    outFile
  ], {
    cwd: process.cwd()
  });

  const parsed = JSON.parse(await fs.readFile(outFile, "utf8"));
  assert.equal(parsed.mode, "component-health-diagnostics");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "HEALTHY");
  assert.equal(parsed.summary.diagnostic_work_order_count, 0);
});
