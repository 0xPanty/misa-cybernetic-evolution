import {
  runHermesRuntimeAdapter
} from "./hermes-runtime-adapter.mjs";
import {
  buildWorkOrderVariants
} from "./work-order-variants.mjs";
import {
  scoreBaselineWorkOrder,
  scoreVariantWinner
} from "./work-order-quality-eval.mjs";

const DEFAULT_NOW = new Date("2026-05-15T00:00:00Z");

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "hermes-work-order")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 110) || "hermes-work-order";
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function hasAny(values = [], expected = []) {
  const set = new Set(values);
  return expected.some((item) => set.has(item));
}

function severityForCandidate(candidate, sourceEvent) {
  const signals = candidate.pressure_signals ?? [];
  const boundarySignals = [
    "explicit_user_boundary",
    "farcaster_public_memory_risk",
    "persistent_memory_write",
    "public_posting_boundary"
  ];
  if (sourceEvent?.effect_boundary?.persistent_memory_write_requested || hasAny(signals, boundarySignals)) return "P1";
  if (candidate.candidate_type === "skill_variant") return "P2";
  if (candidate.candidate_type === "damping_rule_candidate") return "P2";
  if (candidate.candidate_type === "research_followup") return "P2";
  return "P2";
}

function riskLevelForSeverity(severity) {
  return {
    P0: "critical",
    P1: "high",
    P2: "medium",
    P3: "low"
  }[severity] ?? "medium";
}

function categoryForCandidate(candidate) {
  return {
    skill_variant: "hermes_skill_evolution",
    policy_boundary_variant: "hermes_policy_boundary",
    research_followup: "hermes_research_followup",
    damping_rule_candidate: "hermes_damping"
  }[candidate.candidate_type] ?? "hermes_runtime_signal";
}

function executorForCandidate(candidate, severity) {
  if (severity === "P1" || candidate.target_surface === "policy") {
    return {
      executor_type: "primary_agent",
      label: "Primary agent",
      reason: "The primary agent should turn the Hermes pressure into a bounded patch plan before any durable memory, policy, or skill write."
    };
  }
  if (candidate.target_surface === "skill") {
    return {
      executor_type: "specialized_engineering_agent",
      label: "Specialized engineering agent",
      reason: "The signal concerns a skill variant and should be replayed as a concrete engineering work order."
    };
  }
  return {
    executor_type: "primary_agent",
    label: "Primary agent",
    reason: "The signal is useful runtime evidence; the primary agent can convert it into a bounded follow-up without writing production state."
  };
}

function acceptanceForCandidate(candidate) {
  const common = [
    "the Hermes source event is preserved as a source ref",
    "the work order enters variants before any adoption decision",
    "the selected draft is compared against the baseline work order",
    "safety does not regress: no direct memory write, skill install, public post, external API call, or route change"
  ];
  const evolutionEvidence = candidate.evolution_evidence
    ? ["the frozen baseline snapshot, registered eval dataset, and held-out split stay attached to the replay evidence"]
    : [];
  if (candidate.candidate_type === "skill_variant") {
    return [
      ...common,
      ...evolutionEvidence,
      "the skill change is replayed as a variant instead of being applied directly"
    ];
  }
  if (candidate.candidate_type === "policy_boundary_variant") {
    return [
      ...common,
      ...evolutionEvidence,
      "public/private memory boundaries are explicit before any durable memory change"
    ];
  }
  if (candidate.candidate_type === "research_followup") {
    return [
      ...common,
      ...evolutionEvidence,
      "research evidence is summarized before it can influence skill, policy, or memory candidates"
    ];
  }
  if (candidate.candidate_type === "damping_rule_candidate") {
    return [
      ...common,
      ...evolutionEvidence,
      "the damping rule is tested against at least one replay trace before promotion"
    ];
  }
  return [
    ...common,
    ...evolutionEvidence
  ];
}

function forbiddenScopeForCandidate(candidate) {
  const common = [
    "do not write Hermes memory directly",
    "do not mutate Hermes skills directly",
    "do not publish public output",
    "do not call external APIs",
    "do not change Qianxuesen route, score, or winner authority without deterministic rescore"
  ];
  if (candidate.target_surface === "policy") {
    return [
      ...common,
      "do not turn a single memory-write attempt into permanent policy without replay"
    ];
  }
  return common;
}

