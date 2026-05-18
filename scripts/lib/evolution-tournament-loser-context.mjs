function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

const LOSER_REVIEW_RUNTIME_PROFILE = "shadow_advisory";
const MAX_RECALL_TOP_K = 12;
const MAX_PACK_LIMIT = 5;
const MAX_RESERVOIR_LIMIT = 24;

function round(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number.isInteger(value) ? value : fallback;
  return Math.max(min, Math.min(max, number));
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function safeId(value) {
  return String(value ?? "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120) || "unknown";
}

function tokenize(value) {
  return unique(String(value ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}_:-]+/gu) ?? []);
}

function tokenOverlap(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.sqrt(leftTokens.size * rightTokens.size);
}

function variantById(tournament) {
  return new Map((tournament.variants ?? []).map((variant) => [variant.variant_id, variant]));
}

function winnerPrototype(tournament) {
  const variants = variantById(tournament);
  const variant = variants.get(tournament.winner.variant_id);
  return {
    prototype_id: `winner-${safeId(tournament.winner.variant_id)}`,
    role: "winner",
    route_target: tournament.route_target,
    source_event_id: tournament.source_event_id,
    tournament_id: tournament.tournament_id,
    variant_id: tournament.winner.variant_id,
    strategy: tournament.winner.strategy,
    failure_type: null,
    loser_class: null,
    candidate_pool_effect: null,
    rehabilitation_status: null,
    score: tournament.winner.composite_score,
    confidence: tournament.winner.safety_score,
    decay_weight: 1,
    text: [
      tournament.winner.strategy,
      tournament.winner.rationale,
      variant?.proposed_change,
      `route:${tournament.route_target}`
    ].filter(Boolean).join(" ")
  };
}

function loserPrototype(tournament, loser) {
  return {
    prototype_id: `loser-${safeId(loser.variant_id)}`,
    role: "loser",
    route_target: tournament.route_target,
    source_event_id: tournament.source_event_id,
    tournament_id: tournament.tournament_id,
    variant_id: loser.variant_id,
    strategy: null,
    failure_type: loser.failure_type,
    loser_class: loser.loser_class,
    candidate_pool_effect: loser.candidate_pool_effect,
    rehabilitation_status: loser.rehabilitation_record?.status ?? null,
    score: round((loser.confidence ?? 0.5) * (loser.decay_weight ?? 1)),
    confidence: loser.confidence,
    decay_weight: loser.decay_weight,
    text: [
      loser.failure_type,
      loser.loser_class,
      loser.candidate_pool_effect,
      loser.rationale,
      loser.reason,
      ...(loser.blocked_requests ?? []),
      ...(loser.reactivation_conditions ?? [])
    ].filter(Boolean).join(" ")
  };
}

function rehabilitationPrototype(tournament, loser) {
  const record = loser.rehabilitation_record;
  return {
    prototype_id: `rehab-${safeId(loser.variant_id)}`,
    role: "rehabilitation",
    route_target: tournament.route_target,
    source_event_id: tournament.source_event_id,
    tournament_id: tournament.tournament_id,
    variant_id: loser.variant_id,
    strategy: null,
    failure_type: loser.failure_type,
    loser_class: loser.loser_class,
    candidate_pool_effect: loser.candidate_pool_effect,
    rehabilitation_status: record?.status ?? null,
    score: loser.loser_class === "promising" ? 0.78 : loser.loser_class === "weak" ? 0.58 : 0.42,
    confidence: loser.confidence,
    decay_weight: loser.decay_weight,
    text: [
      record?.status,
      record?.review_path,
      ...(record?.required_evidence ?? []),
      ...(record?.reactivation_conditions ?? [])
    ].filter(Boolean).join(" ")
  };
}

function buildPrototypeRecords(tournaments) {
  const records = [];
  for (const tournament of tournaments) {
    records.push(winnerPrototype(tournament));
    for (const loser of tournament.loser_ledger ?? []) {
      records.push(loserPrototype(tournament, loser));
      records.push(rehabilitationPrototype(tournament, loser));
    }
  }
  return records;
}

