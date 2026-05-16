#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  runExternalTrajectoryAlpha,
  writeExternalTrajectoryAlphaArtifacts
} from "./lib/external-trajectory-alpha.mjs";

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
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");

const result = await runExternalTrajectoryAlpha({
  sideBySideReportPath: readArg("side-by-side-report"),
  adaptationReportPath: readArg("adaptation-report"),
  now
});

const written = dryRun
  ? result
  : await writeExternalTrajectoryAlphaArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`external-trajectory-alpha ok=${written.ok}`);
  console.log(`baseline_commit=${written.input.baseline_commit}`);
  console.log(`selected_parameter_profile=${written.input.selected_parameter_profile}`);
  console.log(`recommended_parameter_profile=${written.input.recommended_parameter_profile}`);
  console.log(`comparisons=${written.input.comparison_count}`);
  console.log(`avg_delta=${written.summary.avg_delta}`);
  console.log(`safety_regressions=${written.summary.safety_regression_count}`);
  console.log(`holdout_passed=${written.summary.holdout_passed}`);
  console.log(`signal_count=${written.summary.signal_count}`);
  console.log(`actionable_alpha_count=${written.summary.actionable_alpha_count}`);
  console.log(`top_actionable=${written.summary.top_actionable_signal_ids.join(",")}`);
  console.log(`zilliz_written=0`);
  console.log(`embedding_created=0`);
  console.log(`llm_api_calls=0`);
  console.log(`external_api_calls=0`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
