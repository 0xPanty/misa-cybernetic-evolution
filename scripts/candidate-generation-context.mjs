#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import {
  buildDefaultCandidateGenerationContext
} from "./lib/candidate-generation-context.mjs";

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
const workOrderRouting = await readJsonFile(readArg("work-order-file"));
const metricRegistry = await readJsonFile(readArg("metric-registry-file"));
const promptManifest = await readJsonFile(readArg("prompt-manifest-file"));

const result = await buildDefaultCandidateGenerationContext({
  workOrderRouting,
  metricRegistry,
  promptManifest,
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`candidate-generation-context work_orders=${result.work_order_contexts.length}`);
  console.log(`metrics=${result.metric_context.length}`);
  console.log(`prompt_templates=${result.prompt_templates.length}`);
  console.log(`runtime_fetch_allowed=${result.context_policy.runtime_fetch_allowed}`);
  console.log(`llm_tool_calls_allowed=${result.context_policy.llm_tool_calls_allowed}`);
}
