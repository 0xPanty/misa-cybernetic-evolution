import fs from "node:fs/promises";
import path from "node:path";

export const PHASES = Object.freeze({
  static: "static",
  contracts: "contracts",
  smoke: "smoke",
  bridges: "bridges",
  currentLine: "current-line"
});

export const CORE_REQUIRED_FILES = [
  "README.md",
  "QUICKSTART.md",
  "ARCHITECTURE.md",
  "CONTROL_CONTRACT.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "package.json",
  "scripts/current-line-smoke.mjs",
  "scripts/public-repo-doctor.mjs",
  "scripts/bootstrap-local.mjs",
  "scripts/precheck.mjs",
  "scripts/validate-schemas.mjs",
  "scripts/simulate-learning.mjs",
  "scripts/evolution-tournament.mjs",
  "scripts/self-repair.mjs",
  "scripts/perception-digest.mjs",
  "scripts/perception-log-layout.mjs",
  "scripts/genericagent-density.mjs",
  "scripts/adaptive-candidates.mjs",
  "scripts/signal-intake.mjs",
  "scripts/distill-misa.mjs",
  "scripts/hermes-distillation-mapper.mjs",
  "scripts/signal-rollup.mjs",
  "scripts/evolution-evaluator.mjs",
  "scripts/memory-layer.mjs",
  "scripts/export-skills.mjs",
  "scripts/repair-ticket.mjs",
  "scripts/skill-evolution-supervisor.mjs",
  "scripts/session-distiller-review.mjs",
  "scripts/work-order-router.mjs",
  "scripts/work-order-variants.mjs",
  "scripts/work-order-quality-eval.mjs",
  "scripts/l2-l3-selection-audit.mjs",
  "scripts/l2-l3-quantitative-comparison.mjs",
  "scripts/vector-memory-storage.mjs",
  "scripts/vector-retrieval-ranker.mjs",
  "scripts/local-vector-store.mjs",
  "scripts/zilliz-vector-adapter.mjs",
  "scripts/langgraph-qianxuesen-bridge.mjs",
  "scripts/omniagent-footprint-bridge.mjs",
  "scripts/lib/precheck-core.mjs",
  "scripts/lib/public-repo-readiness.mjs",
  "scripts/lib/current-line-smoke.mjs",
  "scripts/lib/precheck-shared.mjs",
  "scripts/lib/precheck-static.mjs",
  "scripts/lib/precheck-contracts.mjs",
  "scripts/lib/precheck-smoke.mjs",
  "scripts/lib/precheck-bridges.mjs",
  "scripts/lib/precheck-current-line.mjs",
  "scripts/lib/schema-validation.mjs",
  "scripts/lib/perception-sidecar.mjs",
  "scripts/lib/perception-log-layout.mjs",
  "scripts/lib/learning-loop.mjs",
  "scripts/lib/self-repair.mjs",
  "scripts/lib/genericagent-density.mjs",
  "scripts/lib/adaptive-candidate-gate.mjs",
  "scripts/lib/signal-intake-contract.mjs",
  "scripts/lib/session-distiller.mjs",
  "scripts/lib/hermes-distillation-mapper.mjs",
  "scripts/lib/signal-candidate-rollup.mjs",
  "scripts/lib/evolution-evaluator.mjs",
  "scripts/lib/evolution-tournament-contract.mjs",
  "scripts/lib/evolution-tournament-gate.mjs",
  "scripts/lib/evolution-tournament-judge.mjs",
  "scripts/lib/evolution-tournament-ledger.mjs",
  "scripts/lib/evolution-tournament-quality.mjs",
  "scripts/lib/evolution-tournament-scoring.mjs",
  "scripts/lib/evolution-tournament-utils.mjs",
  "scripts/lib/evolution-tournament-validation.mjs",
  "scripts/lib/memory-layer.mjs",
  "scripts/lib/repair-ticket.mjs",
  "scripts/lib/skill-evolution-supervisor.mjs",
  "scripts/lib/session-distiller-review.mjs",
  "scripts/lib/signal-taxonomy.mjs",
  "scripts/lib/work-order-router.mjs",
  "scripts/lib/work-order-variants.mjs",
  "scripts/lib/work-order-quality-eval.mjs",
  "scripts/lib/l2-l3-selection-audit.mjs",
  "scripts/lib/l2-l3-quantitative-comparison.mjs",
  "scripts/lib/vector-memory-storage.mjs",
  "scripts/lib/vector-retrieval-ranker.mjs",
  "scripts/lib/local-vector-store.mjs",
  "scripts/lib/zilliz-vector-adapter.mjs",
  "scripts/lib/langgraph-qianxuesen-contract.mjs",
  "scripts/lib/langgraph-qianxuesen-bridge.mjs",
  "scripts/lib/omniagent-footprint-bridge.mjs",
  "scripts/lib/vps-conversation-sources.mjs"
];

