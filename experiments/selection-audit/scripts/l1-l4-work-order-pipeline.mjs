#!/usr/bin/env node

import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  buildL1L4WorkOrderPipelineReport,
  writeL1L4WorkOrderPipelineArtifacts
} from "../lib/l1-l4-work-order-pipeline.mjs";

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

function numberArg(name) {
  const value = readArg(name);
  return value === undefined ? undefined : Number(value);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");

let result = await buildL1L4WorkOrderPipelineReport({
  l2ReportPath: readArg("l2-report"),
  onlineShadowReportPath: readArg("online-shadow-report"),
  perceptionDigestPath: readArg("perception-digest"),
  sourceIds: csvArg("source-ids"),
  maxSamples: numberArg("max-samples") ?? undefined,
  l2Provider: readArg("l2-provider") ?? readArg("provider") ?? undefined,
  l2Model: readArg("l2-model") ?? readArg("model") ?? undefined,
  candidateCount: numberArg("candidate-count") ?? (hasArg("candidate-recheck") ? 2 : undefined),
  repairAttempts: numberArg("repair-attempts") ?? undefined,
  batchSize: numberArg("batch-size") ?? undefined,
  includeRedSpotChecks: !hasArg("no-red-spot-checks"),
  l4Provider: readArg("l4-provider") ?? undefined,
  now
});

if (!dryRun) {
  result = await writeL1L4WorkOrderPipelineArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l1-l4-work-order-pipeline ok=${result.ok}`);
  console.log(`l2_provider=${result.input.l2_provider}`);
  console.log(`l4_provider=${result.input.l4_provider}`);
  console.log(`l2_generated=${result.summary.l2_generated}`);
  console.log(`l2_samples=${result.summary.l2_sample_count}`);
  console.log(`l2_drafts=${result.summary.l2_draft_count}`);
  console.log(`l3_passed=${result.summary.l3_passed_gate_count}`);
  console.log(`l3_failed=${result.summary.l3_failed_gate_count}`);
  console.log(`l3_recheck=${result.summary.l3_recheck_triggered_count}`);
  console.log(`l3_l4_forward=${result.summary.l3_l4_forward_count}`);
  console.log(`l4_samples=${result.summary.l4_sample_count}`);
  console.log(`l4_verdict_counts=${JSON.stringify(result.summary.l4_verdict_counts)}`);
  console.log(`l4_handoff_target_counts=${JSON.stringify(result.summary.l4_handoff_target_counts)}`);
  console.log(`requires_user_authorization=${result.summary.l4_requires_user_authorization_count}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  console.log(`external_api_calls=${result.summary.external_api_calls}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
    console.log(`pipeline_report=${result.output.json_path}`);
    console.log(`l2_report=${result.output.l2_report_path}`);
    console.log(`l3_report=${result.output.l3_report_path}`);
    console.log(`l4_report=${result.output.l4_report_path}`);
    console.log(`l4_review=${result.output.l4_review_path}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
