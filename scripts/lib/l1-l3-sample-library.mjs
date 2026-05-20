import fs from "node:fs/promises";
import path from "node:path";
import {
  collectL3FeedbackReflectionAllSamples
} from "./l3-feedback-reflection-replay.mjs";

export const DEFAULT_L1_L3_SAMPLE_LIBRARY_OUT_DIR = "runs/l1-l3-sample-library";
export const DEFAULT_L1_L3_MIN_BAD_SEEDS_FOR_L1 = 10;
export const DEFAULT_L1_L3_MIN_CLEAN_LABELS_FOR_L1 = 50;

const BAD_L3_STATUSES = new Set([
  "exhausted_no_value",
  "exhausted_reviewable_hard_fail",
  "provider_error_failed_closed"
]);

const CLEAN_L3_STATUSES = new Set([
  "accepted_first_try",
  "accepted_after_l3_recheck"
]);

const REFLECTION_SIGNAL_FAMILIES = new Set([
  "keyword_context_filter",
  "keyword_risk_noise"
]);

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator) : 0;
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
  return Object.fromEntries(
    Object.entries(items.reduce((counts, item) => {
      const key = selector(item) ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})).sort(([left], [right]) => String(left).localeCompare(String(right)))
  );
}

function groupBy(items, selector) {
  return items.reduce((groups, item) => {
    const key = selector(item) ?? "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
    return groups;
  }, new Map());
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined).map(String).filter(Boolean))].sort();
}

function statusCounts(samples) {
  return countBy(samples, (sample) => sample.l3_feedback_status ?? "unknown");
}

function simulatedHandoffFloor(record) {
  const profile = record?.l1_signal_profile ?? {};
  const text = [
    ...(profile.strategy_axes ?? []),
    ...(record?.observed_signals ?? []),
    profile.route_hint,
    record?.primary_route_pressure
  ].join(" ").toLowerCase();
  if (/credential|secret|signer|public_publish|publish|send|live_action|production_write/.test(text)
    || profile.risk_level === "critical") {
    return "human_owner";
  }
  if (/public|memory|zilliz|embedding|vps|github|route|winner/.test(text)
    || profile.risk_level === "high") {
    return "primary_agent";
  }
  return "no_context_agent";
}

function reflectionScopeFor(record) {
  const profile = record?.l1_signal_profile ?? {};
  return REFLECTION_SIGNAL_FAMILIES.has(profile.signal_family)
    && profile.l2_candidate_mode === "single"
    && Number(profile.l2_candidate_count_hint ?? 0) === 1
    && profile.risk_level === "medium"
    && profile.route_hint === "damping"
    && simulatedHandoffFloor(record) === "no_context_agent";
}

function l3LabelState(l3Samples) {
  if (!l3Samples.length) return "missing_l3_label";
  const statuses = l3Samples.map((sample) => sample.l3_feedback_status ?? "unknown");
  const hasBad = statuses.some((status) => BAD_L3_STATUSES.has(status));
  const hasClean = statuses.some((status) => CLEAN_L3_STATUSES.has(status));
  if (hasBad && hasClean) return "conflicting_l3_label";
  if (hasBad) return "bad_l3_label";
  if (hasClean) return "clean_l3_label";
  return "other_l3_label";
}

function l3LabelSignals(l3Samples) {
  const statuses = l3Samples.map((sample) => sample.l3_feedback_status ?? "unknown");
  return {
    l3_sample_count: l3Samples.length,
    l3_status_counts: statusCounts(l3Samples),
    l3_has_bad: statuses.some((status) => BAD_L3_STATUSES.has(status)),
    l3_has_clean: statuses.some((status) => CLEAN_L3_STATUSES.has(status)),
    l3_repeated_failure_count: l3Samples.filter((sample) => sample.repeated_failure_shape).length,
    l3_min_actionable: l3Samples.length ? Math.min(...l3Samples.map((sample) => Number(sample.actionableTaskCount ?? 0))) : null,
    l3_max_weak: l3Samples.length ? Math.max(...l3Samples.map((sample) => Number(sample.weakTaskCount ?? 0))) : null,
    l3_source_files: uniqueStrings(l3Samples.map((sample) => sample.source_file))
  };
}

