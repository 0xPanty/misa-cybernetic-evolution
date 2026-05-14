#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { runPublicRepoDoctor } from "./lib/public-repo-readiness.mjs";

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
const result = await runPublicRepoDoctor({
  now: nowArg ? new Date(nowArg) : undefined
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa public repo doctor");
  console.log(`ok: ${result.ok}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  console.log(`read_only: ${result.safety.read_only}`);
  console.log(`zilliz_written: ${result.safety.zilliz_written}`);
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
