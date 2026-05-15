import path from "node:path";
import { upsertDistillationToLocalVectorStore } from "./local-vector-store.mjs";
import { reviewSessionDistillerOutput } from "./session-distiller-review.mjs";
import { runSkillEvolutionSupervisor } from "./skill-evolution-supervisor.mjs";
import { buildVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { evaluateVectorRetrievalScenarios } from "./vector-retrieval-ranker.mjs";
import { runWorkOrderQualityEvaluation } from "./work-order-quality-eval.mjs";
import { buildWorkOrderVariants } from "./work-order-variants.mjs";
import { buildZillizVectorAdapterPlan } from "./zilliz-vector-adapter.mjs";
import { validateJsonData } from "./schema-validation.mjs";
import { PHASES, checkResult } from "./precheck-shared.mjs";

function currentLineCheck(name, ok, details = {}) {
  return checkResult(name, ok, {
    phase: PHASES.currentLine,
    ...details
  });
}

function currentLineValidation(args) {
  return validateJsonData({
    ...args,
    phase: PHASES.currentLine
  });
}

export async function runCurrentLinePrecheck({ repoRoot, workOrderRouting, langGraphBridge }) {
  const checks = [];

  const sessionDistillerCyberneticReview = await reviewSessionDistillerOutput({
    summaryFile: path.join(repoRoot, "examples/session-distiller-summary.example.json"),
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(currentLineCheck("Session distiller cybernetic review check", sessionDistillerCyberneticReview.ok, {
    verdict: sessionDistillerCyberneticReview.summary.verdict,
    findings: sessionDistillerCyberneticReview.summary.finding_count,
    repairWorkOrders: sessionDistillerCyberneticReview.summary.repair_work_order_count,
    zillizInserted: sessionDistillerCyberneticReview.summary.zilliz_inserted_count,
    writesPersistentMemory: sessionDistillerCyberneticReview.safety.writes_persistent_memory,
    liveEffectAllowed: Object.values(sessionDistillerCyberneticReview.safety.live_effects).some(Boolean),
    violations: sessionDistillerCyberneticReview.violations
  }));

  const vectorMemoryStorage = buildVectorMemoryStoragePlan({
    workOrderRouting,
    langGraphBridge,
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(currentLineCheck("Vector memory storage classification check", vectorMemoryStorage.ok, {
    records: vectorMemoryStorage.summary.record_count,
    candidates: vectorMemoryStorage.summary.candidate_count,
    policies: vectorMemoryStorage.summary.policy_count,
    canInfluenceBehavior: vectorMemoryStorage.summary.can_influence_behavior_count,
    zillizWritten: vectorMemoryStorage.safety.zilliz_written
  }));
  checks.push(await currentLineValidation({
    repoRoot,
    schemaRel: "schemas/vector_memory_storage.schema.json",
    data: vectorMemoryStorage,
    name: "validate vector memory storage classification"
  }));

  const workOrderVariants = buildWorkOrderVariants({
    workOrderRouting,
    seed: "precheck-current-line",
    now: new Date("2026-05-15T00:00:00Z")
  });
  checks.push(currentLineCheck("Work-order variant generator dry-run check", workOrderVariants.ok, {
    workOrders: workOrderVariants.summary.work_order_count,
    variants: workOrderVariants.summary.variant_count,
    winners: workOrderVariants.summary.winner_count,
    llmCritiqueRecommended: workOrderVariants.summary.llm_critique_recommended_count,
    llmApiCalls: workOrderVariants.safety.llm_api_calls,
    executesWorkOrders: workOrderVariants.safety.executes_work_orders
  }));
  checks.push(await currentLineValidation({
    repoRoot,
    schemaRel: "schemas/work_order_variants.schema.json",
    data: workOrderVariants,
    name: "validate work-order variants dry-run"
  }));

  const workOrderQualityEval = await runWorkOrderQualityEvaluation({
    repoRoot,
    seeds: ["precheck-quality-01", "precheck-quality-02", "precheck-quality-03"],
    now: new Date("2026-05-15T00:00:00Z")
  });
  checks.push(currentLineCheck("Work-order quality evaluation check", workOrderQualityEval.ok, {
    comparisons: workOrderQualityEval.summary.comparison_count,
    externalIssuePrSamples: workOrderQualityEval.sample_summary.external_issue_pr_sample_count,
    devSamples: workOrderQualityEval.sample_summary.dev_sample_count,
    testSamples: workOrderQualityEval.sample_summary.test_sample_count,
    avgBaselineScore: workOrderQualityEval.summary.avg_baseline_score,
    avgWinnerScore: workOrderQualityEval.summary.avg_winner_score,
    avgDelta: workOrderQualityEval.summary.avg_delta,
    holdoutPassed: workOrderQualityEval.summary.dev_test.holdout_passed,
    positiveLiftRate: workOrderQualityEval.summary.positive_lift_rate,
    safetyRegressions: workOrderQualityEval.summary.safety_regression_count,
    llmApiCalls: workOrderQualityEval.safety.llm_api_calls
  }));
  checks.push(await currentLineValidation({
    repoRoot,
    schemaRel: "schemas/work_order_quality_eval.schema.json",
    data: workOrderQualityEval,
    name: "validate work-order quality evaluation"
  }));

  const localVectorStore = await upsertDistillationToLocalVectorStore({
    repoRoot,
    sourceDir: path.join("examples", "misa-distillation"),
    requireTemplateCoverage: true,
    dryRun: true,
    now: new Date("2026-05-14T00:00:00Z")
  });
  checks.push(currentLineCheck("Local vector store adapter dry-run check", localVectorStore.ok, {
    backend: localVectorStore.backend,
    records: localVectorStore.summary.record_count,
    uniqueSources: localVectorStore.summary.unique_source_count,
    localVectorStoreWritten: localVectorStore.safety.local_vector_store_written,
    zillizWritten: localVectorStore.safety.zilliz_written,
    embeddingCreated: localVectorStore.safety.embedding_created
  }));
  checks.push(await currentLineValidation({
    repoRoot,
    schemaRel: "schemas/local_vector_store.schema.json",
    data: localVectorStore,
    name: "validate local vector store dry-run"
  }));

  const skillEvolution = await runSkillEvolutionSupervisor({
    repoRoot,
    now: new Date("2026-05-14T00:00:00Z")
  });
  checks.push(currentLineCheck("Skill evolution adapter dry-run check", skillEvolution.ok, {
    status: skillEvolution.summary.status,
    candidates: skillEvolution.summary.evolution_candidate_count,
    replayRequired: skillEvolution.summary.replay_required_count,
    routeOwner: skillEvolution.routing.owner,
    noWrite: skillEvolution.safety.no_write,
    productionAuthority: skillEvolution.safety.production_authority,
    controllerAuthority: skillEvolution.safety.controller_authority,
    llmApiCalls: skillEvolution.safety.llm_api_calls
  }));

  const zillizVectorAdapter = buildZillizVectorAdapterPlan({
    vectorMemoryStorage,
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(currentLineCheck("Zilliz vector adapter dry-run check", zillizVectorAdapter.ok, {
    collections: zillizVectorAdapter.summary.collection_count,
    records: zillizVectorAdapter.summary.record_count,
    batches: zillizVectorAdapter.summary.batch_count,
    metadataViolations: zillizVectorAdapter.summary.metadata_violation_count,
    zillizWritten: zillizVectorAdapter.safety.zilliz_written,
    embeddingCreated: zillizVectorAdapter.safety.embedding_created
  }));
  checks.push(await currentLineValidation({
    repoRoot,
    schemaRel: "schemas/zilliz_vector_adapter.schema.json",
    data: zillizVectorAdapter,
    name: "validate Zilliz vector adapter dry-run"
  }));

  const vectorRetrievalEval = evaluateVectorRetrievalScenarios();
  checks.push(currentLineCheck("Vector retrieval ranker multi-source check", vectorRetrievalEval.ok, {
    scenarios: vectorRetrievalEval.summary.scenario_count,
    uniqueSources: vectorRetrievalEval.summary.unique_source_count,
    top1ExactRecall: vectorRetrievalEval.summary.top1_exact_recall,
    top1KindPrecision: vectorRetrievalEval.summary.top1_kind_precision,
    noiseTop1WrongKind: vectorRetrievalEval.summary.noise_top1_wrong_kind_count,
    zillizWritten: vectorRetrievalEval.safety.zilliz_written,
    externalApiCalls: vectorRetrievalEval.safety.external_api_calls
  }));

  return {
    checks,
    artifacts: {
      sessionDistillerCyberneticReview,
      vectorMemoryStorage,
      workOrderVariants,
      workOrderQualityEval,
      localVectorStore,
      skillEvolution,
      zillizVectorAdapter,
      vectorRetrievalEval
    }
  };
}