function sourceRefsForCandidate(candidate, sourceEvent, digestBySourceEventId) {
  const refs = [];
  for (const sourceId of candidate.source_event_ids ?? []) {
    refs.push({
      kind: "hermes_runtime_event",
      id: sourceId
    });
    const digest = digestBySourceEventId.get(sourceId);
    if (digest) {
      refs.push({
        kind: "hermes_research_digest",
        id: digest.digest_id
      });
    }
  }
  for (const ref of candidate.evidence_refs ?? []) {
    refs.push({
      kind: "hermes_evidence_ref",
      id: ref
    });
  }
  if (candidate.evolution_evidence?.evidence_id) {
    refs.push({
      kind: "hermes_evolution_evidence",
      id: candidate.evolution_evidence.evidence_id
    });
  }
  if (sourceEvent?.source_payload_fingerprint) {
    refs.push({
      kind: "source_payload_fingerprint",
      id: sourceEvent.source_payload_fingerprint.slice(0, 16)
    });
  }
  if (candidate.dedupe_cluster_key) {
    refs.push({
      kind: "dedupe_cluster_key",
      id: candidate.dedupe_cluster_key
    });
  }
  if (candidate.action_identity_fingerprint) {
    refs.push({
      kind: "action_identity_fingerprint",
      id: candidate.action_identity_fingerprint
    });
  }
  return refs;
}

function taskGateForCandidate(candidate, severity) {
  const highRisk = severity === "P1";
  return {
    complex_enough: highRisk || candidate.candidate_type !== "research_followup",
    valuable_enough: true,
    doable_enough: (candidate.evidence_refs ?? []).length > 0 || (candidate.source_event_ids ?? []).length > 0,
    error_discovery_cost: highRisk ? "medium" : "low",
    verdict: highRisk ? "agent_self_review_then_owner_gate_for_durable_write" : "agent_self_review_then_guarded_replay",
    reasons: [
      "Hermes runtime pressure is live operating evidence, not synthetic benchmark noise.",
      "Qianxuesen should convert the signal into replayable work instead of discarding it at the adapter layer.",
      highRisk
        ? "The signal touches memory, policy, or public boundary pressure, so durable writes need a final gate."
        : "The signal can move quickly through agent self-review because durable writes remain blocked."
    ]
  };
}

function modelHandoffForCandidate(candidate, severity) {
  const highRisk = severity === "P1";
  return {
    current_model_fit: highRisk ? "use_for_intake_and_bounded_patch_plan" : "suitable_for_first_pass",
    stronger_model_recommended: false,
    reason: highRisk
      ? "Hermes gives useful self-evolution pressure; the current primary agent can draft the work order, while durable memory or policy writes remain gated."
      : "The work order is bounded and should keep Hermes' evolution advantage by moving directly into replay and variant scoring.",
    stronger_model_slots: highRisk ? ["stronger_model"] : [],
    user_can_override: true
  };
}

function adoptionPolicyForCandidate(candidate, severity) {
  const highRisk = severity === "P1";
  return {
    recommendation_mode: highRisk ? "recommend_with_durable_write_gate" : "guarded_agent_adoption_ready",
    reason: highRisk
      ? "Do not suppress the Hermes signal; let the agent prepare the change, but require an explicit gate before persistent memory, skill, policy, or public effects."
      : "The signal is useful enough to move directly into work-order variants and quality scoring without waiting for a separate planning pass.",
    can_prepare_change_without_owner_roundtrip: true,
    can_write_runtime_state_now: false
  };
}

