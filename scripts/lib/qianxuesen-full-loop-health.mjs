import fs from "node:fs/promises";
import path from "node:path";
import { runCurrentLineCalibration } from "./current-line-calibration.mjs";
import { runCurrentLineSmoke } from "./current-line-smoke.mjs";

export const DEFAULT_QIANXUESEN_HEALTH_ROOT = "runs/qianxuesen-full-loop";

const REQUIRED_ROUTES = ["case", "damping", "memory", "policy", "skill"];

function statusFor(ok) {
  return ok ? "pass" : "fail";
}

function runIdFor(now) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function normalizePathForReport(filePath) {
  return filePath.split(path.sep).join("/");
}

function reportPath(filePath, repoRoot) {
  const relative = path.relative(repoRoot, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizePathForReport(relative);
  }
  return normalizePathForReport(filePath);
}

function layerById(calibration) {
  return new Map(calibration.signal_layers.map((layer) => [layer.layer_id, layer]));
}

function checksByName(checks, name) {
  return checks.filter((check) => check.name === name);
}

function allNamedChecksOk(checks, name) {
  const matches = checksByName(checks, name);
  return matches.length > 0 && matches.every((check) => check.ok);
}

function failedChecks(source, checks) {
  return checks
    .filter((check) => !check.ok)
    .map((check) => ({
      source,
      name: check.name,
      details: Object.fromEntries(Object.entries(check).filter(([key]) => !["name", "ok"].includes(key)))
    }));
}

function componentStatus(calibration, smoke) {
  const layers = layerById(calibration);
  const observedRoutes = new Set(Object.keys(calibration.summary.route_counts ?? {})
    .filter((route) => (calibration.summary.route_counts[route] ?? 0) > 0));
  const sourceSamplesOk = calibration.sample_sets.every((sample) => (
    sample.source.source_count > 0
    && Object.keys(sample.source.signal_counts ?? {}).length > 0
  ));
  const sampleRetrievalOk = calibration.sample_sets.every((sample) => (
    sample.retrieval_probe.top1_kind_match === true
    && sample.retrieval_probe.safety.zilliz_written === false
    && sample.retrieval_probe.safety.embedding_created === false
  ));
  const sampleJudgeOk = calibration.sample_sets.every((sample) => (
    sample.tournament.production_authority === false
    && sample.tournament.judge.llm_api_calls === 0
  ));

  return {
    current_line_smoke: statusFor(smoke.ok),
    local_vector_store: statusFor(smoke.checks.some((check) => (
      check.name === "vector-store:local dry-run"
      && check.ok
      && check.local_vector_store_written === false
      && check.zilliz_written === false
      && check.embedding_created === false
    ))),
    skill_evolution: statusFor(smoke.checks.some((check) => (
      check.name === "skill:evolution dry-run"
      && check.ok
      && check.no_write === true
      && check.production_authority === false
      && check.controller_authority === false
      && check.supervisor_changes_skill === false
      && check.llm_api_calls === 0
    ))),
    hermes_runtime_adapter: statusFor(smoke.checks.some((check) => (
      check.name === "hermes:adapt-runtime dry-run"
      && check.ok
      && check.writes_skills === false
      && check.writes_persistent_memory === false
      && check.blocks_runtime === false
      && check.llm_api_calls === 0
      && check.external_api_calls === 0
    ))),
    source_distillation: statusFor(sourceSamplesOk),
    signal_extraction: statusFor(calibration.summary.observed_signal_count > 0 && sourceSamplesOk),
    qianxuesen_route_decision: statusFor(
      REQUIRED_ROUTES.every((route) => observedRoutes.has(route))
      && layers.get("qianxuesen_route_signals")?.authority === "local_route_owner_only"
    ),
    memory_layer: statusFor(allNamedChecksOk(calibration.checks, "memory-layer sample review")),
    repair_ticket: statusFor(allNamedChecksOk(calibration.checks, "repair tickets stay local")),
    work_order_routing: statusFor(allNamedChecksOk(calibration.checks, "work-order routing mirrors repair tickets")),
    perception: statusFor(
      calibration.perception_shadow_replay.ok
      && allNamedChecksOk(calibration.checks, "perception replay stays shadow-only")
      && allNamedChecksOk(calibration.checks, "perception replay keeps Qianxuesen route authority")
      && allNamedChecksOk(calibration.checks, "perception replay keeps writes and provider calls off")
    ),
    curiosity_signal_gate: statusFor(
      smoke.checks.some((check) => check.name === "curiosity:signals dry-run" && check.ok)
      && allNamedChecksOk(calibration.checks, "curiosity gate catches review-worthy signals without selecting noise")
      && allNamedChecksOk(calibration.checks, "curiosity gate kept signal selection precise")
      && calibration.summary.curiosity_missed_review_worthy_count === 0
      && calibration.summary.curiosity_noise_selected_count === 0
    ),
    retrieval: statusFor(
      calibration.summary.retrieval_top1_exact_recall === 1
      && sampleRetrievalOk
      && allNamedChecksOk(calibration.checks, "retrieval probe keeps requested kind first")
      && allNamedChecksOk(calibration.checks, "all retrieval probes exact-match top1")
    ),
    tournament: statusFor(
      allNamedChecksOk(calibration.checks, "tournament sample review")
      && allNamedChecksOk(calibration.checks, "tournament preserves route and safety")
    ),
    judge: statusFor(sampleJudgeOk && allNamedChecksOk(calibration.checks, "expected judge-escalation shape")),
    safety_boundary: statusFor(
      allNamedChecksOk(calibration.checks, "shadow mode kept all live effects off")
      && allNamedChecksOk(calibration.checks, "no live writes or provider calls")
      && allNamedChecksOk(smoke.checks, "no live writes or provider calls")
    )
  };
}