function queueBucket({ inReflectionScope, labelState }) {
  if (!inReflectionScope) return "background_not_reflection_scope";
  if (labelState === "missing_l3_label") return "strict_unlabeled_l2_l3_priority";
  if (labelState === "bad_l3_label") return "strict_bad_seed";
  if (labelState === "clean_l3_label") return "strict_clean_holdout";
  if (labelState === "conflicting_l3_label") return "strict_conflict_review";
  return "strict_other_review";
}

function priorityScore({ inReflectionScope, labelState, adaptationRecord, l1Record, probeSourceIds }) {
  let score = 0;
  if (inReflectionScope) score += 60;
  if (labelState === "missing_l3_label") score += 20;
  if (labelState === "conflicting_l3_label") score += 18;
  if (adaptationRecord?.resolved_proxy_sample?.resolved === false) score += 10;
  if (adaptationRecord?.rejection_reason_sample?.available) score += 6;
  if (probeSourceIds.has(l1Record?.source_id)) score += 6;
  return Math.min(score, 100);
}

function sampleLibraryRow({ adaptationRecord, l1Record, l3Samples, probeSourceIds }) {
  const sourceId = adaptationRecord.sample_id;
  const profile = l1Record?.l1_signal_profile ?? {};
  const inReflectionScope = reflectionScopeFor(l1Record);
  const labelState = l3LabelState(l3Samples);
  const l3Signals = l3LabelSignals(l3Samples);
  const bucket = queueBucket({ inReflectionScope, labelState });
  return {
    schema_version: "misa.l1_l3_sample_library_row.v1",
    source_id: sourceId,
    dataset: adaptationRecord.dataset ?? "unknown",
    sample_type: adaptationRecord.sample_type ?? "unknown",
    source_ref: adaptationRecord.source_ref ?? null,
    issue_kinds: uniqueStrings((adaptationRecord.issues ?? []).map((issue) => issue.kind)),
    calibration_targets: uniqueStrings((adaptationRecord.issues ?? []).map((issue) => issue.calibration_target)),
    resolved_proxy: adaptationRecord.resolved_proxy_sample?.available
      ? Boolean(adaptationRecord.resolved_proxy_sample.resolved)
      : null,
    rejection_reason_available: Boolean(adaptationRecord.rejection_reason_sample?.available),
    safety_boundary_available: Boolean(adaptationRecord.safety_boundary_sample?.available),
    l1_present: Boolean(l1Record),
    l1_candidate_mode: profile.l2_candidate_mode ?? null,
    l1_candidate_count_hint: Number(profile.l2_candidate_count_hint ?? 0) || null,
    l1_signal_family: profile.signal_family ?? null,
    l1_risk_level: profile.risk_level ?? null,
    l1_route_hint: profile.route_hint ?? null,
    l1_evidence_density: profile.evidence_density ?? null,
    l1_uncertainty_level: profile.uncertainty_level ?? null,
    l1_handoff_floor: l1Record ? simulatedHandoffFloor(l1Record) : null,
    l1_observed_signals: l1Record?.observed_signals ?? [],
    in_reflection_scope: inReflectionScope,
    l3_label_state: labelState,
    ...l3Signals,
    queue_bucket: bucket,
    priority_score: priorityScore({
      inReflectionScope,
      labelState,
      adaptationRecord,
      l1Record,
      probeSourceIds
    })
  };
}

function sortQueue(rows) {
  return [...rows].sort((left, right) => (
    Number(right.priority_score) - Number(left.priority_score)
    || String(left.l3_label_state).localeCompare(String(right.l3_label_state))
    || String(left.source_id).localeCompare(String(right.source_id))
  ));
}

function topRows(rows, limit = 20) {
  return sortQueue(rows).slice(0, limit).map((row) => ({
    source_id: row.source_id,
    queue_bucket: row.queue_bucket,
    priority_score: row.priority_score,
    resolved_proxy: row.resolved_proxy,
    l1_candidate_mode: row.l1_candidate_mode,
    l1_candidate_count_hint: row.l1_candidate_count_hint,
    l1_risk_level: row.l1_risk_level,
    l1_route_hint: row.l1_route_hint,
    l1_handoff_floor: row.l1_handoff_floor,
    l3_label_state: row.l3_label_state,
    issue_kinds: row.issue_kinds
  }));
}