function workOrderFromHermesCandidate({ candidate, sourceEvent, digestBySourceEventId }) {
  const severity = severityForCandidate(candidate, sourceEvent);
  const riskLevel = riskLevelForSeverity(severity);
  const executor = executorForCandidate(candidate, severity);
  const adoptionPolicy = adoptionPolicyForCandidate(candidate, severity);
  const title = candidate.signal_origin === "runtime_operation_log"
    ? `Hermes boundary anomaly from ${candidate.source_event_ids?.[0] ?? "runtime signal"}`
    : `Hermes ${candidate.candidate_type.replaceAll("_", " ")} from ${candidate.source_event_ids?.[0] ?? "runtime signal"}`;
  const summary = `${candidate.proposed_change} Expected gain: ${candidate.expected_gain}`;

  return {
    work_order_id: `wo-hermes-${stableSlug(candidate.candidate_id)}`,
    title,
    category: categoryForCandidate(candidate),
    severity,
    risk_level: riskLevel,
    status: "pending_agent_review",
    source: {
      source_type: "hermes_runtime_adapter",
      source_id: candidate.candidate_id,
      source_kind: candidate.candidate_type,
      signal_origin: candidate.signal_origin,
      interpretation: candidate.interpretation,
      routing_stream: candidate.routing_stream
    },
    summary,
    source_refs: sourceRefsForCandidate(candidate, sourceEvent, digestBySourceEventId),
    delivery: {
      receiver_type: "primary_agent",
      receiver_label: "Primary agent",
      delivery_policy: "deliver_to_agent_for_review",
      reason: "Hermes runtime pressure should enter the Qianxuesen work-order loop immediately, then be filtered by variants and quality scoring."
    },
    suggested_executor: executor,
    task_gate: taskGateForCandidate(candidate, severity),
    traceability: {
      evidence: {
        candidate_type: candidate.candidate_type,
        target_surface: candidate.target_surface,
        signal_origin: candidate.signal_origin,
        interpretation: candidate.interpretation,
        confidence: candidate.confidence,
        confidence_rule_id: candidate.confidence_rule_id,
        routing_stream: candidate.routing_stream,
        anomaly_rule_version: candidate.anomaly_rule_version,
        anomaly_rule_ids: candidate.anomaly_rule_ids ?? [],
        raw_signal_count: candidate.raw_signal_count ?? 1,
        dedupe_cluster_key: candidate.dedupe_cluster_key,
        action_identity_fingerprint: candidate.action_identity_fingerprint,
        review_outcome: candidate.review_outcome,
        pressure_signals: candidate.pressure_signals ?? [],
        source_event_ids: candidate.source_event_ids ?? [],
        control_decision: sourceEvent?.control_decision,
        ...(candidate.evolution_evidence ? { evolution_evidence: candidate.evolution_evidence } : {}),
        adoption_policy: adoptionPolicy
      },
      reproduction_commands: [
        "npm run hermes:adapt-runtime -- --json",
        "npm run hermes:work-order -- --json --dry-run"
      ],
      acceptance_criteria: acceptanceForCandidate(candidate),
      editable_scope: [
        "Hermes-facing work-order candidate",
        "Qianxuesen replay or scoring candidate",
        `${candidate.target_surface} draft surface`
      ],
      forbidden_scope: forbiddenScopeForCandidate(candidate),
      audit_required: true,
      rollback_required: severity === "P1",
      source_refs_required: true
    },
    execution_policy: {
      requires_user_confirmation: false,
      auto_execute_allowed: false,
      self_evolution_allowed: true,
      agent_self_review_allowed: true,
      agent_may_self_resolve: !adoptionPolicy.can_write_runtime_state_now,
      owner_report_required: severity === "P1",
      durable_or_public_effect_allowed: false,
      experience_capture_mode: "adoption_ledger_candidate",
      default_next_step: adoptionPolicy.recommendation_mode
    },
    human_feedback: {
      outcome: "pending",
      dismissed_reason_code: null,
      feedback_source: "user_explicit_after_review"
    },
    escalation: {
      allowed: true,
      recommended_when: severity === "P1"
        ? "Escalate only if the patch would persist memory, change policy, mutate a production skill, or touch public output."
        : "Escalate only if replay exposes broader behavior risk.",
      stronger_model_slots: severity === "P1" ? ["stronger_model"] : [],
      user_can_decline_execution: true
    },
    model_handoff: modelHandoffForCandidate(candidate, severity),
    hermes_adoption_policy: adoptionPolicy,
    user_prompt: candidate.signal_origin === "runtime_operation_log"
      ? `Hermes produced a boundary anomaly from runtime logs. Review the cluster, avoid duplicate execution, and only request replay if the anomaly is useful.`
      : `Hermes produced a ${candidate.candidate_type} signal. Turn it into a bounded Qianxuesen work order, compare variants, and adopt only if the selected draft beats the baseline without safety regression.`
  };
}

