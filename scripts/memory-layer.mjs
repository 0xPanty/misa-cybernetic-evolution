import { reviewMemoryLayerComparison } from "./lib/memory-layer.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const result = await reviewMemoryLayerComparison({
  sourceDir: readArg("source-dir"),
  vpsRawDir: readArg("vps-raw-dir")
});
await writeJsonOutFile(result, readArg("out-file"));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`memory-layer ok=${result.ok}`);
  console.log(`sources=${result.layers.l0_sources.source_count} raw_tokens=${result.layers.l0_sources.raw_token_estimate}`);
  console.log(`distillate_tokens=${result.layers.l1_distillates.distillate_token_estimate} compression=${result.layers.l1_distillates.compression_ratio}`);
  console.log(`atomic_lessons=${result.layers.l1_distillates.atomic_lesson_count} compound_sources=${result.layers.l1_distillates.compound_source_count}`);
  console.log(`routes=${JSON.stringify(result.layers.l2_candidates.route_counts)}`);
  console.log(`original_l3=${result.original_auto_l3.skill_count} bad_promotions=${result.original_auto_l3.non_skill_promoted_count}`);
  console.log(`minimal_l3=${result.minimal_positive_l3.skill_count} bad_promotions=${result.minimal_positive_l3.non_skill_promoted_count}`);
  console.log(`verdict=${result.comparison.verdict}`);
  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) console.log(`- ${violation}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
