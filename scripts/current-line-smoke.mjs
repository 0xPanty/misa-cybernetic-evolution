#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
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

const nowArg = readArg("now");
const tournamentNowArg = readArg("tournament-now");
const result = await runCurrentLineSmoke({
  sessionSummaryFile: readArg("session-summary-file"),
  now: nowArg ? new Date(nowArg) : undefined,
  tournamentNow: tournamentNowArg ? new Date(tournamentNowArg) : undefined
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa current-line smoke");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  console.log(`dry_run: ${result.summary.dry_run}`);
  console.log(`production_authority: ${result.summary.production_authority}`);
  console.log(`zilliz_written: ${result.summary.zilliz_written}`);
  console.log(`embedding_created: ${result.summary.embedding_created}`);
  console.log(`writes_persistent_memory: ${result.summary.writes_persistent_memory}`);
  console.log(`live_effect_allowed: ${result.summary.live_effect_allowed}`);

  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