export function buildHermesWorkOrderRouting({
  adapterReport,
  now = DEFAULT_NOW
} = {}) {
  const normalizedBySourceId = new Map((adapterReport?.normalized_events ?? []).map((event) => [event.source_event_id, event]));
  const digestBySourceEventId = new Map();
  for (const digest of adapterReport?.research_digests ?? []) {
    for (const sourceId of digest.source_event_ids ?? []) {
      digestBySourceEventId.set(sourceId, digest);
    }
  }

  const workOrderCandidates = adapterReport?.work_order_stream ?? adapterReport?.evolution_candidates ?? [];
  const workOrders = workOrderCandidates.map((candidate) => {
    const sourceEvent = normalizedBySourceId.get(candidate.source_event_ids?.[0]);
    return workOrderFromHermesCandidate({
      candidate,
      sourceEvent,
      digestBySourceEventId
    });
  });

  return {
    schema_version: "misa.work_order_routing.v1",
    mode: "hermes-work-order-routing",
    ok: adapterReport?.ok === true,
    created_at: asIsoDate(now),
    source_adapter: {
      mode: adapterReport?.mode,
      runtime: adapterReport?.adapter?.runtime,
      runtime_commit: adapterReport?.adapter?.runtime_commit,
      event_count: adapterReport?.summary?.event_count ?? 0,
      evolution_candidate_count: adapterReport?.summary?.evolution_candidate_count ?? 0,
      official_evolution_candidate_count: adapterReport?.summary?.official_evolution_candidate_count ?? 0,
      inferred_evolution_pressure_count: adapterReport?.summary?.inferred_evolution_pressure_count ?? 0,
      boundary_observation_count: adapterReport?.summary?.boundary_observation_count ?? 0,
      observability_stream_count: adapterReport?.summary?.observability_stream_count ?? 0,
      work_order_stream_count: adapterReport?.summary?.work_order_stream_count ?? workOrders.length
    },
    routing_policy: {
      mode: "anomaly_or_explicit_evidence_to_work_order",
      signal_intake: "runtime_operation_logs_default_to_observability; anomaly_or_explicit_evidence_enters_work_order",
      default_delivery: "deliver_to_agent_for_review",
      durable_or_public_effect_policy: "gate_only_at_runtime_write_boundary",
      preserve_hermes_evolution_advantage: true
    },
    summary: {
      work_order_count: workOrders.length,
      source_boundary_observation_count: adapterReport?.summary?.boundary_observation_count ?? 0,
      source_observability_stream_count: adapterReport?.summary?.observability_stream_count ?? 0,
      source_work_order_stream_count: adapterReport?.summary?.work_order_stream_count ?? workOrders.length,
      sidecar_signal_to_noise_ratio: adapterReport?.summary?.sidecar_signal_to_noise_ratio,
      by_category: countBy(workOrders, (order) => order.category),
      by_suggested_executor: countBy(workOrders, (order) => order.suggested_executor.executor_type),
      requires_user_confirmation_count: workOrders.filter((order) => order.execution_policy.requires_user_confirmation).length,
      agent_self_review_count: workOrders.filter((order) => order.execution_policy.agent_self_review_allowed).length,
      owner_report_required_count: workOrders.filter((order) => order.execution_policy.owner_report_required).length,
      guarded_agent_adoption_ready_count: workOrders.filter((order) => (
        order.hermes_adoption_policy.recommendation_mode === "guarded_agent_adoption_ready"
      )).length
    },
    work_orders: workOrders,
    safety: {
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      writes_skills: false,
      durable_or_public_effect_allowed: false,
      changes_route: false,
      changes_winner_authority: false,
      llm_api_calls: adapterReport?.safety?.llm_api_calls ?? 0,
      external_api_calls: adapterReport?.safety?.external_api_calls ?? 0
    },
    warnings: [
      "Runtime operation logs default to observability and do not automatically consume human inbox attention.",
      "Only anomaly-triggered boundary observations or explicit evolution evidence become work orders.",
      "Every work order must pass variants and quality comparison before adoption."
    ]
  };
}

function hasSafetyRegression(score) {
  const safety = score.metrics.safety;
  return Boolean(
    safety.durable_or_public_effect_allowed
      || safety.writes_persistent_memory
      || safety.installs_skills
      || safety.calls_external_api
      || safety.executes_work_orders
  );
}

function buildQualityComparisons({ routing, variants }) {
  const orderResultById = new Map((variants?.work_order_results ?? []).map((item) => [item.work_order_id, item]));
  return (routing?.work_orders ?? []).map((order) => {
    const orderResult = orderResultById.get(order.work_order_id);
    const baseline = scoreBaselineWorkOrder(order);
    const winner = scoreVariantWinner(order, orderResult);
    const delta = round(winner.dimensions.total - baseline.dimensions.total);
    const safetyRegression = hasSafetyRegression(winner);
    const evolutionEvidence = order.traceability?.evidence?.evolution_evidence ?? null;
    return {
      work_order_id: order.work_order_id,
      category: order.category,
      severity: order.severity,
      risk_level: order.risk_level,
      baseline,
      winner,
      delta,
      positive_lift: delta > 0 && !safetyRegression,
      safety_regression: safetyRegression,
      selected_strategy: orderResult?.winner?.strategy,
      evolution_evidence: evolutionEvidence ? {
        evidence_id: evolutionEvidence.evidence_id,
        metric: evolutionEvidence.metric,
        baseline_snapshot_id: evolutionEvidence.baseline_snapshot_id,
        holdout_split_id: evolutionEvidence.holdout_split_id,
        eval_dataset_ref: evolutionEvidence.eval_dataset_ref,
        delta: evolutionEvidence.delta,
        metric_gaming_risk: evolutionEvidence.metric_gaming_risk,
        evidence_quality: evolutionEvidence.evidence_quality,
        advisory_only: evolutionEvidence.advisory_only,
        reason_codes: evolutionEvidence.reason_codes,
        feedback_source: evolutionEvidence.feedback_source,
        llm_inferred: evolutionEvidence.llm_inferred,
        can_support_optimization: evolutionEvidence.can_support_optimization
      } : null,
      adoption_policy: order.hermes_adoption_policy
    };
  });
}

