import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  collectL3FeedbackReflectionAllSamples,
  matchesReflectionPolicyScope
} from "./l3-feedback-reflection-replay.mjs";

const execFileAsync = promisify(execFile);

export const DEFAULT_L1_L3_LOCAL_EXHAUST_OUT_DIR = "runs/l1-l3-local-exhaust";
export const DEFAULT_SWE_REBENCH_DATASET = "swe-rebench-openhands";
export const DEFAULT_LOCAL_EXHAUST_CANDIDATE_LIMIT = 500;

const BAD_L3_STATUSES = new Set([
  "exhausted_no_value",
  "exhausted_reviewable_hard_fail",
  "provider_error_failed_closed"
]);

const ACCEPTED_L3_STATUSES = new Set([
  "accepted_first_try",
  "accepted_after_l3_recheck"
]);

const PYTHON_DUCKDB_METADATA_CODE = String.raw`
import json
import sys
import duckdb

parquet_path = sys.argv[1]
dataset = sys.argv[2]
candidate_limit = int(sys.argv[3])
used_source_ids = json.loads(sys.argv[4])

used_instance_ids = []
prefix = dataset + ":"
for source_id in used_source_ids:
    text = str(source_id)
    used_instance_ids.append(text[len(prefix):] if text.startswith(prefix) else text)

con = duckdb.connect()
con.execute("create temporary table used(instance_id varchar)")
if used_instance_ids:
    con.executemany("insert into used values (?)", [(value,) for value in used_instance_ids])

base_sql = "read_parquet(?)"
summary_row = con.execute(f"""
select
  count(*) as row_count,
  sum(case when resolved = true then 1 else 0 end) as resolved_true_count,
  sum(case when resolved = false then 1 else 0 end) as resolved_false_count,
  sum(case when resolved is null then 1 else 0 end) as resolved_null_count,
  sum(case when coalesce(exit_status, 'unknown') <> 'submit' then 1 else 0 end) as non_submit_count,
  sum(case when model_patch is null or length(model_patch) = 0 then 1 else 0 end) as model_patch_missing_count,
  sum(case when pred_passes_gen_tests = 0 then 1 else 0 end) as pred_gen_tests_failed_count
from {base_sql}
""", [parquet_path]).fetchone()

exit_rows = con.execute(f"""
select coalesce(exit_status, 'unknown') as exit_status, count(*) as count
from {base_sql}
group by 1
order by count desc, exit_status
""", [parquet_path]).fetchall()

high_risk_count = con.execute(f"""
with src as (
  select
    instance_id,
    resolved,
    coalesce(exit_status, 'unknown') as exit_status,
    model_patch,
    pred_passes_gen_tests
  from {base_sql}
),
scored as (
  select
    src.instance_id,
    (
      case when resolved = false then 40 else 0 end
      + case when exit_status <> 'submit' then 30 else 0 end
      + case when lower(exit_status) like '%maximum iteration%' or lower(exit_status) like '%stuck%' then 20 else 0 end
      + case when lower(exit_status) like '%timeout%' or lower(exit_status) like '%error%' or lower(exit_status) like '%unavailable%' then 15 else 0 end
      + case when model_patch is null or length(model_patch) = 0 then 10 else 0 end
      + case when pred_passes_gen_tests = 0 then 8 else 0 end
    ) as priority_score
  from src
  left join used on used.instance_id = src.instance_id
  where used.instance_id is null
)
select count(distinct instance_id)
from scored
where priority_score > 0
""", [parquet_path]).fetchone()[0]

candidate_rows = con.execute(f"""
with src as (
  select
    instance_id,
    repo,
    resolved,
    coalesce(exit_status, 'unknown') as exit_status,
    case when model_patch is not null and length(model_patch) > 0 then true else false end as model_patch_available,
    gen_tests_correct,
    pred_passes_gen_tests
  from {base_sql}
),
scored as (
  select
    src.*,
    (
      case when resolved = false then 40 else 0 end
      + case when exit_status <> 'submit' then 30 else 0 end
      + case when lower(exit_status) like '%maximum iteration%' or lower(exit_status) like '%stuck%' then 20 else 0 end
      + case when lower(exit_status) like '%timeout%' or lower(exit_status) like '%error%' or lower(exit_status) like '%unavailable%' then 15 else 0 end
      + case when not model_patch_available then 10 else 0 end
      + case when pred_passes_gen_tests = 0 then 8 else 0 end
    ) as priority_score
  from src
  left join used on used.instance_id = src.instance_id
  where used.instance_id is null
),
ranked as (
  select
    *,
    row_number() over (
      partition by instance_id
      order by priority_score desc, exit_status desc, repo
    ) as rn
  from scored
)
select
  instance_id,
  repo,
  resolved,
  exit_status,
  model_patch_available,
  gen_tests_correct,
  pred_passes_gen_tests,
  priority_score
from ranked
where priority_score > 0
  and rn = 1
order by priority_score desc, instance_id
limit ?
""", [parquet_path, candidate_limit]).fetchall()

def reason_codes(row):
    instance_id, repo, resolved, exit_status, model_patch_available, gen_tests_correct, pred_passes_gen_tests, priority_score = row
    resolved_value = None if resolved is None else bool(resolved)
    status = str(exit_status or "unknown").lower()
    reasons = []
    if resolved_value is False:
        reasons.append("resolved_proxy_false")
    if exit_status != "submit":
        reasons.append("non_submit_exit_status")
    if "maximum iteration" in status or "stuck" in status:
        reasons.append("loop_or_iteration_limit")
    if "timeout" in status or "error" in status or "unavailable" in status:
        reasons.append("provider_or_runtime_error_status")
    if not model_patch_available:
        reasons.append("missing_model_patch")
    if pred_passes_gen_tests == 0:
        reasons.append("generated_tests_failed_proxy")
    return reasons

summary = {
    "schema_version": "misa.swe_rebench_parquet_metadata.v1",
    "parquet_path": parquet_path,
    "dataset": dataset,
    "row_count": int(summary_row[0] or 0),
    "resolved_true_count": int(summary_row[1] or 0),
    "resolved_false_count": int(summary_row[2] or 0),
    "resolved_null_count": int(summary_row[3] or 0),
    "non_submit_count": int(summary_row[4] or 0),
    "model_patch_missing_count": int(summary_row[5] or 0),
    "pred_gen_tests_failed_count": int(summary_row[6] or 0),
    "exit_status_counts": {str(key): int(value) for key, value in exit_rows},
    "already_sampled_source_count": len(used_source_ids),
    "high_priority_candidate_count_excluding_sampled": int(high_risk_count or 0),
}

candidates = []
for row in candidate_rows:
    instance_id, repo, resolved, exit_status, model_patch_available, gen_tests_correct, pred_passes_gen_tests, priority_score = row
    resolved_value = None if resolved is None else bool(resolved)
    candidates.append({
        "schema_version": "misa.future_real_probe_candidate.v1",
        "source_id": f"{dataset}:{instance_id}",
        "dataset": dataset,
        "instance_id": instance_id,
        "repo": repo,
        "resolved_proxy": resolved_value,
        "exit_status": exit_status,
        "model_patch_available": bool(model_patch_available),
        "gen_tests_correct": gen_tests_correct,
        "pred_passes_gen_tests": pred_passes_gen_tests,
        "priority_score": int(priority_score or 0),
        "reason_codes": reason_codes(row),
        "llm_label_status": "not_labeled_locally",
        "boundary": "metadata-prioritized future real L2/L3 probe; not a substitute for L3 labels"
    })

print(json.dumps({
    "summary": summary,
    "candidates": candidates
}, ensure_ascii=False))
`;

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator ? round(Number(numerator) / Number(denominator)) : 0;
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function walkFiles(root, predicate) {
  if (!await fileExists(root)) return [];
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(entry.name, fullPath)) files.push(fullPath);
  }
  return files;
}

