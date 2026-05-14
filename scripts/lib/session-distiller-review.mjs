import fs from "node:fs/promises";
import path from "node:path";

const SAFETY = {
  production_authority: false,
  publication_allowed: false,
  installs_skills: false,
  writes_persistent_memory: false,
  updates_vps: false,
  touches_runtime: false,
  live_effects: {
    writes_persistent_memory: false,
    publishes_skill: false,
    starts_timer: false,
    changes_session_mechanics: false,
    posts_publicly: false
  },
  blocked_operations: [
    "persistent_memory_write",
    "zilliz_replacement",
    "farcaster_publish",
    "skill_publication",
    "production_skill_installation",
    "session_mechanic_replacement",
    "timer_or_service_start",
    "provider_route_change"
  ]
};

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function readJsonIfPresent(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonlIfPresent(filePath) {
  if (!filePath) return [];
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function severityRank(severity) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[severity] ?? 4;
}

function highestSeverity(findings) {
  if (findings.length === 0) return "P3";
  return findings
    .map((finding) => finding.severity)
    .sort((a, b) => severityRank(a) - severityRank(b))[0];
}

function makeFinding({
  id,
  severity,
  status = "repair_candidate",
  title,
  problem,
  evidence = {},
  actions = []
}) {
  return {
    finding_id: id,
    kind: "repair_work_order",
    severity,
    status,
    title,
    problem_statement: problem,
    evidence,
    recommended_next_actions: actions,
    non_goals: [
      "Do not rewrite production Zilliz rows from this review.",
      "Do not change Misa persona or public posting behavior automatically.",
      "Do not start or restart services from the cybernetic review."
    ]
  };
}

function buildFindings({ summaryPayload, manifestRows, llmPayload, rollbackPayload }) {
  const summary = summaryPayload?.summary ?? {};
  const sessionResults = Array.isArray(summaryPayload?.session_results)
    ? summaryPayload.session_results
    : [];
  const findings = [];

  const failed = sessionResults.filter((result) => result.status === "failed");
  if (failed.length > 0 || Number(summary.failed_count ?? 0) > 0) {
    findings.push(makeFinding({
      id: "session-distiller-failed-session",
      severity: "P1",
      title: "Session distiller has failed sessions",
      problem: "The production distiller reported failed sessions. Keep the queue moving, but open a repair work order with the exact failed session evidence.",
      evidence: {
        failed_count: Number(summary.failed_count ?? failed.length),
        failed_sessions: failed.map((result) => ({
          session_id: result.session_id,
          reason: result.reason ?? "failed"
        })).slice(0, 10)
      },
      actions: [
        "Inspect the failed session parse or provider error.",
        "Keep recent-failed isolation enabled so one bad session cannot block the queue.",
        "Add a regression fixture when the failure has a stable shape."
      ]
    }));
  }

  const zillizInsertedCount = Number(summary.zilliz_inserted_count ?? 0);
  const rollbackHashes = Array.isArray(rollbackPayload?.inserted_chunk_hashes)
    ? rollbackPayload.inserted_chunk_hashes
    : [];
  if (zillizInsertedCount > 0 && rollbackHashes.length < zillizInsertedCount) {
    findings.push(makeFinding({
      id: "zilliz-rollback-trace-gap",
      severity: "P1",
      title: "Zilliz write lacks complete rollback trace",
      problem: "The distiller inserted Zilliz chunks, but the rollback manifest does not list every inserted chunk hash.",
      evidence: {
        zilliz_inserted_count: zillizInsertedCount,
        rollback_inserted_hash_count: rollbackHashes.length
      },
      actions: [
        "Keep chunk_hash in every retained Zilliz row.",
        "Require rollback manifest coverage before treating a production write as clean.",
        "Add readback evidence to the distiller artifact when rows are retained."
      ]
    }));
  }

  if (zillizInsertedCount > 0 && manifestRows.length === 0) {
    findings.push(makeFinding({
      id: "zilliz-manifest-missing",
      severity: "P1",
      title: "Zilliz write has no manifest rows",
      problem: "The distiller says it inserted Zilliz rows, but the manifest artifact is empty or missing.",
      evidence: { zilliz_inserted_count: zillizInsertedCount },
      actions: [
        "Write the manifest before or during production Zilliz retention.",
        "Include source, chunk_hash, heading, content length, and session id for traceability."
      ]
    }));
  }

  const malformedRows = manifestRows.filter((row) => (
    !row.chunk_hash
    || !row.source
    || !row.content
    || String(row.content).trim().length < 80
  ));
  if (malformedRows.length > 0) {
    findings.push(makeFinding({
      id: "zilliz-low-traceability-row",
      severity: "P2",
      title: "Zilliz manifest has low-traceability rows",
      problem: "Some planned Zilliz rows are missing source, chunk hash, or enough content to make later retrieval auditable.",
      evidence: {
        malformed_row_count: malformedRows.length,
        examples: malformedRows.slice(0, 5).map((row) => ({
          source: row.source ?? null,
          chunk_hash: row.chunk_hash ?? null,
          content_length: String(row.content ?? "").length
        }))
      },
      actions: [
        "Keep source and chunk_hash required for every vector row.",
        "Drop or merge tiny chunks that cannot carry useful retrieval context.",
        "Preserve enough heading/content for later source-path backtracking."
      ]
    }));
  }

  const duplicateHashes = Object.entries(countBy(manifestRows, (row) => row.chunk_hash))
    .filter(([chunkHash, count]) => chunkHash && count > 1)
    .map(([chunkHash, count]) => ({ chunk_hash: chunkHash, count }));
  if (duplicateHashes.length > 0) {
    findings.push(makeFinding({
      id: "zilliz-duplicate-chunk-hash",
      severity: "P2",
      title: "Zilliz manifest has duplicate chunk hashes",
      problem: "Duplicate chunk hashes make readback and rollback evidence ambiguous.",
      evidence: { duplicates: duplicateHashes.slice(0, 10) },
      actions: [
        "Deduplicate chunks before embedding.",
        "Keep normalized-content dedupe enabled before Zilliz writes."
      ]
    }));
  }

  const noValueCount = Number(summary.no_value_count ?? 0);
  const processedCount = Number(summary.processed_count ?? 0);
  const llmCalledCount = Number(summary.llm_called_count ?? 0);
  if (llmCalledCount > 0 && processedCount === 0 && noValueCount > 0) {
    findings.push(makeFinding({
      id: "low-value-llm-distillation",
      severity: "P3",
      status: "observe_only",
      title: "LLM distillation produced no durable value",
      problem: "The distiller called the LLM but the result was judged no-value. This may be correct, but should stay visible as cost and noise evidence.",
      evidence: {
        llm_called_count: llmCalledCount,
        no_value_count: noValueCount
      },
      actions: [
        "Review whether the no-value gate is filtering correctly.",
        "If this repeats, tune the prewrite filter before calling the LLM."
      ]
    }));
  }

  const llmPayloads = Array.isArray(llmPayload?.payloads) ? llmPayload.payloads : [];
  if (llmCalledCount > 0 && llmPayloads.length === 0) {
    findings.push(makeFinding({
      id: "llm-summary-trace-missing",
      severity: "P2",
      title: "LLM call lacks summary payload trace",
      problem: "The distiller reports LLM calls, but the LLM summary artifact has no payloads.",
      evidence: { llm_called_count: llmCalledCount },
      actions: [
        "Keep distilled_summary_sha256 and session_id in the LLM artifact.",
        "Write the LLM artifact even when journal writing is skipped."
      ]
    }));
  }

  return findings;
}

function buildSourceTrace({ summaryFile, manifestFile, llmFile, rollbackFile }) {
  return {
    distiller_summary_file: summaryFile ?? null,
    zilliz_manifest_file: manifestFile ?? null,
    llm_distill_file: llmFile ?? null,
    zilliz_rollback_file: rollbackFile ?? null
  };
}

export async function reviewSessionDistillerOutput({
  summaryFile,
  manifestFile,
  llmFile,
  rollbackFile,
  now = new Date()
} = {}) {
  const summaryPayload = await readJsonIfPresent(summaryFile);
  if (!summaryPayload) {
    return {
      schema_version: "misa.session_distiller_cybernetic_review.v1",
      mode: "session-distiller-cybernetic-review",
      ok: false,
      created_at: now.toISOString(),
      source: buildSourceTrace({ summaryFile, manifestFile, llmFile, rollbackFile }),
      summary: {
        verdict: "blocked",
        finding_count: 1,
        repair_work_order_count: 1,
        highest_severity: "P1",
        zilliz_inserted_count: 0,
        journal_written_count: 0,
        llm_called_count: 0
      },
      findings: [
        makeFinding({
          id: "session-distiller-summary-missing",
          severity: "P1",
          title: "Session distiller summary is missing",
          problem: "Cybernetic review cannot evaluate the distiller run without the summary artifact.",
          evidence: { summary_file: summaryFile ?? null },
          actions: ["Write the production summary artifact before invoking the cybernetic review."]
        })
      ],
      repair_work_orders: [],
      safety: { ...SAFETY },
      warnings: [],
      violations: ["session distiller summary artifact is missing"]
    };
  }

  const manifestRows = await readJsonlIfPresent(manifestFile);
  const llmPayload = await readJsonIfPresent(llmFile);
  const rollbackPayload = await readJsonIfPresent(rollbackFile);
  const findings = buildFindings({ summaryPayload, manifestRows, llmPayload, rollbackPayload });
  const repairWorkOrders = findings.filter((finding) => finding.status !== "observe_only");
  const distillerSummary = summaryPayload.summary ?? {};
  const violations = [];

  return {
    schema_version: "misa.session_distiller_cybernetic_review.v1",
    mode: "session-distiller-cybernetic-review",
    ok: violations.length === 0,
    created_at: now.toISOString(),
    source: buildSourceTrace({ summaryFile, manifestFile, llmFile, rollbackFile }),
    summary: {
      verdict: repairWorkOrders.length > 0 ? "repair_work_order_required" : findings.length > 0 ? "observe_quality" : "clean",
      finding_count: findings.length,
      repair_work_order_count: repairWorkOrders.length,
      highest_severity: highestSeverity(findings),
      zilliz_inserted_count: Number(distillerSummary.zilliz_inserted_count ?? 0),
      journal_written_count: Number(distillerSummary.journal_written_count ?? 0),
      llm_called_count: Number(distillerSummary.llm_called_count ?? 0),
      manifest_row_count: manifestRows.length
    },
    findings,
    repair_work_orders: repairWorkOrders,
    safety: { ...SAFETY },
    warnings: [
      "This review is read-only and only opens repair work order candidates.",
      "Production memory, Zilliz replacement, Farcaster publishing, and timers remain blocked from this review."
    ],
    violations
  };
}

export async function writeSessionDistillerReviewOutFile(review, outFile, { repoRoot = process.cwd() } = {}) {
  if (!outFile) return undefined;
  const target = path.isAbsolute(outFile)
    ? outFile
    : path.join(repoRoot, outFile);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  return target;
}
