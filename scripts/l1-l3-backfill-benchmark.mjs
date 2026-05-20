#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  DEFAULT_L1_L3_BACKFILL_BUCKET,
  DEFAULT_L1_L3_BACKFILL_LIMIT,
  runL1L3BackfillBenchmark
} from "./lib/l1-l3-backfill-benchmark.mjs";

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

const nowArg = readArg("now");
const result = await runL1L3BackfillBenchmark({
  queuePath: readArg("queue"),
  onlineShadowReportPath: readArg("online-shadow-report"),
  adaptationReportPath: readArg("adaptation-report"),
  l1AlphaReportPath: readArg("l1-alpha-report"),
  runsDir: readArg("runs-dir") ?? "runs",
  outDir: readArg("out-dir"),
  limit: Number(readArg("limit") ?? DEFAULT_L1_L3_BACKFILL_LIMIT),
  bucket: readArg("bucket") ?? DEFAULT_L1_L3_BACKFILL_BUCKET,
  now: nowArg ? new Date(nowArg) : new Date()
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l1-l3-backfill-benchmark ok=${result.ok}`);
  console.log(`selected_source_count=${result.summary.selected_source_count}`);
  console.log(`old_pool_counts=${JSON.stringify(result.summary.old_pool_counts)}`);
  console.log(`new_pool_counts=${JSON.stringify(result.summary.new_pool_counts)}`);
  console.log(`old_bad_or_review_count=${result.summary.old_bad_or_review_count}`);
  console.log(`new_clean_count=${result.summary.new_clean_count}`);
  console.log(`improved_to_green_count=${result.summary.improved_to_green_count}`);
  console.log(`regressed_from_green_count=${result.summary.regressed_from_green_count}`);
  console.log(`post_reflection_labeled=${result.summary.post_sample_library.reflection_l3_labeled_count}`);
  console.log(`post_reflection_missing=${result.summary.post_sample_library.reflection_l3_missing_count}`);
  console.log(`post_reflection_bad_seed=${result.summary.post_sample_library.reflection_bad_seed_count}`);
  console.log(`post_reflection_clean=${result.summary.post_sample_library.reflection_clean_labeled_count}`);
  console.log(`l1_auto_strategy_ready=${result.summary.post_sample_library.product_gate.l1_auto_strategy_ready}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  console.log(`external_api_calls=${result.summary.external_api_calls}`);
  console.log(`output_dir=${result.outputs.output_dir}`);
}

process.exitCode = result.ok ? 0 : 1;
