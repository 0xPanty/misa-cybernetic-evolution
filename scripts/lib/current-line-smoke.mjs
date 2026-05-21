import path from "node:path";
import { buildCuriositySignalGateFromDigest } from "./curiosity-signal-gate.mjs";
import { reviewEvolutionTournamentGate } from "./evolution-tournament-gate.mjs";
import { runHermesRuntimeAdapter } from "./hermes-runtime-adapter.mjs";
import { runHermesWorkOrderPipeline } from "./hermes-work-order.mjs";
import { runHermesRuntimePluginDoctor } from "./hermes-runtime-plugin.mjs";
import { reviewLangGraphQianxuesenBridge } from "./langgraph-qianxuesen-bridge.mjs";
import { upsertDistillationToLocalVectorStore } from "./local-vector-store.mjs";
import { buildPerceptionDigest } from "./perception-sidecar.mjs";
import { reviewSessionDistillerOutput } from "./session-distiller-review.mjs";
import { buildDefaultRuntimeThreadReview } from "./runtime-thread.mjs";
import { runSkillEvolutionSupervisor } from "./skill-evolution-supervisor.mjs";
import { buildVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { evaluateVectorRetrievalScenarios } from "./vector-retrieval-ranker.mjs";
import { runWorkOrderQualityEvaluation } from "./work-order-quality-eval.mjs";
import { buildWorkOrderVariants } from "./work-order-variants.mjs";
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

function summarizeWorkOrderVariants(variants) {
  return {
    ok: variants.ok,
    work_orders: variants.summary.work_order_count,
    variants: variants.summary.variant_count,
    winners: variants.summary.winner_count,
    llm_critique_recommended: variants.summary.llm_critique_recommended_count,
    executes_work_orders: variants.safety.executes_work_orders,
    writes_persistent_memory: variants.safety.writes_persistent_memory,
    installs_skills: variants.safety.installs_skills,
    llm_api_calls: variants.safety.llm_api_calls,
    external_api_calls: variants.safety.external_api_calls
  };
}

function summarizeWorkOrderQualityEval(evaluation) {
  return {
    ok: evaluation.ok,
    work_orders: evaluation.summary.work_order_count,
    comparisons: evaluation.summary.comparison_count,
    avg_baseline_score: evaluation.summary.avg_baseline_score,
    avg_winner_score: evaluation.summary.avg_winner_score,
    avg_delta: evaluation.summary.avg_delta,
    positive_lift_rate: evaluation.summary.positive_lift_rate,
    safety_regressions: evaluation.summary.safety_regression_count,
    llm_api_calls: evaluation.safety.llm_api_calls,
    external_api_calls: evaluation.safety.external_api_calls
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

function summarizeHermesRuntimePluginDoctor(doctor) {
  return {
    ok: doctor.ok,
    checks: doctor.summary,
    writes_plugin_files: doctor.safety.writes_plugin_files,
    writes_skills: doctor.safety.writes_skills,
    writes_persistent_memory: doctor.safety.writes_persistent_memory,
    blocks_runtime: doctor.safety.blocks_runtime,
    llm_api_calls: doctor.safety.llm_api_calls,
    external_api_calls: doctor.safety.external_api_calls
  };
}

function summarizeHermesWorkOrderPipeline(pipeline) {
  return {
    ok: pipeline.ok,
    work_orders: pipeline.routing.summary.work_order_count,
    variants: pipeline.variants.summary.variant_count,
    comparisons: pipeline.quality.summary.comparison_count,
    avg_delta: pipeline.quality.summary.avg_delta,
    positive_lift_rate: pipeline.quality.summary.positive_lift_rate,
    safety_regressions: pipeline.quality.summary.safety_regression_count,
    llm_api_calls: pipeline.safety.llm_api_calls,
    external_api_calls: pipeline.safety.external_api_calls
  };
}

function summarizeRuntimeThread(review) {
  return {
    ok: review.ok,
    status: review.summary.status,
    events: review.summary.event_count,
    next_step: review.summary.next_step_type,
    pending_human_escalations: review.summary.pending_human_escalation_count,
    production_authority: review.safety.production_authority,
    executes_work_orders: review.safety.executes_work_orders,
    calls_model_providers: review.safety.calls_model_providers,
    calls_external_api: review.safety.calls_external_api,
    touches_vps: review.safety.touches_vps
  };
}

function noLiveWritesOrProviderCallsCheck({
  routing,
  sessionReview,
  tournament,
  vectorStorage,
  workOrderVariants,
  workOrderQualityEval,
  localVectorStore,
  skillEvolution,
  zillizAdapter,
  retrievalRanker,
  curiosityGate,
  hermesRuntimeAdapter,
  hermesWorkOrderPipeline,
  hermesRuntimePluginDoctor,
  runtimeThreadReview
}) {
  const details = {
    durable_or_public_effect_allowed: routing.safety.durable_or_public_effect_allowed,
    session_writes_persistent_memory: sessionReview.safety.writes_persistent_memory,
    session_live_effect_allowed: hasAnyLiveEffect(sessionReview.safety.live_effects),
    tournament_production_authority: tournament.summary.production_authority,
    tournament_live_effect_allowed: hasAnyLiveEffect(tournament.safety.live_effects),
    vector_zilliz_written: vectorStorage.safety.zilliz_written,
    vector_writes_persistent_memory: vectorStorage.safety.writes_persistent_memory,
    work_order_variants_executes_work_orders: workOrderVariants.safety.executes_work_orders,
    work_order_variants_writes_persistent_memory: workOrderVariants.safety.writes_persistent_memory,
    work_order_variants_installs_skills: workOrderVariants.safety.installs_skills,
    work_order_variants_llm_api_calls: workOrderVariants.safety.llm_api_calls,
    work_order_variants_external_api_calls: workOrderVariants.safety.external_api_calls,
    work_order_quality_executes_work_orders: workOrderQualityEval.safety.executes_work_orders,
    work_order_quality_writes_persistent_memory: workOrderQualityEval.safety.writes_persistent_memory,
    work_order_quality_installs_skills: workOrderQualityEval.safety.installs_skills,
    work_order_quality_llm_api_calls: workOrderQualityEval.safety.llm_api_calls,
    work_order_quality_external_api_calls: workOrderQualityEval.safety.external_api_calls,
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
    hermes_adapter_external_api_calls: hermesRuntimeAdapter.safety.external_api_calls,
    hermes_work_order_executes_work_orders: hermesWorkOrderPipeline.safety.executes_work_orders,
    hermes_work_order_writes_persistent_memory: hermesWorkOrderPipeline.safety.writes_persistent_memory,
    hermes_work_order_writes_skills: hermesWorkOrderPipeline.safety.writes_skills,
    hermes_work_order_llm_api_calls: hermesWorkOrderPipeline.safety.llm_api_calls,
    hermes_work_order_external_api_calls: hermesWorkOrderPipeline.safety.external_api_calls,
    hermes_plugin_writes_plugin_files: hermesRuntimePluginDoctor.safety.writes_plugin_files,
    hermes_plugin_writes_persistent_memory: hermesRuntimePluginDoctor.safety.writes_persistent_memory,
    hermes_plugin_writes_skills: hermesRuntimePluginDoctor.safety.writes_skills,
    hermes_plugin_blocks_runtime: hermesRuntimePluginDoctor.safety.blocks_runtime,
    hermes_plugin_llm_api_calls: hermesRuntimePluginDoctor.safety.llm_api_calls,
    hermes_plugin_external_api_calls: hermesRuntimePluginDoctor.safety.external_api_calls,
    runtime_thread_production_authority: runtimeThreadReview.safety.production_authority,
    runtime_thread_executes_work_orders: runtimeThreadReview.safety.executes_work_orders,
    runtime_thread_writes_persistent_memory: runtimeThreadReview.safety.writes_persistent_memory,
    runtime_thread_calls_model_providers: runtimeThreadReview.safety.calls_model_providers,
    runtime_thread_calls_external_api: runtimeThreadReview.safety.calls_external_api,
    runtime_thread_touches_vps: runtimeThreadReview.safety.touches_vps,
    runtime_thread_starts_services: runtimeThreadReview.safety.starts_services
  };

  return checkResult("no live writes or provider calls", (
    details.durable_or_public_effect_allowed === false
    && details.session_writes_persistent_memory === false
    && details.session_live_effect_allowed === false
    && details.tournament_production_authority === false
    && details.tournament_live_effect_allowed === false
    && details.vector_zilliz_written === false
    && details.vector_writes_persistent_memory === false
    && details.work_order_variants_executes_work_orders === false
    && details.work_order_variants_writes_persistent_memory === false
    && details.work_order_variants_installs_skills === false
    && details.work_order_variants_llm_api_calls === 0
    && details.work_order_variants_external_api_calls === 0
    && details.work_order_quality_executes_work_orders === false
    && details.work_order_quality_writes_persistent_memory === false
    && details.work_order_quality_installs_skills === false
    && details.work_order_quality_llm_api_calls === 0
    && details.work_order_quality_external_api_calls === 0
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
    && details.hermes_work_order_executes_work_orders === false
    && details.hermes_work_order_writes_persistent_memory === false
    && details.hermes_work_order_writes_skills === false
    && details.hermes_work_order_llm_api_calls === 0
    && details.hermes_work_order_external_api_calls === 0
    && details.hermes_plugin_writes_plugin_files === false
    && details.hermes_plugin_writes_persistent_memory === false
    && details.hermes_plugin_writes_skills === false
    && details.hermes_plugin_blocks_runtime === false
    && details.hermes_plugin_llm_api_calls === 0
    && details.hermes_plugin_external_api_calls === 0
    && details.runtime_thread_production_authority === false
    && details.runtime_thread_executes_work_orders === false
    && details.runtime_thread_writes_persistent_memory === false
    && details.runtime_thread_calls_model_providers === false
    && details.runtime_thread_calls_external_api === false
    && details.runtime_thread_touches_vps === false
    && details.runtime_thread_starts_services === false
  ), details);
}

function buildCurrentLineSmokeChecks({
  routing,
  sessionReview,
  tournament,
  vectorStorage,
  workOrderVariants,
  workOrderQualityEval,
  localVectorStore,
  skillEvolution,
  zillizAdapter,
  retrievalRanker,
  curiosityGate,
  hermesRuntimeAdapter,
  hermesWorkOrderPipeline,
  hermesRuntimePluginDoctor,
  runtimeThreadReview
}) {
  return [
    checkResult("work-order:route dry-run", routing.ok, summarizeWorkOrderRouting(routing)),
    checkResult("session-distiller:review dry-run", sessionReview.ok, summarizeSessionReview(sessionReview)),
    checkResult("evolution:tournament:misa dry-run", tournament.ok, summarizeTournament(tournament)),
    checkResult("vector-memory:classify dry-run", vectorStorage.ok, summarizeVectorStorage(vectorStorage)),
    checkResult("work-order:variants dry-run", workOrderVariants.ok, summarizeWorkOrderVariants(workOrderVariants)),
    checkResult("work-order:evaluate dry-run", workOrderQualityEval.ok, summarizeWorkOrderQualityEval(workOrderQualityEval)),
    checkResult("vector-store:local dry-run", localVectorStore.ok, summarizeLocalVectorStore(localVectorStore)),
    checkResult("skill:evolution dry-run", skillEvolution.ok, summarizeSkillEvolution(skillEvolution)),
    checkResult("curiosity:signals dry-run", curiosityGate.ok, summarizeCuriosityGate(curiosityGate)),
    checkResult("hermes:adapt-runtime dry-run", hermesRuntimeAdapter.ok, summarizeHermesRuntimeAdapter(hermesRuntimeAdapter)),
    checkResult("hermes:work-order dry-run", hermesWorkOrderPipeline.ok, summarizeHermesWorkOrderPipeline(hermesWorkOrderPipeline)),
    checkResult("hermes:plugin:doctor dry-run", hermesRuntimePluginDoctor.ok, summarizeHermesRuntimePluginDoctor(hermesRuntimePluginDoctor)),
    checkResult("runtime:thread dry-run", runtimeThreadReview.ok, summarizeRuntimeThread(runtimeThreadReview)),
    checkResult("zilliz:adapt dry-run", zillizAdapter.ok, summarizeZillizAdapter(zillizAdapter)),
    checkResult("vector-memory:rank dry-run", retrievalRanker.ok, summarizeRetrievalRanker(retrievalRanker)),
    noLiveWritesOrProviderCallsCheck({
      routing,
      sessionReview,
      tournament,
      vectorStorage,
      workOrderVariants,
      workOrderQualityEval,
      localVectorStore,
      skillEvolution,
      zillizAdapter,
      retrievalRanker,
      curiosityGate,
      hermesRuntimeAdapter,
      hermesWorkOrderPipeline,
      hermesRuntimePluginDoctor,
      runtimeThreadReview
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
  const workOrderVariants = buildWorkOrderVariants({
    workOrderRouting: routing,
    seed: "current-line-smoke",
    now
  });
  const workOrderQualityEval = await runWorkOrderQualityEvaluation({
    repoRoot,
    seeds: ["smoke-quality-01", "smoke-quality-02", "smoke-quality-03"],
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
  const hermesWorkOrderPipeline = await runHermesWorkOrderPipeline({
    repoRoot,
    now
  });
  const hermesRuntimePluginDoctor = await runHermesRuntimePluginDoctor({
    repoRoot,
    pluginDir: path.join("examples", "hermes-runtime-plugin"),
    eventLogFile: path.join("examples", "hermes-runtime-plugin", "sample-events.ndjson"),
    now
  });
  const runtimeThreadReview = await buildDefaultRuntimeThreadReview({
    repoRoot,
    now,
    seed: "current-line-smoke"
  });

  const checks = buildCurrentLineSmokeChecks({
    routing,
    sessionReview,
    tournament,
    vectorStorage,
    workOrderVariants,
    workOrderQualityEval,
    localVectorStore,
    skillEvolution,
    zillizAdapter,
    retrievalRanker,
    curiosityGate,
    hermesRuntimeAdapter,
    hermesWorkOrderPipeline,
    hermesRuntimePluginDoctor,
    runtimeThreadReview
  });

  return {
    mode: "current-line-smoke",
    ok: checks.every((check) => check.ok),
    command_surface: [
      "session-distiller:review",
      "vector-memory:classify",
      "vector-memory:rank",
      "vector-store:local",
      "work-order:variants",
      "work-order:evaluate",
      "skill:evolution",
      "curiosity:signals",
      "hermes:adapt-runtime",
      "hermes:work-order",
      "hermes:plugin:doctor",
      "runtime:thread",
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
  workOrderVariants,
  workOrderQualityEval,
  localVectorStore,
  skillEvolution,
  zillizAdapter,
  retrievalRanker,
  curiosityGate,
  hermesRuntimeAdapter,
  hermesWorkOrderPipeline,
  hermesRuntimePluginDoctor,
  runtimeThreadReview
}) {
  const checks = buildCurrentLineSmokeChecks({
    routing: workOrderRouting,
    sessionReview,
    tournament,
    vectorStorage,
    workOrderVariants,
    workOrderQualityEval,
    localVectorStore,
    skillEvolution,
    zillizAdapter,
    retrievalRanker,
    curiosityGate,
    hermesRuntimeAdapter,
    hermesWorkOrderPipeline,
    hermesRuntimePluginDoctor,
    runtimeThreadReview
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
