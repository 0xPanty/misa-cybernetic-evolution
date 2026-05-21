#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { buildDefaultRuntimeThreadReview } from "./lib/runtime-thread.mjs";

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
const now = nowArg ? new Date(nowArg) : new Date();
const result = await buildDefaultRuntimeThreadReview({
  repoRoot: process.cwd(),
  now,
  seed: readArg("seed") ?? "runtime-thread-v1",
  humanDecision: readArg("decision") ?? null,
  runLocalGate: hasArg("run-local-gate"),
  runtimeError: readArg("error-signal")
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`runtime-thread ok=${result.ok}`);
  console.log(`thread=${result.summary.thread_id}`);
  console.log(`status=${result.summary.status}`);
  console.log(`next_step=${result.summary.next_step_type}`);
  console.log(`events=${result.summary.event_count}`);
}
