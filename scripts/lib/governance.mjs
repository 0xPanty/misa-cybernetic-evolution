import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDefaultMetricRegistry,
  metricIds,
  reviewMeasurableSetpoint
} from "./metric-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACTUATOR_ENUM_PATH = path.join(__dirname, "..", "..", "schemas", "actuator-enum.json");
const ACTUATOR_ENUM_MANIFEST = JSON.parse(fs.readFileSync(ACTUATOR_ENUM_PATH, "utf8"));

export const ACTUATOR_ENUM = Object.freeze([...ACTUATOR_ENUM_MANIFEST.actuators]);
export const HIGH_RISK_ACTUATORS = Object.freeze([...ACTUATOR_ENUM_MANIFEST.high_risk_actuators]);

const ACTUATOR_SET = new Set(ACTUATOR_ENUM);
const HIGH_RISK_ACTUATOR_SET = new Set(HIGH_RISK_ACTUATORS);

const APPROVAL_PATTERN = /approval|approved|approver|explicit approval|manual review|human review/i;

function textOf(value) {
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

export function classifyActuators(actuatorBudget = []) {
  const values = Array.isArray(actuatorBudget) ? actuatorBudget : [actuatorBudget];
  const knownActuators = [];
  const unknownActuators = [];
  const highRiskActuators = [];

  for (const rawValue of values) {
    const actuator = textOf(rawValue).trim();
    if (!ACTUATOR_SET.has(actuator)) {
      unknownActuators.push(actuator);
      continue;
    }
    knownActuators.push(actuator);
    if (HIGH_RISK_ACTUATOR_SET.has(actuator)) {
      highRiskActuators.push({ id: actuator, actuator });
    }
  }

  return {
    knownActuators,
    unknownActuators,
    highRiskActuators
  };
}

export function evaluateControlContract(contract, { metricRegistry = loadDefaultMetricRegistry() } = {}) {
  const actuatorClassification = classifyActuators(contract?.actuator_budget ?? []);
  const { highRiskActuators, unknownActuators } = actuatorClassification;
  const violations = [];
  const warnings = [];
  const fullText = JSON.stringify(contract ?? {});
  const registeredMetricIds = metricIds(metricRegistry);

  if (!contract || typeof contract !== "object") {
    return {
      ok: false,
      highRiskActuators,
      violations: ["contract must be an object"],
      warnings
    };
  }

  const setpointReview = reviewMeasurableSetpoint(contract.primary_setpoint, { registry: metricRegistry });
  violations.push(...setpointReview.violations);

  for (const metricId of contract.guardrail_metrics ?? []) {
    if (!registeredMetricIds.has(metricId)) {
      violations.push(`guardrail metric is not registered: ${metricId}`);
    }
  }

  if (unknownActuators.length > 0) {
    violations.push(`unknown actuator, must come from enum: ${unknownActuators.join(", ")}`);
  }

  if (highRiskActuators.length > 0 && !APPROVAL_PATTERN.test(fullText)) {
    violations.push("high-risk actuators require explicit approval evidence");
  }

  if (highRiskActuators.length > 0 && !textOf(contract.rollback_trigger).trim()) {
    violations.push("high-risk actuators require a rollback trigger");
  }

  if (highRiskActuators.length > 0 && !textOf(contract.recovery_target).trim()) {
    violations.push("high-risk actuators require a recovery target");
  }

  if (!Array.isArray(contract.boundary) || contract.boundary.length === 0) {
    violations.push("contract boundary must name the allowed write surface");
  }

  if (!Array.isArray(contract.acceptance) || contract.acceptance.length === 0) {
    violations.push("contract acceptance must include at least one evidence check");
  }

  if (highRiskActuators.length === 0 && /publish/i.test(fullText) && !APPROVAL_PATTERN.test(fullText)) {
    warnings.push("publication is mentioned; verify that approval and rollback records exist");
  }

  return {
    ok: violations.length === 0,
    setpointReview,
    actuatorClassification,
    highRiskActuators,
    unknownActuators,
    violations,
    warnings
  };
}

export function evaluateDampingRules(ruleset) {
  const violations = [];
  const warnings = [];
  const thresholds = ruleset?.promotion_thresholds ?? {};
  const cooldown = ruleset?.cooldown_policy ?? {};

  if (!ruleset || typeof ruleset !== "object") {
    return {
      ok: false,
      violations: ["damping ruleset must be an object"],
      warnings
    };
  }

  if ((thresholds.skill_candidate_after_successes ?? 0) < 3) {
    violations.push("skill promotion should require at least 3 confirmed successes");
  }

  if ((thresholds.case_candidate_after_failures ?? 0) < 2) {
    violations.push("case promotion should require at least 2 similar failures");
  }

  if (thresholds.policy_requires_approval !== true) {
    violations.push("policy changes must require approval");
  }

  if (thresholds.high_risk_requires_contract !== true) {
    violations.push("high-risk changes must require a control contract");
  }

  if ((cooldown.verifier_failures ?? 0) < 2) {
    warnings.push("cooldown after fewer than 2 verifier failures may be too sensitive");
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings
  };
}

export function evaluateMisaIntegrationProfile(profile) {
  const violations = [];
  const warnings = [];
  const liveEffects = profile?.live_effects ?? {};
  const blockedSurfaces = profile?.blocked_surfaces ?? [];
  const verificationCommands = profile?.verification_commands ?? [];
  const allowedModes = new Set(["reference_only", "read_only_dry_run", "shadow"]);
  const blockedSurfaceSet = new Set(blockedSurfaces);

  if (!profile || typeof profile !== "object") {
    return {
      ok: false,
      violations: ["integration profile must be an object"],
      warnings
    };
  }

  if (!/misa/i.test(profile.target_agent ?? "")) {
    violations.push("target_agent must name Misa for the Misa integration gate");
  }

  if (!allowedModes.has(profile.mode)) {
    violations.push("Misa integration may only be reference_only, read_only_dry_run, or shadow before live runtime approval");
  }

  if (profile.secrets_required !== false) {
    violations.push("Misa dry-run integration must not require secrets");
  }

  const blockedLiveEffects = [
    "calls_model_providers",
    "starts_timers",
    "writes_persistent_memory",
    "changes_session_mechanics",
    "changes_provider_routes",
    "posts_publicly",
    "deletes_data"
  ];

  for (const key of blockedLiveEffects) {
    if (liveEffects[key] !== false) {
      violations.push(`live_effects.${key} must be false for Misa dry-run integration`);
    }
  }

  const requiredBlockedSurfaces = [
    "session_distiller_backlog",
    "session_distiller_timer",
    "discord_session_mechanics",
    "farcaster_session_mechanics",
    "hermes_runtime_transport",
    "persistent_memory_publication"
  ];

  for (const surface of requiredBlockedSurfaces) {
    if (!blockedSurfaceSet.has(surface)) {
      violations.push(`blocked_surfaces must include ${surface}`);
    }
  }

  const requiredCommands = [
    "npm run simulate:misa",
    "npm run validate:schemas",
    "npm run precheck",
    "npm test"
  ];

  for (const command of requiredCommands) {
    if (!verificationCommands.includes(command)) {
      warnings.push(`verification_commands should include ${command}`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings
  };
}
