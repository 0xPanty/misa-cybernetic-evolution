#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  runExternalTrajectoryFinalComparison,
  writeExternalTrajectoryFinalComparisonArtifacts
} from "./lib/external-trajectory-final-comparison.mjs";

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

const result = await runExternalTrajectoryFinalComparison({
  sideBySideReportPath: readArg("side-by-side-report"),
  alphaReportPath: readArg("alpha-report"),
  baselineRef: readArg("baseline-ref"),
  baselineCommit: readArg("baseline-commit"),
  optimizedRef: readArg("optimized-ref"),
  optimizedCommit: readArg("optimized-commit") ?? "HEAD",
  now
});

const written = dryRun
  ? result
  : await writeExternalTrajectoryFinalComparisonArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`external-trajectory-final-comparison ok=${written.ok}`);
  console.log(`baseline_ref=${written.baseline.ref}`);
  console.log(`baseline_commit=${written.baseline.commit}`);
  console.log(`optimized_ref=${written.optimized.ref}`);
  console.log(`optimized_commit=${written.optimized.commit}`);
  console.log(`selected_profile=${written.optimized.selected_profile}`);
  console.log(`samples=${written.overall.count}`);
  console.log(`baseline_avg_score=${written.overall.baseline_avg_score}`);
  console.log(`optimized_avg_score=${written.overall.optimized_avg_score}`);
  console.log(`avg_delta=${written.overall.avg_delta}`);
  console.log(`baseline_expected_match_rate=${written.overall.baseline_expected_match_rate}`);
  console.log(`optimized_expected_match_rate=${written.overall.optimized_expected_match_rate}`);
  console.log(`expected_match_lift=${written.overall.expected_match_lift}`);
  console.log(`regression_count=${written.overall.regression_count}`);
  console.log(`safety_regressions=${written.overall.safety_regression_count}`);
  console.log(`holdout_passed=${written.side_by_side_input.holdout_passed}`);
  console.log(`baseline_to_optimized_action_change_count=${written.overall.baseline_to_optimized_action_change_count}`);
  console.log(`shadow_readout_action_change_count=${written.shadow_readout_closure.action_change_count}`);
  console.log(`grouped_holdout=${written.grouped_holdout.conclusion}`);
  console.log(`same_action_delta_share=${written.action_score_separation.score_level.same_action_delta_share}`);
  console.log(`action_change_delta_share=${written.action_score_separation.score_level.action_change_delta_share}`);
  console.log(`route_authority_changed=${written.shadow_readout_closure.route_authority_changed}`);
  console.log(`winner_authority_changed=${written.shadow_readout_closure.winner_authority_changed}`);
  console.log(`production_authority=${written.shadow_readout_closure.production_authority}`);
  console.log(`verdict=${written.verdict}`);
  console.log(`zilliz_written=${written.boundaries.zilliz_written}`);
  console.log(`embedding_created=${written.boundaries.embedding_created}`);
  console.log(`llm_api_calls=${written.boundaries.llm_api_calls}`);
  console.log(`external_api_calls=${written.boundaries.external_api_calls}`);
  console.log(`vps_touched=${written.boundaries.vps_touched}`);
  console.log(`github_pushed=${written.boundaries.github_pushed}`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
