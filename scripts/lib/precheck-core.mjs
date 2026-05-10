import fs from "node:fs/promises";
import path from "node:path";
import {
  evaluateControlContract,
  evaluateDampingRules,
  evaluateMisaIntegrationProfile
} from "./governance.mjs";
import { simulateMisaLearning } from "./learning-loop.mjs";
import { validateJsonData, validateSchemas } from "./schema-validation.mjs";
import { crystallizeMisaSkills } from "./skill-crystallization.mjs";

const REQUIRED_FILES = [
  "README.md",
  "ARCHITECTURE.md",
  "CONTROL_CONTRACT.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "docs/damping-rules.md",
  "docs/misa-learning-evidence-v0.4.md",
  "docs/misa-learning-loop-v0.2.md",
  "docs/misa-learning-replay-v0.3.md",
  "docs/misa-readonly-integration.md",
  "docs/source-synthesis.md",
  "docs/skill-crystallization-v0.5.md",
  "docs/self-repair-v0.6.md",
  "docs/templates/governance-skill-template.md",
  "schemas/control_contract.schema.json",
  "schemas/learning_event.schema.json",
  "schemas/learning_item.schema.json",
  "schemas/learning_cycle_trace.schema.json",
  "schemas/skill_crystallization_candidate.schema.json",
  "schemas/self_repair_run.schema.json",
  "schemas/misa_learning_fixture.schema.json",
  "schemas/damping_rules.schema.json",
  "schemas/integration_profile.schema.json",
  "examples/control_contract.example.json",
  "examples/misa_readonly_control_contract.example.json",
  "examples/misa_readonly_integration.example.json",
  "examples/learning_event.example.json",
  "examples/learning_item.example.json",
  "examples/learning_cycle_trace.example.json",
  "examples/misa_skill_crystallization_candidate.example.json",
  "examples/self_repair_run.example.json",
  "examples/misa-learning/memory_user_style.fixture.json",
  "examples/misa-learning/skill_recovery_workflow.fixture.json",
  "examples/misa-learning/case_provider_timeout.fixture.json",
  "examples/misa-learning/policy_public_posting.fixture.json",
  "examples/misa-learning/damping_single_failure.fixture.json",
  "examples/misa-learning/memory_project_boundary_realish.fixture.json",
  "examples/misa-learning/skill_readonly_audit_realish.fixture.json",
  "examples/misa-learning/case_retrieval_noise_realish.fixture.json",
  "examples/misa-learning/policy_timer_restore_realish.fixture.json",
  "examples/misa-learning/damping_provider_retry_realish.fixture.json",
  "examples/damping_rules.example.json",
  "scripts/self-repair.mjs",
  "scripts/lib/self-repair.mjs",
  "generated/README.md"
];

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|NOVAI|NEYNAR|DISCORD|FARCASTER|AGENTMAIL)_API_KEY\s*=/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/
];

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build"]);

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function scanForSecretAssignments(repoRoot) {
  const files = await walkFiles(repoRoot);
  const hits = [];

  for (const filePath of files) {
    const rel = path.relative(repoRoot, filePath);
    if (rel === "package-lock.json") {
      continue;
    }

    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(raw)) {
        hits.push(rel);
        break;
      }
    }
  }

  return hits;
}

function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

export async function runPrecheck({ repoRoot = process.cwd() } = {}) {
  const checks = [];

  for (const rel of REQUIRED_FILES) {
    checks.push(checkResult(`required file ${rel}`, await fileExists(path.join(repoRoot, rel))));
  }

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

  const simulation = await simulateMisaLearning({ repoRoot });
  checks.push(checkResult("Misa learning loop simulation check", simulation.ok, {
    routeCounts: simulation.routeCounts,
    warnings: simulation.warnings,
    violations: simulation.violations
  }));

  for (const trace of simulation.traces) {
    checks.push(await validateJsonData({
      repoRoot,
      schemaRel: "schemas/learning_cycle_trace.schema.json",
      data: trace,
      name: `validate generated trace ${trace.cycle_id}`
    }));
  }

  const crystallization = await crystallizeMisaSkills({ repoRoot });
  checks.push(checkResult("Misa skill crystallization check", crystallization.ok, {
    skillCandidates: crystallization.index.skill_candidates,
    warnings: crystallization.warnings,
    violations: crystallization.violations
  }));

  for (const candidate of crystallization.candidates) {
    checks.push(await validateJsonData({
      repoRoot,
      schemaRel: "schemas/skill_crystallization_candidate.schema.json",
      data: candidate,
      name: `validate skill crystallization candidate ${candidate.candidate_id}`
    }));
  }

  const secretHits = await scanForSecretAssignments(repoRoot);
  checks.push(checkResult("no committed secret assignments", secretHits.length === 0, {
    hits: secretHits
  }));

  return {
    mode: "dry-run",
    ok: checks.every((check) => check.ok),
    checks
  };
}