export const REFERENCE_FILES = [
  "docs/source-synthesis.md",
  "docs/verification-matrix.md",
  "docs/evolution-tournament-gate-v0.18.md",
  "docs/memory-layer-skill-export-v0.13.md",
  "docs/work-order-routing-v0.14.md",
  "docs/work-order-variants-v0.23.md",
  "docs/work-order-quality-eval-v0.24.md",
  "docs/l2-l3-selection-audit-v0.30.md",
  "docs/work-order-external-samples-v0.25.md",
  "docs/skill-evolution-adapter-v0.22.md",
  "docs/skill-control-intake-template.md",
  "docs/vector-memory-storage-v0.19.md",
  "docs/local-vector-store-v0.21.md",
  "docs/zilliz-vector-adapter-v0.19.md",
  "docs/retrieval-lineage-v0.19.md",
  "docs/vector-retrieval-ranker-v0.20.md"
];

export const INVENTORY_FILES = [
  "docs/damping-rules.md",
  "docs/misa-learning-evidence-v0.4.md",
  "docs/misa-learning-loop-v0.2.md",
  "docs/misa-learning-replay-v0.3.md",
  "docs/misa-readonly-integration.md",
  "docs/skill-crystallization-v0.5.md",
  "docs/self-repair-v0.6.md",
  "docs/genericagent-context-density-v0.7.md",
  "docs/evolver-adaptive-gate-v0.8.md",
  "docs/signal-intake-cadence-v0.9.md",
  "docs/signal-candidate-rollup-v0.10.md",
  "docs/evolution-candidate-preflight-v0.11.md",
  "docs/evolution-tournament-gate-v0.17.md",
  "docs/local-session-distillation-v0.12.md",
  "docs/window-distillation-pipeline-v0.13.md",
  "docs/hermes-distillation-mapping-v0.15.md",
  "docs/repair-ticket-v0.13.md",
  "docs/langgraph-qianxuesen-bridge-v0.15.md",
  "docs/omniagent-footprint-bridge-v0.16.md",
  "docs/assets/langgraph-qianxuesen-flow.svg",
  "docs/remotion/langgraph-qianxuesen-flow.tsx",
  "docs/templates/governance-skill-template.md",
  "docs/templates/distillation/README.md",
  "docs/changelog.md",
  "generated/README.md"
];

