import fs from "node:fs/promises";
import path from "node:path";
import {
  collectL3FeedbackReflectionAllSamples,
  DEFAULT_L3_FEEDBACK_REFLECTION_POLICY,
  DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_OUT_DIR,
  evaluateReflectionSample,
  matchesReflectionPolicyScope
} from "./l3-feedback-reflection-replay.mjs";

export const DEFAULT_L3_FEEDBACK_REFLECTION_STRESS_OUT_DIR = DEFAULT_L3_FEEDBACK_REFLECTION_REPLAY_OUT_DIR;

const BAD_STATUSES = new Set([
  "exhausted_no_value",
  "exhausted_reviewable_hard_fail",
  "provider_error_failed_closed"
]);

const ACCEPTED_STATUSES = new Set([
  "accepted_first_try",
  "accepted_after_l3_recheck"
]);

export const L3_FEEDBACK_REFLECTION_STRESS_VARIANTS = Object.freeze([
  {
    name: "documented_strict",
    description: "Documented alpha scope: signal family, single candidate, medium risk, damping route, no-context floor.",
    options: {}
  },
  {
    name: "ignore_signal_family",
    description: "Same L1 route, but ignore signal_family. This tests whether keyword_risk_noise is doing real containment work.",
    options: { ignoreSignalFamily: true }
  },
  {
    name: "ignore_candidate_count",
    description: "Same signal route, but allow candidate_count other than 1. This tests whether the rule starts nagging multi-candidate rows.",
    options: { ignoreCandidateCount: true }
  },
  {
    name: "ignore_handoff_floor",
    description: "Same signal route, but allow any handoff floor. This tests whether the no-context boundary is necessary.",
    options: { ignoreHandoffFloor: true }
  },
  {
    name: "medium_damping_any_owner",
    description: "Medium+damping only, regardless of signal family, candidate mode, candidate count, or handoff floor.",
    match: (sample) => sample.risk_level === "medium" && sample.route_hint === "damping"
  },
  {
    name: "thinness_only_any_route",
    description: "No L1 route scope at all; only the thin-work-order shape. This is the deliberate over-broad attack variant.",
    match: () => true
  }
]);

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
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

function countBy(items, selector) {
  return Object.fromEntries(
    Object.entries(items.reduce((counts, item) => {
      const key = selector(item) ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})).sort(([left], [right]) => left.localeCompare(right))
  );
}

function isBad(sample) {
  return BAD_STATUSES.has(sample.l3_feedback_status);
}

function isCleanGood(sample) {
  return sample.l3_feedback_status === "accepted_first_try";
}

function isAccepted(sample) {
  return ACCEPTED_STATUSES.has(sample.l3_feedback_status);
}

function dedupeCount(samples, selector) {
  return new Set(samples.map(selector)).size;
}

function sampleBrief(sample, evaluation) {
  return {
    sample_id: sample.sample_id,
    source_id: sample.source_id,
    status: sample.l3_feedback_status,
    signal_family: sample.signal_family,
    risk_level: sample.risk_level,
    route_hint: sample.route_hint,
    l1_candidate_mode: sample.l1_candidate_mode,
    l1_handoff_floor: sample.l1_handoff_floor,
    candidate_count: sample.candidate_count,
    actionableTaskCount: sample.actionableTaskCount,
    weakTaskCount: sample.weakTaskCount,
    repeated_failure_shape: sample.repeated_failure_shape,
    actions: evaluation.actions,
    reasons: evaluation.reasons,
    source_file: sample.source_file,
    source_line: sample.source_line
  };
}

function evaluateScopedReflectionSample(sample, {
  scopeMatched,
  policy = DEFAULT_L3_FEEDBACK_REFLECTION_POLICY
} = {}) {
  if (!scopeMatched) {
    return {
      trigger: false,
      actions: [],
      reasons: []
    };
  }

  const thresholds = policy.thresholds ?? {};
  const actions = [];
  const reasons = [];
  const thinWorkOrder =
    sample.actionableTaskCount < thresholds.min_actionable_tasks
    || sample.weakTaskCount >= thresholds.min_weak_tasks_for_rewrite;
  const severeThinness =
    sample.weakTaskCount >= thresholds.min_weak_tasks_for_primary_agent
    || sample.actionableTaskCount <= thresholds.max_actionable_tasks_for_primary_agent
    || sample.repeated_failure_shape;
  const failed = isBad(sample);

  if (thinWorkOrder) {
    actions.push("rewrite_work_order_more_concrete");
    reasons.push(
      sample.actionableTaskCount < thresholds.min_actionable_tasks
        ? "actionable_task_count_below_min"
        : "weak_task_count_at_least_rewrite_threshold"
    );
  }
  if (thinWorkOrder && failed && Number(sample.candidate_count ?? 1) < 2) {
    actions.push("candidate_count_2");
    reasons.push("failed_thin_work_order_should_try_second_candidate");
  }
  if (failed && severeThinness) {
    actions.push("primary_agent_review_suggested");
    reasons.push(sample.repeated_failure_shape ? "repeated_failure_shape" : "severe_thinness");
  }

  return {
    trigger: actions.length > 0,
    actions: [...new Set(actions)],
    reasons: [...new Set(reasons)]
  };
}

