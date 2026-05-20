#!/usr/bin/env node

import {
  buildL1L3SampleLibrary,
  runL1L3SampleLibrary
} from "../lib/l1-l3-sample-library.mjs";

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

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const common = {
  adaptationReportPath: readArg("adaptation-report"),
  l1AlphaReportPath: readArg("l1-alpha-report"),
  runsDir: readArg("runs-dir") ?? "runs",
  now,
  minBadSeedsForL1: readIntegerArg("min-bad-seeds-for-l1", undefined),
  minCleanLabelsForL1: readIntegerArg("min-clean-labels-for-l1", undefined)
};

const jsonOnly = hasArg("json");
if (jsonOnly) {
  const result = await buildL1L3SampleLibrary(common);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} else {
  const result = await runL1L3SampleLibrary({
    ...common,
    outDir: readArg("out-dir")
  });
  console.log("misa l1/l3 sample library");
  console.log(`run_id: ${result.created_at}`);
  console.log(`status: ${result.ok ? "pass" : "needs_attention"}`);
  console.log(`ok: ${result.ok}`);
  console.log(`adaptation_sample_count: ${result.summary.adaptation_sample_count}`);
  console.log(`l1_sample_count: ${result.summary.l1_sample_count}`);
  console.log(`reflection_scope_count: ${result.summary.reflection_scope_count}`);
  console.log(`reflection_l3_labeled_count: ${result.summary.reflection_l3_labeled_count}`);
  console.log(`reflection_l3_missing_count: ${result.summary.reflection_l3_missing_count}`);
  console.log(`reflection_bad_seed_count: ${result.summary.reflection_bad_seed_count}`);
  console.log(`reflection_clean_labeled_count: ${result.summary.reflection_clean_labeled_count}`);
  console.log(`reflection_queue_count: ${result.summary.reflection_queue_count}`);
  console.log(`l1_auto_strategy_ready: ${result.summary.product_gate.l1_auto_strategy_ready}`);
  console.log(`output_dir: ${result.output.output_dir}`);
  console.log(`report_json: ${result.output.json_path}`);
  console.log(`report_md: ${result.output.markdown_path}`);
  console.log(`queue_jsonl: ${result.output.queue_jsonl_path}`);
  process.exitCode = result.ok ? 0 : 1;
}
