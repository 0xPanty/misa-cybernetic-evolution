import { reviewVectorMemoryStoragePlan } from "./vector-memory-storage.mjs";

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
  "created_by",
  "promotion_state",
  "can_influence_behavior",
  "requires_owner_approval",
  "allowed_surfaces",
  "blocked_surfaces",
  "decision_trace_id"
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

function compactText(record) {
  return [
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
    { name: "created_by", type: "VarChar", max_length: 128 },
    { name: "promotion_state", type: "VarChar", max_length: 32 },
    { name: "can_influence_behavior", type: "Bool" },
    { name: "requires_owner_approval", type: "Bool" },
    { name: "allowed_surfaces", type: "JSON" },
    { name: "blocked_surfaces", type: "JSON" },
    { name: "decision_trace_id", type: "VarChar", max_length: 256 }
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
    summary: {
      collection_count: collectionPlans.length,
      record_count: records.length,
      batch_count: upsertBatches.length,
      by_collection: countBy(records, (record) => record.collection),
      records_requiring_embedding: records.length,
      metadata_violation_count: violations.length,
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
