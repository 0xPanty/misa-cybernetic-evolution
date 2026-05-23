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
  assert.equal(review.source_contract_violations.length, 0);
  assert.ok(metricIds.has("signal_extractor.recall"));
  assert.ok(metricIds.has("signal_extractor.precision"));
  assert.ok(metricIds.has("skill.replay_pass_rate"));
  assert.ok(metricIds.has("evolution_tournament.deterministic_score"));
  assert.ok(metricIds.has("evolution_tournament.metric_gaming_risk"));
  assert.ok(metricIds.has("evolution_tournament.synthesis_metric_regression_tolerance"));
  assert.equal(registry.metrics.every((metric) => (
    metric.source_contract?.kind === "deterministic_reducer"
      && metric.source_contract.input_surface
      && metric.source_contract.reducer_id
      && metric.source_contract.deterministic_only === true
      && metric.source_contract.provider_calls_allowed === false
      && metric.source_contract.external_api_allowed === false
  )), true);
});

test("metric registry rejects missing or unregistered source contracts", () => {
  const registry = loadDefaultMetricRegistry();
  const missingContract = structuredClone(registry);
  delete missingContract.metrics[0].source_contract;
  const unknownReducer = structuredClone(registry);
  unknownReducer.metrics[0].source_contract.reducer_id = "madeUpReducer";

  const missingReview = reviewMetricRegistry({ registry: missingContract });
  const unknownReview = reviewMetricRegistry({ registry: unknownReducer });

  assert.equal(missingReview.ok, false);
  assert.ok(missingReview.source_contract_violations.some((violation) => (
    violation.endsWith(":missing_source_contract")
  )));
  assert.equal(unknownReview.ok, false);
  assert.ok(unknownReview.source_contract_violations.some((violation) => (
    violation.endsWith(":source_contract_reducer_id_mismatch")
      || violation.endsWith(":source_contract_reducer_id_not_registered")
  )));
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
    "tool_loop.health_integrity_rate",
    "tool_loop.health_evidence_ref_rate",
    "tool_loop.health_failure_count",
    "component_health.escalation_threshold"
  ];

  for (const metricId of expected) {
    const metric = metrics.get(metricId);
    assert.ok(metric, `${metricId} should be in metric registry`);
    assert.equal(metric.plant_state_component, metricId);
    assert.ok(plantIds.has(metric.plant_state_component), `${metricId} should map to plant model state`);
  }
});

test("tournament restraint metrics register tolerance and safety-critical subset", () => {
  const plantModel = loadDefaultPlantModel();
  const registry = loadDefaultMetricRegistry();
  const plantIds = new Set(plantModel.state_variables.map((item) => item.id));
  const metrics = new Map(registry.metrics.map((metric) => [metric.metric_id, metric]));
  const tolerance = metrics.get("evolution_tournament.synthesis_metric_regression_tolerance");
  const metricGamingRisk = metrics.get("evolution_tournament.metric_gaming_risk");
  const safetyCritical = [
    "evolution_tournament.safety_score",
    "evolution_tournament.holdout_score",
    "evolution_tournament.regression_score"
  ].map((metricId) => metrics.get(metricId));

  assert.equal(tolerance.direction, "hold_within");
  assert.equal(tolerance.bounds.min, 0);
  assert.equal(tolerance.bounds.max, 1);
  assert.ok(plantIds.has(tolerance.plant_state_component));
  assert.equal(tolerance.source_contract.reducer_id, "readTournamentRegressionToleranceSetpoint");
  assert.equal(tolerance.source_contract.provider_calls_allowed, false);
  assert.equal(tolerance.source_contract.external_api_allowed, false);
  assert.equal(metricGamingRisk.direction, "minimize");
  assert.equal(metricGamingRisk.measurement_kind, "guardrail");
  assert.ok(plantIds.has(metricGamingRisk.plant_state_component));
  assert.deepEqual(metricGamingRisk.source_contract, {
    kind: "deterministic_reducer",
    input_surface: "evolution_tournament_restraint",
    reducer_id: "buildMetricGamingRisk",
    deterministic_only: true,
    provider_calls_allowed: false,
    external_api_allowed: false
  });
  assert.equal(safetyCritical.every((metric) => (
    metric?.safety_critical === true
      && metric.direction === "maximize"
      && plantIds.has(metric.plant_state_component)
      && metric.source_contract.kind === "deterministic_reducer"
      && metric.source_contract.input_surface === "evolution_tournament_variant"
      && metric.source_contract.reducer_id === "scoreVariant"
      && metric.source_contract.deterministic_only === true
      && metric.source_contract.provider_calls_allowed === false
      && metric.source_contract.external_api_allowed === false
  )), true);
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
