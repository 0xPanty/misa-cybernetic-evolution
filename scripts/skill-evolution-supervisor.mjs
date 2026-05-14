#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { runSkillEvolutionSupervisor } from "./lib/skill-evolution-supervisor.mjs";

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

const nowArg = readArg("now");
const result = await runSkillEvolutionSupervisor({
  contractFile: readArg("contract-file"),
  eventFile: readArg("event-file"),
  now: nowArg ? new Date(nowArg) : undefined
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa skill evolution supervisor");
  console.log(`ok: ${result.ok}`);
  console.log(`status: ${result.summary.status}`);
  console.log(`skill_id: ${result.skill_id}`);
  console.log(`event_id: ${result.event_id}`);
  console.log(`violations: ${result.summary.violation_count}`);
  console.log(`warnings: ${result.summary.warning_count}`);
  console.log(`evolution_candidates: ${result.summary.evolution_candidate_count}`);
  console.log(`replay_required: ${result.summary.replay_required_count}`);
  console.log(`recommended_route: ${result.routing.recommended_route}`);
  console.log(`human_review_required: ${result.summary.human_review_required}`);
  console.log(`llm_judge_recommended: ${result.summary.llm_judge_recommended}`);
}

process.exitCode = result.ok ? 0 : 1;
