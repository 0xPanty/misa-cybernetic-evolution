import path from "node:path";
import { buildCuriositySignalGateFromDigest } from "./curiosity-signal-gate.mjs";
import { reviewEvolutionTournamentGate } from "./evolution-tournament-gate.mjs";
import { runHermesRuntimeAdapter } from "./hermes-runtime-adapter.mjs";
import { reviewLangGraphQianxuesenBridge } from "./langgraph-qianxuesen-bridge.mjs";
import { upsertDistillationToLocalVectorStore } from "./local-vector-store.mjs";
import { buildPerceptionDigest } from "./perception-sidecar.mjs";
import { reviewSessionDistillerOutput } from "./session-distiller-review.mjs";
import { runSkillEvolutionSupervisor } from "./skill-evolution-supervisor.mjs";
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

function summarizeLocalVectorStore(store) {
  return {
    ok: store.ok,
    backend: store.backend,
    records: store.summary.record_count,
    unique_sources: store.summary.unique_source_count,
    dry_run: store.dry_run,
    local_vector_store_written: store.safety.local_vector_store_written,
    zilliz_written: store.safety.zilliz_written,
    embedding_created: store.safety.embedding_created
  };
}

function summarizeSkillEvolution(supervision) {
  return {
    ok: supervision.ok,
    status: supervision.summary.status,
    evolution_candidates: supervision.summary.evolution_candidate_count,
    replay_required: supervision.summary.replay_required_count,
    human_review_required: supervision.summary.human_review_required,
    llm_api_calls: supervision.safety.llm_api_calls,
    no_write: supervision.safety.no_write,
    production_authority: supervision.safety.production_authority,
    controller_authority: supervision.safety.controller_authority,
    supervisor_changes_skill: supervision.safety.supervisor_changes_skill
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

function summarizeCuriosityGate(curiosityGate) {
  return {
    ok: curiosityGate.ok,
    sources: curiosityGate.summary.evaluated_source_count,
    llm_variant_generation: curiosityGate.summary.llm_variant_generation_count,
    optional_review: curiosityGate.summary.deterministic_review_optional_count,
    missed_review_worthy: curiosityGate.summary.missed_review_worthy_count,
    noise_selected: curiosityGate.summary.noise_selected_count,
    llm_api_calls: curiosityGate.safety.llm_api_calls,
    production_authority: curiosityGate.safety.production_authority
  };
}

function summarizeHermesRuntimeAdapter(adapter) {
  return {
    ok: adapter.ok,
    events: adapter.summary.event_count,
    research_digests: adapter.summary.research_digest_count,
    evolution_candidates: adapter.summary.evolution_candidate_count,
    replay_required: adapter.summary.replay_required_count,
    writes_skills: adapter.safety.writes_skills,
    writes_persistent_memory: adapter.safety.writes_persistent_memory,
    blocks_runtime: adapter.safety.blocks_runtime,
    llm_api_calls: adapter.safety.llm_api_calls,
    external_api_calls: adapter.safety.external_api_calls
  };
}

function noLiveWritesOrProviderCallsCheck({
  routing,
  sessionReview,
  tournament,
  vectorStorage,
  localVectorStore,
  skillEvolution,
  zillizAdapter,
  retrievalRanker,
  curiosityGate,
  hermesRuntimeAdapter
}) {
  const details = {
    durable_or_public_effect_allowed: routing.safety.durable_or_public_effect_allowed,
    session_writes_persistent_memory: sessionReview.safety.writes_persistent_memory,
    session_live_effect_allowed: hasAnyLiveEffect(sessionReview.safety.live_effects),
    tournament_production_authority: tournament.summary.production_authority,
    tournament_live_effect_allowed: hasAnyLiveEffect(tournament.safety.live_effects),
    vector_zilliz_written: vectorStorage.safety.zilliz_written,
    vector_writes_persistent_memory: vectorStorage.safety.writes_persistent_memory,
    local_store_written: localVectorStore.safety.local_vector_store_written,
    local_store_zilliz_written: localVectorStore.safety.zilliz_written,
    local_store_embedding_created: localVectorStore.safety.embedding_created,
    skill_evolution_no_write: skillEvolution.safety.no_write,
    skill_evolution_production_authority: skillEvolution.safety.production_authority,
    skill_evolution_controller_authority: skillEvolution.safety.controller_authority,
    skill_evolution_changes_skill: skillEvolution.safety.supervisor_changes_skill,
    skill_evolution_llm_api_calls: skillEvolution.safety.llm_api_calls,
    adapter_zilliz_written: zillizAdapter.safety.zilliz_written,
    adapter_embedding_created: zillizAdapter.safety.embedding_created,
    retrieval_zilliz_written: retrievalRanker.safety.zilliz_written,
    retrieval_external_api_calls: retrievalRanker.safety.external_api_calls,
    curiosity_writes_persistent_memory: curiosityGate.safety.writes_persistent_memory,
    curiosity_changes_route: curiosityGate.safety.changes_route,
    curiosity_changes_winner: curiosityGate.safety.changes_winner,
    curiosity_llm_api_calls: curiosityGate.safety.llm_api_calls,
    hermes_adapter_writes_persistent_memory: hermesRuntimeAdapter.safety.writes_persistent_memory,
    hermes_adapter_writes_skills: hermesRuntimeAdapter.safety.writes_skills,
    hermes_adapter_blocks_runtime: hermesRuntimeAdapter.safety.blocks_runtime,
    hermes_adapter_llm_api_calls: hermesRuntimeAdapter.safety.llm_api_calls,
    hermes_adapter_external_api_calls: hermesRuntimeAdapter.safety.external_api_calls
  };

  return checkResult("no live writes or provider calls", (
    details.durable_or_public_effect_allowed === false
    && details.session_writes_persistent_memory === false
    && details.session_live_effect_allowed === false
    && details.tournament_production_authority === false
    && details.tournament_live_effect_allowed === false
    && details.vector_zilliz_written === false
    && details.vector_writes_persistent_memory === false
    && details.local_store_written === false
    && details.local_store_zilliz_written === false
    && details.local_store_embedding_created === false
    && details.skill_evolution_no_write === true
    && details.skill_evolution_production_authority === false
    && details.skill_evolution_controller_authority === false
    && details.skill_evolution_changes_skill === false
    && details.skill_evolution_llm_api_calls === 0
    && details.adapter_zilliz_written === false
    && details.adapter_embedding_created === false
    && details.retrieval_zilliz_written === false
    && details.retrieval_external_api_calls === 0
    && details.curiosity_writes_persistent_memory === false
    && details.curiosity_changes_route === false
    && details.curiosity_changes_winner === false
    && details.curiosity_llm_api_calls === 0
    && details.hermes_adapter_writes_persistent_memory === false
    && details.hermes_adapter_writes_skills === false
    && details.hermes_adapter_blocks_runtime === false
    && details.hermes_adapter_llm_api_calls === 0
    && details.hermes_adapter_external_api_calls === 0
  ), details);
}

function buildCurrentLineSmokeChecks({
  routing,
  sessionReview,
  tournament,
  vectorStorage,
  localVectorStore,
  skillEvolution,
  zillizAdapter,
  retrievalRanker,
  curiosityGate,
  hermesRuntimeAdapter
}) {
  return [
    checkResult("work-order:route dry-run", routing.ok, summarizeWorkOrderRouting(routing)),
    checkResult("session-distiller:review dry-run", sessionReview.ok, summarizeSessionReview(sessionReview)),
    checkResult("evolution:tournament:misa dry-run", tournament.ok, summarizeTournament(tournament)),
    checkResult("vector-memory:classify dry-run", vectorStorage.ok, summarizeVectorStorage(vectorStorage)),
    checkResult("vector-store:local dry-run", localVectorStore.ok, summarizeLocalVectorStore(localVectorStore)),
    checkResult("skill:evolution dry-run", skillEvolution.ok, summarizeSkillEvolution(skillEvolution)),
    checkResult("curiosity:signals dry-run", curiosityGate.ok, summarizeCuriosityGate(curiosityGate)),
    checkResult("hermes:adapt-runtime dry-run", hermesRuntimeAdapter.ok, summarizeHermesRuntimeAdapter(hermesRuntimeAdapter)),
    checkResult("zilliz:adapt dry-run", zillizAdapter.ok, summarizeZillizAdapter(zillizAdapter)),
    checkResult("vector-memory:rank dry-run", retrievalRanker.ok, summarizeRetrievalRanker(retrievalRanker)),
    noLiveWritesOrProviderCallsCheck({
      routing,
      sessionReview,
      tournament,
      vectorStorage,
      localVectorStore,
      skillEvolution,
      zillizAdapter,
      retrievalRanker,
      curiosityGate,
      hermesRuntimeAdapter
    })
  ];
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
  const localVectorStore = await upsertDistillationToLocalVectorStore({
    repoRoot,
    sourceDir: path.join("examples", "misa-distillation"),
    requireTemplateCoverage: true,
    dryRun: true,
    now
  });
  const zillizAdapter = buildZillizVectorAdapterPlan({
    vectorMemoryStorage: vectorStorage,
    now
  });
  const skillEvolution = await runSkillEvolutionSupervisor({
    repoRoot,
    now
  });
  const retrievalRanker = evaluateVectorRetrievalScenarios();
  const perceptionDigest = await buildPerceptionDigest({
    repoRoot,
    sourceDir: path.join("test", "fixtures", "perception", "shadow-sources"),
    ledgerFile: path.join("test", "fixtures", "perception", "handled-signal-ledger.json"),
    now
  });
  const curiosityGate = buildCuriositySignalGateFromDigest(perceptionDigest, {
    expectedReviewWorthySourceIds: [
      "shadow-public-memory-risk-001",
      "shadow-candidate-replay-failed-002",
      "shadow-provider-timeout-repeat-003",
      "shadow-repeatable-validation-workflow-a-004",
      "shadow-repeatable-validation-workflow-b-005",
      "shadow-work-order-router-drift-009",
      "shadow-public-memory-risk-discord-010"
    ],
    expectedNoiseSourceIds: [
      "shadow-smalltalk-noise-007",
      "shadow-background-note-noise-008"
    ]
  });
  const hermesRuntimeAdapter = await runHermesRuntimeAdapter({
    repoRoot,
    now
  });

  const checks = buildCurrentLineSmokeChecks({
    routing,
    sessionReview,
    tournament,
    vectorStorage,
    localVectorStore,
    skillEvolution,
    zillizAdapter,
    retrievalRanker,
    curiosityGate,
    hermesRuntimeAdapter
  });

  return {
    mode: "current-line-smoke",
    ok: checks.every((check) => check.ok),
    command_surface: [
      "session-distiller:review",
      "vector-memory:classify",
      "vector-memory:rank",
      "vector-store:local",
      "skill:evolution",
      "curiosity:signals",
      "hermes:adapt-runtime",
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
  localVectorStore,
  skillEvolution,
  zillizAdapter,
  retrievalRanker,
  curiosityGate,
  hermesRuntimeAdapter
}) {
  const checks = buildCurrentLineSmokeChecks({
    routing: workOrderRouting,
    sessionReview,
    tournament,
    vectorStorage,
    localVectorStore,
    skillEvolution,
    zillizAdapter,
    retrievalRanker,
    curiosityGate,
    hermesRuntimeAdapter
  });

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
