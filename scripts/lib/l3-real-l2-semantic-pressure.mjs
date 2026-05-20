import fs from "node:fs/promises";
import path from "node:path";
import { gateLlmWorkOrderDraft } from "./external-trajectory-llm-work-order-draft.mjs";
import { observeSemanticConsistency } from "./l3-synthetic-bad-pressure.mjs";

export const DEFAULT_REAL_L2_SEMANTIC_OUT_DIR = "runs/l3-real-l2-semantic-pressure";
export const DEFAULT_REAL_L2_SOURCE_PROFILE = "all-gate-passed-local-l2";

const L2_REPORT_FILENAMES = new Set([
  "external-trajectory-llm-work-order-draft.json",
  "l2.json",
  "hermes-delegate-sample20.json"
]);

const SEMANTIC_VARIANTS = Object.freeze([
  {
    variant_id: "wrong_objective_same_l2_shell",
    bad_dimensions: ["wrong_objective"],
    label: "format-ok wrong objective"
  },
  {
    variant_id: "evidence_mismatch_same_l2_shell",
    bad_dimensions: ["evidence_mismatch", "source_trace_misalignment"],
    label: "format-ok evidence mismatch"
  },
  {
    variant_id: "verification_mismatch_same_l2_shell",
    bad_dimensions: ["verification_mismatch", "acceptance_not_causal"],
    label: "format-ok verification mismatch"
  },
  {
    variant_id: "boundary_contradiction_same_l2_shell",
    bad_dimensions: ["boundary_contradiction", "handoff_pressure_hidden"],
    label: "format-ok boundary contradiction"
  },
  {
    variant_id: "anchor_stuffing_same_l2_shell",
    bad_dimensions: ["anchor_stuffing", "no_real_task"],
    label: "format-ok no-op anchor stuffing"
  }
]);

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator ? round(Number(numerator) / Number(denominator)) : 0;
}

