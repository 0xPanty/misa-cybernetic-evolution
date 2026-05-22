import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateControlContract } from "../scripts/lib/governance.mjs";
import {
  loadDefaultPlantModel,
  reviewPlantModel
} from "../scripts/lib/plant-model.mjs";
import {
  loadDefaultMetricRegistry,
  reviewMeasurableSetpoint,
  reviewMetricRegistry
} from "../scripts/lib/metric-registry.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

function baseControlContract(overrides = {}) {
  return {
    contract_id: "cc-control-architecture-test",
    primary_setpoint: {
      metric_id: "skill.replay_pass_rate",
      target_value: 0.85,
      tolerance: 0.02,
      direction: "maximize"
    },
    setpoint_narrative: "Increase replay pass rate without adding production effects.",
    acceptance: ["local schema validation passes"],
    guardrail_metrics: [
      "memory.pollution_rate",
      "runtime.live_effect_count"
    ],
    sampling_plan: "current local test suite",
    recovery_target: "restore previous local draft",
    rollback_trigger: "precheck fails",
    boundary: ["local audit only"],
    actuator_budget: ["audit.write"],
    created_at: "2026-05-20T00:00:00Z",
    ...overrides
  };
}

test("plant model defines the controlled system and maps every actuator", async () => {
  const plantModel = loadDefaultPlantModel();
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/plant_model.schema.json",
    data: plantModel,
    name: "validate plant model"
  });
  const review = reviewPlantModel({ plantModel });

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors));
  assert.equal(review.ok, true);
  assert.equal(review.plant_id, "misa-runtime-learning-plant");
  assert.equal(review.missing_actuators.length, 0);
  assert.equal(review.unknown_actuators.length, 0);
  assert.equal(plantModel.safety_boundary.production_authority, false);
  assert.ok(plantModel.safety_boundary.forbidden_autonomy.includes("no VPS deploy"));
});

test("metric registry maps measurable setpoints onto plant state", async () => {
  const plantModel = loadDefaultPlantModel();
  const registry = loadDefaultMetricRegistry();
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/metric_registry.schema.json",
    data: registry,
    name: "validate metric registry"
  });
  const review = reviewMetricRegistry({ registry, plantModel });
  const metricIds = new Set(registry.metrics.map((metric) => metric.metric_id));

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors));
  assert.equal(review.ok, true);
  assert.equal(review.missing_core_metrics.length, 0);
  assert.equal(review.missing_plant_components.length, 0);
  assert.ok(metricIds.has("signal_extractor.recall"));
  assert.ok(metricIds.has("signal_extractor.precision"));
  assert.ok(metricIds.has("skill.replay_pass_rate"));
});

test("component health metrics are registered as plant-state components", () => {
  const plantModel = loadDefaultPlantModel();
  const registry = loadDefaultMetricRegistry();
  const plantIds = new Set(plantModel.state_variables.map((item) => item.id));
  const metrics = new Map(registry.metrics.map((metric) => [metric.metric_id, metric]));
  const expected = [
    "session_distiller.health_schema_pass_rate",
    "runtime_thread.health_registered_actuator_rate",
    "work_order_inbox.health_dead_letter_rate",
    "work_order_inbox.health_median_ack_latency_ms",
    "vector_store.health_hit_rate",
    "vector_store.health_write_failure_count",
    "component_health.escalation_threshold"
  ];

  for (const metricId of expected) {
    const metric = metrics.get(metricId);
    assert.ok(metric, `${metricId} should be in metric registry`);
    assert.equal(metric.plant_state_component, metricId);
    assert.ok(plantIds.has(metric.plant_state_component), `${metricId} should map to plant model state`);
  }
});

test("control contracts reject free-text or unregistered setpoints", () => {
  const freeText = evaluateControlContract(baseControlContract({
    primary_setpoint: "make the agent better"
  }));
  const unknownMetric = evaluateControlContract(baseControlContract({
    primary_setpoint: {
      metric_id: "floating.metric",
      target_value: 1,
      tolerance: 0,
      direction: "maximize"
    }
  }));
  const directionMismatch = reviewMeasurableSetpoint({
    metric_id: "runtime.live_effect_count",
    target_value: 0,
    tolerance: 0,
    direction: "maximize"
  });

  assert.equal(freeText.ok, false);
  assert.match(freeText.violations.join("\n"), /measurable object/);
  assert.equal(unknownMetric.ok, false);
  assert.match(unknownMetric.violations.join("\n"), /not registered/);
  assert.equal(directionMismatch.ok, false);
  assert.match(directionMismatch.violations.join("\n"), /does not match/);
  assert.equal(evaluateControlContract(baseControlContract()).ok, true);
});
