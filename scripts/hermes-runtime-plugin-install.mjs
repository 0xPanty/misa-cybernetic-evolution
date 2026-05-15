#!/usr/bin/env node

import { runHermesRuntimePluginInstall } from "./lib/hermes-runtime-plugin.mjs";

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
const result = await runHermesRuntimePluginInstall({
  sourceDir: readArg("source-dir"),
  pluginDir: readArg("plugin-dir"),
  eventLogFile: readArg("event-log"),
  now: nowArg ? new Date(nowArg) : undefined,
  outFile: readArg("out-file")
});

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa Hermes runtime plugin install");
  console.log(`ok: ${result.ok}`);
  console.log(`plugin_dir: ${result.plugin_dir}`);
  console.log(`event_log: ${result.event_log_file}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
}

process.exitCode = result.ok ? 0 : 1;
