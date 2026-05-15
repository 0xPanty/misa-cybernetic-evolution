#!/usr/bin/env node

import path from "node:path";
import { buildCuriositySignalGateFromDigest } from "./lib/curiosity-signal-gate.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { buildPerceptionDigest } from "./lib/perception-sidecar.mjs";
import { loadVpsConversationSources } from "./lib/vps-conversation-sources.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function readCsvArg(name) {
  const value = readArg(name);
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

async function sourcesFromVpsRawDir(repoRoot, rawDir) {
  if (!rawDir) return undefined;
  return loadVpsConversationSources({
    rawDir: path.isAbsolute(rawDir) ? rawDir : path.join(repoRoot, rawDir)
  });
}

const repoRoot = process.cwd();
const nowArg = readArg("now");
const vpsRawDir = readArg("vps-raw-dir");
const sourceDir = readArg("source-dir") ?? (vpsRawDir ? undefined : path.join("test", "fixtures", "perception", "shadow-sources"));
const sources = await sourcesFromVpsRawDir(repoRoot, vpsRawDir);
const digest = await buildPerceptionDigest({
  repoRoot,
  sourceDir,
  sources,
  ledgerFile: readArg("ledger-file"),
  now: nowArg ? new Date(nowArg) : new Date("2026-05-14T00:00:00Z")
});
const result = buildCuriositySignalGateFromDigest(digest, {
  expectedReviewWorthySourceIds: readCsvArg("expect-review-worthy"),
  expectedNoiseSourceIds: readCsvArg("expect-noise")
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa curiosity signal gate");
  console.log(`ok: ${result.ok}`);
  console.log(`sources: ${result.summary.evaluated_source_count}`);
  console.log(`llm_variant_generation: ${result.summary.llm_variant_generation_count}`);
  console.log(`optional_review: ${result.summary.deterministic_review_optional_count}`);
  console.log(`ordinary: ${result.summary.ordinary_candidate_flow_count}`);
  console.log(`suppressed: ${result.summary.suppressed_count}`);
  console.log(`missed_review_worthy: ${result.summary.missed_review_worthy_count}`);
  console.log(`noise_selected: ${result.summary.noise_selected_count}`);
  console.log(`llm_api_calls: ${result.summary.llm_api_calls}`);
}

process.exitCode = result.ok ? 0 : 1;
