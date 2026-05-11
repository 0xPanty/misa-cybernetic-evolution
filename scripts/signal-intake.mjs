#!/usr/bin/env node

import { reviewSignalIntakeContract } from "./lib/signal-intake-contract.mjs";

const asJson = process.argv.includes("--json");
const result = reviewSignalIntakeContract();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa signal intake contract");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`signal_scan_minutes: ${result.cadence.signal_scan_interval_minutes}`);
  console.log(`learning_rollup_hours: ${result.cadence.learning_rollup_interval_hours}`);
  console.log(`farcaster_defense: ${result.cadence.farcaster_defense_mode}`);
  console.log(`farcaster_extra_judge_default: ${result.api_policy.farcaster_extra_judge_api_default}`);
  console.log("source contracts:");
  for (const source of result.source_contracts) {
    console.log(`- ${source.id}: ${source.intake_mode}, durable_learning_rollup=${source.learning_policy.durable_learning_rollup}, immediate_exception_queue=${source.learning_policy.immediate_exception_queue}`);
  }
  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) {
      console.log(`- ${violation}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
