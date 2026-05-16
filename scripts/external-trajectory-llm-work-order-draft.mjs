#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  buildExternalTrajectoryLlmWorkOrderDraftReport,
  writeExternalTrajectoryLlmWorkOrderDraftArtifacts
} from "./lib/external-trajectory-llm-work-order-draft.mjs";

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

function csvArg(name) {
  const value = readArg(name);
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");
const maxSamples = readArg("max-samples");
const repairAttempts = readArg("repair-attempts");

let result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
  onlineShadowReportPath: readArg("online-shadow-report"),
  perceptionDigestPath: readArg("perception-digest"),
  sourceIds: csvArg("source-ids"),
  maxSamples: maxSamples ? Number(maxSamples) : undefined,
  provider: readArg("provider") ?? undefined,
  model: readArg("model") ?? undefined,
  ollamaEndpoint: readArg("ollama-endpoint") ?? undefined,
  repairAttempts: repairAttempts ? Number(repairAttempts) : undefined,
  now
});

if (!dryRun) {
  result = await writeExternalTrajectoryLlmWorkOrderDraftArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`external-trajectory-llm-work-order ok=${result.ok}`);
  console.log(`provider=${result.provider}`);
  console.log(`model=${result.model}`);
  console.log(`samples=${result.summary.sample_count}`);
  console.log(`passed_gate=${result.summary.passed_gate_count}`);
  console.log(`failed_gate=${result.summary.failed_gate_count}`);
  console.log(`avg_quality_score=${result.summary.avg_quality_score}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  for (const item of result.results) {
    console.log(`- ${item.source_id} ok=${item.gate.ok} quality=${item.gate.quality_score} title=${item.draft?.title ?? "PARSE_FAILED"}`);
  }
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
