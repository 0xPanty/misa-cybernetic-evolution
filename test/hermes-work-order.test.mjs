import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHermesWorkOrderPipeline,
  runHermesWorkOrderPipeline
} from "../scripts/lib/hermes-work-order.mjs";
import { buildHermesRuntimeAdapterReport } from "../scripts/lib/hermes-runtime-adapter.mjs";
import { runHermesValueProof } from "../scripts/hermes-value-proof.mjs";

test("Hermes boundary observations enter work orders only when anomaly rules fire", async () => {
  const result = await runHermesWorkOrderPipeline({
    now: new Date("2026-05-15T00:00:00Z")
  });
  const categories = new Set(result.routing.work_orders.map((order) => order.category));
  const highRisk = result.quality.comparisons.find((item) => item.risk_level === "high");

  assert.equal(result.ok, true);
  assert.equal(result.mode, "hermes-work-order");
  assert.equal(result.adapter.summary.event_count, 4);
  assert.equal(result.adapter.summary.evolution_candidate_count, 4);
  assert.equal(result.adapter.summary.official_evolution_candidate_count, 0);
  assert.equal(result.adapter.summary.boundary_observation_count, 4);
  assert.equal(result.adapter.summary.work_order_stream_count, 1);
  assert.equal(result.adapter.summary.observability_stream_count, 6);
  assert.equal(result.adapter.summary.measurement_quality_gate_count, 1);
  assert.equal(result.adapter.summary.measurement_gate_bias_monitor_count, 1);
  assert.equal(result.routing.summary.work_order_count, 1);
  assert.equal(result.routing.summary.source_boundary_observation_count, 4);
  assert.equal(result.routing.summary.source_work_order_stream_count, 1);
  assert.equal(result.routing.summary.source_observability_stream_count, 6);
  assert.equal(result.routing.summary.agent_self_review_count, 1);
  assert.equal(result.routing.summary.guarded_agent_adoption_ready_count, 0);
  assert.equal(result.variants.summary.work_order_count, 1);
  assert.equal(result.variants.summary.variant_count, 5);
  assert.equal(result.quality.summary.comparison_count, 1);
  assert.equal(result.quality.summary.avg_delta, 0.158);
  assert.equal(result.quality.summary.positive_lift_rate, 1);
  assert.equal(result.quality.summary.safety_regression_count, 0);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(categories.has("hermes_policy_boundary"), true);
  assert.equal(highRisk.selected_strategy, "boundary_tightening");
  assert.equal(result.quality.summary.qianxuesen_fit.medium_risk_replay_or_compact_count, 0);
  assert.equal(result.routing.work_orders[0].traceability.evidence.signal_origin, "runtime_operation_log");
  assert.equal(result.routing.work_orders[0].traceability.evidence.anomaly_rule_ids.includes("memory_write_boundary_pressure"), true);
  assert.equal(result.routing.summary.measurement_quality_evidence.verdict, "insufficient_evidence");
  assert.equal(result.routing.summary.measurement_quality_evidence.diagnosis_class, "sample_insufficient");
  assert.equal(result.routing.summary.measurement_quality_evidence.evidence_role, "critic_evidence_not_judge");
  assert.equal(result.routing.work_orders[0].source_refs.some((ref) => ref.kind === "measurement_quality_gate"), true);
  assert.equal(result.routing.work_orders[0].traceability.evidence.measurement_quality_evidence.evidence_role, "critic_evidence_not_judge");
  assert.equal(result.routing.work_orders[0].traceability.evidence.measurement_quality_evidence.authority.changes_winner, false);
  assert.equal(result.routing.work_orders[0].traceability.evidence.measurement_quality_evidence.matched_rule_ids.includes("measurement_evidence_sparse"), true);
  assert.equal(result.routing.work_orders[0].traceability.evidence.measurement_quality_evidence.issue_kinds.includes("sample_insufficient"), true);
  assert.ok(result.routing.work_orders[0].task_gate.reasons.some((reason) => reason.includes("held-out data")));
});

test("Hermes evolution-grade samples become positive held-out work-order evidence", async () => {
  const result = await runHermesWorkOrderPipeline({
    fixtureFile: "test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json",
    now: new Date("2026-05-16T00:00:00Z")
  });
  const comparisons = result.quality.comparisons;
  const orders = result.routing.work_orders;

  assert.equal(result.ok, true);
  assert.equal(result.adapter.summary.event_count, 3);
  assert.equal(result.adapter.summary.evolution_evidence_count, 3);
  assert.equal(result.adapter.summary.positive_optimization_evidence_count, 3);
  assert.equal(result.routing.summary.work_order_count, 3);
  assert.equal(result.quality.summary.comparison_count, 3);
  assert.equal(result.quality.summary.positive_lift_rate, 1);
  assert.equal(result.quality.summary.safety_regression_count, 0);
  assert.equal(result.quality.summary.evolution_evidence_count, 3);
  assert.equal(result.quality.summary.supported_optimization_evidence_count, 3);
  assert.equal(result.quality.summary.avg_evolution_evidence_delta, 0.177);
  assert.equal(comparisons.every((item) => item.evolution_evidence?.baseline_snapshot_id), true);
  assert.equal(comparisons.every((item) => item.evolution_evidence?.holdout_split_id), true);
  assert.equal(comparisons.every((item) => item.evolution_evidence?.can_support_optimization), true);
  assert.equal(orders.every((order) => (
    order.source_refs.some((ref) => ref.kind === "hermes_evolution_evidence")
  )), true);
  assert.equal(orders.every((order) => (
    order.traceability.acceptance_criteria.some((line) => line.includes("held-out split"))
  )), true);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
});

