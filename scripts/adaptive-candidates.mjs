#!/usr/bin/env node

import { reviewAdaptiveCandidateGate } from "./lib/adaptive-candidate-gate.mjs";

const asJson = process.argv.includes("--json");
const result = await reviewAdaptiveCandidateGate();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa adaptive candidate gate");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`generated_candidates: ${result.summary.generated_candidate_count}`);
  console.log(`validation_ready: ${result.summary.validation_ready_count}`);
  console.log(`held: ${result.summary.held_count}`);
  console.log(`rejected: ${result.summary.rejected_count}`);
  console.log(`production_authority: ${result.summary.production_authority}`);
  console.log("candidate decisions:");
  for (const candidate of result.candidates) {
    console.log(`- ${candidate.candidate_id}: ${candidate.route_target} ${candidate.decision}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
