import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import { reviewVectorMemoryStoragePlan } from "./lib/vector-memory-storage.mjs";

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

async function readOptionalJson(filePath, artifactRole) {
  if (!filePath) return undefined;
  return readStrictJsonArtifact(filePath, { artifactRole });
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const workOrderRouting = await readOptionalJson(readArg("work-order-file"), "work_order_routing_file");
const langGraphBridge = await readOptionalJson(readArg("langgraph-file"), "langgraph_qianxuesen_bridge_file");

const result = await reviewVectorMemoryStoragePlan({
  workOrderRouting,
  langGraphBridge,
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`vector-memory-storage ok=${result.ok}`);
  console.log(`records=${result.summary.record_count}`);
  console.log(`collections=${Object.keys(result.summary.by_collection).length}`);
  console.log(`candidates=${result.summary.candidate_count}`);
  console.log(`can_influence_behavior=${result.summary.can_influence_behavior_count}`);
  console.log(`owner_approval_required=${result.summary.owner_approval_required_count}`);
  console.log(`zilliz_written=${result.safety.zilliz_written}`);
}

process.exitCode = result.ok ? 0 : 1;
