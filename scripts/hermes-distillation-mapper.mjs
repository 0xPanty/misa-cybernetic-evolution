#!/usr/bin/env node

import fs from "node:fs/promises";
import {
  evaluateHermesMappingFixtures,
  mapHermesDistillation
} from "./lib/hermes-distillation-mapper.mjs";

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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

const fixture = readArg("fixture");
const fixtureDir = readArg("fixture-dir");
const jsonMode = hasArg("json");
const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : undefined;

let result;
if (fixture) {
  result = await mapHermesDistillation(await readJson(fixture), {
    now,
    dryRun: true
  });
} else {
  result = await evaluateHermesMappingFixtures({
    fixtureDir,
    now
  });
}

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.mode === "hermes-distillation-mapping") {
  console.log("Hermes distillation mapping");
  console.log(`ok: ${result.ok}`);
  console.log(`source: ${result.source.source_id}`);
  console.log(`routing_status: ${result.routing.routing_status}`);
  console.log(`route_targets: ${result.routing.route_targets.join(",")}`);
  console.log(`suggested_executor: ${result.routing.suggested_executor}`);
  console.log(`learning_events: ${result.summary.learning_event_count}`);
  console.log(`work_order_created: ${result.summary.work_order_created}`);
  console.log(`llm_api_calls: ${result.summary.llm_api_calls}`);
  console.log(`external_api_calls: ${result.summary.external_api_calls}`);
  if (result.work_order) {
    console.log(`work_order: ${result.work_order.work_order_id}`);
  }
} else {
  console.log("Hermes distillation mapping fixtures");
  console.log(`ok: ${result.ok}`);
  console.log(`fixtures: ${result.summary.fixture_count}`);
  console.log(`mapped: ${result.summary.mapped_count}`);
  console.log(`work_orders: ${result.summary.work_order_count}`);
  console.log(`blocked: ${result.summary.blocked_count}`);
  console.log(`human_owner: ${result.summary.human_owner_count}`);
  console.log(`llm_api_calls: ${result.summary.llm_api_calls}`);
  console.log(`external_api_calls: ${result.summary.external_api_calls}`);
  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) console.log(`- ${violation}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