async function findLatestFile({ repoRoot, runsDir, filename }) {
  const root = resolvePath(repoRoot, runsDir);
  const files = await walkFiles(root, (name) => name === filename);
  if (!files.length) return null;
  const withStats = await Promise.all(files.map(async (filePath) => ({
    filePath,
    stat: await fsp.stat(filePath)
  })));
  withStats.sort((left, right) => (
    Number(right.stat.mtimeMs) - Number(left.stat.mtimeMs)
    || right.filePath.localeCompare(left.filePath)
  ));
  return withStats[0].filePath;
}

function countBy(items, selector) {
  return Object.fromEntries(
    Object.entries(items.reduce((counts, item) => {
      const key = selector(item) ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})).sort(([left], [right]) => String(left).localeCompare(String(right)))
  );
}

function uniqueCount(items, selector) {
  return new Set(items.map(selector).filter(Boolean)).size;
}

function isKnownBad(sample) {
  return BAD_L3_STATUSES.has(sample.l3_feedback_status);
}

function isAccepted(sample) {
  return ACCEPTED_L3_STATUSES.has(sample.l3_feedback_status);
}

async function countJsonlLines(filePath) {
  if (!await fileExists(filePath)) return null;
  return new Promise((resolve, reject) => {
    let count = 0;
    let lastByte = null;
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => {
      for (const byte of chunk) {
        if (byte === 10) count += 1;
        lastByte = byte;
      }
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (lastByte !== null && lastByte !== 10) count += 1;
      resolve(count);
    });
  });
}

