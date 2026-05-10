#!/usr/bin/env node

import { runMisaSelfRepair } from "./lib/self-repair.mjs";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

const asJson = process.argv.includes("--json");
const verify = !process.argv.includes("--no-verify");
const candidateId = readArg("--candidate-id");
const timeoutArg = readArg("--timeout-ms");
const timeoutMs = timeoutArg ? Number.parseInt(timeoutArg, 10) : 120000;

const result = await runMisaSelfRepair({
  candidateId,
  verify,
  timeoutMs
});

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa self-repair draft run");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`verify: ${result.verify}`);
  console.log(`candidates: ${result.candidate_count}`);
  console.log("write scope:");
  for (const scope of result.write_scope) {
    console.log(`- ${scope}`);
  }
  console.log("");

  for (const run of result.runs) {
    console.log(`- ${run.candidate_id}`);
    console.log(`  status: ${run.status}`);
    console.log(`  run: ${run.run_dir}`);
    console.log(`  report: ${run.final_report}`);
    console.log(`  generated: ${run.generated_files.join(", ")}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