function buildRouteIndex(prototypes) {
  const routes = unique(prototypes.map((prototype) => prototype.route_target)).sort();
  return routes.map((route) => {
    const scoped = prototypes.filter((prototype) => prototype.route_target === route);
    return {
      route_target: route,
      prototype_count: scoped.length,
      winner_count: scoped.filter((item) => item.role === "winner").length,
      loser_count: scoped.filter((item) => item.role === "loser").length,
      rehabilitation_count: scoped.filter((item) => item.role === "rehabilitation").length,
      failure_types: unique(scoped.map((item) => item.failure_type)).sort(),
      candidate_pool_effects: unique(scoped.map((item) => item.candidate_pool_effect)).sort(),
      index_authority: "route_scoped_lookup_only"
    };
  });
}

function reservoirKey(prototype) {
  return [
    prototype.route_target,
    prototype.role,
    prototype.failure_type ?? prototype.strategy ?? prototype.rehabilitation_status ?? "general",
    prototype.candidate_pool_effect ?? "none"
  ].join(":");
}

function buildReservoir(prototypes, limit = MAX_RESERVOIR_LIMIT) {
  const bestByKey = new Map();
  for (const prototype of prototypes) {
    const key = reservoirKey(prototype);
    const existing = bestByKey.get(key);
    if (!existing || prototype.score > existing.score || (
      prototype.score === existing.score && prototype.prototype_id.localeCompare(existing.prototype_id) < 0
    )) {
      bestByKey.set(key, prototype);
    }
  }
  return [...bestByKey.values()]
    .sort((left, right) => right.score - left.score || left.prototype_id.localeCompare(right.prototype_id))
    .slice(0, limit)
    .map((prototype, index) => ({
      reservoir_rank: index + 1,
      prototype_id: prototype.prototype_id,
      role: prototype.role,
      route_target: prototype.route_target,
      failure_type: prototype.failure_type,
      candidate_pool_effect: prototype.candidate_pool_effect,
      rehabilitation_status: prototype.rehabilitation_status,
      score: prototype.score
    }));
}

function queryForTournament(tournament) {
  return [
    tournament.route_target,
    tournament.source_event_id,
    tournament.winner.strategy,
    ...(tournament.loser_ledger ?? []).flatMap((loser) => [
      loser.failure_type,
      loser.loser_class,
      loser.candidate_pool_effect,
      ...(loser.blocked_requests ?? []),
      ...(loser.reactivation_conditions ?? [])
    ])
  ].filter(Boolean).join(" ");
}

function recallPrototypes({ tournament, prototypes, topK = 12 }) {
  const query = queryForTournament(tournament);
  return prototypes
    .map((prototype) => {
      const lexical = tokenOverlap(query, prototype.text);
      const routeBoost = prototype.route_target === tournament.route_target ? 0.2 : 0;
      const sourceBoost = prototype.source_event_id === tournament.source_event_id ? 0.08 : 0;
      const roleBoost = prototype.role === "loser" ? 0.08 : prototype.role === "rehabilitation" ? 0.06 : 0.04;
      return {
        prototype_id: prototype.prototype_id,
        role: prototype.role,
        route_target: prototype.route_target,
        source_event_id: prototype.source_event_id,
        tournament_id: prototype.tournament_id,
        variant_id: prototype.variant_id,
        failure_type: prototype.failure_type,
        loser_class: prototype.loser_class,
        candidate_pool_effect: prototype.candidate_pool_effect,
        rehabilitation_status: prototype.rehabilitation_status,
        vector_score: round(lexical),
        final_score: round(Math.min(1, lexical + routeBoost + sourceBoost + roleBoost)),
        match_reasons: unique([
          prototype.route_target === tournament.route_target ? "same_route" : null,
          prototype.source_event_id === tournament.source_event_id ? "same_source" : null,
          prototype.failure_type ? `failure:${prototype.failure_type}` : null,
          prototype.role
        ])
      };
    })
    .sort((left, right) => (
      right.final_score - left.final_score
      || left.role.localeCompare(right.role)
      || left.prototype_id.localeCompare(right.prototype_id)
    ))
    .slice(0, topK)
    .map((item, index) => ({ rank: index + 1, ...item }));
}

