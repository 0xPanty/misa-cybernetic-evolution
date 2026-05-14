import { reviewEvolutionTournamentGate } from "./evolution-tournament-gate.mjs";
import { reviewLangGraphQianxuesenBridge } from "./langgraph-qianxuesen-bridge.mjs";
import { reviewMemoryLayerComparison } from "./memory-layer.mjs";
import { buildPerceptionDigest } from "./perception-sidecar.mjs";
import { reviewRepairTickets } from "./repair-ticket.mjs";
import {
  PERCEPTION_NOVELTY_SIGNAL_HINTS,
  PERCEPTION_RISK_SIGNAL_HINTS,
  PERCEPTION_SIGNAL_FAMILIES
} from "./signal-taxonomy.mjs";
import {
  buildVectorRetrievalStrategy,
  rankVectorMemoryHits
} from "./vector-retrieval-ranker.mjs";
import { buildVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { buildWorkOrderRouting } from "./work-order-router.mjs";
import {
  LESSON_ROUTE_ORDER,
  LESSON_ROUTE_SIGNALS,
  SIGNAL_RULES
} from "./session-distiller.mjs";

const DEFAULT_NOW = new Date("2026-05-14T00:00:00Z");
const DEFAULT_PERCEPTION_REPLAY = Object.freeze({
  source_dir: "test/fixtures/perception/shadow-sources",
  ledger_file: "test/fixtures/perception/handled-signal-ledger.json"
});

export const DEFAULT_CALIBRATION_SAMPLE_SETS = [
  {
    sample_set_id: "default_redacted_examples",
    label: "Default redacted distillation examples",
    source_dir: "examples/misa-distillation",
    expected_routes: { memory: 1, case: 1, policy: 1 },
    expected_judge: { recommended: false, near_threshold: true, level: "medium" }
  },
  {
    sample_set_id: "route_sensitive_sources",
    label: "Route-sensitive local fixtures",
    source_dir: "test/fixtures/evolution/route-sensitive-sources",
    expected_routes: { memory: 4, skill: 4, case: 4, policy: 4, damping: 4 },
    expected_judge: { recommended: true, near_threshold: false, level: "high" }
  },
  {
    sample_set_id: "judge_calibration_sources",
    label: "Near-threshold judge calibration fixtures",
    source_dir: "test/fixtures/evolution/judge-calibration-sources",
    expected_routes: { memory: 4, skill: 4, case: 4, policy: 4 },
    expected_judge: { recommended: false, near_threshold: true, level: "medium" }
  },
  {
    sample_set_id: "vps_sanitized_conversation",
    label: "VPS sanitized conversation fixtures",
    vps_raw_dir: "test/fixtures/evolution/vps-real-conversation-source",
    expected_routes: { skill: 1, case: 1, policy: 1 },
    expected_judge: { recommended: true, near_threshold: false, level: "high" }
  },
  {
    sample_set_id: "redacted_holdout_samples",
    label: "Redacted holdout samples",
    source_dir: "test/fixtures/evolution/holdout-redacted-sources",
    expected_routes: { memory: 1, skill: 1, case: 1, policy: 1, damping: 1 },
    expected_judge: { recommended: false, near_threshold: true, level: "medium" }
  }
];

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sumBy(values, selector) {
  return values.reduce((sum, value) => sum + selector(value), 0);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

function hasLiveEffects(safety = {}) {
  return Object.values(safety.live_effects ?? {}).some(Boolean);
}

function sourceArgsForSampleSet(sampleSet) {
  if (sampleSet.vps_raw_dir) return { vpsRawDir: sampleSet.vps_raw_dir };
  return { sourceDir: sampleSet.source_dir };
}

function missingExpectedRoutes(routeCounts, expectedRoutes = {}) {
  return Object.entries(expectedRoutes)
    .filter(([route, minimum]) => (routeCounts[route] ?? 0) < minimum)
    .map(([route, minimum]) => ({
      route,
      expected_minimum: minimum,
      actual: routeCounts[route] ?? 0
    }));
}

function judgeExpectationMismatches(judgeEscalation, expected = {}) {
  const mismatches = [];
  if (typeof expected.recommended === "boolean" && judgeEscalation.recommended !== expected.recommended) {
    mismatches.push(`recommended=${judgeEscalation.recommended}`);
  }
  if (typeof expected.near_threshold === "boolean" && judgeEscalation.near_threshold !== expected.near_threshold) {
    mismatches.push(`near_threshold=${judgeEscalation.near_threshold}`);
  }
  if (expected.level && judgeEscalation.llm_review_value?.level !== expected.level) {
    mismatches.push(`llm_review_value.level=${judgeEscalation.llm_review_value?.level}`);
  }
  return mismatches;
}

function querySurfaceForKind(kind) {
  if (kind === "repair_work_order") return "repair_planning";
  if (kind === "policy_boundary") return "policy_check";
  if (kind?.includes("persona")) return "persona_context";
  return "retrieval_context";
}

function queryForRecord(record) {
  const sourceId = record.metadata?.original_source_id ?? record.metadata?.source_id ?? record.record_id;
  if (record.kind === "repair_work_order") return `What repair work order came from ${sourceId}?`;
  if (record.kind === "policy_boundary") return `Which policy boundary applies to ${sourceId}?`;
  if (record.kind === "decision_trace") return `Show the decision trace for ${sourceId}.`;
  if (record.kind === "audit_log") return `Find the audit log for ${sourceId}.`;
  return `Find ${record.kind} evidence for ${sourceId}.`;
}

function scoreForProbeHit(record, target, index) {
  if (record.record_id === target.record_id) return 0.58;
  if (record.kind === target.kind) return 0.42;
  if (record.metadata?.original_source_id === target.metadata?.original_source_id) {
    return Math.max(0.72, 0.96 - index * 0.01);
  }
  return Math.max(0.55, 0.88 - index * 0.01);
}

function buildRetrievalProbe(storage) {
  const target = storage.records.find((record) => record.kind === "repair_work_order")
    ?? storage.records.find((record) => record.kind === "policy_boundary")
    ?? storage.records[0];

  if (!target) {
    return {
      ok: false,
      reason: "no_vector_memory_records",
      input_hit_count: 0,
      top1_exact_match: false,
      safety: {
        zilliz_written: false,
        embedding_created: false,
        external_api_calls: 0
      }
    };
  }

  const hits = storage.records.map((record, index) => ({
    record_id: record.record_id,
    title: record.title,
    text: record.summary,
    score: scoreForProbeHit(record, target, index),
    metadata: record.metadata
  }));
  const ranking = rankVectorMemoryHits({
    query: queryForRecord(target),
    requestedKind: target.kind,
    requestedSurface: querySurfaceForKind(target.kind),
    hits,
    topK: 5
  });
  const top1 = ranking.ranked_hits[0] ?? null;

  return {
    ok: top1?.record_id === target.record_id && top1?.kind === target.kind,
    target_record_id: target.record_id,
    target_kind: target.kind,
    target_original_source_id: target.metadata?.original_source_id ?? null,
    input_hit_count: hits.length,
    ranked_hit_count: ranking.summary.ranked_hit_count,
    filtered_hit_count: ranking.summary.filtered_hit_count,
    top1_record_id: top1?.record_id ?? null,
    top1_kind: top1?.kind ?? null,
    top1_exact_match: top1?.record_id === target.record_id,
    top1_kind_match: top1?.kind === target.kind,
    top1_rank_bucket: top1?.rank_bucket ?? null,
    safety: {
      zilliz_written: ranking.safety.zilliz_written,
      embedding_created: ranking.safety.embedding_created,
      external_api_calls: ranking.safety.external_api_calls
    }
  };
}

function winnerRoutePreserved(tournament) {
  return tournament.tournaments.every((item) => {
    const winner = item.variants.find((variant) => variant.variant_id === item.winner.variant_id);
    return winner?.route_target === item.route_target;
  });
}

function aggregateRouteCounts(sampleResults) {
  const routeCounts = {};
  for (const sample of sampleResults) {
    for (const [route, count] of Object.entries(sample.tournament.route_counts)) {
      routeCounts[route] = (routeCounts[route] ?? 0) + count;
    }
  }
  return routeCounts;
}

function sortObjectByKey(values) {
  return Object.fromEntries(
    Object.entries(values ?? {}).sort(([left], [right]) => left.localeCompare(right))
  );
}

function aggregateSignalCounts(sampleResults) {
  const signalCounts = {};
  for (const sample of sampleResults) {
    for (const [signal, count] of Object.entries(sample.source.signal_counts ?? {})) {
      signalCounts[signal] = (signalCounts[signal] ?? 0) + count;
    }
  }
  return sortObjectByKey(signalCounts);
}

function buildRouteSignalMap(routeCounts) {
  return LESSON_ROUTE_ORDER.map((route) => ({
    route,
    route_signals: [...(LESSON_ROUTE_SIGNALS[route] ?? [])],
    observed_count: routeCounts[route] ?? 0
  }));
}

function buildSignalLayerMap(sampleResults, summary, perceptionReplay) {
  const retrievalStrategy = buildVectorRetrievalStrategy();
  const routeCounts = summary.route_counts ?? aggregateRouteCounts(sampleResults);
  const signalCounts = summary.signal_counts ?? aggregateSignalCounts(sampleResults);

  return [
    {
      layer_id: "source_distillation_signals",
      owner: "session-distiller",
      role: "detect redacted source pressure before routing",
      authority: "observation_only",
      primary_signals: SIGNAL_RULES.map(([signal]) => signal),
      observed_signal_counts: signalCounts,
      output_surface: "distillate.extracted_signals and learning_event.signals",
      live_effect_allowed: false
    },
    {
      layer_id: "qianxuesen_route_signals",
      owner: "deterministic route table",
      role: "choose memory, skill, case, policy, damping, or ignore",
      authority: "local_route_owner_only",
      routes: buildRouteSignalMap(routeCounts),
      output_surface: "learning_event.expected_route and candidate.route_target",
      production_authority: false
    },
    {
      layer_id: "shadow_perception_signals",
      owner: "perception digest",
      role: "prioritize source attention before downstream review",
      authority: "hint_only",
      primary_outputs: [
        "attention_queue",
        "risk_hints",
        "novelty_hints",
        "expected_review_value_hints",
        "trace_continuity_hints"
      ],
      taxonomy: {
        risk_signal_count: PERCEPTION_RISK_SIGNAL_HINTS.length,
        novelty_signal_count: PERCEPTION_NOVELTY_SIGNAL_HINTS.length,
        signal_family_count: PERCEPTION_SIGNAL_FAMILIES.length
      },
      replay: perceptionReplay ? {
        ok: perceptionReplay.ok,
        source_count: perceptionReplay.summary.source_count,
        attention_queue_count: perceptionReplay.summary.attention_queue_count,
        duplicate_cluster_count: perceptionReplay.summary.duplicate_cluster_count,
        top_attention_source_id: perceptionReplay.top_attention_source_id
      } : null,
      blocked_outputs: ["route_change", "winner_change", "persistent_memory_write", "zilliz_write"],
      production_authority: false
    },
    {
      layer_id: "work_order_signals",
      owner: "repair ticket and work-order router",
      role: "turn repair pressure into local primary-agent handoff",
      authority: "handoff_recommendation_only",
      primary_inputs: [
        "ticket severity",
        "bad promotion count",
        "minimal-positive L3 violations",
        "durable or public effect risk",
        "stronger model recommendation"
      ],
      observed_work_orders: sumBy(sampleResults, (sample) => sample.work_order.work_order_count),
      durable_or_public_effect_allowed: false
    },
    {
      layer_id: "retrieval_ranker_signals",
      owner: "vector retrieval ranker",
      role: "keep requested memory kind ahead of same-source context",
      authority: "read_side_ranking_only",
      ranking_inputs: [...retrievalStrategy.ranking_inputs],
      kind_profiles: retrievalStrategy.kind_profiles.map((profile) => ({
        kind: profile.kind,
        authority: profile.authority,
        support_kinds: profile.support_kinds
      })),
      zilliz_written: false,
      embedding_created: false
    },
    {
      layer_id: "tournament_quality_signals",
      owner: "evolution tournament gate",
      role: "compare local draft variants without changing the route or winner authority",
      authority: "draft_optimizer_only",
      quality_dimensions: [
        "route_preservation",
        "safety_lock",
        "holdout_strength",
        "failure_learning",
        "compactness",
        "source_coverage"
      ],
      judge_escalation_dimensions: [
        "uncertainty",
        "value",
        "conflict",
        "novelty",
        "anomaly"
      ],
      observed_tournaments: summary.tournament_count,
      llm_api_calls: summary.llm_api_calls,
      production_authority: false
    }
  ];
}

function mapBy(values, selector) {
  return new Map(values.map((value) => [selector(value), value]));
}

function duplicateClusterHas(cluster, sourceIds) {
  return sourceIds.every((sourceId) => cluster.source_ids.includes(sourceId));
}

async function runPerceptionShadowReplay({ repoRoot, now }) {
  const digest = await buildPerceptionDigest({
    repoRoot,
    sourceDir: DEFAULT_PERCEPTION_REPLAY.source_dir,
    ledgerFile: DEFAULT_PERCEPTION_REPLAY.ledger_file,
    now
  });
  const attentionBySource = mapBy(digest.attention_queue, (item) => item.source_id);
  const fingerprintById = mapBy(digest.signal_fingerprints, (fingerprint) => fingerprint.fingerprint_id);
  const publicRisk = fingerprintById.get("signal:policy:farcaster_audit:public_memory_risk");
  const replayFailure = fingerprintById.get("signal:damping:failure_log:candidate_replay_failed");
  const styleMemory = fingerprintById.get("signal:memory:chat_window:user_preference");
  const workflow = fingerprintById.get("signal:skill:chat_window:workflow");
  const publicRiskAttention = attentionBySource.get("shadow-public-memory-risk-001");
  const noiseAttention = attentionBySource.get("shadow-smalltalk-noise-007");

  const checks = [
    checkResult("perception replay stays shadow-only", (
      digest.mode === "shadow-perception-digest"
      && digest.shadow_only === true
      && digest.downstream_contract.role === "sensor_prioritizer_only"
    ), {
      mode: digest.mode,
      shadow_only: digest.shadow_only,
      role: digest.downstream_contract.role
    }),
    checkResult("perception replay keeps Qianxuesen route authority", (
      digest.downstream_contract.route_authority === "qianxuesen"
      && digest.downstream_contract.controller_authority === false
      && digest.safety.changes_route === false
      && digest.safety.changes_winner === false
    ), {
      route_authority: digest.downstream_contract.route_authority,
      controller_authority: digest.downstream_contract.controller_authority,
      changes_route: digest.safety.changes_route,
      changes_winner: digest.safety.changes_winner
    }),
    checkResult("perception replay keeps writes and provider calls off", (
      digest.safety.production_authority === false
      && digest.safety.writes_persistent_memory === false
      && digest.safety.writes_zilliz === false
      && digest.safety.creates_embeddings === false
      && digest.safety.publication_allowed === false
      && digest.safety.llm_api_calls === 0
      && digest.safety.external_api_calls === 0
    ), {
      production_authority: digest.safety.production_authority,
      writes_persistent_memory: digest.safety.writes_persistent_memory,
      writes_zilliz: digest.safety.writes_zilliz,
      creates_embeddings: digest.safety.creates_embeddings,
      publication_allowed: digest.safety.publication_allowed,
      llm_api_calls: digest.safety.llm_api_calls,
      external_api_calls: digest.safety.external_api_calls
    }),
    checkResult("perception replay prioritizes public risk above noise", (
      publicRiskAttention?.priority > noiseAttention?.priority
      && digest.attention_queue[0]?.priority >= publicRiskAttention?.priority
    ), {
      top_attention_source_id: digest.attention_queue[0]?.source_id ?? null,
      top_attention_priority: digest.attention_queue[0]?.priority ?? null,
      public_risk_priority: publicRiskAttention?.priority ?? null,
      noise_priority: noiseAttention?.priority ?? null
    }),
    checkResult("perception replay suppresses repeats and detects recurrence", (
      publicRisk?.ledger_status === "recurring_after_fix"
      && replayFailure?.ledger_status === "damping_repeated_to_case"
      && styleMemory?.ledger_status === "already_processed"
      && workflow?.ledger_status === "seen_with_new_evidence"
    ), {
      public_memory_risk: publicRisk?.ledger_status ?? null,
      candidate_replay_failed: replayFailure?.ledger_status ?? null,
      stable_style_memory: styleMemory?.ledger_status ?? null,
      repeatable_workflow: workflow?.ledger_status ?? null
    }),
    checkResult("perception replay clusters duplicate workflow evidence", (
      digest.duplicate_clusters.some((cluster) => duplicateClusterHas(cluster, [
        "shadow-repeatable-validation-workflow-a-004",
        "shadow-repeatable-validation-workflow-b-005"
      ]))
    ), {
      duplicate_cluster_count: digest.summary.duplicate_cluster_count
    }),
    checkResult("perception replay proposes ledger updates without writing", (
      digest.ledger_update_proposals.length === digest.signal_fingerprints.length
      && digest.ledger_update_proposals.every((proposal) => (
        proposal.no_write === true
        && proposal.authority === "proposal_only"
      ))
    ), {
      signal_fingerprint_count: digest.summary.signal_fingerprint_count,
      ledger_update_proposal_count: digest.summary.ledger_update_proposal_count
    })
  ];

  return {
    mode: "perception-shadow-replay",
    ok: checks.every((check) => check.ok),
    source_dir: DEFAULT_PERCEPTION_REPLAY.source_dir,
    ledger_file: DEFAULT_PERCEPTION_REPLAY.ledger_file,
    top_attention_source_id: digest.attention_queue[0]?.source_id ?? null,
    ledger_statuses: {
      public_memory_risk: publicRisk?.ledger_status ?? null,
      candidate_replay_failed: replayFailure?.ledger_status ?? null,
      stable_style_memory: styleMemory?.ledger_status ?? null,
      repeatable_workflow: workflow?.ledger_status ?? null
    },
    summary: {
      source_count: digest.summary.source_count,
      attention_queue_count: digest.summary.attention_queue_count,
      risk_hint_count: digest.summary.risk_hint_count,
      duplicate_cluster_count: digest.summary.duplicate_cluster_count,
      signal_fingerprint_count: digest.summary.signal_fingerprint_count,
      ledger_update_proposal_count: digest.summary.ledger_update_proposal_count,
      recurring_after_fix_count: digest.summary.recurring_after_fix_count,
      already_processed_count: digest.summary.already_processed_count,
      damping_repeated_to_case_count: digest.summary.damping_repeated_to_case_count
    },
    safety: {
      production_authority: digest.safety.production_authority,
      writes_persistent_memory: digest.safety.writes_persistent_memory,
      writes_zilliz: digest.safety.writes_zilliz,
      creates_embeddings: digest.safety.creates_embeddings,
      publication_allowed: digest.safety.publication_allowed,
      changes_route: digest.safety.changes_route,
      changes_winner: digest.safety.changes_winner,
      llm_api_calls: digest.safety.llm_api_calls,
      external_api_calls: digest.safety.external_api_calls
    },
    checks
  };
}

async function calibrateSampleSet({ repoRoot, sampleSet, now }) {
  const sourceArgs = sourceArgsForSampleSet(sampleSet);
  const memoryReview = await reviewMemoryLayerComparison({ repoRoot, ...sourceArgs });
  const repairTickets = await reviewRepairTickets({
    repoRoot,
    memoryLayerReview: memoryReview,
    now
  });
  const workOrderRouting = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now
  });
  const langGraphBridge = await reviewLangGraphQianxuesenBridge({
    repoRoot,
    workOrderRouting,
    now
  });
  const vectorStorage = buildVectorMemoryStoragePlan({
    workOrderRouting,
    langGraphBridge,
    now
  });
  const retrievalProbe = buildRetrievalProbe(vectorStorage);
  const tournament = await reviewEvolutionTournamentGate({
    repoRoot,
    ...sourceArgs,
    now,
    judgeMode: sampleSet.judge_mode ?? "advise"
  });

  const missingRoutes = missingExpectedRoutes(
    tournament.summary.route_counts,
    sampleSet.expected_routes
  );
  const judgeMismatches = judgeExpectationMismatches(
    tournament.judge_escalation,
    sampleSet.expected_judge
  );
  const liveEffectsAllowed = hasLiveEffects(repairTickets.safety)
    || hasLiveEffects(tournament.safety);

  const checks = [
    checkResult("memory-layer sample review", memoryReview.ok, {
      source_count: memoryReview.layers.l0_sources.source_count,
      route_counts: memoryReview.layers.l2_candidates.route_counts
    }),
    checkResult("minimal-positive keeps non-skill routes out of skill export", (
      memoryReview.minimal_positive_l3.non_skill_promoted_count === 0
      && memoryReview.export_policy.installs_skills === false
      && memoryReview.export_policy.writes_persistent_memory === false
      && memoryReview.export_policy.updates_vps === false
    ), {
      minimal_non_skill_promoted_count: memoryReview.minimal_positive_l3.non_skill_promoted_count
    }),
    checkResult("repair tickets stay local", (
      repairTickets.ok
      && repairTickets.safety.production_authority === false
      && repairTickets.safety.writes_persistent_memory === false
      && repairTickets.safety.updates_vps === false
      && repairTickets.safety.publication_allowed === false
    ), {
      ticket_count: repairTickets.summary.ticket_count,
      highest_severity: repairTickets.summary.highest_severity
    }),
    checkResult("work-order routing mirrors repair tickets", (
      workOrderRouting.ok
      && workOrderRouting.summary.work_order_count === repairTickets.tickets.length
      && workOrderRouting.safety.durable_or_public_effect_allowed === false
    ), {
      work_orders: workOrderRouting.summary.work_order_count,
      auto_executable: workOrderRouting.summary.auto_executable_count,
      routing_mode: workOrderRouting.routing_policy.mode
    }),
    checkResult("retrieval probe keeps requested kind first", retrievalProbe.ok, {
      target_kind: retrievalProbe.target_kind,
      top1_kind: retrievalProbe.top1_kind,
      top1_record_id: retrievalProbe.top1_record_id
    }),
    checkResult("tournament sample review", tournament.ok, {
      tournaments: tournament.summary.tournament_count,
      rejected_variants: tournament.summary.rejected_variant_count,
      quality_score: tournament.quality_assessment.overall_quality_score
    }),
    checkResult("tournament preserves route and safety", (
      winnerRoutePreserved(tournament)
      && tournament.summary.production_authority === false
      && tournament.safety.production_authority === false
      && tournament.safety.publication_allowed === false
      && hasLiveEffects(tournament.safety) === false
      && tournament.control_boundary.llm_route_decision_allowed === false
    ), {
      production_authority: tournament.summary.production_authority,
      llm_route_decision_allowed: tournament.control_boundary.llm_route_decision_allowed
    }),
    checkResult("expected route coverage", missingRoutes.length === 0, {
      missing_routes: missingRoutes,
      route_counts: tournament.summary.route_counts
    }),
    checkResult("expected judge-escalation shape", judgeMismatches.length === 0, {
      mismatches: judgeMismatches,
      recommended: tournament.judge_escalation.recommended,
      near_threshold: tournament.judge_escalation.near_threshold,
      llm_review_value: tournament.judge_escalation.llm_review_value.level,
      llm_api_calls: tournament.judge.llm_api_calls
    }),
    checkResult("no live writes or provider calls", (
      liveEffectsAllowed === false
      && vectorStorage.safety.zilliz_written === false
      && vectorStorage.safety.writes_persistent_memory === false
      && retrievalProbe.safety.zilliz_written === false
      && retrievalProbe.safety.embedding_created === false
      && retrievalProbe.safety.external_api_calls === 0
      && tournament.judge.llm_api_calls === 0
    ), {
      live_effect_allowed: liveEffectsAllowed,
      zilliz_written: vectorStorage.safety.zilliz_written,
      writes_persistent_memory: vectorStorage.safety.writes_persistent_memory,
      embedding_created: retrievalProbe.safety.embedding_created,
      external_api_calls: retrievalProbe.safety.external_api_calls,
      llm_api_calls: tournament.judge.llm_api_calls
    })
  ];

  return {
    sample_set_id: sampleSet.sample_set_id,
    label: sampleSet.label,
    source: {
      source_kind: memoryReview.source.source_kind,
      source_dir: sampleSet.source_dir ?? null,
      vps_raw_dir: sampleSet.vps_raw_dir ?? null,
      source_count: memoryReview.layers.l0_sources.source_count,
      atomic_lesson_count: memoryReview.layers.l1_distillates.atomic_lesson_count,
      route_counts: memoryReview.layers.l2_candidates.route_counts,
      signal_counts: memoryReview.layers.l1_distillates.learning_event_signal_counts,
      route_signal_counts: memoryReview.layers.l2_candidates.route_signal_counts
    },
    repair_ticket: {
      ok: repairTickets.ok,
      ticket_count: repairTickets.summary.ticket_count,
      highest_severity: repairTickets.summary.highest_severity,
      severity_counts: repairTickets.summary.severity_counts,
      repair_candidate_count: repairTickets.summary.repair_candidate_count,
      bad_promotion_count: repairTickets.summary.bad_promotion_count,
      minimal_non_skill_promoted_count: repairTickets.summary.minimal_non_skill_promoted_count
    },
    work_order: {
      ok: workOrderRouting.ok,
      work_order_count: workOrderRouting.summary.work_order_count,
      auto_executable_count: workOrderRouting.summary.auto_executable_count,
      agent_self_review_count: workOrderRouting.summary.agent_self_review_count,
      stronger_model_recommended_count: workOrderRouting.summary.stronger_model_recommended_count,
      routing_mode: workOrderRouting.routing_policy.mode,
      durable_or_public_effect_allowed: workOrderRouting.safety.durable_or_public_effect_allowed
    },
    retrieval_probe: retrievalProbe,
    tournament: {
      ok: tournament.ok,
      source_kind: tournament.source.source_kind,
      tournament_count: tournament.summary.tournament_count,
      variant_count: tournament.summary.variant_count,
      winner_count: tournament.summary.winner_count,
      rejected_variant_count: tournament.summary.rejected_variant_count,
      route_counts: tournament.summary.route_counts,
      winner_strategies: countBy(tournament.winner_queue, (winner) => winner.strategy),
      quality_score: tournament.quality_assessment.overall_quality_score,
      judge_escalation: {
        recommended: tournament.judge_escalation.recommended,
        near_threshold: tournament.judge_escalation.near_threshold,
        score: tournament.judge_escalation.score,
        threshold: tournament.judge_escalation.threshold,
        llm_review_value: tournament.judge_escalation.llm_review_value.level,
        call_policy: tournament.judge_escalation.llm_review_value.call_policy,
        waste_risk: tournament.judge_escalation.llm_review_value.waste_risk,
        reasons: tournament.judge_escalation.reasons
      },
      judge: {
        mode: tournament.judge.mode,
        status: tournament.judge.status,
        llm_api_calls: tournament.judge.llm_api_calls
      },
      production_authority: tournament.summary.production_authority
    },
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effect_allowed: liveEffectsAllowed,
      zilliz_written: vectorStorage.safety.zilliz_written,
      embedding_created: retrievalProbe.safety.embedding_created,
      writes_persistent_memory: vectorStorage.safety.writes_persistent_memory,
      external_api_calls: retrievalProbe.safety.external_api_calls,
      llm_api_calls: tournament.judge.llm_api_calls
    },
    ok: checks.every((check) => check.ok),
    checks
  };
}

