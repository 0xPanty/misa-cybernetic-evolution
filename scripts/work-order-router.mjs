import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  buildJsonHandoffRepairTicketReview,
  readJsonHandoffArtifact,
  readStrictJsonArtifact
} from "./lib/json-handoff-contract.mjs";
import {
  buildWorkOrderRouting,
  routeWorkOrders,
  writeWorkOrderArtifacts
} from "./lib/work-order-router.mjs";

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

async function readJsonFile(filePath) {
  if (!filePath) return undefined;
  return readStrictJsonArtifact(filePath);
}

async function readRepairTicketReview(filePath, now) {
  if (!filePath) return undefined;
  const artifact = await readJsonHandoffArtifact(filePath, { artifactRole: "repair_ticket_file" });
  if (artifact.ok) return artifact.data;
  return buildJsonHandoffRepairTicketReview({
    diagnostics: [artifact],
    now
  });
}

async function readJsonArray(filePath) {
  const payload = await readJsonFile(filePath);
  if (!payload) return [];
  return Array.isArray(payload) ? payload : [payload];
}

function routingPolicyFromArgs() {
  const mode = readArg("routing-mode");
  const maxAutoSeverity = readArg("max-auto-severity");
  const autoCategories = readArg("auto-categories");
  const hasPolicyArg = mode || maxAutoSeverity || autoCategories || hasArg("auto-execute");
  if (!hasPolicyArg) return undefined;

  return {
    ...(mode ? { mode } : {}),
    ...(maxAutoSeverity ? { max_auto_severity: maxAutoSeverity } : {}),
    ...(autoCategories ? { auto_execute_categories: autoCategories.split(",").map((item) => item.trim()).filter(Boolean) } : {}),
    ...(hasArg("auto-execute") ? { auto_execute_allowed: true } : {})
  };
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");
const routingPolicy = routingPolicyFromArgs();

const repairTicketReview = await readRepairTicketReview(readArg("repair-ticket-file"), now);
const operationalReports = await readJsonArray(readArg("operator-report-file"));

let result;
if (repairTicketReview || operationalReports.length) {
  result = buildWorkOrderRouting({
    repairTicketReview,
    operationalReports,
    routingPolicy,
    now
  });
} else {
  result = await routeWorkOrders({ routingPolicy, now });
}

if (!dryRun) {
  result = await writeWorkOrderArtifacts({
    routing: result,
    outDir: readArg("out-dir"),
    now
  });
}
await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`work-order-routing ok=${result.ok}`);
  console.log(`work_orders=${result.summary.work_order_count}`);
  console.log(`requires_user_confirmation=${result.summary.requires_user_confirmation_count}`);
  console.log(`auto_executable=${result.summary.auto_executable_count}`);
  console.log(`escalation_available=${result.summary.escalation_available_count}`);
  console.log(`stronger_model_recommended=${result.summary.stronger_model_recommended_count}`);
  console.log(`routing_mode=${result.routing_policy.mode}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
  for (const order of result.work_orders) {
    console.log(`- ${order.work_order_id} ${order.severity} ${order.category} -> ${order.suggested_executor.executor_type}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