async function inspectPartialJsonl({ filePath, expectedRowCount, repoRoot }) {
  if (!filePath || !await fileExists(filePath)) return null;
  const stat = await fsp.stat(filePath);
  const lineCount = await countJsonlLines(filePath);
  return {
    path: normalizePathForReport(repoRoot, filePath),
    byte_size: stat.size,
    line_count: lineCount,
    expected_full_row_count: expectedRowCount ?? null,
    usable_as_full_dataset: Boolean(expectedRowCount && lineCount >= expectedRowCount),
    excluded_from_evidence: !(expectedRowCount && lineCount >= expectedRowCount)
  };
}

function normalizeCandidate(candidate, dataset = DEFAULT_SWE_REBENCH_DATASET) {
  const sourceId = candidate.source_id ?? `${dataset}:${candidate.instance_id}`;
  return {
    schema_version: "misa.future_real_probe_candidate.v1",
    source_id: sourceId,
    dataset: candidate.dataset ?? dataset,
    instance_id: candidate.instance_id ?? sourceId.split(":").at(-1),
    repo: candidate.repo ?? null,
    resolved_proxy: candidate.resolved_proxy ?? candidate.resolved ?? null,
    exit_status: candidate.exit_status ?? "unknown",
    model_patch_available: Boolean(candidate.model_patch_available),
    gen_tests_correct: candidate.gen_tests_correct ?? null,
    pred_passes_gen_tests: candidate.pred_passes_gen_tests ?? null,
    priority_score: Number(candidate.priority_score ?? 0),
    reason_codes: candidate.reason_codes ?? [],
    llm_label_status: candidate.llm_label_status ?? "not_labeled_locally",
    boundary: candidate.boundary ?? "metadata-prioritized future real L2/L3 probe; not a substitute for L3 labels"
  };
}

export async function collectSweRebenchParquetMetadata({
  parquetPath,
  dataset = DEFAULT_SWE_REBENCH_DATASET,
  usedSourceIds = [],
  candidateLimit = DEFAULT_LOCAL_EXHAUST_CANDIDATE_LIMIT,
  pythonBin = process.env.PYTHON ?? "python"
} = {}) {
  if (!parquetPath) throw new Error("parquetPath is required");
  const { stdout } = await execFileAsync(
    pythonBin,
    [
      "-c",
      PYTHON_DUCKDB_METADATA_CODE,
      parquetPath,
      dataset,
      String(candidateLimit),
      JSON.stringify([...new Set(usedSourceIds)])
    ],
    {
      maxBuffer: 1024 * 1024 * 20
    }
  );
  const parsed = JSON.parse(stdout);
  return {
    summary: parsed.summary,
    candidates: (parsed.candidates ?? []).map((candidate) => normalizeCandidate(candidate, dataset))
  };
}

function sampleLibrarySourceIds(sampleLibrary) {
  return new Set((sampleLibrary?.rows ?? []).map((row) => row.source_id).filter(Boolean));
}

