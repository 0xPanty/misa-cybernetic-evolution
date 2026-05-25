import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reviewSessionDistillerOutput } from "../scripts/lib/session-distiller-review.mjs";
import {
  exportInboxOwnerDigest,
  exportReviewWorkOrdersToInbox
} from "../scripts/lib/work-order-inbox.mjs";

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

test("session distiller inbox aggregates repeated VPS failure samples by failure class", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "misa-session-work-order-vps-aggregate-"));
  const realVpsFailureReasons = [
    ...Array.from({ length: 21 }, () => "The read operation timed out"),
    "HTTP 504: {\"error\":{\"message\":\"openai_error\",\"type\":\"bad_response_status_code\",\"param\":\"\",\"code\":\"bad_response_status_code\"}}",
    "HTTP 504: {\"error\":{\"message\":\"openai_error\",\"type\":\"bad_response_status_code\",\"param\":\"\",\"code\":\"bad_response_status_code\"}}",
    "Expecting value: line 1 column 1 (char 0)",
    "session_parse_failed:Hermes session JSON missing messages list"
  ];

  try {
    const inboxRoot = path.join(tmp, "work-orders", "cybernetic");
    let writtenCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    for (const [index, reason] of realVpsFailureReasons.entries()) {
      const sessionId = `redacted-vps-session-${String(index + 1).padStart(2, "0")}`;
      const review = {
        schema_version: "misa.session_distiller_cybernetic_review.v1",
        mode: "session-distiller-cybernetic-review",
        ok: true,
        created_at: new Date(Date.UTC(2026, 4, 21, 9, 40 + index, 0)).toISOString(),
        summary: {
          verdict: "repair_work_order_required",
          repair_work_order_count: 1
        },
        source: {
          distiller_summary_file: "/root/misa-hermes-project/artifacts/session-distiller-systemd/session-distiller-summary.json"
        },
        repair_work_orders: [{
          finding_id: "session-distiller-failed-session",
          kind: "repair_work_order",
          severity: "P1",
          status: "repair_candidate",
          title: "Session distiller has failed sessions",
          problem_statement: "The production distiller reported failed sessions. Keep the queue moving, but open a repair work order with the exact failed session evidence.",
          evidence: {
            failed_count: 1,
            failed_sessions: [{ session_id: sessionId, reason }]
          },
          recommended_next_actions: [
            "Inspect the failed session parse or provider error.",
            "Keep recent-failed isolation enabled so one bad session cannot block the queue.",
            "Add a regression fixture when the failure has a stable shape."
          ],
          non_goals: [
            "Do not rewrite production Zilliz rows from this review.",
            "Do not change Misa persona or public posting behavior automatically.",
            "Do not start or restart services from the cybernetic review."
          ]
        }],
        safety: {
          production_authority: false,
          publication_allowed: false,
          writes_persistent_memory: false,
          updates_vps: false
        }
      };

      const result = await exportReviewWorkOrdersToInbox({
        review,
        reviewFile: `/root/misa-hermes-project/artifacts/session-distiller-systemd/cybernetic-review/session-distiller-review-redacted-${index}.json`,
        root: inboxRoot,
        now: new Date(Date.UTC(2026, 4, 21, 9, 41 + index, 0))
      });

      writtenCount += result.summary.written_count;
      mergedCount += result.summary.merged_existing_count;
      skippedCount += result.summary.skipped_existing_count;
    }

    assert.equal(writtenCount, 4);
    assert.equal(mergedCount, 21);
    assert.equal(skippedCount, 0);

    const inboxFiles = await fs.readdir(path.join(inboxRoot, "inbox"));
    assert.equal(inboxFiles.length, 4);

    const items = await Promise.all(inboxFiles.map(async (file) => (
      JSON.parse(await fs.readFile(path.join(inboxRoot, "inbox", file), "utf8"))
    )));
    const aggregateByReason = new Map(items.flatMap((item) => (
      Object.entries(item.aggregate.reason_counts).map(([reasonClass, count]) => [reasonClass, { item, count }])
    )));

    assert.equal(aggregateByReason.get("read-timeout").count, 21);
    assert.equal(aggregateByReason.get("provider-504").count, 2);
    assert.equal(aggregateByReason.get("empty-json-response").count, 1);
    assert.equal(aggregateByReason.get("missing-messages-list").count, 1);
    assert.equal(aggregateByReason.get("read-timeout").item.aggregate.session_ids.length, 21);
    assert.equal(aggregateByReason.get("read-timeout").item.execution_policy.auto_execute, false);
    assert.equal(aggregateByReason.get("read-timeout").item.aggregate.observation.trend, "spike");
    assert.equal(aggregateByReason.get("read-timeout").item.aggregate.observation.report_needed, true);
    assert.equal(aggregateByReason.get("read-timeout").item.aggregate.observation.windows.short.count, 21);

    const repeatReview = {
      created_at: "2026-05-21T11:00:00.000Z",
      summary: { verdict: "repair_work_order_required", repair_work_order_count: 1 },
      repair_work_orders: [{
        finding_id: "session-distiller-failed-session",
        severity: "P1",
        title: "Session distiller has failed sessions",
        evidence: {
          failed_count: 1,
          failed_sessions: [{
            session_id: "redacted-vps-session-01",
            reason: "The read operation timed out"
          }]
        },
        recommended_next_actions: [
          "Inspect the failed session parse or provider error.",
          "Keep recent-failed isolation enabled so one bad session cannot block the queue.",
          "Add a regression fixture when the failure has a stable shape."
        ]
      }]
    };
    const repeat = await exportReviewWorkOrdersToInbox({
      review: repeatReview,
      root: inboxRoot,
      now: new Date("2026-05-21T11:01:00.000Z")
    });

    assert.equal(repeat.summary.written_count, 0);
    assert.equal(repeat.summary.merged_existing_count, 0);
    assert.equal(repeat.summary.skipped_existing_count, 1);
    assert.equal(repeat.summary.inbox_count, 4);
    assert.equal(repeat.summary.report_needed_count, 4);
    assert.equal(repeat.summary.spike_count, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("session distiller inbox observation quantifies continuous timeout pressure", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "misa-session-work-order-pressure-"));
  try {
    const inboxRoot = path.join(tmp, "work-orders", "cybernetic");
    const totalFailures = 500;
    let writtenCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;
    let latestResult = null;

    for (let index = 0; index < totalFailures; index += 1) {
      const seenAt = new Date(Date.UTC(2026, 4, 21, 10, 0, index * 2));
      const review = {
        created_at: seenAt.toISOString(),
        summary: { verdict: "repair_work_order_required", repair_work_order_count: 1 },
        repair_work_orders: [{
          finding_id: "session-distiller-failed-session",
          severity: "P1",
          status: "repair_candidate",
          title: "Session distiller has failed sessions",
          problem_statement: "The production distiller reported failed sessions.",
          evidence: {
            failed_count: 1,
            failed_sessions: [{
              session_id: `pressure-timeout-session-${String(index + 1).padStart(4, "0")}`,
              reason: "The read operation timed out"
            }]
          },
          recommended_next_actions: [
            "Inspect the failed session parse or provider error.",
            "Keep recent-failed isolation enabled so one bad session cannot block the queue.",
            "Add a regression fixture when the failure has a stable shape."
          ]
        }]
      };

      latestResult = await exportReviewWorkOrdersToInbox({
        review,
        root: inboxRoot,
        now: seenAt
      });
      writtenCount += latestResult.summary.written_count;
      mergedCount += latestResult.summary.merged_existing_count;
      skippedCount += latestResult.summary.skipped_existing_count;
    }

    assert.equal(writtenCount, 1);
    assert.equal(mergedCount, totalFailures - 1);
    assert.equal(skippedCount, 0);
    assert.equal(latestResult.summary.inbox_count, 1);
    assert.equal(latestResult.summary.report_needed_count, 1);
    assert.equal(latestResult.summary.spike_count, 1);

    const inboxFiles = await fs.readdir(path.join(inboxRoot, "inbox"));
    const item = JSON.parse(await fs.readFile(path.join(inboxRoot, "inbox", inboxFiles[0]), "utf8"));
    assert.equal(item.aggregate.occurrence_count, totalFailures);
    assert.equal(item.aggregate.reason_counts["read-timeout"], totalFailures);
    assert.equal(item.aggregate.session_ids.length, totalFailures);
    assert.equal(item.aggregate.observation.trend, "spike");
    assert.equal(item.aggregate.observation.report_needed, true);
    assert.equal(item.aggregate.observation.new_since_last_report, totalFailures);
    assert.equal(item.aggregate.observation.windows.short.count, totalFailures);
    assert.equal(item.aggregate.observation.behavior, "report_owner_digest");
    assert.equal(item.execution_policy.auto_execute, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("session distiller owner digest closes the L4 report loop without report spam", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "misa-session-work-order-l4-"));
  try {
    const inboxRoot = path.join(tmp, "work-orders", "cybernetic");

    const addTimeoutFailure = async (index, seenAt) => exportReviewWorkOrdersToInbox({
      review: {
        created_at: seenAt.toISOString(),
        summary: { verdict: "repair_work_order_required", repair_work_order_count: 1 },
        repair_work_orders: [{
          finding_id: "session-distiller-failed-session",
          severity: "P1",
          status: "repair_candidate",
          title: "Session distiller has failed sessions",
          problem_statement: "The production distiller reported failed sessions.",
          evidence: {
            failed_count: 1,
            failed_sessions: [{
              session_id: `l4-timeout-session-${String(index + 1).padStart(3, "0")}`,
              reason: "The read operation timed out"
            }]
          },
          recommended_next_actions: [
            "Inspect the failed session parse or provider error.",
            "Keep recent-failed isolation enabled so one bad session cannot block the queue.",
            "Add a regression fixture when the failure has a stable shape."
          ]
        }]
      },
      root: inboxRoot,
      now: seenAt
    });

    for (let index = 0; index < 5; index += 1) {
      await addTimeoutFailure(index, new Date(Date.UTC(2026, 4, 21, 10, 0, index)));
    }

    const firstDigest = await exportInboxOwnerDigest({
      root: inboxRoot,
      now: new Date("2026-05-21T10:00:10.000Z")
    });

    assert.equal(firstDigest.summary.report_item_count, 1);
    assert.equal(firstDigest.summary.total_new_since_last_report, 5);
    assert.equal(firstDigest.safety.auto_execute, false);
    assert.equal(firstDigest.safety.executes_work_orders, false);
    await fs.access(firstDigest.artifacts.json);
    await fs.access(firstDigest.artifacts.markdown);

    const inboxFiles = await fs.readdir(path.join(inboxRoot, "inbox"));
    assert.equal(inboxFiles.length, 1);
    const inboxFile = path.join(inboxRoot, "inbox", inboxFiles[0]);
    const reportedItem = JSON.parse(await fs.readFile(inboxFile, "utf8"));
    assert.equal(reportedItem.aggregate.report_state.last_reported_occurrence_count, 5);
    assert.equal(reportedItem.aggregate.observation.report_needed, false);
    assert.equal(reportedItem.aggregate.observation.new_since_last_report, 0);
    assert.equal(reportedItem.lifecycle.last_reported_at, "2026-05-21T10:00:10.000Z");

    const quietDigest = await exportInboxOwnerDigest({
      root: inboxRoot,
      now: new Date("2026-05-21T10:00:20.000Z")
    });
    assert.equal(quietDigest.summary.report_item_count, 0);
    assert.equal(quietDigest.summary.total_new_since_last_report, 0);

    let latestResult = null;
    for (let index = 5; index < 9; index += 1) {
      latestResult = await addTimeoutFailure(index, new Date(Date.UTC(2026, 4, 21, 10, 0, 20 + index)));
    }

    assert.equal(latestResult.summary.inbox_count, 1);
    assert.equal(latestResult.summary.report_needed_count, 0);
    const observingItem = JSON.parse(await fs.readFile(inboxFile, "utf8"));
    assert.equal(observingItem.aggregate.occurrence_count, 9);
    assert.equal(observingItem.aggregate.observation.new_since_last_report, 4);
    assert.equal(observingItem.aggregate.observation.report_needed, false);
    assert.equal(observingItem.aggregate.observation.behavior, "observe_only");

    const thresholdResult = await addTimeoutFailure(9, new Date("2026-05-21T10:00:34.000Z"));
    assert.equal(thresholdResult.summary.report_needed_count, 1);
    assert.equal(thresholdResult.summary.spike_count, 1);

    const thresholdItem = JSON.parse(await fs.readFile(inboxFile, "utf8"));
    assert.equal(thresholdItem.aggregate.occurrence_count, 10);
    assert.equal(thresholdItem.aggregate.observation.new_since_last_report, 5);
    assert.equal(thresholdItem.aggregate.observation.report_needed, true);
    assert.ok(thresholdItem.aggregate.observation.report_reasons.includes("unreported_occurrence_growth"));
    assert.equal(thresholdItem.aggregate.observation.behavior, "report_owner_digest");

    const secondDigest = await exportInboxOwnerDigest({
      root: inboxRoot,
      now: new Date("2026-05-21T10:00:40.000Z")
    });
    assert.equal(secondDigest.summary.report_item_count, 1);
    assert.equal(secondDigest.summary.total_new_since_last_report, 5);

    const closedAgainItem = JSON.parse(await fs.readFile(inboxFile, "utf8"));
    assert.equal(closedAgainItem.aggregate.report_state.last_reported_occurrence_count, 10);
    assert.equal(closedAgainItem.aggregate.observation.report_needed, false);
    assert.equal(closedAgainItem.aggregate.observation.new_since_last_report, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