function evaluateVariant(sample, variant, policy) {
  if (variant.name === "documented_strict") {
    return evaluateReflectionSample(sample, policy);
  }
  const scopeMatched = variant.match
    ? variant.match(sample)
    : matchesReflectionPolicyScope(sample, policy, variant.options ?? {});
  return evaluateScopedReflectionSample(sample, { scopeMatched, policy });
}

function variantSummary(samples, variant, policy, strictSampleIds, strictSourceIds) {
  const evaluated = samples.map((sample) => ({
    sample,
    evaluation: evaluateVariant(sample, variant, policy)
  }));
  const triggered = evaluated.filter((item) => item.evaluation.trigger);
  const badSamples = samples.filter(isBad);
  const badTriggered = triggered.filter((item) => isBad(item.sample));
  const cleanGoodTriggered = triggered.filter((item) => isCleanGood(item.sample));
  const acceptedTriggered = triggered.filter((item) => isAccepted(item.sample));
  const holdoutTriggered = triggered.filter((item) => !strictSampleIds.has(item.sample.sample_id));
  const sourceHoldoutTriggered = triggered.filter((item) => !strictSourceIds.has(item.sample.source_id));
  const sourceHoldoutGoodTriggered = sourceHoldoutTriggered.filter((item) => isCleanGood(item.sample));
  const badMisses = evaluated.filter((item) => isBad(item.sample) && !item.evaluation.trigger);

  return {
    name: variant.name,
    description: variant.description,
    trigger_count: triggered.length,
    unique_trigger_source_count: dedupeCount(triggered.map((item) => item.sample), (sample) => sample.source_id),
    bad_trigger_count: badTriggered.length,
    clean_good_false_positive_count: cleanGoodTriggered.length,
    accepted_trigger_count: acceptedTriggered.length,
    holdout_trigger_count: holdoutTriggered.length,
    source_holdout_trigger_count: sourceHoldoutTriggered.length,
    source_holdout_good_false_positive_count: sourceHoldoutGoodTriggered.length,
    precision_on_known_bad: triggered.length ? round(badTriggered.length / triggered.length) : 0,
    recall_on_known_bad: badSamples.length ? round(badTriggered.length / badSamples.length) : 0,
    trigger_status_counts: countBy(triggered, (item) => item.sample.l3_feedback_status),
    trigger_signal_family_counts: countBy(triggered, (item) => item.sample.signal_family),
    trigger_route_hint_counts: countBy(triggered, (item) => item.sample.route_hint),
    trigger_handoff_floor_counts: countBy(triggered, (item) => item.sample.l1_handoff_floor),
    trigger_action_counts: countBy(
      triggered.flatMap((item) => item.evaluation.actions),
      (action) => action
    ),
    top_clean_good_false_positives: cleanGoodTriggered
      .slice(0, 10)
      .map((item) => sampleBrief(item.sample, item.evaluation)),
    top_bad_misses: badMisses
      .slice(0, 10)
      .map((item) => sampleBrief(item.sample, item.evaluation))
  };
}

function topRepeatedFailures(samples, limit = 10) {
  return samples
    .filter((sample) => isBad(sample) && sample.repeated_failure_shape)
    .sort((left, right) => (
      Number(left.actionableTaskCount) - Number(right.actionableTaskCount)
      || Number(right.weakTaskCount) - Number(left.weakTaskCount)
      || left.source_id.localeCompare(right.source_id)
    ))
    .slice(0, limit)
    .map((sample) => sampleBrief(sample, evaluateReflectionSample(sample)));
}

