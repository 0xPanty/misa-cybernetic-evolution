#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  runExternalTrajectorySideBySide,
  writeExternalTrajectorySideBySideArtifacts
} from "./lib/external-trajectory-side-by-side.mjs";

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

const result = await runExternalTrajectorySideBySide({
  adaptationReportPath: readArg("adaptation-report"),
  alphaReportPath: readArg("alpha-report"),
  parameterProfileId: readArg("parameter-profile"),
  now
});

const written = dryRun
  ? result
  : await writeExternalTrajectorySideBySideArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`external-trajectory-side-by-side ok=${written.ok}`);
  console.log(`baseline_commit=${written.input.baseline_commit}`);
  console.log(`calibration_profile=${written.calibration_draft.profile}`);
  console.log(`selected_parameter_profile=${written.calibration_draft.parameter_profile_id}`);
  console.log(`recommended_parameter_profile=${written.parameter_sweep.recommended_profile_id}`);
  console.log(`sweep_candidates=${written.parameter_sweep.candidate_count}`);
  console.log(`samples=${written.summary.sample_count}`);
  console.log(`comparisons=${written.summary.comparison_count}`);
  console.log(`avg_baseline_score=${written.summary.avg_baseline_score}`);
  console.log(`avg_calibrated_score=${written.summary.avg_calibrated_score}`);
  console.log(`avg_delta=${written.summary.avg_delta}`);
  console.log(`improved=${written.summary.improved_count}`);
  console.log(`regressions=${written.summary.regression_count}`);
  console.log(`safety_regressions=${written.summary.safety_regression_count}`);
  console.log(`noise_false_positive_reduced=${written.summary.noise_false_positive_reduced_count}`);
  console.log(`actual_risk_preserved=${written.summary.actual_risk_preserved_count}`);
  console.log(`weak_proxy_downranked=${written.summary.weak_proxy_downranked_count}`);
  console.log(`pushback_mapped=${written.summary.pushback_mapped_count}`);
  console.log(`actual_risk_without_unsafe_label=${written.summary.data_diagnostics.actual_risk_without_unsafe_label_count}`);
  console.log(`holdout_passed=${written.summary.dev_holdout.holdout_passed}`);
  console.log(`shadow_policy_readout=${written.shadow_policy_readout.conclusion}`);
  console.log(`shadow_policy_channels=${written.shadow_policy_readout.policy_channels.length}`);
  console.log(`zilliz_written=0`);
  console.log(`embedding_created=0`);
  console.log(`llm_api_calls=0`);
  console.log(`external_api_calls=0`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
