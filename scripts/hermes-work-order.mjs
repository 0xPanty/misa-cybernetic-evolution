#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { runHermesWorkOrderPipeline } from "./lib/hermes-work-order.mjs";

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
const result = await runHermesWorkOrderPipeline({
  fixtureFile: readArg("fixture-file"),
  eventLogFile: readArg("event-log"),
  runtime: readArg("runtime"),
  runtimeCommit: readArg("runtime-commit"),
  sourceUrl: readArg("source-url"),
  seed: readArg("seed"),
  populationSize: readArg("population-size"),
  now: nowArg ? new Date(nowArg) : undefined
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa Hermes work-order pipeline");
  console.log(`ok: ${result.ok}`);
  console.log(`events: ${result.adapter.summary.event_count}`);
  console.log(`work_orders: ${result.routing.summary.work_order_count}`);
  console.log(`variants: ${result.variants.summary.variant_count}`);
  console.log(`quality_comparisons: ${result.quality.summary.comparison_count}`);
  console.log(`avg_delta: ${result.quality.summary.avg_delta}`);
  console.log(`positive_lift_rate: ${result.quality.summary.positive_lift_rate}`);
  console.log(`safety_regressions: ${result.quality.summary.safety_regression_count}`);
  console.log(`guarded_agent_adoption_ready: ${result.routing.summary.guarded_agent_adoption_ready_count}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`external_api_calls: ${result.safety.external_api_calls}`);
  for (const item of result.quality.comparisons) {
    console.log(`- ${item.work_order_id} ${item.risk_level} winner=${item.selected_strategy} delta=${item.delta}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