function boundaryProbeFrom(sample, overrides, suffix) {
  return {
    ...sample,
    sample_id: `${sample.sample_id}::boundary_probe:${suffix}`,
    source_id: `${sample.source_id}::boundary_probe:${suffix}`,
    source_file: `${sample.source_file}#boundary-probe`,
    source_line: sample.source_line,
    l3_feedback_status: "accepted_first_try",
    status: "accepted_first_try",
    actionableTaskCount: 2,
    weakTaskCount: 3,
    repeated_failure_shape: false,
    violations: [],
    baseline_feedback: null,
    baseline_feedback_actions: [],
    baseline_feedback_present: false,
    recorded_feedback: null,
    recorded_feedback_present: false,
    current_feedback: null,
    current_feedback_actions: [],
    ...overrides
  };
}

function buildBoundaryProbes(samples, policy, limit = 25) {
  const cleanSeeds = samples
    .filter(isCleanGood)
    .slice(0, limit);
  return cleanSeeds.flatMap((sample) => [
    boundaryProbeFrom(sample, {
      signal_family: "counterfactual_other_signal",
      risk_level: policy.scope.risk_level,
      route_hint: policy.scope.route_hint,
      l1_candidate_mode: policy.scope.candidate_mode,
      l1_handoff_floor: policy.scope.handoff_floor,
      candidate_count: policy.scope.candidate_count
    }, "wrong-signal"),
    boundaryProbeFrom(sample, {
      signal_family: policy.scope.signal_family,
      risk_level: policy.scope.risk_level,
      route_hint: policy.scope.route_hint,
      l1_candidate_mode: policy.scope.candidate_mode,
      l1_handoff_floor: policy.scope.handoff_floor,
      candidate_count: 2
    }, "count2"),
    boundaryProbeFrom(sample, {
      signal_family: policy.scope.signal_family,
      risk_level: policy.scope.risk_level,
      route_hint: policy.scope.route_hint,
      l1_candidate_mode: policy.scope.candidate_mode,
      l1_handoff_floor: "primary_agent",
      candidate_count: policy.scope.candidate_count
    }, "primary-floor"),
    boundaryProbeFrom(sample, {
      signal_family: "counterfactual_other_signal",
      risk_level: "low",
      route_hint: "policy",
      l1_candidate_mode: "recheck",
      l1_handoff_floor: "primary_agent",
      candidate_count: 2
    }, "off-route")
  ]);
}

function boundaryProbeSummary(probes, variants, policy) {
  const variantProbeRows = variants.map((variant) => {
    const triggered = probes
      .map((sample) => ({ sample, evaluation: evaluateVariant(sample, variant, policy) }))
      .filter((item) => item.evaluation.trigger);
    return {
      name: variant.name,
      trigger_count: triggered.length,
      trigger_probe_kind_counts: countBy(triggered, (item) => item.sample.sample_id.split("::boundary_probe:").at(-1)),
      top_triggered_probes: triggered.slice(0, 10).map((item) => sampleBrief(item.sample, item.evaluation))
    };
  });
  const strict = variantProbeRows.find((row) => row.name === "documented_strict");
  const wideningTriggered = variantProbeRows
    .filter((row) => row.name !== "documented_strict")
    .reduce((sum, row) => sum + row.trigger_count, 0);
  return {
    probe_count: probes.length,
    strict_trigger_count: strict?.trigger_count ?? 0,
    widening_trigger_count: wideningTriggered,
    variants: variantProbeRows
  };
}

