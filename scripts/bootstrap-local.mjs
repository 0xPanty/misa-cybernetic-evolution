#!/usr/bin/env node

import { runLocalBootstrap } from "./lib/public-repo-readiness.mjs";

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
const result = await runLocalBootstrap({
  vectorRoot: readArg("vector-root"),
  reportRoot: readArg("report-root"),
  now: nowArg ? new Date(nowArg) : undefined
});

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa local bootstrap");
  console.log(`ok: ${result.ok}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  console.log(`vector_records: ${result.summary.vector_records}`);
  console.log(`query_hits: ${result.summary.query_hits}`);
  console.log(`health_status: ${result.summary.health_status}`);
  console.log(`vector_store_root: ${result.outputs.vector_store_root}`);
  console.log(`latest_json: ${result.outputs.latest_json}`);
  console.log(`zilliz_written: ${result.safety.zilliz_written}`);
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
