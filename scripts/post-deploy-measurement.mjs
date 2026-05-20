#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { reviewPostDeployTickets } from "./lib/post-deploy-measurement.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

async function readTicketFile(ticketPath) {
  const resolved = path.resolve(ticketPath);
  const raw = await fs.readFile(resolved, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [data];
}

const ticketPath = readArg("ticket");
const tickets = ticketPath ? await readTicketFile(ticketPath) : undefined;
const result = reviewPostDeployTickets({ tickets });

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa post-deploy measurement (local)");
  console.log(`ok: ${result.ok}`);
  console.log(`tickets: ${result.summary.result_count}`);
  console.log(`confirmed_positive: ${result.summary.decision_counts.confirmed_positive ?? 0}`);
  console.log(`confirmed_negative: ${result.summary.decision_counts.confirmed_negative ?? 0}`);
  console.log(`null_effect: ${result.summary.decision_counts.null_effect ?? 0}`);
  console.log(`rollback_recommendations: ${result.rollback_recommendations.length}`);
  console.log(`damping_recommendations: ${result.damping_recommendations.length}`);
  console.log(`production_authority: ${result.safety.production_authority}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`external_api_calls: ${result.safety.external_api_calls}`);

  if (result.rollback_recommendations.length > 0) {
    console.log("");
    console.log("rollback recommendations:");
    for (const recommendation of result.rollback_recommendations) {
      console.log(`- ${recommendation.deployment_id}: ${recommendation.reason}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
