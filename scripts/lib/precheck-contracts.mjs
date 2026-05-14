import path from "node:path";
import {
  evaluateControlContract,
  evaluateDampingRules,
  evaluateMisaIntegrationProfile
} from "./governance.mjs";
import { validateSchemas } from "./schema-validation.mjs";
import { checkResult, readJson } from "./precheck-shared.mjs";

export async function runContractPrecheck({ repoRoot }) {
  const checks = [];

  const schemaResult = await validateSchemas({ repoRoot });
  checks.push(...schemaResult.checks.map((check) => ({
    name: check.name,
    ok: check.ok,
    errors: check.errors ?? []
  })));

  const controlContract = await readJson(path.join(repoRoot, "examples/control_contract.example.json"));
  const contractResult = evaluateControlContract(controlContract);
  checks.push(checkResult("control contract dry-run gate", contractResult.ok, {
    highRiskActuators: contractResult.highRiskActuators,
    warnings: contractResult.warnings,
    violations: contractResult.violations
  }));

  const dampingRules = await readJson(path.join(repoRoot, "examples/damping_rules.example.json"));
  const dampingResult = evaluateDampingRules(dampingRules);
  checks.push(checkResult("damping rules dry-run gate", dampingResult.ok, {
    warnings: dampingResult.warnings,
    violations: dampingResult.violations
  }));

  const misaIntegrationProfile = await readJson(path.join(repoRoot, "examples/misa_readonly_integration.example.json"));
  const misaIntegrationResult = evaluateMisaIntegrationProfile(misaIntegrationProfile);
  checks.push(checkResult("Misa launch profile check", misaIntegrationResult.ok, {
    warnings: misaIntegrationResult.warnings,
    violations: misaIntegrationResult.violations
  }));

  return { checks };
}
