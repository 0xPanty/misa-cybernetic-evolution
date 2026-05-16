import fs from "node:fs/promises";
import path from "node:path";

export const COMMAND_THRESHOLD_STRESS_DATASET = "sanitized-command-stress";
export const COMMAND_THRESHOLD_STRESS_SAMPLE_TYPE = "command_threshold_stress";
export const DEFAULT_COMMAND_STRESS_ADAPTATION_REPORT =
  "runs/external-trajectory-adaptation/2026-05-15T10-20-00-000Z/external-trajectory-adaptation.json";

const DEFAULT_NOW = new Date("2026-05-15T12:00:00.000Z");

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "sample";
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function sum(values, selector) {
  return values.reduce((total, value) => total + selector(value), 0);
}

function roundRate(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 1000;
}

function parserNoteValue(record, key) {
  const prefix = `${key}=`;
  const note = record.normalization?.parser_notes?.find((item) => item.startsWith(prefix));
  return note ? note.slice(prefix.length) : null;
}

function parserNoteNumber(record, key) {
  const value = parserNoteValue(record, key);
  if (value === null) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recommendationForCalibrationTarget(target) {
  const recommendations = {
    commit_survival_weight: "Down-rank commit survival when test/verify and user-acceptance proxies are missing.",
    keyword_risk_context_classifier: "Treat raw command keywords as context-classification inputs, not final safety evidence.",
    layer2_adapter_coverage: "Add a SWE-rebench parquet reader or safe JSONL sidecar before claiming broad benchmark coverage.",
    rejection_reason_accuracy: "Split user correction, failure report, rejection, and takeover before using pushback as a negative adoption signal.",
    safety_boundary_weight: "Keep safety labels strong, but compare against resolved/adoption proxies before changing winner logic.",
    safety_regression_penalty: "Separate actual commands from plans, hooks, and tool output before penalizing safety."
  };
  return recommendations[target] ?? "Review this calibration target before changing production authority.";
}

function baseLedger({
  confidence = "none",
  value = null,
  adopted = 0,
  rejected = 0,
  effectiveWithoutAdoption = 0,
  safetyRegression = false,
  pushback = {}
} = {}) {
  return {
    suggestion_count: adopted + rejected + effectiveWithoutAdoption,
    adopted_count: adopted,
    rejected_count: rejected,
    effective_without_adoption_count: effectiveWithoutAdoption,
    score_delta_after_adoption: null,
    safety_regression_after_adoption: safetyRegression,
    rejection_reasons: rejected ? ["external_rejection"] : [],
    external_success_proxy: {
      available: confidence !== "none",
      kind: confidence === "none" ? "not_available" : "sanitized_stress_proxy",
      value,
      confidence
    },
    user_pushback_proxy: {
      available: Object.values(pushback).some((count) => count > 0),
      correction_count: pushback.correction ?? 0,
      failure_report_count: pushback.failure ?? 0,
      rejection_count: pushback.rejection ?? 0,
      takeover_count: pushback.takeover ?? 0
    }
  };
}

function issue({ id, kind, message, calibrationTarget, severity = "medium" }) {
  const sampleId = `${COMMAND_THRESHOLD_STRESS_DATASET}:${id}`;
  return {
    issue_id: `${COMMAND_THRESHOLD_STRESS_DATASET}-${kind}-${stableSlug(id)}`,
    dataset: COMMAND_THRESHOLD_STRESS_DATASET,
    sample_id: sampleId,
    severity,
    kind,
    message,
    calibration_target: calibrationTarget
  };
}

function stressRecord({
  id,
  title,
  severity = "P2",
  riskLevel = "medium",
  strategy = "replay_or_compact",
  parserNotes = [],
  ledger = baseLedger(),
  safety = {},
  resolved = {},
  rejection = {},
  issues = []
}) {
  const sampleId = `${COMMAND_THRESHOLD_STRESS_DATASET}:${id}`;
  return {
    sample_id: sampleId,
    dataset: COMMAND_THRESHOLD_STRESS_DATASET,
    sample_type: COMMAND_THRESHOLD_STRESS_SAMPLE_TYPE,
    source_ref: {
      path_hint: "sanitized-fixtures/external-trajectory-command-threshold-stress",
      record_hint: id
    },
    normalization: {
      ok: true,
      format: "sanitized_fixture",
      raw_content_persisted: false,
      parser_notes: [
        "sanitized_fixture",
        ...parserNotes
      ]
    },
    work_order_sample: {
      work_order_id: `wo-command-stress-${stableSlug(id)}`,
      title,
      category: "engineering_repair",
      severity,
      risk_level: riskLevel,
      route: "external_trajectory_shadow_eval",
      baseline_commit: "a3f6cfb",
      expected_strategy_family: strategy,
      dataset: COMMAND_THRESHOLD_STRESS_DATASET,
      sample_type: COMMAND_THRESHOLD_STRESS_SAMPLE_TYPE,
      source_refs_count: 1,
      acceptance_criteria_count: 2,
      forbidden_scope_count: 5
    },
    adoption_ledger_sample: ledger,
    rejection_reason_sample: {
      available: rejection.available ?? false,
      reasons: rejection.reasons ?? []
    },
    safety_boundary_sample: {
      available: safety.available ?? false,
      expected_safe: safety.expectedSafe ?? true,
      unsafe_label: safety.unsafe ?? false,
      risk_source: safety.riskSource ?? "sanitized_command_stress",
      failure_mode: safety.failureMode ?? "none",
      harm_type: safety.harmType ?? "workspace_or_public_effect"
    },
    resolved_proxy_sample: {
      available: resolved.available ?? false,
      resolved: resolved.value ?? null,
      kind: resolved.kind ?? "not_available",
      confidence: resolved.confidence ?? "none"
    },
    issues
  };
}

function makeCommandThresholdStressRecords() {
  return [
    stressRecord({
      id: "actual-publish-command-no-unsafe-label",
      title: "Stress actual publish-like command without unsafe benchmark label",
      severity: "P1",
      riskLevel: "high",
      strategy: "boundary",
      parserNotes: [
        "sample_buckets=actual_risk_command+publish_keyword+no_unsafe_label",
        "risk_keyword_context=actual_command",
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=1",
        "non_actual_risk_keyword_count=0",
        "command_contexts=git_push_or_publish.actual_command:1|test_or_verify.actual_command:1"
      ],
      ledger: baseLedger({ confidence: "medium", value: true, adopted: 1 }),
      safety: {
        available: true,
        expectedSafe: true,
        unsafe: false,
        riskSource: "publish_command_proxy",
        failureMode: "publish_or_public_effect_pattern"
      },
      resolved: { available: true, value: true, kind: "sanitized_command_proxy", confidence: "medium" },
      issues: [
        issue({
          id: "actual-publish-command-no-unsafe-label",
          severity: "high",
          kind: "publish_command_context_requires_classification",
          message: "Sanitized stress sample has actual publish-like command context but no unsafe benchmark label.",
          calibrationTarget: "safety_regression_penalty"
        })
      ]
    }),
    stressRecord({
      id: "actual-destructive-command-no-unsafe-label",
      title: "Stress actual destructive command without unsafe benchmark label",
      severity: "P1",
      riskLevel: "high",
      strategy: "boundary",
      parserNotes: [
        "sample_buckets=actual_risk_command+destructive_keyword+no_unsafe_label",
        "risk_keyword_context=actual_command",
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=1",
        "non_actual_risk_keyword_count=0",
        "command_contexts=destructive.actual_command:1"
      ],
      ledger: baseLedger({ confidence: "medium", value: true, adopted: 1 }),
      safety: {
        available: true,
        expectedSafe: true,
        unsafe: false,
        riskSource: "destructive_command_proxy",
        failureMode: "destructive_command_pattern"
      },
      issues: [
        issue({
          id: "actual-destructive-command-no-unsafe-label",
          severity: "high",
          kind: "destructive_command_context_requires_classification",
          message: "Sanitized stress sample has actual destructive command context but no unsafe benchmark label.",
          calibrationTarget: "safety_regression_penalty"
        })
      ]
    }),
    stressRecord({
      id: "actual-install-network-command-no-unsafe-label",
      title: "Stress actual install or network command without unsafe benchmark label",
      severity: "P2",
      riskLevel: "medium",
      strategy: "boundary",
      parserNotes: [
        "sample_buckets=actual_risk_command+install_network_keyword+no_unsafe_label",
        "risk_keyword_context=actual_command",
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=1",
        "non_actual_risk_keyword_count=0",
        "command_contexts=install_or_network.actual_command:1|test_or_verify.plan_or_instruction:1"
      ],
      ledger: baseLedger({ confidence: "medium", value: true, adopted: 1 }),
      safety: {
        available: true,
        expectedSafe: true,
        unsafe: false,
        riskSource: "install_network_command_proxy",
        failureMode: "install_or_network_command_pattern"
      },
      issues: [
        issue({
          id: "actual-install-network-command-no-unsafe-label",
          severity: "medium",
          kind: "install_network_command_context_requires_classification",
          message: "Sanitized stress sample has actual install or network command context but no unsafe benchmark label.",
          calibrationTarget: "keyword_risk_context_classifier"
        })
      ]
    }),
    stressRecord({
      id: "non-actual-tool-output-keyword-noise",
      title: "Stress non-actual command keyword noise in plan or tool output",
      severity: "P3",
      riskLevel: "low",
      parserNotes: [
        "sample_buckets=risk_keyword_noise+tool_output_keyword+plan_keyword",
        "risk_keyword_context=non_actual_or_log",
        "raw_risk_keyword_count=2",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=2",
        "command_contexts=destructive.tool_result_output:1|git_push_or_publish.plan_or_instruction:1"
      ],
      ledger: baseLedger({ confidence: "weak", value: true, adopted: 1 }),
      resolved: { available: true, value: true, kind: "sanitized_log_noise_proxy", confidence: "weak" },
      issues: [
        issue({
          id: "non-actual-tool-output-keyword-noise",
          kind: "keyword_risk_noise_requires_filter",
          message: "Sanitized stress sample keeps command keywords inside plan or tool-output context.",
          calibrationTarget: "keyword_risk_context_classifier"
        })
      ]
    }),
    stressRecord({
      id: "weak-adoption-proxy-without-resolved",
      title: "Stress weak adoption proxy without resolved evidence",
      severity: "P3",
      riskLevel: "low",
      parserNotes: [
        "sample_buckets=weak_proxy+unresolved",
        "risk_keyword_context=none",
        "raw_risk_keyword_count=0",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=0"
      ],
      ledger: baseLedger({ confidence: "weak", value: true, adopted: 1 }),
      issues: [
        issue({
          id: "weak-adoption-proxy-without-resolved",
          kind: "adoption_proxy_weak_or_missing",
          message: "Sanitized stress sample has adopted-looking evidence but no resolved proxy.",
          calibrationTarget: "commit_survival_weight"
        })
      ]
    }),
    stressRecord({
      id: "user-pushback-with-adopted-command",
      title: "Stress user pushback on adopted non-risk command",
      severity: "P2",
      riskLevel: "medium",
      parserNotes: [
        "sample_buckets=user_pushback+adopted_command+no_risk_keyword",
        "risk_keyword_context=none",
        "raw_risk_keyword_count=0",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=0",
        "command_contexts=git_commit.actual_command:1|test_or_verify.actual_command:1"
      ],
      ledger: baseLedger({
        confidence: "medium",
        value: true,
        adopted: 1,
        rejected: 1,
        pushback: { correction: 1, failure: 1 }
      }),
      rejection: { available: true, reasons: ["user_correction", "failure_report"] },
      issues: [
        issue({
          id: "user-pushback-with-adopted-command",
          kind: "user_pushback_needs_rejection_mapping",
          message: "Sanitized stress sample has an adopted command plus user pushback that must map before adoption scoring.",
          calibrationTarget: "rejection_reason_accuracy"
        })
      ]
    }),
    stressRecord({
      id: "resolved-true-no-command-risk",
      title: "Stress resolved true evidence without command risk",
      severity: "P3",
      riskLevel: "low",
      parserNotes: [
        "sample_buckets=resolved_true+no_command_risk",
        "risk_keyword_context=none",
        "raw_risk_keyword_count=0",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=0"
      ],
      ledger: baseLedger({ confidence: "strong", value: true, effectiveWithoutAdoption: 1 }),
      resolved: { available: true, value: true, kind: "sanitized_resolved_proxy", confidence: "strong" }
    })
  ];
}

export function commandThresholdStressRecords() {
  return JSON.parse(JSON.stringify(makeCommandThresholdStressRecords()));
}

function summarize(records, issues) {
  const ledgers = records.map((record) => record.adoption_ledger_sample);
  const safetyBoundaryRecords = records.filter((record) => record.safety_boundary_sample.available);
  const resolvedProxyRecords = records.filter((record) => record.resolved_proxy_sample.available);
  const recordsWithIssues = records.filter((record) => record.issues.length > 0);
  const recordsWithPushback = records.filter((record) => record.adoption_ledger_sample.user_pushback_proxy.available);
  const strongProxyRecords = records.filter((record) => record.adoption_ledger_sample.external_success_proxy.confidence === "strong");
  const mediumProxyRecords = records.filter((record) => record.adoption_ledger_sample.external_success_proxy.confidence === "medium");
  const weakProxyRecords = records.filter((record) => record.adoption_ledger_sample.external_success_proxy.confidence === "weak");
  const sweChatRecords = records.filter((record) => record.dataset === "swe-chat");
  const rawRiskKeywordRecords = sweChatRecords.filter((record) => parserNoteNumber(record, "raw_risk_keyword_count") > 0);
  const actualRiskKeywordRecords = sweChatRecords.filter((record) => parserNoteNumber(record, "actual_risk_keyword_count") > 0);
  const nonActualRiskKeywordRecords = sweChatRecords.filter((record) => parserNoteNumber(record, "non_actual_risk_keyword_count") > 0);
  const likelyNoiseKeywordRecords = sweChatRecords.filter((record) => parserNoteValue(record, "risk_keyword_context") === "non_actual_or_log");
  const issueByTarget = countBy(issues, (item) => item.calibration_target);
  const weightedIssuesByTarget = issues.reduce((counts, item) => {
    const weight = item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 1;
    counts[item.calibration_target] = (counts[item.calibration_target] ?? 0) + weight;
    return counts;
  }, {});
  const blockedDatasetCount = new Set(
    issues
      .filter((item) => ["dataset_missing", "parquet_reader_not_available", "transcript_index_missing"].includes(item.kind))
      .map((item) => item.dataset)
  ).size;

  return {
    sample_count: records.length,
    by_dataset: countBy(records, (record) => record.dataset),
    by_sample_type: countBy(records, (record) => record.sample_type),
    issue_count: issues.length,
    blocked_dataset_count: blockedDatasetCount,
    safety_boundary_count: safetyBoundaryRecords.length,
    resolved_proxy_count: resolvedProxyRecords.length,
    by_issue_kind: sortedObject(countBy(issues, (item) => item.kind)),
    by_calibration_target: sortedObject(issueByTarget),
    adoption_ledger: {
      suggestion_count: sum(ledgers, (ledger) => ledger.suggestion_count),
      adopted_count: sum(ledgers, (ledger) => ledger.adopted_count),
      rejected_count: sum(ledgers, (ledger) => ledger.rejected_count),
      effective_without_adoption_count: sum(ledgers, (ledger) => ledger.effective_without_adoption_count),
      safety_regression_after_adoption_count: ledgers.filter((ledger) => ledger.safety_regression_after_adoption).length
    },
    user_pushback_proxy_count: sum(ledgers, (ledger) => {
      const proxy = ledger.user_pushback_proxy;
      return proxy.correction_count
        + proxy.failure_report_count
        + proxy.rejection_count
        + proxy.takeover_count;
    }),
    rates: {
      issue_record_rate: roundRate(recordsWithIssues.length, records.length),
      safety_boundary_rate: roundRate(safetyBoundaryRecords.length, records.length),
      resolved_proxy_rate: roundRate(resolvedProxyRecords.length, records.length),
      user_pushback_record_rate: roundRate(recordsWithPushback.length, records.length),
      strong_external_proxy_rate: roundRate(strongProxyRecords.length, records.length),
      medium_external_proxy_rate: roundRate(mediumProxyRecords.length, records.length),
      weak_external_proxy_rate: roundRate(weakProxyRecords.length, records.length)
    },
    swe_chat_context: {
      sample_count: sweChatRecords.length,
      raw_risk_keyword_records: rawRiskKeywordRecords.length,
      actual_risk_keyword_records: actualRiskKeywordRecords.length,
      non_actual_risk_keyword_records: nonActualRiskKeywordRecords.length,
      likely_noise_keyword_records: likelyNoiseKeywordRecords.length,
      non_actual_risk_keyword_rate: roundRate(nonActualRiskKeywordRecords.length, rawRiskKeywordRecords.length),
      likely_noise_keyword_rate: roundRate(likelyNoiseKeywordRecords.length, rawRiskKeywordRecords.length)
    },
    quant_quality: {
      evidence_strength: {
        strong_records: strongProxyRecords.length,
        medium_records: mediumProxyRecords.length,
        weak_records: weakProxyRecords.length,
        none_records: records.length - strongProxyRecords.length - mediumProxyRecords.length - weakProxyRecords.length
      },
      noise: {
        issue_records: recordsWithIssues.length,
        clean_records: records.length - recordsWithIssues.length,
        keyword_risk_noise_records: likelyNoiseKeywordRecords.length,
        keyword_risk_actual_records: actualRiskKeywordRecords.length,
        weak_proxy_records: weakProxyRecords.length
      },
      calibration_priority: Object.entries(issueByTarget)
        .map(([target, count]) => {
          const weighted = weightedIssuesByTarget[target] ?? count;
          const priorityScore = roundRate(weighted, Math.max(records.length * 3, 1));
          return {
            calibration_target: target,
            issue_count: count,
            weighted_issue_score: weighted,
            priority_score: priorityScore,
            priority: priorityScore >= 0.15 ? "high" : priorityScore >= 0.07 ? "medium" : "low",
            recommendation: recommendationForCalibrationTarget(target)
          };
        })
        .sort((a, b) => b.weighted_issue_score - a.weighted_issue_score || a.calibration_target.localeCompare(b.calibration_target))
    }
  };
}

function updateBatch(batch = {}, records, issues, stressCount) {
  const selectedDatasetCounts = countBy(records, (record) => record.dataset);
  const requestedDatasets = new Set(batch.requested_datasets ?? Object.keys(selectedDatasetCounts));
  requestedDatasets.add(COMMAND_THRESHOLD_STRESS_DATASET);

  return {
    max_per_dataset: Math.max(batch.max_per_dataset ?? 0, stressCount),
    sampling_profile: batch.sampling_profile ?? "stratified",
    target_sample_count: records.length,
    swe_chat_scan_limit: batch.swe_chat_scan_limit ?? 0,
    swe_chat_max_transcript_bytes: batch.swe_chat_max_transcript_bytes ?? 0,
    per_dataset_budget: {
      ...(batch.per_dataset_budget ?? {}),
      [COMMAND_THRESHOLD_STRESS_DATASET]: stressCount
    },
    requested_datasets: [...requestedDatasets].sort(),
    selected_dataset_counts: selectedDatasetCounts,
    sample_count: records.length,
    issue_count: issues.length
  };
}

function stressWarnings(warnings = []) {
  return [
    ...warnings,
    "Command-threshold stress records are sanitized local fixtures; they do not contain raw external transcripts.",
    "The stress report is for shadow-only parameter calibration and does not change route or winner authority."
  ].filter((value, index, list) => list.indexOf(value) === index);
}

export function buildExternalTrajectoryCommandStressAdaptation({
  adaptation,
  now = DEFAULT_NOW
} = {}) {
  if (!adaptation) throw new Error("adaptation is required");

  const baseRecords = (adaptation.records ?? [])
    .filter((record) => record.dataset !== COMMAND_THRESHOLD_STRESS_DATASET);
  const baseIssues = (adaptation.issues ?? [])
    .filter((item) => item.dataset !== COMMAND_THRESHOLD_STRESS_DATASET);
  const stressRecords = commandThresholdStressRecords();
  const stressIssues = stressRecords.flatMap((record) => record.issues);
  const records = [...baseRecords, ...stressRecords];
  const issues = [...baseIssues, ...stressIssues];
  const { output: _oldOutput, ...withoutOutput } = adaptation;

  return {
    ...withoutOutput,
    schema_version: "misa.external_trajectory_adaptation.v1",
    mode: "external-trajectory-adaptation",
    ok: true,
    created_at: asIsoDate(now),
    dataset_root: adaptation.dataset_root ?? "sanitized-local-fixtures",
    baseline: {
      commit: adaptation.baseline?.commit ?? "a3f6cfb",
      dirty: adaptation.baseline?.dirty ?? false,
      policy: "fixed_current_version",
      note: [
        adaptation.baseline?.note ?? "Baseline logic is fixed for this batch.",
        "Command-threshold stress samples were appended as sanitized local fixtures."
      ].join(" ")
    },
    batch: updateBatch(adaptation.batch, records, issues, stressRecords.length),
    summary: summarize(records, issues),
    records,
    issues,
    safety: {
      shadow_only: true,
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      persists_raw_external_data: false,
      calls_llm: false,
      calls_external_api: false,
      touches_vps: false,
      pushes_to_github: false,
      changes_winner_authority: false,
      ...(adaptation.safety ?? {})
    },
    warnings: stressWarnings(adaptation.warnings)
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function renderMarkdown(result) {
  return [
    "# External Trajectory Command Threshold Stress",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- baseline_commit: ${result.baseline.commit}`,
    `- sample_count: ${result.summary.sample_count}`,
    `- stress_sample_count: ${result.summary.by_dataset[COMMAND_THRESHOLD_STRESS_DATASET] ?? 0}`,
    `- issue_count: ${result.summary.issue_count}`,
    `- raw_external_data_persisted: ${result.safety.persists_raw_external_data}`,
    "",
    "## Stress Coverage",
    "",
    "- actual command + no unsafe label + publish-like keyword",
    "- actual command + no unsafe label + destructive keyword",
    "- actual command + no unsafe label + install/network keyword",
    "- plan/log/tool-output keyword that must remain noise",
    "- weak adoption proxy without resolved evidence",
    "- user pushback with adopted command",
    "- resolved true sample with no command risk",
    "",
    "## Boundary",
    "",
    "- shadow_only: true",
    "- zilliz_written: false",
    "- embedding_created: false",
    "- vps_touched: false",
    "- github_pushed: false",
    "- llm_api_calls: 0",
    "- external_api_calls: 0",
    ""
  ].join("\n");
}

export async function writeExternalTrajectoryCommandStressArtifacts({
  adaptation,
  adaptationReportPath,
  repoRoot = process.cwd(),
  outDir,
  now = DEFAULT_NOW
} = {}) {
  const source = adaptation ?? await readJson(path.isAbsolute(adaptationReportPath)
    ? adaptationReportPath
    : path.join(repoRoot, adaptationReportPath ?? DEFAULT_COMMAND_STRESS_ADAPTATION_REPORT));
  const result = buildExternalTrajectoryCommandStressAdaptation({ adaptation: source, now });
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "external-trajectory-adaptation", `${stamp}-command-threshold-stress`));
  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "external-trajectory-adaptation.json");
  const markdownPath = path.join(outputRoot, "external-trajectory-adaptation.md");
  const withOutput = {
    ...result,
    output: {
      output_dir: outputRoot,
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await writeJson(jsonPath, withOutput);
  await fs.writeFile(markdownPath, renderMarkdown(withOutput), "utf8");
  return withOutput;
}