function safetySummary(calibration, smoke) {
  const perceptionLayer = layerById(calibration).get("shadow_perception_signals");
  return {
    production_authority: calibration.summary.production_authority || smoke.summary.production_authority,
    publication_allowed: calibration.summary.publication_allowed,
    live_effect_allowed: calibration.summary.live_effect_allowed || smoke.summary.live_effect_allowed,
    writes_persistent_memory: calibration.summary.writes_persistent_memory || smoke.summary.writes_persistent_memory,
    zilliz_written: calibration.summary.zilliz_written || smoke.summary.zilliz_written,
    embedding_created: calibration.summary.embedding_created || smoke.summary.embedding_created,
    changes_route: calibration.perception_shadow_replay.safety.changes_route,
    changes_winner: calibration.perception_shadow_replay.safety.changes_winner,
    controller_authority_leaked: perceptionLayer?.authority !== "hint_only",
    route_authority: "qianxuesen",
    llm_api_calls: calibration.summary.llm_api_calls,
    external_api_calls: calibration.summary.external_api_calls
  };
}

function safetyViolations(safety) {
  return Object.entries({
    production_authority: safety.production_authority,
    publication_allowed: safety.publication_allowed,
    live_effect_allowed: safety.live_effect_allowed,
    writes_persistent_memory: safety.writes_persistent_memory,
    zilliz_written: safety.zilliz_written,
    embedding_created: safety.embedding_created,
    changes_route: safety.changes_route,
    changes_winner: safety.changes_winner,
    controller_authority_leaked: safety.controller_authority_leaked
  })
    .filter(([, value]) => value !== false)
    .map(([name, value]) => ({
      source: "safety",
      name,
      details: { value }
    }))
    .concat(
      safety.llm_api_calls === 0 ? [] : [{
        source: "safety",
        name: "llm_api_calls",
        details: { value: safety.llm_api_calls }
      }],
      safety.external_api_calls === 0 ? [] : [{
        source: "safety",
        name: "external_api_calls",
        details: { value: safety.external_api_calls }
      }]
    );
}

