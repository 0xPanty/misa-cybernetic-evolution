import path from "node:path";
import { reviewSessionDistillerOutput } from "./session-distiller-review.mjs";
import { buildVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { evaluateVectorRetrievalScenarios } from "./vector-retrieval-ranker.mjs";
import { buildZillizVectorAdapterPlan } from "./zilliz-vector-adapter.mjs";
import { validateJsonData } from "./schema-validation.mjs";
import { PHASES, checkResult } from "./precheck-shared.mjs";

export async function runCurrentLinePrecheck({ repoRoot, workOrderRouting, langGraphBridge }) {
  const checks = [];

  const sessionDistillerCyberneticReview = await reviewSessionDistillerOutput({
    summaryFile: path.join(repoRoot, "examples/session-distiller-summary.example.json"),
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(checkResult("Session distiller cybernetic review check", sessionDistillerCyberneticReview.ok, {
    phase: PHASES.currentLine,
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
  checks.push(checkResult("Vector memory storage classification check", vectorMemoryStorage.ok, {
    records: vectorMemoryStorage.summary.record_count,
    candidates: vectorMemoryStorage.summary.candidate_count,
    policies: vectorMemoryStorage.summary.policy_count,
    canInfluenceBehavior: vectorMemoryStorage.summary.can_influence_behavior_count,
    zillizWritten: vectorMemoryStorage.safety.zilliz_written
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/vector_memory_storage.schema.json",
    data: vectorMemoryStorage,
    name: "validate vector memory storage classification"
  }));

  const zillizVectorAdapter = buildZillizVectorAdapterPlan({
    vectorMemoryStorage,
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(checkResult("Zilliz vector adapter dry-run check", zillizVectorAdapter.ok, {
    collections: zillizVectorAdapter.summary.collection_count,
    records: zillizVectorAdapter.summary.record_count,
    batches: zillizVectorAdapter.summary.batch_count,
    metadataViolations: zillizVectorAdapter.summary.metadata_violation_count,
    zillizWritten: zillizVectorAdapter.safety.zilliz_written,
    embeddingCreated: zillizVectorAdapter.safety.embedding_created
  }));
  checks.push(await validateJsonData({
    repoRoot,
    schemaRel: "schemas/zilliz_vector_adapter.schema.json",
    data: zillizVectorAdapter,
    name: "validate Zilliz vector adapter dry-run"
  }));

  const vectorRetrievalEval = evaluateVectorRetrievalScenarios();
  checks.push(checkResult("Vector retrieval ranker multi-source check", vectorRetrievalEval.ok, {
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
      zillizVectorAdapter,
      vectorRetrievalEval
    }
  };
}
