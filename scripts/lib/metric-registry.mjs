import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultPlantModel, plantStateIds } from "./plant-model.mjs";
import {
  METRIC_GAMING_RISK_ID,
  SAFETY_CRITICAL_METRIC_IDS,
  TOURNAMENT_LEDGER_METRIC_ID
} from "./evolution-tournament-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRIC_REGISTRY_PATH = path.join(__dirname, "..", "..", "examples", "metric_registry.example.json");
const REGISTERED_SOURCE_CONTRACT_ENTRIES = Object.freeze([
  ["skill.replay_pass_rate", {
    input_surface: "local_replay_suite",
    reducer_id: "computeSkillReplayPassRate"
  }],
  ["memory.pollution_rate", {
    input_surface: "memory_candidate_audit",
    reducer_id: "computeMemoryPollutionRate"
  }],
  ["public_channel.safety_incident_count", {
    input_surface: "public_channel_audit",
    reducer_id: "countPublicSafetyIncidents"
  }],
  ["provider.timeout_rate", {
    input_surface: "provider_failure_evidence",
    reducer_id: "computeProviderTimeoutRate"
  }],
  ["learning.route_coverage_count", {
    input_surface: "learning_fixture_set",
    reducer_id: "countLearningRouteCoverage"
  }],
  ["signal_extractor.recall", {
    input_surface: "hand_labeled_signal_fixtures",
    reducer_id: "computeSignalExtractorRecall"
  }],
  ["signal_extractor.precision", {
    input_surface: "hand_labeled_signal_fixtures",
    reducer_id: "computeSignalExtractorPrecision"
  }],
  ["runtime.live_effect_count", {
    input_surface: "dry_run_shadow_report",
    reducer_id: "countRuntimeLiveEffects"
  }],
  ["session_distiller.health_schema_pass_rate", {
    input_surface: "component_health_window",
    reducer_id: "computeSessionDistillerSchemaPassRate"
  }],
  ["runtime_thread.health_registered_actuator_rate", {
    input_surface: "component_health_window",
    reducer_id: "computeRuntimeThreadRegisteredActuatorRate"
  }],
  ["work_order_inbox.health_dead_letter_rate", {
    input_surface: "component_health_window",
    reducer_id: "computeWorkOrderInboxDeadLetterRate"
  }],
  ["work_order_inbox.health_median_ack_latency_ms", {
    input_surface: "component_health_window",
    reducer_id: "computeWorkOrderInboxMedianAckLatencyMs"
  }],
  ["vector_store.health_hit_rate", {
    input_surface: "component_health_window",
    reducer_id: "computeVectorStoreHitRate"
  }],
  ["vector_store.health_write_failure_count", {
    input_surface: "component_health_window",
    reducer_id: "computeVectorStoreWriteFailureCount"
  }],
  ["tool_loop.health_integrity_rate", {
    input_surface: "component_health_window",
    reducer_id: "computeToolLoopIntegrityRate"
  }],
  ["tool_loop.health_evidence_ref_rate", {
    input_surface: "component_health_window",
    reducer_id: "computeToolLoopEvidenceRefRate"
  }],
  ["tool_loop.health_failure_count", {
    input_surface: "component_health_window",
    reducer_id: "computeToolLoopFailureCount"
  }],
  ["component_health.escalation_threshold", {
    input_surface: "metric_registry_setpoint",
    reducer_id: "readComponentHealthEscalationThreshold"
  }],
  [TOURNAMENT_LEDGER_METRIC_ID, {
    input_surface: "evolution_tournament_variant",
    reducer_id: "scoreVariant"
  }],
  [METRIC_GAMING_RISK_ID, {
    input_surface: "evolution_tournament_restraint",
    reducer_id: "buildMetricGamingRisk"
  }],
  ["evolution_tournament.synthesis_metric_regression_tolerance", {
    input_surface: "metric_registry_setpoint",
    reducer_id: "readTournamentRegressionToleranceSetpoint"
  }],
  ...SAFETY_CRITICAL_METRIC_IDS.map((metricId) => [metricId, {
    input_surface: "evolution_tournament_variant",
    reducer_id: "scoreVariant"
  }]),
  ["controller.precheck_failure_count", {
    input_surface: "precheck_report",
    reducer_id: "countPrecheckFailures"
  }]
]);
const REGISTERED_SOURCE_CONTRACTS = new Map(REGISTERED_SOURCE_CONTRACT_ENTRIES);
const KNOWN_REDUCER_IDS = new Set(REGISTERED_SOURCE_CONTRACT_ENTRIES.map(([, contract]) => contract.reducer_id));

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
  const metricById = new Map(metrics.map((metric) => [metric.metric_id, metric]));
  const sourceContractViolations = [];
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
  const missingRegisteredContractMetrics = [...REGISTERED_SOURCE_CONTRACTS.keys()]
    .filter((metricId) => !metricById.has(metricId));
  for (const metricId of missingRegisteredContractMetrics) {
    sourceContractViolations.push(`${metricId}:missing_metric_for_registered_source_contract`);
  }
  for (const metric of metrics) {
    const metricId = metric.metric_id;
    const contract = metric.source_contract;
    const expected = REGISTERED_SOURCE_CONTRACTS.get(metricId);
    if (!expected) {
      sourceContractViolations.push(`${metricId}:missing_registered_source_contract_expectation`);
      continue;
    }
    if (!contract) {
      sourceContractViolations.push(`${metricId}:missing_source_contract`);
      continue;
    }
    if (contract.kind !== "deterministic_reducer") {
      sourceContractViolations.push(`${metricId}:source_contract_kind_must_be_deterministic_reducer`);
    }
    if (contract.input_surface !== expected.input_surface) {
      sourceContractViolations.push(`${metricId}:source_contract_input_surface_mismatch`);
    }
    if (contract.reducer_id !== expected.reducer_id) {
      sourceContractViolations.push(`${metricId}:source_contract_reducer_id_mismatch`);
    }
    if (!KNOWN_REDUCER_IDS.has(contract.reducer_id)) {
      sourceContractViolations.push(`${metricId}:source_contract_reducer_id_not_registered`);
    }
    if (contract.deterministic_only !== true
      || contract.provider_calls_allowed !== false
      || contract.external_api_allowed !== false) {
      sourceContractViolations.push(`${metricId}:source_contract_must_be_local_deterministic_only`);
    }
  }

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
  if (sourceContractViolations.length > 0) {
    violations.push(`metric source_contract invalid: ${sourceContractViolations.join(", ")}`);
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
    source_contract_violations: sourceContractViolations,
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
