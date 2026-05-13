#!/usr/bin/env node

import { reviewEvolutionTournamentGate } from "./lib/evolution-tournament-gate.mjs";

const asJson = process.argv.includes("--json");
const result = await reviewEvolutionTournamentGate();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa evolution tournament gate (local)");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`tournaments: ${result.summary.tournament_count}`);
  console.log(`variants: ${result.summary.variant_count}`);
  console.log(`winners: ${result.summary.winner_count}`);
  console.log(`rejected_variants: ${result.summary.rejected_variant_count}`);
  console.log(`production_authority: ${result.summary.production_authority}`);
  console.log("live effects: none");

  if (result.winner_queue.length > 0) {
    console.log("");
    console.log("winner queue:");
    for (const winner of result.winner_queue) {
      console.log(`- ${winner.variant_id} (${winner.strategy}, score ${winner.composite_score})`);
    }
  }

  if (result.rejected_variant_ledger.length > 0) {
    console.log("");
    console.log("rejected variant ledger:");
    for (const item of result.rejected_variant_ledger) {
      console.log(`- ${item.variant_id}: ${item.violations.join(", ")}`);
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
