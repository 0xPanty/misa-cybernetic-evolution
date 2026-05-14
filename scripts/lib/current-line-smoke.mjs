import path from "node:path";
import { reviewEvolutionTournamentGate } from "./evolution-tournament-gate.mjs";
import { reviewLangGraphQianxuesenBridge } from "./langgraph-qianxuesen-bridge.mjs";
import { reviewSessionDistillerOutput } from "./session-distiller-review.mjs";
import { buildVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { evaluateVectorRetrievalScenarios } from "./vector-retrieval-ranker.mjs";
import { routeWorkOrders } from "./work-order-router.mjs";
import { buildZillizVectorAdapterPlan } from "./zilliz-vector-adapter.mjs";

const DEFAULT_NOW = new Date("2026-05-12T00:00:00Z");
const TOURNAMENT_NOW = new Date("2026-05-13T00:00:00Z");

function hasAnyLiveEffect(liveEffects = {}) {
  return Object.values(liveEffects).some(Boolean);
}

function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok).length
  };
}

function summarizeWorkOrderRouting(workOrderRouting) {
  return {
    ok: workOrderRouting.ok,
    work_orders: workOrderRouting.summary.work_order_count,
    auto_executable: workOrderRouting.summary.auto_executable_count,
    durable_or_public_effect_allowed: workOrderRouting.safety.durable_or_public_effect_allowed,
    routing_mode: workOrderRouting.routing_policy.mode
  };
}

function summarizeTournament(tournament) {
  return {
    ok: tournament.ok,
    tournaments: tournament.summary.tournament_count,
    winners: tournament.summary.winner_count,
    rejected_variants: tournament.summary.rejected_variant_count,
    production_authority: tournament.summary.production_authority,
    llm_api_calls: tournament.summary.llm_api_calls ?? tournament.judge.llm_api_calls
  };
}

function summarizeSessionReview(review) {
  return {
    ok: review.ok,
    verdict: review.summary.verdict,
    findings: review.summary.finding_count,
    repair_work_orders: review.summary.repair_work_order_count,
    writes_persistent_memory: review.safety.writes_persistent_memory,
    live_effect_allowed: hasAnyLiveEffect(review.safety.live_effects)
  };
}

function summarizeVectorStorage(storage) {
  return {
    ok: storage.ok,
    records: storage.summary.record_count,
    candidates: storage.summary.candidate_count,
    policies: storage.summary.policy_count,
    zilliz_written: storage.safety.zilliz_written,
    writes_persistent_memory: storage.safety.writes_persistent_memory
  };
}

function summarizeZillizAdapter(adapter) {
  return {
    ok: adapter.ok,
    collections: adapter.summary.collection_count,
    records: adapter.summary.record_count,
    metadata_violations: adapter.summary.metadata_violation_count,
    zilliz_written: adapter.safety.zilliz_written,
    embedding_created: adapter.safety.embedding_created
  };
}

function summarizeRetrievalRanker(ranker) {
  return {
    ok: ranker.ok,
    scenarios: ranker.summary.scenario_count,
    top1_exact_recall: ranker.summary.top1_exact_recall,
    top1_kind_precision: ranker.summary.top1_kind_precision,
    zilliz_written: ranker.safety.zilliz_written,
    external_api_calls: ranker.safety.external_api_calls
  };
}

