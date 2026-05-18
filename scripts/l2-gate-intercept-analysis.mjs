#!/usr/bin/env node
import {
  buildL2GateInterceptAnalysis,
  writeL2GateInterceptAnalysisArtifacts
} from "./lib/l2-gate-intercept-analysis.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

const repoRoot = process.cwd();
const runsDir = argValue("runs-dir") ?? "runs";
const outDir = argValue("out-dir") ?? "runs/l2-gate-intercept-analysis/latest-local-history";
const dryRun = hasArg("dry-run") || hasArg("no-write");

let result;
if (dryRun) {
  result = await buildL2GateInterceptAnalysis({ repoRoot, runsDir });
} else {
  result = await writeL2GateInterceptAnalysisArtifacts({ repoRoot, runsDir, outDir });
}

await writeJsonOutFile(result, argValue("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l2_report_count=${result.input.l2_report_count}`);
  console.log(`raw_result_count=${result.input.raw_result_count}`);
  console.log(`deduped_result_count=${result.input.deduped_result_count}`);
  console.log(`old_blocked_count=${result.summary.old_blocked_count}`);
  console.log(`old_blocked_near_pass_count=${result.summary.old_blocked_near_pass_count}`);
  console.log(`old_blocked_hard_fail_count=${result.summary.old_blocked_hard_fail_count}`);
  console.log(`old_blocked_salvageable_rate_pct=${result.summary.old_blocked_salvageable_rate_pct}`);
  console.log(`verdict=${result.summary.verdict}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}