export const MACHINE_CONTRACT_FILES = [
  "schemas/control_contract.schema.json",
  "schemas/learning_event.schema.json",
  "schemas/learning_item.schema.json",
  "schemas/learning_cycle_trace.schema.json",
  "schemas/skill_crystallization_candidate.schema.json",
  "schemas/self_repair_run.schema.json",
  "schemas/genericagent_context_density.schema.json",
  "schemas/adaptive_candidate_gate.schema.json",
  "schemas/signal_intake_contract.schema.json",
  "schemas/signal_candidate_rollup.schema.json",
  "schemas/evolution_tournament_gate.schema.json",
  "schemas/memory_layer.schema.json",
  "schemas/repair_ticket.schema.json",
  "schemas/work_order_routing.schema.json",
  "schemas/work_order_variants.schema.json",
  "schemas/work_order_quality_eval.schema.json",
  "schemas/external_work_order_sample.schema.json",
  "schemas/skill_evolution_contract.schema.json",
  "schemas/behavior_event.schema.json",
  "schemas/langgraph_qianxuesen_bridge.schema.json",
  "schemas/vector_memory_storage.schema.json",
  "schemas/local_vector_store.schema.json",
  "schemas/zilliz_vector_adapter.schema.json",
  "schemas/perception_digest.schema.json",
  "schemas/perception_log_layout.schema.json",
  "schemas/signal_ledger.schema.json",
  "schemas/local_distillation_source.schema.json",
  "schemas/session_distillation_review.schema.json",
  "schemas/hermes_distillation_mapping.schema.json",
  "schemas/omniagent_footprint_bridge.schema.json",
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
  "examples/genericagent_context_density.example.json",
  "examples/adaptive_candidate_gate.example.json",
  "examples/signal_intake_contract.example.json",
  "examples/signal_candidate_rollup.example.json",
  "examples/evolution_tournament_gate.example.json",
  "examples/memory_layer.example.json",
  "examples/repair_ticket.example.json",
  "examples/work_order_routing.example.json",
  "examples/work-order-quality/external-issue-pr/dev-auth-boundary-regression.sample.json",
  "examples/work-order-quality/external-issue-pr/dev-cache-replay-regression.sample.json",
  "examples/work-order-quality/external-issue-pr/dev-doc-command-scope.sample.json",
  "examples/work-order-quality/external-issue-pr/test-config-conservative-fix.sample.json",
  "examples/work-order-quality/external-issue-pr/test-permission-boundary-regression.sample.json",
  "examples/work-order-quality/external-issue-pr/test-queue-replay-timeout.sample.json",
  "examples/skill-evolution/farcaster_reply_operator.contract.json",
  "examples/behavior-events/farcaster_public_reply.event.json",
  "examples/langgraph_qianxuesen_bridge.example.json",
  "examples/vector_memory_storage.example.json",
  "examples/zilliz_vector_adapter.example.json",
  "examples/perception_digest.example.json",
  "examples/perception_log_layout.example.json",
  "examples/signal_ledger.example.json",
  "examples/session-distiller-summary.example.json",
  "examples/damping_rules.example.json",
  "examples/misa-distillation/local_window_zilliz_boundary.window.json",
  "examples/misa-distillation/failure_log_provider_timeout.failure.json",
  "examples/misa-distillation/farcaster_reply_audit.farcaster.json",
  "examples/hermes-distillation-mapping/normal-summary.input.json",
  "examples/hermes-distillation-mapping/normal-summary.expected.json",
  "examples/hermes-distillation-mapping/farcaster-quality.input.json",
  "examples/hermes-distillation-mapping/farcaster-quality.expected.json",
  "examples/hermes-distillation-mapping/repeated-failure.input.json",
  "examples/hermes-distillation-mapping/repeated-failure.expected.json",
  "examples/hermes-distillation-mapping/missing-evidence.input.json",
  "examples/hermes-distillation-mapping/missing-evidence.expected.json",
  "examples/hermes-distillation-mapping/high-risk.input.json",
  "examples/hermes-distillation-mapping/high-risk.expected.json",
  "examples/omniagent-footprint-bridge/repeated-success.input.json",
  "examples/omniagent-footprint-bridge/auto-write-risk.input.json",
  "examples/omniagent-footprint-bridge/patch-agents-md-risk.input.json",
  "examples/misa-learning/memory_user_style.fixture.json",
  "examples/misa-learning/skill_recovery_workflow.fixture.json",
  "examples/misa-learning/case_provider_timeout.fixture.json",
  "examples/misa-learning/policy_public_posting.fixture.json",
  "examples/misa-learning/damping_single_failure.fixture.json",
  "examples/misa-learning/memory_project_boundary_realish.fixture.json",
  "examples/misa-learning/skill_readonly_audit_realish.fixture.json",
  "examples/misa-learning/skill_real_chat_evolution_eval.fixture.json",
  "examples/misa-learning/case_retrieval_noise_realish.fixture.json",
  "examples/misa-learning/policy_timer_restore_realish.fixture.json",
  "examples/misa-learning/damping_provider_retry_realish.fixture.json"
];

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  /\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|NOVAI|NEYNAR|DISCORD|FARCASTER|AGENTMAIL)_API_KEY\s*=/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/
];