function l3HistoricalSummary(fullLibrary) {
  const samples = fullLibrary?.samples ?? [];
  const badSamples = samples.filter(isKnownBad);
  const acceptedSamples = samples.filter(isAccepted);
  const strictSamples = samples.filter((sample) => matchesReflectionPolicyScope(sample));
  const strictBadSamples = strictSamples.filter(isKnownBad);
  const strictAcceptedSamples = strictSamples.filter(isAccepted);
  return {
    scanned_pool_decisions_file_count: fullLibrary?.input?.scanned_pool_decisions_file_count ?? 0,
    scanned_row_count: fullLibrary?.input?.scanned_row_count ?? samples.length,
    unique_source_id_count: uniqueCount(samples, (sample) => sample.source_id),
    status_counts: countBy(samples, (sample) => sample.l3_feedback_status ?? "unknown"),
    known_bad_row_count: badSamples.length,
    known_bad_unique_source_count: uniqueCount(badSamples, (sample) => sample.source_id),
    accepted_row_count: acceptedSamples.length,
    accepted_unique_source_count: uniqueCount(acceptedSamples, (sample) => sample.source_id),
    strict_scope_row_count: strictSamples.length,
    strict_scope_unique_source_count: uniqueCount(strictSamples, (sample) => sample.source_id),
    strict_scope_known_bad_row_count: strictBadSamples.length,
    strict_scope_known_bad_unique_source_count: uniqueCount(strictBadSamples, (sample) => sample.source_id),
    strict_scope_accepted_row_count: strictAcceptedSamples.length,
    strict_scope_bad_source_ids: [...new Set(strictBadSamples.map((sample) => sample.source_id))].sort(),
    known_bad_source_ids: [...new Set(badSamples.map((sample) => sample.source_id))].sort()
  };
}

function sampleLibrarySummary(sampleLibrary) {
  if (!sampleLibrary) return null;
  const summary = sampleLibrary.summary ?? {};
  return {
    source_path: sampleLibrary.__source_path ?? null,
    library_row_count: summary.library_row_count ?? (sampleLibrary.rows ?? []).length,
    reflection_scope_count: summary.reflection_scope_count ?? 0,
    reflection_l3_labeled_count: summary.reflection_l3_labeled_count ?? 0,
    reflection_l3_missing_count: summary.reflection_l3_missing_count ?? 0,
    reflection_bad_seed_count: summary.reflection_bad_seed_count ?? 0,
    reflection_clean_labeled_count: summary.reflection_clean_labeled_count ?? 0,
    reflection_conflict_count: summary.reflection_conflict_count ?? 0,
    l3_source_coverage_count: summary.l3_source_coverage_count ?? 0,
    l3_source_coverage_rate: summary.l3_source_coverage_rate ?? 0,
    queue_bucket_counts: summary.queue_bucket_counts ?? {},
    l1_auto_strategy_ready: Boolean(summary.product_gate?.l1_auto_strategy_ready),
    l1_auto_strategy_reason: summary.product_gate?.reason ?? null,
    strict_reflection_labeled_exhausted: Number(summary.reflection_l3_missing_count ?? 0) === 0
  };
}

function parquetSummaryBlock(parquetSummary) {
  if (!parquetSummary) return null;
  return {
    ...parquetSummary,
    unresolved_rate: rate(parquetSummary.resolved_false_count, parquetSummary.row_count),
    non_submit_rate: rate(parquetSummary.non_submit_count, parquetSummary.row_count),
    model_patch_missing_rate: rate(parquetSummary.model_patch_missing_count, parquetSummary.row_count)
  };
}

