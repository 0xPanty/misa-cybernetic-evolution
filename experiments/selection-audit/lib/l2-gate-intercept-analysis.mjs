import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { gateLlmWorkOrderDraft } from "../../external-trajectory/lib/external-trajectory-llm-work-order-draft.mjs";
import {
  classifyL2L3PoolDecision,
  DEFAULT_L2_L3_SELECTION_THRESHOLDS
} from "./l2-l3-selection-audit.mjs";

const DEFAULT_RUNS_DIR = "runs";
const DEFAULT_OUTPUT_DIR = "runs/l2-gate-intercept-analysis/latest-local-history";

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

function hashJson(value) {
  return crypto.createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 12);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkJsonFiles(root) {
  if (!await fileExists(root)) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isL2Report(value) {
  return Array.isArray(value?.results)
    && value.results.some((item) => item?.source_id && item?.draft && item?.gate);
}

function reconstructGatePacket(item) {
  const evidenceRefs = item?.packet?.evidence_refs ?? item?.draft?.evidence_refs ?? [];
  const relevantFiles = item?.packet?.relevant_files ?? [];
  const observedSignals = item?.packet?.observed_signals ?? [];
  return {
    source_id: item?.source_id ?? "unknown",
    record: {
      readout_family: item?.packet?.readout_family ?? null,
      observed_signals: observedSignals
    },
    workOrder: {
      evidence_refs: evidenceRefs
    },
    allowed_verification_commands: item?.packet?.allowed_verification_commands ?? [],
    context: {
      context_anchors: [
        item?.source_id,
        ...evidenceRefs,
        ...observedSignals
      ].filter(Boolean),
      relevant_files: relevantFiles,
      task_focus: [
        item?.packet?.readout_family,
        item?.packet?.route_hint
      ].filter(Boolean),
      source_class: item?.packet?.source_class ?? null
    }
  };
}

function bucketQuality(score) {
  if (score >= 0.975) return "near_perfect_0.975_plus";
  if (score >= 0.95) return "strong_0.95_plus";
  if (score >= 0.9) return "usable_0.90_plus";
  if (score >= 0.74) return "weak_0.74_plus";
  return "bad_below_0.74";
}

function increment(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function sortedObject(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function average(values) {
  return values.length
    ? Math.round(1000 * values.reduce((sum, value) => sum + Number(value), 0) / values.length) / 1000
    : 0;
}

function percent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function oldGateClass(item) {
  if (item?.provider_error || item?.gate?.checks?.providerError) return "provider_error";
  return item?.gate?.ok ? "pass" : "blocked";
}

function blockingFactorsFromGate(gate) {
  const checks = gate?.checks ?? {};
  const factors = [];
  if ((gate?.violations ?? []).includes("too_many_weak_tasks")) factors.push("weak_task_present");
  if ((gate?.violations ?? []).includes("too_few_actionable_tasks")) factors.push("too_few_actionable_tasks");
  if ((gate?.violations ?? []).includes("too_few_acceptance_criteria")) factors.push("acceptance_too_light");
  if ((gate?.violations ?? []).includes("too_few_context_anchors")) factors.push("context_anchors_too_thin");
  if ((gate?.violations ?? []).includes("non_whitelisted_verification_command")) factors.push("command_not_whitelisted");
  if ((gate?.violations ?? []).includes("missing_source_refs")) factors.push("missing_evidence_refs");
  if ((gate?.violations ?? []).includes("provider_call_failed")) factors.push("provider_error");
  if (Number(checks.actionableTaskCount ?? 0) >= 4 && Number(checks.weakTaskCount ?? 0) === 1) {
    factors.push("one_weak_task_but_enough_actionable_tasks");
  }
  return [...new Set(factors)];
}

function resultRow({ reportPath, repoRoot, item }) {
  const recomputedGate = gateLlmWorkOrderDraft({
    packet: reconstructGatePacket(item),
    draft: item.draft,
    parseOk: Boolean(item.draft),
    providerError: item.provider_error ?? item.gate?.checks?.providerError ?? null
  });
  const updatedItem = {
    ...item,
    gate: recomputedGate
  };
  const updatedDecision = classifyL2L3PoolDecision(updatedItem, {
    thresholds: DEFAULT_L2_L3_SELECTION_THRESHOLDS
  });
  const oldClass = oldGateClass(item);
  const dedupeKey = [
    item.source_id,
    item.provider ?? "",
    item.model ?? "",
    hashJson(item.draft)
  ].join("|");

  return {
    report_path: normalizePathForReport(repoRoot, reportPath),
    source_id: item.source_id,
    provider: item.provider ?? null,
    model: item.model ?? null,
    dedupe_key: dedupeKey,
    old_gate_class: oldClass,
    old_gate_ok: Boolean(item.gate?.ok),
    old_quality_score: Number(item.gate?.quality_score ?? 0),
    old_violations: item.gate?.violations ?? [],
    new_gate_ok: Boolean(recomputedGate.ok),
    new_gate_class: recomputedGate.gate_class,
    new_quality_score: recomputedGate.quality_score,
    new_violations: recomputedGate.violations,
    soft_violations: recomputedGate.soft_violations,
    warning_codes: recomputedGate.warning_codes,
    updated_pool: updatedDecision.pool,
    updated_l4_forward: updatedDecision.l4_forward,
    candidate_count: Array.isArray(item.candidates) ? item.candidates.length : 1,
    actionableTaskCount: recomputedGate.checks.actionableTaskCount,
    weakTaskCount: recomputedGate.checks.weakTaskCount,
    acceptanceCount: recomputedGate.checks.acceptanceCount,
    specificityHits: recomputedGate.checks.specificityHits,
    whitelistedCommands: recomputedGate.checks.whitelistedCommands,
    quality_bucket: bucketQuality(recomputedGate.quality_score),
    blocking_factors: blockingFactorsFromGate(recomputedGate),
    title: item.draft?.title ?? null
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    if (seen.has(row.dedupe_key)) continue;
    seen.add(row.dedupe_key);
    unique.push(row);
  }
  return unique;
}

function summarizeRows(rows) {
  const oldClassCounts = {};
  const newClassCounts = {};
  const updatedPoolCounts = {};
  const qualityBuckets = {};
  const oldViolationCounts = {};
  const newViolationCounts = {};
  const softViolationCounts = {};
  const warningCounts = {};
  const blockingFactorCounts = {};

  for (const row of rows) {
    increment(oldClassCounts, row.old_gate_class);
    increment(newClassCounts, row.new_gate_class);
    increment(updatedPoolCounts, row.updated_pool);
    increment(qualityBuckets, row.quality_bucket);
    for (const violation of row.old_violations) increment(oldViolationCounts, violation);
    for (const violation of row.new_violations) increment(newViolationCounts, violation);
    for (const violation of row.soft_violations) increment(softViolationCounts, violation);
    for (const warning of row.warning_codes) increment(warningCounts, warning);
    for (const factor of row.blocking_factors) increment(blockingFactorCounts, factor);
  }

  const oldBlocked = rows.filter((row) => row.old_gate_class === "blocked");
  const oldBlockedNearPass = oldBlocked.filter((row) => row.new_gate_class === "near_pass");
  const oldBlockedHardFail = oldBlocked.filter((row) => row.new_gate_class === "hard_fail");
  const oldBlockedPass = oldBlocked.filter((row) => row.new_gate_class === "pass");
  const oldBlockedStrongQuality = oldBlocked.filter((row) => row.new_quality_score >= 0.95);

  return {
    result_count: rows.length,
    unique_source_count: new Set(rows.map((row) => row.source_id)).size,
    old_gate_class_counts: sortedObject(oldClassCounts),
    new_gate_class_counts: sortedObject(newClassCounts),
    updated_pool_counts: sortedObject(updatedPoolCounts),
    quality_bucket_counts: sortedObject(qualityBuckets),
    old_blocked_count: oldBlocked.length,
    old_blocked_near_pass_count: oldBlockedNearPass.length,
    old_blocked_pass_count: oldBlockedPass.length,
    old_blocked_hard_fail_count: oldBlockedHardFail.length,
    old_blocked_strong_quality_count: oldBlockedStrongQuality.length,
    old_blocked_salvageable_rate_pct: percent(oldBlockedNearPass.length + oldBlockedPass.length, oldBlocked.length),
    old_blocked_strong_quality_rate_pct: percent(oldBlockedStrongQuality.length, oldBlocked.length),
    avg_quality_score: average(rows.map((row) => row.new_quality_score)),
    avg_old_blocked_quality_score: average(oldBlocked.map((row) => row.new_quality_score)),
    violation_counts_old: sortedObject(oldViolationCounts),
    violation_counts_new_hard: sortedObject(newViolationCounts),
    soft_violation_counts: sortedObject(softViolationCounts),
    warning_counts: sortedObject(warningCounts),
    blocking_factor_counts: sortedObject(blockingFactorCounts)
  };
}

function topRows(rows, filter, limit = 12) {
  return rows
    .filter(filter)
    .sort((left, right) => (
      right.new_quality_score - left.new_quality_score
      || right.actionableTaskCount - left.actionableTaskCount
      || left.source_id.localeCompare(right.source_id)
    ))
    .slice(0, limit)
    .map((row) => ({
      source_id: row.source_id,
      quality_score: row.new_quality_score,
      old_violations: row.old_violations,
      new_gate_class: row.new_gate_class,
      soft_violations: row.soft_violations,
      warning_codes: row.warning_codes,
      updated_pool: row.updated_pool,
      actionableTaskCount: row.actionableTaskCount,
      weakTaskCount: row.weakTaskCount,
      report_path: row.report_path,
      title: row.title
    }));
}

function verdictFromSummary(summary) {
  if (!summary.old_blocked_count) {
    return "no_blocked_samples_found";
  }
  if (summary.old_blocked_salvageable_rate_pct >= 30) {
    return "old_hard_gate_was_too_strict_for_near_pass_work_orders";
  }
  if (summary.old_blocked_strong_quality_rate_pct >= 50) {
    return "old_gate_blocked_many_high_quality_items_but_most_still_need_review";
  }
  return "old_gate_mostly_blocked_real_hard_fails_but_keep_spot_checks";
}

export async function buildL2GateInterceptAnalysis({
  repoRoot = process.cwd(),
  runsDir = DEFAULT_RUNS_DIR,
  now = new Date()
} = {}) {
  const root = resolvePath(repoRoot, runsDir);
  const jsonFiles = await walkJsonFiles(root);
  const reports = [];
  for (const filePath of jsonFiles) {
    const parsed = await readJsonOrNull(filePath);
    if (!isL2Report(parsed)) continue;
    reports.push({
      path: filePath,
      report: parsed
    });
  }

  const rawRows = reports.flatMap(({ path: reportPath, report }) => (
    report.results
      .filter((item) => item?.source_id && item?.draft && item?.gate)
      .map((item) => resultRow({ reportPath, repoRoot, item }))
  ));
  const uniqueRows = dedupeRows(rawRows);
  const summary = summarizeRows(uniqueRows);

  return {
    schema_version: "misa.l2_gate_intercept_analysis.v1",
    created_at: now.toISOString(),
    input: {
      runs_dir: normalizePathForReport(repoRoot, root),
      scanned_json_file_count: jsonFiles.length,
      l2_report_count: reports.length,
      raw_result_count: rawRows.length,
      deduped_result_count: uniqueRows.length
    },
    summary: {
      ...summary,
      verdict: verdictFromSummary(summary)
    },
    top_old_blocked_near_pass: topRows(uniqueRows, (row) => (
      row.old_gate_class === "blocked" && row.new_gate_class === "near_pass"
    )),
    top_old_blocked_hard_fail: topRows(uniqueRows, (row) => (
      row.old_gate_class === "blocked" && row.new_gate_class === "hard_fail"
    )),
    rows: uniqueRows
  };
}

export function renderL2GateInterceptAnalysisMarkdown(result) {
  const summary = result.summary;
  const lines = [
    "# L2 Gate Intercept Analysis",
    "",
    "## Summary",
    "",
    `- l2_report_count: ${result.input.l2_report_count}`,
    `- raw_result_count: ${result.input.raw_result_count}`,
    `- deduped_result_count: ${result.input.deduped_result_count}`,
    `- unique_source_count: ${summary.unique_source_count}`,
    `- old_blocked_count: ${summary.old_blocked_count}`,
    `- old_blocked_near_pass_count: ${summary.old_blocked_near_pass_count}`,
    `- old_blocked_hard_fail_count: ${summary.old_blocked_hard_fail_count}`,
    `- old_blocked_salvageable_rate_pct: ${summary.old_blocked_salvageable_rate_pct}`,
    `- old_blocked_strong_quality_rate_pct: ${summary.old_blocked_strong_quality_rate_pct}`,
    `- avg_old_blocked_quality_score: ${summary.avg_old_blocked_quality_score}`,
    `- verdict: ${summary.verdict}`,
    "",
    "## Old Gate Classes",
    "",
    ...Object.entries(summary.old_gate_class_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## New Gate Classes",
    "",
    ...Object.entries(summary.new_gate_class_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Updated Pools",
    "",
    ...Object.entries(summary.updated_pool_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Blocking Factors",
    "",
    ...Object.entries(summary.blocking_factor_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## Old Blocked Near Pass",
    "",
    ...summaryRows(result.top_old_blocked_near_pass),
    "",
    "## Old Blocked Hard Fail",
    "",
    ...summaryRows(result.top_old_blocked_hard_fail)
  ];
  return `${lines.join("\n")}\n`;
}

function summaryRows(rows) {
  if (!rows.length) return ["- none"];
  return rows.map((row) => (
    `- ${row.source_id}: quality=${row.quality_score}, pool=${row.updated_pool}, actionable=${row.actionableTaskCount}, weak=${row.weakTaskCount}, soft=${row.soft_violations.join(",") || "none"}, report=${row.report_path}`
  ));
}

export async function writeL2GateInterceptAnalysisArtifacts({
  repoRoot = process.cwd(),
  runsDir = DEFAULT_RUNS_DIR,
  outDir = DEFAULT_OUTPUT_DIR,
  now = new Date()
} = {}) {
  const result = await buildL2GateInterceptAnalysis({ repoRoot, runsDir, now });
  const outputRoot = resolvePath(repoRoot, outDir);
  await fs.mkdir(outputRoot, { recursive: true });
  const jsonPath = path.join(outputRoot, "gate-intercept-analysis.json");
  const markdownPath = path.join(outputRoot, "gate-intercept-analysis.md");
  const written = {
    ...result,
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      json_path: normalizePathForReport(repoRoot, jsonPath),
      markdown_path: normalizePathForReport(repoRoot, markdownPath)
    }
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderL2GateInterceptAnalysisMarkdown(written), "utf8");
  return written;
}
