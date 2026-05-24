#!/usr/bin/env node

import { runHermesRuntimePluginDoctor } from "./lib/hermes-runtime-plugin.mjs";

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
const result = await runHermesRuntimePluginDoctor({
  pluginDir: readArg("plugin-dir"),
  eventLogFile: readArg("event-log"),
  now: nowArg ? new Date(nowArg) : undefined,
  outFile: readArg("out-file")
});

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa Hermes runtime plugin doctor");
  console.log(`ok: ${result.ok}`);
  console.log(`plugin_dir: ${result.plugin_dir}`);
  console.log(`event_log_present: ${result.summary.event_log_present}`);
  console.log(`adapter_events: ${result.summary.adapter_events}`);
  console.log(`adapter_model_io_taps: ${result.summary.adapter_model_io_taps}`);
  console.log(`research_digests: ${result.summary.adapter_research_digests}`);
  console.log(`evolution_candidates: ${result.summary.adapter_evolution_candidates}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