function summarize(rows, { adaptation, l1Alpha, l3Library, thresholds }) {
  const reflectionRows = rows.filter((row) => row.in_reflection_scope);
  const labeledReflectionRows = reflectionRows.filter((row) => row.l3_label_state !== "missing_l3_label");
  const unlabeledReflectionRows = reflectionRows.filter((row) => row.l3_label_state === "missing_l3_label");
  const badSeeds = reflectionRows.filter((row) => row.l3_label_state === "bad_l3_label" || row.l3_label_state === "conflicting_l3_label");
  const cleanLabels = reflectionRows.filter((row) => row.l3_label_state === "clean_l3_label");
  const conflicts = reflectionRows.filter((row) => row.l3_label_state === "conflicting_l3_label");
  const l1AutoReady = badSeeds.length >= thresholds.minBadSeedsForL1
    && cleanLabels.length >= thresholds.minCleanLabelsForL1
    && conflicts.length === 0
    && unlabeledReflectionRows.length === 0;
  return {
    adaptation_sample_count: adaptation.summary?.sample_count ?? adaptation.records?.length ?? rows.length,
    l1_sample_count: l1Alpha.alpha_summary?.sample_count ?? l1Alpha.online_shadow_report?.online_shadow_records?.length ?? 0,
    library_row_count: rows.length,
    l1_missing_count: rows.filter((row) => !row.l1_present).length,
    l1_mode_counts: countBy(rows, (row) => row.l1_candidate_mode),
    l1_candidate_count_hint_counts: countBy(rows, (row) => String(row.l1_candidate_count_hint ?? "unknown")),
    l1_signal_family_counts: countBy(rows, (row) => row.l1_signal_family),
    l1_risk_level_counts: countBy(rows, (row) => row.l1_risk_level),
    l1_route_hint_counts: countBy(rows, (row) => row.l1_route_hint),
    l1_handoff_floor_counts: countBy(rows, (row) => row.l1_handoff_floor),
    reflection_scope_count: reflectionRows.length,
    reflection_scope_rate: rate(reflectionRows.length, rows.length),
    reflection_l3_labeled_count: labeledReflectionRows.length,
    reflection_l3_labeled_rate: rate(labeledReflectionRows.length, reflectionRows.length),
    reflection_l3_missing_count: unlabeledReflectionRows.length,
    reflection_bad_seed_count: badSeeds.length,
    reflection_clean_labeled_count: cleanLabels.length,
    reflection_conflict_count: conflicts.length,
    reflection_queue_count: unlabeledReflectionRows.length + conflicts.length,
    queue_bucket_counts: countBy(rows, (row) => row.queue_bucket),
    l3_source_coverage_count: rows.filter((row) => row.l3_label_state !== "missing_l3_label").length,
    l3_source_coverage_rate: rate(rows.filter((row) => row.l3_label_state !== "missing_l3_label").length, rows.length),
    l3_pool_decision_row_count: l3Library.samples?.length ?? 0,
    l3_pool_decision_unique_source_count: new Set((l3Library.samples ?? []).map((sample) => sample.source_id)).size,
    product_gate: {
      sample_library_ready: rows.length > 0 && reflectionRows.length > 0,
      l1_auto_strategy_ready: l1AutoReady,
      min_bad_seeds_for_l1: thresholds.minBadSeedsForL1,
      min_clean_labels_for_l1: thresholds.minCleanLabelsForL1,
      reason: l1AutoReady
        ? "Enough labeled reflection-scope rows exist for L1 strategy review."
        : "Keep collecting L2/L3 labels before automatic L1 strategy integration."
    }
  };
}

