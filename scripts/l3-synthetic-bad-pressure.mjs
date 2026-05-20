#!/usr/bin/env node

import { runSyntheticBadPressure } from "./lib/l3-synthetic-bad-pressure.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";

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

const result = await runSyntheticBadPressure({
  sourceCandidatePath: readArg("source-candidates"),
  localExhaustReportPath: readArg("local-exhaust-report"),
  parquetPath: readArg("parquet"),
  dataset: readArg("dataset") ?? undefined,
  taskProfile: readArg("task-profile") ?? undefined,
  variantProfile: readArg("variant-profile") ?? undefined,
  pythonBin: readArg("python-bin") ?? undefined,
  outDir: readArg("out-dir"),
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa l3 synthetic_bad pressure");
  console.log(`run_id: ${result.created_at}`);
  console.log(`ok: ${result.ok}`);
  console.log(`gate_all_blocked: ${result.gate_all_blocked}`);
  console.log(`needs_rule_review: ${result.needs_rule_review}`);
  console.log(`task_profile: ${result.requirements.task_profile}`);
  console.log(`variant_profile: ${result.summary.variant_profile}`);
  console.log(`base_task_count: ${result.summary.base_task_count}`);
  console.log(`synthetic_sample_count: ${result.summary.synthetic_sample_count}`);
  console.log(`l3_intercept_rate: ${result.summary.l3_intercept_rate}`);
  console.log(`feedback_trigger_rate: ${result.summary.feedback_trigger_rate}`);
  console.log(`candidate_count_2_suggestion_count: ${result.summary.candidate_count_2_suggestion_count}`);
  console.log(`primary_agent_suggestion_count: ${result.summary.primary_agent_suggestion_count}`);
  console.log(`false_pass_count: ${result.summary.false_pass_count}`);
  console.log(`adversarial_false_pass_count: ${result.summary.adversarial_false_pass_count}`);
  console.log(`semantic_observer_enabled: ${result.summary.semantic_observer_enabled}`);
  console.log(`semantic_trigger_count: ${result.summary.semantic_trigger_count}`);
  console.log(`semantic_false_pass_caught_count: ${result.summary.semantic_false_pass_caught_count}`);
  console.log(`semantic_false_pass_recall: ${result.summary.semantic_false_pass_recall}`);
  console.log(`writes_durable_bad_seed: ${result.safety.writes_durable_bad_seed}`);
  console.log(`writes_pool_decisions_jsonl: ${result.safety.writes_pool_decisions_jsonl}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`touches_vps: ${result.safety.touches_vps}`);
  console.log(`pushes_github: ${result.safety.pushes_github}`);
  console.log(`output_dir: ${result.output.output_dir}`);
  console.log(`report_json: ${result.output.json_path}`);
  console.log(`report_md: ${result.output.markdown_path}`);
}

process.exitCode = result.ok ? 0 : 1;
