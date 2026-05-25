import {
  exportInboxOwnerDigest,
  exportReviewWorkOrdersToInbox
} from "./lib/work-order-inbox.mjs";

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

const nowArg = readArg("now");
const reviewFile = readArg("review-file");

if (hasArg("owner-digest")) {
  const result = await exportInboxOwnerDigest({
    root: readArg("root"),
    now: nowArg ? new Date(nowArg) : new Date(),
    markReported: !hasArg("no-mark-reported")
  });

  if (hasArg("json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`work-order-owner-digest ok=${result.ok}`);
    console.log(`report_item_count=${result.summary.report_item_count}`);
    console.log(`total_new_since_last_report=${result.summary.total_new_since_last_report}`);
    console.log(`spike_count=${result.summary.spike_count}`);
    console.log(`mark_reported=${result.summary.mark_reported}`);
    console.log(`json=${result.artifacts.json}`);
    console.log(`markdown=${result.artifacts.markdown}`);
  }
  process.exit(0);
}

if (!reviewFile) {
  console.error("work-order:inbox requires --review-file <file>");
  process.exit(2);
}

const result = await exportReviewWorkOrdersToInbox({
  reviewFile,
  root: readArg("root"),
  now: nowArg ? new Date(nowArg) : new Date()
});

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`work-order-inbox ok=${result.ok}`);
  console.log(`inbox_dir=${result.inbox_dir}`);
  console.log(`written=${result.summary.written_count}`);
  console.log(`merged_existing=${result.summary.merged_existing_count}`);
  console.log(`skipped_existing=${result.summary.skipped_existing_count}`);
  console.log(`inbox_count=${result.summary.inbox_count}`);
  console.log(`report_needed=${result.summary.report_needed_count}`);
  console.log(`spike=${result.summary.spike_count}`);
}