function summarizeQuality(comparisons) {
  const avgDelta = comparisons.length
    ? comparisons.reduce((sum, item) => sum + item.delta, 0) / comparisons.length
    : 0;
  const evolutionEvidence = comparisons
    .map((item) => item.evolution_evidence)
    .filter(Boolean);
  return {
    comparison_count: comparisons.length,
    avg_delta: round(avgDelta),
    positive_lift_rate: comparisons.length
      ? round(comparisons.filter((item) => item.positive_lift).length / comparisons.length)
      : 0,
    safety_regression_count: comparisons.filter((item) => item.safety_regression).length,
    evolution_evidence_count: evolutionEvidence.length,
    supported_optimization_evidence_count: evolutionEvidence.filter((item) => item.can_support_optimization).length,
    avg_evolution_evidence_delta: evolutionEvidence.length
      ? round(evolutionEvidence.reduce((sum, item) => sum + (item.delta ?? 0), 0) / evolutionEvidence.length)
      : 0,
    by_selected_strategy: countBy(comparisons, (item) => item.selected_strategy ?? "none"),
    qianxuesen_fit: {
      high_risk_boundary_count: comparisons.filter((item) => item.risk_level === "high" && item.selected_strategy === "boundary_tightening").length,
      medium_risk_replay_or_compact_count: comparisons.filter((item) => (
        item.risk_level === "medium"
          && ["replay_extension", "compact_handoff", "evidence_expansion"].includes(item.selected_strategy)
      )).length
    }
  };
}

export function buildHermesWorkOrderPipeline({
  adapterReport,
  seed = "hermes-work-order-v1",
  populationSize = 5,
  now = DEFAULT_NOW
} = {}) {
  const routing = buildHermesWorkOrderRouting({
    adapterReport,
    now
  });
  const variants = buildWorkOrderVariants({
    workOrderRouting: routing,
    seed,
    populationSize,
    now
  });
  const comparisons = buildQualityComparisons({
    routing,
    variants
  });
  const qualitySummary = summarizeQuality(comparisons);
  const qualityOk = qualitySummary.comparison_count === 0
    ? true
    : qualitySummary.safety_regression_count === 0
      && qualitySummary.positive_lift_rate === 1;

  return {
    schema_version: "misa.hermes_work_order_pipeline.v1",
    mode: "hermes-work-order",
    ok: routing.ok && variants.ok && qualityOk,
    created_at: asIsoDate(now),
    adapter: adapterReport,
    routing,
    variants,
    quality: {
      summary: qualitySummary,
      comparisons
    },
    adoption_loop: {
      ledger_mode: "candidate_adoption_markers",
      adopted_now_count: 0,
      direct_runtime_write_count: 0,
      useful_signal_count: routing.summary.work_order_count,
      rule: "Hermes signal value is preserved by archiving ordinary boundary observations and producing work orders only for anomaly-triggered or explicit-evidence records."
    },
    safety: {
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      writes_skills: false,
      durable_or_public_effect_allowed: false,
      changes_route: false,
      changes_winner_authority: false,
      llm_api_calls: adapterReport?.safety?.llm_api_calls ?? 0,
      external_api_calls: adapterReport?.safety?.external_api_calls ?? 0
    },
    warnings: [
      "This command produces Hermes-sourced Qianxuesen work orders and selected draft winners.",
      "It intentionally keeps ordinary runtime logs in observability unless an anomaly rule or explicit evidence justifies a work order.",
      "It does not write Hermes memory, mutate skills, publish, call models, or call external APIs."
    ]
  };
}

export async function runHermesWorkOrderPipeline({
  repoRoot = process.cwd(),
  fixtureFile,
  eventLogFile,
  runtime,
  runtimeCommit,
  sourceUrl,
  seed,
  populationSize,
  now = DEFAULT_NOW
} = {}) {
  const adapterReport = await runHermesRuntimeAdapter({
    repoRoot,
    fixtureFile,
    eventLogFile,
    runtime,
    runtimeCommit,
    sourceUrl,
    now
  });
  return buildHermesWorkOrderPipeline({
    adapterReport,
    seed,
    populationSize,
    now
  });
}
