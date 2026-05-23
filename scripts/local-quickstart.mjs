#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { DEFAULT_LOCAL_VECTOR_STORE_ROOT } from "./lib/local-vector-store.mjs";
import {
  DEFAULT_BOOTSTRAP_REPORT_ROOT,
  runLocalBootstrap,
  runPublicRepoDoctor
} from "./lib/public-repo-readiness.mjs";
import { runHermesValueProof } from "./hermes-value-proof.mjs";

const DEFAULT_REPORT_ROOT = "runs/local-sidecar-quickstart";
const DEFAULT_VALUE_PROOF_SEED_COUNT = 500;

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

function parseSeedCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0
    ? Math.max(1, Math.floor(count))
    : DEFAULT_VALUE_PROOF_SEED_COUNT;
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok).length
  };
}

function resolvePath(repoRoot, maybePath) {
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function valueProofApiCalls(valueProof) {
  return {
    llm_api_calls: valueProof.safety_counters.work_order_eval_llm_api_calls
      + valueProof.safety_counters.hermes_llm_api_calls,
    external_api_calls: valueProof.safety_counters.work_order_eval_external_api_calls
      + valueProof.safety_counters.hermes_external_api_calls
  };
}

function compactValueProof(valueProof) {
  const calls = valueProofApiCalls(valueProof);
  return {
    ok: valueProof.ok,
    verdict: valueProof.verdict,
    seed_count: valueProof.seed_count,
    sample_surface: valueProof.sample_surface,
    combined: {
      comparison_count: valueProof.combined.comparison_count,
      positive_lift_rate: valueProof.combined.positive_lift_rate,
      avg_delta: valueProof.combined.avg_delta,
      min_delta: valueProof.combined.min_delta,
      safety_regression_count: valueProof.combined.safety_regression_count,
      evolution_evidence_count: valueProof.combined.evolution_evidence_count,
      supported_optimization_evidence_count: valueProof.combined.supported_optimization_evidence_count
    },
    holdout_passed: valueProof.work_order_quality_eval.holdout_passed,
    negative_control_rejected: valueProof.negative_control.correctly_rejected_bad_evidence,
    ...calls
  };
}

export async function runLocalSidecarQuickstart({
  repoRoot = process.cwd(),
  vectorRoot = DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  bootstrapReportRoot = DEFAULT_BOOTSTRAP_REPORT_ROOT,
  reportRoot = DEFAULT_REPORT_ROOT,
  seedCount = DEFAULT_VALUE_PROOF_SEED_COUNT,
  now = new Date()
} = {}) {
  const doctor = await runPublicRepoDoctor({ repoRoot, now });
  const bootstrap = await runLocalBootstrap({
    repoRoot,
    vectorRoot,
    reportRoot: bootstrapReportRoot,
    now
  });
  const valueProof = await runHermesValueProof({
    repoRoot,
    seedCount,
    now
  });
  const apiCalls = valueProofApiCalls(valueProof);
  const localSafetyOk = doctor.safety.read_only === true
    && bootstrap.safety.local_vector_store_written === true
    && bootstrap.safety.zilliz_written === false
    && apiCalls.llm_api_calls === 0
    && apiCalls.external_api_calls === 0
    && valueProof.safety_counters.hermes_write_memory_runs === 0
    && valueProof.safety_counters.hermes_write_skill_runs === 0;

  const checks = [
    {
      name: "public clone doctor passes",
      ok: doctor.ok,
      passed: doctor.summary.passed,
      total: doctor.summary.total
    },
    {
      name: "local vector store bootstraps",
      ok: bootstrap.ok,
      vector_records: bootstrap.summary.vector_records,
      query_hits: bootstrap.summary.query_hits,
      health_status: bootstrap.summary.health_status
    },
    {
      name: "Hermes value proof passes",
      ok: valueProof.ok,
      verdict: valueProof.verdict,
      comparisons: valueProof.combined.comparison_count,
      positive_lift_rate: valueProof.combined.positive_lift_rate,
      safety_regressions: valueProof.combined.safety_regression_count
    },
    {
      name: "local-only safety boundary holds",
      ok: localSafetyOk,
      llm_api_calls: apiCalls.llm_api_calls,
      external_api_calls: apiCalls.external_api_calls,
      zilliz_written: bootstrap.safety.zilliz_written,
      hermes_memory_write_runs: valueProof.safety_counters.hermes_write_memory_runs,
      hermes_skill_write_runs: valueProof.safety_counters.hermes_write_skill_runs
    }
  ];

  const quickstartReport = resolvePath(repoRoot, path.join(reportRoot, "latest.json"));
  const result = {
    schema_version: "misa.local_sidecar_quickstart.v1",
    mode: "local-sidecar-quickstart",
    ok: checks.every((check) => check.ok),
    created_at: asIsoDate(now),
    summary: {
      ...countChecks(checks),
      seed_count: seedCount,
      vector_records: bootstrap.summary.vector_records,
      value_comparisons: valueProof.combined.comparison_count,
      positive_lift_rate: valueProof.combined.positive_lift_rate,
      value_verdict: valueProof.verdict
    },
    checks,
    outputs: {
      vector_store_root: bootstrap.outputs.vector_store_root,
      bootstrap_report: bootstrap.outputs.latest_json,
      quickstart_report: quickstartReport
    },
    safety: {
      one_command_local_deploy: true,
      production_deploy: false,
      starts_background_service: false,
      writes_local_vector_store: bootstrap.safety.local_vector_store_written,
      writes_zilliz: false,
      embedding_created: false,
      llm_api_calls: apiCalls.llm_api_calls,
      external_api_calls: apiCalls.external_api_calls,
      provider_credentials_read: false,
      vps_or_runtime_touch_allowed: false,
      hermes_memory_written: false,
      hermes_skills_written: false,
      can_promote_to_production: false
    },
    artifacts: {
      doctor: {
        ok: doctor.ok,
        summary: doctor.summary,
        safety: doctor.safety
      },
      bootstrap: {
        ok: bootstrap.ok,
        summary: bootstrap.summary,
        outputs: bootstrap.outputs,
        safety: bootstrap.safety
      },
      hermes_value_proof: compactValueProof(valueProof)
    },
    notes: [
      "This is a one-command local sidecar setup and value check.",
      "It does not deploy production services, write Hermes memory, mutate Hermes skills, touch VPS, or call providers."
    ]
  };

  await writeJsonOutFile(result, path.join(reportRoot, "latest.json"), { repoRoot });
  return result;
}

function printSummary(result) {
  console.log("misa local sidecar quickstart");
  console.log(`ok: ${result.ok}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  console.log(`seed_count: ${result.summary.seed_count}`);
  console.log(`vector_records: ${result.summary.vector_records}`);
  console.log(`value_comparisons: ${result.summary.value_comparisons}`);
  console.log(`positive_lift_rate: ${result.summary.positive_lift_rate}`);
  console.log(`value_verdict: ${result.summary.value_verdict}`);
  console.log(`quickstart_report: ${result.outputs.quickstart_report}`);
  console.log(`production_deploy: ${result.safety.production_deploy}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`external_api_calls: ${result.safety.external_api_calls}`);
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

async function main() {
  const nowArg = readArg("now");
  const result = await runLocalSidecarQuickstart({
    repoRoot: process.cwd(),
    vectorRoot: readArg("vector-root") ?? DEFAULT_LOCAL_VECTOR_STORE_ROOT,
    bootstrapReportRoot: readArg("bootstrap-report-root") ?? DEFAULT_BOOTSTRAP_REPORT_ROOT,
    reportRoot: readArg("report-root") ?? DEFAULT_REPORT_ROOT,
    seedCount: parseSeedCount(readArg("seed-count")),
    now: nowArg ? new Date(nowArg) : new Date()
  });

  await writeJsonOutFile(result, readArg("out-file"));

  if (hasArg("json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