export function buildL3FeedbackReflectionStressReport({
  fullLibrary,
  repoRoot = process.cwd(),
  runsDir = "runs",
  now = new Date(),
  policy = DEFAULT_L3_FEEDBACK_REFLECTION_POLICY
} = {}) {
  if (!fullLibrary) throw new Error("fullLibrary is required");
  const samples = fullLibrary.samples ?? [];
  const strictSamples = samples.filter((sample) => matchesReflectionPolicyScope(sample, policy));
  const strictSampleIds = new Set(strictSamples.map((sample) => sample.sample_id));
  const strictSourceIds = new Set(strictSamples.map((sample) => sample.source_id));
  const holdoutSamples = samples.filter((sample) => !strictSampleIds.has(sample.sample_id));
  const sourceHoldoutSamples = samples.filter((sample) => !strictSourceIds.has(sample.source_id));
  const badSamples = samples.filter(isBad);
  const cleanGoodSamples = samples.filter(isCleanGood);
  const unknownStatusSamples = samples.filter((sample) => !sample.l3_feedback_status);
  const variants = L3_FEEDBACK_REFLECTION_STRESS_VARIANTS.map((variant) => (
    variantSummary(samples, variant, policy, strictSampleIds, strictSourceIds)
  ));
  const boundaryProbes = buildBoundaryProbes(samples, policy);
  const boundaryProbesResult = boundaryProbeSummary(boundaryProbes, L3_FEEDBACK_REFLECTION_STRESS_VARIANTS, policy);
  const strict = variants.find((variant) => variant.name === "documented_strict");
  const overBroad = variants.find((variant) => variant.name === "thinness_only_any_route");
  const strictSeedBad = strictSamples.filter(isBad);
  const strictSeedGood = strictSamples.filter(isCleanGood);
  const wideningRisk = variants
    .filter((variant) => variant.name !== "documented_strict")
    .filter((variant) => (
      variant.clean_good_false_positive_count > 0
      || variant.source_holdout_good_false_positive_count > 0
      || variant.holdout_trigger_count > 0
      || variant.precision_on_known_bad < 1
    ))
    .map((variant) => ({
      name: variant.name,
      clean_good_false_positive_count: variant.clean_good_false_positive_count,
      source_holdout_good_false_positive_count: variant.source_holdout_good_false_positive_count,
      holdout_trigger_count: variant.holdout_trigger_count,
      trigger_count: variant.trigger_count,
      precision_on_known_bad: variant.precision_on_known_bad
    }));

  const ok = Boolean(strict)
    && strictSeedBad.length > 0
    && strict.clean_good_false_positive_count === 0
    && strict.bad_trigger_count === strictSeedBad.length
    && strict.holdout_trigger_count === 0
    && overBroad
    && overBroad.holdout_trigger_count > 0
    && boundaryProbesResult.strict_trigger_count === 0
    && boundaryProbesResult.widening_trigger_count > 0;

  return {
    schema_version: "misa.l3_feedback_reflection_stress.v1",
    mode: "l3-feedback-reflection-stress",
    ok,
    created_at: now.toISOString(),
    input: {
      runs_dir: normalizePathForReport(repoRoot, resolvePath(repoRoot, runsDir)),
      full_library_sample_count: samples.length,
      scanned_pool_decisions_file_count: fullLibrary.input?.scanned_pool_decisions_file_count ?? null,
      scanned_row_count: fullLibrary.input?.scanned_row_count ?? null
    },
    policy,
    summary: {
      full_sample_count: samples.length,
      unique_source_id_count: dedupeCount(samples, (sample) => sample.source_id),
      strict_seed_sample_count: strictSamples.length,
      strict_seed_unique_source_count: dedupeCount(strictSamples, (sample) => sample.source_id),
      strict_seed_bad_count: strictSeedBad.length,
      strict_seed_clean_good_count: strictSeedGood.length,
      holdout_sample_count: holdoutSamples.length,
      source_holdout_sample_count: sourceHoldoutSamples.length,
      known_bad_count: badSamples.length,
      clean_good_count: cleanGoodSamples.length,
      unknown_status_count: unknownStatusSamples.length,
      documented_strict_trigger_count: strict?.trigger_count ?? 0,
      documented_strict_clean_good_false_positive_count: strict?.clean_good_false_positive_count ?? 0,
      documented_strict_holdout_trigger_count: strict?.holdout_trigger_count ?? 0,
      documented_strict_recall_on_seed_bad: strictSeedBad.length
        ? round((strict?.bad_trigger_count ?? 0) / strictSeedBad.length)
        : 0,
      documented_strict_recall_on_all_known_bad: strict?.recall_on_known_bad ?? 0,
      over_broad_clean_good_false_positive_count: overBroad?.clean_good_false_positive_count ?? 0,
      over_broad_holdout_trigger_count: overBroad?.holdout_trigger_count ?? 0,
      over_broad_precision_on_known_bad: overBroad?.precision_on_known_bad ?? 0,
      boundary_probe_count: boundaryProbesResult.probe_count,
      strict_boundary_probe_trigger_count: boundaryProbesResult.strict_trigger_count,
      widening_boundary_probe_trigger_count: boundaryProbesResult.widening_trigger_count,
      widening_risk_variant_count: wideningRisk.length,
      l1_promotion_recommendation: strictSeedBad.length >= 5 && wideningRisk.length === 0
        ? "eligible_for_l1_shadow_review"
        : "keep_shadow_collect_more_holdout_before_l1_strategy"
    },
    dimensions: {
      all_status_counts: countBy(samples, (sample) => sample.l3_feedback_status),
      all_signal_family_counts: countBy(samples, (sample) => sample.signal_family),
      all_risk_level_counts: countBy(samples, (sample) => sample.risk_level),
      all_route_hint_counts: countBy(samples, (sample) => sample.route_hint),
      all_candidate_mode_counts: countBy(samples, (sample) => sample.l1_candidate_mode),
      all_handoff_floor_counts: countBy(samples, (sample) => sample.l1_handoff_floor),
      strict_seed_status_counts: countBy(strictSamples, (sample) => sample.l3_feedback_status),
      strict_seed_violation_counts: countBy(strictSamples.flatMap((sample) => sample.violations), (violation) => violation),
      known_bad_route_hint_counts: countBy(badSamples, (sample) => sample.route_hint),
      known_bad_handoff_floor_counts: countBy(badSamples, (sample) => sample.l1_handoff_floor)
    },
    variants,
    boundary_probes: boundaryProbesResult,
    widening_risk: wideningRisk,
    top_repeated_failures: topRepeatedFailures(samples),
    notes: [
      "This stress pass stays local and only replays historical pool-decisions.jsonl rows.",
      "documented_strict is the candidate rule as documented; wider variants are attack tests, not proposed policies.",
      "A pass here means the candidate survived local holdout pressure, not that it is ready to mutate L1 automatically."
    ]
  };
}

