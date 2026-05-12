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
import { reviewGenericAgentContextDensity } from "./genericagent-density.mjs";
import { reviewAdaptiveCandidateGate } from "./adaptive-candidate-gate.mjs";
import { reviewSignalIntakeContract } from "./signal-intake-contract.mjs";
import { reviewSignalCandidateRollup } from "./signal-candidate-rollup.mjs";
import { evaluateMisaEvolution } from "./evolution-evaluator.mjs";
import { distillLocalMisaSources } from "./session-distiller.mjs";
import { reviewMemoryLayerComparison } from "./memory-layer.mjs";
import { reviewRepairTickets } from "./repair-ticket.mjs";

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
  "docs/genericagent-context-density-v0.7.md",
  "docs/evolver-adaptive-gate-v0.8.md",
  "docs/signal-intake-cadence-v0.9.md",
  "docs/signal-candidate-rollup-v0.10.md",
  "docs/evolution-candidate-preflight-v0.11.md",
  "docs/local-session-distillation-v0.12.md",
  "docs/window-distillation-pipeline-v0.13.md",
  "docs/memory-layer-skill-export-v0.13.md",
  "docs/repair-ticket-v0.13.md",
  "docs/templates/governance-skill-template.md",
  "docs/templates/distillation/README.md",
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
  "schemas/memory_layer.schema.json",
  "schemas/repair_ticket.schema.json",
  "schemas/local_distillation_source.schema.json",
  "schemas/session_distillation_review.schema.json",
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
  "examples/memory_layer.example.json",
  "examples/repair_ticket.example.json",
  "examples/misa-distillation/local_window_zilliz_boundary.window.json",
  "examples/misa-distillation/failure_log_provider_timeout.failure.json",
  "examples/misa-distillation/farcaster_reply_audit.farcaster.json",
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
  "examples/misa-learning/damping_provider_retry_realish.fixture.json",
  "examples/damping_rules.example.json",
  "scripts/self-repair.mjs",
  "scripts/genericagent-density.mjs",
  "scripts/adaptive-candidates.mjs",
  "scripts/signal-intake.mjs",
  "scripts/distill-misa.mjs",
  "scripts/signal-rollup.mjs",
  "scripts/evolution-evaluator.mjs",
  "scripts/memory-layer.mjs",
  "scripts/export-skills.mjs",
  "scripts/repair-ticket.mjs",
  "scripts/lib/self-repair.mjs",
  "scripts/lib/genericagent-density.mjs",
  "scripts/lib/adaptive-candidate-gate.mjs",
  "scripts/lib/signal-intake-contract.mjs",
  "scripts/lib/session-distiller.mjs",
  "scripts/lib/signal-candidate-rollup.mjs",
  "scripts/lib/evolution-evaluator.mjs",
  "scripts/lib/memory-layer.mjs",
  "scripts/lib/repair-ticket.mjs",
  "scripts/lib/vps-conversation-sources.mjs",
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

  const distillation = await distillLocalMisaSources({ repoRoot });
  checks.push(checkResult("Misa local session distillation check", distillation.ok, {
    sources: distillation.summary.source_count,
    learningEvents: distillation.summary.learning_event_count,
    zillizProxyUsed: distillation.summary.zilliz_proxy_used,
    localVectorIndexUsed: distillation.summary.local_vector_index_used,
    segmentCount: distillation.summary.segment_count,
    llmApiCalls: distillation.summary.llm_api_calls,
    externalApiCalls: distillation.summary.external_api_calls,
    violations: distillation.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/session_distillation_review.schema.json",
    data: distillation,
    name: "validate local session distillation review"
  }));

  for (const event of distillation.learning_events) {
    checks.push(await validateJsonData({
      repoRoot,
      schemaRel: "schemas/misa_learning_fixture.schema.json",
      data: event,
      name: `validate distilled learning event ${event.event_id}`
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

  const densityReview = await reviewGenericAgentContextDensity({ repoRoot });
  checks.push(checkResult("GenericAgent context-density review check", densityReview.ok, {
    overallScore: densityReview.summary.overall_score,
    adoptedCount: densityReview.summary.adopted_count,
    rejectedCount: densityReview.summary.rejected_count,
    violations: densityReview.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/genericagent_context_density.schema.json",
    data: densityReview,
    name: "validate GenericAgent context-density review"
  }));

  const adaptiveGate = await reviewAdaptiveCandidateGate({ repoRoot });
  checks.push(checkResult("Misa adaptive candidate gate check", adaptiveGate.ok, {
    generatedCandidates: adaptiveGate.summary.generated_candidate_count,
    validationReady: adaptiveGate.summary.validation_ready_count,
    held: adaptiveGate.summary.held_count,
    rejected: adaptiveGate.summary.rejected_count,
    violations: adaptiveGate.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/adaptive_candidate_gate.schema.json",
    data: adaptiveGate,
    name: "validate adaptive candidate gate review"
  }));

  const signalIntake = reviewSignalIntakeContract();
  checks.push(checkResult("Misa signal intake cadence check", signalIntake.ok, {
    signalScanMinutes: signalIntake.cadence.signal_scan_interval_minutes,
    learningRollupHours: signalIntake.cadence.learning_rollup_interval_hours,
    farcasterDefense: signalIntake.cadence.farcaster_defense_mode,
    violations: signalIntake.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/signal_intake_contract.schema.json",
    data: signalIntake,
    name: "validate signal intake contract review"
  }));

  const signalRollup = await reviewSignalCandidateRollup({ repoRoot });
  checks.push(checkResult("Misa signal candidate rollup check", signalRollup.ok, {
    adaptedSignals: signalRollup.summary.adapted_signal_count,
    queueItems: signalRollup.summary.queue_item_count,
    dailyRollupHours: signalRollup.summary.daily_rollup_window_hours,
    validationReady: signalRollup.summary.validation_ready_count,
    violations: signalRollup.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/signal_candidate_rollup.schema.json",
    data: signalRollup,
    name: "validate signal candidate rollup review"
  }));

  const evolutionEvaluator = await evaluateMisaEvolution({ repoRoot });
  checks.push(checkResult("Misa evolution evaluator simulation check", evolutionEvaluator.ok, {
    mode: evolutionEvaluator.mode,
    optimizationCandidates: evolutionEvaluator.summary.optimization_candidate_count,
    preflightPassed: evolutionEvaluator.summary.preflight_passed_count,
    hygieneReportable: evolutionEvaluator.summary.hygiene_reportable_count,
    reportQueue: evolutionEvaluator.summary.report_queue_count,
    held: evolutionEvaluator.summary.held_count,
    suppressed: evolutionEvaluator.summary.suppressed_count,
    realChatPreflightStatus: evolutionEvaluator.summary.real_chat_preflight_status,
    violations: evolutionEvaluator.violations
  }));

  const memoryLayer = await reviewMemoryLayerComparison({ repoRoot });
  checks.push(checkResult("Misa memory layer comparison check", memoryLayer.ok, {
    rawTokens: memoryLayer.layers.l0_sources.raw_token_estimate,
    distillateTokens: memoryLayer.layers.l1_distillates.distillate_token_estimate,
    compressionRatio: memoryLayer.layers.l1_distillates.compression_ratio,
    originalL3: memoryLayer.original_auto_l3.skill_count,
    originalBadPromotions: memoryLayer.original_auto_l3.non_skill_promoted_count,
    minimalL3: memoryLayer.minimal_positive_l3.skill_count,
    minimalBadPromotions: memoryLayer.minimal_positive_l3.non_skill_promoted_count,
    verdict: memoryLayer.comparison.verdict,
    violations: memoryLayer.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/memory_layer.schema.json",
    data: memoryLayer,
    name: "validate memory layer comparison review"
  }));

  const repairTickets = await reviewRepairTickets({ repoRoot, memoryLayerReview: memoryLayer });
  checks.push(checkResult("Misa repair ticket queue check", repairTickets.ok, {
    ticketCount: repairTickets.summary.ticket_count,
    highestSeverity: repairTickets.summary.highest_severity,
    badPromotions: repairTickets.summary.bad_promotion_count,
    minimalBadPromotions: repairTickets.summary.minimal_non_skill_promoted_count,
    violations: repairTickets.violations
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/repair_ticket.schema.json",
    data: repairTickets,
    name: "validate repair ticket review"
  }));

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
