#!/usr/bin/env node

import { runRealL2SemanticPressure } from "../lib/l3-real-l2-semantic-pressure.mjs";
import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";

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

function readCsvArg(name) {
  const value = readArg(name);
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();

const result = await runRealL2SemanticPressure({
  runsDir: readArg("runs-dir") ?? undefined,
  sourceProfile: readArg("source-profile") ?? undefined,
  l2ReportPaths: readCsvArg("l2-reports"),
  maxBase: Number(readArg("max-base") ?? 0),
  outDir: readArg("out-dir"),
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa real L2 semantic pressure");
  console.log(`run_id: ${result.created_at}`);
  console.log(`ok: ${result.ok}`);
  console.log(`needs_rule_review: ${result.needs_rule_review}`);
  console.log(`source_profile: ${result.summary.source_profile}`);
  console.log(`base_count: ${result.summary.base_count}`);
  console.log(`stored_real_llm_base_count: ${result.summary.stored_real_llm_base_count}`);
  console.log(`local_replay_base_count: ${result.summary.local_replay_base_count}`);
  console.log(`clean_control_count: ${result.summary.clean_control_count}`);
  console.log(`bad_sample_count: ${result.summary.bad_sample_count}`);
  console.log(`bad_format_gate_pass_rate: ${result.summary.bad_format_gate_pass_rate}`);
  console.log(`l3_false_pass_count: ${result.summary.l3_false_pass_count}`);
  console.log(`l3_false_pass_rate: ${result.summary.l3_false_pass_rate}`);
  console.log(`semantic_false_pass_caught_count: ${result.summary.semantic_false_pass_caught_count}`);
  console.log(`semantic_false_pass_recall: ${result.summary.semantic_false_pass_recall}`);
  console.log(`clean_semantic_false_positive_count: ${result.summary.clean_semantic_false_positive_count}`);
  console.log(`clean_semantic_false_positive_rate: ${result.summary.clean_semantic_false_positive_rate}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`touches_vps: ${result.safety.touches_vps}`);
  console.log(`pushes_github: ${result.safety.pushes_github}`);
  console.log(`writes_durable_bad_seed: ${result.safety.writes_durable_bad_seed}`);
  console.log(`writes_pool_decisions_jsonl: ${result.safety.writes_pool_decisions_jsonl}`);
  console.log(`output_dir: ${result.output.output_dir}`);
  console.log(`report_json: ${result.output.json_path}`);
  console.log(`report_md: ${result.output.markdown_path}`);
}

process.exitCode = result.ok ? 0 : 1;
