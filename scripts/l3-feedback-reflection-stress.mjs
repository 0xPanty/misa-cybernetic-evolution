#!/usr/bin/env node

import {
  buildL3FeedbackReflectionStressReport,
  runL3FeedbackReflectionStress
} from "./lib/l3-feedback-reflection-stress.mjs";
import {
  collectL3FeedbackReflectionAllSamples
} from "./lib/l3-feedback-reflection-replay.mjs";

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
const runsDir = readArg("runs-dir");
const outDir = readArg("out-dir");
const jsonOnly = hasArg("json");
const now = nowArg ? new Date(nowArg) : new Date();

if (jsonOnly) {
  const fullLibrary = await collectL3FeedbackReflectionAllSamples({
    runsDir: runsDir ?? undefined
  });
  const report = buildL3FeedbackReflectionStressReport({
    fullLibrary,
    repoRoot: process.cwd(),
    runsDir: runsDir ?? undefined,
    now
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} else {
  const result = await runL3FeedbackReflectionStress({
    runsDir: runsDir ?? undefined,
    outDir: outDir ?? undefined,
    now
  });
  console.log("misa l3 feedback reflection stress");
  console.log(`run_id: ${result.created_at}`);
  console.log(`status: ${result.ok ? "pass" : "needs_attention"}`);
  console.log(`ok: ${result.ok}`);
  console.log(`full_sample_count: ${result.summary.full_sample_count}`);
  console.log(`strict_seed_sample_count: ${result.summary.strict_seed_sample_count}`);
  console.log(`strict_seed_bad_count: ${result.summary.strict_seed_bad_count}`);
  console.log(`documented_strict_trigger_count: ${result.summary.documented_strict_trigger_count}`);
  console.log(`documented_strict_clean_good_false_positive_count: ${result.summary.documented_strict_clean_good_false_positive_count}`);
  console.log(`documented_strict_holdout_trigger_count: ${result.summary.documented_strict_holdout_trigger_count}`);
  console.log(`over_broad_clean_good_false_positive_count: ${result.summary.over_broad_clean_good_false_positive_count}`);
  console.log(`over_broad_holdout_trigger_count: ${result.summary.over_broad_holdout_trigger_count}`);
  console.log(`strict_boundary_probe_trigger_count: ${result.summary.strict_boundary_probe_trigger_count}`);
  console.log(`widening_boundary_probe_trigger_count: ${result.summary.widening_boundary_probe_trigger_count}`);
  console.log(`l1_promotion_recommendation: ${result.summary.l1_promotion_recommendation}`);
  console.log(`output_dir: ${result.output.output_dir}`);
  console.log(`full_library_jsonl: ${result.output.full_library_jsonl_path}`);
  console.log(`report_json: ${result.output.stress_json_path}`);
  console.log(`report_md: ${result.output.stress_markdown_path}`);
  process.exitCode = result.ok ? 0 : 1;
}