export async function runCurrentLineSmoke({
  repoRoot = process.cwd(),
  now = DEFAULT_NOW,
  tournamentNow = TOURNAMENT_NOW,
  workOrderRouting,
  sessionSummaryFile
} = {}) {
  const routing = workOrderRouting ?? await routeWorkOrders({ now });
  const langGraphBridge = await reviewLangGraphQianxuesenBridge({
    repoRoot,
    workOrderRouting: routing,
    now
  });
  const sessionReview = await reviewSessionDistillerOutput({
    summaryFile: sessionSummaryFile ?? path.join(repoRoot, "examples/session-distiller-summary.example.json"),
    now
  });
  const tournament = await reviewEvolutionTournamentGate({
    repoRoot,
    now: tournamentNow
  });
  const vectorStorage = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge,
    now
  });
  const zillizAdapter = buildZillizVectorAdapterPlan({
    vectorMemoryStorage: vectorStorage,
    now
  });
  const retrievalRanker = evaluateVectorRetrievalScenarios();

  const checks = [
    checkResult("work-order:route dry-run", routing.ok, summarizeWorkOrderRouting(routing)),
    checkResult("session-distiller:review dry-run", sessionReview.ok, summarizeSessionReview(sessionReview)),
    checkResult("evolution:tournament:misa dry-run", tournament.ok, summarizeTournament(tournament)),
    checkResult("vector-memory:classify dry-run", vectorStorage.ok, summarizeVectorStorage(vectorStorage)),
    checkResult("zilliz:adapt dry-run", zillizAdapter.ok, summarizeZillizAdapter(zillizAdapter)),
    checkResult("vector-memory:rank dry-run", retrievalRanker.ok, summarizeRetrievalRanker(retrievalRanker)),
    checkResult("no live writes or provider calls", (
      routing.safety.durable_or_public_effect_allowed === false
      && sessionReview.safety.writes_persistent_memory === false
      && hasAnyLiveEffect(sessionReview.safety.live_effects) === false
      && tournament.summary.production_authority === false
      && hasAnyLiveEffect(tournament.safety.live_effects) === false
      && vectorStorage.safety.zilliz_written === false
      && vectorStorage.safety.writes_persistent_memory === false
      && zillizAdapter.safety.zilliz_written === false
      && zillizAdapter.safety.embedding_created === false
      && retrievalRanker.safety.zilliz_written === false
      && retrievalRanker.safety.external_api_calls === 0
    ), {
      live_effects_allowed: false,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0
    })
  ];

  return {
    mode: "current-line-smoke",
    ok: checks.every((check) => check.ok),
    command_surface: [
      "session-distiller:review",
      "vector-memory:classify",
      "vector-memory:rank",
      "zilliz:adapt",
      "work-order:route",
      "evolution:tournament:misa"
    ],
    summary: {
      ...countChecks(checks),
      dry_run: true,
      production_authority: false,
      zilliz_written: false,
      embedding_created: false,
      writes_persistent_memory: false,
      live_effect_allowed: false
    },
    checks
  };
}

export function buildCurrentLineSmokeFromArtifacts({
  workOrderRouting,
  sessionReview,
  tournament,
  vectorStorage,
  zillizAdapter,
  retrievalRanker
}) {
  const checks = [
    checkResult("work-order:route dry-run", workOrderRouting.ok, summarizeWorkOrderRouting(workOrderRouting)),
    checkResult("session-distiller:review dry-run", sessionReview.ok, summarizeSessionReview(sessionReview)),
    checkResult("evolution:tournament:misa dry-run", tournament.ok, summarizeTournament(tournament)),
    checkResult("vector-memory:classify dry-run", vectorStorage.ok, summarizeVectorStorage(vectorStorage)),
    checkResult("zilliz:adapt dry-run", zillizAdapter.ok, summarizeZillizAdapter(zillizAdapter)),
    checkResult("vector-memory:rank dry-run", retrievalRanker.ok, summarizeRetrievalRanker(retrievalRanker))
  ];

  return {
    mode: "current-line-smoke",
    ok: checks.every((check) => check.ok),
    summary: {
      ...countChecks(checks),
      dry_run: true,
      production_authority: false,
      zilliz_written: zillizAdapter.safety.zilliz_written,
      embedding_created: zillizAdapter.safety.embedding_created,
      writes_persistent_memory: sessionReview.safety.writes_persistent_memory,
      live_effect_allowed: hasAnyLiveEffect(sessionReview.safety.live_effects)
    },
    checks
  };
}