test("Hermes work orders carry context-quality evidence as evidence, not judge", () => {
  const repeatedSkillCreates = Array.from({ length: 5 }, (_, index) => ({
    event_id: `context-pollution-skill-create-${index + 1}`,
    hook: "post_tool_call",
    timestamp: `2026-05-20T00:0${index}:00Z`,
    tool_name: "skill_manage",
    args: {
      action: "create",
      name: "context-cleanup-skill",
      fingerprint: "context-cleanup"
    },
    result: {
      success: true
    },
    context: {
      terms: ["Hermes", "skill_manage"]
    }
  }));
  const adapterReport = buildHermesRuntimeAdapterReport({
    fixture: {
      source: {
        runtime: "hermes-agent",
        runtime_commit: "context-quality-local-sample",
        source_url: "local-context-quality"
      },
      events: [
        ...repeatedSkillCreates,
        {
          record_kind: "model_io_tap",
          event_id: "model-io-context-pollution-001",
          source_event_ids: ["context-pollution-model-input-001"],
          metrics: {
            message_count: 48,
            context_byte_size: 60000,
            tool_schema_count: 42,
            tool_result_error_count: 3
          }
        }
      ]
    },
    now: new Date("2026-05-20T00:00:00Z")
  });
  const result = buildHermesWorkOrderPipeline({
    adapterReport,
    now: new Date("2026-05-20T00:00:00Z")
  });
  const evidence = result.routing.work_orders[0].traceability.evidence.measurement_quality_evidence;

  assert.equal(result.ok, true);
  assert.equal(adapterReport.summary.work_order_stream_count, 1);
  assert.equal(evidence.verdict, "suspect_input_contamination");
  assert.equal(evidence.diagnosis_class, "context_pollution");
  assert.equal(evidence.failure_kind, "input_contamination");
  assert.equal(evidence.agentic_pattern, "context_engineering");
  assert.equal(evidence.evidence_role, "critic_evidence_not_judge");
  assert.equal(evidence.authority.evaluates_candidate_quality, false);
  assert.equal(evidence.authority.changes_route, false);
  assert.equal(evidence.authority.triggers_replay, false);
  assert.equal(evidence.metrics.max_context_byte_size, 60000);
  assert.equal(evidence.metrics.max_tool_result_error_count, 3);
  assert.equal(evidence.matched_rule_ids.includes("context_byte_size_high"), true);
  assert.equal(evidence.matched_rule_ids.includes("tool_result_error_accumulation"), true);
  assert.equal(evidence.issue_kinds.includes("context_oversized"), true);
  assert.equal(evidence.issue_kinds.includes("tool_schema_overloaded"), true);
  assert.equal(evidence.issue_kinds.includes("tool_result_error"), true);
});

test("Hermes value proof quantifies positive local value and rejects bad evidence", async () => {
  const result = await runHermesValueProof({
    seedCount: 5,
    now: new Date("2026-05-23T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.verdict, "positive_for_current_local_corpus");
  assert.equal(result.combined.positive_lift_rate, 1);
  assert.equal(result.combined.regression_count, 0);
  assert.equal(result.combined.safety_regression_count, 0);
  assert.equal(result.work_order_quality_eval.holdout_passed, true);
  assert.equal(result.hermes_by_source.hermes_evolution_grade.evidence_support_rate, 1);
  assert.equal(result.negative_control.correctly_rejected_bad_evidence, true);
  assert.equal(result.negative_control.supported_optimization_evidence_count, 0);
  assert.equal(Object.values(result.safety_counters).every((value) => value === 0), true);
});

test("empty Hermes captures stay valid without fake work orders", async () => {
  const result = buildHermesWorkOrderPipeline({
    adapterReport: {
      ok: true,
      mode: "hermes-runtime-adapter",
      adapter: {
        runtime: "hermes-agent",
        runtime_commit: "empty"
      },
      summary: {
        event_count: 0,
        evolution_candidate_count: 0
      },
      normalized_events: [],
      research_digests: [],
      evolution_candidates: [],
      safety: {
        llm_api_calls: 0,
        external_api_calls: 0
      }
    },
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.routing.summary.work_order_count, 0);
});
