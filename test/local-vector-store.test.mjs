import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  buildVectorStoreAdapterContract,
  loadLocalVectorStore,
  localVectorStoreStats,
  queryLocalVectorStore,
  rollbackLocalVectorStoreBatch,
  upsertDistillationToLocalVectorStore
} from "../scripts/lib/local-vector-store.mjs";

async function tempStoreRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "misa-local-vector-store-"));
}

test("local vector store persists public distillation-template records and can query them", async () => {
  const rootDir = await tempStoreRoot();
  const now = new Date("2026-05-14T09:00:00Z");
  const upsert = await upsertDistillationToLocalVectorStore({
    rootDir,
    sourceDir: path.join("examples", "misa-distillation"),
    requireTemplateCoverage: true,
    now
  });
  const schemaCheck = await validateJsonData({
    repoRoot: process.cwd(),
    schemaRel: "schemas/local_vector_store.schema.json",
    data: upsert,
    name: "validate local vector store upsert"
  });
  const loaded = await loadLocalVectorStore({ rootDir });
  const query = await queryLocalVectorStore({
    rootDir,
    query: "public posting policy boundary",
    route: "policy",
    topK: 3,
    now
  });
  const stats = await localVectorStoreStats({ rootDir, now });

  assert.equal(upsert.mode, "local-vector-store-upsert");
  assert.equal(upsert.ok, true);
  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(upsert.backend, "local-jsonl-token-vector-v1");
  assert.equal(upsert.safety.local_vector_store_written, true);
  assert.equal(upsert.safety.zilliz_written, false);
  assert.equal(upsert.safety.embedding_created, false);
  assert.equal(upsert.safety.external_api_calls, 0);
  assert.equal(upsert.adapter_contract.required_distillation_schema, "misa.local_session_distillation.v1");
  assert.ok(upsert.adapter_contract.swappable_backends.includes("zilliz"));
  assert.equal(upsert.summary.record_count, upsert.summary.learning_event_count);
  assert.equal(upsert.summary.unique_source_count >= 3, true);
  assert.equal(upsert.records.every((record) => record.metadata.distillation_template_required === true), true);
  assert.equal(upsert.records.every((record) => record.metadata.distillation_schema_version === "misa.local_session_distillation.v1"), true);
  assert.equal(upsert.records.every((record) => record.metadata.can_influence_behavior === false), true);
  assert.equal(upsert.records.every((record) => record.metadata.retrieval_trace.replayable === true), true);
  assert.equal(upsert.records.every((record) => record.vector.embedding_created === false), true);
  assert.equal(loaded.records.length, upsert.summary.record_count);
  assert.equal(loaded.manifest.backend, "local-jsonl-token-vector-v1");
  assert.equal(query.ok, true);
  assert.equal(query.summary.hit_count > 0, true);
  assert.equal(query.hits.every((hit) => hit.route === "policy"), true);
  assert.equal(query.safety.zilliz_written, false);
  assert.equal(stats.summary.record_count, upsert.summary.record_count);
});

test("local vector store can roll back a batch with manifest evidence", async () => {
  const rootDir = await tempStoreRoot();
  const upsert = await upsertDistillationToLocalVectorStore({
    rootDir,
    sourceDir: path.join("examples", "misa-distillation"),
    requireTemplateCoverage: true,
    now: new Date("2026-05-14T09:10:00Z")
  });
  const rollback = await rollbackLocalVectorStoreBatch({
    rootDir,
    batchId: upsert.batch_id,
    now: new Date("2026-05-14T09:20:00Z")
  });
  const loaded = await loadLocalVectorStore({ rootDir });

  assert.equal(rollback.ok, true);
  assert.equal(rollback.summary.removed_record_count, upsert.summary.record_count);
  assert.equal(rollback.summary.remaining_record_count, 0);
  assert.equal(rollback.safety.zilliz_written, false);
  assert.equal(loaded.records.length, 0);
  assert.equal((await fs.stat(rollback.paths.rollback)).isFile(), true);
});

test("vector store adapter contract is swappable but rejects non-template input", async () => {
  const rootDir = await tempStoreRoot();
  const contract = buildVectorStoreAdapterContract({ backend: "qdrant" });
  const bad = await upsertDistillationToLocalVectorStore({
    rootDir,
    dryRun: true,
    distillation: {
      schema_version: "not-misa.local_session_distillation.v1",
      mode: "custom",
      summary: {
        zilliz_proxy_used: false,
        external_api_calls: 0,
        llm_api_calls: 0
      },
      distillates: [],
      learning_events: []
    },
    now: new Date("2026-05-14T09:30:00Z")
  });

  assert.equal(contract.backend, "qdrant");
  assert.equal(contract.default_backend, "local-jsonl-token-vector-v1");
  assert.ok(contract.required_operations.includes("upsert_distillation"));
  assert.ok(contract.required_operations.includes("query"));
  assert.ok(contract.required_record_fields.includes("metadata.retrieval_trace"));
  assert.ok(contract.swappable_backends.includes("local-jsonl-token-vector-v1"));
  assert.ok(contract.swappable_backends.includes("zilliz"));
  assert.ok(contract.swappable_backends.includes("qdrant"));
  assert.equal(bad.ok, false);
  assert.equal(bad.summary.record_count, 0);
  assert.ok(bad.violations.includes("requires local session distillation schema"));
  assert.equal(bad.safety.local_vector_store_written, false);
});
