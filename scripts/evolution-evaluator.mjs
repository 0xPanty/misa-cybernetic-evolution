#!/usr/bin/env node

import { evaluateMisaEvolution } from "./lib/evolution-evaluator.mjs";

const asJson = process.argv.includes("--json");
const result = await evaluateMisaEvolution();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa candidate preflight simulation (local)");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`optimization_candidates: ${result.summary.optimization_candidate_count}`);
  console.log(`preflight_passed: ${result.summary.preflight_passed_count}`);
  console.log(`report_queue: ${result.summary.report_queue_count}`);
  console.log(`held: ${result.summary.held_count}`);
  console.log(`suppressed: ${result.summary.suppressed_count}`);
  console.log(`real_chat_preflight: ${result.summary.real_chat_preflight_status}`);
  console.log(`experience_ledger_count: ${result.experience_ledger.length}`);
  console.log(`live effects: none`);

  if (result.report_queue.length > 0) {
    console.log("");
    console.log("report queue:");
    for (const report of result.report_queue) {
      console.log(`- ${report.rank}. ${report.candidate_id} (${report.route_target}, score ${report.score})`);
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
