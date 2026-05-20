#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  runStabilityMonitor,
  sampleDivergentPostDeployTickets,
  sampleDivergentSkillReplayResults
} from "./lib/stability-monitor.mjs";

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
const demoDivergent = process.argv.includes("--demo-divergent");
const writeIncidents = process.argv.includes("--write-incidents");
const postDeployPath = readArg("post-deploy-file");
const skillReplayPath = readArg("skill-replay-file");

const result = await runStabilityMonitor({
  postDeployTickets: postDeployPath
    ? await readJsonFile(postDeployPath)
    : demoDivergent ? sampleDivergentPostDeployTickets() : undefined,
  skillReplayResults: skillReplayPath
    ? await readJsonFile(skillReplayPath)
    : demoDivergent ? sampleDivergentSkillReplayResults() : undefined,
  incidentRoot: readArg("incident-root") ?? undefined,
  writeIncidents
});

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa stability monitor (local)");
  console.log(`ok: ${result.ok}`);
  console.log(`safe_mode: ${result.safe_mode.state}`);
  console.log(`allowed_routes: ${result.safe_mode.allowed_routes.join(", ")}`);
  console.log(`frozen_routes: ${result.safe_mode.frozen_routes.join(", ") || "none"}`);
  console.log(`incidents: ${result.summary.safe_mode_incident_count}`);
  console.log(`production_authority: ${result.safety.production_authority}`);
  console.log(`live_route_table_mutated: ${result.safety.live_route_table_mutated}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);

  if (result.indicators.length > 0) {
    console.log("");
    console.log("indicators:");
    for (const indicator of result.indicators) {
      console.log(`- ${indicator.indicator_id}: ${indicator.status} (${indicator.value}/${indicator.safe_mode_threshold})`);
    }
  }

  if (result.incidents.length > 0) {
    console.log("");
    console.log("incidents:");
    for (const incident of result.incidents) {
      console.log(`- ${incident.incident_id}: ${incident.reason}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
