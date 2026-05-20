#!/usr/bin/env node

import { extractSignalsFromSession, reviewSignalExtractorFixtures } from "./lib/signal-extractor.mjs";

const asJson = process.argv.includes("--json");
const textFlagIndex = process.argv.indexOf("--text");
const text = textFlagIndex >= 0 ? process.argv[textFlagIndex + 1] : null;

const result = text
  ? extractSignalsFromSession(text)
  : await reviewSignalExtractorFixtures();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else if (text) {
  console.log("Misa signal extractor");
  console.log(`ok: ${result.ok}`);
  console.log(`signals: ${result.signals.join(", ") || "(none)"}`);
  console.log(`evidence_count: ${result.evidence_count}`);
  console.log(`confidence: ${result.confidence}`);
  console.log("llm_api_calls: 0");
} else {
  console.log("Misa signal extractor fixture review");
  console.log(`ok: ${result.ok}`);
  console.log(`fixtures: ${result.summary.fixture_count}`);
  console.log(`recall: ${result.summary.recall}`);
  console.log(`precision: ${result.summary.precision}`);
  console.log(`hand signals: ${result.hand_signals.join(", ")}`);
  console.log("llm_api_calls: 0");

  if (result.missed_signals.length > 0) {
    console.log("");
    console.log("missed signals:");
    for (const signal of result.missed_signals) {
      console.log(`- ${signal}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
