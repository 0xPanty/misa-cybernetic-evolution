#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  DEFAULT_WORK_ORDER_EVAL_SEEDS,
  runWorkOrderQualityEvaluation,
  writeWorkOrderQualityArtifacts
} from "./lib/work-order-quality-eval.mjs";

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

function parseSeeds(value) {
  if (!value) return DEFAULT_WORK_ORDER_EVAL_SEEDS;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const seeds = parseSeeds(readArg("seeds") ?? readArg("seed"));
const dryRun = hasArg("dry-run") || hasArg("no-write");

let result = await runWorkOrderQualityEvaluation({
  seeds,
  now
});

if (!dryRun) {
  result = await writeWorkOrderQualityArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`work-order-quality ok=${result.ok}`);
  console.log(`sources=${result.summary.source_set_count}`);
  console.log(`work_orders=${result.summary.work_order_count}`);
  console.log(`comparisons=${result.summary.comparison_count}`);
  console.log(`avg_delta=${result.summary.avg_delta}`);
  console.log(`positive_lift_rate=${result.summary.positive_lift_rate}`);
  console.log(`safety_regressions=${result.summary.safety_regression_count}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
