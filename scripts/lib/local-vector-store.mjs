import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { distillLocalMisaSources } from "./session-distiller.mjs";
import { VECTOR_MEMORY_KIND_PROFILES } from "./vector-retrieval-ranker.mjs";

export const DEFAULT_LOCAL_VECTOR_STORE_ROOT = "runs/local-vector-store";
export const LOCAL_VECTOR_STORE_BACKEND = "local-jsonl-token-vector-v1";
export const VECTOR_STORE_ADAPTER_CONTRACT_VERSION = "misa.vector_store_adapter_contract.v1";

const RECORDS_FILE = "records.jsonl";
const MANIFEST_FILE = "manifest.json";
const HISTORY_DIR = "history";
const TOKEN_LIMIT = 160;
const DEFAULT_TOP_K = 8;

const KIND_PROFILE_BY_KIND = new Map(VECTOR_MEMORY_KIND_PROFILES.map((profile) => [profile.kind, profile]));

const ROUTE_TO_KIND = {
  case: "agent_experience_candidate",
  damping: "audit_log",
  memory: "persona_memory_candidate",
  policy: "policy_boundary",
  skill: "agent_experience_candidate"
};

const KIND_TO_COLLECTION = Object.fromEntries(
  VECTOR_MEMORY_KIND_PROFILES.map((profile) => [profile.kind, profile.collection])
);

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function checkResult(name, ok, details = {}) {
  return {
    name,
    ok,
    ...details
  };
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-14T00:00:00Z").toISOString() : date.toISOString();
}