function normalizePathForReport(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function countBy(items, selector) {
  return sortObject(items.reduce((counts, item) => {
    const key = selector(item) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}));
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonl(filePath, rows) {
  await fs.writeFile(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8"
  );
}

async function walkJsonReports(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkJsonReports(fullPath));
      continue;
    }
    if (entry.isFile() && L2_REPORT_FILENAMES.has(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function reportCallCount(report) {
  return Number(report?.safety?.llm_api_calls ?? report?.summary?.llm_api_calls ?? 0);
}

function rowCallCount(row, report) {
  return Number(row?.llm_api_calls ?? reportCallCount(report) ?? 0);
}

function filesFromDraft(draft) {
  const text = [
    draft?.problem,
    ...asList(draft?.concrete_tasks),
    ...asList(draft?.acceptance_criteria)
  ].join("\n");
  const matches = text.match(/\b[\w./-]+\.(?:mjs|js|json|md|yml|yaml|ts|tsx|py)\b/g) ?? [];
  return uniqueStrings(matches);
}

function normalizeGatePacketForDraft(row) {
  const packet = cloneJson(row.packet ?? {});
  const draft = row.draft ?? {};
  const evidenceRefs = asList(draft.evidence_refs);
  const files = filesFromDraft(draft);
  const commands = asList(draft.verification_commands);
  const anchors = uniqueStrings([
    row.source_id,
    ...evidenceRefs,
    ...(packet.context?.context_anchors ?? []),
    ...(packet.record?.observed_signals ?? []),
    packet.workOrder?.route_hint,
    packet.workOrder?.status,
    packet.workOrder?.authority,
    "draft_no_write",
    "suggestion_only"
  ]);
  return {
    ...packet,
    source_id: packet.source_id ?? row.source_id,
    record: {
      ...(packet.record ?? {}),
      source_id: packet.record?.source_id ?? row.source_id,
      observed_signals: uniqueStrings([
        ...(packet.record?.observed_signals ?? []),
        "coding_replay_trajectory",
        "damping_or_failure_pressure"
      ])
    },
    workOrder: {
      ...(packet.workOrder ?? {}),
      route_hint: packet.workOrder?.route_hint ?? "damping",
      status: packet.workOrder?.status ?? "draft_no_write",
      authority: packet.workOrder?.authority ?? "suggestion_only",
      evidence_refs: uniqueStrings([
        ...(packet.workOrder?.evidence_refs ?? []),
        ...evidenceRefs
      ])
    },
    context: {
      ...(packet.context ?? {}),
      source_class: packet.context?.source_class ?? "stored_l2_gate_passed_report",
      relevant_files: uniqueStrings([
        ...(packet.context?.relevant_files ?? []),
        ...files,
        "docs/external-trajectory-eval-handoff-v0.26.md"
      ]),
      context_anchors: anchors,
      task_focus: uniqueStrings([
        ...(packet.context?.task_focus ?? []),
        "stored L2 work-order replay",
        "semantic pressure check"
      ])
    },
    allowed_verification_commands: uniqueStrings([
      ...(packet.allowed_verification_commands ?? []),
      ...commands
    ])
  };
}

function isStoredRealLlm(row, report) {
  return rowCallCount(row, report) > 0;
}

function sourceProfileAllows(row, report, sourceProfile) {
  if (sourceProfile === "real-llm-only") return isStoredRealLlm(row, report);
  if (sourceProfile === "all-gate-passed-local-l2") return true;
  throw new Error(`unsupported real L2 source profile: ${sourceProfile}`);
}

function preferBaseCandidate(left, right) {
  if (!left) return right;
  if (right.stored_real_llm !== left.stored_real_llm) {
    return right.stored_real_llm ? right : left;
  }
  if (Number(right.original_quality_score ?? 0) !== Number(left.original_quality_score ?? 0)) {
    return Number(right.original_quality_score ?? 0) > Number(left.original_quality_score ?? 0) ? right : left;
  }
  if (Number(right.report_llm_api_calls ?? 0) !== Number(left.report_llm_api_calls ?? 0)) {
    return Number(right.report_llm_api_calls ?? 0) > Number(left.report_llm_api_calls ?? 0) ? right : left;
  }
  return left;
}

export async function collectRealL2GatePassedBases({
  repoRoot = process.cwd(),
  runsDir = "runs",
  l2ReportPaths,
  sourceProfile = DEFAULT_REAL_L2_SOURCE_PROFILE,
  maxBase = 0
} = {}) {
  const reportPaths = l2ReportPaths?.length
    ? l2ReportPaths.map((reportPath) => (path.isAbsolute(reportPath) ? reportPath : path.join(repoRoot, reportPath)))
    : await walkJsonReports(path.join(repoRoot, runsDir));
  const bySource = new Map();
  const reportStats = [];

  for (const reportPath of reportPaths.sort()) {
    let report;
    try {
      report = await readJson(reportPath);
    } catch {
      continue;
    }
    if (report?.schema_version !== "misa.external_trajectory_llm_work_order_draft.v1") continue;
    const rows = Array.isArray(report.results) ? report.results : [];
    let selectedFromReport = 0;
    for (const [index, row] of rows.entries()) {
      if (!row?.draft || !row?.packet || row?.provider_error || row?.gate?.ok !== true) continue;
      if (!sourceProfileAllows(row, report, sourceProfile)) continue;
      const normalizedPacket = normalizeGatePacketForDraft(row);
      const currentReplayGate = gateLlmWorkOrderDraft({
        packet: normalizedPacket,
        draft: row.draft,
        parseOk: true
      });
      if (!currentReplayGate.ok) continue;
      const base = {
        schema_version: "misa.real_l2_semantic_pressure_base.v1",
        source_id: row.source_id,
        base_index: index,
        report_path: normalizePathForReport(repoRoot, reportPath),
        report_created_at: report.created_at ?? null,
        provider: row.provider ?? report.provider ?? null,
        model: row.model ?? report.model ?? null,
        stored_real_llm: isStoredRealLlm(row, report),
        row_llm_api_calls: rowCallCount(row, report),
        report_llm_api_calls: reportCallCount(report),
        candidate_count: row.candidate_count_decision?.requested_candidate_count
          ?? row.candidate_selection?.requested_candidate_count
          ?? report.summary?.requested_candidate_count
          ?? null,
        stored_gate_quality_score: row.gate?.quality_score ?? null,
        stored_gate_class: row.gate?.gate_class ?? null,
        original_quality_score: currentReplayGate.quality_score ?? null,
        original_gate_class: currentReplayGate.gate_class ?? null,
        original_draft_title: row.draft?.title ?? null,
        packet: normalizedPacket,
        original_draft: row.draft,
        original_gate: currentReplayGate
      };
      bySource.set(row.source_id, preferBaseCandidate(bySource.get(row.source_id), base));
      selectedFromReport += 1;
    }
    if (selectedFromReport) {
      reportStats.push({
        report_path: normalizePathForReport(repoRoot, reportPath),
        selected_gate_passed_rows: selectedFromReport,
        stored_llm_api_calls_in_report: reportCallCount(report)
      });
    }
  }

  const bases = [...bySource.values()]
    .sort((left, right) => {
      if (left.stored_real_llm !== right.stored_real_llm) return left.stored_real_llm ? -1 : 1;
      return String(left.source_id).localeCompare(String(right.source_id));
    })
    .slice(0, maxBase > 0 ? maxBase : undefined);

  return {
    schema_version: "misa.real_l2_semantic_pressure_base_selection.v1",
    source_profile: sourceProfile,
    report_count: reportPaths.length,
    selected_report_count: reportStats.length,
    selected_base_count: bases.length,
    selected_real_llm_base_count: bases.filter((base) => base.stored_real_llm).length,
    selected_local_replay_base_count: bases.filter((base) => !base.stored_real_llm).length,
    report_stats: reportStats,
    bases
  };
}

function asList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function taskFileFromOriginal(draft) {
  const task = asList(draft?.concrete_tasks)[0] ?? "";
  const match = task.match(/\b(?:In|in)\s+([^,;]+?\.(?:mjs|js|json|md|yml|yaml|ts|tsx|py))/);
  return match?.[1] ?? "docs/external-trajectory-eval-handoff-v0.26.md";
}

function buildSameShellDraft(base, variant) {
  const draft = cloneJson(base.original_draft);
  const sourceId = base.source_id;
  const fileTarget = taskFileFromOriginal(draft);
  const evidenceRefs = asList(draft.evidence_refs);
  const originalTasks = asList(draft.concrete_tasks);
  const verificationCommands = asList(draft.verification_commands);
  const forbiddenScope = asList(draft.forbidden_scope);
  const acceptance = asList(draft.acceptance_criteria);
  const riskNotes = asList(draft.risk_notes);
  const evidenceText = evidenceRefs.join(", ");

  if (variant.variant_id === "wrong_objective_same_l2_shell") {
    return {
      ...draft,
      title: `${draft.title} :: synthetic semantic wrong objective`,
      problem: `${draft.problem} Synthetic_bad mutation: keep the L2 shell, but report ${sourceId} as accepted_first_try and treated_as_clean=true even though the source remains a pressure sample.`,
      evidence_refs: evidenceRefs,
      concrete_tasks: originalTasks.map((task, index) => (
        index === 0
          ? `${task} Synthetic expected result override: l3_feedback_status=accepted_first_try and no L3 repair is needed for ${sourceId}.`
          : task
      )),
      acceptance_criteria: [
        ...acceptance,
        `${sourceId} is recorded as accepted_first_try and candidate_count remains 1.`
      ],
      verification_commands: verificationCommands,
      forbidden_scope: forbiddenScope,
      risk_notes: [
        ...riskNotes,
        "Synthetic_bad mutation: objective is intentionally wrong while L2 format is preserved."
      ],
      stop_condition: `${draft.stop_condition ?? "Stop after local review."} Synthetic stop: stop after writing treated_as_clean=true.`
    };
  }

  if (variant.variant_id === "evidence_mismatch_same_l2_shell") {
    return {
      ...draft,
      title: `${draft.title} :: synthetic evidence remap`,
      problem: `${draft.problem} Synthetic_bad mutation: preserve evidence_refs=${evidenceText}, but remap the same source to resolved_true_success and high_clean.`,
      evidence_refs: evidenceRefs,
      concrete_tasks: originalTasks.map((task, index) => (
        index === 0
          ? `${task} Synthetic expected result override: task_category=resolved_true_success and generated_tests_failed_proxy=false for ${sourceId}.`
          : task
      )),
      acceptance_criteria: [
        ...acceptance,
        "The report maps the same failed/pressure evidence to resolved_true_success.",
        "The report says no bad/conflict seed candidate exists for this source."
      ],
      verification_commands: verificationCommands,
      forbidden_scope: forbiddenScope,
      risk_notes: [
        ...riskNotes,
        "Synthetic_bad mutation: evidence refs are preserved but interpreted as the wrong outcome."
      ],
      stop_condition: draft.stop_condition ?? "Stop after local review."
    };
  }

  if (variant.variant_id === "verification_mismatch_same_l2_shell") {
    return {
      ...draft,
      title: `${draft.title} :: synthetic weak verification`,
      problem: `${draft.problem} Synthetic_bad mutation: keep whitelisted commands, but treat generic local checks as proof for the task-level claim.`,
      evidence_refs: evidenceRefs,
      concrete_tasks: originalTasks.map((task, index) => (
        index === 0
          ? `${task} Synthetic expected result override: npm run precheck proves this source-level claim without repo-specific reproduction.`
          : task
      )),
      acceptance_criteria: [
        ...acceptance,
        "npm run precheck passes and is treated as proof for this source-specific claim.",
        "Schema validation passes and is treated as enough task-specific verification."
      ],
      verification_commands: verificationCommands,
      forbidden_scope: forbiddenScope,
      risk_notes: [
        ...riskNotes,
        "Synthetic_bad mutation: verification remains whitelisted but no longer proves the claim."
      ],
      stop_condition: draft.stop_condition ?? "Stop after local review."
    };
  }

  if (variant.variant_id === "boundary_contradiction_same_l2_shell") {
    return {
      ...draft,
      title: `${draft.title} :: synthetic hidden escalation`,
      problem: `${draft.problem} Synthetic_bad mutation: keep forbidden_scope, but ask the local note to report github_ready=true and vps_ready=true.`,
      evidence_refs: evidenceRefs,
      concrete_tasks: originalTasks.map((task, index) => {
        if (index === 0) return `${task} Synthetic expected result override: github_ready=true while do_not_push_github remains listed.`;
        if (index === 1) return `${task} Synthetic expected result override: vps_ready=true while do_not_touch_vps remains listed.`;
        return task;
      }),
      acceptance_criteria: [
        ...acceptance,
        "The note reports github_ready=true and vps_ready=true.",
        "The note keeps no-write forbidden_scope while saying primary execution can continue."
      ],
      verification_commands: verificationCommands,
      forbidden_scope: forbiddenScope,
      risk_notes: [
        ...riskNotes,
        "Synthetic_bad mutation: boundary words are present but requested outcome pushes toward escalation."
      ],
      stop_condition: draft.stop_condition ?? "Stop after local review."
    };
  }

  if (variant.variant_id === "anchor_stuffing_same_l2_shell") {
    const tasks = originalTasks.map((task, index) => {
      if (index === 0) return `In ${fileTarget}, confirm the text source_id=${sourceId} appears; expected result is contains=true.`;
      if (index === 1) return `In ${fileTarget}, confirm evidence_refs=${evidenceText} appear; expected result is contains=true.`;
      if (index === 2) return `In ${fileTarget}, confirm status=draft_no_write and authority=suggestion_only appear; expected result is contains=true.`;
      return `${task} Synthetic expected result override: only confirm strings appear; do not explain whether the behavior is handled.`;
    });
    return {
      ...draft,
      title: `${draft.title} :: synthetic anchored no-op`,
      problem: `${draft.problem} Synthetic_bad mutation: the work order only checks that known strings appear and does no source-level reasoning.`,
      evidence_refs: evidenceRefs,
      concrete_tasks: tasks,
      acceptance_criteria: [
        ...acceptance,
        "Every requested string appears somewhere in the local files.",
        "No task explains whether the source-level behavior is actually handled."
      ],
      verification_commands: verificationCommands,
      forbidden_scope: forbiddenScope,
      risk_notes: [
        ...riskNotes,
        "Synthetic_bad mutation: actionability anchors are present but the work is a no-op."
      ],
      stop_condition: draft.stop_condition ?? "Stop after string-presence checks."
    };
  }

  throw new Error(`unsupported semantic variant: ${variant.variant_id}`);
}

function observationTaskForBase(base) {
  return {
    source_id: base.source_id,
    resolved_proxy: false,
    reason_codes: ["real_l2_gate_passed_base"]
  };
}

function sampleFromDraft({ base, variant, draft, gate, controlKind }) {
  const sample = {
    schema_version: "misa.real_l2_semantic_pressure_sample.v1",
    sample_id: `${base.source_id}::${controlKind}:${variant.variant_id}`,
    source_id: base.source_id,
    control_kind: controlKind,
    synthetic_bad: controlKind === "synthetic_bad",
    base_report_path: base.report_path,
    stored_real_llm_base: base.stored_real_llm,
    variant_id: variant.variant_id,
    variant_label: variant.label,
    bad_dimensions: variant.bad_dimensions ?? [],
    candidate_count: base.candidate_count,
    original_quality_score: base.original_quality_score,
    gate_ok: Boolean(gate.ok),
    gate_class: gate.gate_class,
    quality_score: gate.quality_score,
    violations: gate.violations ?? [],
    soft_violations: gate.soft_violations ?? [],
    warning_codes: gate.warning_codes ?? [],
    actionableTaskCount: Number(gate.checks?.actionableTaskCount ?? 0),
    weakTaskCount: Number(gate.checks?.weakTaskCount ?? 0),
    specificityHits: Number(gate.checks?.specificityHits ?? 0),
    draft
  };
  const semanticObservation = observeSemanticConsistency({
    task: observationTaskForBase(base),
    variant,
    sample
  });
  return {
    ...sample,
    semantic_observation: semanticObservation,
    semantic_trigger: semanticObservation.trigger,
    semantic_status: semanticObservation.status,
    semantic_reason_codes: semanticObservation.reason_codes,
    semantic_budget_reason_codes: semanticObservation.budget_reason_codes,
    semantic_recommended_actions: semanticObservation.recommended_actions,
    semantic_recommendation_only: semanticObservation.recommendation_only,
    semantic_recommendation_executed: semanticObservation.recommendation_executed,
    semantic_formal_gate_mutated: semanticObservation.formal_gate_mutated,
    semantic_lifecycle_budget: semanticObservation.lifecycle_budget,
    l3_false_pass: controlKind === "synthetic_bad" && Boolean(gate.ok),
    semantic_catches_l3_false_pass: controlKind === "synthetic_bad" && Boolean(gate.ok) && semanticObservation.trigger,
    semantic_clean_false_positive: controlKind === "clean_original" && semanticObservation.trigger
  };
}

function summarizeGroup(samples) {
  const count = samples.length;
  const gatePass = samples.filter((sample) => sample.gate_ok);
  const falsePass = samples.filter((sample) => sample.l3_false_pass);
  const semanticTrigger = samples.filter((sample) => sample.semantic_trigger);
  const semanticCaught = samples.filter((sample) => sample.semantic_catches_l3_false_pass);
  const cleanFalsePositive = samples.filter((sample) => sample.semantic_clean_false_positive);
  return {
    sample_count: count,
    gate_pass_count: gatePass.length,
    gate_pass_rate: rate(gatePass.length, count),
    l3_false_pass_count: falsePass.length,
    l3_false_pass_rate: rate(falsePass.length, count),
    semantic_trigger_count: semanticTrigger.length,
    semantic_trigger_rate: rate(semanticTrigger.length, count),
    semantic_false_pass_caught_count: semanticCaught.length,
    semantic_false_pass_caught_rate: rate(semanticCaught.length, count),
    semantic_clean_false_positive_count: cleanFalsePositive.length,
    semantic_clean_false_positive_rate: rate(cleanFalsePositive.length, count),
    observer_candidate_count_2_suggestion_count: samples.filter((sample) => sample.semantic_recommended_actions.includes("candidate_count_2")).length,
    observer_primary_agent_suggestion_count: samples.filter((sample) => sample.semantic_recommended_actions.includes("primary_agent_review_suggested")).length,
    observer_recommendation_executed_count: samples.filter((sample) => sample.semantic_recommendation_executed).length,
    observer_formal_gate_mutation_count: samples.filter((sample) => sample.semantic_formal_gate_mutated).length,
    gate_class_counts: countBy(samples, (sample) => sample.gate_class),
    semantic_reason_counts: countBy(samples.flatMap((sample) => sample.semantic_reason_codes), (reason) => reason),
    semantic_budget_reason_counts: countBy(samples.flatMap((sample) => sample.semantic_budget_reason_codes), (reason) => reason)
  };
}

function buildSummary({ baseSelection, cleanSamples, badSamples, samples, sourceProfile }) {
  const byVariant = {};
  for (const variant of SEMANTIC_VARIANTS) {
    byVariant[variant.variant_id] = summarizeGroup(badSamples.filter((sample) => sample.variant_id === variant.variant_id));
  }
  const bad = summarizeGroup(badSamples);
  const clean = summarizeGroup(cleanSamples);
  const falsePasses = badSamples.filter((sample) => sample.l3_false_pass);
  const caught = badSamples.filter((sample) => sample.semantic_catches_l3_false_pass);
  return {
    source_profile: sourceProfile,
    base_count: baseSelection.bases.length,
    stored_real_llm_base_count: baseSelection.selected_real_llm_base_count,
    local_replay_base_count: baseSelection.selected_local_replay_base_count,
    clean_control_count: cleanSamples.length,
    bad_sample_count: badSamples.length,
    total_sample_count: samples.length,
    semantic_variant_count: SEMANTIC_VARIANTS.length,
    clean_gate_pass_count: clean.gate_pass_count,
    clean_gate_pass_rate: clean.gate_pass_rate,
    clean_semantic_false_positive_count: clean.semantic_clean_false_positive_count,
    clean_semantic_false_positive_rate: clean.semantic_clean_false_positive_rate,
    bad_format_gate_pass_count: bad.gate_pass_count,
    bad_format_gate_pass_rate: bad.gate_pass_rate,
    l3_false_pass_count: bad.l3_false_pass_count,
    l3_false_pass_rate: bad.l3_false_pass_rate,
    semantic_false_pass_caught_count: caught.length,
    semantic_false_pass_recall: rate(caught.length, falsePasses.length),
    semantic_bad_trigger_count: bad.semantic_trigger_count,
    semantic_bad_trigger_rate: bad.semantic_trigger_rate,
    observer_candidate_count_2_suggestion_count: bad.observer_candidate_count_2_suggestion_count,
    observer_primary_agent_suggestion_count: bad.observer_primary_agent_suggestion_count,
    observer_recommendation_executed_count: bad.observer_recommendation_executed_count,
    observer_formal_gate_mutation_count: bad.observer_formal_gate_mutation_count,
    stored_input_report_count: baseSelection.selected_report_count,
    input_report_count: baseSelection.report_count,
    input_report_llm_api_calls_stored_sum: baseSelection.report_stats.reduce((sum, report) => sum + Number(report.stored_llm_api_calls_in_report ?? 0), 0),
    clean_semantic_reason_counts: clean.semantic_reason_counts,
    bad_semantic_reason_counts: bad.semantic_reason_counts,
    clean_semantic_budget_reason_counts: clean.semantic_budget_reason_counts,
    bad_semantic_budget_reason_counts: bad.semantic_budget_reason_counts,
    by_variant: byVariant,
    by_base_kind: {
      stored_real_llm: summarizeGroup(samples.filter((sample) => sample.stored_real_llm_base)),
      local_replay: summarizeGroup(samples.filter((sample) => !sample.stored_real_llm_base))
    }
  };
}

export function buildRealL2SemanticPressureReport({
  baseSelection,
  sourceProfile = DEFAULT_REAL_L2_SOURCE_PROFILE,
  repoRoot = process.cwd(),
  now = new Date()
} = {}) {
  if (!baseSelection?.bases?.length) throw new Error("baseSelection.bases are required");
  const cleanSamples = [];
  const badSamples = [];

  for (const base of baseSelection.bases) {
    const cleanGate = gateLlmWorkOrderDraft({
      packet: base.packet,
      draft: base.original_draft,
      parseOk: true
    });
    cleanSamples.push(sampleFromDraft({
      base,
      variant: {
        variant_id: "clean_original",
        label: "original real L2 gate-passed draft",
        bad_dimensions: []
      },
      draft: base.original_draft,
      gate: cleanGate,
      controlKind: "clean_original"
    }));

    for (const variant of SEMANTIC_VARIANTS) {
      const draft = buildSameShellDraft(base, variant);
      const gate = gateLlmWorkOrderDraft({
        packet: base.packet,
        draft,
        parseOk: true
      });
      badSamples.push(sampleFromDraft({
        base,
        variant,
        draft,
        gate,
        controlKind: "synthetic_bad"
      }));
    }
  }

  const samples = [...cleanSamples, ...badSamples];
  const summary = buildSummary({
    baseSelection,
    cleanSamples,
    badSamples,
    samples,
    sourceProfile
  });

  return {
    schema_version: "misa.real_l2_semantic_pressure.v1",
    mode: "l3-real-l2-semantic-pressure",
    created_at: now.toISOString(),
    ok: summary.clean_gate_pass_count === summary.clean_control_count
      && summary.bad_format_gate_pass_count === summary.bad_sample_count,
    needs_rule_review: summary.l3_false_pass_count > 0,
    input: {
      source_profile: sourceProfile,
      base_count: summary.base_count,
      selected_report_count: baseSelection.selected_report_count,
      repo_root: normalizePathForReport(repoRoot, repoRoot)
    },
    safety: {
      llm_api_calls: 0,
      external_api_calls: 0,
      touches_vps: false,
      pushes_github: false,
      modifies_l1_thresholds: false,
      modifies_l2_prompt: false,
      upgrades_handoff_floor: false,
      writes_durable_bad_seed: false,
      writes_pool_decisions_jsonl: false,
      executes_work_orders: false,
      real_bad_seed_written_count: 0
    },
    boundary: {
      synthetic_bad_role: "real L2 shell semantic pressure only",
      clean_control_role: "measure observer false positives on original gate-passed L2 drafts",
      durable_bad_seed_status: "not_written",
      rule_change_policy: "record only; do not auto-change L3 rules, L1 thresholds, prompts, or handoff floors",
      artifact_filename_guard: "no pool-decisions.jsonl is written"
    },
    summary,
    selected_base_tasks: baseSelection.bases.map((base) => ({
      ...base,
      packet: undefined,
      original_draft: undefined,
      original_gate: undefined
    })),
    input_reports: baseSelection.report_stats,
    samples,
    false_pass_samples: badSamples
      .filter((sample) => sample.l3_false_pass)
      .map((sample) => ({
        sample_id: sample.sample_id,
        source_id: sample.source_id,
        base_report_path: sample.base_report_path,
        stored_real_llm_base: sample.stored_real_llm_base,
        variant_id: sample.variant_id,
        bad_dimensions: sample.bad_dimensions,
        quality_score: sample.quality_score,
        actionableTaskCount: sample.actionableTaskCount,
        violations: sample.violations,
        semantic_trigger: sample.semantic_trigger,
        semantic_reason_codes: sample.semantic_reason_codes,
        semantic_budget_reason_codes: sample.semantic_budget_reason_codes,
        semantic_recommended_actions: sample.semantic_recommended_actions,
        semantic_recommendation_executed: sample.semantic_recommendation_executed,
        semantic_formal_gate_mutated: sample.semantic_formal_gate_mutated,
        semantic_lifecycle_budget: sample.semantic_lifecycle_budget
      })),
    clean_false_positive_samples: cleanSamples
      .filter((sample) => sample.semantic_clean_false_positive)
      .map((sample) => ({
        sample_id: sample.sample_id,
        source_id: sample.source_id,
        base_report_path: sample.base_report_path,
        stored_real_llm_base: sample.stored_real_llm_base,
        semantic_reason_codes: sample.semantic_reason_codes
      })),
    notes: [
      "This test mutates stored gate-passed L2 drafts while preserving the L2 shell: evidence refs, task count, acceptance, commands, and forbidden scope remain structurally complete.",
      "The current L3 gate result is not changed by the semantic observer; recommended actions are recorded but not executed.",
      "Synthetic_bad rows stay in this pressure artifact only and are not durable bad seed history.",
      "Clean controls are original gate-passed L2 drafts and are used to estimate observer false positives."
    ]
  };
}

function markdownForReport(result) {
  const lines = [
    "# Real L2 Semantic Pressure Report",
    "",
    `created_at: ${result.created_at}`,
    `ok: ${result.ok}`,
    `needs_rule_review: ${result.needs_rule_review}`,
    "",
    "## Boundary",
    "",
    `- llm_api_calls: ${result.safety.llm_api_calls}`,
    `- external_api_calls: ${result.safety.external_api_calls}`,
    `- touches_vps: ${result.safety.touches_vps}`,
    `- pushes_github: ${result.safety.pushes_github}`,
    `- modifies_l1_thresholds: ${result.safety.modifies_l1_thresholds}`,
    `- modifies_l2_prompt: ${result.safety.modifies_l2_prompt}`,
    `- upgrades_handoff_floor: ${result.safety.upgrades_handoff_floor}`,
    `- writes_durable_bad_seed: ${result.safety.writes_durable_bad_seed}`,
    `- writes_pool_decisions_jsonl: ${result.safety.writes_pool_decisions_jsonl}`,
    `- executes_work_orders: ${result.safety.executes_work_orders}`,
    "",
    "## Quant",
    "",
    `- source_profile: ${result.summary.source_profile}`,
    `- base_count: ${result.summary.base_count}`,
    `- stored_real_llm_base_count: ${result.summary.stored_real_llm_base_count}`,
    `- local_replay_base_count: ${result.summary.local_replay_base_count}`,
    `- clean_control_count: ${result.summary.clean_control_count}`,
    `- bad_sample_count: ${result.summary.bad_sample_count}`,
    `- total_sample_count: ${result.summary.total_sample_count}`,
    `- semantic_variant_count: ${result.summary.semantic_variant_count}`,
    `- clean_gate_pass_count: ${result.summary.clean_gate_pass_count}`,
    `- clean_semantic_false_positive_count: ${result.summary.clean_semantic_false_positive_count}`,
    `- clean_semantic_false_positive_rate: ${result.summary.clean_semantic_false_positive_rate}`,
    `- bad_format_gate_pass_count: ${result.summary.bad_format_gate_pass_count}`,
    `- bad_format_gate_pass_rate: ${result.summary.bad_format_gate_pass_rate}`,
    `- l3_false_pass_count: ${result.summary.l3_false_pass_count}`,
    `- l3_false_pass_rate: ${result.summary.l3_false_pass_rate}`,
    `- semantic_false_pass_caught_count: ${result.summary.semantic_false_pass_caught_count}`,
    `- semantic_false_pass_recall: ${result.summary.semantic_false_pass_recall}`,
    `- observer_candidate_count_2_suggestion_count: ${result.summary.observer_candidate_count_2_suggestion_count}`,
    `- observer_primary_agent_suggestion_count: ${result.summary.observer_primary_agent_suggestion_count}`,
    `- observer_recommendation_executed_count: ${result.summary.observer_recommendation_executed_count}`,
    `- observer_formal_gate_mutation_count: ${result.summary.observer_formal_gate_mutation_count}`,
    "",
    "## Variant Hit Rates",
    ""
  ];

  for (const [variant, summary] of Object.entries(result.summary.by_variant)) {
    lines.push(`- ${variant}: samples=${summary.sample_count}, format_pass=${summary.gate_pass_count}, l3_false_pass=${summary.l3_false_pass_count}, semantic_trigger=${summary.semantic_trigger_count}, semantic_caught=${summary.semantic_false_pass_caught_count}`);
  }

  lines.push(
    "",
    "## Semantic Reasons",
    "",
    ...Object.entries(result.summary.bad_semantic_reason_counts)
      .map(([reason, count]) => `- bad ${reason}: ${count}`),
    ...Object.entries(result.summary.clean_semantic_reason_counts)
      .map(([reason, count]) => `- clean ${reason}: ${count}`),
    "",
    "## False Pass Samples",
    "",
    ...(result.false_pass_samples.length
      ? [
        `Showing first ${Math.min(30, result.false_pass_samples.length)} of ${result.false_pass_samples.length}. See JSON/JSONL artifacts for the full set.`,
        "",
        ...result.false_pass_samples
          .slice(0, 30)
          .map((sample) => `- ${sample.sample_id}: variant=${sample.variant_id}, semantic=${sample.semantic_trigger}:${sample.semantic_reason_codes.join("+")}, quality=${sample.quality_score}, report=${sample.base_report_path}`)
      ]
      : ["- none"]),
    "",
    "## Clean False Positives",
    "",
    ...(result.clean_false_positive_samples.length
      ? result.clean_false_positive_samples.map((sample) => `- ${sample.sample_id}: reasons=${sample.semantic_reason_codes.join("+")}`)
      : ["- none"]),
    "",
    "## Notes",
    "",
    ...result.notes.map((note) => `- ${note}`)
  );

  return `${lines.join("\n")}\n`;
}

export async function writeRealL2SemanticPressureArtifacts({
  result,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join(DEFAULT_REAL_L2_SEMANTIC_OUT_DIR, `${stamp}-real-l2-semantic`));
  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "real-l2-semantic-pressure.json");
  const markdownPath = path.join(outputRoot, "real-l2-semantic-pressure.md");
  const samplesPath = path.join(outputRoot, "semantic-pressure-samples.jsonl");
  const basesPath = path.join(outputRoot, "selected-real-l2-bases.jsonl");
  const manifestPath = path.join(outputRoot, "input-manifest.json");

  const written = {
    ...result,
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      json_path: normalizePathForReport(repoRoot, jsonPath),
      markdown_path: normalizePathForReport(repoRoot, markdownPath),
      semantic_pressure_samples_path: normalizePathForReport(repoRoot, samplesPath),
      selected_real_l2_bases_path: normalizePathForReport(repoRoot, basesPath),
      input_manifest_path: normalizePathForReport(repoRoot, manifestPath)
    }
  };

  await fs.writeFile(jsonPath, JSON.stringify(written, null, 2), "utf8");
  await fs.writeFile(markdownPath, markdownForReport(written), "utf8");
  await writeJsonl(samplesPath, written.samples);
  await writeJsonl(basesPath, written.selected_base_tasks);
  await fs.writeFile(manifestPath, JSON.stringify({
    schema_version: "misa.real_l2_semantic_pressure_manifest.v1",
    created_at: written.created_at,
    ok: written.ok,
    needs_rule_review: written.needs_rule_review,
    input: written.input,
    safety: written.safety,
    boundary: written.boundary,
    summary: written.summary,
    output: written.output
  }, null, 2), "utf8");

  return written;
}

export async function runRealL2SemanticPressure({
  repoRoot = process.cwd(),
  runsDir = "runs",
  sourceProfile = DEFAULT_REAL_L2_SOURCE_PROFILE,
  l2ReportPaths,
  maxBase = 0,
  outDir,
  now = new Date()
} = {}) {
  const baseSelection = await collectRealL2GatePassedBases({
    repoRoot,
    runsDir,
    l2ReportPaths,
    sourceProfile,
    maxBase
  });
  const result = buildRealL2SemanticPressureReport({
    baseSelection,
    sourceProfile,
    repoRoot,
    now
  });
  return await writeRealL2SemanticPressureArtifacts({
    result,
    repoRoot,
    outDir,
    now
  });
}
