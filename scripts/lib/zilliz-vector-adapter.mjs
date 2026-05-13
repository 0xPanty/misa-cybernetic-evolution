import { reviewVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";
import { buildVectorRetrievalStrategy } from "./vector-retrieval-ranker.mjs";

const DEFAULT_VECTOR_DIMENSION = 768;
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_METRIC_TYPE = "COSINE";

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

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function groupBy(values, selector) {
  const groups = new Map();
  for (const value of values) {
    const key = selector(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-12T00:00:00Z").toISOString() : date.toISOString();
}

function semanticRoleForKind(kind) {
  const roles = {
    audit_log: {
      role: "audit-only execution log",
      primary_for: "audit lookup and evidence reconstruction",
      not_primary_for: "repair planning, policy enforcement, persona memory"
    },
    decision_trace: {
      role: "decision-path trace",
      primary_for: "explaining why a routing or control decision happened",
      not_primary_for: "repair work order execution, policy enforcement"
    },
    agent_experience_candidate: {
      role: "unverified agent experience candidate",
      primary_for: "reviewing possible reusable agent experience",
      not_primary_for: "authoritative behavior change until promoted"
    },
    agent_experience_promoted: {
      role: "verified promoted agent experience",
      primary_for: "stable behavior guidance and answer context",
      not_primary_for: "policy boundary replacement"
    },
    persona_memory_candidate: {
      role: "unverified persona memory candidate",
      primary_for: "owner-reviewed style or preference candidate",
      not_primary_for: "automatic persona change"
    },
    persona_memory_promoted: {
      role: "verified persona memory",
      primary_for: "stable owner style or preference retrieval",
      not_primary_for: "policy or repair work order retrieval"
    },
    policy_boundary: {
      role: "policy and safety boundary",
      primary_for: "blocked surface, approval, and safety checks",
      not_primary_for: "repair work order retrieval"
    },
    repair_work_order: {
      role: "repair work order",
      primary_for: "repair planning, follow-up work, and bug-fix task retrieval",
      not_primary_for: "policy boundary retrieval"
    }
  };
  return roles[kind] ?? {
    role: "vector memory record",
    primary_for: "retrieval context",
    not_primary_for: "unknown"
  };
}

function compactText(record) {
  const metadata = record.metadata ?? {};
  const role = semanticRoleForKind(record.kind);
  return [
    `Memory kind: ${record.kind}.`,
    `Retrieval role: ${role.role}.`,
    `Primary for: ${role.primary_for}.`,
    `Not primary for: ${role.not_primary_for}.`,
    `Authority: ${metadata.authority ?? "unknown"}.`,
    `Collection: ${record.collection}.`,
    `Original source id: ${metadata.original_source_id ?? "unknown"}.`,
    record.title,
    record.summary
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function metadataFieldPlan() {
  return [
    { name: "kind", type: "VarChar", max_length: 96 },
    { name: "authority", type: "VarChar", max_length: 32 },
    { name: "status", type: "VarChar", max_length: 64 },
    { name: "risk_level", type: "VarChar", max_length: 32 },
    { name: "source_type", type: "VarChar", max_length: 96 },
    { name: "source_id", type: "VarChar", max_length: 256 },
    { name: "original_source_kind", type: "VarChar", max_length: 96 },
    { name: "original_source_id", type: "VarChar", max_length: 256 },
    { name: "original_chunk_hash", type: "VarChar", max_length: 128 },
    { name: "created_by", type: "VarChar", max_length: 128 },
    { name: "promotion_state", type: "VarChar", max_length: 32 },
    { name: "can_influence_behavior", type: "Bool" },
    { name: "requires_owner_approval", type: "Bool" },
    { name: "allowed_surfaces", type: "JSON" },
    { name: "blocked_surfaces", type: "JSON" },
    { name: "decision_trace_id", type: "VarChar", max_length: 256 },
    { name: "original_source", type: "JSON" },
    { name: "retrieval_trace", type: "JSON" },
    { name: "retrieval_hints", type: "JSON" }
  ];
}

function buildCollectionPlans(vectorMemoryStorage, { vectorDimension, metricType, embeddingModel }) {
  const groupedRecords = groupBy(vectorMemoryStorage.records ?? [], (record) => record.collection);
  const groupedContracts = groupBy(vectorMemoryStorage.collections ?? [], (item) => item.collection);
  const collectionNames = unique([
    ...(vectorMemoryStorage.collections ?? []).map((item) => item.collection),
    ...(vectorMemoryStorage.records ?? []).map((record) => record.collection)
  ]).sort();

  return collectionNames.map((collection) => {
    const contracts = groupedContracts.get(collection) ?? [];
    const records = groupedRecords.get(collection) ?? [];
    return {
      collection,
      description: "Qianxuesen vector memory adapter collection.",
      vector: {
        field: "embedding",
        type: "FloatVector",
        dimension: vectorDimension,
        metric_type: metricType,
        embedding_model: embeddingModel,
        embedding_required: true,
        embedding_created: false
      },
      primary_key: {
        field: "record_id",
        type: "VarChar",
        max_length: 256
      },
      text_field: {
        field: "text",
        type: "VarChar",
        max_length: 8192
      },
      metadata_field: {
        field: "metadata",
        type: "JSON",
        required_fields: [...REQUIRED_METADATA_FIELDS]
      },
      scalar_fields: metadataFieldPlan(),
      dynamic_metadata_allowed: true,
      kinds: unique([
        ...contracts.flatMap((contract) => contract.kinds ?? []),
        ...records.map((record) => record.kind)
      ]).sort(),
      local_dirs: unique([
        ...contracts.map((contract) => contract.local_dir),
        ...records.map((record) => record.local_dir)
      ]).sort(),
      record_count: records.length
    };
  });
}

function toUpsertRecord(record) {
  return {
    record_id: record.record_id,
    collection: record.collection,
    text: compactText(record),
    embedding: null,
    embedding_status: "not_created",
    embedding_required: true,
    metadata: {
      ...record.metadata,
      record_id: record.record_id,
      title: record.title,
      local_dir: record.local_dir
    }
  };
}

function buildUpsertBatches(records) {
  return [...groupBy(records, (record) => record.collection).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([collection, collectionRecords]) => ({
      collection,
      record_count: collectionRecords.length,
      zilliz_written: false,
      embedding_created: false,
      records: collectionRecords.map(toUpsertRecord)
    }));
}

function metadataViolations(records, collectionNames) {
  const violations = [];

  for (const record of records) {
    const metadata = record.metadata ?? {};
    const missing = REQUIRED_METADATA_FIELDS.filter((field) => !(field in metadata));
    if (missing.length) {
      violations.push({
        record_id: record.record_id,
        check: "required_metadata_fields",
        reason: `missing metadata fields: ${missing.join(", ")}`
      });
    }

    if (["audit_only", "candidate"].includes(metadata.authority) && metadata.can_influence_behavior !== false) {
      violations.push({
        record_id: record.record_id,
        check: "candidate_or_audit_cannot_influence_behavior",
        reason: "audit_only and candidate records must keep can_influence_behavior=false"
      });
    }

    if (metadata.can_influence_behavior === true && !["promoted", "policy"].includes(metadata.authority)) {
      violations.push({
        record_id: record.record_id,
        check: "behavior_authority",
        reason: "behavior influence requires authority=promoted or authority=policy"
      });
    }

    if (!metadata.original_source || metadata.original_source.source_id === "unknown") {
      violations.push({
        record_id: record.record_id,
        check: "original_source",
        reason: "record must carry an opaque original_source with a replayable source_id"
      });
    }

    if (!metadata.retrieval_trace?.replayable || !Array.isArray(metadata.retrieval_trace.source_hops) || metadata.retrieval_trace.source_hops.length < 2) {
      violations.push({
        record_id: record.record_id,
        check: "retrieval_trace",
        reason: "record must carry a replayable retrieval_trace with source hops"
      });
    }

    if (!metadata.retrieval_trace?.replay_keys?.includes(record.record_id)) {
      violations.push({
        record_id: record.record_id,
        check: "retrieval_trace",
        reason: "retrieval_trace replay_keys must include the vector record_id"
      });
    }

    if (!collectionNames.has(record.collection)) {
      violations.push({
        record_id: record.record_id,
        check: "collection_declared",
        reason: `collection ${record.collection} is not declared in the vector memory plan`
      });
    }

    if (!compactText(record)) {
      violations.push({
        record_id: record.record_id,
        check: "text_payload",
        reason: "record must have title or summary text before embedding"
      });
    }
  }

  return violations;
}

function metadataChecks(records, collectionNames) {
  const violations = metadataViolations(records, collectionNames);
  return [
    {
      check: "required_metadata_fields",
      ok: !violations.some((item) => item.check === "required_metadata_fields"),
      violations: violations.filter((item) => item.check === "required_metadata_fields")
    },
    {
      check: "behavior_authority",
      ok: !violations.some((item) => ["candidate_or_audit_cannot_influence_behavior", "behavior_authority"].includes(item.check)),
      violations: violations.filter((item) => ["candidate_or_audit_cannot_influence_behavior", "behavior_authority"].includes(item.check))
    },
    {
      check: "collection_and_text_payload",
      ok: !violations.some((item) => ["collection_declared", "text_payload"].includes(item.check)),
      violations: violations.filter((item) => ["collection_declared", "text_payload"].includes(item.check))
    },
    {
      check: "original_source_and_retrieval_trace",
      ok: !violations.some((item) => ["original_source", "retrieval_trace"].includes(item.check)),
      violations: violations.filter((item) => ["original_source", "retrieval_trace"].includes(item.check))
    }
  ];
}

export function buildZillizVectorAdapterPlan({
  vectorMemoryStorage,
  vectorDimension = DEFAULT_VECTOR_DIMENSION,
  metricType = DEFAULT_METRIC_TYPE,
  embeddingModel = DEFAULT_EMBEDDING_MODEL,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  if (!vectorMemoryStorage) {
    throw new Error("vectorMemoryStorage is required");
  }

  const records = vectorMemoryStorage.records ?? [];
  const collectionNames = new Set((vectorMemoryStorage.collections ?? []).map((item) => item.collection));
  const checks = metadataChecks(records, collectionNames);
  const violations = checks.flatMap((check) => check.violations);
  const collectionPlans = buildCollectionPlans(vectorMemoryStorage, {
    vectorDimension,
    metricType,
    embeddingModel
  });
  const upsertBatches = buildUpsertBatches(records);
  const retrievalStrategy = buildVectorRetrievalStrategy();

  return {
    schema_version: "misa.zilliz_vector_adapter.v1",
    mode: "zilliz-vector-adapter-dry-run",
    ok: vectorMemoryStorage.ok === true && violations.length === 0,
    created_at: asIsoDate(now),
    adapter: {
      target_backend: "zilliz",
      execution_mode: "dry_run",
      collection_strategy: vectorMemoryStorage.strategy?.collection_strategy ?? "few_collections_with_metadata",
      vector_dimension: vectorDimension,
      metric_type: metricType,
      embedding_model: embeddingModel,
      embedding_required: true,
      dynamic_metadata_allowed: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0
    },
    collection_plans: collectionPlans,
    upsert_batches: upsertBatches,
    metadata_checks: checks,
    retrieval_strategy: retrievalStrategy,
    summary: {
      collection_count: collectionPlans.length,
      record_count: records.length,
      batch_count: upsertBatches.length,
      by_collection: countBy(records, (record) => record.collection),
      records_requiring_embedding: records.length,
      metadata_violation_count: violations.length,
      retrieval_strategy_included: true,
      zilliz_write_count: 0
    },
    safety: {
      dry_run: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false,
      persistent_memory_written: false,
      vps_or_runtime_touch_allowed: false,
      live_writer_included: false,
      requires_explicit_write_flag: true,
      requires_reversible_probe_before_live: true
    },
    warnings: [
      "This adapter only prepares Zilliz collection and upsert payloads.",
      "It does not create embeddings and does not write Zilliz.",
      "Retrieval should use kind-filtered primary search before same-source rerank.",
      "Run a reversible synthetic write/delete probe before connecting this payload to a live writer.",
      "Candidate and audit records remain non-authoritative even if they are searchable."
    ]
  };
}

export async function reviewZillizVectorAdapterPlan({
  repoRoot = process.cwd(),
  vectorMemoryStorage,
  workOrderRouting,
  langGraphBridge,
  vectorDimension = DEFAULT_VECTOR_DIMENSION,
  metricType = DEFAULT_METRIC_TYPE,
  embeddingModel = DEFAULT_EMBEDDING_MODEL,
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const storage = vectorMemoryStorage ?? await reviewVectorMemoryStoragePlan({
    repoRoot,
    workOrderRouting,
    langGraphBridge,
    now
  });

  return buildZillizVectorAdapterPlan({
    vectorMemoryStorage: storage,
    vectorDimension,
    metricType,
    embeddingModel,
    now
  });
}
