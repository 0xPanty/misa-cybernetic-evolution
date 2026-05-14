import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLangGraphQianxuesenBridge,
  reviewLangGraphQianxuesenBridge
} from "../scripts/lib/langgraph-qianxuesen-bridge.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  buildVectorMemoryStoragePlan,
  reviewVectorMemoryStoragePlan
} from "../scripts/lib/vector-memory-storage.mjs";
import {
  buildVectorMemoryRetrievalPlan,
  evaluateVectorRetrievalScenarios,
  rankVectorMemoryHits
} from "../scripts/lib/vector-retrieval-ranker.mjs";
import {
  buildZillizVectorAdapterPlan,
  reviewZillizVectorAdapterPlan
} from "../scripts/lib/zilliz-vector-adapter.mjs";
import {
  buildWorkOrderRouting,
  routeWorkOrders
} from "../scripts/lib/work-order-router.mjs";

test("vector memory storage classification separates audit, decision, experience, policy, and work orders", async () => {
  const routing = await routeWorkOrders({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const bridge = await reviewLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const schemaCheck = await validateJsonData({
    repoRoot: process.cwd(),
    schemaRel: "schemas/vector_memory_storage.schema.json",
    data: result,
    name: "validate generated vector memory storage classification"
  });

  assert.equal(result.mode, "vector-memory-storage-classification");
  assert.equal(result.ok, true);
  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.strategy.classification_only, true);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.summary.zilliz_write_count, 0);
  assert.ok(result.collections.some((item) => item.collection === "misa_experience_memory"));
  assert.ok(result.local_layout.some((item) => item.local_dir === "memory/agent-experience/candidate"));
  assert.ok(result.records.some((record) => record.kind === "audit_log"));
  assert.ok(result.records.some((record) => record.kind === "decision_trace"));
  assert.ok(result.records.some((record) => record.kind === "agent_experience_candidate"));
  assert.ok(result.records.some((record) => record.kind === "repair_work_order"));
  assert.ok(result.records.some((record) => record.kind === "policy_boundary"));
  assert.equal(result.summary.original_source_count, result.summary.record_count);
  assert.equal(result.summary.replayable_trace_count, result.summary.record_count);
  assert.ok(result.metadata_contract.required_fields.includes("original_source"));
  assert.ok(result.metadata_contract.required_fields.includes("retrieval_trace"));
  assert.ok(result.records.every((record) => (
    record.metadata.original_source.source_id !== "unknown"
    && record.metadata.original_source_id === record.metadata.original_source.source_id
    && record.metadata.retrieval_trace.replayable === true
    && record.metadata.retrieval_trace.replay_keys.includes(record.record_id)
    && record.metadata.retrieval_hints.score_inputs.includes("trace_path_continuity")
  )));
  assert.equal(
    result.records
      .filter((record) => ["audit_only", "candidate"].includes(record.metadata.authority))
      .every((record) => record.metadata.can_influence_behavior === false),
    true
  );
});

test("vector memory classification keeps low-risk autonomous work bounded", async () => {
  const report = {
    schema: "misa.hermes.farcaster.daily_report.v1",
    report_date: "2026-05-12",
    counts: {
      outcomes_considered: 4
    },
    operator_quality: {
      schema: "misa.hermes.farcaster.operator_quality.v1",
      verdict: "healthy",
      recommendations: [
        "operator quality looks steady; keep current soft-presence settings"
      ]
    }
  };
  const routing = buildWorkOrderRouting({
    operationalReports: [report],
    now: new Date("2026-05-12T00:00:00Z")
  });
  const bridge = buildLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(routing.summary.auto_executable_count, 1);
  assert.equal(bridge.action_policy_contract.effective_decision, "allow_bounded_local_work");
  assert.equal(result.summary.owner_approval_required_count > 0, true);
  assert.ok(result.summary.by_kind.agent_experience_candidate >= 1);
  assert.ok(result.summary.by_kind.policy_boundary >= 1);
  assert.equal(result.summary.zilliz_write_count, 0);
  assert.ok(result.records.some((record) => (
    record.kind === "policy_boundary"
    && record.metadata.blocked_surfaces.includes("public_posting")
    && record.metadata.blocked_surfaces.includes("provider_credentials")
  )));
});