function diversifiedPack(recalled, limit = 5) {
  const selected = [];
  const seenKeys = new Set();
  const requiredRoles = ["loser", "winner", "rehabilitation"];
  const tryAdd = (item) => {
    if (!item || selected.some((selectedItem) => selectedItem.prototype_id === item.prototype_id)) return;
    const key = `${item.role}:${item.route_target}:${item.failure_type ?? item.candidate_pool_effect ?? item.prototype_id}`;
    if (seenKeys.has(key) && selected.length >= requiredRoles.length) return;
    selected.push(item);
    seenKeys.add(key);
  };

  for (const role of requiredRoles) {
    tryAdd(recalled.find((item) => item.role === role));
  }
  for (const item of recalled) {
    if (selected.length >= limit) break;
    tryAdd(item);
  }

  return selected.slice(0, limit).map((item, index) => ({
    pack_rank: index + 1,
    prototype_id: item.prototype_id,
    role: item.role,
    route_target: item.route_target,
    failure_type: item.failure_type,
    candidate_pool_effect: item.candidate_pool_effect,
    rehabilitation_status: item.rehabilitation_status,
    final_score: item.final_score,
    match_reasons: item.match_reasons
  }));
}

function perturbationChecks(packed) {
  const losers = packed.filter((item) => item.role === "loser");
  return losers.map((item) => {
    const hasReentry = ["contextual_alternative", "evidence_required_before_reentry"].includes(item.candidate_pool_effect);
    const decisionStable = item.failure_type === "safety_boundary"
      ? item.candidate_pool_effect === "strong_suppression"
      : item.candidate_pool_effect !== "strong_suppression";
    return {
      prototype_id: item.prototype_id,
      perturbation_family: "deterministic_paraphrase_boundary",
      expected_behavior: item.failure_type === "safety_boundary"
        ? "keep_strong_review_pressure"
        : "keep_reentry_path_open",
      stable_under_surface_change: decisionStable,
      reentry_path_preserved: hasReentry,
      model_api_calls: 0
    };
  });
}

function strongReviewSamples(packed, limit = 3) {
  return packed
    .filter((item) => (
      item.role === "loser"
      && (
        item.failure_type !== "safety_boundary"
        || item.candidate_pool_effect === "contextual_alternative"
      )
    ))
    .sort((left, right) => right.final_score - left.final_score || left.prototype_id.localeCompare(right.prototype_id))
    .slice(0, limit)
    .map((item, index) => ({
      sample_rank: index + 1,
      prototype_id: item.prototype_id,
      review_reason: item.failure_type === "safety_boundary"
        ? "verify blocked surface is still real before reentry"
        : "check whether loser pressure is over-holding a useful variant",
      target: "l4_counterexample_calibration",
      llm_api_calls: 0,
      authority: "critique_only"
    }));
}

function l3L4Plan({ tournament, packed, weakPerturbations, strongSamples }) {
  const safetyCount = packed.filter((item) => item.failure_type === "safety_boundary").length;
  const rehabCount = packed.filter((item) => item.role === "rehabilitation").length;
  const evidenceCount = packed.filter((item) => item.candidate_pool_effect === "evidence_required_before_reentry").length;
  return {
    tournament_id: tournament.tournament_id,
    route_target: tournament.route_target,
    l3_gate: {
      consumption: "pressure_to_review_requirements",
      required_actions: unique([
        safetyCount > 0 ? "prove_blocked_surfaces_removed_before_reentry" : null,
        evidenceCount > 0 ? "request_new_source_or_better_trace" : null,
        rehabCount > 0 ? "preserve_rehabilitation_path" : null
      ]),
      may_change_winner: false,
      may_filter_candidate: false
    },
    l4_context: {
      consumption: "top_k_diversified_counterexamples",
      packed_context_count: packed.length,
      review_sample_count: strongSamples.length,
      weak_perturbation_count: weakPerturbations.length,
      final_judgment_retained_by_l4: true,
      may_change_route: false,
      may_write_memory: false
    }
  };
}

