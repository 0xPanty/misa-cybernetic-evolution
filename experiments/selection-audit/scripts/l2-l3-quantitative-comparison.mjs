#!/usr/bin/env node

import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  buildL2L3QuantitativeComparison,
  loadRunsFromBundle,
  writeL2L3QuantitativeComparisonArtifacts
} from "../lib/l2-l3-quantitative-comparison.mjs";

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

const repoRoot = process.cwd();
const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const runs = await loadRunsFromBundle({
  repoRoot,
  bundleDir: readArg("bundle-dir")
});
let result = buildL2L3QuantitativeComparison({
  runs,
  baselineLabel: readArg("baseline-label") ?? undefined,
  now
});

if (!hasArg("dry-run") && !hasArg("no-write")) {
  result = await writeL2L3QuantitativeComparisonArtifacts({
    repoRoot,
    result,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l2-l3-quantitative-comparison ok=${result.ok}`);
  console.log(`runs=${result.run_summaries.length}`);
  console.log(`sample_alignment=${result.sample_alignment.aligned}`);
  console.log(`default_run=${result.recommendation.default_run}`);
  console.log(`decision=${result.recommendation.decision}`);
  console.log(`multi_candidate_policy=${result.recommendation.multi_candidate_policy}`);
  for (const run of result.run_summaries) {
    console.log(`- ${run.label} avg=${run.avg_quality_score} green=${run.green} yellow=${run.yellow} red=${run.red} candidates=${run.candidate_count}`);
  }
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