test("Zilliz vector adapter prepares dry-run collection schemas and upsert payloads", async () => {
  const routing = await routeWorkOrders({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const bridge = await reviewLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const storage = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildZillizVectorAdapterPlan({
    vectorMemoryStorage: storage,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const reviewed = await reviewZillizVectorAdapterPlan({
    vectorMemoryStorage: storage,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const schemaCheck = await validateJsonData({
    repoRoot: process.cwd(),
    schemaRel: "schemas/zilliz_vector_adapter.schema.json",
    data: result,
    name: "validate generated Zilliz vector adapter dry-run"
  });

  assert.equal(result.mode, "zilliz-vector-adapter-dry-run");
  assert.equal(result.ok, true);
  assert.equal(reviewed.summary.record_count, result.summary.record_count);
  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.adapter.vector_dimension, 768);
  assert.equal(result.adapter.embedding_model, "gemini-embedding-001");
  assert.equal(result.safety.dry_run, true);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.safety.embedding_created, false);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.summary.zilliz_write_count, 0);
  assert.equal(result.summary.retrieval_strategy_included, true);
  assert.equal(result.retrieval_strategy.strategy_version, "misa.vector_retrieval_strategy.v1");
  assert.ok(result.retrieval_strategy.ranking_inputs.includes("same_source_context_match"));
  assert.ok(result.retrieval_strategy.hard_rules.some((rule) => /same-source context cannot outrank/i.test(rule)));
  assert.equal(result.summary.records_requiring_embedding, storage.summary.record_count);
  assert.ok(result.collection_plans.some((plan) => plan.collection === "misa_work_order_memory"));
  assert.ok(result.collection_plans.every((plan) => plan.vector.embedding_created === false));
  assert.ok(result.collection_plans.every((plan) => plan.metadata_field.required_fields.includes("original_source")));
  assert.ok(result.collection_plans.every((plan) => plan.scalar_fields.some((field) => field.name === "original_source_id")));
  assert.ok(result.upsert_batches.length > 0);
  assert.ok(result.upsert_batches.every((batch) => batch.zilliz_written === false));
  assert.ok(result.upsert_batches.flatMap((batch) => batch.records).every((record) => record.text.includes(`Memory kind: ${record.metadata.kind}.`)));
  assert.ok(result.upsert_batches.flatMap((batch) => batch.records).every((record) => record.text.includes("Primary for:")));
  assert.ok(result.upsert_batches.flatMap((batch) => batch.records).every((record) => record.text.includes("Not primary for:")));
  assert.ok(result.upsert_batches.flatMap((batch) => batch.records).every((record) => (
    record.embedding === null
    && record.embedding_status === "not_created"
    && record.metadata.record_id === record.record_id
    && record.metadata.original_source.source_id !== "unknown"
    && record.metadata.retrieval_trace.replay_keys.includes(record.record_id)
    && record.metadata.retrieval_hints.filter_keys.includes("original_source_id")
  )));
  assert.equal(result.metadata_checks.every((check) => check.ok), true);
  assert.equal(
    result.upsert_batches
      .flatMap((batch) => batch.records)
      .filter((record) => ["audit_only", "candidate"].includes(record.metadata.authority))
      .every((record) => record.metadata.can_influence_behavior === false),
    true
  );
});

test("Zilliz vector adapter flags unsafe metadata instead of silently preparing writes", async () => {
  const storage = await reviewVectorMemoryStoragePlan({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const badStorage = {
    ...storage,
    records: storage.records.map((record, index) => index === 0
      ? {
          ...record,
          metadata: {
            ...record.metadata,
            authority: "candidate",
            can_influence_behavior: true
          }
        }
      : record)
  };
  const result = buildZillizVectorAdapterPlan({
    vectorMemoryStorage: badStorage,
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.metadata_violation_count > 0, true);
  assert.ok(result.metadata_checks.some((check) => (
    check.check === "behavior_authority"
    && check.ok === false
  )));
  assert.equal(result.safety.zilliz_written, false);
});

test("vector retrieval plan filters by requested kind before same-source context", () => {
  const plan = buildVectorMemoryRetrievalPlan({
    query: "What repair work order came from distill-window-alpha?",
    topK: 6
  });

  assert.equal(plan.query_intent.requested_kind, "repair_work_order");
  assert.equal(plan.kind_locked, true);
  assert.equal(plan.phases[0].phase, "primary_kind_search");
  assert.deepEqual(plan.phases[0].filter.kinds, ["repair_work_order"]);
  assert.match(plan.phases[0].zilliz_filter, /kind == "repair_work_order"/);
  assert.equal(plan.phases[1].phase, "same_source_context_search");
  assert.ok(plan.phases[1].filter.kinds.includes("policy_boundary"));
  assert.match(plan.phases[1].zilliz_filter_template, /original_source_id/);
  assert.equal(plan.phases[2].only_if, "no_primary_kind_hit_above_min_primary_score");
  assert.ok(plan.hard_rules.some((rule) => /cannot override the requested kind/.test(rule)));
});

test("vector retrieval ranker keeps same-source policy from stealing repair-work-order top1", () => {
  const commonTrace = {
    trace_version: "misa.retrieval_trace.v1",
    replayable: true,
    replay_keys: ["alpha-repair", "alpha-policy", "distill-window-alpha", "trace-alpha"],
    source_hops: [
      { stage: "original_source", ref_type: "redacted_sample", ref_id: "distill-window-alpha", artifact_path: "test" },
      { stage: "classification_source", ref_type: "work_order", ref_id: "distill-window-alpha", artifact_path: "test" },
      { stage: "decision_trace", ref_type: "decision_trace", ref_id: "trace-alpha", artifact_path: "test" },
      { stage: "vector_record", ref_type: "record", ref_id: "alpha-repair", artifact_path: "test" }
    ]
  };
  const traceFor = (recordId, sourceId) => sourceId === "distill-window-alpha"
    ? commonTrace
    : {
        trace_version: "misa.retrieval_trace.v1",
        replayable: true,
        replay_keys: [recordId, sourceId, "trace-other"],
        source_hops: [
          { stage: "original_source", ref_type: "redacted_sample", ref_id: sourceId, artifact_path: "test" },
          { stage: "classification_source", ref_type: "work_order", ref_id: sourceId, artifact_path: "test" },
          { stage: "decision_trace", ref_type: "decision_trace", ref_id: "trace-other", artifact_path: "test" },
          { stage: "vector_record", ref_type: "record", ref_id: recordId, artifact_path: "test" }
        ]
      };
  const hit = (recordId, kind, score, sourceId = "distill-window-alpha") => ({
    record_id: recordId,
    score,
    metadata: {
      record_id: recordId,
      title: recordId,
      kind,
      authority: kind === "policy_boundary" ? "policy" : kind === "repair_work_order" ? "candidate" : "audit_only",
      source_id: sourceId,
      original_source_id: sourceId,
      decision_trace_id: sourceId === "distill-window-alpha" ? "trace-alpha" : "trace-other",
      blocked_surfaces: kind === "policy_boundary" ? ["persistent_memory"] : [],
      can_influence_behavior: kind === "policy_boundary",
      requires_owner_approval: kind === "policy_boundary",
      retrieval_trace: traceFor(recordId, sourceId)
    }
  });
  const result = rankVectorMemoryHits({
    query: "What repair work order came from distill-window-alpha?",
    hits: [
      hit("alpha-policy", "policy_boundary", 0.94),
      hit("alpha-audit", "audit_log", 0.86),
      hit("alpha-repair", "repair_work_order", 0.58),
      hit("other-policy", "policy_boundary", 0.96, "other-source")
    ],
    topK: 4
  });

  assert.equal(result.summary.top1_kind_match, true);
  assert.equal(result.ranked_hits[0].record_id, "alpha-repair");
  assert.equal(result.ranked_hits[0].rank_bucket, "primary_kind");
  assert.equal(result.ranked_hits[1].record_id, "alpha-policy");
  assert.equal(result.ranked_hits[1].rank_bucket, "same_source_context");
  assert.ok(result.filtered_out.some((item) => item.record_id === "other-policy"));
});

test("vector retrieval ranker passes multi-source regression rounds", () => {
  const result = evaluateVectorRetrievalScenarios();
  const uniqueScenarioSources = new Set(result.results.map((item) => item.scenario_id.split("_").at(-1)));

  assert.equal(result.ok, true);
  assert.equal(result.summary.scenario_count, 6);
  assert.equal(result.summary.unique_source_count >= 6, true);
  assert.equal(uniqueScenarioSources.size >= 4, true);
  assert.equal(result.summary.top1_exact_recall, 1);
  assert.equal(result.summary.top1_kind_precision, 1);
  assert.equal(result.summary.top3_expected_recall, 1);
  assert.equal(result.summary.noise_top1_wrong_kind_count, 0);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.safety.external_api_calls, 0);
});
