import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reviewSessionDistillerOutput } from "../scripts/lib/session-distiller-review.mjs";
import { exportReviewWorkOrdersToInbox } from "../scripts/lib/work-order-inbox.mjs";

test("session distiller cybernetic review opens work orders for Zilliz trace gaps", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "misa-session-distiller-review-"));
  try {
    const summaryFile = path.join(tmp, "summary.json");
    const manifestFile = path.join(tmp, "manifest.jsonl");
    const llmFile = path.join(tmp, "llm.json");
    const rollbackFile = path.join(tmp, "rollback.json");

    await fs.writeFile(summaryFile, JSON.stringify({
      artifact_type: "HermesSessionDistillationProductionPipeline",
      summary: {
        failed_count: 0,
        processed_count: 1,
        no_value_count: 0,
        zilliz_inserted_count: 1,
        journal_written_count: 1,
        llm_called_count: 1
      },
      session_results: [
        {
          session_id: "session-alpha",
          status: "processed",
          zilliz: { inserted_chunk_count: 1, inserted_chunk_hashes: ["chunk-alpha"] },
          llm: { called: true, call_count: 1 },
          journal: { journal_written: true }
        }
      ]
    }), "utf8");
    await fs.writeFile(manifestFile, `${JSON.stringify({
      source: "session:alpha",
      chunk_hash: "chunk-alpha",
      content: "short"
    })}\n`, "utf8");
    await fs.writeFile(llmFile, JSON.stringify({ payloads: [{ session_id: "session-alpha" }] }), "utf8");
    await fs.writeFile(rollbackFile, JSON.stringify({ inserted_chunk_hashes: [] }), "utf8");

    const review = await reviewSessionDistillerOutput({
      summaryFile,
      manifestFile,
      llmFile,
      rollbackFile,
      now: new Date("2026-05-14T00:00:00Z")
    });

    assert.equal(review.ok, true);
    assert.equal(review.summary.verdict, "repair_work_order_required");
    assert.ok(review.summary.repair_work_order_count >= 1);
    assert.ok(review.findings.some((finding) => finding.finding_id === "zilliz-rollback-trace-gap"));
    assert.ok(review.findings.some((finding) => finding.finding_id === "zilliz-low-traceability-row"));
    assert.equal(review.safety.writes_persistent_memory, false);
    assert.equal(Object.values(review.safety.live_effects).some(Boolean), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("session distiller cybernetic review stays clean for no-op scans", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "misa-session-distiller-clean-"));
  try {
    const summaryFile = path.join(tmp, "summary.json");
    const manifestFile = path.join(tmp, "manifest.jsonl");
    const llmFile = path.join(tmp, "llm.json");
    const rollbackFile = path.join(tmp, "rollback.json");

    await fs.writeFile(summaryFile, JSON.stringify({
      artifact_type: "HermesSessionDistillationProductionPipeline",
      summary: {
        failed_count: 0,
        processed_count: 0,
        no_value_count: 0,
        zilliz_inserted_count: 0,
        journal_written_count: 0,
        llm_called_count: 0,
        skipped_already_processed_count: 44
      },
      session_results: [
        { session_id: "session-old", status: "skipped", reason: "already_processed" }
      ]
    }), "utf8");
    await fs.writeFile(manifestFile, "", "utf8");
    await fs.writeFile(llmFile, JSON.stringify({ payloads: [] }), "utf8");
    await fs.writeFile(rollbackFile, JSON.stringify({ inserted_chunk_hashes: [] }), "utf8");

    const review = await reviewSessionDistillerOutput({
      summaryFile,
      manifestFile,
      llmFile,
      rollbackFile,
      now: new Date("2026-05-14T00:00:00Z")
    });

    assert.equal(review.ok, true);
    assert.equal(review.summary.verdict, "clean");
    assert.equal(review.summary.finding_count, 0);
    assert.equal(review.summary.repair_work_order_count, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("session distiller repair work orders can be split into an agent inbox", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "misa-session-work-order-inbox-"));
  try {
    const summaryFile = path.join(tmp, "summary.json");
    const inboxRoot = path.join(tmp, "work-orders", "cybernetic");

    await fs.writeFile(summaryFile, JSON.stringify({
      artifact_type: "HermesSessionDistillationProductionPipeline",
      summary: {
        failed_count: 1,
        processed_count: 0,
        no_value_count: 0,
        zilliz_inserted_count: 0,
        journal_written_count: 0,
        llm_called_count: 0
      },
      session_results: [
        {
          session_id: "session-failed",
          status: "failed",
          reason: "production_zilliz_write_failed_rolled_back:HTTP 503"
        }
      ]
    }), "utf8");

    const review = await reviewSessionDistillerOutput({
      summaryFile,
      now: new Date("2026-05-21T08:30:21Z")
    });

    assert.equal(review.summary.verdict, "repair_work_order_required");
    assert.equal(review.summary.repair_work_order_count, 1);

    const firstExport = await exportReviewWorkOrdersToInbox({
      review,
      reviewFile: path.join(tmp, "review.json"),
      root: inboxRoot,
      now: new Date("2026-05-21T08:31:00Z")
    });

    assert.equal(firstExport.ok, true);
    assert.equal(firstExport.summary.written_count, 1);
    assert.equal(firstExport.summary.skipped_existing_count, 0);
    assert.equal(firstExport.safety.no_auto_execution, true);

    const inboxFiles = await fs.readdir(path.join(inboxRoot, "inbox"));
    assert.equal(inboxFiles.length, 1);
    const item = JSON.parse(await fs.readFile(path.join(inboxRoot, "inbox", inboxFiles[0]), "utf8"));
    assert.equal(item.lifecycle.state, "inbox");
    assert.equal(item.execution_policy.auto_execute, false);
    assert.equal(item.delivery.receiver_type, "primary_agent");
    assert.equal(item.suggested_executor.executor_type, "specialized_engineering_agent");
    assert.equal(item.safety.no_auto_execution, true);

    const secondExport = await exportReviewWorkOrdersToInbox({
      review,
      reviewFile: path.join(tmp, "review.json"),
      root: inboxRoot,
      now: new Date("2026-05-21T08:32:00Z")
    });

    assert.equal(secondExport.summary.written_count, 0);
    assert.equal(secondExport.summary.skipped_existing_count, 1);
    assert.equal(secondExport.summary.inbox_count, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
