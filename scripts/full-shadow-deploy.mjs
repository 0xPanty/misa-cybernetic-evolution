#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { distillLocalMisaSources } from "./lib/session-distiller.mjs";
import {
  DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG,
  runHermesRuntimeAdapter
} from "./lib/hermes-runtime-adapter.mjs";
import {
  DEFAULT_HERMES_RUNTIME_PLUGIN_DIR,
  runHermesRuntimePluginDoctor,
  runHermesRuntimePluginInstall
} from "./lib/hermes-runtime-plugin.mjs";
import { runHermesWorkOrderPipeline } from "./lib/hermes-work-order.mjs";
import {
  reviewSessionDistillerOutput,
  writeSessionDistillerReviewOutFile
} from "./lib/session-distiller-review.mjs";
import {
  exportInboxOwnerDigest,
  exportReviewWorkOrdersToInbox
} from "./lib/work-order-inbox.mjs";
import { runLocalSidecarQuickstart } from "./local-quickstart.mjs";

const DEFAULT_REPORT_ROOT = "runs/full-shadow-deploy";
const DEFAULT_SESSION_SUMMARY = "examples/session-distiller-summary.example.json";
const DEFAULT_WORK_ORDER_ROOT = "runs/work-orders/cybernetic";
const DEFAULT_SEED_COUNT = 500;

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
    : DEFAULT_SEED_COUNT;
}

function expandHome(relOrAbs) {
  if (relOrAbs === "~") return os.homedir();
  if (relOrAbs?.startsWith("~/") || relOrAbs?.startsWith("~\\")) {
    return path.join(os.homedir(), relOrAbs.slice(2));
  }
  return relOrAbs;
}

