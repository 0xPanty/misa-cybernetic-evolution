import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import { reviewZillizVectorAdapterPlan } from "./lib/zilliz-vector-adapter.mjs";

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

async function readOptionalJson(filePath, artifactRole) {
  if (!filePath) return undefined;
  return readStrictJsonArtifact(filePath, { artifactRole });
}

if (hasArg("write") || hasArg("allow-write") || hasArg("live")) {
  throw new Error("zilliz-vector-adapter is dry-run only; live writes need a separate explicit writer.");
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const vectorMemoryStorage = await readOptionalJson(readArg("vector-memory-file"), "vector_memory_storage_file");

const result = await reviewZillizVectorAdapterPlan({
  vectorMemoryStorage,
  vectorDimension: readNumberArg("vector-dim", 768),
  metricType: readArg("metric-type") ?? "COSINE",
  embeddingModel: readArg("embedding-model") ?? "gemini-embedding-001",
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`zilliz-vector-adapter ok=${result.ok}`);
  console.log(`collections=${result.summary.collection_count}`);
  console.log(`records=${result.summary.record_count}`);
  console.log(`batches=${result.summary.batch_count}`);
  console.log(`records_requiring_embedding=${result.summary.records_requiring_embedding}`);
  console.log(`metadata_violations=${result.summary.metadata_violation_count}`);
  console.log(`zilliz_written=${result.safety.zilliz_written}`);
  console.log(`embedding_created=${result.safety.embedding_created}`);
}

process.exitCode = result.ok ? 0 : 1;
