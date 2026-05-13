import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import {
  buildVectorMemoryRetrievalPlan,
  buildVectorRetrievalStrategy,
  evaluateVectorRetrievalScenarios,
  rankVectorMemoryHits
} from "./lib/vector-retrieval-ranker.mjs";

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

function readNumberArg(name, fallback) {
  const raw = readArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

async function main() {
  const topK = readNumberArg("top-k", 8);
  let result;

  if (hasArg("eval-fixtures")) {
    result = evaluateVectorRetrievalScenarios({ topK });
  } else if (readArg("hits-file")) {
    const hitsArtifact = await readStrictJsonArtifact(readArg("hits-file"), {
      artifactRole: "vector_retrieval_hits_file"
    });
    const hits = Array.isArray(hitsArtifact) ? hitsArtifact : hitsArtifact.hits;
    result = rankVectorMemoryHits({
      query: readArg("query") ?? hitsArtifact.query ?? "",
      requestedKind: readArg("requested-kind") ?? hitsArtifact.requested_kind,
      requestedSurface: readArg("requested-surface") ?? hitsArtifact.requested_surface,
      topK,
      hits
    });
  } else if (readArg("query") || readArg("requested-kind")) {
    result = buildVectorMemoryRetrievalPlan({
      query: readArg("query") ?? "",
      requestedKind: readArg("requested-kind"),
      requestedSurface: readArg("requested-surface"),
      topK
    });
  } else {
    result = buildVectorRetrievalStrategy({ topK });
  }

  await writeJsonOutFile(result, readArg("out-file"));

  if (hasArg("json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.mode === "vector-retrieval-ranker-eval") {
    console.log(`vector-retrieval-ranker eval ok=${result.ok}`);
    console.log(`scenarios=${result.summary.scenario_count}`);
    console.log(`unique_sources=${result.summary.unique_source_count}`);
    console.log(`top1_exact_recall=${result.summary.top1_exact_recall}`);
    console.log(`top1_kind_precision=${result.summary.top1_kind_precision}`);
    console.log(`noise_top1_wrong_kind_count=${result.summary.noise_top1_wrong_kind_count}`);
    return;
  }

  if (result.mode === "vector-retrieval-ranker-dry-run") {
    console.log(`vector-retrieval-ranker ok=${result.ok}`);
    console.log(`requested_kind=${result.query_intent.requested_kind ?? "none"}`);
    console.log(`ranked_hits=${result.summary.ranked_hit_count}`);
    console.log(`filtered_hits=${result.summary.filtered_hit_count}`);
    console.log(`top1_kind_match=${result.summary.top1_kind_match}`);
    return;
  }

  console.log(`vector-retrieval-strategy=${result.strategy_version}`);
  console.log(`default_top_k=${result.default_top_k}`);
  console.log(`kind_profiles=${result.kind_profiles.length}`);
}

await main();