export function buildL1L3LocalExhaustReport({
  fullLibrary,
  sampleLibrary = null,
  parquetSummary = null,
  futureProbeCandidates = [],
  partialFullJsonl = null,
  repoRoot = process.cwd(),
  runsDir = "runs",
  now = new Date()
} = {}) {
  if (!fullLibrary) throw new Error("fullLibrary is required");
  const historical = l3HistoricalSummary(fullLibrary);
  const library = sampleLibrarySummary(sampleLibrary);
  const parquet = parquetSummaryBlock(parquetSummary);
  const candidates = futureProbeCandidates.map((candidate) => normalizeCandidate(candidate, parquet?.dataset));
  const localHistoricalL3Exhausted = historical.known_bad_row_count === historical.strict_scope_known_bad_row_count
    && historical.known_bad_unique_source_count === historical.strict_scope_known_bad_unique_source_count;
  const strictLibraryExhausted = Boolean(library?.strict_reflection_labeled_exhausted);
  const rawMetadataExhausted = Boolean(parquet?.row_count);
  const canCreateMoreRealL3LabelsLocally = false;

  return {
    schema_version: "misa.l1_l3_local_exhaust_report.v1",
    mode: "l1-l3-local-exhaust-report",
    ok: localHistoricalL3Exhausted && strictLibraryExhausted && rawMetadataExhausted,
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    input: {
      runs_dir: normalizePathForReport(repoRoot, resolvePath(repoRoot, runsDir)),
      sample_library_path: library?.source_path ?? null,
      parquet_path: parquet?.parquet_path ?? null,
      llm_api_calls: 0,
      external_api_calls: 0,
      touches_vps: false,
      pushes_github: false
    },
    summary: {
      historical_pool_decision_files: historical.scanned_pool_decisions_file_count,
      historical_pool_decision_rows: historical.scanned_row_count,
      historical_unique_sources: historical.unique_source_id_count,
      historical_known_bad_rows: historical.known_bad_row_count,
      historical_known_bad_unique_sources: historical.known_bad_unique_source_count,
      historical_strict_scope_rows: historical.strict_scope_row_count,
      historical_strict_scope_unique_sources: historical.strict_scope_unique_source_count,
      historical_strict_scope_known_bad_rows: historical.strict_scope_known_bad_row_count,
      sample_library_rows: library?.library_row_count ?? 0,
      reflection_scope_count: library?.reflection_scope_count ?? 0,
      reflection_l3_labeled_count: library?.reflection_l3_labeled_count ?? 0,
      reflection_l3_missing_count: library?.reflection_l3_missing_count ?? null,
      reflection_bad_seed_count: library?.reflection_bad_seed_count ?? 0,
      reflection_clean_labeled_count: library?.reflection_clean_labeled_count ?? 0,
      reflection_conflict_count: library?.reflection_conflict_count ?? 0,
      parquet_row_count: parquet?.row_count ?? null,
      parquet_resolved_false_count: parquet?.resolved_false_count ?? null,
      parquet_non_submit_count: parquet?.non_submit_count ?? null,
      parquet_high_priority_candidate_count_excluding_sampled: parquet?.high_priority_candidate_count_excluding_sampled ?? null,
      future_probe_candidate_written_count: candidates.length,
      local_historical_l3_bad_labels_exhausted: localHistoricalL3Exhausted,
      strict_sample_library_l3_labels_exhausted: strictLibraryExhausted,
      raw_parquet_metadata_exhausted: rawMetadataExhausted,
      can_create_more_real_l3_labels_without_llm: canCreateMoreRealL3LabelsLocally,
      l1_auto_strategy_ready: Boolean(library?.l1_auto_strategy_ready),
      product_line_verdict: library?.l1_auto_strategy_ready
        ? "ready_for_manual_l1_strategy_review_not_auto_mutation"
        : "local_evidence_supports_route_but_not_product_auto_l1_mutation",
      next_boundary: "Use the candidate list for a tiny future real L2/L3 probe only after local review; do not treat parquet metadata as L3 gate truth."
    },
    historical_l3: historical,
    sample_library: library,
    raw_parquet_metadata: parquet,
    partial_full_jsonl: partialFullJsonl,
    future_real_probe_candidates: candidates,
    notes: [
      "Historical pool-decisions are the only local source of real L3 gate labels.",
      "The SWE-rebench parquet scan exhausts local metadata, but unresolved/non-submit rows are only proxies.",
      "More real L3 labels require a model/provider pass; this report does not call one.",
      "The partial full JSONL export is excluded unless its line count reaches the parquet row count."
    ]
  };
}

