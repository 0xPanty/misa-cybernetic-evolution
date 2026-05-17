#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  buildL2L3SelectionAuditReport,
  writeL2L3SelectionAuditArtifacts
} from "./lib/l2-l3-selection-audit.mjs";
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

function numberArg(name) {
  const value = readArg(name);
  return value === undefined ? undefined : Number(value);
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

const repoRoot = process.cwd();
const l2ReportPath = readArg("l2-report");
if (!l2ReportPath) {
  throw new Error("--l2-report is required");
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const l2Report = JSON.parse(await fs.readFile(resolvePath(repoRoot, l2ReportPath), "utf8"));
const thresholds = {
  ...(numberArg("yellow-quality-min") !== undefined ? { yellow_quality_min: numberArg("yellow-quality-min") } : {}),
  ...(numberArg("yellow-actionable-task-min") !== undefined ? { yellow_actionable_task_min: numberArg("yellow-actionable-task-min") } : {}),
  ...(numberArg("red-spot-check-rate") !== undefined ? { red_spot_check_rate: numberArg("red-spot-check-rate") } : {}),
  ...(numberArg("red-spot-check-min") !== undefined ? { red_spot_check_min: numberArg("red-spot-check-min") } : {}),
  ...(numberArg("red-spot-check-max") !== undefined ? { red_spot_check_max: numberArg("red-spot-check-max") } : {}),
  ...(numberArg("l4-preview-limit") !== undefined ? { l4_preview_limit: numberArg("l4-preview-limit") } : {})
};

let result = buildL2L3SelectionAuditReport({
  l2Report,
  l2ReportPath,
  repoRoot,
  batchSize: numberArg("batch-size") ?? DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  thresholds,
  now
});

if (!hasArg("dry-run") && !hasArg("no-write")) {
  result = await writeL2L3SelectionAuditArtifacts({
    repoRoot,
    result,
    l2Report,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l2-l3-selection-audit ok=${result.ok}`);
  console.log(`samples=${result.summary.sample_count}`);
  console.log(`batch_status=${result.summary.batch_status}`);
  console.log(`green=${result.summary.pool_counts.green}`);
  console.log(`yellow=${result.summary.pool_counts.yellow}`);
  console.log(`red=${result.summary.pool_counts.red}`);
  if (result.summary.candidate_count !== null && result.summary.candidate_count !== undefined) {
    console.log(`requested_candidate_count=${result.summary.requested_candidate_count}`);
    console.log(`candidate_count=${result.summary.candidate_count}`);
    console.log(`winner_selected=${result.summary.winner_selected_count}`);
    console.log(`candidate_best_found=${result.summary.candidate_best_found_count}`);
  }
  console.log(`l4_forward=${result.summary.l4_forward_count}`);
  console.log(`red_spot_check=${result.summary.red_spot_check_count}`);
  console.log(`possible_false_reject=${result.summary.possible_false_reject_count}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
