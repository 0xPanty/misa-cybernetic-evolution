import fs from "node:fs/promises";
import path from "node:path";
import {
  buildExternalTrajectoryLlmWorkOrderDraftReport,
  writeExternalTrajectoryLlmWorkOrderDraftArtifacts
} from "./external-trajectory-llm-work-order-draft.mjs";
import {
  DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  buildL2L3SelectionAuditReport,
  writeL2L3SelectionAuditArtifacts
} from "./l2-l3-selection-audit.mjs";
import {
  DEFAULT_L4_REVIEW_PROVIDER,
  buildL4WorkOrderReviewReport,
  writeL4WorkOrderReviewArtifacts
} from "./l4-work-order-review.mjs";

export const DEFAULT_L1_L4_PIPELINE_OUT_DIR = "runs/l1-l4-work-order-pipeline";

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-20T00:00:00.000Z").toISOString() : date.toISOString();
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function sum(summary, field) {
  return Number(summary?.[field] ?? 0);
}

function buildPipelineSummary({ l2Report, l3Report, l4Report, l2Generated }) {
  return {
    l2_generated: l2Generated,
    l2_sample_count: sum(l2Report.summary, "sample_count"),
    l2_suppressed_count: sum(l2Report.summary, "l1_suppressed_count"),
    l2_draft_count: sum(l2Report.summary, "draft_count"),
    l1_candidate_mode: l2Report.summary?.candidate_mode ?? null,
    l1_handoff_floor_counts: l2Report.summary?.l1_handoff_floor_counts ?? {},
    l3_passed_gate_count: sum(l2Report.summary, "passed_gate_count"),
    l3_failed_gate_count: sum(l2Report.summary, "failed_gate_count"),
    l3_recheck_triggered_count: sum(l2Report.summary, "l3_recheck_triggered_count"),
    l3_accepted_after_recheck_count: sum(l2Report.summary, "l3_accepted_after_recheck_count"),
    l3_exhausted_no_value_count: sum(l2Report.summary, "l3_exhausted_no_value_count"),
    l3_pool_counts: l3Report.summary?.pool_counts ?? {},
    l3_l4_forward_count: sum(l3Report.summary, "l4_forward_count"),
    l3_red_spot_check_count: sum(l3Report.summary, "red_spot_check_count"),
    l4_sample_count: sum(l4Report.summary, "sample_count"),
    l4_verdict_counts: l4Report.summary?.verdict_counts ?? {},
    l4_handoff_target_counts: l4Report.summary?.handoff_target_counts ?? {},
    l4_requires_user_authorization_count: sum(l4Report.summary, "requires_user_authorization_count"),
    l4_authorization_scope_counts: l4Report.summary?.authorization_scope_counts ?? {},
    llm_api_calls: sum(l2Report.summary, "llm_api_calls") + sum(l4Report.summary, "llm_api_calls"),
    external_api_calls: sum(l2Report.summary, "external_api_calls") + sum(l4Report.summary, "external_api_calls"),
    work_order_executions: sum(l4Report.summary, "work_order_executions"),
    route_changes: sum(l2Report.summary, "route_changes") + sum(l3Report.summary, "route_changes") + sum(l4Report.summary, "route_changes"),
    memory_writes: sum(l2Report.summary, "memory_writes") + sum(l3Report.summary, "memory_writes") + sum(l4Report.summary, "memory_writes"),
    persistent_state_writes: sum(l2Report.summary, "zilliz_writes") + sum(l3Report.summary, "zilliz_writes") + sum(l4Report.summary, "zilliz_writes"),
    repository_pushes: sum(l2Report.summary, "github_pushes") + sum(l3Report.summary, "github_pushes") + sum(l4Report.summary, "github_pushes"),
    public_publishes: sum(l2Report.summary, "public_publishes") + sum(l3Report.summary, "public_publishes") + sum(l4Report.summary, "public_publishes")
  };
}

function buildPipelineSafety({ l2Report, l3Report, l4Report }) {
  return {
    local_report_only: true,
    l2_provider: l2Report.provider ?? null,
    l4_provider: l4Report.provider ?? null,
    llm_api_calls: sum(l2Report.summary, "llm_api_calls") + sum(l4Report.summary, "llm_api_calls"),
    external_api_calls: sum(l2Report.summary, "external_api_calls") + sum(l4Report.summary, "external_api_calls"),
    executes_work_orders: false,
    changes_route: false,
    changes_winner: false,
    writes_memory: false,
    writes_persistent_state: false,
    creates_embeddings: false,
    touches_production_or_remote_runtime: false,
    pushes_repository: false,
    publishes_publicly: false,
    mutates_l1_thresholds: false,
    mutates_l2_prompt: false,
    upgrades_handoff_floor: false,
    requests_user_authorization: Boolean(l4Report.summary?.requires_user_authorization_count)
  };
}

