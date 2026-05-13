import { routeWorkOrders } from "./work-order-router.mjs";
import { reviewLangGraphQianxuesenBridge } from "./langgraph-qianxuesen-bridge.mjs";

const COLLECTIONS = [
  {
    collection: "misa_audit_memory",
    kinds: ["audit_log"],
    local_dir: "memory/audit-log",
    authority: "audit_only",
    default_status: "observed",
    can_influence_behavior: false,
    requires_owner_approval: false
  },
  {
    collection: "misa_decision_memory",
    kinds: ["decision_trace"],
    local_dir: "memory/decision-trace",
    authority: "audit_only",
    default_status: "observed",
    can_influence_behavior: false,
    requires_owner_approval: false
  },
  {
    collection: "misa_experience_memory",
    kinds: ["agent_experience_candidate"],
    local_dir: "memory/agent-experience/candidate",
    authority: "candidate",
    default_status: "unverified",
    can_influence_behavior: false,
    requires_owner_approval: false
  },
  {
    collection: "misa_experience_memory",
    kinds: ["agent_experience_promoted"],
    local_dir: "memory/agent-experience/promoted",
    authority: "promoted",
    default_status: "verified",
    can_influence_behavior: true,
    requires_owner_approval: false
  },
  {
    collection: "misa_persona_memory",
    kinds: ["persona_memory_candidate"],
    local_dir: "memory/persona-memory/candidate",
    authority: "candidate",
    default_status: "unverified",
    can_influence_behavior: false,
    requires_owner_approval: true
  },
  {
    collection: "misa_persona_memory",
    kinds: ["persona_memory_promoted"],
    local_dir: "memory/persona-memory/promoted",
    authority: "promoted",
    default_status: "verified",
    can_influence_behavior: true,
    requires_owner_approval: true
  },
  {
    collection: "misa_policy_memory",
    kinds: ["policy_boundary"],
    local_dir: "memory/policy-boundary",
    authority: "policy",
    default_status: "active",
    can_influence_behavior: true,
    requires_owner_approval: true
  },
  {
    collection: "misa_work_order_memory",
    kinds: ["repair_work_order"],
    local_dir: "memory/repair-work-order",
    authority: "candidate",
    default_status: "pending",
    can_influence_behavior: false,
    requires_owner_approval: false
  }
];

