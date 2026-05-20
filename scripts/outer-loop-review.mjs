#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { runOuterLoopReview } from "./lib/outer-loop-review.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return JSON.parse(raw);
}

const jsonMode = process.argv.includes("--json");
const metricTrendsPath = readArg("metric-trends-file");
const routeOutcomesPath = readArg("route-outcomes-file");
const metricRegistryGapsPath = readArg("metric-registry-gaps-file");
const outFile = readArg("out-file");

const result = await runOuterLoopReview({
  metricTrends: metricTrendsPath ? await readJsonFile(metricTrendsPath) : undefined,
  routeOutcomes: routeOutcomesPath ? await readJsonFile(routeOutcomesPath) : undefined,
  metricRegistryGaps: metricRegistryGapsPath ? await readJsonFile(metricRegistryGapsPath) : undefined,
  outFile: outFile ? path.resolve(outFile) : undefined
});

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa outer-loop review (local)");
  console.log(`ok: ${result.ok}`);
  console.log(`window: ${result.review_window.value} ${result.review_window.kind}`);
  console.log(`recommendations: ${result.summary.recommendation_count}`);
  console.log(`actionable: ${result.summary.actionable_recommendation_count}`);
  console.log(`setpoint_adjustment_candidate: ${result.summary.setpoint_adjustment_candidate_count}`);
  console.log(`route_recalibration_candidate: ${result.summary.route_recalibration_candidate_count}`);
  console.log(`metric_registry_expansion_candidate: ${result.summary.metric_registry_expansion_candidate_count}`);
  console.log(`production_authority: ${result.safety.production_authority}`);
  console.log(`route_predicate_mutated: ${result.safety.route_predicate_mutated}`);
  console.log(`metric_registry_mutated: ${result.safety.metric_registry_mutated}`);
  console.log(`setpoint_mutated: ${result.safety.setpoint_mutated}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);

  if (result.recommendations.length > 0) {
    console.log("");
    console.log("recommendations:");
    for (const recommendation of result.recommendations) {
      console.log(`- ${recommendation.recommendation_type}: ${recommendation.reason}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
