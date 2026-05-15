import path from "node:path";
import {
  evaluateControlContract,
  evaluateDampingRules,
  evaluateMisaIntegrationProfile
} from "./governance.mjs";
import { validateSchemas } from "./schema-validation.mjs";
import { PHASES, checkResult, readJson } from "./precheck-shared.mjs";

const BRIDGE_SCHEMA_RELS = new Set([
  "schemas/agent_runtime_adapter.schema.json",
  "schemas/hermes-distillation-mapping.schema.json",
  "schemas/hermes_distillation_mapping.schema.json",
  "schemas/langgraph_qianxuesen_bridge.schema.json",
  "schemas/omniagent_footprint_bridge.schema.json"
]);

const CURRENT_LINE_SCHEMA_RELS = new Set([
  "schemas/local_vector_store.schema.json",
  "schemas/skill_evolution_contract.schema.json",
  "schemas/behavior_event.schema.json",
  "schemas/vector_memory_storage.schema.json",
  "schemas/zilliz_vector_adapter.schema.json"
]);

const CURRENT_LINE_DATA_RELS = new Set([
  "examples/skill-evolution/farcaster_reply_operator.contract.json",
  "examples/behavior-events/farcaster_public_reply.event.json",
  "examples/vector_memory_storage.example.json",
  "examples/zilliz_vector_adapter.example.json",
  "examples/misa-distillation/local_window_zilliz_boundary.window.json"
]);

function normalizeRel(rel) {
  return String(rel ?? "").replaceAll("\\", "/");
}

function phaseForSchemaCheck(check) {
  const schemaRel = normalizeRel(check.schemaRel);
  const dataRel = normalizeRel(check.dataRel);

  if (BRIDGE_SCHEMA_RELS.has(schemaRel)) {
    return PHASES.bridges;
  }
  if (CURRENT_LINE_SCHEMA_RELS.has(schemaRel) || CURRENT_LINE_DATA_RELS.has(dataRel)) {
    return PHASES.currentLine;
  }
  return PHASES.contracts;
}

export async function runContractPrecheck({ repoRoot }) {
  const checks = [];

  const schemaResult = await validateSchemas({ repoRoot });
  checks.push(...schemaResult.checks.map((check) => ({
    ...check,
    phase: phaseForSchemaCheck(check)
  })));

  const controlContract = await readJson(path.join(repoRoot, "examples/control_contract.example.json"));
  const contractResult = evaluateControlContract(controlContract);
  checks.push(checkResult("control contract dry-run gate", contractResult.ok, {
    phase: PHASES.contracts,
    highRiskActuators: contractResult.highRiskActuators,
    warnings: contractResult.warnings,
    violations: contractResult.violations
  }));

  const dampingRules = await readJson(path.join(repoRoot, "examples/damping_rules.example.json"));
  const dampingResult = evaluateDampingRules(dampingRules);
  checks.push(checkResult("damping rules dry-run gate", dampingResult.ok, {
    phase: PHASES.contracts,
    warnings: dampingResult.warnings,
    violations: dampingResult.violations
  }));

  const misaIntegrationProfile = await readJson(path.join(repoRoot, "examples/misa_readonly_integration.example.json"));
  const misaIntegrationResult = evaluateMisaIntegrationProfile(misaIntegrationProfile);
  checks.push(checkResult("Misa launch profile check", misaIntegrationResult.ok, {
    phase: PHASES.contracts,
    warnings: misaIntegrationResult.warnings,
    violations: misaIntegrationResult.violations
  }));

  return { checks };
}
