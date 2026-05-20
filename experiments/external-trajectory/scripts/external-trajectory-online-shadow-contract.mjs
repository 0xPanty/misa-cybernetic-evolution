#!/usr/bin/env node

import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  runExternalTrajectoryOnlineShadowContract,
  writeExternalTrajectoryOnlineShadowContractArtifacts
} from "../lib/external-trajectory-online-shadow-contract.mjs";

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
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");

const result = await runExternalTrajectoryOnlineShadowContract({
  perceptionDigestPath: readArg("perception-digest"),
  now
});

const written = dryRun
  ? result
  : await writeExternalTrajectoryOnlineShadowContractArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`external-trajectory-online-shadow ok=${written.ok}`);
  console.log(`perception_digest=${written.input.perception_digest_path}`);
  console.log(`source_count=${written.summary.source_count}`);
  console.log(`readout_record_count=${written.summary.readout_record_count}`);
  console.log(`review_hint_count=${written.summary.review_hint_count}`);
  console.log(`repair_ticket_draft_count=${written.summary.repair_ticket_draft_count}`);
  console.log(`work_order_draft_count=${written.summary.work_order_draft_count}`);
  console.log(`route_authority=${written.safety.route_authority}`);
  console.log(`winner_authority=${written.safety.winner_authority}`);
  console.log(`production_authority=${written.safety.production_authority}`);
  console.log(`persistent_memory_written=${written.safety.writes_persistent_memory}`);
  console.log(`zilliz_written=${written.safety.writes_zilliz}`);
  console.log(`embedding_created=${written.safety.creates_embeddings}`);
  console.log(`llm_api_calls=${written.safety.llm_api_calls}`);
  console.log(`external_api_calls=${written.safety.external_api_calls}`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
