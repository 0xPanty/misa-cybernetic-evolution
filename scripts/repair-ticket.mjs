import { reviewRepairTickets, writeRepairTicketArtifacts } from "./lib/repair-ticket.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function readArgs(name) {
  const values = [];
  const prefix = `--${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg.startsWith(prefix)) {
      values.push(arg.slice(prefix.length));
    } else if (arg === `--${name}` && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");

let result = await reviewRepairTickets({
  sourceDir: readArg("source-dir"),
  vpsRawDir: readArg("vps-raw-dir"),
  jsonHandoffFiles: readArgs("json-handoff-file"),
  now
});

if (!dryRun) {
  result = await writeRepairTicketArtifacts({
    review: result,
    outDir: readArg("out-dir"),
    now
  });
}
await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`repair-ticket ok=${result.ok}`);
  console.log(`tickets=${result.summary.ticket_count} highest=${result.summary.highest_severity}`);
  console.log(`bad_promotions=${result.summary.bad_promotion_count} minimal_bad=${result.summary.minimal_non_skill_promoted_count}`);
  console.log(`verdict=${result.summary.verdict}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
  for (const ticket of result.tickets) {
    console.log(`- ${ticket.ticket_id} ${ticket.severity} ${ticket.status}`);
  }
  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) console.log(`- ${violation}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
