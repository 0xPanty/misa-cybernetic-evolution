#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import {
  buildWorkOrderVariants,
  runWorkOrderVariants,
  writeWorkOrderVariantArtifacts
} from "./lib/work-order-variants.mjs";

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

async function readRouting(filePath) {
  if (!filePath) return undefined;
  return readStrictJsonArtifact(filePath);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const seed = readArg("seed");
const populationSize = readArg("population-size");
const dryRun = hasArg("dry-run") || hasArg("no-write");
const workOrderRouting = await readRouting(readArg("work-order-file"));

let result = workOrderRouting
  ? buildWorkOrderVariants({
      workOrderRouting,
      seed,
      populationSize,
      now
    })
  : await runWorkOrderVariants({
      seed,
      populationSize,
      now
    });

if (!dryRun) {
  result = await writeWorkOrderVariantArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });
}
await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`work-order-variants ok=${result.ok}`);
  console.log(`work_orders=${result.summary.work_order_count}`);
  console.log(`variants=${result.summary.variant_count}`);
  console.log(`llm_critique_recommended=${result.summary.llm_critique_recommended_count}`);
  console.log(`llm_mutation_crossover_review_worthy=${result.summary.llm_mutation_crossover_review_worthy_count}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  for (const item of result.work_order_results) {
    console.log(`- ${item.work_order_id} winner=${item.winner.strategy} llm_review=${item.llm_review_gate.level} llm_mutation_crossover=${item.llm_mutation_crossover_gate.level}`);
  }
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
