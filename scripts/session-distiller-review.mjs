import {
  reviewSessionDistillerOutput,
  writeSessionDistillerReviewOutFile
} from "./lib/session-distiller-review.mjs";

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
const review = await reviewSessionDistillerOutput({
  summaryFile: readArg("summary-file"),
  manifestFile: readArg("zilliz-manifest-file"),
  llmFile: readArg("llm-file"),
  rollbackFile: readArg("zilliz-rollback-file"),
  now: nowArg ? new Date(nowArg) : new Date()
});

const outputPath = await writeSessionDistillerReviewOutFile(review, readArg("out-file"));
if (outputPath) {
  review.output = { json_path: outputPath };
}

if (hasArg("json")) {
  console.log(JSON.stringify(review, null, 2));
} else {
  console.log(`session-distiller-review ok=${review.ok}`);
  console.log(`verdict=${review.summary.verdict}`);
  console.log(`findings=${review.summary.finding_count}`);
  console.log(`repair_work_orders=${review.summary.repair_work_order_count}`);
}

process.exitCode = review.ok ? 0 : 1;
