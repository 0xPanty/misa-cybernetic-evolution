#!/usr/bin/env node

import { reviewEvolutionTournamentGate } from "./lib/evolution-tournament-gate.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function readNumberArg(name) {
  const value = readArg(name);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

const asJson = process.argv.includes("--json");
const result = await reviewEvolutionTournamentGate({
  sourceDir: readArg("source-dir"),
  vpsRawDir: readArg("vps-raw-dir"),
  judgeMode: readArg("judge-mode") ?? "advise",
  judgeModel: readArg("judge-model"),
  judgeEscalationThreshold: readNumberArg("judge-escalation-threshold")
});

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa evolution tournament gate (local)");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`source_kind: ${result.source.source_kind}`);
  console.log(`tournaments: ${result.summary.tournament_count}`);
  console.log(`variants: ${result.summary.variant_count}`);
  console.log(`winners: ${result.summary.winner_count}`);
  console.log(`rejected_variants: ${result.summary.rejected_variant_count}`);
  console.log(`production_authority: ${result.summary.production_authority}`);
  console.log(`quality_score: ${result.quality_assessment.overall_quality_score}`);
  console.log(`judge_escalation: ${result.judge_escalation.recommended ? "recommended" : "not_recommended"} (score ${result.judge_escalation.score})`);
  console.log(`judge: ${result.judge.mode} (${result.judge.status}, calls ${result.judge.llm_api_calls})`);
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
