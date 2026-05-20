#!/usr/bin/env node

import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  DEFAULT_EXTERNAL_TRAJECTORY_DATASETS,
  DEFAULT_EXTERNAL_TRAJECTORY_SAMPLING_PROFILE,
  DEFAULT_SWE_CHAT_MAX_TRANSCRIPT_BYTES,
  DEFAULT_SWE_CHAT_SCAN_LIMIT,
  runExternalTrajectoryAdaptation,
  writeExternalTrajectoryAdaptationArtifacts
} from "../lib/external-trajectory-adapter.mjs";

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

function parseList(value, fallback) {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");
const result = await runExternalTrajectoryAdaptation({
  datasetRoot: readArg("dataset-root"),
  datasets: parseList(readArg("datasets"), DEFAULT_EXTERNAL_TRAJECTORY_DATASETS),
  maxPerDataset: parseInteger(readArg("max-per-dataset"), 2),
  targetSampleCount: readArg("target-samples") ? parseInteger(readArg("target-samples"), undefined) : undefined,
  samplingProfile: readArg("sampling-profile") ?? DEFAULT_EXTERNAL_TRAJECTORY_SAMPLING_PROFILE,
  sweChatScanLimit: parseInteger(readArg("swe-chat-scan-limit"), DEFAULT_SWE_CHAT_SCAN_LIMIT),
  sweChatMaxTranscriptBytes: parseInteger(readArg("swe-chat-max-transcript-bytes"), DEFAULT_SWE_CHAT_MAX_TRANSCRIPT_BYTES),
  sweRebenchSidecarPath: readArg("swe-rebench-sidecar"),
  baselineCommit: readArg("baseline-commit"),
  now
});

const written = dryRun
  ? result
  : await writeExternalTrajectoryAdaptationArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`external-trajectory-adaptation ok=${written.ok}`);
  console.log(`baseline_commit=${written.baseline.commit}`);
  console.log(`baseline_dirty=${written.baseline.dirty}`);
  console.log(`sampling_profile=${written.batch.sampling_profile}`);
  console.log(`target_samples=${written.batch.target_sample_count ?? "none"}`);
  console.log(`samples=${written.summary.sample_count}`);
  console.log(`issues=${written.summary.issue_count}`);
  console.log(`blocked_datasets=${written.summary.blocked_dataset_count}`);
  console.log(`issue_record_rate=${written.summary.rates.issue_record_rate}`);
  console.log(`resolved_proxy_rate=${written.summary.rates.resolved_proxy_rate}`);
  console.log(`user_pushback_record_rate=${written.summary.rates.user_pushback_record_rate}`);
  console.log(`swe_chat_likely_noise_keyword_rate=${written.summary.swe_chat_context.likely_noise_keyword_rate}`);
  console.log(`suggestions=${written.summary.adoption_ledger.suggestion_count}`);
  console.log(`adopted=${written.summary.adoption_ledger.adopted_count}`);
  console.log(`rejected=${written.summary.adoption_ledger.rejected_count}`);
  console.log(`safety_regressions=${written.summary.adoption_ledger.safety_regression_after_adoption_count}`);
  console.log(`llm_api_calls=0`);
  console.log(`external_api_calls=0`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