function compactL4Reviews(l4Report) {
  return (l4Report.reviews ?? []).map((review) => ({
    source_id: review.source_id,
    verdict: review.review?.verdict ?? null,
    handoff_target: review.review?.handoff_target ?? null,
    execution_readiness_score: review.review?.execution_readiness_score ?? null,
    can_execute_without_parent_context: Boolean(review.review?.can_execute_without_parent_context),
    requires_user_authorization: Boolean(review.review?.requires_user_authorization),
    authorization_scopes: review.review?.authorization_scopes ?? [],
    recommended_next_step: review.review?.recommended_next_step ?? null,
    blocking_reasons: review.review?.blocking_reasons ?? []
  }));
}

export async function buildL1L4WorkOrderPipelineReport({
  repoRoot = process.cwd(),
  l2Report,
  l2ReportPath,
  onlineShadowReport,
  onlineShadowReportPath,
  perceptionDigestPath,
  sourceIds = [],
  maxSamples = 5,
  l2Provider,
  l2Model,
  candidateCount,
  repairAttempts = 1,
  thresholds,
  batchSize = DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  includeRedSpotChecks = true,
  l4Provider = DEFAULT_L4_REVIEW_PROVIDER,
  now = new Date()
} = {}) {
  const createdAt = asIsoDate(now);
  const resolvedL2Report = l2Report
    ?? (l2ReportPath
      ? await readJson(resolvePath(repoRoot, l2ReportPath))
      : await buildExternalTrajectoryLlmWorkOrderDraftReport({
        repoRoot,
        onlineShadowReport,
        onlineShadowReportPath,
        perceptionDigestPath,
        sourceIds,
        maxSamples,
        provider: l2Provider ?? undefined,
        model: l2Model ?? undefined,
        candidateCount,
        repairAttempts,
        now
      }));
  const l2Generated = !(l2Report || l2ReportPath);
  const l3Report = buildL2L3SelectionAuditReport({
    repoRoot,
    l2Report: resolvedL2Report,
    l2ReportPath: l2ReportPath ?? resolvedL2Report.output?.json_path ?? null,
    thresholds,
    batchSize,
    now
  });
  const l4Report = await buildL4WorkOrderReviewReport({
    repoRoot,
    l2Report: resolvedL2Report,
    l3Report,
    includeRedSpotChecks,
    provider: l4Provider,
    now
  });
  const summary = buildPipelineSummary({
    l2Report: resolvedL2Report,
    l3Report,
    l4Report,
    l2Generated
  });
  return {
    schema_version: "misa.l1_l4_work_order_pipeline.v1",
    mode: "l1-l4-work-order-pipeline",
    ok: Boolean(resolvedL2Report.ok && l3Report.ok && l4Report.ok),
    created_at: createdAt,
    input: {
      l2_report_path: normalizePathForReport(repoRoot, l2ReportPath),
      online_shadow_report_path: normalizePathForReport(repoRoot, onlineShadowReportPath),
      perception_digest_path: normalizePathForReport(repoRoot, perceptionDigestPath),
      source_ids: sourceIds,
      max_samples: maxSamples,
      l2_provider: resolvedL2Report.provider ?? l2Provider ?? "mock",
      l2_model: resolvedL2Report.model ?? l2Model ?? null,
      l4_provider: l4Provider,
      batch_size: batchSize,
      include_red_spot_checks: includeRedSpotChecks
    },
    flow: [
      "L1 control is applied inside the L2 draft report before provider calls.",
      "L2 drafts the work order and L3 performs the formal local gate.",
      "L3 red feedback may repair L2 once inside the L2 draft report.",
      "L2/L3 selection audit forwards green/yellow and selected red spot checks.",
      "L4 mock review decides handoff readiness, target, and user authorization needs without executing the work order."
    ],
    summary,
    safety: buildPipelineSafety({ l2Report: resolvedL2Report, l3Report, l4Report }),
    reports: {
      l2: resolvedL2Report,
      l3: l3Report,
      l4: l4Report
    },
    l4_reviews: compactL4Reviews(l4Report),
    l4_review_by_verdict: countBy(compactL4Reviews(l4Report), (review) => review.verdict ?? "unknown"),
    warnings: [
      "This pipeline is local report orchestration; it does not execute work orders.",
      "L4 owner_needed means request user or maintainer authorization before any high-risk side effect.",
      "Automatic L1 threshold, L2 prompt, gate, and handoff-floor mutation remains disabled."
    ]
  };
}

