import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import {
  buildVectorStoreAdapterContract,
  localVectorStoreStats,
  queryLocalVectorStore,
  rollbackLocalVectorStoreBatch,
  upsertDistillationToLocalVectorStore
} from "./lib/local-vector-store.mjs";

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

async function main() {
  const mode = readArg("mode") ?? "stats";
  const nowArg = readArg("now");
  const now = nowArg ? new Date(nowArg) : new Date();
  const rootDir = readArg("root");
  let result;

  if (mode === "contract") {
    result = buildVectorStoreAdapterContract({ backend: readArg("backend") });
  } else if (mode === "upsert") {
    const distillation = await readOptionalJson(readArg("distillation-file"), "local_session_distillation_file");
    result = await upsertDistillationToLocalVectorStore({
      rootDir,
      distillation,
      sourceDir: readArg("source-dir"),
      dryRun: hasArg("dry-run"),
      requireTemplateCoverage: hasArg("require-template-coverage"),
      now
    });
  } else if (mode === "query") {
    result = await queryLocalVectorStore({
      rootDir,
      query: readArg("query") ?? "",
      route: readArg("route"),
      kind: readArg("kind"),
      sourceKind: readArg("source-kind"),
      sourceId: readArg("source-id"),
      topK: readNumberArg("top-k", 8),
      now
    });
  } else if (mode === "rollback") {
    result = await rollbackLocalVectorStoreBatch({
      rootDir,
      batchId: readArg("batch-id"),
      now
    });
  } else if (mode === "stats") {
    result = await localVectorStoreStats({
      rootDir,
      now
    });
  } else {
    throw new Error(`Unknown local vector store mode: ${mode}`);
  }

  await writeJsonOutFile(result, readArg("out-file"));

  if (hasArg("json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.mode === "local-vector-store-upsert") {
    console.log(`local-vector-store upsert ok=${result.ok}`);
    console.log(`backend=${result.backend}`);
    console.log(`dry_run=${result.dry_run}`);
    console.log(`records=${result.summary.record_count}`);
    console.log(`inserted=${result.summary.inserted}`);
    console.log(`updated=${result.summary.updated}`);
    console.log(`local_vector_store_written=${result.safety.local_vector_store_written}`);
    console.log(`zilliz_written=${result.safety.zilliz_written}`);
    console.log(`root=${result.root}`);
    return;
  }

  if (result.mode === "local-vector-store-query") {
    console.log(`local-vector-store query ok=${result.ok}`);
    console.log(`stored_records=${result.summary.stored_record_count}`);
    console.log(`hits=${result.summary.hit_count}`);
    console.log(`top1=${result.summary.top1_record_id ?? "none"}`);
    console.log(`zilliz_written=${result.safety.zilliz_written}`);
    return;
  }

  if (result.mode === "local-vector-store-rollback") {
    console.log(`local-vector-store rollback ok=${result.ok}`);
    console.log(`batch_id=${result.batch_id}`);
    console.log(`removed=${result.summary.removed_record_count}`);
    console.log(`remaining=${result.summary.remaining_record_count}`);
    return;
  }

  if (result.mode === "local-vector-store-stats") {
    console.log(`local-vector-store stats ok=${result.ok}`);
    console.log(`backend=${result.backend}`);
    console.log(`records=${result.summary.record_count}`);
    console.log(`batches=${result.summary.batch_count}`);
    console.log(`root=${result.root}`);
    return;
  }

  console.log(`vector-store-adapter-contract=${result.schema_version}`);
  console.log(`backend=${result.backend}`);
  console.log(`default_backend=${result.default_backend}`);
  console.log(`operations=${result.required_operations.join(",")}`);
}

await main();