export const SECRET_SCAN_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "runs",
  "coverage",
  ".cache",
  ".turbo"
]);

const SECRET_SCAN_IGNORED_FILES = new Set([
  "package-lock.json"
]);

const SECRET_SCAN_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);

const SECRET_SCAN_TEXT_FILENAMES = new Set([
  ".env",
  ".env.example",
  ".env.local",
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "Makefile",
  "README"
]);

const MAX_SECRET_SCAN_BYTES = 1024 * 1024;

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function missingFiles(repoRoot, relPaths) {
  const missing = [];
  for (const rel of relPaths) {
    if (!await fileExists(path.join(repoRoot, rel))) {
      missing.push(rel);
    }
  }
  return missing;
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function readPackageVersion(repoRoot) {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));
  return packageJson.version ?? null;
}

export async function readReadmeVersion(repoRoot) {
  const raw = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  const match = raw.match(/Current package version:\s*`([^`]+)`/);
  return match?.[1] ?? null;
}

function shouldSkipDir(entryName) {
  return SECRET_SCAN_IGNORED_DIRS.has(entryName);
}

function shouldScanTextFile(filePath, repoRoot) {
  const rel = path.relative(repoRoot, filePath);
  const baseName = path.basename(filePath);
  if (SECRET_SCAN_IGNORED_FILES.has(rel) || SECRET_SCAN_IGNORED_FILES.has(baseName)) {
    return false;
  }
  if (SECRET_SCAN_TEXT_FILENAMES.has(baseName)) {
    return true;
  }
  if (baseName.startsWith(".env.")) {
    return true;
  }
  return SECRET_SCAN_TEXT_EXTENSIONS.has(path.extname(baseName).toLowerCase());
}

export async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) {
        continue;
      }
      files.push(...await walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function scanForSecretAssignments(repoRoot) {
  const files = await walkFiles(repoRoot);
  const hits = [];

  for (const filePath of files) {
    const rel = path.relative(repoRoot, filePath);
    if (!shouldScanTextFile(filePath, repoRoot)) {
      continue;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || stat.size > MAX_SECRET_SCAN_BYTES) {
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

export function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

export function fileSetCheck(name, missing, total, missingPrefix, phase = PHASES.static) {
  return checkResult(name, missing.length === 0, {
    phase,
    checked: total,
    missing,
    violations: missing.map((rel) => `${missingPrefix}: ${rel}`)
  });
}

function assertExplicitPhase(check) {
  const validPhases = Object.values(PHASES);
  if (!validPhases.includes(check.phase)) {
    throw new Error(`precheck check is missing an explicit phase: ${check.name}`);
  }
}

export function normalizeChecks(checks) {
  return checks.map((check) => {
    assertExplicitPhase(check);
    return { ...check };
  });
}

export function phaseSummary(checks) {
  const summary = {};
  for (const check of checks) {
    assertExplicitPhase(check);
    const phase = check.phase;
    summary[phase] ??= { total: 0, passed: 0, failed: 0, warnings: 0 };
    summary[phase].total += 1;
    if (check.ok) {
      summary[phase].passed += 1;
    } else {
      summary[phase].failed += 1;
    }
    if (check.warnings?.length) {
      summary[phase].warnings += check.warnings.length;
    }
  }
  return summary;
}
