#!/usr/bin/env node

import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  buildExternalTrajectoryLlmWorkOrderDraftReport,
  writeExternalTrajectoryLlmWorkOrderDraftArtifacts
} from "../lib/external-trajectory-llm-work-order-draft.mjs";

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

function csvArg(name) {
  const value = readArg(name);
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function jsonArrayArg(name) {
  const value = readArg(name);
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`--${name} must be a JSON array`);
  return parsed.map((item) => String(item));
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");
const maxSamples = readArg("max-samples");
const repairAttempts = readArg("repair-attempts");
const candidateCount = readArg("candidate-count");
const candidateRecheck = hasArg("candidate-recheck");
const ollamaTimeoutMs = readArg("ollama-timeout-ms");
const hermesDelegateTimeoutMs = readArg("hermes-delegate-timeout-ms");

let result = await buildExternalTrajectoryLlmWorkOrderDraftReport({
  onlineShadowReportPath: readArg("online-shadow-report"),
  perceptionDigestPath: readArg("perception-digest"),
  sourceIds: csvArg("source-ids"),
  maxSamples: maxSamples ? Number(maxSamples) : undefined,
  provider: readArg("provider") ?? undefined,
  model: readArg("model") ?? undefined,
  ollamaEndpoint: readArg("ollama-endpoint") ?? undefined,
  ollamaTimeoutMs: ollamaTimeoutMs ? Number(ollamaTimeoutMs) : undefined,
  hermesDelegateCommand: readArg("hermes-delegate-command") ?? undefined,
  hermesDelegateArgs: jsonArrayArg("hermes-delegate-args-json"),
  hermesDelegateProvider: readArg("hermes-delegate-provider") ?? undefined,
  hermesDelegateModel: readArg("hermes-delegate-model") ?? undefined,
  hermesDelegateTimeoutMs: hermesDelegateTimeoutMs ? Number(hermesDelegateTimeoutMs) : undefined,
  repairAttempts: repairAttempts ? Number(repairAttempts) : undefined,
  candidateCount: candidateCount ? Number(candidateCount) : (candidateRecheck ? 2 : undefined),
  now
});

if (!dryRun) {
  result = await writeExternalTrajectoryLlmWorkOrderDraftArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`external-trajectory-llm-work-order ok=${result.ok}`);
  console.log(`provider=${result.provider}`);
  console.log(`model=${result.model}`);
  console.log(`samples=${result.summary.sample_count}`);
  console.log(`candidate_count_policy=${result.summary.candidate_count_policy}`);
  console.log(`candidate_mode=${result.summary.candidate_mode}`);
  console.log(`requested_candidate_count=${result.summary.requested_candidate_count}`);
  console.log(`requested_candidate_count_histogram=${JSON.stringify(result.summary.requested_candidate_count_histogram ?? {})}`);
  console.log(`l1_dynamic_recheck=${result.summary.l1_dynamic_recheck_count}`);
  console.log(`light_single=${result.summary.light_single_count}`);
  console.log(`candidate_count=${result.summary.candidate_count}`);
  console.log(`winner_selected=${result.summary.winner_selected_count}`);
  console.log(`passed_gate=${result.summary.passed_gate_count}`);
  console.log(`failed_gate=${result.summary.failed_gate_count}`);
  console.log(`avg_quality_score=${result.summary.avg_quality_score}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  if (result.delegate?.provider || result.delegate?.model) {
    console.log(`hermes_delegate=${result.delegate.provider ?? "default"}/${result.delegate.model ?? "default"}`);
  }
  for (const item of result.results) {
    const providerError = item.provider_error ? ` provider_error=${item.provider_error.code}` : "";
    const candidateText = item.candidates?.length ? ` candidates=${item.candidates.length} winner=${item.winner_candidate_id}` : "";
    const decisionText = item.candidate_count_decision ? ` decision=${item.candidate_count_decision.trigger}` : "";
    console.log(`- ${item.source_id} ok=${item.gate.ok} quality=${item.gate.quality_score}${decisionText}${candidateText}${providerError} title=${item.draft?.title ?? "PARSE_FAILED"}`);
  }
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
