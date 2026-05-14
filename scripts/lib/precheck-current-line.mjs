import path from "node:path";
import { upsertDistillationToLocalVectorStore } from "./local-vector-store.mjs";
import { reviewSessionDistillerOutput } from "./session-distiller-review.mjs";
import { runSkillEvolutionSupervisor } from "./skill-evolution-supervisor.mjs";
import { buildVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { evaluateVectorRetrievalScenarios } from "./vector-retrieval-ranker.mjs";
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
      localVectorStore,
      skillEvolution,
      zillizVectorAdapter,
      vectorRetrievalEval
    }
  };
}
