#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  DEFAULT_LOSER_PRESSURE_TARGET,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  runLoserPressureMatrix,
  writeLoserPressureMatrixArtifacts
} from "./lib/loser-pressure-quant.mjs";

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

function readIntArg(name, fallback) {
  const raw = readArg(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const dryRun = hasArg("dry-run") || hasArg("no-write");
const quiet = hasArg("quiet");

const result = await runLoserPressureMatrix({
  now,
  targetSamples: readIntArg("target-samples", DEFAULT_LOSER_PRESSURE_TARGET),
  useOllama: hasArg("use-ollama"),
  ollamaBaseUrl: readArg("ollama-base-url") ?? DEFAULT_OLLAMA_BASE_URL,
  ollamaModel: readArg("ollama-model") ?? DEFAULT_OLLAMA_MODEL,
  ollamaBatchSize: readIntArg("ollama-batch-size", 15),
  ollamaTimeoutMs: readIntArg("ollama-timeout-ms", 180_000),
  progress: quiet ? undefined : (line) => console.error(`[loser-matrix] ${line}`)
});

const written = dryRun
  ? result
  : await writeLoserPressureMatrixArtifacts({
      result,
      outDir: readArg("out-dir"),
      now
    });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`loser-pressure-matrix ok=${written.ok}`);
  console.log(`target_samples_per_scenario=${written.target_samples_per_scenario}`);
  console.log(`total_scenario_runs=${written.total_scenario_runs}`);
  console.log(`total_sample_assessments=${written.total_sample_assessments}`);
  console.log(`recommended_parameter_id=${written.recommended_parameter_id}`);
  for (const summary of written.parameter_summaries) {
    console.log([
      `parameter=${summary.parameter_id}`,
      `pass=${summary.pass_count}/${summary.scenario_count}`,
      `worst_unsafe_recall=${summary.worst_unsafe_recall}`,
      `worst_false_suppression_rate=${summary.worst_false_suppression_rate}`,
      `worst_weak_evidence_gate_rate=${summary.worst_weak_evidence_gate_rate}`,
      `worst_winner_contamination_rate=${summary.worst_winner_contamination_rate}`,
      `worst_stability_score=${summary.worst_stability_score}`
    ].join(" "));
  }
  console.log(`zilliz_written=${Number(written.safety.zilliz_written)}`);
  console.log(`embedding_created=${Number(written.safety.embedding_created)}`);
  console.log(`llm_judge_used=${Number(written.safety.llm_judge_used)}`);
  console.log(`vps_touched=${Number(written.safety.vps_touched)}`);
  console.log(`git_touched=${Number(written.safety.git_touched)}`);
  if (written.output) {
    console.log(`output_dir=${written.output.output_dir}`);
    console.log(`json=${written.output.json_path}`);
    console.log(`markdown=${written.output.markdown_path}`);
  }
}

process.exitCode = written.ok ? 0 : 1;
