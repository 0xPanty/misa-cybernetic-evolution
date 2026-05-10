#!/usr/bin/env node

import { reviewGenericAgentContextDensity } from "./lib/genericagent-density.mjs";

const asJson = process.argv.includes("--json");

const result = await reviewGenericAgentContextDensity();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa GenericAgent context-density review");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`overall_score: ${result.summary.overall_score}`);
  console.log(`adopted: ${result.summary.adopted_count}`);
  console.log(`rejected: ${result.summary.rejected_count}`);
  console.log("candidate reviews:");
  for (const review of result.candidate_reviews) {
    console.log(`- ${review.candidate_id}: ${review.score} ${review.decision}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
