#!/usr/bin/env node

import {
  runL3FeedbackReflectionReplay,
  buildL3FeedbackReflectionReplayReport,
  collectL3FeedbackReflectionSamples
} from "../lib/l3-feedback-reflection-replay.mjs";

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

if (jsonOnly) {
  const library = await collectL3FeedbackReflectionSamples({
    runsDir: runsDir ?? undefined
  });
  const report = buildL3FeedbackReflectionReplayReport({
    library,
    repoRoot: process.cwd(),
    runsDir: runsDir ?? undefined,
    now: nowArg ? new Date(nowArg) : new Date()
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
} else {
  const result = await runL3FeedbackReflectionReplay({
    runsDir: runsDir ?? undefined,
    outDir: outDir ?? undefined,
    now: nowArg ? new Date(nowArg) : new Date()
  });
  console.log("misa l3 feedback reflection replay");
  console.log(`run_id: ${result.created_at}`);
  console.log(`status: ${result.ok ? "pass" : "needs_attention"}`);
  console.log(`ok: ${result.ok}`);
  console.log(`sample_count: ${result.summary.sample_count}`);
  console.log(`bad_sample_count: ${result.summary.bad_sample_count}`);
  console.log(`candidate_trigger_count: ${result.summary.candidate_trigger_count}`);
  console.log(`candidate_recall: ${result.summary.candidate_recall}`);
  console.log(`baseline_recall: ${result.summary.baseline_recall}`);
  console.log(`newly_caught_count: ${result.summary.newly_caught_count}`);
  console.log(`output_dir: ${result.output.output_dir}`);
  console.log(`library_jsonl: ${result.output.library_jsonl_path}`);
  console.log(`report_json: ${result.output.replay_json_path}`);
  console.log(`report_md: ${result.output.replay_markdown_path}`);
  process.exitCode = result.ok ? 0 : 1;
}
