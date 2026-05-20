import fs from "node:fs/promises";
import path from "node:path";
import {
  buildExternalTrajectoryLlmWorkOrderDraftReport,
  buildLlmWorkOrderDraftingPackets,
  gateLlmWorkOrderDraft
} from "../../external-trajectory/lib/external-trajectory-llm-work-order-draft.mjs";
import {
  buildL2L3SelectionAuditReport,
  writeL2L3SelectionAuditArtifacts
} from "./l2-l3-selection-audit.mjs";
import {
  buildL2L3QuantitativeComparison,
  writeL2L3QuantitativeComparisonArtifacts
} from "./l2-l3-quantitative-comparison.mjs";
import {
  buildL1L3SampleLibrary,
  writeL1L3SampleLibraryArtifacts
} from "./l1-l3-sample-library.mjs";

export const DEFAULT_L1_L3_BACKFILL_LIMIT = 80;
export const DEFAULT_L1_L3_BACKFILL_BUCKET = "strict_unlabeled_l2_l3_priority";

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-20T01:00:00.000Z").toISOString() : date.toISOString();
}

function stampFor(value) {
  return asIsoDate(value).replace(/[:.]/g, "-");
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

async function readJsonl(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function countBy(items, selector) {
  return Object.fromEntries(
    Object.entries(items.reduce((counts, item) => {
      const key = selector(item) ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})).sort(([left], [right]) => String(left).localeCompare(String(right)))
  );
}

function mean(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return Math.round(1000 * numbers.reduce((sum, value) => sum + value, 0) / numbers.length) / 1000;
}

function selectBackfillRows(rows, { bucket = DEFAULT_L1_L3_BACKFILL_BUCKET, limit = DEFAULT_L1_L3_BACKFILL_LIMIT } = {}) {
  const wanted = rows
    .filter((row) => !bucket || row.queue_bucket === bucket)
    .filter((row) => row.l3_label_state === "missing_l3_label")
    .sort((left, right) => (
      Number(right.priority_score ?? 0) - Number(left.priority_score ?? 0)
      || String(left.source_id).localeCompare(String(right.source_id))
    ));
  return wanted.slice(0, Math.max(1, Number(limit) || DEFAULT_L1_L3_BACKFILL_LIMIT));
}

function oldTemplateDraft(packet) {
  return {
    title: "Explain external trajectory signal",
    problem: `Review ${packet.source_id} and summarize the related external trajectory signal.`,
    evidence_refs: [...(packet.workOrder.evidence_refs ?? [])],
    concrete_tasks: [
      `Review ${packet.source_id} signal and related behavior.`,
      "Check the logic.",
      "Improve the process.",
      "Discuss with the team if needed."
    ],
    acceptance_criteria: [
      "The review looks good."
    ],
    verification_commands: [
      packet.allowed_verification_commands[0]
    ].filter(Boolean),
    forbidden_scope: [...(packet.output_contract.required_forbidden_scope ?? [])],
    risk_notes: [
      "Old thin-template baseline for local comparison only."
    ],
    stop_condition: "Stop after review.",
    llm_notes: "Deterministic old-template baseline; no provider call."
  };
}

function l3StatusForGate(gate) {
  if (gate?.ok) return "accepted_first_try";
  const checks = gate?.checks ?? {};
  if (
    gate?.gate_class === "hard_fail"
    && Number(gate?.quality_score ?? 0) >= 0.9
    && Number(checks.actionableTaskCount ?? 0) >= 4
    && !checks.providerError
  ) {
    return "exhausted_reviewable_hard_fail";
  }
  return "exhausted_no_value";
}

function oldCandidateDecision(packet) {
  const profile = packet.record.l1_signal_profile ?? {};
  const l1Control = {
    schema_version: "misa.l1_control_decision.v1",
    generate_l2: true,
    candidate_count: 1,
    handoff_floor: "no_context_agent",
    risk_band: profile.risk_level ?? "medium",
    reasons: ["old_thin_template_baseline"]
  };
  return {
    policy: "old_thin_template",
    trigger: "old_light_single",
    requested_candidate_count: 1,
    candidate_mode: "light_single_default",
    l1_candidate_mode: profile.l2_candidate_mode ?? null,
    l1_control: l1Control,
    reason: "old baseline uses one thin template and no L3-driven repair"
  };
}

function oldL2ItemFromPacket(packet) {
  const draft = oldTemplateDraft(packet);
  const gate = gateLlmWorkOrderDraft({ packet, draft, parseOk: true });
  const candidateDecision = oldCandidateDecision(packet);
  const finalStatus = l3StatusForGate(gate);
  const attempt = {
    run_number: 1,
    trigger: "old_initial_thin_template",
    candidate_count: 1,
    provider_error: null,
    gate_ok: gate.ok,
    gate_class: gate.gate_class,
    quality_score: gate.quality_score,
    violations: gate.violations,
    soft_violations: gate.soft_violations ?? [],
    warning_codes: gate.warning_codes ?? [],
    actionableTaskCount: gate.checks.actionableTaskCount,
    weakTaskCount: gate.checks.weakTaskCount,
    repair_observation: null
  };
  return {
    source_id: packet.source_id,
    model: "deterministic-old-template",
    provider: "local-old-template",
    llm_api_calls: 0,
    candidate_count_decision: candidateDecision,
    l3_feedback: {
      policy: "old_thin_template_single_run",
      max_draft_runs: 1,
      total_draft_runs: 1,
      rechecked: false,
      final_status: finalStatus,
      final_gate_class: gate.gate_class,
      no_value_after_recheck: finalStatus === "exhausted_no_value",
      repeated_failure_shape: false,
      l1_feedback_suggestion: null,
      attempts: [attempt]
    },
    l1_feedback_suggestion: null,
    candidate_selection: {
      requested_candidate_count: 1,
      returned_candidate_count: 1,
      expected_candidate_count_met: true,
      winner_candidate_id: "old_template",
      winner_strategy: "old_thin_template",
      winner_quality_score: gate.quality_score,
      candidate_quality_scores: [gate.quality_score],
      candidate_passed_gate_count: gate.ok ? 1 : 0,
      candidate_failed_gate_count: gate.ok ? 0 : 1,
      avg_candidate_quality_score: gate.quality_score
    },
    packet: {
      source_class: packet.context.source_class,
      readout_family: packet.record.readout_family,
      route_hint: packet.workOrder.route_hint,
      severity: packet.ticket?.severity ?? null,
      priority: packet.record.suggested_priority,
      observed_signals: packet.record.observed_signals,
      evidence_refs: packet.workOrder.evidence_refs,
      l1_signal_profile: packet.record.l1_signal_profile ?? null,
      l1_control: candidateDecision.l1_control,
      relevant_files: packet.context.relevant_files,
      allowed_verification_commands: packet.allowed_verification_commands
    },
    draft,
    winner_candidate_id: "old_template",
    winner_strategy: "old_thin_template",
    candidates: [{
      candidate_id: "old_template",
      strategy: "old_thin_template",
      draft,
      gate
    }],
    loser_ledger: [],
    raw_response: JSON.stringify(draft),
    parsed_response: draft,
    gate,
    provider_error: null
  };
}

function l2Summary(results, { provider, model }) {
  const allCandidates = results.flatMap((result) => result.candidates ?? []);
  const generatedResults = results.filter((result) => !result.suppressed);
  return {
    sample_count: results.length,
    draft_count: results.filter((result) => result.draft).length,
    candidate_count_policy: provider === "local-old-template" ? "old_thin_template" : "l1_control",
    candidate_mode: provider === "local-old-template" ? "old_light_single" : "l1_controlled",
    requested_candidate_count: 1,
    requested_candidate_count_histogram: { 1: results.length },
    l1_dynamic_recheck_count: 0,
    l1_suppressed_count: 0,
    l1_handoff_floor_counts: countBy(results, (result) => result.packet?.l1_control?.handoff_floor),
    l1_recheck_hint_count: results.filter((result) => (
      ["recheck", "multi_pool"].includes(result.packet?.l1_signal_profile?.l2_candidate_mode)
    )).length,
    light_single_count: generatedResults.length,
    candidate_count: allCandidates.length,
    expected_candidate_count_met: results.length,
    expected_candidate_count_miss: 0,
    winner_selected_count: results.filter((result) => result.winner_candidate_id).length,
    candidate_passed_gate_count: allCandidates.filter((candidate) => candidate.gate.ok).length,
    candidate_failed_gate_count: allCandidates.filter((candidate) => !candidate.gate.ok).length,
    avg_candidate_quality_score: mean(allCandidates.map((candidate) => candidate.gate.quality_score)),
    passed_gate_count: generatedResults.filter((result) => result.gate.ok).length,
    failed_gate_count: generatedResults.filter((result) => !result.gate.ok).length,
    l3_total_draft_runs: results.reduce((sum, result) => sum + Number(result.l3_feedback?.total_draft_runs ?? 0), 0),
    l3_recheck_triggered_count: results.filter((result) => result.l3_feedback?.rechecked).length,
    l3_accepted_first_try_count: results.filter((result) => result.l3_feedback?.final_status === "accepted_first_try").length,
    l3_accepted_after_recheck_count: results.filter((result) => result.l3_feedback?.final_status === "accepted_after_l3_recheck").length,
    l3_exhausted_reviewable_hard_fail_count: results.filter((result) => result.l3_feedback?.final_status === "exhausted_reviewable_hard_fail").length,
    l3_exhausted_no_value_count: results.filter((result) => result.l3_feedback?.final_status === "exhausted_no_value").length,
    l3_repeated_failure_shape_count: results.filter((result) => result.l3_feedback?.repeated_failure_shape).length,
    l1_feedback_suggestion_count: results.filter((result) => result.l1_feedback_suggestion).length,
    l1_feedback_candidate_count_upgrade_count: results.filter((result) => result.l1_feedback_suggestion?.suggestion?.candidate_count).length,
    l1_feedback_handoff_floor_upgrade_count: results.filter((result) => result.l1_feedback_suggestion?.suggestion?.handoff_floor).length,
    provider_error_count: results.filter((result) => result.provider_error).length,
    avg_quality_score: mean(generatedResults.map((result) => result.gate.quality_score)),
    llm_api_calls: 0,
    external_api_calls: 0,
    route_changes: 0,
    winner_changes: 0,
    memory_writes: 0,
    zilliz_writes: 0,
    embedding_creations: 0,
    vps_touches: 0,
    github_pushes: 0,
    public_publishes: 0,
    provider,
    model
  };
}

function buildOldTemplateL2Report({ onlineShadowReport, perceptionDigestPath, sourceIds, now }) {
  const packets = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport,
    perceptionDigestPath,
    sourceIds,
    maxSamples: sourceIds.length
  });
  const results = packets.map((packet) => oldL2ItemFromPacket(packet));
  const provider = "local-old-template";
  const model = "deterministic-old-template";
  return {
    schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
    mode: "external-trajectory-llm-work-order-draft",
    ok: results.every((result) => result.gate.ok),
    created_at: asIsoDate(now),
    input: {
      online_shadow_report_path: null,
      perception_digest_path: perceptionDigestPath,
      source_ids: sourceIds,
      max_samples: sourceIds.length,
      candidate_count_policy: "old_thin_template",
      requested_candidate_count: 1,
      requested_candidate_count_histogram: { 1: results.length },
      candidate_mode: "old_light_single",
      default_candidate_count: 1,
      l1_control_enabled: false
    },
    model,
    provider,
    delegate: {
      provider: null,
      model: null
    },
    summary: l2Summary(results, { provider, model }),
    safety: {
      local_only: true,
      no_write: true,
      executes_work_orders: false,
      changes_route: false,
      changes_winner: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      touches_vps: false,
      pushes_github: false,
      publishes_publicly: false
    },
    results,
    warnings: [
      "Old-template baseline is deterministic and local-only.",
      "It is written for side-by-side comparison only and is not added to the durable L3 label pool."
    ]
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}

function summarizeBenchmark({ selectedRows, oldL3Report, newL3Report, comparison, sampleLibrary }) {
  const oldPools = oldL3Report.summary.pool_counts;
  const newPools = newL3Report.summary.pool_counts;
  const oldBySource = new Map((oldL3Report.decisions ?? []).map((decision) => [decision.source_id, decision]));
  const newBySource = new Map((newL3Report.decisions ?? []).map((decision) => [decision.source_id, decision]));
  const commonSourceIds = [...oldBySource.keys()].filter((sourceId) => newBySource.has(sourceId));
  const improved = commonSourceIds.filter((sourceId) => (
    oldBySource.get(sourceId)?.pool !== "green" && newBySource.get(sourceId)?.pool === "green"
  )).length;
  const regressed = commonSourceIds.filter((sourceId) => (
    oldBySource.get(sourceId)?.pool === "green" && newBySource.get(sourceId)?.pool !== "green"
  )).length;
  return {
    selected_source_count: selectedRows.length,
    selected_bucket_counts: countBy(selectedRows, (row) => row.queue_bucket),
    old_pool_counts: oldPools,
    new_pool_counts: newPools,
    old_bad_or_review_count: Number(oldPools.red ?? 0) + Number(oldPools.yellow ?? 0),
    new_clean_count: Number(newPools.green ?? 0),
    improved_to_green_count: improved,
    regressed_from_green_count: regressed,
    old_avg_quality_score: oldL3Report.summary.avg_quality_score,
    new_avg_quality_score: newL3Report.summary.avg_quality_score,
    quality_delta: Math.round(1000 * (Number(newL3Report.summary.avg_quality_score ?? 0) - Number(oldL3Report.summary.avg_quality_score ?? 0))) / 1000,
    llm_api_calls: 0,
    external_api_calls: 0,
    touches_vps: false,
    pushes_github: false,
    post_sample_library: sampleLibrary.summary
  };
}

export function renderL1L3BackfillBenchmarkMarkdown(result) {
  const summary = result.summary;
  const library = summary.post_sample_library;
  const lines = [
    "# L1/L3 Backfill Benchmark",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- selected_source_count: ${summary.selected_source_count}`,
    `- old_pool_counts: ${JSON.stringify(summary.old_pool_counts)}`,
    `- new_pool_counts: ${JSON.stringify(summary.new_pool_counts)}`,
    `- old_bad_or_review_count: ${summary.old_bad_or_review_count}`,
    `- new_clean_count: ${summary.new_clean_count}`,
    `- improved_to_green_count: ${summary.improved_to_green_count}`,
    `- regressed_from_green_count: ${summary.regressed_from_green_count}`,
    `- old_avg_quality_score: ${summary.old_avg_quality_score}`,
    `- new_avg_quality_score: ${summary.new_avg_quality_score}`,
    `- quality_delta: ${summary.quality_delta}`,
    `- llm_api_calls: ${summary.llm_api_calls}`,
    `- external_api_calls: ${summary.external_api_calls}`,
    "",
    "## Post Sample Library",
    "",
    `- reflection_scope_count: ${library.reflection_scope_count}`,
    `- reflection_l3_labeled_count: ${library.reflection_l3_labeled_count}`,
    `- reflection_l3_missing_count: ${library.reflection_l3_missing_count}`,
    `- reflection_bad_seed_count: ${library.reflection_bad_seed_count}`,
    `- reflection_clean_labeled_count: ${library.reflection_clean_labeled_count}`,
    `- reflection_conflict_count: ${library.reflection_conflict_count}`,
    `- l1_auto_strategy_ready: ${library.product_gate.l1_auto_strategy_ready}`,
    `- reason: ${library.product_gate.reason}`,
    "",
    "## Boundary",
    "",
    "- New L2/L3 backfill labels are written as pool-decisions and can be counted by the sample library.",
    "- Old-template comparison is not written as pool-decisions, so it cannot poison the durable label pool.",
    "- No LLM/API/VPS/GitHub push is used."
  ];
  return `${lines.join("\n")}\n`;
}

export async function runL1L3BackfillBenchmark({
  repoRoot = process.cwd(),
  queuePath,
  onlineShadowReportPath,
  adaptationReportPath,
  l1AlphaReportPath,
  runsDir = "runs",
  outDir,
  limit = DEFAULT_L1_L3_BACKFILL_LIMIT,
  bucket = DEFAULT_L1_L3_BACKFILL_BUCKET,
  now = new Date()
} = {}) {
  if (!queuePath) throw new Error("queuePath is required");
  if (!onlineShadowReportPath) throw new Error("onlineShadowReportPath is required");
  if (!adaptationReportPath) throw new Error("adaptationReportPath is required");
  if (!l1AlphaReportPath) throw new Error("l1AlphaReportPath is required");

  const createdAt = asIsoDate(now);
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "l1-l3-backfill-benchmark", `${stampFor(now)}-queue-backfill`));
  const queueRows = await readJsonl(resolvePath(repoRoot, queuePath));
  const selectedRows = selectBackfillRows(queueRows, { bucket, limit });
  const sourceIds = selectedRows.map((row) => row.source_id);
  if (!sourceIds.length) throw new Error("no queue rows selected");

  const onlineShadowReport = await readJson(resolvePath(repoRoot, onlineShadowReportPath));
  const perceptionDigestPath = onlineShadowReport.input?.perception_digest_path ?? null;
  const oldL2Report = buildOldTemplateL2Report({
    onlineShadowReport,
    perceptionDigestPath,
    sourceIds,
    now
  });
  const newL2Report = await buildExternalTrajectoryLlmWorkOrderDraftReport({
    repoRoot,
    onlineShadowReport,
    onlineShadowReportPath,
    perceptionDigestPath,
    sourceIds,
    maxSamples: sourceIds.length,
    provider: "mock",
    model: "deterministic-current-template",
    repairAttempts: 1,
    now
  });

  const oldL3Report = buildL2L3SelectionAuditReport({
    l2Report: oldL2Report,
    l2ReportPath: normalizePathForReport(repoRoot, path.join(outputRoot, "comparison-bundle", "01-old-template", "l2.json")),
    repoRoot,
    batchSize: sourceIds.length,
    now
  });
  const newL3Report = buildL2L3SelectionAuditReport({
    l2Report: newL2Report,
    l2ReportPath: normalizePathForReport(repoRoot, path.join(outputRoot, "comparison-bundle", "02-new-l1-control", "l2.json")),
    repoRoot,
    batchSize: sourceIds.length,
    now
  });

  const comparison = buildL2L3QuantitativeComparison({
    runs: [
      {
        label: "01-old-template",
        directory: normalizePathForReport(repoRoot, path.join(outputRoot, "comparison-bundle", "01-old-template")),
        l2Report: oldL2Report,
        l3Report: oldL3Report
      },
      {
        label: "02-new-l1-control",
        directory: normalizePathForReport(repoRoot, path.join(outputRoot, "comparison-bundle", "02-new-l1-control")),
        l2Report: newL2Report,
        l3Report: newL3Report
      }
    ],
    baselineLabel: "old_template",
    now
  });

  await fs.mkdir(outputRoot, { recursive: true });
  const oldDir = path.join(outputRoot, "comparison-bundle", "01-old-template");
  const newDir = path.join(outputRoot, "comparison-bundle", "02-new-l1-control");
  await writeJson(path.join(oldDir, "l2.json"), oldL2Report);
  await writeJson(path.join(oldDir, "l3-quality-report.json"), oldL3Report);
  await writeJson(path.join(newDir, "l2.json"), newL2Report);
  await writeJson(path.join(newDir, "l3-quality-report.json"), newL3Report);
  await writeText(path.join(outputRoot, "selected-source-ids.txt"), `${sourceIds.join("\n")}\n`);
  await writeText(path.join(outputRoot, "selected-queue-rows.jsonl"), selectedRows.map((row) => JSON.stringify(row)).join("\n") + "\n");

  const newL3Written = await writeL2L3SelectionAuditArtifacts({
    repoRoot,
    result: newL3Report,
    l2Report: newL2Report,
    outDir: path.join(outputRoot, "new-backfill-l3"),
    now
  });
  const comparisonWritten = await writeL2L3QuantitativeComparisonArtifacts({
    repoRoot,
    result: comparison,
    outDir: path.join(outputRoot, "comparison"),
    now
  });
  const sampleLibrary = await buildL1L3SampleLibrary({
    repoRoot,
    adaptationReportPath,
    l1AlphaReportPath,
    runsDir,
    now
  });
  const sampleLibraryWritten = await writeL1L3SampleLibraryArtifacts({
    repoRoot,
    result: sampleLibrary,
    outDir: path.join(outputRoot, "sample-library"),
    now
  });

  const result = {
    schema_version: "misa.l1_l3_backfill_benchmark.v1",
    mode: "l1-l3-backfill-benchmark",
    ok: true,
    created_at: createdAt,
    input: {
      queue_path: normalizePathForReport(repoRoot, queuePath),
      online_shadow_report_path: normalizePathForReport(repoRoot, onlineShadowReportPath),
      adaptation_report_path: normalizePathForReport(repoRoot, adaptationReportPath),
      l1_alpha_report_path: normalizePathForReport(repoRoot, l1AlphaReportPath),
      runs_dir: normalizePathForReport(repoRoot, resolvePath(repoRoot, runsDir)),
      selected_bucket: bucket,
      limit: Number(limit),
      selected_source_ids: sourceIds,
      llm_api_calls: 0,
      external_api_calls: 0,
      touches_vps: false,
      pushes_github: false
    },
    summary: summarizeBenchmark({
      selectedRows,
      oldL3Report,
      newL3Report,
      comparison,
      sampleLibrary: sampleLibraryWritten
    }),
    outputs: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      selected_source_ids_path: normalizePathForReport(repoRoot, path.join(outputRoot, "selected-source-ids.txt")),
      selected_queue_rows_path: normalizePathForReport(repoRoot, path.join(outputRoot, "selected-queue-rows.jsonl")),
      old_l2_path: normalizePathForReport(repoRoot, path.join(oldDir, "l2.json")),
      old_l3_report_path: normalizePathForReport(repoRoot, path.join(oldDir, "l3-quality-report.json")),
      new_l2_path: normalizePathForReport(repoRoot, path.join(newDir, "l2.json")),
      new_l3_report_path: normalizePathForReport(repoRoot, path.join(newDir, "l3-quality-report.json")),
      new_pool_decisions_path: newL3Written.output.pool_decisions_path,
      comparison_json_path: comparisonWritten.output.json_path,
      comparison_markdown_path: comparisonWritten.output.markdown_path,
      sample_library_json_path: sampleLibraryWritten.output.json_path,
      sample_library_markdown_path: sampleLibraryWritten.output.markdown_path
    },
    comparison: {
      sample_alignment: comparison.sample_alignment,
      recommendation: comparison.recommendation,
      run_summaries: comparison.run_summaries,
      candidate_marginal_analysis: comparison.candidate_marginal_analysis
    },
    notes: [
      "The new L2/L3 labels are durable local backfill labels.",
      "The old-template run is comparison-only and is not emitted as pool-decisions.jsonl.",
      "No LLM, external API, VPS, GitHub push, route change, winner change, memory write, Zilliz write, or embedding creation is used."
    ]
  };

  await writeJson(path.join(outputRoot, "l1-l3-backfill-benchmark.json"), result);
  await writeText(path.join(outputRoot, "l1-l3-backfill-benchmark.md"), renderL1L3BackfillBenchmarkMarkdown(result));
  return {
    ...result,
    outputs: {
      ...result.outputs,
      json_path: normalizePathForReport(repoRoot, path.join(outputRoot, "l1-l3-backfill-benchmark.json")),
      markdown_path: normalizePathForReport(repoRoot, path.join(outputRoot, "l1-l3-backfill-benchmark.md"))
    }
  };
}
