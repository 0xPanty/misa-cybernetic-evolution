const DEFAULT_TOP_K = 8;
const DEFAULT_MIN_PRIMARY_SCORE = 0.35;

export const VECTOR_MEMORY_KIND_PROFILES = [
  {
    kind: "audit_log",
    collection: "misa_audit_memory",
    authority: "audit_only",
    intent_terms: ["audit", "audit log", "log", "审计", "日志"],
    support_kinds: ["decision_trace", "repair_work_order", "policy_boundary"]
  },
  {
    kind: "decision_trace",
    collection: "misa_decision_memory",
    authority: "audit_only",
    intent_terms: ["decision", "decision trace", "trace", "why decided", "决策", "路径", "回溯"],
    support_kinds: ["audit_log", "repair_work_order", "policy_boundary"]
  },
  {
    kind: "agent_experience_candidate",
    collection: "misa_experience_memory",
    authority: "candidate",
    intent_terms: ["experience", "candidate experience", "agent experience", "经验", "候选经验"],
    support_kinds: ["agent_experience_promoted", "decision_trace", "audit_log", "repair_work_order"]
  },
  {
    kind: "agent_experience_promoted",
    collection: "misa_experience_memory",
    authority: "promoted",
    intent_terms: ["verified experience", "promoted experience", "stable experience", "已验证经验", "正式经验"],
    support_kinds: ["agent_experience_candidate", "decision_trace", "audit_log", "policy_boundary"]
  },
  {
    kind: "persona_memory_candidate",
    collection: "misa_persona_memory",
    authority: "candidate",
    intent_terms: ["persona candidate", "style candidate", "persona", "候选人格", "风格候选"],
    support_kinds: ["persona_memory_promoted", "decision_trace", "audit_log", "policy_boundary"]
  },
  {
    kind: "persona_memory_promoted",
    collection: "misa_persona_memory",
    authority: "promoted",
    intent_terms: ["persona memory", "stable style", "promoted persona", "人格记忆", "稳定风格"],
    support_kinds: ["persona_memory_candidate", "decision_trace", "audit_log", "policy_boundary"]
  },
  {
    kind: "policy_boundary",
    collection: "misa_policy_memory",
    authority: "policy",
    intent_terms: ["policy", "boundary", "blocked", "forbidden", "approval", "safe surface", "策略", "边界", "禁止", "审批"],
    support_kinds: ["repair_work_order", "decision_trace", "audit_log"]
  },
  {
    kind: "repair_work_order",
    collection: "misa_work_order_memory",
    authority: "candidate",
    intent_terms: ["repair", "work order", "repair work order", "fix", "ticket", "修复", "工单", "维修单"],
    support_kinds: ["policy_boundary", "decision_trace", "audit_log"]
  }
];

const KIND_PROFILE_BY_KIND = new Map(VECTOR_MEMORY_KIND_PROFILES.map((profile) => [profile.kind, profile]));
const KNOWN_KINDS = VECTOR_MEMORY_KIND_PROFILES.map((profile) => profile.kind);

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function kindProfile(kind) {
  return KIND_PROFILE_BY_KIND.get(kind);
}

function collectionForKind(kind) {
  return kindProfile(kind)?.collection ?? "unknown";
}

function quotedList(values) {
  return `[${values.map((value) => `"${value}"`).join(", ")}]`;
}

function zillizKindExpression(kinds) {
  return kinds.length === 1
    ? `kind == "${kinds[0]}"`
    : `kind in ${quotedList(kinds)}`;
}

function zillizCollectionExpression(collections) {
  return collections.length === 1
    ? `collection == "${collections[0]}"`
    : `collection in ${quotedList(collections)}`;
}

function zillizFilterExpression({ kinds = [], collections = [] }) {
  return [
    kinds.length ? zillizKindExpression(kinds) : "",
    collections.length ? zillizCollectionExpression(collections) : ""
  ].filter(Boolean).join(" && ");
}

function surfaceFromQuery(query) {
  const text = normalizeText(query);
  if (/repair|work order|ticket|fix|修复|工单/.test(text)) return "repair_planning";
  if (/policy|boundary|blocked|forbidden|approval|策略|边界|禁止|审批/.test(text)) return "policy_check";
  if (/persona|style|人格|风格/.test(text)) return "persona_context";
  if (/behavior|answer|reply|行为|回答|回复/.test(text)) return "answer_context";
  return "retrieval_context";
}