export function renderL3FeedbackReflectionStressMarkdown(result) {
  const summary = result.summary;
  const lines = [
    "# L3 Feedback Reflection Stress",
    "",
    "## Summary",
    "",
    `- ok: ${result.ok}`,
    `- full_sample_count: ${summary.full_sample_count}`,
    `- unique_source_id_count: ${summary.unique_source_id_count}`,
    `- strict_seed_sample_count: ${summary.strict_seed_sample_count}`,
    `- strict_seed_bad_count: ${summary.strict_seed_bad_count}`,
    `- strict_seed_clean_good_count: ${summary.strict_seed_clean_good_count}`,
    `- holdout_sample_count: ${summary.holdout_sample_count}`,
    `- source_holdout_sample_count: ${summary.source_holdout_sample_count}`,
    `- known_bad_count: ${summary.known_bad_count}`,
    `- clean_good_count: ${summary.clean_good_count}`,
    `- unknown_status_count: ${summary.unknown_status_count}`,
    `- documented_strict_trigger_count: ${summary.documented_strict_trigger_count}`,
    `- documented_strict_clean_good_false_positive_count: ${summary.documented_strict_clean_good_false_positive_count}`,
    `- documented_strict_holdout_trigger_count: ${summary.documented_strict_holdout_trigger_count}`,
    `- documented_strict_recall_on_seed_bad: ${summary.documented_strict_recall_on_seed_bad}`,
    `- documented_strict_recall_on_all_known_bad: ${summary.documented_strict_recall_on_all_known_bad}`,
    `- over_broad_clean_good_false_positive_count: ${summary.over_broad_clean_good_false_positive_count}`,
    `- over_broad_holdout_trigger_count: ${summary.over_broad_holdout_trigger_count}`,
    `- over_broad_precision_on_known_bad: ${summary.over_broad_precision_on_known_bad}`,
    `- boundary_probe_count: ${summary.boundary_probe_count}`,
    `- strict_boundary_probe_trigger_count: ${summary.strict_boundary_probe_trigger_count}`,
    `- widening_boundary_probe_trigger_count: ${summary.widening_boundary_probe_trigger_count}`,
    `- widening_risk_variant_count: ${summary.widening_risk_variant_count}`,
    `- l1_promotion_recommendation: ${summary.l1_promotion_recommendation}`,
    "",
    "## Variant Stress",
    "",
    ...result.variants.map((variant) => (
      `- ${variant.name}: triggers=${variant.trigger_count}, bad=${variant.bad_trigger_count}, clean_good_false_positive=${variant.clean_good_false_positive_count}, holdout_triggers=${variant.holdout_trigger_count}, precision=${variant.precision_on_known_bad}, recall_all_bad=${variant.recall_on_known_bad}`
    )),
    "",
    "## Widening Risk",
    "",
    ...(
      result.widening_risk.length
        ? result.widening_risk.map((variant) => (
          `- ${variant.name}: clean_good_false_positive=${variant.clean_good_false_positive_count}, source_holdout_good_false_positive=${variant.source_holdout_good_false_positive_count}, holdout_triggers=${variant.holdout_trigger_count}, triggers=${variant.trigger_count}, precision=${variant.precision_on_known_bad}`
        ))
        : ["- none"]
    ),
    "",
    "## Boundary Probes",
    "",
    `- probe_count: ${result.boundary_probes.probe_count}`,
    `- strict_trigger_count: ${result.boundary_probes.strict_trigger_count}`,
    `- widening_trigger_count: ${result.boundary_probes.widening_trigger_count}`,
    ...result.boundary_probes.variants.map((variant) => (
      `- ${variant.name}: trigger_count=${variant.trigger_count}, probe_kinds=${JSON.stringify(variant.trigger_probe_kind_counts)}`
    )),
    "",
    "## Dimensions",
    "",
    `- all_status_counts: ${JSON.stringify(result.dimensions.all_status_counts)}`,
    `- all_signal_family_counts: ${JSON.stringify(result.dimensions.all_signal_family_counts)}`,
    `- all_route_hint_counts: ${JSON.stringify(result.dimensions.all_route_hint_counts)}`,
    `- all_handoff_floor_counts: ${JSON.stringify(result.dimensions.all_handoff_floor_counts)}`,
    `- strict_seed_status_counts: ${JSON.stringify(result.dimensions.strict_seed_status_counts)}`,
    `- known_bad_route_hint_counts: ${JSON.stringify(result.dimensions.known_bad_route_hint_counts)}`,
    "",
    "## Top Repeated Failures",
    "",
    ...(
      result.top_repeated_failures.length
        ? result.top_repeated_failures.map((sample) => (
          `- ${sample.source_id}: status=${sample.status}, route=${sample.route_hint}, floor=${sample.l1_handoff_floor}, actionable=${sample.actionableTaskCount}, weak=${sample.weakTaskCount}, actions=${sample.actions.join(",") || "none"}`
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

export async function writeL3FeedbackReflectionStressArtifacts({
  repoRoot = process.cwd(),
  fullLibrary,
  result,
  outDir,
  now = new Date()
} = {}) {
  if (!fullLibrary) throw new Error("fullLibrary is required");
  if (!result) throw new Error("result is required");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join(DEFAULT_L3_FEEDBACK_REFLECTION_STRESS_OUT_DIR, `${stamp}-reflection-stress`));
  await fs.mkdir(outputRoot, { recursive: true });

  const libraryJsonlPath = path.join(outputRoot, "l3-feedback-reflection-full-library.jsonl");
  const stressJsonPath = path.join(outputRoot, "l3-feedback-reflection-stress.json");
  const stressMarkdownPath = path.join(outputRoot, "l3-feedback-reflection-stress.md");
  const manifestPath = path.join(outputRoot, "input-manifest.json");
  const written = {
    ...result,
    output: {
      output_dir: normalizePathForReport(repoRoot, outputRoot),
      input_manifest_path: normalizePathForReport(repoRoot, manifestPath),
      full_library_jsonl_path: normalizePathForReport(repoRoot, libraryJsonlPath),
      stress_json_path: normalizePathForReport(repoRoot, stressJsonPath),
      stress_markdown_path: normalizePathForReport(repoRoot, stressMarkdownPath)
    }
  };
  const manifest = {
    schema_version: "misa.l3_feedback_reflection_stress_manifest.v1",
    created_at: result.created_at,
    input: result.input,
    policy: result.policy,
    summary: result.summary
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(
    libraryJsonlPath,
    fullLibrary.samples.map((sample) => JSON.stringify(sample)).join("\n") + "\n",
    "utf8"
  );
  await fs.writeFile(stressJsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(stressMarkdownPath, renderL3FeedbackReflectionStressMarkdown(written), "utf8");
  return written;
}

export async function runL3FeedbackReflectionStress({
  repoRoot = process.cwd(),
  runsDir = "runs",
  outDir,
  now = new Date()
} = {}) {
  const fullLibrary = await collectL3FeedbackReflectionAllSamples({ repoRoot, runsDir });
  const result = buildL3FeedbackReflectionStressReport({
    fullLibrary,
    repoRoot,
    runsDir,
    now
  });
  return writeL3FeedbackReflectionStressArtifacts({
    repoRoot,
    fullLibrary,
    result,
    outDir,
    now
  });
}