function buildSummary(sampleResults) {
  const retrievalPassed = sampleResults.filter((sample) => sample.retrieval_probe.ok).length;
  const retrievalTotal = sampleResults.length;
  return {
    sample_set_count: sampleResults.length,
  source_count: sumBy(sampleResults, (sample) => sample.source.source_count),
    atomic_lesson_count: sumBy(sampleResults, (sample) => sample.source.atomic_lesson_count),
    work_order_count: sumBy(sampleResults, (sample) => sample.work_order.work_order_count),
    repair_ticket_count: sumBy(sampleResults, (sample) => sample.repair_ticket.ticket_count),
    tournament_count: sumBy(sampleResults, (sample) => sample.tournament.tournament_count),
    rejected_variant_count: sumBy(sampleResults, (sample) => sample.tournament.rejected_variant_count),
    retrieval_probe_count: retrievalTotal,
    retrieval_top1_exact_recall: retrievalTotal ? round(retrievalPassed / retrievalTotal) : 0,
    route_counts: aggregateRouteCounts(sampleResults),
    signal_counts: aggregateSignalCounts(sampleResults),
    judge_recommended_count: sampleResults.filter((sample) => sample.tournament.judge_escalation.recommended).length,
    judge_near_threshold_count: sampleResults.filter((sample) => sample.tournament.judge_escalation.near_threshold).length,
    high_value_llm_review_count: sampleResults.filter((sample) => sample.tournament.judge_escalation.llm_review_value === "high").length,
    live_effect_allowed: sampleResults.some((sample) => sample.safety.live_effect_allowed),
    production_authority: false,
    publication_allowed: false,
    zilliz_written: sampleResults.some((sample) => sample.safety.zilliz_written),
    embedding_created: sampleResults.some((sample) => sample.safety.embedding_created),
    writes_persistent_memory: sampleResults.some((sample) => sample.safety.writes_persistent_memory),
    external_api_calls: sumBy(sampleResults, (sample) => sample.safety.external_api_calls),
    llm_api_calls: sumBy(sampleResults, (sample) => sample.safety.llm_api_calls)
  };
}