function resolvePath(repoRoot, maybePath) {
  const expanded = expandHome(maybePath);
  return path.isAbsolute(expanded) ? expanded : path.join(repoRoot, expanded);
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

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function ensureEventLog(filePath) {
  const existed = await fileExists(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!existed) {
    await fs.writeFile(filePath, "", { encoding: "utf8", flag: "wx" });
  }
  return {
    path: filePath,
    existed,
    created: !existed
  };
}

function compactRuntimeAdapter(adapter) {
  return {
    ok: adapter.ok,
    event_count: adapter.summary.event_count,
    research_digest_count: adapter.summary.research_digest_count,
    evolution_candidate_count: adapter.summary.evolution_candidate_count,
    replay_required_count: adapter.summary.replay_required_count,
    default_mode: adapter.summary.default_mode,
    verifier: adapter.summary.verifier,
    safety: adapter.safety
  };
}

function compactWorkOrderPipeline(pipeline) {
  return {
    ok: pipeline.ok,
    events: pipeline.adapter.summary.event_count,
    work_orders: pipeline.routing.summary.work_order_count,
    variants: pipeline.variants.summary.variant_count,
    quality_comparisons: pipeline.quality.summary.comparison_count,
    avg_delta: pipeline.quality.summary.avg_delta,
    positive_lift_rate: pipeline.quality.summary.positive_lift_rate,
    safety_regressions: pipeline.quality.summary.safety_regression_count,
    guarded_agent_adoption_ready: pipeline.routing.summary.guarded_agent_adoption_ready_count,
    safety: pipeline.safety
  };
}

function compactSessionReview(review) {
  return {
    ok: review.ok,
    verdict: review.summary.verdict,
    finding_count: review.summary.finding_count,
    repair_work_order_count: review.summary.repair_work_order_count,
    highest_severity: review.summary.highest_severity,
    llm_called_count: review.summary.llm_called_count,
    safety: review.safety
  };
}

function compactWindowDistillation(distillation) {
  return {
    ok: distillation.ok,
    source_count: distillation.summary.source_count,
    learning_event_count: distillation.summary.learning_event_count,
    atomic_lesson_count: distillation.summary.atomic_lesson_count,
    compound_source_count: distillation.summary.compound_source_count,
    llm_api_calls: distillation.summary.llm_api_calls,
    external_api_calls: distillation.summary.external_api_calls,
    zilliz_proxy_used: distillation.summary.zilliz_proxy_used,
    local_vector_index_used: distillation.summary.local_vector_index_used,
    production_authority: distillation.summary.production_authority,
    safety: distillation.safety
  };
}

function compactInboxExport(inbox) {
  return {
    ok: inbox.ok,
    root: inbox.root,
    inbox_dir: inbox.inbox_dir,
    written_count: inbox.summary.written_count,
    merged_existing_count: inbox.summary.merged_existing_count,
    skipped_existing_count: inbox.summary.skipped_existing_count,
    inbox_count: inbox.summary.inbox_count,
    report_needed_count: inbox.summary.report_needed_count,
    spike_count: inbox.summary.spike_count,
    auto_execute: inbox.summary.auto_execute,
    safety: inbox.safety
  };
}

function compactOwnerDigest(digest) {
  return {
    ok: digest.ok,
    root: digest.root,
    report_item_count: digest.summary.report_item_count,
    total_new_since_last_report: digest.summary.total_new_since_last_report,
    total_occurrence_count: digest.summary.total_occurrence_count,
    spike_count: digest.summary.spike_count,
    mark_reported: digest.summary.mark_reported,
    artifacts: digest.artifacts,
    auto_execute: digest.safety.auto_execute,
    executes_work_orders: digest.safety.executes_work_orders,
    safety: digest.safety
  };
}

export async function runFullShadowDeploy({
  repoRoot = process.cwd(),
  reportRoot = DEFAULT_REPORT_ROOT,
  pluginDir = DEFAULT_HERMES_RUNTIME_PLUGIN_DIR,
  eventLogFile = DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG,
  sessionSummaryFile = process.env.MISA_SESSION_DISTILLER_SUMMARY_OUTPUT || DEFAULT_SESSION_SUMMARY,
  sessionManifestFile = process.env.MISA_SESSION_DISTILLER_ZILLIZ_MANIFEST,
  sessionLlmFile = process.env.MISA_SESSION_DISTILLER_LLM_OUTPUT,
  sessionRollbackFile = process.env.MISA_SESSION_DISTILLER_ZILLIZ_ROLLBACK,
  workOrderRoot = process.env.MISA_CYBERNETIC_WORK_ORDER_ROOT || DEFAULT_WORK_ORDER_ROOT,
  seedCount = DEFAULT_SEED_COUNT,
  now = new Date()
} = {}) {
  const resolvedReportRoot = resolvePath(repoRoot, reportRoot);
  const resolvedEventLog = resolvePath(repoRoot, eventLogFile);
  const sessionReviewPath = path.join(resolvedReportRoot, "session-distiller-review.json");

  const quickstart = await runLocalSidecarQuickstart({
    repoRoot,
    reportRoot: path.join(reportRoot, "local-sidecar"),
    seedCount,
    now
  });
  const pluginInstall = await runHermesRuntimePluginInstall({
    repoRoot,
    pluginDir,
    eventLogFile,
    now,
    outFile: path.join(reportRoot, "hermes-plugin-install.json")
  });
  const eventLog = await ensureEventLog(resolvedEventLog);
  const pluginDoctor = await runHermesRuntimePluginDoctor({
    repoRoot,
    pluginDir,
    eventLogFile,
    now,
    outFile: path.join(reportRoot, "hermes-plugin-doctor.json")
  });
  const adapter = await runHermesRuntimeAdapter({
    repoRoot,
    eventLogFile,
    runtimeCommit: "full-shadow-deploy",
    sourceUrl: "local-hermes-plugin-event-log",
    now
  });
  const hermesWorkOrder = await runHermesWorkOrderPipeline({
    repoRoot,
    eventLogFile,
    runtimeCommit: "full-shadow-deploy",
    sourceUrl: "local-hermes-plugin-event-log",
    seed: "full-shadow-deploy",
    now
  });
  const windowDistillation = await distillLocalMisaSources({
    repoRoot,
    requireTemplateCoverage: true
  });
  await writeJsonOutFile(windowDistillation, path.join(reportRoot, "window-distillation.json"), { repoRoot });
  const sessionReview = await reviewSessionDistillerOutput({
    summaryFile: sessionSummaryFile,
    manifestFile: sessionManifestFile,
    llmFile: sessionLlmFile,
    rollbackFile: sessionRollbackFile,
    now
  });
  await writeSessionDistillerReviewOutFile(sessionReview, sessionReviewPath, { repoRoot });
  const inbox = await exportReviewWorkOrdersToInbox({
    review: sessionReview,
    reviewFile: sessionReviewPath,
    root: workOrderRoot,
    repoRoot,
    now
  });
  const ownerDigest = await exportInboxOwnerDigest({
    root: workOrderRoot,
    repoRoot,
    now
  });

  const checks = [
    {
      name: "local sidecar quickstart passes",
      ok: quickstart.ok,
      seed_count: quickstart.summary.seed_count,
      value_comparisons: quickstart.summary.value_comparisons
    },
    {
      name: "Hermes observe-only plugin is installed",
      ok: pluginInstall.ok,
      plugin_dir: pluginInstall.plugin_dir
    },
    {
      name: "Hermes event log is attached",
      ok: await fileExists(resolvedEventLog),
      event_log_file: resolvedEventLog,
      created: eventLog.created
    },
    {
      name: "Hermes plugin doctor passes",
      ok: pluginDoctor.ok,
      event_log_present: pluginDoctor.summary.event_log_present,
      adapter_events: pluginDoctor.summary.adapter_events
    },
    {
      name: "Hermes runtime adapter replays the event log",
      ok: adapter.ok,
      events: adapter.summary.event_count,
      candidates: adapter.summary.evolution_candidate_count
    },
    {
      name: "Hermes work-order chain is online",
      ok: hermesWorkOrder.ok,
      work_orders: hermesWorkOrder.routing.summary.work_order_count,
      comparisons: hermesWorkOrder.quality.summary.comparison_count
    },
    {
      name: "window distillation is generated",
      ok: windowDistillation.ok,
      sources: windowDistillation.summary.source_count,
      atomic_lessons: windowDistillation.summary.atomic_lesson_count,
      zilliz_proxy_used: windowDistillation.summary.zilliz_proxy_used
    },
    {
      name: "session-distiller review runs",
      ok: sessionReview.ok,
      verdict: sessionReview.summary.verdict,
      repair_work_orders: sessionReview.summary.repair_work_order_count
    },
    {
      name: "work-order inbox is ready",
      ok: inbox.ok,
      inbox_dir: inbox.inbox_dir,
      inbox_count: inbox.summary.inbox_count
    },
    {
      name: "work-order owner digest is ready",
      ok: ownerDigest.ok,
      report_item_count: ownerDigest.summary.report_item_count,
      total_new_since_last_report: ownerDigest.summary.total_new_since_last_report,
      executes_work_orders: ownerDigest.safety.executes_work_orders
    }
  ];

  const result = {
    schema_version: "misa.full_shadow_deploy.v1",
    mode: "full-shadow-deploy",
    ok: checks.every((check) => check.ok),
    created_at: asIsoDate(now),
    summary: {
      ...countChecks(checks),
      seed_count: seedCount,
      window_distillation_sources: windowDistillation.summary.source_count,
      window_atomic_lessons: windowDistillation.summary.atomic_lesson_count,
      hermes_event_count: adapter.summary.event_count,
      hermes_work_order_count: hermesWorkOrder.routing.summary.work_order_count,
      session_review_verdict: sessionReview.summary.verdict,
      inbox_count: inbox.summary.inbox_count,
      owner_digest_report_count: ownerDigest.summary.report_item_count,
      value_comparisons: quickstart.summary.value_comparisons,
      positive_lift_rate: quickstart.summary.positive_lift_rate
    },
    checks,
    outputs: {
      report_root: resolvedReportRoot,
      latest_json: path.join(resolvedReportRoot, "latest.json"),
      local_sidecar_report: quickstart.outputs.quickstart_report,
      hermes_plugin_install: path.join(resolvedReportRoot, "hermes-plugin-install.json"),
      hermes_plugin_doctor: path.join(resolvedReportRoot, "hermes-plugin-doctor.json"),
      hermes_event_log: resolvedEventLog,
      window_distillation: path.join(resolvedReportRoot, "window-distillation.json"),
      session_review: sessionReviewPath,
      work_order_inbox: inbox.inbox_dir,
      work_order_owner_digest: ownerDigest.artifacts.markdown
    },
    integration: {
      hermes_plugin_dir: pluginInstall.plugin_dir,
      hermes_event_log: resolvedEventLog,
      session_summary_file: sessionSummaryFile,
      work_order_root: inbox.root,
      vps_style_hook_available: "scripts/deploy/misa-cybernetic-session-distiller-review.sh",
      systemd_drop_in_available: "scripts/deploy/misa-session-distiller-cybernetic-review.conf"
    },
    safety: {
      full_shadow_online: true,
      production_deploy: false,
      starts_background_service: false,
      installs_observe_only_hermes_plugin: true,
      writes_hermes_event_log_file: eventLog.created,
      writes_window_distillation_report: true,
      writes_local_vector_store: quickstart.safety.writes_local_vector_store,
      writes_work_order_inbox: true,
      writes_work_order_owner_digest: true,
      writes_zilliz: false,
      embedding_created: false,
      llm_api_calls: quickstart.safety.llm_api_calls + hermesWorkOrder.safety.llm_api_calls,
      external_api_calls: quickstart.safety.external_api_calls + hermesWorkOrder.safety.external_api_calls,
      provider_credentials_read: false,
      hermes_memory_written: false,
      hermes_skills_written: false,
      blocks_runtime_tools: false,
      can_promote_to_production: false
    },
    artifacts: {
      local_sidecar_quickstart: {
        ok: quickstart.ok,
        summary: quickstart.summary,
        safety: quickstart.safety
      },
      hermes_plugin_install: {
        ok: pluginInstall.ok,
        plugin_dir: pluginInstall.plugin_dir,
        event_log_file: pluginInstall.event_log_file,
        safety: pluginInstall.safety
      },
      hermes_plugin_doctor: {
        ok: pluginDoctor.ok,
        summary: pluginDoctor.summary,
        safety: pluginDoctor.safety
      },
      hermes_runtime_adapter: compactRuntimeAdapter(adapter),
      hermes_work_order: compactWorkOrderPipeline(hermesWorkOrder),
      window_distillation: compactWindowDistillation(windowDistillation),
      session_distiller_review: compactSessionReview(sessionReview),
      work_order_inbox: compactInboxExport(inbox),
      work_order_owner_digest: compactOwnerDigest(ownerDigest)
    },
    notes: [
      "This is the one-command full shadow path: local sidecar, window distillation, Hermes observe-only plugin, event-log replay, session-distiller review, work-order inbox, owner digest, and value proof.",
      "It mirrors the VPS sidecar shape without granting production authority.",
      "Hermes event count can be zero immediately after deploy; it increases after Hermes loads the plugin and emits hook events."
    ]
  };

  await writeJsonOutFile(result, path.join(reportRoot, "latest.json"), { repoRoot });
  return result;
}

function printSummary(result) {
  console.log("misa full shadow deploy");
  console.log(`ok: ${result.ok}`);
  console.log(`checks: ${result.summary.passed}/${result.summary.total}`);
  console.log(`seed_count: ${result.summary.seed_count}`);
  console.log(`value_comparisons: ${result.summary.value_comparisons}`);
  console.log(`positive_lift_rate: ${result.summary.positive_lift_rate}`);
  console.log(`window_atomic_lessons: ${result.summary.window_atomic_lessons}`);
  console.log(`hermes_events: ${result.summary.hermes_event_count}`);
  console.log(`hermes_work_orders: ${result.summary.hermes_work_order_count}`);
  console.log(`session_review_verdict: ${result.summary.session_review_verdict}`);
  console.log(`inbox_count: ${result.summary.inbox_count}`);
  console.log(`owner_digest_report_count: ${result.summary.owner_digest_report_count}`);
  console.log(`report: ${result.outputs.latest_json}`);
  console.log(`production_deploy: ${result.safety.production_deploy}`);
  console.log(`llm_api_calls: ${result.safety.llm_api_calls}`);
  console.log(`external_api_calls: ${result.safety.external_api_calls}`);
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
  }
}

async function main() {
  const nowArg = readArg("now");
  const result = await runFullShadowDeploy({
    repoRoot: process.cwd(),
    reportRoot: readArg("report-root") ?? DEFAULT_REPORT_ROOT,
    pluginDir: readArg("plugin-dir") ?? DEFAULT_HERMES_RUNTIME_PLUGIN_DIR,
    eventLogFile: readArg("event-log") ?? DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG,
    sessionSummaryFile: readArg("session-summary") ?? process.env.MISA_SESSION_DISTILLER_SUMMARY_OUTPUT ?? DEFAULT_SESSION_SUMMARY,
    sessionManifestFile: readArg("zilliz-manifest") ?? process.env.MISA_SESSION_DISTILLER_ZILLIZ_MANIFEST,
    sessionLlmFile: readArg("llm-summary") ?? process.env.MISA_SESSION_DISTILLER_LLM_OUTPUT,
    sessionRollbackFile: readArg("zilliz-rollback") ?? process.env.MISA_SESSION_DISTILLER_ZILLIZ_ROLLBACK,
    workOrderRoot: readArg("work-order-root") ?? process.env.MISA_CYBERNETIC_WORK_ORDER_ROOT ?? DEFAULT_WORK_ORDER_ROOT,
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