export function renderL1L3LocalExhaustMarkdown(result) {
  const summary = result.summary;
  const parquet = result.raw_parquet_metadata;
  const historical = result.historical_l3;
  const sampleLibrary = result.sample_library;
  const partial = result.partial_full_jsonl;
  const lines = [
    "# L1/L3 Local Exhaust Report",
    "",
    "## Summary",
    "",
    `- ok: ${result.ok}`,
    `- historical_pool_decision_files: ${summary.historical_pool_decision_files}`,
    `- historical_pool_decision_rows: ${summary.historical_pool_decision_rows}`,
    `- historical_unique_sources: ${summary.historical_unique_sources}`,
    `- historical_known_bad_rows: ${summary.historical_known_bad_rows}`,
    `- historical_known_bad_unique_sources: ${summary.historical_known_bad_unique_sources}`,
    `- historical_strict_scope_rows: ${summary.historical_strict_scope_rows}`,
    `- historical_strict_scope_unique_sources: ${summary.historical_strict_scope_unique_sources}`,
    `- historical_strict_scope_known_bad_rows: ${summary.historical_strict_scope_known_bad_rows}`,
    `- sample_library_rows: ${summary.sample_library_rows}`,
    `- reflection_scope_count: ${summary.reflection_scope_count}`,
    `- reflection_l3_labeled_count: ${summary.reflection_l3_labeled_count}`,
    `- reflection_l3_missing_count: ${summary.reflection_l3_missing_count}`,
    `- reflection_bad_seed_count: ${summary.reflection_bad_seed_count}`,
    `- reflection_clean_labeled_count: ${summary.reflection_clean_labeled_count}`,
    `- reflection_conflict_count: ${summary.reflection_conflict_count}`,
    `- parquet_row_count: ${summary.parquet_row_count}`,
    `- parquet_resolved_false_count: ${summary.parquet_resolved_false_count}`,
    `- parquet_non_submit_count: ${summary.parquet_non_submit_count}`,
    `- parquet_high_priority_candidate_count_excluding_sampled: ${summary.parquet_high_priority_candidate_count_excluding_sampled}`,
    `- future_probe_candidate_written_count: ${summary.future_probe_candidate_written_count}`,
    `- local_historical_l3_bad_labels_exhausted: ${summary.local_historical_l3_bad_labels_exhausted}`,
    `- strict_sample_library_l3_labels_exhausted: ${summary.strict_sample_library_l3_labels_exhausted}`,
    `- raw_parquet_metadata_exhausted: ${summary.raw_parquet_metadata_exhausted}`,
    `- can_create_more_real_l3_labels_without_llm: ${summary.can_create_more_real_l3_labels_without_llm}`,
    `- l1_auto_strategy_ready: ${summary.l1_auto_strategy_ready}`,
    `- product_line_verdict: ${summary.product_line_verdict}`,
    `- next_boundary: ${summary.next_boundary}`,
    "",
    "## Historical L3 Labels",
    "",
    `- status_counts: ${JSON.stringify(historical.status_counts)}`,
    `- known_bad_source_ids: ${historical.known_bad_source_ids.join(", ") || "none"}`,
    `- strict_scope_bad_source_ids: ${historical.strict_scope_bad_source_ids.join(", ") || "none"}`,
    "",
    "## Sample Library",
    "",
    sampleLibrary
      ? `- queue_bucket_counts: ${JSON.stringify(sampleLibrary.queue_bucket_counts)}`
      : "- none",
    sampleLibrary
      ? `- strict_reflection_labeled_exhausted: ${sampleLibrary.strict_reflection_labeled_exhausted}`
      : "- strict_reflection_labeled_exhausted: false",
    "",
    "## Raw Parquet Metadata",
    "",
    parquet
      ? `- exit_status_counts: ${JSON.stringify(parquet.exit_status_counts)}`
      : "- none",
    parquet
      ? `- unresolved_rate: ${parquet.unresolved_rate}`
      : "- unresolved_rate: 0",
    parquet
      ? `- non_submit_rate: ${parquet.non_submit_rate}`
      : "- non_submit_rate: 0",
    "",
    "## Partial Full JSONL",
    "",
    partial
      ? `- path: ${partial.path}`
      : "- none",
    partial
      ? `- line_count: ${partial.line_count}`
      : "- line_count: 0",
    partial
      ? `- usable_as_full_dataset: ${partial.usable_as_full_dataset}`
      : "- usable_as_full_dataset: false",
    partial
      ? `- excluded_from_evidence: ${partial.excluded_from_evidence}`
      : "- excluded_from_evidence: true",
    "",
    "## Future Probe Candidates",
    "",
    ...(
      result.future_real_probe_candidates.length
        ? result.future_real_probe_candidates.slice(0, 20).map((candidate) => (
          `- ${candidate.source_id}: score=${candidate.priority_score}, resolved=${candidate.resolved_proxy}, exit=${candidate.exit_status}, reasons=${candidate.reason_codes.join(",") || "none"}`
        ))
        : ["- none"]
    ),
    "",
    "## Notes",
    "",
    ...result.notes.map((note) => `- ${note}`)
  ];
  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, value, "utf8");
}

