#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import { routeWorkOrders } from "./lib/work-order-router.mjs";
import {
  humanEscalationsFromWorkOrderRouting
} from "./lib/human-escalation.mjs";

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

async function readJsonFile(filePath) {
  if (!filePath) return undefined;
  return readStrictJsonArtifact(filePath);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const workOrderRouting = await readJsonFile(readArg("work-order-file")) ?? await routeWorkOrders({ now });
const result = {
  schema_version: "misa.human_escalation_batch.v1",
  mode: "human-escalation-batch",
  ok: true,
  created_at: now.toISOString(),
  summary: {
    escalation_count: 0
  },
  escalations: humanEscalationsFromWorkOrderRouting(workOrderRouting, { now })
};
result.summary.escalation_count = result.escalations.length;

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`human-escalations count=${result.summary.escalation_count}`);
  for (const escalation of result.escalations) {
    console.log(`- ${escalation.escalation_id} ${escalation.severity} ${escalation.trigger_source}`);
  }
}
