import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { readStrictJsonArtifact } from "./lib/json-handoff-contract.mjs";
import { reviewLangGraphQianxuesenBridge } from "./lib/langgraph-qianxuesen-bridge.mjs";

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
const repairTicketReview = await readOptionalJson(readArg("repair-ticket-file"), "repair_ticket_file");

const result = await reviewLangGraphQianxuesenBridge({
  workOrderRouting,
  repairTicketReview,
  now
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`langgraph-qianxuesen-bridge ok=${result.ok}`);
  console.log(`work_orders=${result.summary.work_order_count}`);
  console.log(`interrupts=${result.summary.interrupt_count}`);
  console.log(`deterministic_nodes=${result.summary.deterministic_governance_node_count}`);
  console.log(`llm_owned_learning_decisions=${result.summary.llm_owned_learning_decision_count}`);
  console.log(`live_effect_allowed=${result.summary.live_effect_allowed}`);
  for (const item of result.interrupt_queue) {
    console.log(`- ${item.interrupt_id} ${item.source_id} -> ${item.reason}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
