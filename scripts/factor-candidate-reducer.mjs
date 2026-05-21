#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import { buildDefaultCandidateGenerationContext } from "./lib/candidate-generation-context.mjs";
import { buildFactorCandidateReducer } from "./lib/factor-candidate-reducer.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

async function readJsonFile(filePath) {
  if (!filePath) return undefined;
  return readStrictJsonArtifact(filePath);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const seed = readArg("seed") ?? "factor-candidate-reducer-v1";
const candidateContext = await readJsonFile(readArg("context-file"))
  ?? await buildDefaultCandidateGenerationContext({ now });

const result = buildFactorCandidateReducer({
  candidateContext,
  seed,
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`factor-candidate-reducer ok=${result.ok}`);
  console.log(`candidate_count=${result.summary.candidate_count}`);
  console.log(`human_escalation_required=${result.summary.human_escalation_required_count}`);
}