function buildDeploymentReadiness({ runtimeProfile, topK, packLimit, reservoirLimit, releaseBlockers }) {
  const safeToConsume = releaseBlockers.length === 0;
  return {
    schema_version: "misa.loser_review_deployment_readiness.v1",
    status: safeToConsume ? "release_candidate_shadow_advisory" : "blocked",
    requested_runtime_profile: runtimeProfile,
    runtime_profile: LOSER_REVIEW_RUNTIME_PROFILE,
    safe_to_consume: safeToConsume,
    release_blockers: releaseBlockers,
    allowed_surfaces: [
      "local_tournament_gate",
      "l3_review_requirements",
      "l4_counterexample_context"
    ],
    blocked_surfaces: [
      "candidate_hard_filter",
      "winner_change",
      "route_change",
      "memory_write",
      "zilliz_write",
      "embedding_provider_call",
      "llm_provider_call",
      "vps_mutation",
      "public_publish"
    ],
    feature_flags: {
      enable_context: "MISA_LOSER_REVIEW_CONTEXT=1",
      hard_filter: "MISA_LOSER_HARD_FILTER=0",
      vector_write: "MISA_LOSER_VECTOR_WRITE=0",
      model_calls: "MISA_LOSER_MODEL_CALLS=0"
    },
    kill_switch: {
      env: "MISA_LOSER_REVIEW_CONTEXT=0",
      behavior: "disable downstream consumption of loser_review_context; tournament winners and routes stay unchanged"
    },
    rollback: {
      strategy: "disable_context_consumption_or_revert_loser_review_context_field",
      state_to_recover: "winner_queue, tournaments, and experience_ledger are independent of loser_review_context",
      data_migration_required: false
    },
    operational_limits: {
      max_recall_top_k: MAX_RECALL_TOP_K,
      active_recall_top_k: topK,
      max_counterexample_pack: MAX_PACK_LIMIT,
      active_counterexample_pack: packLimit,
      max_reservoir_items: MAX_RESERVOIR_LIMIT,
      active_reservoir_items: reservoirLimit,
      external_api_call_budget: 0,
      llm_api_call_budget: 0,
      zilliz_write_budget: 0
    },
    health_checks: [
      "npm run validate:schemas",
      "node --test --test-concurrency=1 test/evolution-tournament.test.mjs",
      "npm test",
      "npm run precheck"
    ],
    canary_plan: {
      mode: "observe_only",
      compare_against: "existing_tournament_gate_without_context_consumption",
      rollback_trigger: "any nonzero live effect, winner change, route change, provider call, or schema violation"
    }
  };
}

