#!/usr/bin/env node

import {
  DEFAULT_QIANXUESEN_HEALTH_ROOT,
  runQianxuesenFullLoopHealth
} from "./lib/qianxuesen-full-loop-health.mjs";

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
const result = await runQianxuesenFullLoopHealth({
  rootDir: readArg("root") ?? DEFAULT_QIANXUESEN_HEALTH_ROOT,
  now: nowArg ? new Date(nowArg) : undefined,
  keepHistory: !hasArg("no-history")
});

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const failedComponents = Object.entries(result.component_status)
    .filter(([, status]) => status !== "pass")
    .map(([name]) => name);

  console.log("misa qianxuesen full-loop health");
  console.log(`run_id: ${result.run_id}`);
  console.log(`status: ${result.status}`);
  console.log(`ok: ${result.ok}`);
  console.log(`scope: ${result.scope}`);
  console.log(`blocking_failures: ${result.blocking_failures.length}`);
  console.log(`failed_components: ${failedComponents.length ? failedComponents.join(", ") : "none"}`);
  console.log(`verdict: ${result.verdict.plain}`);
  console.log(`routes: ${result.coverage.route_coverage.join(", ")}`);
  console.log(`samples: ${result.coverage.sample_sets}`);
  console.log(`sources: ${result.coverage.sources}`);
  console.log(`atomic_lessons: ${result.coverage.atomic_lessons}`);
  console.log(`retrieval_top1_exact_recall: ${result.coverage.retrieval_top1_exact_recall}`);
  console.log(`perception_replay_ok: ${result.coverage.perception_replay_ok}`);
  console.log(`judge_recommended: ${result.coverage.judge_recommended}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`latest_json: ${result.outputs.latest_json}`);
  console.log(`history_json: ${result.outputs.history_json}`);
}

process.exitCode = result.ok ? 0 : 1;
