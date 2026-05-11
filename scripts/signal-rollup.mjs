#!/usr/bin/env node

import { reviewSignalCandidateRollup } from "./lib/signal-candidate-rollup.mjs";

const asJson = process.argv.includes("--json");
const result = await reviewSignalCandidateRollup();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa signal candidate daily rollup");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`adapted_signals: ${result.summary.adapted_signal_count}`);
  console.log(`queue_items: ${result.summary.queue_item_count}`);
  console.log(`daily_rollup_hours: ${result.summary.daily_rollup_window_hours}`);
  console.log(`validation_ready: ${result.summary.validation_ready_count}`);
  console.log(`held: ${result.summary.held_count}`);
  console.log(`rejected: ${result.summary.rejected_count}`);
  console.log(`production_authority: ${result.summary.production_authority}`);
  console.log("source adapters:");
  for (const adapter of result.signal_adapters) {
    console.log(`- ${adapter.source_contract_id}: ${adapter.mapped_signal_count}`);
  }

  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) {
      console.log(`- ${violation}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
