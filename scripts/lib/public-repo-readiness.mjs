import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonOutFile } from "./cli-output.mjs";
import { runCurrentLineSmoke } from "./current-line-smoke.mjs";
import {
  DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  localVectorStoreStats,
  queryLocalVectorStore,
  upsertDistillationToLocalVectorStore
} from "./local-vector-store.mjs";
import { runHermesRuntimePluginDoctor } from "./hermes-runtime-plugin.mjs";
import { runWorkOrderQualityEvaluation } from "./work-order-quality-eval.mjs";
import { runWorkOrderVariants } from "./work-order-variants.mjs";
import { runPrecheck } from "./precheck-core.mjs";
import { runQianxuesenFullLoopHealth } from "./qianxuesen-full-loop-health.mjs";
import { validateSchemas } from "./schema-validation.mjs";
import { runSkillEvolutionSupervisor } from "./skill-evolution-supervisor.mjs";

export const DEFAULT_BOOTSTRAP_REPORT_ROOT = "runs/bootstrap-local";

const REQUIRED_PUBLIC_SCRIPTS = [
  "doctor",
  "bootstrap:local",
  "distill:misa",
  "skill:evolution",
  "vector-store:local",
  "hermes:adapt-runtime",
  "hermes:plugin:install",
  "hermes:plugin:doctor",
  "work-order:variants",
  "work-order:evaluate",
  "smoke:current-line",
  "health:qianxuesen",
  "precheck",
  "test"
];

function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-14T00:00:00Z").toISOString() : date.toISOString();
}

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok).length
  };
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return undefined;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

export async function runPublicRepoDoctor({
  repoRoot = process.cwd(),
  now = new Date()
} = {}) {
  const pkg = await readJson(path.join(repoRoot, "package.json"));
  const scripts = pkg.scripts ?? {};
  const missingScripts = REQUIRED_PUBLIC_SCRIPTS.filter((name) => !scripts[name]);
  const validate = await validateSchemas({ repoRoot });
  const smoke = await runCurrentLineSmoke({ repoRoot, now });
  const workOrderVariants = await runWorkOrderVariants({
    repoRoot,
    seed: "public-repo-doctor",
    now
  });
  const workOrderQualityEval = await runWorkOrderQualityEvaluation({
    repoRoot,
    seeds: ["doctor-quality-01", "doctor-quality-02", "doctor-quality-03"],
    now
  });
  const hermesPluginDoctor = await runHermesRuntimePluginDoctor({
    repoRoot,
    pluginDir: path.join("examples", "hermes-runtime-plugin"),
    eventLogFile: path.join("examples", "hermes-runtime-plugin", "sample-events.ndjson"),
    now
  });
  const skillEvolution = await runSkillEvolutionSupervisor({ repoRoot, now });
  const localStoreDryRun = await upsertDistillationToLocalVectorStore({
    repoRoot,
    sourceDir: path.join("examples", "misa-distillation"),
    requireTemplateCoverage: true,
    dryRun: true,
    now
  });
  const precheck = await runPrecheck({ repoRoot });

  const checks = [
    checkResult("node version is supported", nodeMajor() >= 20, {
      node: process.versions.node,
      required: ">=20"
    }),
    checkResult("package is public-ready", pkg.private === false && Boolean(pkg.license), {
      private: pkg.private,
      license: pkg.license
    }),
    checkResult("public entry scripts exist", missingScripts.length === 0, {
      required: REQUIRED_PUBLIC_SCRIPTS,
      missing: missingScripts
    }),
    checkResult("public docs exist", (
      await fileExists(path.join(repoRoot, "README.md"))
      && await fileExists(path.join(repoRoot, "QUICKSTART.md"))
      && await fileExists(path.join(repoRoot, "SECURITY.md"))
      && await fileExists(path.join(repoRoot, "LICENSE"))
    )),
    checkResult("schemas validate", validate.ok, {
      checks: validate.checks.length
    }),
    checkResult("current-line smoke passes", smoke.ok, {
      checks: smoke.summary
    }),
    checkResult("work-order variants stay local and zero-call", workOrderVariants.ok, {
      workOrders: workOrderVariants.summary.work_order_count,
      variants: workOrderVariants.summary.variant_count,
      llmCritiqueRecommended: workOrderVariants.summary.llm_critique_recommended_count,
      executesWorkOrders: workOrderVariants.safety.executes_work_orders,
      llmApiCalls: workOrderVariants.safety.llm_api_calls
    }),
    checkResult("work-order quality evaluation shows positive local lift", workOrderQualityEval.ok, {
      comparisons: workOrderQualityEval.summary.comparison_count,
      avgBaselineScore: workOrderQualityEval.summary.avg_baseline_score,
      avgWinnerScore: workOrderQualityEval.summary.avg_winner_score,
      avgDelta: workOrderQualityEval.summary.avg_delta,
      positiveLiftRate: workOrderQualityEval.summary.positive_lift_rate,
      safetyRegressions: workOrderQualityEval.summary.safety_regression_count,
      llmApiCalls: workOrderQualityEval.safety.llm_api_calls
    }),
    checkResult("Hermes runtime plugin sample is checkable", hermesPluginDoctor.ok, {
      checks: hermesPluginDoctor.summary,
      writes_persistent_memory: hermesPluginDoctor.safety.writes_persistent_memory,
      writes_skills: hermesPluginDoctor.safety.writes_skills,
      llm_api_calls: hermesPluginDoctor.safety.llm_api_calls,
      external_api_calls: hermesPluginDoctor.safety.external_api_calls
    }),
    checkResult("skill evolution sample stays replay-gated", skillEvolution.ok && skillEvolution.summary.replay_required_count > 0, {
      candidates: skillEvolution.summary.evolution_candidate_count,
      replay_required: skillEvolution.summary.replay_required_count,
      no_write: skillEvolution.safety.no_write
    }),
    checkResult("local vector store dry-run accepts public distillation template", localStoreDryRun.ok, {
      records: localStoreDryRun.summary.record_count,
      zilliz_written: localStoreDryRun.safety.zilliz_written,
      local_vector_store_written: localStoreDryRun.safety.local_vector_store_written
    }),
    checkResult("precheck passes", precheck.ok, {
      phases: precheck.phase_summary
    })
  ];

  return {
    schema_version: "misa.public_repo_doctor.v1",
    mode: "public-repo-doctor",
    ok: checks.every((check) => check.ok),
    created_at: asIsoDate(now),
    summary: countChecks(checks),
    checks,
    safety: {
      read_only: true,
      local_vector_store_written: false,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false,
      vps_or_runtime_touch_allowed: false
    },
    notes: [
      "doctor is for clone-time readiness and does not initialize a persistent store",
      "run bootstrap:local to create the ignored local vector store"
    ]
  };
}