export async function runCurrentLineCalibration({
  repoRoot = process.cwd(),
  now = DEFAULT_NOW,
  sampleSets = DEFAULT_CALIBRATION_SAMPLE_SETS
} = {}) {
  const resolvedNow = now instanceof Date ? now : new Date(now);
  const sampleResults = [];

  for (const sampleSet of sampleSets) {
    sampleResults.push(await calibrateSampleSet({
      repoRoot,
      sampleSet,
      now: resolvedNow
    }));
  }
  const perceptionReplay = await runPerceptionShadowReplay({
    repoRoot,
    now: resolvedNow
  });

  const sampleChecks = sampleResults.flatMap((sample) => (
    sample.checks.map((check) => ({
      sample_set_id: sample.sample_set_id,
      ...check
    }))
  ));
  const perceptionChecks = perceptionReplay.checks.map((check) => ({
    sample_set_id: "perception_shadow_replay",
    ...check
  }));
  const summary = buildSummary(sampleResults);
  const signalLayers = buildSignalLayerMap(sampleResults, summary, perceptionReplay);
  summary.signal_layer_count = signalLayers.length;
  summary.observed_signal_count = Object.keys(summary.signal_counts).length;
  summary.perception_replay_count = 1;
  summary.perception_replay_ok = perceptionReplay.ok;
  summary.perception_attention_queue_count = perceptionReplay.summary.attention_queue_count;
  summary.perception_duplicate_cluster_count = perceptionReplay.summary.duplicate_cluster_count;
  summary.perception_recurring_after_fix_count = perceptionReplay.summary.recurring_after_fix_count;
  summary.perception_already_processed_count = perceptionReplay.summary.already_processed_count;
  summary.perception_damping_repeated_to_case_count = perceptionReplay.summary.damping_repeated_to_case_count;
  const overallChecks = [
    checkResult("all sample sets passed", sampleResults.every((sample) => sample.ok), {
      failed_sample_sets: sampleResults.filter((sample) => !sample.ok).map((sample) => sample.sample_set_id)
    }),
    checkResult("all retrieval probes exact-match top1", summary.retrieval_top1_exact_recall === 1, {
      retrieval_top1_exact_recall: summary.retrieval_top1_exact_recall
    }),
    checkResult("perception shadow replay passed", perceptionReplay.ok, {
      top_attention_source_id: perceptionReplay.top_attention_source_id,
      duplicate_cluster_count: perceptionReplay.summary.duplicate_cluster_count,
      recurring_after_fix_count: perceptionReplay.summary.recurring_after_fix_count
    }),
    checkResult("shadow mode kept all live effects off", (
      summary.live_effect_allowed === false
      && summary.production_authority === false
      && summary.publication_allowed === false
      && summary.zilliz_written === false
      && summary.embedding_created === false
      && summary.writes_persistent_memory === false
      && summary.external_api_calls === 0
      && summary.llm_api_calls === 0
    ), {
      live_effect_allowed: summary.live_effect_allowed,
      zilliz_written: summary.zilliz_written,
      embedding_created: summary.embedding_created,
      external_api_calls: summary.external_api_calls,
      llm_api_calls: summary.llm_api_calls
    })
  ];
  const checks = [...sampleChecks, ...perceptionChecks, ...overallChecks];

  return {
    schema_version: "misa.current_line_calibration.v1",
    mode: "current-line-calibration",
    ok: checks.every((check) => check.ok),
    created_at: resolvedNow.toISOString(),
    summary,
    signal_layers: signalLayers,
    perception_shadow_replay: perceptionReplay,
    sample_sets: sampleResults,
    checks,
    notes: [
      "Calibration is local shadow-mode only; it reads redacted fixtures and produces a report.",
      "It does not write persistent memory, write Zilliz, create embeddings, call providers, publish, or touch VPS.",
      "The calibration checks route coverage, repair-ticket/work-order routing, retrieval top1 behavior, tournament winners, judge-escalation value, and perception shadow replay."
    ]
  };
}