function coverageSummary(calibration, smoke) {
  return {
    smoke_checks: smoke.summary,
    sample_sets: calibration.summary.sample_set_count,
    sources: calibration.summary.source_count,
    atomic_lessons: calibration.summary.atomic_lesson_count,
    work_orders: calibration.summary.work_order_count,
    tournaments: calibration.summary.tournament_count,
    route_counts: calibration.summary.route_counts,
    route_coverage: REQUIRED_ROUTES.filter((route) => (calibration.summary.route_counts?.[route] ?? 0) > 0),
    perception_replay_ok: calibration.summary.perception_replay_ok,
    curiosity_llm_variant_generation: calibration.summary.curiosity_llm_variant_generation_count,
    curiosity_optional_review: calibration.summary.curiosity_optional_review_count,
    curiosity_missed_review_worthy: calibration.summary.curiosity_missed_review_worthy_count,
    curiosity_noise_selected: calibration.summary.curiosity_noise_selected_count,
    retrieval_top1_exact_recall: calibration.summary.retrieval_top1_exact_recall,
    judge_recommended: calibration.summary.judge_recommended_count,
    judge_near_threshold: calibration.summary.judge_near_threshold_count,
    high_value_llm_review: calibration.summary.high_value_llm_review_count
  };
}

function sumBy(values, selector) {
  return values.reduce((total, value) => total + selector(value), 0);
}

