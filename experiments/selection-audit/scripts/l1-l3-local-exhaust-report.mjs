#!/usr/bin/env node

import {
  buildL1L3LocalExhaustReport,
  collectSweRebenchParquetMetadata,
  runL1L3LocalExhaustReport
} from "../lib/l1-l3-local-exhaust-report.mjs";
import {
  collectL3FeedbackReflectionAllSamples
} from "../lib/l3-feedback-reflection-replay.mjs";
import fs from "node:fs/promises";
import path from "node:path";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function readIntegerArg(name, fallback) {
  const value = readArg(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJsonIf(pathArg) {
  if (!pathArg) return null;
  return JSON.parse(await fs.readFile(path.resolve(pathArg), "utf8"));
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const runsDir = readArg("runs-dir") ?? "runs";
const sampleLibraryPath = readArg("sample-library");
const parquetPath = readArg("swe-rebench-parquet") ?? readArg("parquet");
const partialFullJsonlPath = readArg("partial-full-jsonl");
const dataset = readArg("dataset") ?? "swe-rebench-openhands";
const candidateLimit = readIntegerArg("candidate-limit", 500);
const outDir = readArg("out-dir");
const jsonOnly = hasArg("json");
const parquetMetadataJson = await readJsonIf(readArg("parquet-metadata-json"));

if (jsonOnly && parquetMetadataJson) {
  const fullLibrary = await collectL3FeedbackReflectionAllSamples({ runsDir });
  const result = buildL1L3LocalExhaustReport({
    fullLibrary,
    sampleLibrary: null,
    parquetSummary: parquetMetadataJson.summary ?? parquetMetadataJson,
    futureProbeCandidates: parquetMetadataJson.candidates ?? [],
    runsDir,
    now
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} else if (jsonOnly && parquetPath) {
  const fullLibrary = await collectL3FeedbackReflectionAllSamples({ runsDir });
  const parquetData = await collectSweRebenchParquetMetadata({
    parquetPath: path.resolve(parquetPath),
    dataset,
    candidateLimit
  });
  const result = buildL1L3LocalExhaustReport({
    fullLibrary,
    sampleLibrary: null,
    parquetSummary: parquetData.summary,
    futureProbeCandidates: parquetData.candidates,
    runsDir,
    now
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} else {
  const result = await runL1L3LocalExhaustReport({
    runsDir,
    sampleLibraryPath,
    parquetPath,
    partialFullJsonlPath,
    dataset,
    candidateLimit,
    parquetSummary: parquetMetadataJson?.summary ?? parquetMetadataJson ?? undefined,
    futureProbeCandidates: parquetMetadataJson?.candidates ?? undefined,
    outDir,
    now
  });
  console.log("misa l1/l3 local exhaust report");
  console.log(`run_id: ${result.created_at}`);
  console.log(`status: ${result.ok ? "pass" : "needs_attention"}`);
  console.log(`ok: ${result.ok}`);
  console.log(`historical_pool_decision_rows: ${result.summary.historical_pool_decision_rows}`);
  console.log(`historical_known_bad_unique_sources: ${result.summary.historical_known_bad_unique_sources}`);
  console.log(`reflection_scope_count: ${result.summary.reflection_scope_count}`);
  console.log(`reflection_l3_missing_count: ${result.summary.reflection_l3_missing_count}`);
  console.log(`parquet_row_count: ${result.summary.parquet_row_count}`);
  console.log(`parquet_resolved_false_count: ${result.summary.parquet_resolved_false_count}`);
  console.log(`parquet_non_submit_count: ${result.summary.parquet_non_submit_count}`);
  console.log(`future_probe_candidate_written_count: ${result.summary.future_probe_candidate_written_count}`);
  console.log(`can_create_more_real_l3_labels_without_llm: ${result.summary.can_create_more_real_l3_labels_without_llm}`);
  console.log(`product_line_verdict: ${result.summary.product_line_verdict}`);
  console.log(`output_dir: ${result.output.output_dir}`);
  console.log(`report_json: ${result.output.json_path}`);
  console.log(`report_md: ${result.output.markdown_path}`);
  console.log(`future_probe_candidates: ${result.output.future_probe_candidates_path}`);
  process.exitCode = result.ok ? 0 : 1;
}