export async function writeL1L3LocalExhaustArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join(DEFAULT_L1_L3_LOCAL_EXHAUST_OUT_DIR, `${stamp}-local-exhaust`));
  await fsp.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "l1-l3-local-exhaust-report.json");
  const mdPath = path.join(outputRoot, "l1-l3-local-exhaust-report.md");
  const candidatesPath = path.join(outputRoot, "future-real-probe-candidates.jsonl");
  const manifestPath = path.join(outputRoot, "input-manifest.json");
  const written = {
    ...result,
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      json_path: normalizePathForReport(repoRoot, jsonPath),
      markdown_path: normalizePathForReport(repoRoot, mdPath),
      future_probe_candidates_path: normalizePathForReport(repoRoot, candidatesPath),
      input_manifest_path: normalizePathForReport(repoRoot, manifestPath)
    }
  };
  const manifest = {
    schema_version: "misa.l1_l3_local_exhaust_manifest.v1",
    created_at: result.created_at,
    input: result.input,
    summary: result.summary
  };

  await writeJson(jsonPath, written);
  await writeText(mdPath, renderL1L3LocalExhaustMarkdown(written));
  await writeText(
    candidatesPath,
    written.future_real_probe_candidates.map((candidate) => JSON.stringify(candidate)).join("\n") + "\n"
  );
  await writeJson(manifestPath, manifest);
  return written;
}

export async function runL1L3LocalExhaustReport({
  repoRoot = process.cwd(),
  runsDir = "runs",
  sampleLibraryPath,
  parquetPath,
  partialFullJsonlPath,
  dataset = DEFAULT_SWE_REBENCH_DATASET,
  candidateLimit = DEFAULT_LOCAL_EXHAUST_CANDIDATE_LIMIT,
  parquetSummary,
  futureProbeCandidates,
  outDir,
  now = new Date()
} = {}) {
  const fullLibrary = await collectL3FeedbackReflectionAllSamples({ repoRoot, runsDir });
  const resolvedSampleLibraryPath = sampleLibraryPath
    ? resolvePath(repoRoot, sampleLibraryPath)
    : await findLatestFile({ repoRoot, runsDir, filename: "l1-l3-sample-library.json" });
  const sampleLibrary = resolvedSampleLibraryPath && await fileExists(resolvedSampleLibraryPath)
    ? {
      ...await readJson(resolvedSampleLibraryPath),
      __source_path: normalizePathForReport(repoRoot, resolvedSampleLibraryPath)
    }
    : null;
  const usedSourceIds = sampleLibrary ? [...sampleLibrarySourceIds(sampleLibrary)] : [];

  const parquetData = parquetSummary
    ? {
      summary: {
        ...parquetSummary,
        parquet_path: parquetSummary.parquet_path ?? normalizePathForReport(repoRoot, parquetPath),
        dataset: parquetSummary.dataset ?? dataset,
        already_sampled_source_count: parquetSummary.already_sampled_source_count ?? usedSourceIds.length
      },
      candidates: (futureProbeCandidates ?? []).map((candidate) => normalizeCandidate(candidate, dataset))
    }
    : parquetPath
      ? await collectSweRebenchParquetMetadata({
        parquetPath: resolvePath(repoRoot, parquetPath),
        dataset,
        usedSourceIds,
        candidateLimit
      })
      : { summary: null, candidates: [] };

  const partialFullJsonl = await inspectPartialJsonl({
    filePath: resolvePath(repoRoot, partialFullJsonlPath),
    expectedRowCount: parquetData.summary?.row_count ?? null,
    repoRoot
  });
  const result = buildL1L3LocalExhaustReport({
    fullLibrary,
    sampleLibrary,
    parquetSummary: parquetData.summary,
    futureProbeCandidates: parquetData.candidates,
    partialFullJsonl,
    repoRoot,
    runsDir,
    now
  });
  return writeL1L3LocalExhaustArtifacts({
    repoRoot,
    result,
    outDir,
    now
  });
}
