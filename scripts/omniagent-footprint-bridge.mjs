import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { reviewOmniAgentFootprintBridge } from "./lib/omniagent-footprint-bridge.mjs";

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

async function readFootprint(filePath) {
  const inputPath = filePath
    ? (path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath))
    : path.join(process.cwd(), "examples", "omniagent-footprint-bridge", "repeated-success.input.json");
  const raw = await fs.readFile(inputPath, "utf8");
  return JSON.parse(raw);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const footprint = await readFootprint(readArg("input"));
const result = reviewOmniAgentFootprintBridge({ footprint, now });

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`omniagent-footprint-bridge ok=${result.ok}`);
  console.log(`route=${result.route_summary.selected_route}`);
  console.log(`status=${result.route_summary.status}`);
  console.log(`auto_writes_seen=${Object.values(result.footprint_summary.auto_write_indicators).some(Boolean)}`);
  console.log(`live_effect_allowed=${Object.values(result.safety.live_effects).some(Boolean)}`);
}

process.exitCode = result.ok ? 0 : 1;