export function buildLoserReviewContext({
  tournaments,
  experienceLedger,
  now = new Date(),
  runtimeProfile = LOSER_REVIEW_RUNTIME_PROFILE,
  topK = MAX_RECALL_TOP_K,
  packLimit = MAX_PACK_LIMIT,
  reservoirLimit = MAX_RESERVOIR_LIMIT
} = {}) {
  const boundedTopK = boundedInteger(topK, MAX_RECALL_TOP_K, 1, MAX_RECALL_TOP_K);
  const boundedPackLimit = boundedInteger(packLimit, MAX_PACK_LIMIT, 1, MAX_PACK_LIMIT);
  const boundedReservoirLimit = boundedInteger(reservoirLimit, MAX_RESERVOIR_LIMIT, 1, MAX_RESERVOIR_LIMIT);
  const releaseBlockers = [];
  if (runtimeProfile !== LOSER_REVIEW_RUNTIME_PROFILE) {
    releaseBlockers.push(`unsupported_runtime_profile:${runtimeProfile}`);
  }
  if (boundedTopK !== topK) {
    releaseBlockers.push("recall_top_k_was_outside_release_bounds");
  }
  if (boundedPackLimit !== packLimit) {
    releaseBlockers.push("counterexample_pack_limit_was_outside_release_bounds");
  }
  if (boundedReservoirLimit !== reservoirLimit) {
    releaseBlockers.push("reservoir_limit_was_outside_release_bounds");
  }
  const prototypes = buildPrototypeRecords(tournaments ?? []);
  const routeIndex = buildRouteIndex(prototypes);
  const reservoir = buildReservoir(prototypes, boundedReservoirLimit);
  const perTournament = (tournaments ?? []).map((tournament) => {
    const recalled = recallPrototypes({ tournament, prototypes, topK: boundedTopK });
    const packed = diversifiedPack(recalled, boundedPackLimit);
    const weakPerturbations = perturbationChecks(packed);
    const strongSamples = strongReviewSamples(packed);
    return {
      tournament_id: tournament.tournament_id,
      query: queryForTournament(tournament),
      recall: {
        backend: "local-token-prototype-recall-v1",
        vector_lookup_required: false,
        embedding_created: false,
        zilliz_written: false,
        top_k: boundedTopK,
        recalled_count: recalled.length,
        hits: recalled
      },
      diversified_counterexample_pack: {
        policy: "role_route_failure_diversity",
        limit: boundedPackLimit,
        packed_count: packed.length,
        items: packed
      },
      weak_model_perturbation: {
        mode: "deterministic_weak_perturbation",
        model_api_calls: 0,
        sample_count: weakPerturbations.length,
        stable_count: weakPerturbations.filter((item) => item.stable_under_surface_change).length,
        checks: weakPerturbations
      },
      strong_model_sampling: {
        mode: "high_dispute_l4_sampling_plan",
        llm_api_calls: 0,
        sample_count: strongSamples.length,
        samples: strongSamples
      },
      l3_l4_consumption: l3L4Plan({
        tournament,
        packed,
        weakPerturbations,
        strongSamples
      })
    };
  });
  const packedItems = perTournament.flatMap((item) => item.diversified_counterexample_pack.items);
  const weakChecks = perTournament.flatMap((item) => item.weak_model_perturbation.checks);
  const strongSamples = perTournament.flatMap((item) => item.strong_model_sampling.samples);

  return {
    schema_version: "misa.loser_review_context.v1",
    mode: "loser-review-context",
    created_at: now.toISOString(),
    ok: releaseBlockers.length === 0,
    summary: {
      tournament_count: perTournament.length,
      prototype_count: prototypes.length,
      reservoir_count: reservoir.length,
      route_index_count: routeIndex.length,
      packed_counterexample_count: packedItems.length,
      weak_perturbation_sample_count: weakChecks.length,
      strong_review_sample_count: strongSamples.length,
      experience_ledger_count: (experienceLedger ?? []).length,
      by_role: countBy(prototypes, (item) => item.role),
      by_failure_type: countBy(prototypes.filter((item) => item.failure_type), (item) => item.failure_type)
    },
    capabilities_landed: [
      "winner_loser_vector_prototype_recall",
      "route_specific_loser_index",
      "top_k_diversified_counterexample_packing",
      "winner_loser_rehabilitation_joint_recall",
      "loser_reservoir_prototype_compression",
      "weak_model_perturbation_harness_zero_call",
      "strong_model_high_dispute_sampling_plan_zero_call",
      "l3_l4_consumption_plan"
    ],
    route_specific_loser_index: routeIndex,
    prototype_reservoir: reservoir,
    tournaments: perTournament,
    safety: {
      advisory_only: true,
      hard_filter_allowed: false,
      changes_winner: false,
      changes_route: false,
      writes_memory: false,
      writes_zilliz: false,
      embedding_created: false,
      external_api_calls: 0,
      llm_api_calls: 0,
      touches_vps: false,
      publishes_publicly: false
    },
    deployment_readiness: buildDeploymentReadiness({
      runtimeProfile,
      topK: boundedTopK,
      packLimit: boundedPackLimit,
      reservoirLimit: boundedReservoirLimit,
      releaseBlockers
    }),
    warnings: [
      "Prototype recall is local token recall only; it is not semantic authority.",
      "L3 may convert loser pressure into review requirements, but it cannot filter candidates.",
      "L4 receives packed context and sampling targets; final judgment stays outside this advisory layer."
    ]
  };
}
