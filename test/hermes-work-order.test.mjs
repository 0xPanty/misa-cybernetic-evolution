import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHermesWorkOrderPipeline,
  runHermesWorkOrderPipeline
} from "../scripts/lib/hermes-work-order.mjs";

test("Hermes self-evolution signals enter the Qianxuesen work-order pipeline", async () => {
  const result = await runHermesWorkOrderPipeline({
    now: new Date("2026-05-15T00:00:00Z")
  });
  const categories = new Set(result.routing.work_orders.map((order) => order.category));
  const highRisk = result.quality.comparisons.find((item) => item.risk_level === "high");

  assert.equal(result.ok, true);
  assert.equal(result.mode, "hermes-work-order");
  assert.equal(result.adapter.summary.event_count, 4);
  assert.equal(result.adapter.summary.evolution_candidate_count, 4);
  assert.equal(result.routing.summary.work_order_count, 4);
  assert.equal(result.routing.summary.agent_self_review_count, 4);
  assert.equal(result.routing.summary.guarded_agent_adoption_ready_count, 3);
  assert.equal(result.variants.summary.work_order_count, 4);
  assert.equal(result.variants.summary.variant_count, 20);
  assert.equal(result.quality.summary.comparison_count, 4);
  assert.equal(result.quality.summary.avg_delta, 0.158);
  assert.equal(result.quality.summary.positive_lift_rate, 1);
  assert.equal(result.quality.summary.safety_regression_count, 0);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(categories.has("hermes_skill_evolution"), true);
  assert.equal(categories.has("hermes_policy_boundary"), true);
  assert.equal(categories.has("hermes_research_followup"), true);
  assert.equal(highRisk.selected_strategy, "boundary_tightening");
  assert.equal(result.quality.summary.qianxuesen_fit.medium_risk_replay_or_compact_count, 3);
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
