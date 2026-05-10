#!/usr/bin/env node

import { crystallizeMisaSkills } from "./lib/skill-crystallization.mjs";

const asJson = process.argv.includes("--json");
const result = await crystallizeMisaSkills();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa skill crystallization candidates (read-only)");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`skill candidates: ${result.index.skill_candidates}`);
  console.log(`publication allowed: ${result.index.publication_allowed}`);
  console.log("live effects: none");
  console.log("");

  for (const candidate of result.candidates) {
    console.log(`- ${candidate.candidate_id}`);
    console.log(`  action: ${candidate.route.candidate_action}`);
    console.log(`  draft: ${candidate.proposed_skill.proposed_path}`);
    console.log(`  quality: ${candidate.quality.score}`);
    console.log(`  summary: ${candidate.one_line_summary}`);
    console.log(`  affected: ${candidate.route.affected_artifacts.join(", ")}`);
    console.log(`  self repair: ${candidate.self_repair.mode}`);
    console.log(`  publish: blocked`);
  }

  if (result.warnings.length > 0) {
    console.log("");
    console.log("warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
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
