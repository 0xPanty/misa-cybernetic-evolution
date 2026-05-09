#!/usr/bin/env node

import { simulateMisaLearning } from "./lib/learning-loop.mjs";

const asJson = process.argv.includes("--json");
const result = await simulateMisaLearning();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa learning loop simulation (dry-run)");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log("");

  for (const trace of result.traces) {
    console.log(`- ${trace.source_event_id}`);
    console.log(`  route: ${trace.route.target}`);
    console.log(`  status: ${trace.result.status}`);
    console.log(`  candidate: ${trace.candidate_review.state}`);
    console.log(`  value: ${trace.result.positive_value ? "positive" : "ignored"}`);
    console.log(`  live effects: none`);
  }

  console.log("");
  console.log(`fixtures: ${JSON.stringify(result.fixtureStats)}`);
  console.log(`route counts: ${JSON.stringify(result.routeCounts)}`);

  if (result.warnings.length > 0) {
    console.log("");
    console.log("warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (result.violations.length > 0) {
    console.log("");
    console.log("violations:");
    for (const violation of result.violations) {
      console.log(`- ${violation}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
