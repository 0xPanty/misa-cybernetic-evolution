#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { runHermesRuntimeAdapter } from "./lib/hermes-runtime-adapter.mjs";

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
const result = await runHermesRuntimeAdapter({
  fixtureFile: readArg("fixture-file"),
  now: nowArg ? new Date(nowArg) : undefined
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa Hermes runtime adapter");
  console.log(`ok: ${result.ok}`);
  console.log(`runtime: ${result.adapter.runtime}`);
  console.log(`events: ${result.summary.event_count}`);
  console.log(`research_digests: ${result.summary.research_digest_count}`);
  console.log(`evolution_candidates: ${result.summary.evolution_candidate_count}`);
  console.log(`replay_required: ${result.summary.replay_required_count}`);
  console.log(`default_mode: ${result.summary.default_mode}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`external_api_calls: ${result.safety.external_api_calls}`);
}

process.exitCode = result.ok ? 0 : 1;
