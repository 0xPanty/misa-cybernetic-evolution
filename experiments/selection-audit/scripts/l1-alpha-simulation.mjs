#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonOutFile } from "../../../scripts/lib/cli-output.mjs";
import {
  buildExternalTrajectoryOnlineShadowContractReport,
  renderExternalTrajectoryOnlineShadowContractMarkdown
} from "../../external-trajectory/lib/external-trajectory-online-shadow-contract.mjs";

const DEFAULT_NOW = new Date("2026-05-19T09:00:00.000Z");
const DEFAULT_OUT_DIR = "runs/l1-alpha-simulation";

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

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined).map(String).filter(Boolean))].sort();
}

function countBy(items, fn) {
  return Object.fromEntries(
    [...items.reduce((counts, item) => {
      const key = fn(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => String(left).localeCompare(String(right)))
  );
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator) : 0;
}

function slug(value) {
  return String(value ?? "unknown")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function sourceKindForDataset(dataset) {
  return `external_${String(dataset ?? "unknown").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function signalsForRecord(record) {
  const issues = record.issues ?? [];
  const issueKinds = issues.map((issue) => issue.kind);
  const calibrationTargets = issues.map((issue) => issue.calibration_target);
  const signals = [
    String(record.dataset ?? "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase(),
    record.sample_type,
    record.resolved_proxy_sample?.available ? `resolved_${Boolean(record.resolved_proxy_sample.resolved)}` : "resolved_unknown",
    record.rejection_reason_sample?.available ? "rejection_reason_available" : null,
    record.safety_boundary_sample?.available ? "safety_boundary_available" : null,
    record.safety_boundary_sample?.unsafe_label ? "unsafe_label" : null,
    ...issueKinds,
    ...calibrationTargets
  ];
  if (issueKinds.some((kind) => String(kind).includes("actual_command_context"))) {
    signals.push("actual_command_pattern", "swe_rebench_command_proxy");
  }
  if (issueKinds.some((kind) => String(kind).includes("keyword_risk_noise"))) {
    signals.push("none", "swe_rebench_sidecar");
  }
  return uniqueStrings(signals);
}

function routePressureForRecord(record) {
  const issueKinds = (record.issues ?? []).map((issue) => String(issue.kind ?? ""));
  const actualCommand = issueKinds.some((kind) => kind.includes("actual_command_context"));
  if (record.safety_boundary_sample?.available || actualCommand) {
    return { policy: 1, damping: 1 };
  }
  return { damping: 1 };
}

function priorityForRecord(record) {
  const issueKinds = (record.issues ?? []).map((issue) => String(issue.kind ?? ""));
  const actualCommand = issueKinds.some((kind) => kind.includes("actual_command_context"));
  if (record.safety_boundary_sample?.available || actualCommand) return 85;
  if (record.resolved_proxy_sample?.resolved === false) return 70;
  return 60;
}

function sourceRefsForRecord(record) {
  return uniqueStrings([
    record.source_ref?.path_hint,
    record.source_ref?.record_hint,
    ...(record.issues ?? []).map((issue) => issue.issue_id)
  ]);
}

export function buildPerceptionDigestFromAdaptation(adaptation, { now = DEFAULT_NOW } = {}) {
  const records = adaptation.records ?? [];
  const sourceRefs = records.map((record) => {
    const issueKinds = uniqueStrings((record.issues ?? []).map((issue) => issue.kind));
    const family = issueKinds.some((kind) => String(kind).includes("actual_command_context"))
      ? "safety_boundary"
      : "keyword_context_filter";
    return {
      source_id: record.sample_id,
      source_kind: sourceKindForDataset(record.dataset),
      source_refs: sourceRefsForRecord(record),
      observed_signals: signalsForRecord(record),
      route_pressure: routePressureForRecord(record),
      signal_fingerprint_id: record.sample_id,
      suggested_priority: priorityForRecord(record),
      authority: "hint_only",
      full_perception_holdout: {
        source_project: record.dataset,
        repo: record.source_ref?.record_hint ?? record.sample_id,
        time: null,
        task_family: record.sample_type
      },
      _signal_family: family
    };
  });

  return {
    schema_version: "misa.perception_digest.v1",
    digest_id: `l1-alpha-${slug(adaptation.batch?.sampling_profile ?? "sample")}-${records.length}`,
    mode: "shadow-perception-digest",
    generated_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    shadow_only: true,
    source_refs: sourceRefs.map(({ _signal_family, ...source }) => source),
    risk_hints: sourceRefs
      .filter((source) => source._signal_family === "safety_boundary")
      .map((source) => ({
        hint_id: `${slug(source.source_id)}-risk`,
        source_id: source.source_id,
        kind: "safety_boundary",
        level: "high",
        reason: "actual command or safety-boundary pressure should use conservative L1 routing",
        source_refs: source.source_refs,
        authority: "hint_only"
      })),
    novelty_hints: [],
    expected_review_value_hints: [],
    trace_continuity_hints: [],
    duplicate_clusters: [],
    signal_fingerprints: sourceRefs.map((source) => ({
      fingerprint_id: source.source_id,
      source_ids: [source.source_id],
      source_kind: source.source_kind,
      route: Object.keys(source.route_pressure)[0] ?? "damping",
      signal_family: source._signal_family,
      observed_signals: source.observed_signals,
      source_refs: source.source_refs,
      base_priority: source.suggested_priority,
      priority: source.suggested_priority,
      ledger_status: "new_signal",
      handled_status: "not_seen",
      handled_result: "none",
      seen_count: 1,
      new_evidence_refs: source.source_refs,
      priority_adjustment: 0,
      recommended_action: "send_to_qianxuesen",
      status_reason: "adaptation replay source for local L1 alpha simulation",
      authority: "hint_only"
    })),
    action_recommendations: [],
    ledger_update_proposals: [],
    summary: {
      source_count: records.length
    }
  };
}

function simulatedHandoffFloor(record) {
  const profile = record.l1_signal_profile ?? {};
  const text = [
    ...(profile.strategy_axes ?? []),
    ...(record.observed_signals ?? []),
    profile.route_hint,
    record.primary_route_pressure
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

function pickFirst(records, predicate, limit) {
  return records.filter(predicate).slice(0, limit).map((record) => record.source_id);
}

function buildProbeSet(records, limit = 20) {
  const buckets = [
    {
      bucket: "l1_recheck_policy_or_safety",
      reason: "tests whether candidate_count=2 helps high-risk safety-boundary samples",
      source_ids: pickFirst(records, (record) => (
        record.l1_signal_profile?.l2_candidate_mode === "recheck"
          && record.primary_route_pressure === "policy"
      ), 6)
    },
    {
      bucket: "light_single_damping_noise",
      reason: "tests whether L1 can keep noisy command-keyword samples cheap",
      source_ids: pickFirst(records, (record) => (
        record.l1_signal_profile?.l2_candidate_mode === "single"
          && record.primary_route_pressure === "damping"
      ), 6)
    },
    {
      bucket: "resolved_false_damping",
      reason: "tests whether resolved-false samples need conservative handoff without always using two candidates",
      source_ids: pickFirst(records, (record) => (
        record.observed_signals?.includes("resolved_false")
          && record.l1_signal_profile?.l2_candidate_mode !== "recheck"
      ), 4)
    },
    {
      bucket: "primary_agent_floor",
      reason: "tests whether conservative handoff catches durable-boundary language",
      source_ids: pickFirst(records, (record) => record.simulated_handoff_floor === "primary_agent", 4)
    }
  ];
  const selected = [];
  for (const bucket of buckets) {
    for (const sourceId of bucket.source_ids) {
      if (!selected.includes(sourceId) && selected.length < limit) selected.push(sourceId);
    }
  }
  return {
    limit,
    selected_source_ids: selected,
    buckets
  };
}

function summarizeAlpha(onlineShadow) {
  const records = (onlineShadow.online_shadow_records ?? []).map((record) => ({
    ...record,
    simulated_handoff_floor: simulatedHandoffFloor(record)
  }));
  const profiles = records.map((record) => record.l1_signal_profile ?? {});
  const eligible = records.filter((record) => record.l1_signal_profile?.l2_eligible);
  const candidate2 = records.filter((record) => Number(record.l1_signal_profile?.l2_candidate_count_hint ?? 0) >= 2);
  const primaryFloor = records.filter((record) => record.simulated_handoff_floor === "primary_agent");

  return {
    sample_count: records.length,
    l2_eligible_count: eligible.length,
    l2_eligible_rate: rate(eligible.length, records.length),
    l1_mode_counts: countBy(records, (record) => record.l1_signal_profile?.l2_candidate_mode ?? "unknown"),
    candidate_count_hint_counts: countBy(records, (record) => String(record.l1_signal_profile?.l2_candidate_count_hint ?? "unknown")),
    risk_level_counts: countBy(profiles, (profile) => profile.risk_level ?? "unknown"),
    route_hint_counts: countBy(profiles, (profile) => profile.route_hint ?? "unknown"),
    uncertainty_level_counts: countBy(profiles, (profile) => profile.uncertainty_level ?? "unknown"),
    evidence_density_counts: countBy(profiles, (profile) => profile.evidence_density ?? "unknown"),
    simulated_handoff_floor_counts: countBy(records, (record) => record.simulated_handoff_floor),
    candidate_count_2_alpha: {
      candidate_count_2_count: candidate2.length,
      candidate_count_2_rate: rate(candidate2.length, records.length),
      top_reason_counts: countBy(candidate2.flatMap((record) => record.l1_signal_profile?.l2_eligibility_reasons ?? []), (item) => item),
      recommendation: candidate2.length
        ? "Use candidate_count=2 only for L1 recheck/multi_pool or high-risk ambiguous samples; do not make it the global default."
        : "No candidate_count=2 pressure found in this batch."
    },
    handoff_floor_alpha: {
      primary_agent_count: primaryFloor.length,
      primary_agent_rate: rate(primaryFloor.length, records.length),
      top_signal_counts: countBy(primaryFloor.flatMap((record) => record.observed_signals ?? []), (item) => item),
      recommendation: primaryFloor.length
        ? "Use primary_agent floor for high-risk safety-boundary or durable-boundary language; keep cheap no-context handoff for low-risk damping noise."
        : "No primary-agent floor pressure found in this batch."
    },
    l3_failure_risk_hypothesis: {
      high_risk_recheck_count: records.filter((record) => (
        record.l1_signal_profile?.risk_level === "high"
          && record.l1_signal_profile?.l2_candidate_mode === "recheck"
      )).length,
      low_risk_single_count: records.filter((record) => (
        ["low", "medium"].includes(record.l1_signal_profile?.risk_level)
          && record.l1_signal_profile?.l2_candidate_mode === "single"
      )).length,
      recommendation: "Use the high-risk recheck bucket and light-single damping bucket as the same-batch Gemini A/B probe."
    },
    gemini_probe_set: buildProbeSet(records)
  };
}

function renderMarkdown(result) {
  const alpha = result.alpha_summary;
  const lines = [
    "# L1 Alpha Simulation",
    "",
    `- ok: ${result.ok}`,
    `- adaptation_report: ${result.input.adaptation_report}`,
    `- sample_count: ${alpha.sample_count}`,
    `- l2_eligible_count: ${alpha.l2_eligible_count}`,
    `- l2_eligible_rate: ${alpha.l2_eligible_rate}`,
    `- l1_mode_counts: ${JSON.stringify(alpha.l1_mode_counts)}`,
    `- candidate_count_hint_counts: ${JSON.stringify(alpha.candidate_count_hint_counts)}`,
    `- risk_level_counts: ${JSON.stringify(alpha.risk_level_counts)}`,
    `- uncertainty_level_counts: ${JSON.stringify(alpha.uncertainty_level_counts)}`,
    `- evidence_density_counts: ${JSON.stringify(alpha.evidence_density_counts)}`,
    `- simulated_handoff_floor_counts: ${JSON.stringify(alpha.simulated_handoff_floor_counts)}`,
    "",
    "## Alpha",
    "",
    `- candidate_count_2: count=${alpha.candidate_count_2_alpha.candidate_count_2_count}, rate=${alpha.candidate_count_2_alpha.candidate_count_2_rate}`,
    `- candidate_count_2_recommendation: ${alpha.candidate_count_2_alpha.recommendation}`,
    `- primary_agent_floor: count=${alpha.handoff_floor_alpha.primary_agent_count}, rate=${alpha.handoff_floor_alpha.primary_agent_rate}`,
    `- handoff_floor_recommendation: ${alpha.handoff_floor_alpha.recommendation}`,
    `- l3_failure_risk_recommendation: ${alpha.l3_failure_risk_hypothesis.recommendation}`,
    "",
    "## Gemini Probe Set",
    "",
    `- selected_source_ids: ${alpha.gemini_probe_set.selected_source_ids.join(", ")}`
  ];
  for (const bucket of alpha.gemini_probe_set.buckets) {
    lines.push(`- ${bucket.bucket}: ${bucket.source_ids.join(", ") || "none"}; ${bucket.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

async function writeArtifacts({ result, outDir }) {
  const outputRoot = path.resolve(outDir);
  await fs.mkdir(outputRoot, { recursive: true });
  const jsonPath = path.join(outputRoot, "l1-alpha-simulation.json");
  const markdownPath = path.join(outputRoot, "l1-alpha-simulation.md");
  const onlineShadowPath = path.join(outputRoot, "online-shadow-report.json");
  const perceptionDigestPath = path.join(outputRoot, "perception-digest.json");
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderMarkdown(result));
  await fs.writeFile(onlineShadowPath, `${JSON.stringify(result.online_shadow_report, null, 2)}\n`);
  await fs.writeFile(perceptionDigestPath, `${JSON.stringify(result.perception_digest, null, 2)}\n`);
  await fs.writeFile(path.join(outputRoot, "online-shadow-report.md"), renderExternalTrajectoryOnlineShadowContractMarkdown(result.online_shadow_report));
  return {
    ...result,
    output: {
      output_dir: outputRoot,
      json_path: jsonPath,
      markdown_path: markdownPath,
      online_shadow_path: onlineShadowPath,
      perception_digest_path: perceptionDigestPath
    }
  };
}

export async function buildL1AlphaSimulation({
  adaptationReportPath,
  now = DEFAULT_NOW
} = {}) {
  if (!adaptationReportPath) throw new Error("adaptationReportPath is required");
  const adaptation = await readJson(adaptationReportPath);
  const perceptionDigest = buildPerceptionDigestFromAdaptation(adaptation, { now });
  const onlineShadowReport = buildExternalTrajectoryOnlineShadowContractReport({
    perceptionDigest,
    perceptionDigestPath: `adaptation:${adaptationReportPath}`,
    now
  });
  const alphaSummary = summarizeAlpha(onlineShadowReport);
  return {
    schema_version: "misa.l1_alpha_simulation.v1",
    mode: "l1-alpha-simulation",
    ok: onlineShadowReport.ok,
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    input: {
      adaptation_report: adaptationReportPath,
      adaptation_sample_count: adaptation.summary?.sample_count ?? adaptation.records?.length ?? 0,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    alpha_summary: alphaSummary,
    perception_digest: perceptionDigest,
    online_shadow_report: onlineShadowReport,
    safety: {
      llm_api_calls: 0,
      external_api_calls: 0,
      writes_persistent_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      touches_vps: false,
      pushes_github: false
    }
  };
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : DEFAULT_NOW;
const adaptationReportPath = readArg("adaptation-report");
let result = await buildL1AlphaSimulation({ adaptationReportPath, now });

if (!hasArg("dry-run") && !hasArg("no-write")) {
  result = await writeArtifacts({
    result,
    outDir: readArg("out-dir") ?? path.join(DEFAULT_OUT_DIR, now.toISOString().replace(/[:.]/g, "-"))
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`l1-alpha-simulation ok=${result.ok}`);
  console.log(`samples=${result.alpha_summary.sample_count}`);
  console.log(`l2_eligible=${result.alpha_summary.l2_eligible_count}`);
  console.log(`l1_modes=${JSON.stringify(result.alpha_summary.l1_mode_counts)}`);
  console.log(`candidate_count_hints=${JSON.stringify(result.alpha_summary.candidate_count_hint_counts)}`);
  console.log(`handoff_floors=${JSON.stringify(result.alpha_summary.simulated_handoff_floor_counts)}`);
  console.log(`llm_api_calls=0`);
  console.log(`external_api_calls=0`);
  if (result.output) console.log(`output_dir=${result.output.output_dir}`);
}

process.exitCode = result.ok ? 0 : 1;