export async function buildL1L3SampleLibrary({
  adaptationReportPath,
  l1AlphaReportPath,
  runsDir = "runs",
  repoRoot = process.cwd(),
  now = new Date(),
  minBadSeedsForL1 = DEFAULT_L1_L3_MIN_BAD_SEEDS_FOR_L1,
  minCleanLabelsForL1 = DEFAULT_L1_L3_MIN_CLEAN_LABELS_FOR_L1
} = {}) {
  if (!adaptationReportPath) throw new Error("adaptationReportPath is required");
  if (!l1AlphaReportPath) throw new Error("l1AlphaReportPath is required");
  const adaptationPath = resolvePath(repoRoot, adaptationReportPath);
  const l1Path = resolvePath(repoRoot, l1AlphaReportPath);
  const adaptation = await readJson(adaptationPath);
  const l1Alpha = await readJson(l1Path);
  const l3Library = await collectL3FeedbackReflectionAllSamples({ repoRoot, runsDir });
  const l1Records = l1Alpha.online_shadow_report?.online_shadow_records ?? [];
  const l1BySource = new Map(l1Records.map((record) => [record.source_id, record]));
  const l3BySource = groupBy(l3Library.samples ?? [], (sample) => sample.source_id);
  const probeSourceIds = new Set(l1Alpha.alpha_summary?.gemini_probe_set?.selected_source_ids ?? []);
  const rows = (adaptation.records ?? []).map((record) => sampleLibraryRow({
    adaptationRecord: record,
    l1Record: l1BySource.get(record.sample_id) ?? null,
    l3Samples: l3BySource.get(record.sample_id) ?? [],
    probeSourceIds
  }));
  const thresholds = { minBadSeedsForL1: minBadSeedsForL1, minCleanLabelsForL1: minCleanLabelsForL1 };
  const summary = summarize(rows, { adaptation, l1Alpha, l3Library, thresholds });
  const reflectionQueue = sortQueue(rows.filter((row) => (
    row.queue_bucket === "strict_unlabeled_l2_l3_priority"
    || row.queue_bucket === "strict_conflict_review"
  )));
  const strictLabeled = sortQueue(rows.filter((row) => row.in_reflection_scope && row.l3_label_state !== "missing_l3_label"));

  return {
    schema_version: "misa.l1_l3_sample_library.v1",
    mode: "l1-l3-sample-library",
    ok: summary.product_gate.sample_library_ready,
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    input: {
      adaptation_report: normalizePathForReport(repoRoot, adaptationPath),
      l1_alpha_report: normalizePathForReport(repoRoot, l1Path),
      runs_dir: normalizePathForReport(repoRoot, resolvePath(repoRoot, runsDir)),
      llm_api_calls: 0,
      external_api_calls: 0,
      touches_vps: false,
      pushes_github: false
    },
    summary,
    top_priority_l2_l3_queue: topRows(reflectionQueue, 30),
    strict_labeled_samples: topRows(strictLabeled, 30),
    rows,
    queue: {
      l2_l3_label_backfill: reflectionQueue,
      strict_labeled: strictLabeled
    },
    notes: [
      "This library quantifies GitHub/SWE-rebench samples after adapter and L1 simulation.",
      "Rows without L3 labels are queue items; they are not proof of L3 feedback behavior yet.",
      "The report does not call an LLM, touch VPS, push GitHub, or mutate L1 strategy."
    ]
  };
}

