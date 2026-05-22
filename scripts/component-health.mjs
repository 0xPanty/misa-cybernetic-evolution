#!/usr/bin/env node

import fs from "node:fs/promises";
import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { buildComponentHealthDiagnostics } from "./lib/component-health.mjs";
import { runCurrentLineSmoke } from "./lib/current-line-smoke.mjs";

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
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const smokeFile = readArg("smoke-file");
const historyFile = readArg("history-file");
const smoke = smokeFile
  ? await readJson(smokeFile)
  : await runCurrentLineSmoke({ repoRoot: process.cwd(), now, tournamentNow: now });
const history = historyFile ? await readJson(historyFile) : {};
const result = buildComponentHealthDiagnostics({
  componentChecks: smoke.checks ?? [],
  history,
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa component health");
  console.log(`status=${result.status}`);
  console.log(`ok=${result.ok}`);
  console.log(`components=${result.summary.component_count}`);
  console.log(`diagnostic_candidates=${result.summary.diagnostic_candidate_count}`);
  console.log(`auto_execute=${result.summary.auto_execute}`);
}

process.exitCode = result.ok ? 0 : 1;
