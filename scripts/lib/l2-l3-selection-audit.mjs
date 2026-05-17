import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_L2_L3_SELECTION_BATCH_SIZE = 50;
export const DEFAULT_L2_L3_SELECTION_THRESHOLDS = Object.freeze({
  yellow_quality_min: 0.9,
  yellow_actionable_task_min: 4,
  strong_green_quality_min: 0.9,
  red_spot_check_rate: 0.1,
  red_spot_check_min: 2,
  red_spot_check_max: 5,
  l4_preview_limit: 5
});

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-17T12:00:00.000Z").toISOString() : date.toISOString();
}

function roundRate(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : 0;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function providerErrorCode(item) {
  return item?.provider_error?.code ?? item?.gate?.checks?.providerError?.code ?? null;
}

function gateChecks(item) {
  return item?.gate?.checks ?? {};
}

function decisionReasonText(decision) {
  if (decision.pool === "green") {
    return "hard gate passed; forward to L4 for primary judgment";
  }
  if (decision.pool === "yellow") {
    return "high-score gate failure; keep for L4 review to prevent false rejection";
  }
  if (decision.l4_spot_check) {
    return "red pool sample selected for periodic L4 spot check";
  }
  return "hard gate failed below yellow threshold; hold for audit lookup";
}

export function classifyL2L3PoolDecision(item, {
  thresholds = DEFAULT_L2_L3_SELECTION_THRESHOLDS,
  createdAt = new Date()
} = {}) {
  const checks = gateChecks(item);
  const qualityScore = Number(item?.gate?.quality_score ?? 0);
  const actionableTaskCount = Number(checks.actionableTaskCount ?? 0);
  const weakTaskCount = Number(checks.weakTaskCount ?? 0);
  const specificityHits = Number(checks.specificityHits ?? 0);
  const violations = Array.isArray(item?.gate?.violations) ? item.gate.violations : [];
  const providerError = providerErrorCode(item);
  const gateOk = Boolean(item?.gate?.ok);
  const highQualityFailedGate = !gateOk
    && !providerError
    && qualityScore >= thresholds.yellow_quality_min
    && actionableTaskCount >= thresholds.yellow_actionable_task_min;

  const reasonCodes = [];
  let pool = "red";
  let l4ReviewMode = "hold";

  if (gateOk) {
    pool = "green";
    l4ReviewMode = "forward";
    reasonCodes.push("hard_gate_passed");
    if (qualityScore >= thresholds.strong_green_quality_min) {
      reasonCodes.push("strong_quality_pass");
    }
  } else if (highQualityFailedGate) {
    pool = "yellow";
    l4ReviewMode = "forward_false_reject_check";
    reasonCodes.push("possible_false_reject");
    reasonCodes.push("high_quality_failed_gate");
  } else {
    pool = "red";
    l4ReviewMode = "hold_for_periodic_spot_check";
    reasonCodes.push(providerError ? "provider_error" : "hard_gate_failed");
    if (qualityScore < thresholds.yellow_quality_min) reasonCodes.push("below_yellow_quality_threshold");
    if (actionableTaskCount < thresholds.yellow_actionable_task_min) reasonCodes.push("below_yellow_actionable_task_threshold");
  }

  for (const violation of violations) {
    reasonCodes.push(`violation:${violation}`);
  }

  return {
    schema_version: "misa.l2_l3_pool_decision.v1",
    created_at: asIsoDate(createdAt),
    source_id: item?.source_id ?? "unknown",
    pool,
    l4_forward: pool === "green" || pool === "yellow",
    l4_spot_check: false,
    l4_review_mode: l4ReviewMode,
    reason_codes: [...new Set(reasonCodes)],
    decision_reason: null,
    gate_ok: gateOk,
    quality_score: qualityScore,
    violations,
    actionableTaskCount,
    weakTaskCount,
    specificityHits,
    provider_error: providerError,
    draft_title: item?.draft?.title ?? null,
    evidence_refs: item?.packet?.evidence_refs ?? item?.draft?.evidence_refs ?? [],
    safety_counters: {
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      route_changes: 0,
      winner_changes: 0,
      work_order_executions: 0
    }
  };
}

function applyRedSpotChecks(decisions, thresholds) {
  const red = decisions
    .filter((decision) => decision.pool === "red")
    .sort((left, right) => (
      right.quality_score - left.quality_score
      || right.actionableTaskCount - left.actionableTaskCount
      || left.source_id.localeCompare(right.source_id)
    ));
  if (!red.length) return decisions;
  const targetCount = Math.min(
    red.length,
    thresholds.red_spot_check_max,
    Math.max(thresholds.red_spot_check_min, Math.ceil(red.length * thresholds.red_spot_check_rate))
  );
  const selected = new Set(red.slice(0, targetCount).map((decision) => decision.source_id));
  return decisions.map((decision) => {
    if (!selected.has(decision.source_id)) return decision;
    return {
      ...decision,
      l4_spot_check: true,
      l4_review_mode: "spot_check_red_pool",
      reason_codes: [...new Set([...decision.reason_codes, "red_pool_periodic_spot_check"])]
    };
  });
}

function summarizeDecisions({ decisions, l2Report, thresholds, batchSize }) {
  const poolCounts = {
    green: decisions.filter((decision) => decision.pool === "green").length,
    yellow: decisions.filter((decision) => decision.pool === "yellow").length,
    red: decisions.filter((decision) => decision.pool === "red").length
  };
  const violationCounts = {};
  for (const decision of decisions) {
    for (const violation of decision.violations) {
      violationCounts[violation] = (violationCounts[violation] ?? 0) + 1;
    }
  }
  const providerErrorCounts = countBy(
    decisions.filter((decision) => decision.provider_error),
    (decision) => decision.provider_error
  );
  const l4ForwardCount = decisions.filter((decision) => decision.l4_forward).length;
  const redSpotCheckCount = decisions.filter((decision) => decision.l4_spot_check).length;
  const highQualityFailedCount = decisions.filter((decision) => decision.pool === "yellow").length;
  const sampleCount = decisions.length;
  const avgQualityScore = sampleCount
    ? Math.round(1000 * decisions.reduce((sum, decision) => sum + decision.quality_score, 0) / sampleCount) / 1000
    : 0;

  return {
    sample_count: sampleCount,
    batch_size: batchSize,
    batch_status: sampleCount >= batchSize ? "ready_for_periodic_review" : "accumulating",
    samples_until_next_periodic_review: sampleCount >= batchSize ? 0 : batchSize - sampleCount,
    pool_counts: poolCounts,
    hard_gate_pass_count: poolCounts.green,
    hard_gate_fail_count: sampleCount - poolCounts.green,
    hard_gate_pass_rate: roundRate(poolCounts.green, sampleCount),
    l4_forward_count: l4ForwardCount,
    red_spot_check_count: redSpotCheckCount,
    possible_false_reject_count: highQualityFailedCount,
    low_quality_pass_count: decisions.filter((decision) => (
      decision.pool === "green" && decision.quality_score < thresholds.strong_green_quality_min
    )).length,
    provider_error_count: decisions.filter((decision) => decision.provider_error).length,
    provider_error_counts: sortedObject(providerErrorCounts),
    avg_quality_score: avgQualityScore,
    violation_counts: sortedObject(violationCounts),
    llm_api_calls: l2Report?.summary?.llm_api_calls ?? decisions.length,
    memory_writes: l2Report?.summary?.memory_writes ?? 0,
    zilliz_writes: l2Report?.summary?.zilliz_writes ?? 0,
    embedding_creations: l2Report?.summary?.embedding_creations ?? 0,
    route_changes: l2Report?.summary?.route_changes ?? 0,
    winner_changes: l2Report?.summary?.winner_changes ?? 0,
    vps_touches: l2Report?.summary?.vps_touches ?? 0,
    github_pushes: l2Report?.summary?.github_pushes ?? 0,
    public_publishes: l2Report?.summary?.public_publishes ?? 0
  };
}

function topItems(decisions, filter, limit) {
  return decisions
    .filter(filter)
    .sort((left, right) => (
      right.quality_score - left.quality_score
      || right.actionableTaskCount - left.actionableTaskCount
      || left.source_id.localeCompare(right.source_id)
    ))
    .slice(0, limit)
    .map((decision) => ({
      source_id: decision.source_id,
      pool: decision.pool,
      quality_score: decision.quality_score,
      actionableTaskCount: decision.actionableTaskCount,
      weakTaskCount: decision.weakTaskCount,
      violations: decision.violations,
      reason_codes: decision.reason_codes,
      draft_title: decision.draft_title
    }));
}

export function buildL2L3SelectionAuditReport({
  l2Report,
  l2ReportPath,
  repoRoot = process.cwd(),
  batchSize = DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  thresholds = {},
  now = new Date()
} = {}) {
  if (!l2Report) throw new Error("l2Report is required");
  const effectiveThresholds = {
    ...DEFAULT_L2_L3_SELECTION_THRESHOLDS,
    ...thresholds
  };
  const createdAt = asIsoDate(now);
  let decisions = (l2Report.results ?? []).map((item) => classifyL2L3PoolDecision(item, {
    thresholds: effectiveThresholds,
    createdAt: now
  }));
  decisions = applyRedSpotChecks(decisions, effectiveThresholds)
    .map((decision) => ({
      ...decision,
      decision_reason: decisionReasonText(decision)
    }));
  const summary = summarizeDecisions({
    decisions,
    l2Report,
    thresholds: effectiveThresholds,
    batchSize
  });

  return {
    schema_version: "misa.l2_l3_selection_audit.v1",
    mode: "l2-l3-selection-audit",
    ok: true,
    created_at: createdAt,
    input: {
      l2_report_path: normalizePathForReport(repoRoot, l2ReportPath),
      l2_schema_version: l2Report.schema_version ?? null,
      l2_provider: l2Report.provider ?? null,
      l2_model: l2Report.model ?? null
    },
    thresholds: effectiveThresholds,
    summary,
    l4_handoff: {
      policy: "green_and_yellow_forward_red_spot_check",
      summary_only_by_default: true,
      l4_final_judgment_retained: true,
      forwarded_pool_count: summary.l4_forward_count,
      red_spot_check_count: summary.red_spot_check_count,
      preview_limit: effectiveThresholds.l4_preview_limit,
      preview: [
        ...topItems(decisions, (decision) => decision.pool === "yellow", effectiveThresholds.l4_preview_limit),
        ...topItems(decisions, (decision) => decision.pool === "green", effectiveThresholds.l4_preview_limit),
        ...topItems(decisions, (decision) => decision.l4_spot_check, effectiveThresholds.l4_preview_limit)
      ].slice(0, effectiveThresholds.l4_preview_limit)
    },
    quality_review: {
      review_cadence: `every_${batchSize}_l2_samples`,
      does_not_call_llm: true,
      does_not_execute_work_orders: true,
      key_questions: [
        "Are green pool items actually useful to L4?",
        "How many yellow pool items were hard-gate false rejects?",
        "Did red spot checks find missed useful suggestions?",
        "Which gate violation most often causes false rejection?",
        "Did L4 override the hard gate, and should the gate be tuned?"
      ]
    },
    safety: {
      local_report_only: true,
      calls_llm: false,
      executes_work_orders: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      changes_route: false,
      changes_winner: false,
      touches_vps: false,
      pushes_github: false,
      publishes_publicly: false
    },
    decisions,
    warnings: [
      "Pool labels are audit tags, not final authority.",
      "Green and yellow samples should be handed to L4; red samples are held except deterministic spot checks.",
      "L4 review results should be appended to l4-review.jsonl and used to tune future thresholds."
    ]
  };
}

export async function runL2L3SelectionAudit({
  repoRoot = process.cwd(),
  l2Report,
  l2ReportPath,
  batchSize = DEFAULT_L2_L3_SELECTION_BATCH_SIZE,
  thresholds,
  now = new Date()
} = {}) {
  const resolvedReport = l2Report ?? await readJson(resolvePath(repoRoot, l2ReportPath));
  return buildL2L3SelectionAuditReport({
    l2Report: resolvedReport,
    l2ReportPath,
    repoRoot,
    batchSize,
    thresholds,
    now
  });
}

export function renderL2L3SelectionAuditMarkdown(result) {
  const lines = [
    "# L2/L3 Selection Audit",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- l2_provider: ${result.input.l2_provider ?? "unknown"}`,
    `- l2_model: ${result.input.l2_model ?? "unknown"}`,
    `- sample_count: ${result.summary.sample_count}`,
    `- batch_size: ${result.summary.batch_size}`,
    `- batch_status: ${result.summary.batch_status}`,
    `- green: ${result.summary.pool_counts.green}`,
    `- yellow: ${result.summary.pool_counts.yellow}`,
    `- red: ${result.summary.pool_counts.red}`,
    `- l4_forward_count: ${result.summary.l4_forward_count}`,
    `- red_spot_check_count: ${result.summary.red_spot_check_count}`,
    `- possible_false_reject_count: ${result.summary.possible_false_reject_count}`,
    `- low_quality_pass_count: ${result.summary.low_quality_pass_count}`,
    `- avg_quality_score: ${result.summary.avg_quality_score}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    `- memory_writes/zilliz_writes/embedding_creations: ${result.summary.memory_writes}/${result.summary.zilliz_writes}/${result.summary.embedding_creations}`,
    `- route_changes/winner_changes/vps_touches: ${result.summary.route_changes}/${result.summary.winner_changes}/${result.summary.vps_touches}`,
    "",
    "## Pool Logic",
    "",
    "- green: hard gate passed; forward to L4.",
    "- yellow: high-quality hard-gate failure; forward to L4 as false-reject check.",
    "- red: hold for audit lookup, with deterministic spot checks.",
    "",
    "## Violations",
    "",
    ...Object.entries(result.summary.violation_counts).map(([key, count]) => `- ${key}: ${count}`),
    "",
    "## L4 Preview",
    ""
  ];

  if (!Object.keys(result.summary.violation_counts).length) {
    lines.splice(lines.indexOf("## L4 Preview") - 1, 0, "- none");
  }
  for (const item of result.l4_handoff.preview) {
    lines.push(`- ${item.source_id}: pool=${item.pool}, quality=${item.quality_score}, actionable=${item.actionableTaskCount}, weak=${item.weakTaskCount}, violations=${item.violations.join(", ") || "none"}`);
  }
  lines.push("", "## Decisions", "");
  for (const decision of result.decisions) {
    lines.push(`- ${decision.source_id}: pool=${decision.pool}, l4=${decision.l4_review_mode}, quality=${decision.quality_score}, reason=${decision.reason_codes.join(", ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function artifactPaths({ repoRoot, outDir, now }) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "l2-l3-selection-audit", stamp));
  return {
    outputRoot,
    inputManifestPath: path.join(outputRoot, "input-manifest.json"),
    l2RawResultsPath: path.join(outputRoot, "l2-raw-results.json"),
    poolDecisionsPath: path.join(outputRoot, "pool-decisions.jsonl"),
    qualityReportJsonPath: path.join(outputRoot, "quality-report.json"),
    qualityReportMarkdownPath: path.join(outputRoot, "quality-report.md"),
    l4ReviewPath: path.join(outputRoot, "l4-review.jsonl")
  };
}

export async function writeL2L3SelectionAuditArtifacts({
  repoRoot = process.cwd(),
  result,
  l2Report,
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const paths = artifactPaths({ repoRoot, outDir, now });
  await fs.mkdir(paths.outputRoot, { recursive: true });

  const output = {
    output_dir: path.relative(repoRoot, paths.outputRoot).replaceAll("\\", "/"),
    input_manifest_path: path.relative(repoRoot, paths.inputManifestPath).replaceAll("\\", "/"),
    l2_raw_results_path: path.relative(repoRoot, paths.l2RawResultsPath).replaceAll("\\", "/"),
    pool_decisions_path: path.relative(repoRoot, paths.poolDecisionsPath).replaceAll("\\", "/"),
    quality_report_json_path: path.relative(repoRoot, paths.qualityReportJsonPath).replaceAll("\\", "/"),
    quality_report_markdown_path: path.relative(repoRoot, paths.qualityReportMarkdownPath).replaceAll("\\", "/"),
    l4_review_path: path.relative(repoRoot, paths.l4ReviewPath).replaceAll("\\", "/")
  };
  const written = {
    ...result,
    output
  };
  const inputManifest = {
    schema_version: "misa.l2_l3_selection_input_manifest.v1",
    created_at: result.created_at,
    input: result.input,
    batch_size: result.summary.batch_size,
    sample_count: result.summary.sample_count,
    source_ids: result.decisions.map((decision) => decision.source_id),
    thresholds: result.thresholds,
    safety: result.safety
  };

  await fs.writeFile(paths.inputManifestPath, `${JSON.stringify(inputManifest, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.l2RawResultsPath, `${JSON.stringify(l2Report ?? {}, null, 2)}\n`, "utf8");
  await fs.writeFile(
    paths.poolDecisionsPath,
    result.decisions.map((decision) => JSON.stringify(decision)).join("\n") + "\n",
    "utf8"
  );
  await fs.writeFile(paths.qualityReportJsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.qualityReportMarkdownPath, renderL2L3SelectionAuditMarkdown(written), "utf8");
  await fs.writeFile(paths.l4ReviewPath, "", "utf8");
  return written;
}