function scoreKindTerms(query, profile) {
  const text = normalizeText(query);
  return profile.intent_terms.reduce((score, term) => {
    const normalized = normalizeText(term);
    if (!normalized) return score;
    if (text.includes(normalized)) {
      return score + (normalized.includes(" ") || /[\u4e00-\u9fff]/u.test(normalized) ? 2 : 1);
    }
    return score;
  }, 0);
}

export function inferVectorMemoryQueryIntent({
  query = "",
  requestedKind,
  requestedSurface
} = {}) {
  if (requestedKind) {
    if (!KNOWN_KINDS.includes(requestedKind)) {
      throw new Error(`Unknown vector memory kind: ${requestedKind}`);
    }
    return {
      requested_kind: requestedKind,
      requested_surface: requestedSurface ?? surfaceFromQuery(query),
      explicit_kind: true,
      confidence: 1,
      reason: "requested_kind_argument"
    };
  }

  const scoredKinds = VECTOR_MEMORY_KIND_PROFILES
    .map((profile) => ({
      kind: profile.kind,
      score: scoreKindTerms(query, profile)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind));

  const winner = scoredKinds[0];
  return {
    requested_kind: winner?.kind ?? null,
    requested_surface: requestedSurface ?? surfaceFromQuery(query),
    explicit_kind: false,
    confidence: winner ? Math.min(0.95, 0.45 + winner.score * 0.2) : 0.2,
    reason: winner ? "query_terms" : "no_clear_kind_terms"
  };
}

function primaryKindsForIntent(intent) {
  return intent.requested_kind ? [intent.requested_kind] : [...KNOWN_KINDS];
}

function supportKindsForIntent(intent) {
  const requested = intent.requested_kind;
  if (!requested) return [];
  return kindProfile(requested)?.support_kinds ?? [];
}

function buildSameSourceFilterTemplate(kinds) {
  if (!kinds.length) return "";
  return [
    "(",
    "original_source_id == $original_source_id",
    " || source_id == $source_id",
    " || decision_trace_id == $decision_trace_id",
    ") && ",
    zillizKindExpression(kinds)
  ].join("");
}

export function buildVectorMemoryRetrievalPlan({
  query = "",
  requestedKind,
  requestedSurface,
  topK = DEFAULT_TOP_K,
  minPrimaryScore = DEFAULT_MIN_PRIMARY_SCORE
} = {}) {
  const intent = inferVectorMemoryQueryIntent({ query, requestedKind, requestedSurface });
  const primaryKinds = primaryKindsForIntent(intent);
  const supportKinds = supportKindsForIntent(intent);
  const primaryCollections = unique(primaryKinds.map(collectionForKind));
  const fallbackKinds = unique([...primaryKinds, ...supportKinds]);
  const fallbackCollections = unique(fallbackKinds.map(collectionForKind));
  const kindLocked = intent.explicit_kind || intent.confidence >= 0.65;

  return {
    schema_version: "misa.vector_retrieval_plan.v1",
    query_intent: intent,
    kind_locked: kindLocked,
    min_primary_score: minPrimaryScore,
    phases: [
      {
        phase: "primary_kind_search",
        purpose: "Search the requested memory shelf first, so a same-source sibling cannot steal the main answer.",
        required: kindLocked,
        top_k: topK,
        filter: {
          kinds: primaryKinds,
          collections: primaryCollections
        },
        zilliz_filter: zillizFilterExpression({
          kinds: primaryKinds,
          collections: primaryCollections
        })
      },
      {
        phase: "same_source_context_search",
        purpose: "After the primary hit is found, pull sibling records from the same source for explanation and safety context.",
        required: false,
        top_k: Math.max(3, Math.ceil(topK / 2)),
        only_after: "primary_kind_search",
        filter: {
          same_source_from: "top_primary_hit",
          kinds: supportKinds,
          collections: unique(supportKinds.map(collectionForKind))
        },
        zilliz_filter_template: buildSameSourceFilterTemplate(supportKinds)
      },
      {
        phase: "global_fallback_search",
        purpose: "Use broader semantic search only when no primary-kind hit clears the minimum score.",
        required: false,
        top_k: topK,
        only_if: "no_primary_kind_hit_above_min_primary_score",
        filter: {
          kinds: fallbackKinds,
          collections: fallbackCollections
        },
        zilliz_filter: zillizFilterExpression({
          kinds: fallbackKinds,
          collections: fallbackCollections
        })
      }
    ],
    hard_rules: [
      "When kind_locked=true and a primary-kind hit clears min_primary_score, primary hits rank before same-source context hits.",
      "Same-source context may explain a hit, but it cannot override the requested kind.",
      "Audit-only and candidate hits may provide context; they cannot authorize behavior changes.",
      "If provenance is missing or not replayable, keep the hit searchable but lower confidence."
    ]
  };
}

export function buildVectorRetrievalStrategy({ topK = DEFAULT_TOP_K } = {}) {
  return {
    strategy_version: "misa.vector_retrieval_strategy.v1",
    default_top_k: topK,
    primary_rule: "Infer or receive the requested memory kind, then search that kind/collection before global semantic search.",
    same_source_rule: "Use original_source_id, source_id, and decision_trace_id to attach sibling context after the primary result is known.",
    fallback_rule: "Only widen to related kinds when no primary-kind candidate clears the minimum score.",
    kind_profiles: VECTOR_MEMORY_KIND_PROFILES.map((profile) => ({
      kind: profile.kind,
      collection: profile.collection,
      authority: profile.authority,
      support_kinds: [...profile.support_kinds]
    })),
    ranking_inputs: [
      "vector_similarity",
      "kind_intent_match",
      "query_phase_priority",
      "same_source_context_match",
      "authority_weight",
      "trace_path_continuity",
      "surface_guard"
    ],
    hard_rules: [
      "kind filter runs before same-source rerank for explicit or high-confidence queries",
      "same-source context cannot outrank a valid primary-kind hit",
      "global fallback is diagnostic, not the default answer path",
      "candidate and audit records remain non-authoritative"
    ],
    safety: {
      dry_run: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      live_writer_included: false
    }
  };
}

function metadataForHit(hit) {
  return hit.metadata ?? hit.record?.metadata ?? hit.entity?.metadata ?? {};
}

function textForHit(hit) {
  const metadata = metadataForHit(hit);
  return [
    hit.text,
    hit.title,
    hit.record?.text,
    hit.record?.title,
    metadata.title,
    metadata.kind,
    metadata.source_id,
    metadata.original_source_id
  ].filter(Boolean).join(" ");
}

function scoreForHit(hit) {
  const value = hit.score ?? hit.vector_score ?? hit.similarity;
  if (Number.isFinite(value)) return Math.max(0, Math.min(1, Number(value)));
  if (Number.isFinite(hit.distance)) return Math.max(0, Math.min(1, 1 - Number(hit.distance)));
  return 0;
}

function sourceKeysForHit(hit) {
  const metadata = metadataForHit(hit);
  return unique([
    metadata.original_source_id,
    metadata.source_id,
    metadata.decision_trace_id,
    metadata.original_source?.source_id,
    metadata.original_source?.chunk_hash,
    ...(metadata.retrieval_trace?.replay_keys ?? [])
  ].map((value) => String(value ?? "")).filter((value) => value && value !== "unknown" && value !== "none"));
}

function hasSharedSource(left, right) {
  if (!left || !right) return false;
  const rightKeys = new Set(sourceKeysForHit(right));
  return sourceKeysForHit(left).some((key) => rightKeys.has(key));
}

function traceQuality(metadata) {
  const hops = metadata.retrieval_trace?.source_hops ?? [];
  let score = 0;
  if (metadata.retrieval_trace?.replayable === true) score += 0.04;
  if (Array.isArray(hops) && hops.length >= 4) score += 0.04;
  if ((metadata.retrieval_trace?.replay_keys ?? []).includes(metadata.record_id)) score += 0.02;
  if (metadata.original_source_id && metadata.original_source_id !== "unknown") score += 0.03;
  return score;
}

function authorityWeight(metadata, requestedSurface) {
  const authority = metadata.authority;
  if (requestedSurface === "policy_check") {
    if (authority === "policy") return 0.12;
    if (authority === "promoted") return 0.06;
    return 0;
  }
  if (requestedSurface === "repair_planning") {
    if (metadata.kind === "repair_work_order") return 0.12;
    if (authority === "policy") return 0.04;
    return 0;
  }
  if (requestedSurface === "persona_context") {
    if (metadata.kind === "persona_memory_promoted") return 0.12;
    if (metadata.kind === "persona_memory_candidate") return 0.04;
    return 0;
  }
  if (requestedSurface === "answer_context") {
    if (authority === "promoted" || authority === "policy") return 0.08;
    return 0;
  }
  return authority === "promoted" || authority === "policy" ? 0.04 : 0;
}

function lexicalIntentMatch(query, hit, intent) {
  const text = normalizeText(textForHit(hit));
  const queryText = normalizeText(query);
  const profile = intent.requested_kind ? kindProfile(intent.requested_kind) : null;
  const terms = profile?.intent_terms ?? [];
  const termMatch = terms.some((term) => text.includes(normalizeText(term)) || queryText.includes(normalizeText(term)));
  return termMatch ? 0.04 : 0;
}

function surfaceGuard(metadata, requestedSurface) {
  const blocked = metadata.blocked_surfaces ?? [];
  if (requestedSurface === "policy_check" && metadata.kind === "policy_boundary") return 0.05;
  if (requestedSurface === "answer_context" && blocked.includes("public_posting")) return -0.04;
  if (requestedSurface === "repair_planning" && metadata.kind === "policy_boundary") return -0.03;
  return 0;
}

function explainBucket(bucket) {
  if (bucket === 0) return "primary_kind";
  if (bucket === 1) return "same_source_context";
  if (bucket === 2) return "fallback";
  return "filtered_or_low_confidence";
}

export function rankVectorMemoryHits({
  query = "",
  hits = [],
  requestedKind,
  requestedSurface,
  minPrimaryScore = DEFAULT_MIN_PRIMARY_SCORE,
  topK = DEFAULT_TOP_K
} = {}) {
  const queryPlan = buildVectorMemoryRetrievalPlan({
    query,
    requestedKind,
    requestedSurface,
    minPrimaryScore,
    topK
  });
  const intent = queryPlan.query_intent;
  const primaryKinds = new Set(primaryKindsForIntent(intent));
  const supportKinds = new Set(supportKindsForIntent(intent));
  const normalizedHits = hits.map((hit, index) => ({
    ...hit,
    _input_rank: index,
    _metadata: metadataForHit(hit),
    _vector_score: scoreForHit(hit)
  }));
  const primaryAnchor = normalizedHits
    .filter((hit) => primaryKinds.has(hit._metadata.kind) && hit._vector_score >= minPrimaryScore)
    .sort((left, right) => right._vector_score - left._vector_score || left._input_rank - right._input_rank)[0];
  const kindLocked = queryPlan.kind_locked && Boolean(primaryAnchor);

  const scored = normalizedHits.map((hit) => {
    const metadata = hit._metadata;
    const isPrimaryKind = primaryKinds.has(metadata.kind);
    const sameSource = primaryAnchor ? hasSharedSource(hit, primaryAnchor) : false;
    const isSupportKind = supportKinds.has(metadata.kind);
    const sameSourceSupport = isSupportKind && sameSource;
    const bucket = kindLocked
      ? (isPrimaryKind ? 0 : sameSourceSupport ? 1 : 3)
      : (isPrimaryKind ? 0 : sameSourceSupport ? 1 : 2);
    const scoreParts = {
      vector_similarity: hit._vector_score,
      kind_intent_match: isPrimaryKind ? 0.34 : sameSourceSupport ? 0.08 : -0.18,
      query_phase_priority: bucket === 0 ? 0.18 : bucket === 1 ? 0.06 : bucket === 2 ? 0 : -0.2,
      same_source_context_match: sameSource ? 0.12 : 0,
      authority_weight: authorityWeight(metadata, intent.requested_surface),
      trace_path_continuity: traceQuality(metadata),
      lexical_intent_match: lexicalIntentMatch(query, hit, intent),
      surface_guard: surfaceGuard(metadata, intent.requested_surface)
    };
    const finalScore = Object.values(scoreParts).reduce((sum, value) => sum + value, 0);

    return {
      record_id: hit.record_id ?? metadata.record_id,
      kind: metadata.kind,
      authority: metadata.authority,
      source_id: metadata.source_id,
      original_source_id: metadata.original_source_id,
      decision_trace_id: metadata.decision_trace_id,
      vector_score: hit._vector_score,
      final_score: Number(finalScore.toFixed(6)),
      rank_bucket: explainBucket(bucket),
      score_parts: scoreParts,
      can_influence_behavior: metadata.can_influence_behavior === true,
      requires_owner_approval: metadata.requires_owner_approval === true,
      trace_replayable: metadata.retrieval_trace?.replayable === true,
      trace_hop_count: metadata.retrieval_trace?.source_hops?.length ?? 0,
      filtered: bucket === 3,
      filter_reason: bucket === 3 ? "outside requested kind and not same-source support" : null,
      _bucket: bucket,
      _input_rank: hit._input_rank
    };
  });

  const rankedHits = scored
    .filter((hit) => !hit.filtered)
    .sort((left, right) => left._bucket - right._bucket || right.final_score - left.final_score || left._input_rank - right._input_rank)
    .slice(0, topK)
    .map(({ _bucket, _input_rank, ...hit }, index) => ({
      rank: index + 1,
      ...hit
    }));
  const filteredOut = scored
    .filter((hit) => hit.filtered)
    .map(({ _bucket, _input_rank, ...hit }) => hit);

  return {
    schema_version: "misa.vector_retrieval_ranker.v1",
    mode: "vector-retrieval-ranker-dry-run",
    ok: true,
    query,
    query_intent: intent,
    query_plan: queryPlan,
    summary: {
      input_hit_count: hits.length,
      ranked_hit_count: rankedHits.length,
      filtered_hit_count: filteredOut.length,
      primary_kind_hit_count: rankedHits.filter((hit) => primaryKinds.has(hit.kind)).length,
      same_source_context_count: rankedHits.filter((hit) => hit.rank_bucket === "same_source_context").length,
      top1_kind_match: intent.requested_kind ? rankedHits[0]?.kind === intent.requested_kind : null,
      top1_record_id: rankedHits[0]?.record_id ?? null
    },
    ranked_hits: rankedHits,
    filtered_out: filteredOut,
    safety: {
      dry_run: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      live_writer_included: false
    }
  };
}

function makeTrace(recordId, sourceId, decisionTraceId) {
  return {
    trace_version: "misa.retrieval_trace.v1",
    replayable: true,
    replay_keys: [recordId, sourceId, decisionTraceId],
    source_hops: [
      { stage: "original_source", ref_type: "redacted_sample", ref_id: sourceId, artifact_path: "test_fixture" },
      { stage: "classification_source", ref_type: "work_order", ref_id: sourceId, artifact_path: "vector_memory_classifier" },
      { stage: "decision_trace", ref_type: "decision_trace", ref_id: decisionTraceId, artifact_path: "langgraph_qianxuesen_bridge" },
      { stage: "vector_record", ref_type: "vector_record", ref_id: recordId, artifact_path: "zilliz_adapter_payload" }
    ]
  };
}

function makeScenarioHit({ recordId, kind, sourceId, decisionTraceId, score, authority, title }) {
  const profile = kindProfile(kind);
  const resolvedAuthority = authority ?? profile?.authority ?? "candidate";
  return {
    record_id: recordId,
    score,
    text: title,
    metadata: {
      record_id: recordId,
      title,
      kind,
      collection: profile?.collection ?? "unknown",
      authority: resolvedAuthority,
      source_id: sourceId,
      original_source_id: sourceId,
      decision_trace_id: decisionTraceId,
      original_source: {
        source_id: sourceId,
        chunk_hash: `chunk-${sourceId}`
      },
      blocked_surfaces: kind === "policy_boundary" ? ["persistent_memory", "public_posting"] : [],
      can_influence_behavior: ["promoted", "policy"].includes(resolvedAuthority),
      requires_owner_approval: kind.includes("persona") || kind === "policy_boundary",
      retrieval_trace: makeTrace(recordId, sourceId, decisionTraceId)
    }
  };
}

export function defaultVectorRetrievalEvaluationScenarios() {
  return [
    {
      scenario_id: "repair_order_beats_same_source_policy",
      query: "What repair work order came from distill-window-alpha?",
      expected_top1_kind: "repair_work_order",
      expected_top1_record_id: "alpha-repair",
      hits: [
        makeScenarioHit({ recordId: "alpha-policy", kind: "policy_boundary", sourceId: "distill-window-alpha", decisionTraceId: "trace-alpha", score: 0.91, title: "Blocked surfaces for alpha repair" }),
        makeScenarioHit({ recordId: "alpha-repair", kind: "repair_work_order", sourceId: "distill-window-alpha", decisionTraceId: "trace-alpha", score: 0.62, title: "Repair work order for alpha distillation" }),
        makeScenarioHit({ recordId: "alpha-audit", kind: "audit_log", sourceId: "distill-window-alpha", decisionTraceId: "trace-alpha", score: 0.7, title: "Audit log alpha" }),
        makeScenarioHit({ recordId: "beta-policy", kind: "policy_boundary", sourceId: "public-posting-beta", decisionTraceId: "trace-beta", score: 0.88, title: "Unrelated public posting boundary" })
      ]
    },
    {
      scenario_id: "policy_boundary_beats_same_source_repair",
      query: "Which policy boundary blocks public posting for provider-timeout-beta?",
      expected_top1_kind: "policy_boundary",
      expected_top1_record_id: "beta-policy",
      hits: [
        makeScenarioHit({ recordId: "beta-repair", kind: "repair_work_order", sourceId: "provider-timeout-beta", decisionTraceId: "trace-beta", score: 0.84, title: "Repair work order for provider timeout" }),
        makeScenarioHit({ recordId: "beta-policy", kind: "policy_boundary", sourceId: "provider-timeout-beta", decisionTraceId: "trace-beta", score: 0.66, title: "Policy boundary for provider timeout" }),
        makeScenarioHit({ recordId: "beta-decision", kind: "decision_trace", sourceId: "provider-timeout-beta", decisionTraceId: "trace-beta", score: 0.69, title: "Decision trace beta" }),
        makeScenarioHit({ recordId: "gamma-repair", kind: "repair_work_order", sourceId: "persona-style-gamma", decisionTraceId: "trace-gamma", score: 0.82, title: "Unrelated repair" })
      ]
    },
    {
      scenario_id: "decision_trace_beats_audit_log",
      query: "Show the decision trace for scheduler rollback gamma.",
      expected_top1_kind: "decision_trace",
      expected_top1_record_id: "gamma-decision",
      hits: [
        makeScenarioHit({ recordId: "gamma-audit", kind: "audit_log", sourceId: "scheduler-rollback-gamma", decisionTraceId: "trace-gamma", score: 0.89, title: "Audit log gamma" }),
        makeScenarioHit({ recordId: "gamma-decision", kind: "decision_trace", sourceId: "scheduler-rollback-gamma", decisionTraceId: "trace-gamma", score: 0.71, title: "Decision trace gamma" }),
        makeScenarioHit({ recordId: "gamma-policy", kind: "policy_boundary", sourceId: "scheduler-rollback-gamma", decisionTraceId: "trace-gamma", score: 0.72, title: "Policy boundary gamma" }),
        makeScenarioHit({ recordId: "delta-audit", kind: "audit_log", sourceId: "public-reply-delta", decisionTraceId: "trace-delta", score: 0.86, title: "Unrelated audit" })
      ]
    },
    {
      scenario_id: "audit_log_beats_decision_trace",
      query: "Find the audit log for public reply delta.",
      expected_top1_kind: "audit_log",
      expected_top1_record_id: "delta-audit",
      hits: [
        makeScenarioHit({ recordId: "delta-decision", kind: "decision_trace", sourceId: "public-reply-delta", decisionTraceId: "trace-delta", score: 0.87, title: "Decision trace delta" }),
        makeScenarioHit({ recordId: "delta-audit", kind: "audit_log", sourceId: "public-reply-delta", decisionTraceId: "trace-delta", score: 0.68, title: "Audit log delta" }),
        makeScenarioHit({ recordId: "delta-policy", kind: "policy_boundary", sourceId: "public-reply-delta", decisionTraceId: "trace-delta", score: 0.72, title: "Policy boundary delta" }),
        makeScenarioHit({ recordId: "alpha-decision", kind: "decision_trace", sourceId: "distill-window-alpha", decisionTraceId: "trace-alpha", score: 0.85, title: "Unrelated decision" })
      ]
    },
    {
      scenario_id: "promoted_experience_beats_candidate_sibling",
      query: "Use the verified experience for recovery workflow epsilon.",
      requestedKind: "agent_experience_promoted",
      expected_top1_kind: "agent_experience_promoted",
      expected_top1_record_id: "epsilon-exp-promoted",
      hits: [
        makeScenarioHit({ recordId: "epsilon-exp-candidate", kind: "agent_experience_candidate", sourceId: "recovery-workflow-epsilon", decisionTraceId: "trace-epsilon", score: 0.91, title: "Candidate experience epsilon" }),
        makeScenarioHit({ recordId: "epsilon-exp-promoted", kind: "agent_experience_promoted", sourceId: "recovery-workflow-epsilon", decisionTraceId: "trace-epsilon", score: 0.64, title: "Promoted experience epsilon" }),
        makeScenarioHit({ recordId: "epsilon-audit", kind: "audit_log", sourceId: "recovery-workflow-epsilon", decisionTraceId: "trace-epsilon", score: 0.7, title: "Audit log epsilon" }),
        makeScenarioHit({ recordId: "beta-exp-candidate", kind: "agent_experience_candidate", sourceId: "provider-timeout-beta", decisionTraceId: "trace-beta", score: 0.86, title: "Unrelated candidate experience" })
      ]
    },
    {
      scenario_id: "persona_memory_beats_policy_noise",
      query: "Fetch the stable style persona memory for owner tone zeta.",
      expected_top1_kind: "persona_memory_promoted",
      expected_top1_record_id: "zeta-persona-promoted",
      hits: [
        makeScenarioHit({ recordId: "zeta-policy", kind: "policy_boundary", sourceId: "owner-tone-zeta", decisionTraceId: "trace-zeta", score: 0.9, title: "Policy boundary zeta" }),
        makeScenarioHit({ recordId: "zeta-persona-promoted", kind: "persona_memory_promoted", sourceId: "owner-tone-zeta", decisionTraceId: "trace-zeta", score: 0.61, title: "Promoted persona memory zeta" }),
        makeScenarioHit({ recordId: "zeta-persona-candidate", kind: "persona_memory_candidate", sourceId: "owner-tone-zeta", decisionTraceId: "trace-zeta", score: 0.8, title: "Candidate persona memory zeta" }),
        makeScenarioHit({ recordId: "delta-policy", kind: "policy_boundary", sourceId: "public-reply-delta", decisionTraceId: "trace-delta", score: 0.88, title: "Unrelated policy" })
      ]
    }
  ];
}

export function evaluateVectorRetrievalScenarios({
  scenarios = defaultVectorRetrievalEvaluationScenarios(),
  topK = DEFAULT_TOP_K
} = {}) {
  const results = scenarios.map((scenario) => {
    const ranking = rankVectorMemoryHits({
      query: scenario.query,
      requestedKind: scenario.requestedKind,
      requestedSurface: scenario.requestedSurface,
      hits: scenario.hits,
      topK
    });
    const top1 = ranking.ranked_hits[0];
    const top3 = ranking.ranked_hits.slice(0, 3);
    return {
      scenario_id: scenario.scenario_id,
      source_count: unique(scenario.hits.map((hit) => metadataForHit(hit).original_source_id)).length,
      expected_top1_kind: scenario.expected_top1_kind,
      expected_top1_record_id: scenario.expected_top1_record_id,
      top1_kind: top1?.kind ?? null,
      top1_record_id: top1?.record_id ?? null,
      top1_kind_match: top1?.kind === scenario.expected_top1_kind,
      top1_exact_match: top1?.record_id === scenario.expected_top1_record_id,
      top3_contains_expected: top3.some((hit) => hit.record_id === scenario.expected_top1_record_id),
      filtered_hit_count: ranking.summary.filtered_hit_count,
      ranking
    };
  });
  const top1ExactMatches = results.filter((result) => result.top1_exact_match).length;
  const top1KindMatches = results.filter((result) => result.top1_kind_match).length;
  const top3ExpectedMatches = results.filter((result) => result.top3_contains_expected).length;
  const sourceIds = unique(scenarios.flatMap((scenario) => scenario.hits.map((hit) => metadataForHit(hit).original_source_id)));

  return {
    schema_version: "misa.vector_retrieval_eval.v1",
    mode: "vector-retrieval-ranker-eval",
    ok: top1ExactMatches === results.length && top1KindMatches === results.length && top3ExpectedMatches === results.length,
    summary: {
      scenario_count: results.length,
      unique_source_count: sourceIds.length,
      top1_exact_recall: results.length ? top1ExactMatches / results.length : 0,
      top1_kind_precision: results.length ? top1KindMatches / results.length : 0,
      top3_expected_recall: results.length ? top3ExpectedMatches / results.length : 0,
      noise_top1_wrong_kind_count: results.length - top1KindMatches
    },
    results,
    safety: {
      dry_run: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      live_writer_included: false
    }
  };
}