function resolveStoreRoot(repoRoot, rootDir) {
  const raw = rootDir ?? DEFAULT_LOCAL_VECTOR_STORE_ROOT;
  return path.isAbsolute(raw) ? raw : path.join(repoRoot, raw);
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeId(value) {
  return String(value ?? "unknown")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "unknown";
}

function tokenize(text) {
  return unique(String(text ?? "")
    .toLowerCase()
    .match(/[\p{L}\p{N}_:-]+/gu) ?? []);
}

function tokenCounts(text, extraTokens = []) {
  const counts = new Map();
  for (const token of [...tokenize(text), ...extraTokens.map((token) => String(token ?? "").toLowerCase()).filter(Boolean)]) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function buildTokenVector(text, extraTokens = []) {
  const counts = tokenCounts(text, extraTokens);
  const entries = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, TOKEN_LIMIT);
  const weights = Object.fromEntries(entries);
  const norm = Math.sqrt(entries.reduce((sum, [, count]) => sum + count * count, 0));
  return {
    backend: LOCAL_VECTOR_STORE_BACKEND,
    embedding_model: "local-token-count-v1",
    embedding_created: false,
    external_api_calls: 0,
    dimensions: entries.map(([token]) => token),
    weights,
    norm
  };
}

function cosineSimilarity(left, right) {
  if (!left?.norm || !right?.norm) return 0;
  const leftWeights = left.weights ?? {};
  const rightWeights = right.weights ?? {};
  let dot = 0;
  const smaller = Object.keys(leftWeights).length <= Object.keys(rightWeights).length ? leftWeights : rightWeights;
  const larger = smaller === leftWeights ? rightWeights : leftWeights;
  for (const [token, value] of Object.entries(smaller)) {
    dot += Number(value) * Number(larger[token] ?? 0);
  }
  return dot / (left.norm * right.norm);
}

function kindForRoute(route) {
  return ROUTE_TO_KIND[route] ?? "audit_log";
}

function collectionForKind(kind) {
  return KIND_TO_COLLECTION[kind] ?? "misa_audit_memory";
}

function authorityForKind(kind) {
  return KIND_PROFILE_BY_KIND.get(kind)?.authority ?? "audit_only";
}

function requiresOwnerApproval(kind, route) {
  return kind === "policy_boundary" || kind === "persona_memory_candidate" || route === "policy";
}

function sourceRefsToObjects(refs = [], fallbackKind = "source", fallbackId = "unknown") {
  const normalized = refs.map((ref) => {
    if (typeof ref === "string") {
      return { kind: fallbackKind, id: ref, note: "distillation source ref" };
    }
    return {
      kind: String(ref.kind ?? fallbackKind),
      id: String(ref.id ?? fallbackId),
      note: String(ref.note ?? "distillation source ref")
    };
  });
  return normalized.length ? normalized : [
    { kind: fallbackKind, id: fallbackId, note: "primary distillation source" }
  ];
}

function sourceRefsToStrings(refs = []) {
  return refs.map((ref) => typeof ref === "string" ? ref : ref.id).filter(Boolean);
}

function textForRecord({ distillate, event, segments }) {
  return [
    `Route: ${event.expected_route}.`,
    `Source kind: ${distillate.source_kind}.`,
    `Risk: ${event.risk_level}.`,
    `Signals: ${(event.signals ?? []).join(", ")}.`,
    `Setpoint: ${event.setpoint ?? distillate.extraction?.setpoint ?? ""}.`,
    `Summary: ${event.summary ?? distillate.summary}.`,
    ...segments.map((segment) => `Segment ${segment.segment_id}: ${segment.redacted_text ?? ""}`)
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildRetrievalTrace({ recordId, distillate, event, chunkHash }) {
  return {
    trace_version: "misa.retrieval_trace.v1",
    replayable: true,
    replay_keys: unique([
      recordId,
      event.event_id,
      event.source_id,
      event.parent_distillate_id,
      distillate.distillate_id,
      chunkHash,
      ...(event.segment_ids ?? []),
      ...sourceRefsToStrings(event.source_refs)
    ]),
    source_hops: [
      {
        stage: "distillation_source",
        ref_type: distillate.source_kind,
        ref_id: distillate.source_id,
        artifact_path: "misa.local_session_distillation"
      },
      {
        stage: "distillate",
        ref_type: "distillate",
        ref_id: distillate.distillate_id,
        artifact_path: "distillation.distillates"
      },
      {
        stage: "learning_event",
        ref_type: event.expected_route,
        ref_id: event.event_id,
        artifact_path: "distillation.learning_events"
      },
      {
        stage: "local_vector_store_record",
        ref_type: "local_vector_record",
        ref_id: recordId,
        artifact_path: "runs/local-vector-store/records.jsonl"
      }
    ]
  };
}

function buildRecordFromEvent({ distillate, event, now, batchId }) {
  const segments = (distillate.segments ?? []).filter((segment) => (event.segment_ids ?? []).includes(segment.segment_id));
  const text = textForRecord({ distillate, event, segments });
  const route = event.expected_route ?? event.lesson_route ?? "case";
  const kind = kindForRoute(route);
  const authority = authorityForKind(kind);
  const recordId = `lvs-${safeId(event.event_id)}`;
  const chunkHash = stableHash([
    distillate.source_id,
    event.event_id,
    route,
    text
  ].join("\n"));
  const sourceRefs = sourceRefsToObjects(event.source_refs ?? distillate.source_refs, distillate.source_kind, distillate.source_id);
  const vector = buildTokenVector(text, [
    kind,
    route,
    distillate.source_kind,
    ...(event.signals ?? [])
  ]);

  return {
    schema_version: "misa.local_vector_store_record.v1",
    record_id: recordId,
    batch_id: batchId,
    backend: LOCAL_VECTOR_STORE_BACKEND,
    collection: collectionForKind(kind),
    kind,
    route,
    text,
    vector,
    created_at: asIsoDate(now),
    updated_at: asIsoDate(now),
    metadata: {
      record_id: recordId,
      distillation_schema_version: "misa.local_session_distillation.v1",
      distillation_template_required: true,
      source_id: event.source_id,
      source_kind: distillate.source_kind,
      distillate_id: distillate.distillate_id,
      learning_event_id: event.event_id,
      parent_distillate_id: event.parent_distillate_id,
      lesson_id: event.lesson_id,
      route,
      signals: event.signals ?? [],
      source_refs: sourceRefs,
      segment_ids: event.segment_ids ?? [],
      risk_level: event.risk_level ?? "low",
      outcome: event.outcome ?? "unknown",
      setpoint: event.setpoint ?? distillate.extraction?.setpoint ?? "unknown",
      redaction_status: event.redaction_status ?? "unknown",
      original_source_kind: distillate.source_kind,
      original_source_id: distillate.source_id,
      original_chunk_hash: chunkHash,
      authority,
      promotion_state: "not_promoted",
      can_influence_behavior: false,
      requires_owner_approval: requiresOwnerApproval(kind, route),
      allowed_surfaces: ["retrieval_context", "qianxuesen_review", "perception_replay"],
      blocked_surfaces: ["production_memory_write", "zilliz_write", "public_publish", "route_change", "winner_change"],
      retrieval_trace: buildRetrievalTrace({
        recordId,
        distillate,
        event,
        chunkHash
      })
    }
  };
}

function validateDistillationTemplate(distillation) {
  const distillates = distillation?.distillates ?? [];
  const events = distillation?.learning_events ?? [];
  const distillateIds = new Set(distillates.map((item) => item.distillate_id));
  const sourceIds = new Set(distillates.map((item) => item.source_id));
  const checks = [
    checkResult(
      "requires local session distillation schema",
      distillation?.schema_version === "misa.local_session_distillation.v1" && distillation?.mode === "local-session-distillation",
      { schema_version: distillation?.schema_version, mode: distillation?.mode }
    ),
    checkResult(
      "distillation has distillates and learning events",
      Array.isArray(distillates) && distillates.length > 0 && Array.isArray(events) && events.length > 0,
      { distillate_count: distillates.length, learning_event_count: events.length }
    ),
    checkResult(
      "distillates carry local token vectors",
      distillates.every((item) => item.local_vector_index?.backend === "local-token-vector-v1" && item.input_policy?.local_vector_index === true),
      { backend: "local-token-vector-v1" }
    ),
    checkResult(
      "distillation template stays local and provider-free",
      distillation?.summary?.zilliz_proxy_used === false
        && distillation?.summary?.external_api_calls === 0
        && distillation?.summary?.llm_api_calls === 0,
      {
        zilliz_proxy_used: distillation?.summary?.zilliz_proxy_used,
        external_api_calls: distillation?.summary?.external_api_calls,
        llm_api_calls: distillation?.summary?.llm_api_calls
      }
    ),
    checkResult(
      "learning events preserve source lineage",
      events.every((event) => (
        event.event_id
        && event.source_id
        && sourceIds.has(event.source_id)
        && distillateIds.has(event.parent_distillate_id)
        && Array.isArray(event.source_refs)
        && event.source_refs.length > 0
        && Array.isArray(event.segment_ids)
        && event.segment_ids.length > 0
      )),
      { checked_events: events.length }
    ),
    checkResult(
      "learning events expose Qianxuesen route",
      events.every((event) => ["case", "damping", "memory", "policy", "skill"].includes(event.expected_route)),
      { routes: unique(events.map((event) => event.expected_route)).sort() }
    )
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
    violations: checks.filter((check) => !check.ok).map((check) => check.name)
  };
}

function buildRecordsFromDistillation({ distillation, now, batchId }) {
  const distillateById = new Map((distillation.distillates ?? []).map((distillate) => [distillate.distillate_id, distillate]));
  return (distillation.learning_events ?? [])
    .map((event) => {
      const distillate = distillateById.get(event.parent_distillate_id);
      if (!distillate) return null;
      return buildRecordFromEvent({ distillate, event, now, batchId });
    })
    .filter(Boolean);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
  await fs.writeFile(filePath, body, "utf8");
}

function mergeRecords(existingRecords, upsertRecords) {
  const existingById = new Map(existingRecords.map((record) => [record.record_id, record]));
  let inserted = 0;
  let updated = 0;

  for (const record of upsertRecords) {
    if (existingById.has(record.record_id)) {
      updated += 1;
    } else {
      inserted += 1;
    }
    existingById.set(record.record_id, record);
  }

  const merged = [...existingById.values()].sort((left, right) => left.record_id.localeCompare(right.record_id));
  return { merged, inserted, updated };
}

function buildManifest({ rootDir, records, batches, now, lastBatchId }) {
  return {
    schema_version: "misa.local_vector_store_manifest.v1",
    mode: "local-vector-store-manifest",
    backend: LOCAL_VECTOR_STORE_BACKEND,
    root: rootDir,
    updated_at: asIsoDate(now),
    last_batch_id: lastBatchId ?? null,
    adapter_contract: buildVectorStoreAdapterContract(),
    summary: {
      record_count: records.length,
      batch_count: batches.length,
      by_kind: countBy(records, (record) => record.kind),
      by_route: countBy(records, (record) => record.route),
      by_collection: countBy(records, (record) => record.collection),
      unique_source_count: new Set(records.map((record) => record.metadata.original_source_id)).size
    },
    safety: {
      backend_is_local: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false
    },
    files: {
      records: RECORDS_FILE,
      history: HISTORY_DIR
    }
  };
}

function batchSummary(records) {
  return {
    record_count: records.length,
    by_kind: countBy(records, (record) => record.kind),
    by_route: countBy(records, (record) => record.route),
    by_collection: countBy(records, (record) => record.collection),
    source_count: new Set(records.map((record) => record.metadata.original_source_id)).size
  };
}

function resultPaths(rootDir, batchId) {
  return {
    root: rootDir,
    manifest: path.join(rootDir, MANIFEST_FILE),
    records: path.join(rootDir, RECORDS_FILE),
    history_manifest: batchId ? path.join(rootDir, HISTORY_DIR, batchId, "upsert-manifest.json") : null,
    history_records: batchId ? path.join(rootDir, HISTORY_DIR, batchId, "records.jsonl") : null
  };
}

export function buildVectorStoreAdapterContract({ backend = LOCAL_VECTOR_STORE_BACKEND } = {}) {
  return {
    schema_version: VECTOR_STORE_ADAPTER_CONTRACT_VERSION,
    backend,
    default_backend: LOCAL_VECTOR_STORE_BACKEND,
    required_distillation_schema: "misa.local_session_distillation.v1",
    required_operations: [
      "upsert_distillation",
      "query",
      "delete_batch",
      "stats"
    ],
    required_record_fields: [
      "record_id",
      "collection",
      "kind",
      "route",
      "text",
      "vector",
      "metadata.source_id",
      "metadata.distillate_id",
      "metadata.learning_event_id",
      "metadata.original_source_id",
      "metadata.original_chunk_hash",
      "metadata.retrieval_trace"
    ],
    required_query_features: [
      "top_k",
      "route_filter",
      "kind_filter",
      "source_kind_filter",
      "source_id_filter",
      "same_source_trace_keys"
    ],
    swappable_backends: [
      LOCAL_VECTOR_STORE_BACKEND,
      "zilliz",
      "qdrant",
      "lancedb",
      "chroma",
      "pgvector",
      "custom"
    ],
    rules: [
      "Adapters may change storage engines, but they must accept the public distillation template.",
      "Adapters must return records with the same source lineage and retrieval trace fields.",
      "Adapter writes are vector-store writes only; they cannot promote memory, change routes, publish, or update VPS.",
      "External vector stores must provide manifest and rollback evidence equivalent to the local backend."
    ]
  };
}

export async function loadLocalVectorStore({
  repoRoot = process.cwd(),
  rootDir = DEFAULT_LOCAL_VECTOR_STORE_ROOT
} = {}) {
  const resolvedRoot = resolveStoreRoot(repoRoot, rootDir);
  const recordsPath = path.join(resolvedRoot, RECORDS_FILE);
  const manifestPath = path.join(resolvedRoot, MANIFEST_FILE);
  const records = await readJsonl(recordsPath);
  const manifest = await readJson(manifestPath, null);
  return {
    root: resolvedRoot,
    manifest,
    records
  };
}

export async function upsertDistillationToLocalVectorStore({
  repoRoot = process.cwd(),
  rootDir = DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  distillation,
  sourceDir,
  sources,
  requireTemplateCoverage = false,
  dryRun = false,
  now = new Date()
} = {}) {
  const resolvedRoot = resolveStoreRoot(repoRoot, rootDir);
  const resolvedNow = now instanceof Date ? now : new Date(now);
  const batchId = `lvs-${resolvedNow.toISOString().replace(/[:.]/g, "-")}`;
  const resolvedDistillation = distillation ?? await distillLocalMisaSources({
    repoRoot,
    sourceDir,
    sources,
    requireTemplateCoverage
  });
  const validation = validateDistillationTemplate(resolvedDistillation);
  const newRecords = validation.ok
    ? buildRecordsFromDistillation({
        distillation: resolvedDistillation,
        now: resolvedNow,
        batchId
      })
    : [];
  const existingRecords = await readJsonl(path.join(resolvedRoot, RECORDS_FILE));
  const { merged, inserted, updated } = mergeRecords(existingRecords, newRecords);
  const existingManifest = await readJson(path.join(resolvedRoot, MANIFEST_FILE), null);
  const batches = [
    ...(existingManifest?.batches ?? []),
    {
      batch_id: batchId,
      created_at: asIsoDate(resolvedNow),
      dry_run: dryRun,
      ...batchSummary(newRecords)
    }
  ];
  const manifest = buildManifest({
    rootDir: resolvedRoot,
    records: merged,
    batches,
    now: resolvedNow,
    lastBatchId: batchId
  });
  manifest.batches = batches;

  if (!dryRun && validation.ok) {
    await fs.mkdir(path.join(resolvedRoot, HISTORY_DIR, batchId), { recursive: true });
    await writeJsonl(path.join(resolvedRoot, RECORDS_FILE), merged);
    await writeJson(path.join(resolvedRoot, MANIFEST_FILE), manifest);
    await writeJsonl(path.join(resolvedRoot, HISTORY_DIR, batchId, "records.jsonl"), newRecords);
    await writeJson(path.join(resolvedRoot, HISTORY_DIR, batchId, "upsert-manifest.json"), {
      schema_version: "misa.local_vector_store_upsert_manifest.v1",
      batch_id: batchId,
      created_at: asIsoDate(resolvedNow),
      backend: LOCAL_VECTOR_STORE_BACKEND,
      summary: batchSummary(newRecords),
      inserted,
      updated,
      record_ids: newRecords.map((record) => record.record_id),
      rollback: {
        method: "delete_batch",
        batch_id: batchId,
        command: `npm run vector-store:local -- --mode rollback --batch-id ${batchId}`
      }
    });
  }

  return {
    schema_version: "misa.local_vector_store_upsert.v1",
    mode: "local-vector-store-upsert",
    ok: validation.ok,
    created_at: asIsoDate(resolvedNow),
    backend: LOCAL_VECTOR_STORE_BACKEND,
    adapter_contract: buildVectorStoreAdapterContract(),
    batch_id: batchId,
    dry_run: dryRun,
    root: resolvedRoot,
    summary: {
      distillate_count: resolvedDistillation.distillates?.length ?? 0,
      learning_event_count: resolvedDistillation.learning_events?.length ?? 0,
      record_count: newRecords.length,
      inserted,
      updated,
      total_records_after_upsert: dryRun ? existingRecords.length : merged.length,
      by_kind: countBy(newRecords, (record) => record.kind),
      by_route: countBy(newRecords, (record) => record.route),
      unique_source_count: new Set(newRecords.map((record) => record.metadata.original_source_id)).size
    },
    checks: validation.checks,
    records: newRecords,
    paths: resultPaths(resolvedRoot, batchId),
    safety: {
      local_vector_store_written: !dryRun && validation.ok,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false,
      production_memory_written: false,
      public_posting_allowed: false,
      vps_or_runtime_touch_allowed: false,
      route_changed: false,
      winner_changed: false
    },
    warnings: [
      "The local backend is the default public-repo vector store.",
      "It accepts the public distillation template and keeps Zilliz optional.",
      "Stored records are retrieval inventory; they do not promote memory or authorize behavior by themselves."
    ],
    violations: validation.violations
  };
}

export async function queryLocalVectorStore({
  repoRoot = process.cwd(),
  rootDir = DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  query = "",
  route,
  kind,
  sourceKind,
  sourceId,
  topK = DEFAULT_TOP_K,
  now = new Date()
} = {}) {
  const resolvedRoot = resolveStoreRoot(repoRoot, rootDir);
  const records = await readJsonl(path.join(resolvedRoot, RECORDS_FILE));
  const queryVector = buildTokenVector(query, [route, kind, sourceKind].filter(Boolean));
  const filtered = records.filter((record) => (
    (!route || record.route === route)
    && (!kind || record.kind === kind)
    && (!sourceKind || record.metadata.source_kind === sourceKind)
    && (!sourceId || record.metadata.source_id === sourceId || record.metadata.original_source_id === sourceId)
  ));
  const hits = filtered
    .map((record) => {
      const vectorScore = cosineSimilarity(queryVector, record.vector);
      const routeBoost = route && record.route === route ? 0.12 : 0;
      const kindBoost = kind && record.kind === kind ? 0.12 : 0;
      const sourceKindBoost = sourceKind && record.metadata.source_kind === sourceKind ? 0.06 : 0;
      const finalScore = Math.min(1, vectorScore + routeBoost + kindBoost + sourceKindBoost);
      return {
        record_id: record.record_id,
        collection: record.collection,
        kind: record.kind,
        route: record.route,
        source_id: record.metadata.source_id,
        source_kind: record.metadata.source_kind,
        score: Number(finalScore.toFixed(6)),
        vector_score: Number(vectorScore.toFixed(6)),
        text: record.text,
        metadata: record.metadata
      };
    })
    .sort((left, right) => right.score - left.score || left.record_id.localeCompare(right.record_id))
    .slice(0, topK)
    .map((hit, index) => ({ rank: index + 1, ...hit }));

  return {
    schema_version: "misa.local_vector_store_query.v1",
    mode: "local-vector-store-query",
    ok: true,
    created_at: asIsoDate(now),
    backend: LOCAL_VECTOR_STORE_BACKEND,
    root: resolvedRoot,
    query,
    filters: {
      route: route ?? null,
      kind: kind ?? null,
      source_kind: sourceKind ?? null,
      source_id: sourceId ?? null
    },
    summary: {
      stored_record_count: records.length,
      candidate_count: filtered.length,
      hit_count: hits.length,
      top_k: topK,
      top1_record_id: hits[0]?.record_id ?? null,
      top1_route: hits[0]?.route ?? null
    },
    hits,
    safety: {
      read_only: true,
      local_vector_store_written: false,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false
    }
  };
}

export async function rollbackLocalVectorStoreBatch({
  repoRoot = process.cwd(),
  rootDir = DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  batchId,
  now = new Date()
} = {}) {
  if (!batchId) {
    throw new Error("--batch-id is required for local vector store rollback");
  }
  const resolvedRoot = resolveStoreRoot(repoRoot, rootDir);
  const recordsPath = path.join(resolvedRoot, RECORDS_FILE);
  const manifestPath = path.join(resolvedRoot, MANIFEST_FILE);
  const records = await readJsonl(recordsPath);
  const remaining = records.filter((record) => record.batch_id !== batchId);
  const removed = records.filter((record) => record.batch_id === batchId);
  const existingManifest = await readJson(manifestPath, null);
  const batches = (existingManifest?.batches ?? []).map((batch) => batch.batch_id === batchId
    ? { ...batch, rolled_back_at: asIsoDate(now), rollback_record_count: removed.length }
    : batch);
  const manifest = buildManifest({
    rootDir: resolvedRoot,
    records: remaining,
    batches,
    now,
    lastBatchId: existingManifest?.last_batch_id ?? null
  });
  manifest.batches = batches;

  await writeJsonl(recordsPath, remaining);
  await writeJson(manifestPath, manifest);
  await fs.mkdir(path.join(resolvedRoot, HISTORY_DIR, batchId), { recursive: true });
  await writeJson(path.join(resolvedRoot, HISTORY_DIR, batchId, "rollback.json"), {
    schema_version: "misa.local_vector_store_rollback.v1",
    batch_id: batchId,
    created_at: asIsoDate(now),
    removed_record_count: removed.length,
    removed_record_ids: removed.map((record) => record.record_id)
  });

  return {
    schema_version: "misa.local_vector_store_rollback.v1",
    mode: "local-vector-store-rollback",
    ok: true,
    created_at: asIsoDate(now),
    backend: LOCAL_VECTOR_STORE_BACKEND,
    root: resolvedRoot,
    batch_id: batchId,
    summary: {
      removed_record_count: removed.length,
      remaining_record_count: remaining.length
    },
    paths: {
      manifest: manifestPath,
      records: recordsPath,
      rollback: path.join(resolvedRoot, HISTORY_DIR, batchId, "rollback.json")
    },
    safety: {
      local_vector_store_written: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false
    }
  };
}

export async function localVectorStoreStats({
  repoRoot = process.cwd(),
  rootDir = DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  now = new Date()
} = {}) {
  const resolvedRoot = resolveStoreRoot(repoRoot, rootDir);
  const records = await readJsonl(path.join(resolvedRoot, RECORDS_FILE));
  const manifest = await readJson(path.join(resolvedRoot, MANIFEST_FILE), null);
  return {
    schema_version: "misa.local_vector_store_stats.v1",
    mode: "local-vector-store-stats",
    ok: true,
    created_at: asIsoDate(now),
    backend: LOCAL_VECTOR_STORE_BACKEND,
    root: resolvedRoot,
    manifest_found: Boolean(manifest),
    adapter_contract: buildVectorStoreAdapterContract(),
    summary: {
      record_count: records.length,
      batch_count: manifest?.summary?.batch_count ?? manifest?.batches?.length ?? 0,
      by_kind: countBy(records, (record) => record.kind),
      by_route: countBy(records, (record) => record.route),
      by_collection: countBy(records, (record) => record.collection),
      unique_source_count: new Set(records.map((record) => record.metadata.original_source_id)).size
    },
    safety: {
      read_only: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false
    }
  };
}
