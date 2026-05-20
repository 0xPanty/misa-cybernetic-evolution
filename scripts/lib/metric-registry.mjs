import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultPlantModel, plantStateIds } from "./plant-model.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRIC_REGISTRY_PATH = path.join(__dirname, "..", "..", "examples", "metric_registry.example.json");

export function loadDefaultMetricRegistry() {
  return JSON.parse(fs.readFileSync(METRIC_REGISTRY_PATH, "utf8"));
}

export function metricMap(registry = loadDefaultMetricRegistry()) {
  return new Map((registry.metrics ?? []).map((metric) => [metric.metric_id, metric]));
}

export function metricIds(registry = loadDefaultMetricRegistry()) {
  return new Set(metricMap(registry).keys());
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export function reviewMetricRegistry({
  registry = loadDefaultMetricRegistry(),
  plantModel = loadDefaultPlantModel()
} = {}) {
  const violations = [];
  const warnings = [];
  const metrics = registry.metrics ?? [];
  const ids = metrics.map((metric) => metric.metric_id);
  const duplicates = duplicateValues(ids);
  const stateIds = plantStateIds(plantModel);
  const missingPlantComponents = metrics
    .filter((metric) => !stateIds.has(metric.plant_state_component))
    .map((metric) => `${metric.metric_id}:${metric.plant_state_component}`);
  const requiredCoreMetrics = [
    "skill.replay_pass_rate",
    "memory.pollution_rate",
    "public_channel.safety_incident_count",
    "signal_extractor.recall",
    "signal_extractor.precision",
    "runtime.live_effect_count",
    "controller.precheck_failure_count"
  ];
  const missingCoreMetrics = requiredCoreMetrics.filter((metricId) => !ids.includes(metricId));

  if (registry.schema_version !== "misa.metric_registry.v1") {
    violations.push("metric registry schema_version must be misa.metric_registry.v1");
  }
  if (duplicates.length > 0) {
    violations.push(`duplicate metric ids: ${duplicates.join(", ")}`);
  }
  if (missingPlantComponents.length > 0) {
    violations.push(`metrics reference unknown plant state components: ${missingPlantComponents.join(", ")}`);
  }
  if (missingCoreMetrics.length > 0) {
    violations.push(`metric registry missing core metrics: ${missingCoreMetrics.join(", ")}`);
  }
  if (metrics.length < 5) {
    warnings.push("metric registry should start with at least five core measurable setpoints or guardrails");
  }

  return {
    ok: violations.length === 0,
    registry_id: registry.registry_id,
    metric_count: metrics.length,
    missing_core_metrics: missingCoreMetrics,
    missing_plant_components: missingPlantComponents,
    violations,
    warnings
  };
}

export function reviewMeasurableSetpoint(setpoint, { registry = loadDefaultMetricRegistry() } = {}) {
  const violations = [];
  const metrics = metricMap(registry);

  if (!setpoint || typeof setpoint !== "object" || Array.isArray(setpoint)) {
    return {
      ok: false,
      metric: null,
      violations: ["primary_setpoint must be a measurable object with metric_id, target_value, tolerance, and direction"]
    };
  }

  const metric = metrics.get(setpoint.metric_id);
  if (!metric) {
    violations.push(`primary_setpoint.metric_id is not registered: ${setpoint.metric_id ?? "<missing>"}`);
  }
  if (metric && metric.direction !== setpoint.direction) {
    violations.push(`primary_setpoint.direction ${setpoint.direction} does not match registered metric direction ${metric.direction}`);
  }
  if (!Number.isFinite(setpoint.target_value)) {
    violations.push("primary_setpoint.target_value must be a finite number");
  }
  if (!Number.isFinite(setpoint.tolerance) || setpoint.tolerance < 0) {
    violations.push("primary_setpoint.tolerance must be a non-negative finite number");
  }

  return {
    ok: violations.length === 0,
    metric,
    violations
  };
}
