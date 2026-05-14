#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { runCurrentLineCalibration } from "./lib/current-line-calibration.mjs";

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
const result = await runCurrentLineCalibration({
  now: nowArg ? new Date(nowArg) : undefined
});

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa current-line calibration");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`sample_sets: ${result.summary.sample_set_count}`);
  console.log(`sources: ${result.summary.source_count}`);
  console.log(`atomic_lessons: ${result.summary.atomic_lesson_count}`);
  console.log(`work_orders: ${result.summary.work_order_count}`);
  console.log(`tournaments: ${result.summary.tournament_count}`);
  console.log(`signal_layers: ${result.summary.signal_layer_count}`);
  console.log(`observed_signals: ${result.summary.observed_signal_count}`);
  console.log(`perception_replay_ok: ${result.summary.perception_replay_ok}`);
  console.log(`perception_attention_queue: ${result.summary.perception_attention_queue_count}`);
  console.log(`perception_duplicate_clusters: ${result.summary.perception_duplicate_cluster_count}`);
  console.log(`retrieval_top1_exact_recall: ${result.summary.retrieval_top1_exact_recall}`);
  console.log(`judge_recommended: ${result.summary.judge_recommended_count}`);
  console.log(`judge_near_threshold: ${result.summary.judge_near_threshold_count}`);
  console.log(`high_value_llm_review: ${result.summary.high_value_llm_review_count}`);
  console.log(`production_authority: ${result.summary.production_authority}`);
  console.log(`zilliz_written: ${result.summary.zilliz_written}`);
  console.log(`embedding_created: ${result.summary.embedding_created}`);
  console.log(`writes_persistent_memory: ${result.summary.writes_persistent_memory}`);
  console.log(`external_api_calls: ${result.summary.external_api_calls}`);
  console.log(`llm_api_calls: ${result.summary.llm_api_calls}`);

  for (const sample of result.sample_sets) {
    console.log(
      `${sample.ok ? "PASS" : "FAIL"} ${sample.sample_set_id}: `
        + `routes=${JSON.stringify(sample.tournament.route_counts)} `
        + `retrieval_top1=${sample.retrieval_probe.top1_kind}/${sample.retrieval_probe.top1_record_id} `
        + `judge=${sample.tournament.judge_escalation.llm_review_value}`
    );
  }
}

process.exitCode = result.ok ? 0 : 1;
