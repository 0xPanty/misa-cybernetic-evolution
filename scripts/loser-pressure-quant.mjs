#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  DEFAULT_LOSER_PRESSURE_OUT_DIR,
  DEFAULT_LOSER_PRESSURE_REPORT,
  DEFAULT_LOSER_PRESSURE_TARGET,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  runLoserPressureQuant,
  writeLoserPressureQuantArtifacts
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

const result = await runLoserPressureQuant({
  now,
  targetSamples: readIntArg("target-samples", DEFAULT_LOSER_PRESSURE_TARGET),
  baseReportPath: readArg("base-report") ?? DEFAULT_LOSER_PRESSURE_REPORT,
  useOllama: hasArg("use-ollama"),
  ollamaBaseUrl: readArg("ollama-base-url") ?? DEFAULT_OLLAMA_BASE_URL,
  ollamaModel: readArg("ollama-model") ?? DEFAULT_OLLAMA_MODEL,
  ollamaBatchSize: readIntArg("ollama-batch-size", 15),
  ollamaTimeoutMs: readIntArg("ollama-timeout-ms", 180_000),
  progress: quiet ? undefined : (line) => console.error(`[loser-pressure] ${line}`)
});

const written = dryRun
  ? result
  : await writeLoserPressureQuantArtifacts({
      result,
      outDir: readArg("out-dir") ?? DEFAULT_LOSER_PRESSURE_OUT_DIR,
      now
    });

await writeJsonOutFile(written, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(written, null, 2));
} else {
  console.log(`loser-pressure-quant ok=${written.ok}`);
  console.log(`samples=${written.metrics.sample_count}`);
  console.log(`base_samples=${written.input.selected_base_sample_count}`);
  console.log(`generated_samples=${written.input.generated_sample_count}`);
  console.log(`ollama_used=${written.input.ollama.used}`);
  console.log(`unsafe_recall=${written.metrics.unsafe_recall}`);
  console.log(`false_suppression_rate=${written.metrics.false_suppression_rate}`);
  console.log(`promising_survival_rate=${written.metrics.promising_survival_rate}`);
  console.log(`weak_evidence_gate_rate=${written.metrics.weak_evidence_gate_rate}`);
  console.log(`winner_contamination_rate=${written.metrics.winner_contamination_rate}`);
  console.log(`reactivation_success_rate=${written.metrics.reactivation_success_rate}`);
  console.log(`final_memory_hhi=${written.final_memory.hhi}`);
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
