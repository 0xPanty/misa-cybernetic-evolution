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
  "created_by",
  "promotion_state",
  "can_influence_behavior",
  "requires_owner_approval",
  "allowed_surfaces",
  "blocked_surfaces",
  "decision_trace_id"
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

function metadataForKind(kind, overrides = {}) {
  const contract = collectionForKind(kind);
  const authority = overrides.authority ?? contract.authority;
  const canInfluenceBehavior = overrides.can_influence_behavior ?? contract.can_influence_behavior;
  return {
    kind,
    authority,
    status: overrides.status ?? contract.default_status,
    risk_level: overrides.risk_level ?? "low",
    source_type: overrides.source_type ?? "unknown",
    source_id: overrides.source_id ?? "unknown",
    created_by: overrides.created_by ?? "qianxuesen_vector_memory_classifier",
    promotion_state: overrides.promotion_state ?? (authority === "promoted" || authority === "policy" ? "promoted" : "not_promoted"),
    can_influence_behavior: canInfluenceBehavior,
    requires_owner_approval: overrides.requires_owner_approval ?? contract.requires_owner_approval,
    allowed_surfaces: overrides.allowed_surfaces ?? ["retrieval_context"],
    blocked_surfaces: unique(overrides.blocked_surfaces ?? []),
    decision_trace_id: overrides.decision_trace_id ?? "none"
  };
}

function recordForKind(kind, {
  recordId,
  title,
  summary,
  metadata
}) {
  const contract = collectionForKind(kind);
  return {
    record_id: recordId,
    kind,
    collection: contract.collection,
    local_dir: contract.local_dir,
    title,
    summary,
    metadata: metadataForKind(kind, metadata)
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
  return [
    recordForKind("decision_trace", {
      recordId: `vm-decision-trace-${slug(traceId)}`,
      title: `Decision trace ${traceId}`,
      summary: `Action policy result: ${langGraphBridge.action_policy_contract?.effective_decision ?? "unknown"}.`,
      metadata: {
        source_type: "langgraph_qianxuesen_bridge",
        source_id: traceId,
        decision_trace_id: traceId,
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
      candidate_rule: "candidate records can be retrieved for review but cannot rewrite persona, policy, or production behavior"
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