export function renderL1L4WorkOrderPipelineMarkdown(result) {
  const lines = [
    "# L1-L4 Work Order Pipeline",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- l2_provider: ${result.input.l2_provider}`,
    `- l4_provider: ${result.input.l4_provider}`,
    `- l2_generated: ${result.summary.l2_generated}`,
    `- l2_sample_count: ${result.summary.l2_sample_count}`,
    `- l2_draft_count: ${result.summary.l2_draft_count}`,
    `- l2_suppressed_count: ${result.summary.l2_suppressed_count}`,
    `- l1_candidate_mode: ${result.summary.l1_candidate_mode}`,
    `- l1_handoff_floor_counts: ${JSON.stringify(result.summary.l1_handoff_floor_counts)}`,
    `- l3_passed_gate_count: ${result.summary.l3_passed_gate_count}`,
    `- l3_failed_gate_count: ${result.summary.l3_failed_gate_count}`,
    `- l3_recheck_triggered_count: ${result.summary.l3_recheck_triggered_count}`,
    `- l3_accepted_after_recheck_count: ${result.summary.l3_accepted_after_recheck_count}`,
    `- l3_pool_counts: ${JSON.stringify(result.summary.l3_pool_counts)}`,
    `- l3_l4_forward_count: ${result.summary.l3_l4_forward_count}`,
    `- l4_sample_count: ${result.summary.l4_sample_count}`,
    `- l4_verdict_counts: ${JSON.stringify(result.summary.l4_verdict_counts)}`,
    `- l4_handoff_target_counts: ${JSON.stringify(result.summary.l4_handoff_target_counts)}`,
    `- l4_requires_user_authorization_count: ${result.summary.l4_requires_user_authorization_count}`,
    `- l4_authorization_scope_counts: ${JSON.stringify(result.summary.l4_authorization_scope_counts)}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    `- external_api_calls: ${result.summary.external_api_calls}`,
    "",
    "## Flow",
    "",
    ...result.flow.map((item) => `- ${item}`),
    "",
    "## L4 Reviews",
    ""
  ];

  if (!result.l4_reviews.length) {
    lines.push("- none");
  } else {
    for (const review of result.l4_reviews) {
      const auth = review.requires_user_authorization
        ? `, auth=${review.authorization_scopes.join("+")}`
        : "";
      lines.push(`- ${review.source_id}: verdict=${review.verdict}, target=${review.handoff_target}, no_context=${review.can_execute_without_parent_context}, next=${review.recommended_next_step}${auth}`);
      if (review.blocking_reasons.length) lines.push(`  blocking=${review.blocking_reasons.join(", ")}`);
    }
  }

  lines.push(
    "",
    "## Safety",
    "",
    ...Object.entries(result.safety).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
    "",
    "## Warnings",
    "",
    ...result.warnings.map((warning) => `- ${warning}`)
  );
  return `${lines.join("\n")}\n`;
}

function compactPipelineForJson(result) {
  return {
    schema_version: result.schema_version,
    mode: result.mode,
    ok: result.ok,
    created_at: result.created_at,
    input: result.input,
    flow: result.flow,
    summary: result.summary,
    safety: result.safety,
    output: result.output,
    l4_reviews: result.l4_reviews,
    l4_review_by_verdict: result.l4_review_by_verdict,
    warnings: result.warnings
  };
}

export async function writeL1L4WorkOrderPipelineArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join(DEFAULT_L1_L4_PIPELINE_OUT_DIR, stamp));
  const l2Dir = path.join(outputRoot, "l2");
  const l3Dir = path.join(outputRoot, "l3");
  const l4Dir = path.join(outputRoot, "l4");
  await fs.mkdir(outputRoot, { recursive: true });

  const l2Written = await writeExternalTrajectoryLlmWorkOrderDraftArtifacts({
    repoRoot,
    result: result.reports.l2,
    outDir: l2Dir,
    now
  });
  const l3Written = await writeL2L3SelectionAuditArtifacts({
    repoRoot,
    result: result.reports.l3,
    l2Report: l2Written,
    outDir: l3Dir,
    now
  });
  const l4Written = await writeL4WorkOrderReviewArtifacts({
    repoRoot,
    result: result.reports.l4,
    outDir: l4Dir,
    l3Report: l3Written,
    now
  });

  const jsonPath = path.join(outputRoot, "l1-l4-work-order-pipeline.json");
  const markdownPath = path.join(outputRoot, "l1-l4-work-order-pipeline.md");
  const written = {
    ...result,
    reports: {
      l2: l2Written,
      l3: l3Written,
      l4: l4Written
    },
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      json_path: normalizePathForReport(repoRoot, jsonPath),
      markdown_path: normalizePathForReport(repoRoot, markdownPath),
      l2_report_path: l2Written.output?.json_path ?? null,
      l3_report_path: l3Written.output?.quality_report_json_path ?? null,
      l4_report_path: l4Written.output?.l4_review_report_json_path ?? null,
      l4_review_path: l4Written.output?.l4_review_path ?? null
    }
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(compactPipelineForJson(written), null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderL1L4WorkOrderPipelineMarkdown(written), "utf8");
  return written;
}
