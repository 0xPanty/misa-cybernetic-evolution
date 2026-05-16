#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  COMMAND_THRESHOLD_STRESS_DATASET,
  DEFAULT_COMMAND_STRESS_ADAPTATION_REPORT,
  writeExternalTrajectoryCommandStressArtifacts
} from "./lib/external-trajectory-command-stress.mjs";

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

const written = await writeExternalTrajectoryCommandStressArtifacts({
  adaptationReportPath: readArg("adaptation-report") ?? DEFAULT_COMMAND_STRESS_ADAPTATION_REPORT,
  outDir: readArg("out-dir"),
  now
});

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`external-trajectory-command-stress ok=${written.ok}`);
  console.log(`baseline_commit=${written.baseline.commit}`);
  console.log(`samples=${written.summary.sample_count}`);
  console.log(`stress_samples=${written.summary.by_dataset[COMMAND_THRESHOLD_STRESS_DATASET] ?? 0}`);
  console.log(`issues=${written.summary.issue_count}`);
  console.log(`raw_external_data_persisted=${written.safety.persists_raw_external_data}`);
  console.log(`zilliz_written=0`);
  console.log(`embedding_created=0`);
  console.log(`llm_api_calls=0`);
  console.log(`external_api_calls=0`);
  console.log(`vps_touched=false`);
  console.log(`github_pushed=false`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