export async function runLocalBootstrap({
  repoRoot = process.cwd(),
  vectorRoot = DEFAULT_LOCAL_VECTOR_STORE_ROOT,
  reportRoot = DEFAULT_BOOTSTRAP_REPORT_ROOT,
  now = new Date()
} = {}) {
  const resolvedReportRoot = resolvePath(repoRoot, reportRoot);
  const vectorStore = await upsertDistillationToLocalVectorStore({
    repoRoot,
    rootDir: vectorRoot,
    sourceDir: path.join("examples", "misa-distillation"),
    requireTemplateCoverage: true,
    dryRun: false,
    now
  });
  const query = await queryLocalVectorStore({
    repoRoot,
    rootDir: vectorRoot,
    query: "public posting policy boundary",
    route: "policy",
    topK: 3,
    now
  });
  const stats = await localVectorStoreStats({
    repoRoot,
    rootDir: vectorRoot,
    now
  });
  const health = await runQianxuesenFullLoopHealth({
    rootDir: path.join(reportRoot, "qianxuesen-full-loop"),
    now
  });
  const checks = [
    checkResult("local vector store initialized", vectorStore.ok && vectorStore.safety.local_vector_store_written === true, {
      records: vectorStore.summary.record_count,
      root: vectorStore.root
    }),
    checkResult("local vector query returns policy evidence", query.ok && query.summary.hit_count > 0 && query.hits.every((hit) => hit.route === "policy"), {
      hits: query.summary.hit_count,
      top1: query.summary.top1_record_id
    }),
    checkResult("local vector stats readable", stats.ok && stats.summary.record_count >= vectorStore.summary.record_count, {
      records: stats.summary.record_count,
      batches: stats.summary.batch_count
    }),
    checkResult("qianxuesen health passes", health.ok, {
      status: health.status,
      blocking_failures: health.blocking_failures.length
    }),
    checkResult("bootstrap stayed local", (
      vectorStore.safety.zilliz_written === false
      && query.safety.zilliz_written === false
      && stats.safety.zilliz_written === false
      && health.safety.zilliz_written === false
    ), {
      zilliz_written: false
    })
  ];
  const report = {
    schema_version: "misa.local_bootstrap.v1",
    mode: "local-bootstrap",
    ok: checks.every((check) => check.ok),
    created_at: asIsoDate(now),
    summary: {
      ...countChecks(checks),
      vector_records: vectorStore.summary.record_count,
      query_hits: query.summary.hit_count,
      health_status: health.status
    },
    checks,
    outputs: {
      vector_store_root: vectorStore.root,
      report_root: resolvedReportRoot,
      latest_json: path.join(resolvedReportRoot, "latest.json")
    },
    safety: {
      local_vector_store_written: true,
      zilliz_written: false,
      embedding_created: false,
      external_api_calls: 0,
      provider_credentials_read: false,
      vps_or_runtime_touch_allowed: false,
      public_posting_allowed: false
    },
    artifacts: {
      vector_store: {
        batch_id: vectorStore.batch_id,
        records: vectorStore.summary.record_count,
        paths: vectorStore.paths
      },
      query: {
        hits: query.summary.hit_count,
        top1_record_id: query.summary.top1_record_id
      },
      health: {
        run_id: health.run_id,
        status: health.status,
        latest_json: health.outputs.latest_json
      }
    }
  };

  await writeJsonOutFile(report, path.join(reportRoot, "latest.json"), { repoRoot });
  return report;
}