export function renderL1L3SampleLibraryMarkdown(result) {
  const summary = result.summary;
  const gate = summary.product_gate;
  const lines = [
    "# L1/L3 Sample Library",
    "",
    "## Summary",
    "",
    `- ok: ${result.ok}`,
    `- adaptation_sample_count: ${summary.adaptation_sample_count}`,
    `- l1_sample_count: ${summary.l1_sample_count}`,
    `- library_row_count: ${summary.library_row_count}`,
    `- l1_missing_count: ${summary.l1_missing_count}`,
    `- reflection_scope_count: ${summary.reflection_scope_count}`,
    `- reflection_scope_rate: ${summary.reflection_scope_rate}`,
    `- reflection_l3_labeled_count: ${summary.reflection_l3_labeled_count}`,
    `- reflection_l3_labeled_rate: ${summary.reflection_l3_labeled_rate}`,
    `- reflection_l3_missing_count: ${summary.reflection_l3_missing_count}`,
    `- reflection_bad_seed_count: ${summary.reflection_bad_seed_count}`,
    `- reflection_clean_labeled_count: ${summary.reflection_clean_labeled_count}`,
    `- reflection_conflict_count: ${summary.reflection_conflict_count}`,
    `- reflection_queue_count: ${summary.reflection_queue_count}`,
    `- l3_source_coverage_count: ${summary.l3_source_coverage_count}`,
    `- l3_source_coverage_rate: ${summary.l3_source_coverage_rate}`,
    `- l3_pool_decision_row_count: ${summary.l3_pool_decision_row_count}`,
    `- l3_pool_decision_unique_source_count: ${summary.l3_pool_decision_unique_source_count}`,
    `- sample_library_ready: ${gate.sample_library_ready}`,
    `- l1_auto_strategy_ready: ${gate.l1_auto_strategy_ready}`,
    `- l1_auto_strategy_reason: ${gate.reason}`,
    "",
    "## L1 Quant",
    "",
    `- l1_mode_counts: ${JSON.stringify(summary.l1_mode_counts)}`,
    `- l1_candidate_count_hint_counts: ${JSON.stringify(summary.l1_candidate_count_hint_counts)}`,
    `- l1_signal_family_counts: ${JSON.stringify(summary.l1_signal_family_counts)}`,
    `- l1_risk_level_counts: ${JSON.stringify(summary.l1_risk_level_counts)}`,
    `- l1_route_hint_counts: ${JSON.stringify(summary.l1_route_hint_counts)}`,
    `- l1_handoff_floor_counts: ${JSON.stringify(summary.l1_handoff_floor_counts)}`,
    `- queue_bucket_counts: ${JSON.stringify(summary.queue_bucket_counts)}`,
    "",
    "## Top L2/L3 Backfill Queue",
    "",
    ...(
      result.top_priority_l2_l3_queue.length
        ? result.top_priority_l2_l3_queue.map((row) => (
          `- ${row.source_id}: priority=${row.priority_score}, bucket=${row.queue_bucket}, resolved=${row.resolved_proxy}, risk=${row.l1_risk_level}, route=${row.l1_route_hint}, floor=${row.l1_handoff_floor}, issues=${row.issue_kinds.join(",") || "none"}`
        ))
        : ["- none"]
    ),
    "",
    "## Strict Labeled Samples",
    "",
    ...(
      result.strict_labeled_samples.length
        ? result.strict_labeled_samples.map((row) => (
          `- ${row.source_id}: label=${row.l3_label_state}, priority=${row.priority_score}, risk=${row.l1_risk_level}, route=${row.l1_route_hint}, floor=${row.l1_handoff_floor}`
        ))
        : ["- none"]
    ),
    "",
    "## Notes",
    "",
    ...result.notes.map((note) => `- ${note}`)
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeL1L3SampleLibraryArtifacts({
  result,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join(DEFAULT_L1_L3_SAMPLE_LIBRARY_OUT_DIR, `${stamp}-github-samples`));
  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "l1-l3-sample-library.json");
  const mdPath = path.join(outputRoot, "l1-l3-sample-library.md");
  const rowsJsonlPath = path.join(outputRoot, "l1-l3-sample-library.rows.jsonl");
  const queueJsonlPath = path.join(outputRoot, "l1-l3-backfill-queue.jsonl");
  const manifestPath = path.join(outputRoot, "input-manifest.json");
  const written = {
    ...result,
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      json_path: normalizePathForReport(repoRoot, jsonPath),
      markdown_path: normalizePathForReport(repoRoot, mdPath),
      rows_jsonl_path: normalizePathForReport(repoRoot, rowsJsonlPath),
      queue_jsonl_path: normalizePathForReport(repoRoot, queueJsonlPath),
      input_manifest_path: normalizePathForReport(repoRoot, manifestPath)
    }
  };
  const manifest = {
    schema_version: "misa.l1_l3_sample_library_manifest.v1",
    created_at: result.created_at,
    input: result.input,
    summary: result.summary
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderL1L3SampleLibraryMarkdown(written), "utf8");
  await fs.writeFile(rowsJsonlPath, result.rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await fs.writeFile(queueJsonlPath, result.queue.l2_l3_label_backfill.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return written;
}

export async function runL1L3SampleLibrary({
  adaptationReportPath,
  l1AlphaReportPath,
  runsDir = "runs",
  repoRoot = process.cwd(),
  outDir,
  now = new Date(),
  minBadSeedsForL1 = DEFAULT_L1_L3_MIN_BAD_SEEDS_FOR_L1,
  minCleanLabelsForL1 = DEFAULT_L1_L3_MIN_CLEAN_LABELS_FOR_L1
} = {}) {
  const result = await buildL1L3SampleLibrary({
    adaptationReportPath,
    l1AlphaReportPath,
    runsDir,
    repoRoot,
    now,
    minBadSeedsForL1,
    minCleanLabelsForL1
  });
  return writeL1L3SampleLibraryArtifacts({
    result,
    repoRoot,
    outDir,
    now
  });
}