function mergeCounts(values) {
  const counts = {};
  for (const value of values) {
    for (const [key, count] of Object.entries(value ?? {})) {
      counts[key] = (counts[key] ?? 0) + count;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sampleSetSummaries(calibration) {
  return calibration.sample_sets.map((sample) => ({
    sample_set_id: sample.sample_set_id,
    ok: sample.ok,
    source_kind: sample.source.source_kind,
    source_count: sample.source.source_count,
    atomic_lesson_count: sample.source.atomic_lesson_count,
    route_counts: sample.source.route_counts,
    repair_tickets: sample.repair_ticket.ticket_count,
    work_orders: sample.work_order.work_order_count,
    retrieval: {
      target_kind: sample.retrieval_probe.target_kind,
      top1_kind: sample.retrieval_probe.top1_kind,
      top1_record_id: sample.retrieval_probe.top1_record_id,
      top1_exact_match: sample.retrieval_probe.top1_exact_match,
      top1_kind_match: sample.retrieval_probe.top1_kind_match
    },
    tournament: {
      tournament_count: sample.tournament.tournament_count,
      winner_count: sample.tournament.winner_count,
      rejected_variant_count: sample.tournament.rejected_variant_count,
      production_authority: sample.tournament.production_authority
    },
    judge: {
      recommended: sample.tournament.judge_escalation.recommended,
      near_threshold: sample.tournament.judge_escalation.near_threshold,
      llm_review_value: sample.tournament.judge_escalation.llm_review_value,
      llm_api_calls: sample.tournament.judge.llm_api_calls
    }
  }));
}

function componentSummaries(calibration, smoke, components) {
  const layers = layerById(calibration);
  const perceptionLayer = layers.get("shadow_perception_signals");
  const retrievalLayer = layers.get("retrieval_ranker_signals");
  const tournamentLayer = layers.get("tournament_quality_signals");
  const samples = sampleSetSummaries(calibration);
  const localVectorStoreCheck = smoke.checks.find((check) => check.name === "vector-store:local dry-run");
  const skillEvolutionCheck = smoke.checks.find((check) => check.name === "skill:evolution dry-run");
  const hermesRuntimeAdapterCheck = smoke.checks.find((check) => check.name === "hermes:adapt-runtime dry-run");
  const curiosityLayer = layers.get("curiosity_llm_value_gate");
  const curiosityCheck = smoke.checks.find((check) => check.name === "curiosity:signals dry-run");

  return {
    current_line_smoke: {
      status: components.current_line_smoke,
      checks: smoke.summary,
      command_surface: smoke.command_surface
    },
    source_distillation: {
      status: components.source_distillation,
      sample_sets: calibration.summary.sample_set_count,
      sources: calibration.summary.source_count,
      atomic_lessons: calibration.summary.atomic_lesson_count,
      observed_signals: calibration.summary.observed_signal_count,
      signal_counts: calibration.summary.signal_counts
    },
    local_vector_store: {
      status: components.local_vector_store,
      backend: localVectorStoreCheck?.backend ?? "unknown",
      records: localVectorStoreCheck?.records ?? 0,
      unique_sources: localVectorStoreCheck?.unique_sources ?? 0,
      dry_run: localVectorStoreCheck?.dry_run ?? true,
      local_vector_store_written: localVectorStoreCheck?.local_vector_store_written ?? null,
      zilliz_written: localVectorStoreCheck?.zilliz_written ?? null,
      embedding_created: localVectorStoreCheck?.embedding_created ?? null
    },
    skill_evolution: {
      status: components.skill_evolution,
      status_label: skillEvolutionCheck?.status ?? "unknown",
      evolution_candidates: skillEvolutionCheck?.evolution_candidates ?? 0,
      replay_required: skillEvolutionCheck?.replay_required ?? 0,
      human_review_required: skillEvolutionCheck?.human_review_required ?? null,
      no_write: skillEvolutionCheck?.no_write ?? null,
      production_authority: skillEvolutionCheck?.production_authority ?? null,
      controller_authority: skillEvolutionCheck?.controller_authority ?? null
    },
    hermes_runtime_adapter: {
      status: components.hermes_runtime_adapter,
      events: hermesRuntimeAdapterCheck?.events ?? 0,
      research_digests: hermesRuntimeAdapterCheck?.research_digests ?? 0,
      evolution_candidates: hermesRuntimeAdapterCheck?.evolution_candidates ?? 0,
      replay_required: hermesRuntimeAdapterCheck?.replay_required ?? 0,
      writes_skills: hermesRuntimeAdapterCheck?.writes_skills ?? null,
      writes_persistent_memory: hermesRuntimeAdapterCheck?.writes_persistent_memory ?? null,
      blocks_runtime: hermesRuntimeAdapterCheck?.blocks_runtime ?? null
    },
    qianxuesen_route_decision: {
      status: components.qianxuesen_route_decision,
      owner: "qianxuesen",
      authority: layers.get("qianxuesen_route_signals")?.authority ?? "unknown",
      route_counts: calibration.summary.route_counts,
      missing_routes: REQUIRED_ROUTES.filter((route) => (calibration.summary.route_counts?.[route] ?? 0) === 0)
    },
    memory_layer: {
      status: components.memory_layer,
      total_atomic_lessons: calibration.summary.atomic_lesson_count,
      route_counts: calibration.summary.route_counts,
      signal_counts: calibration.summary.signal_counts
    },
    repair_ticket: {
      status: components.repair_ticket,
      total_tickets: calibration.summary.repair_ticket_count,
      severity_counts: mergeCounts(calibration.sample_sets.map((sample) => sample.repair_ticket.severity_counts))
    },
    work_order_routing: {
      status: components.work_order_routing,
      total_work_orders: calibration.summary.work_order_count,
      auto_executable_count: sumBy(calibration.sample_sets, (sample) => sample.work_order.auto_executable_count),
      agent_self_review_count: sumBy(calibration.sample_sets, (sample) => sample.work_order.agent_self_review_count),
      stronger_model_recommended_count: sumBy(calibration.sample_sets, (sample) => sample.work_order.stronger_model_recommended_count),
      durable_or_public_effect_allowed: calibration.sample_sets.some((sample) => sample.work_order.durable_or_public_effect_allowed)
    },
    perception: {
      status: components.perception,
      authority: perceptionLayer?.authority ?? "unknown",
      replay_ok: calibration.perception_shadow_replay.ok,
      top_attention_source_id: calibration.perception_shadow_replay.top_attention_source_id,
      attention_queue_count: calibration.summary.perception_attention_queue_count,
      duplicate_cluster_count: calibration.summary.perception_duplicate_cluster_count,
      ledger_statuses: calibration.perception_shadow_replay.ledger_statuses,
      blocked_outputs: perceptionLayer?.blocked_outputs ?? []
    },
    curiosity_signal_gate: {
      status: components.curiosity_signal_gate,
      authority: curiosityLayer?.authority ?? "unknown",
      llm_variant_generation_count: calibration.summary.curiosity_llm_variant_generation_count,
      optional_review_count: calibration.summary.curiosity_optional_review_count,
      review_worthy_count: calibration.summary.curiosity_review_worthy_count,
      missed_review_worthy_count: calibration.summary.curiosity_missed_review_worthy_count,
      noise_selected_count: calibration.summary.curiosity_noise_selected_count,
      smoke_sources: curiosityCheck?.sources ?? null,
      production_authority: curiosityLayer?.production_authority ?? false,
      llm_api_calls: curiosityLayer?.llm_api_calls ?? 0
    },
    retrieval: {
      status: components.retrieval,
      authority: retrievalLayer?.authority ?? "unknown",
      probe_count: calibration.summary.retrieval_probe_count,
      top1_exact_recall: calibration.summary.retrieval_top1_exact_recall,
      all_top1_kind_match: samples.every((sample) => sample.retrieval.top1_kind_match),
      ranking_inputs: retrievalLayer?.ranking_inputs ?? []
    },
    tournament: {
      status: components.tournament,
      authority: tournamentLayer?.authority ?? "unknown",
      tournament_count: calibration.summary.tournament_count,
      judge_recommended_count: calibration.summary.judge_recommended_count,
      judge_near_threshold_count: calibration.summary.judge_near_threshold_count,
      high_value_llm_review_count: calibration.summary.high_value_llm_review_count,
      production_authority: tournamentLayer?.production_authority ?? false
    },
    judge: {
      status: components.judge,
      recommended_count: calibration.summary.judge_recommended_count,
      near_threshold_count: calibration.summary.judge_near_threshold_count,
      high_value_llm_review_count: calibration.summary.high_value_llm_review_count,
      llm_api_calls: calibration.summary.llm_api_calls,
      default_mode: "deterministic_shadow"
    },
    sample_sets: samples
  };
}

function keyFindings({ ok, components, safety, coverage }) {
  const failedComponents = Object.entries(components)
    .filter(([, status]) => status !== "pass")
    .map(([name]) => name);
  return [
    ok
      ? "Full local Qianxuesen shadow loop passed."
      : `Full local Qianxuesen shadow loop failed: ${failedComponents.join(", ") || "blocking failure"}.`,
    safety.live_effect_allowed === false
      && safety.writes_persistent_memory === false
      && safety.zilliz_written === false
      && safety.embedding_created === false
      ? "Safety boundary stayed closed: no live effect, memory write, Zilliz write, or embedding creation."
      : "Safety boundary needs review: at least one live-effect flag changed.",
    `Routes covered: ${coverage.route_coverage.join(", ")}.`,
    `Retrieval exact recall: ${coverage.retrieval_top1_exact_recall}; perception replay: ${coverage.perception_replay_ok}.`,
    `Curiosity gate selected ${coverage.curiosity_llm_variant_generation} LLM-variant candidates, held ${coverage.curiosity_optional_review} optional reviews, missed ${coverage.curiosity_missed_review_worthy}, and selected ${coverage.curiosity_noise_selected} noise items.`,
    `Judge surfaced ${coverage.judge_recommended} high-value review candidates, kept ${coverage.judge_near_threshold} near-threshold cases deterministic, and made ${safety.llm_api_calls} LLM calls.`
  ];
}

export function buildQianxuesenFullLoopHealth({
  now = new Date(),
  runId = runIdFor(now),
  smoke,
  calibration,
  artifacts = {}
} = {}) {
  const components = componentStatus(calibration, smoke);
  const safety = safetySummary(calibration, smoke);
  const coverage = coverageSummary(calibration, smoke);
  const failed = [
    ...failedChecks("current-line-smoke", smoke.checks),
    ...failedChecks("current-line-calibration", calibration.checks),
    ...safetyViolations(safety),
    ...Object.entries(components)
      .filter(([, status]) => status !== "pass")
      .map(([name, status]) => ({
        source: "component_status",
        name,
        details: { status }
      }))
  ];
  const ok = smoke.ok && calibration.ok && failed.length === 0;

  return {
    schema_version: "misa.qianxuesen_full_loop_health.v1",
    run_id: runId,
    generated_at: now.toISOString(),
    scope: "qianxuesen-full-loop",
    source: "current-line-smoke + current-line-calibration",
    ok,
    status: statusFor(ok),
    verdict: {
      summary: ok ? "full_loop_shadow_passed" : "full_loop_shadow_failed",
      plain: ok
        ? "The local Qianxuesen loop passed without live effects or authority leaks."
        : "The local Qianxuesen loop needs review before downstream use.",
      recommended_next_step: ok ? "inspect artifacts only if detail is needed" : "open blocking_failures and component_summaries before continuing"
    },
    key_findings: keyFindings({ ok, components, safety, coverage }),
    blocking_failures: failed,
    warnings: [],
    component_status: components,
    component_summaries: componentSummaries(calibration, smoke, components),
    safety,
    coverage,
    artifacts,
    retention: {
      default_history: true,
      latest_files_are_overwritten: true,
      history_files_are_append_only_by_run_id: true,
      detail_policy: "manifest indexes component artifacts and does not embed full logs"
    }
  };
}

export function renderQianxuesenFullLoopHealthMarkdown(report) {
  const lines = [
    "# Qianxuesen Full-Loop Health",
    "",
    `- run_id: ${report.run_id}`,
    `- generated_at: ${report.generated_at}`,
    `- status: ${report.status}`,
    `- ok: ${report.ok}`,
    `- verdict: ${report.verdict.plain}`,
    `- next_step: ${report.verdict.recommended_next_step}`,
    "",
    "## Key Findings",
    ""
  ];

  for (const finding of report.key_findings) {
    lines.push(`- ${finding}`);
  }

  lines.push(
    "",
    "## Component Status",
    ""
  );

  for (const [name, status] of Object.entries(report.component_status)) {
    lines.push(`- ${name}: ${status}`);
  }

  lines.push(
    "",
    "## Safety",
    ""
  );

  for (const [name, value] of Object.entries(report.safety)) {
    lines.push(`- ${name}: ${value}`);
  }

  lines.push(
    "",
    "## Coverage",
    "",
    `- sample_sets: ${report.coverage.sample_sets}`,
    `- sources: ${report.coverage.sources}`,
    `- atomic_lessons: ${report.coverage.atomic_lessons}`,
    `- work_orders: ${report.coverage.work_orders}`,
    `- tournaments: ${report.coverage.tournaments}`,
    `- route_coverage: ${report.coverage.route_coverage.join(", ")}`,
    `- perception_replay_ok: ${report.coverage.perception_replay_ok}`,
    `- retrieval_top1_exact_recall: ${report.coverage.retrieval_top1_exact_recall}`,
    `- judge_recommended: ${report.coverage.judge_recommended}`,
    `- judge_near_threshold: ${report.coverage.judge_near_threshold}`,
    `- high_value_llm_review: ${report.coverage.high_value_llm_review}`,
    "",
    "## Component Summaries",
    "",
    `- smoke: ${report.component_summaries.current_line_smoke.checks.passed}/${report.component_summaries.current_line_smoke.checks.total} checks`,
    `- source_distillation: ${report.component_summaries.source_distillation.sources} sources, ${report.component_summaries.source_distillation.atomic_lessons} atomic lessons`,
    `- local_vector_store: backend=${report.component_summaries.local_vector_store.backend}, records=${report.component_summaries.local_vector_store.records}, dry_run=${report.component_summaries.local_vector_store.dry_run}`,
    `- skill_evolution: candidates=${report.component_summaries.skill_evolution.evolution_candidates}, replay_required=${report.component_summaries.skill_evolution.replay_required}, no_write=${report.component_summaries.skill_evolution.no_write}`,
    `- hermes_runtime_adapter: events=${report.component_summaries.hermes_runtime_adapter.events}, digests=${report.component_summaries.hermes_runtime_adapter.research_digests}, candidates=${report.component_summaries.hermes_runtime_adapter.evolution_candidates}`,
    `- routing: owner=${report.component_summaries.qianxuesen_route_decision.owner}, authority=${report.component_summaries.qianxuesen_route_decision.authority}`,
    `- repair_ticket: ${report.component_summaries.repair_ticket.total_tickets} tickets`,
    `- work_order: ${report.component_summaries.work_order_routing.total_work_orders} orders, auto_executable=${report.component_summaries.work_order_routing.auto_executable_count}`,
    `- perception: replay=${report.component_summaries.perception.replay_ok}, top_attention=${report.component_summaries.perception.top_attention_source_id}, duplicate_clusters=${report.component_summaries.perception.duplicate_cluster_count}`,
    `- retrieval: probes=${report.component_summaries.retrieval.probe_count}, all_top1_kind_match=${report.component_summaries.retrieval.all_top1_kind_match}`,
    `- tournament: ${report.component_summaries.tournament.tournament_count} tournaments, judge_recommended=${report.component_summaries.tournament.judge_recommended_count}`,
    "",
    "## Sample Sets",
    ""
  );

  for (const sample of report.component_summaries.sample_sets) {
    lines.push(
      `- ${sample.sample_set_id}: ok=${sample.ok}, sources=${sample.source_count}, routes=${JSON.stringify(sample.route_counts)}, retrieval=${sample.retrieval.top1_kind}/${sample.retrieval.top1_record_id}, judge=${sample.judge.llm_review_value}`
    );
  }

  lines.push(
    "",
    "## Blocking Failures",
    ""
  );

  if (report.blocking_failures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of report.blocking_failures) {
      lines.push(`- ${failure.source}: ${failure.name} ${JSON.stringify(failure.details)}`);
    }
  }

  lines.push(
    "",
    "## Artifact Index",
    ""
  );

  for (const [name, value] of Object.entries(report.artifacts)) {
    lines.push(`- ${name}: ${value}`);
  }

  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

export async function runQianxuesenFullLoopHealth({
  repoRoot = process.cwd(),
  rootDir = DEFAULT_QIANXUESEN_HEALTH_ROOT,
  now = new Date(),
  keepHistory = true,
  smoke,
  calibration
} = {}) {
  const runId = runIdFor(now);
  const root = path.isAbsolute(rootDir) ? rootDir : path.join(repoRoot, rootDir);
  const runRoot = keepHistory ? path.join(root, "history", runId) : root;
  const artifactRoot = path.join(runRoot, "artifacts");

  const smokeResult = smoke ?? await runCurrentLineSmoke({
    repoRoot,
    now,
    tournamentNow: now
  });
  const calibrationResult = calibration ?? await runCurrentLineCalibration({
    repoRoot,
    now
  });

  const smokeArtifact = path.join(artifactRoot, "current-line-smoke.json");
  const calibrationArtifact = path.join(artifactRoot, "current-line-calibration.json");
  await writeJson(smokeArtifact, smokeResult);
  await writeJson(calibrationArtifact, calibrationResult);

  const historyJson = path.join(runRoot, "health.json");
  const historyMd = path.join(runRoot, "health.md");
  const latestJson = path.join(root, "latest.json");
  const latestMd = path.join(root, "latest.md");

  const report = buildQianxuesenFullLoopHealth({
    now,
    runId,
    smoke: smokeResult,
    calibration: calibrationResult,
    artifacts: {
      current_line_smoke: reportPath(smokeArtifact, repoRoot),
      current_line_calibration: reportPath(calibrationArtifact, repoRoot),
      history_json: reportPath(historyJson, repoRoot),
      history_markdown: reportPath(historyMd, repoRoot),
      latest_json: reportPath(latestJson, repoRoot),
      latest_markdown: reportPath(latestMd, repoRoot)
    }
  });
  const markdown = renderQianxuesenFullLoopHealthMarkdown(report);

  await writeJson(historyJson, report);
  await writeText(historyMd, markdown);
  await writeJson(latestJson, report);
  await writeText(latestMd, markdown);

  return {
    ...report,
    outputs: {
      history_json: reportPath(historyJson, repoRoot),
      history_markdown: reportPath(historyMd, repoRoot),
      latest_json: reportPath(latestJson, repoRoot),
      latest_markdown: reportPath(latestMd, repoRoot)
    }
  };
}