const REQUIRED_METADATA_FIELDS = [
  "kind",
  "authority",
  "status",
  "risk_level",
  "source_type",
  "source_id",
  "original_source_kind",
  "original_source_id",
  "original_chunk_hash",
  "created_by",
  "promotion_state",
  "can_influence_behavior",
  "requires_owner_approval",
  "allowed_surfaces",
  "blocked_surfaces",
  "decision_trace_id",
  "original_source",
  "retrieval_trace",
  "retrieval_hints"
];

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function slug(value) {
  return String(value ?? "unknown")
    .replace(/[^a-z0-9_.-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120) || "unknown";
}

function collectionForKind(kind) {
  const match = COLLECTIONS.find((item) => item.kinds.includes(kind));
  if (!match) throw new Error(`Unknown vector memory kind: ${kind}`);
  return match;
}

function inferBlockedSurfacesFromText(values) {
  const text = values.join(" ").toLowerCase();
  const surfaces = [];
  if (/memory|journal|zilliz|persona/.test(text)) surfaces.push("persistent_memory");
  if (/public|publisher|farcaster|discord|mail|post/.test(text)) surfaces.push("public_posting");
  if (/vps|service|runtime|timer|production/.test(text)) surfaces.push("vps_or_runtime_service");
  if (/provider|credential|env|key/.test(text)) surfaces.push("provider_credentials");
  if (/skill/.test(text)) surfaces.push("skill_publication");
  return unique(surfaces);
}

function blockedSurfacesForWorkOrder(order) {
  const explicit = order.action_policy_blocked_surfaces
    ?? order.effect_boundary?.blocked_surfaces
    ?? [];
  return unique([
    ...explicit,
    ...inferBlockedSurfacesFromText([
      ...(order.traceability?.forbidden_scope ?? []),
      order.category,
      order.source?.source_kind ?? ""
    ])
  ]);
}

function normalizeSourceRef(ref = {}) {
  return {
    kind: String(ref.kind ?? "unknown"),
    id: String(ref.id ?? "unknown"),
    note: String(ref.note ?? "")
  };
}

function normalizeOriginalSource(input = {}) {
  const sourceKind = String(input.source_kind ?? input.source_type ?? "unknown");
  const sourceId = String(input.source_id ?? "unknown");
  const sourceRefs = (input.source_refs ?? []).map(normalizeSourceRef);
  return {
    source_system: String(input.source_system ?? "qianxuesen_sidecar"),
    source_kind: sourceKind,
    source_id: sourceId,
    session_id: String(input.session_id ?? "unknown"),
    message_id: String(input.message_id ?? "unknown"),
    artifact_path: String(input.artifact_path ?? "none"),
    chunk_hash: String(input.chunk_hash ?? "none"),
    channel: String(input.channel ?? "local_artifact"),
    actor: String(input.actor ?? "unknown"),
    created_at: String(input.created_at ?? "unknown"),
    redaction_status: String(input.redaction_status ?? "opaque_ref_only"),
    source_refs: sourceRefs.length ? sourceRefs : [
      { kind: sourceKind, id: sourceId, note: "primary source ref" }
    ]
  };
}

function originalSourceFromWorkOrder(order) {
  const refs = (order.source_refs ?? []).map(normalizeSourceRef);
  const primaryEvent = refs.find((ref) => ref.kind === "source_event") ?? refs[0];
  return normalizeOriginalSource({
    source_system: "qianxuesen_sidecar",
    source_kind: order.source?.source_kind ?? primaryEvent?.kind ?? order.source?.source_type ?? "work_order",
    source_id: primaryEvent?.id ?? order.source?.source_id ?? order.work_order_id,
    artifact_path: order.source?.artifact_path ?? "work_order_routing",
    channel: order.source?.channel ?? "local_artifact",
    actor: order.source?.actor ?? "qianxuesen_router",
    created_at: order.created_at ?? "unknown",
    redaction_status: order.source?.redaction_status ?? "opaque_ref_only",
    source_refs: refs
  });
}

function originalSourceFromBridge(langGraphBridge, traceId) {
  const evidenceRefs = (langGraphBridge?.state_projection?.evidence_source_ids ?? [])
    .map((id) => ({ kind: "evidence_source", id, note: "bridge state projection" }));
  return normalizeOriginalSource({
    source_system: "qianxuesen_sidecar",
    source_kind: "langgraph_qianxuesen_bridge",
    source_id: traceId,
    artifact_path: "langgraph_qianxuesen_bridge",
    channel: "local_artifact",
    actor: "qianxuesen_bridge",
    created_at: langGraphBridge?.created_at ?? "unknown",
    redaction_status: "opaque_ref_only",
    source_refs: evidenceRefs
  });
}

function buildRetrievalTrace({ recordId, kind, sourceType, sourceId, decisionTraceId, originalSource }) {
  const sourceHops = [
    {
      stage: "original_source",
      ref_type: originalSource.source_kind,
      ref_id: originalSource.source_id,
      artifact_path: originalSource.artifact_path
    },
    {
      stage: "classification_source",
      ref_type: sourceType,
      ref_id: sourceId,
      artifact_path: "vector_memory_classifier"
    },
    {
      stage: "decision_trace",
      ref_type: "decision_trace",
      ref_id: decisionTraceId,
      artifact_path: "langgraph_qianxuesen_bridge"
    },
    {
      stage: "vector_record",
      ref_type: kind,
      ref_id: recordId,
      artifact_path: "zilliz_adapter_payload"
    }
  ];
  return {
    trace_version: "misa.retrieval_trace.v1",
    replayable: true,
    replay_keys: unique([
      recordId,
      sourceId,
      decisionTraceId,
      originalSource.source_id,
      originalSource.session_id,
      originalSource.message_id,
      originalSource.chunk_hash,
      ...originalSource.source_refs.map((ref) => ref.id)
    ]),
    source_hops: sourceHops
  };
}

function buildRetrievalHints({ kind, collection, metadata }) {
  return {
    filter_keys: [
      "collection",
      "kind",
      "authority",
      "source_type",
      "source_id",
      "decision_trace_id",
      "original_source_kind",
      "original_source_id",
      "original_chunk_hash"
    ],
    boost_terms: unique([
      kind,
      collection,
      metadata.authority,
      metadata.status,
      metadata.risk_level,
      metadata.source_type,
      metadata.original_source_kind,
      ...metadata.allowed_surfaces,
      ...metadata.blocked_surfaces
    ]),
    score_inputs: [
      "vector_similarity",
      "metadata_filter_match",
      "authority_weight",
      "source_recency_weight",
      "trace_path_continuity",
      "blocked_surface_penalty"
    ],
    false_positive_guards: [
      "audit_only_or_candidate_records_cannot_change_behavior",
      "persona_or_policy_records_require_owner_approval",
      "opaque_source_refs_are_required_before_raw_content_lookup"
    ]
  };
}

function metadataForKind(kind, overrides = {}) {
  const contract = collectionForKind(kind);
  const authority = overrides.authority ?? contract.authority;
  const canInfluenceBehavior = overrides.can_influence_behavior ?? contract.can_influence_behavior;
  const originalSource = normalizeOriginalSource({
    source_kind: overrides.source_type ?? "unknown",
    source_id: overrides.source_id ?? "unknown",
    ...overrides.original_source
  });
  return {
    kind,
    authority,
    status: overrides.status ?? contract.default_status,
    risk_level: overrides.risk_level ?? "low",
    source_type: overrides.source_type ?? "unknown",
    source_id: overrides.source_id ?? "unknown",
    original_source_kind: originalSource.source_kind,
    original_source_id: originalSource.source_id,
    original_chunk_hash: originalSource.chunk_hash,
    created_by: overrides.created_by ?? "qianxuesen_vector_memory_classifier",
    promotion_state: overrides.promotion_state ?? (authority === "promoted" || authority === "policy" ? "promoted" : "not_promoted"),
    can_influence_behavior: canInfluenceBehavior,
    requires_owner_approval: overrides.requires_owner_approval ?? contract.requires_owner_approval,
    allowed_surfaces: overrides.allowed_surfaces ?? ["retrieval_context"],
    blocked_surfaces: unique(overrides.blocked_surfaces ?? []),
    decision_trace_id: overrides.decision_trace_id ?? "none",
    original_source: originalSource
  };
}

function recordForKind(kind, {
  recordId,
  title,
  summary,
  metadata
}) {
  const contract = collectionForKind(kind);
  const baseMetadata = metadataForKind(kind, metadata);
  const fullMetadata = {
    ...baseMetadata,
    retrieval_trace: buildRetrievalTrace({
      recordId,
      kind,
      sourceType: baseMetadata.source_type,
      sourceId: baseMetadata.source_id,
      decisionTraceId: baseMetadata.decision_trace_id,
      originalSource: baseMetadata.original_source
    })
  };
  fullMetadata.retrieval_hints = buildRetrievalHints({
    kind,
    collection: contract.collection,
    metadata: fullMetadata
  });
  return {
    record_id: recordId,
    kind,
    collection: contract.collection,
    local_dir: contract.local_dir,
    title,
    summary,
    metadata: fullMetadata
  };
}

function decisionTraceId(langGraphBridge) {
  return langGraphBridge?.decision_bom?.decision_id
    ?? `decision-${slug(langGraphBridge?.created_at ?? "unknown")}`;
}

function recordsFromWorkOrder(order, traceId) {
  const blockedSurfaces = blockedSurfacesForWorkOrder(order);
  const common = {
    risk_level: order.risk_level ?? "low",
    source_type: order.source?.source_type ?? "work_order",
    source_id: order.work_order_id,
    decision_trace_id: traceId,
    original_source: originalSourceFromWorkOrder(order),
    blocked_surfaces: blockedSurfaces
  };
  const records = [
    recordForKind("repair_work_order", {
      recordId: `vm-repair-work-order-${slug(order.work_order_id)}`,
      title: order.title ?? order.work_order_id,
      summary: order.summary ?? "Repair work order generated by Qianxuesen routing.",
      metadata: {
        ...common,
        status: order.status ?? "pending",
        requires_owner_approval: order.execution_policy?.owner_report_required === true
      }
    })
  ];

  if (order.execution_policy?.agent_self_review_allowed) {
    records.push(recordForKind("agent_experience_candidate", {
      recordId: `vm-agent-experience-candidate-${slug(order.work_order_id)}`,
      title: `Candidate experience from ${order.work_order_id}`,
      summary: "Agent self-review may use this as candidate experience, but it cannot become durable behavior until promoted.",
      metadata: {
        ...common,
        status: "unverified",
        allowed_surfaces: ["local_docs", "local_tests", "retrieval_context"],
        requires_owner_approval: order.execution_policy?.owner_report_required === true
      }
    }));
  }

  if (blockedSurfaces.length) {
    records.push(recordForKind("policy_boundary", {
      recordId: `vm-policy-boundary-${slug(order.work_order_id)}`,
      title: `Blocked surfaces for ${order.work_order_id}`,
      summary: "Forbidden surfaces from the work order must stay visible even when bounded local work is allowed.",
      metadata: {
        ...common,
        status: "active",
        allowed_surfaces: ["policy_retrieval", "safety_filter"],
        requires_owner_approval: true
      }
    }));
  }

  return records;
}

function recordsFromLangGraphBridge(langGraphBridge) {
  if (!langGraphBridge) return [];
  const traceId = decisionTraceId(langGraphBridge);
  const blockedSurfaces = langGraphBridge.action_policy_contract?.evaluated_action?.blocked_surfaces ?? [];
  const originalSource = originalSourceFromBridge(langGraphBridge, traceId);
  return [
    recordForKind("decision_trace", {
      recordId: `vm-decision-trace-${slug(traceId)}`,
      title: `Decision trace ${traceId}`,
      summary: `Action policy result: ${langGraphBridge.action_policy_contract?.effective_decision ?? "unknown"}.`,
      metadata: {
        source_type: "langgraph_qianxuesen_bridge",
        source_id: traceId,
        decision_trace_id: traceId,
        original_source: originalSource,
        risk_level: langGraphBridge.summary?.interrupt_count > 0 ? "high" : "low",
        blocked_surfaces: blockedSurfaces
      }
    }),
    recordForKind("audit_log", {
      recordId: `vm-audit-log-${slug(traceId)}`,
      title: `Audit log ${traceId}`,
      summary: "Read-only audit record for work-order routing and action-policy reconstruction.",
      metadata: {
        source_type: "langgraph_qianxuesen_bridge",
        source_id: traceId,
        decision_trace_id: traceId,
        original_source: originalSource,
        risk_level: langGraphBridge.summary?.interrupt_count > 0 ? "high" : "low",
        blocked_surfaces: blockedSurfaces
      }
    })
  ];
}

export function buildVectorMemoryStoragePlan({
  workOrderRouting,
  langGraphBridge,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const traceId = decisionTraceId(langGraphBridge);
  const workOrders = workOrderRouting?.work_orders ?? [];
  const records = [
    ...recordsFromLangGraphBridge(langGraphBridge),
    ...workOrders.flatMap((order) => recordsFromWorkOrder(order, traceId))
  ];

  return {
    schema_version: "misa.vector_memory_storage.v1",
    mode: "vector-memory-storage-classification",
    ok: true,
    created_at: now.toISOString(),
    strategy: {
      backend_target: "zilliz_or_local_vector_store",
      classification_only: true,
      collection_strategy: "few_collections_with_metadata",
      zilliz_written: false,
      external_api_calls: 0,
      writes_persistent_memory: false,
      rule: "Stored vectors are retrieval inventory; only promoted or policy records may influence behavior."
    },
    collections: COLLECTIONS.map((item) => ({ ...item })),
    local_layout: COLLECTIONS.map((item) => ({
      local_dir: item.local_dir,
      collection: item.collection,
      kinds: [...item.kinds]
    })),
    metadata_contract: {
      required_fields: [...REQUIRED_METADATA_FIELDS],
      behavior_authority_rule: "can_influence_behavior=true requires authority=promoted or authority=policy",
      candidate_rule: "candidate records can be retrieved for review but cannot rewrite persona, policy, or production behavior",
      original_source_rule: "Every record carries opaque original-source refs so hits can be traced without exposing raw private content.",
      retrieval_trace_rule: "Every record carries replay keys and source hops for hit explanation and path replay."
    },
    summary: {
      record_count: records.length,
      by_kind: countBy(records, (record) => record.kind),
      by_collection: countBy(records, (record) => record.collection),
      candidate_count: records.filter((record) => record.metadata.authority === "candidate").length,
      promoted_count: records.filter((record) => record.metadata.authority === "promoted").length,
      policy_count: records.filter((record) => record.metadata.authority === "policy").length,
      can_influence_behavior_count: records.filter((record) => record.metadata.can_influence_behavior).length,
      owner_approval_required_count: records.filter((record) => record.metadata.requires_owner_approval).length,
      original_source_count: records.filter((record) => record.metadata.original_source?.source_id !== "unknown").length,
      replayable_trace_count: records.filter((record) => record.metadata.retrieval_trace?.replayable === true).length,
      zilliz_write_count: 0
    },
    records,
    safety: {
      zilliz_written: false,
      external_api_calls: 0,
      writes_persistent_memory: false,
      public_posting_allowed: false,
      provider_or_credential_access_allowed: false,
      vps_or_runtime_touch_allowed: false,
      unpromoted_records_can_influence_behavior: false
    },
    warnings: [
      "This is a storage classification plan, not a vector-store write.",
      "Zilliz storage does not equal promoted memory.",
      "Candidate experience may be retrieved for review, but only promoted or policy records can influence behavior."
    ]
  };
}

export async function reviewVectorMemoryStoragePlan({
  repoRoot = process.cwd(),
  workOrderRouting,
  langGraphBridge,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const routing = workOrderRouting ?? await routeWorkOrders({ repoRoot, now });
  const bridge = langGraphBridge ?? await reviewLangGraphQianxuesenBridge({
    repoRoot,
    workOrderRouting: routing,
    now
  });
  return buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now
  });
}
