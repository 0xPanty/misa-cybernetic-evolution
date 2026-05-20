#!/usr/bin/env node

import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  buildL4WorkOrderReviewReport,
  parseHermesDelegateArgsJson,
  writeL4WorkOrderReviewArtifacts
} from "../lib/l4-work-order-review.mjs";

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

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");
const hermesDelegateTimeoutMs = readArg("hermes-delegate-timeout-ms");

let result = await buildL4WorkOrderReviewReport({
  l2ReportPath: readArg("l2-report"),
  l3ReportPath: readArg("l3-report"),
  sourceIds: csvArg("source-ids"),
  includeRedSpotChecks: !hasArg("no-red-spot-checks"),
  provider: readArg("provider") ?? undefined,
  hermesDelegateCommand: readArg("hermes-delegate-command") ?? undefined,
  hermesDelegateArgs: parseHermesDelegateArgsJson(readArg("hermes-delegate-args-json")),
  hermesDelegateProvider: readArg("hermes-delegate-provider") ?? undefined,
  hermesDelegateModel: readArg("hermes-delegate-model") ?? undefined,
  hermesDelegateTimeoutMs: hermesDelegateTimeoutMs ? Number(hermesDelegateTimeoutMs) : undefined,
  now
});

if (!dryRun) {
  result = await writeL4WorkOrderReviewArtifacts({
    result,
    outDir: readArg("out-dir"),
    l3ReportPath: readArg("l3-report"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l4-work-order-review ok=${result.ok}`);
  console.log(`provider=${result.provider}`);
  console.log(`model=${result.model}`);
  console.log(`samples=${result.summary.sample_count}`);
  console.log(`verdict_counts=${JSON.stringify(result.summary.verdict_counts)}`);
  console.log(`avg_execution_readiness_score=${result.summary.avg_execution_readiness_score}`);
  console.log(`no_context_executable=${result.summary.no_context_executable_count}`);
  console.log(`requires_user_authorization=${result.summary.requires_user_authorization_count}`);
  console.log(`provider_error_count=${result.summary.provider_error_count}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  if (result.delegate?.provider || result.delegate?.model) {
    console.log(`hermes_delegate=${result.delegate.provider ?? "default"}/${result.delegate.model ?? "default"}`);
  }
  for (const item of result.reviews) {
    const providerError = item.provider_error ? ` provider_error=${item.provider_error.code}` : "";
    const auth = item.review.requires_user_authorization ? ` auth=${item.review.authorization_scopes.join("+")}` : "";
    console.log(`- ${item.source_id} verdict=${item.review.verdict} target=${item.review.handoff_target} score=${item.review.execution_readiness_score} no_context=${item.review.can_execute_without_parent_context}${auth}${providerError} title=${item.draft_title ?? "none"}`);
  }
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
    console.log(`l4_review_path=${result.output.l4_review_path}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
