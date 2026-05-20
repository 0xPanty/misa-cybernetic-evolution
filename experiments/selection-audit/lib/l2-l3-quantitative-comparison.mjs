import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASELINE_LABEL = "initial";

function round(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator) : 0;
}

function mean(values) {
  const numbers = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!numbers.length) return null;
  return round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function normalizeLabel(value) {
  return String(value || "run")
    .replace(/^\d+[-_]/, "")
    .replaceAll("-", "_")
    .trim();
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function sourceIdsForRun(l2Report, l3Report) {
  const ids = [
    ...(l2Report?.results ?? []).map((item) => item.source_id),
    ...(l3Report?.decisions ?? []).map((item) => item.source_id)
  ].filter(Boolean);
  return [...new Set(ids)];
}

function poolMetrics(decisions, pool) {
  const items = (decisions ?? []).filter((decision) => decision.pool === pool);
  return {
    count: items.length,
    avg_quality: mean(items.map((item) => item.quality_score)),
    min_quality: items.length ? round(Math.min(...items.map((item) => Number(item.quality_score ?? 0)))) : null,
    avg_actionable: mean(items.map((item) => item.actionableTaskCount)),
    avg_weak: mean(items.map((item) => item.weakTaskCount)),
    avg_specificity: mean(items.map((item) => item.specificityHits)),
    high_quality_count: items.filter((item) => Number(item.quality_score ?? 0) >= 0.9).length,
    sources: items.map((item) => item.source_id)
  };
}

function computeCandidateBestFound(l2Report) {
  const selections = (l2Report?.results ?? [])
    .map((item) => item.candidate_selection)
    .filter((selection) => selection && Array.isArray(selection.candidate_quality_scores));
  if (!selections.length) return null;
  return selections.filter((selection) => {
    const best = Math.max(...selection.candidate_quality_scores.map(Number));
    return Number(selection.winner_quality_score) === best;
  }).length;
}

function summarizeRun({ label, directory, l2Report, l3Report }) {
  const l2Summary = l2Report?.summary ?? {};
  const l3Summary = l3Report?.summary ?? {};
  const decisions = l3Report?.decisions ?? [];
  const poolCounts = l3Summary.pool_counts ?? {};
  const sampleCount = Number(l3Summary.sample_count ?? l2Summary.sample_count ?? decisions.length ?? 0);
  const requestedCandidateCount = Number(
    l2Summary.requested_candidate_count
      ?? l3Summary.requested_candidate_count
      ?? l2Report?.input?.requested_candidate_count
      ?? 1
  );
  const candidateCount = Number(
    l2Summary.candidate_count
      ?? l3Summary.candidate_count
      ?? (l2Report?.results ?? []).reduce((sum, item) => sum + (item.candidates?.length || 1), 0)
  );
  const candidateBestFoundCount = l3Summary.candidate_best_found_count ?? computeCandidateBestFound(l2Report);

  return {
    label: normalizeLabel(label),
    directory,
    sample_count: sampleCount,
    requested_candidate_count: requestedCandidateCount,
    candidate_count: candidateCount,
    llm_api_calls: Number(l3Summary.llm_api_calls ?? l2Summary.llm_api_calls ?? 0),
    provider_error_count: Number(l3Summary.provider_error_count ?? l2Summary.provider_error_count ?? 0),
    avg_quality_score: round(l3Summary.avg_quality_score ?? l2Summary.avg_quality_score ?? 0),
    hard_pass_count: Number(l3Summary.hard_gate_pass_count ?? l2Summary.passed_gate_count ?? poolCounts.green ?? 0),
    hard_fail_count: Number(l3Summary.hard_gate_fail_count ?? l2Summary.failed_gate_count ?? 0),
    green: Number(poolCounts.green ?? 0),
    yellow: Number(poolCounts.yellow ?? 0),
    red: Number(poolCounts.red ?? 0),
    l4_forward_count: Number(l3Summary.l4_forward_count ?? 0),
    red_spot_check_count: Number(l3Summary.red_spot_check_count ?? 0),
    possible_false_reject_count: Number(l3Summary.possible_false_reject_count ?? 0),
    low_quality_pass_count: Number(l3Summary.low_quality_pass_count ?? 0),
    violation_counts: l3Summary.violation_counts ?? {},
    candidate_best_found_count: candidateBestFoundCount,
    candidate_best_found_rate: candidateBestFoundCount === null ? null : rate(candidateBestFoundCount, sampleCount),
    candidate_avg_quality_score: l2Summary.avg_candidate_quality_score ?? null,
    pool_metrics: {
      green: poolMetrics(decisions, "green"),
      yellow: poolMetrics(decisions, "yellow"),
      red: poolMetrics(decisions, "red")
    },
    rates: {
      green: rate(poolCounts.green ?? 0, sampleCount),
      yellow: rate(poolCounts.yellow ?? 0, sampleCount),
      red: rate(poolCounts.red ?? 0, sampleCount),
      l4_forward: rate(l3Summary.l4_forward_count ?? 0, sampleCount),
      red_spot_check: rate(l3Summary.red_spot_check_count ?? 0, poolCounts.red ?? 0),
      possible_false_reject: rate(l3Summary.possible_false_reject_count ?? 0, sampleCount)
    },
    safety: {
      memory_writes: Number(l3Summary.memory_writes ?? l2Summary.memory_writes ?? 0),
      zilliz_writes: Number(l3Summary.zilliz_writes ?? l2Summary.zilliz_writes ?? 0),
      embedding_creations: Number(l3Summary.embedding_creations ?? l2Summary.embedding_creations ?? 0),
      route_changes: Number(l3Summary.route_changes ?? l2Summary.route_changes ?? 0),
      winner_changes: Number(l3Summary.winner_changes ?? l2Summary.winner_changes ?? 0),
      vps_touches: Number(l3Summary.vps_touches ?? l2Summary.vps_touches ?? 0),
      github_pushes: Number(l3Summary.github_pushes ?? l2Summary.github_pushes ?? 0),
      public_publishes: Number(l3Summary.public_publishes ?? l2Summary.public_publishes ?? 0)
    },
    source_ids: sourceIdsForRun(l2Report, l3Report),
    decisions_by_source: Object.fromEntries(decisions.map((decision) => [decision.source_id, {
      pool: decision.pool,
      quality_score: round(decision.quality_score),
      actionableTaskCount: decision.actionableTaskCount,
      weakTaskCount: decision.weakTaskCount,
      violations: decision.violations ?? []
    }]))
  };
}

function compareNumbers(run, baseline) {
  return {
    avg_quality_delta: round(run.avg_quality_score - baseline.avg_quality_score),
    green_delta: run.green - baseline.green,
    yellow_delta: run.yellow - baseline.yellow,
    red_delta: run.red - baseline.red,
    l4_forward_delta: run.l4_forward_count - baseline.l4_forward_count,
    candidate_count_delta: run.candidate_count - baseline.candidate_count,
    api_call_delta: run.llm_api_calls - baseline.llm_api_calls
  };
}

function defaultScore(run) {
  return [
    run.avg_quality_score,
    run.green,
    -run.red,
    -run.yellow,
    -run.l4_forward_count
  ];
}

function compareScore(left, right) {
  const leftScore = defaultScore(left);
  const rightScore = defaultScore(right);
  for (let index = 0; index < leftScore.length; index += 1) {
    if (leftScore[index] !== rightScore[index]) return rightScore[index] - leftScore[index];
  }
  return left.label.localeCompare(right.label);
}

function chooseBestDefault(runs) {
  const singleCandidateRuns = runs.filter((run) => run.requested_candidate_count <= 1);
  return [...(singleCandidateRuns.length ? singleCandidateRuns : runs)].sort(compareScore)[0] ?? null;
}

function sampleAlignment(runs) {
  const sets = runs.map((run) => new Set(run.source_ids));
  const union = [...new Set(runs.flatMap((run) => run.source_ids))].sort();
  const common = union.filter((id) => sets.every((set) => set.has(id)));
  return {
    aligned: common.length === union.length && runs.every((run) => run.source_ids.length === common.length),
    union_source_count: union.length,
    common_source_count: common.length,
    missing_by_run: Object.fromEntries(runs.map((run, index) => [
      run.label,
      union.filter((id) => !sets[index].has(id))
    ]))
  };
}

function buildPoolCalibration(runs) {
  return runs.map((run) => ({
    label: run.label,
    sample_count: run.sample_count,
    green_precision_proxy: {
      green_count: run.green,
      avg_quality: run.pool_metrics.green.avg_quality,
      low_quality_pass_count: run.low_quality_pass_count,
      low_quality_pass_rate: rate(run.low_quality_pass_count, run.green)
    },
    yellow_l4_load: {
      yellow_count: run.yellow,
      yellow_rate: run.rates.yellow,
      avg_quality: run.pool_metrics.yellow.avg_quality,
      possible_false_reject_count: run.possible_false_reject_count
    },
    red_spot_check: {
      red_count: run.red,
      red_rate: run.rates.red,
      avg_quality: run.pool_metrics.red.avg_quality,
      high_quality_red_count: run.pool_metrics.red.high_quality_count,
      red_spot_check_count: run.red_spot_check_count,
      red_spot_check_rate: run.rates.red_spot_check
    },
    l4_load: {
      l4_forward_count: run.l4_forward_count,
      l4_forward_rate: run.rates.l4_forward
    }
  }));
}

function buildCandidateMarginalAnalysis(runs, bestDefault) {
  if (!bestDefault) return [];
  return runs
    .filter((run) => run.requested_candidate_count > 1)
    .map((run) => {
      const commonSourceIds = run.source_ids.filter((sourceId) => bestDefault.decisions_by_source[sourceId]);
      const bySource = commonSourceIds.map((sourceId) => {
        const baseDecision = bestDefault.decisions_by_source[sourceId];
        const candidateDecision = run.decisions_by_source[sourceId];
        return {
          source_id: sourceId,
          default_pool: baseDecision.pool,
          candidate_pool: candidateDecision.pool,
          default_quality: baseDecision.quality_score,
          candidate_quality: candidateDecision.quality_score,
          quality_delta: round(candidateDecision.quality_score - baseDecision.quality_score)
        };
      });
      const deltas = compareNumbers(run, bestDefault);
      const defaultReady = deltas.avg_quality_delta > 0
        && deltas.green_delta >= 0
        && deltas.yellow_delta <= 0
        && deltas.red_delta <= 0
        && deltas.l4_forward_delta <= 0
        && deltas.api_call_delta <= 0;
      return {
        label: run.label,
        compared_to: bestDefault.label,
        requested_candidate_count: run.requested_candidate_count,
        candidate_best_found_count: run.candidate_best_found_count,
        candidate_best_found_rate: run.candidate_best_found_rate,
        deltas,
        default_ready: defaultReady,
        reason: defaultReady
          ? "multi-candidate beats the default on quality without increasing review or API load"
          : "keep explicit exploration mode until quality improves without increasing review or red load",
        by_source: bySource
      };
    });
}

function buildPromptComparison(runs, baseline) {
  return runs.map((run) => ({
    label: run.label,
    compared_to: baseline?.label ?? null,
    avg_quality_score: run.avg_quality_score,
    green: run.green,
    yellow: run.yellow,
    red: run.red,
    deltas: baseline ? compareNumbers(run, baseline) : null
  }));
}

function buildRecommendation({ runs, bestDefault, candidateMarginalAnalysis }) {
  const safetyClean = runs.every((run) => Object.values(run.safety).every((value) => value === 0));
  const candidateCountDefault = [...candidateMarginalAnalysis]
    .filter((item) => item.default_ready)
    .sort((left, right) => {
      const qualityDiff = right.deltas.avg_quality_delta - left.deltas.avg_quality_delta;
      if (qualityDiff) return qualityDiff;
      const greenDiff = right.deltas.green_delta - left.deltas.green_delta;
      if (greenDiff) return greenDiff;
      const redDiff = left.deltas.red_delta - right.deltas.red_delta;
      if (redDiff) return redDiff;
      return left.requested_candidate_count - right.requested_candidate_count;
    })[0] ?? null;
  const exploratory = candidateMarginalAnalysis
    .filter((item) => !item.default_ready)
    .map((item) => item.label);
  const multiCandidatePolicy = candidateCountDefault
    ? (exploratory.length
      ? "candidate_count_default_review_with_exploratory_modes"
      : "candidate_count_eligible_for_default_review")
    : (exploratory.length ? "explicit_recheck_mode_not_default" : "no_multi_candidate_runs");
  return {
    decision: "small_change_continue",
    single_candidate_default_run: bestDefault?.label ?? null,
    default_run: bestDefault?.label ?? null,
    default_reason: bestDefault
      ? `${bestDefault.label} is the strongest single-candidate default: avg_quality=${bestDefault.avg_quality_score}, green=${bestDefault.green}, red=${bestDefault.red}.`
      : "no default run available",
    candidate_count_default_run: candidateCountDefault?.label ?? null,
    candidate_count_default_reason: candidateCountDefault
      ? `${candidateCountDefault.label} improves quality by ${candidateCountDefault.deltas.avg_quality_delta} without increasing yellow, red, L4, or API load.`
      : "no candidate-count mode is default-ready yet",
    exploratory_modes: exploratory,
    keep_multi_candidate: candidateMarginalAnalysis.length > 0,
    multi_candidate_policy: multiCandidatePolicy,
    l4_policy: "review_yellow_first_then_spot_check_green_and_red",
    needs_l4_labels: true,
    missing_l4_metrics: [
      "green_acceptance_rate",
      "yellow_overturn_rate",
      "red_false_negative_rate"
    ],
    safety_clean: safetyClean
  };
}

export function buildL2L3QuantitativeComparison({ runs, baselineLabel = DEFAULT_BASELINE_LABEL, now = new Date() } = {}) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("runs are required");
  }
  const normalizedRuns = runs.map(summarizeRun);
  const baseline = normalizedRuns.find((run) => run.label === normalizeLabel(baselineLabel)) ?? normalizedRuns[0];
  const bestDefault = chooseBestDefault(normalizedRuns);
  const candidateMarginalAnalysis = buildCandidateMarginalAnalysis(normalizedRuns, bestDefault);
  const recommendation = buildRecommendation({
    runs: normalizedRuns,
    bestDefault,
    candidateMarginalAnalysis
  });

  return {
    schema_version: "misa.l2_l3_quantitative_comparison.v1",
    mode: "l2-l3-quantitative-comparison",
    ok: true,
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    baseline_label: baseline.label,
    sample_alignment: sampleAlignment(normalizedRuns),
    recommendation,
    run_summaries: normalizedRuns.map((run) => ({
      label: run.label,
      sample_count: run.sample_count,
      requested_candidate_count: run.requested_candidate_count,
      candidate_count: run.candidate_count,
      llm_api_calls: run.llm_api_calls,
      provider_error_count: run.provider_error_count,
      avg_quality_score: run.avg_quality_score,
      hard_pass_count: run.hard_pass_count,
      green: run.green,
      yellow: run.yellow,
      red: run.red,
      l4_forward_count: run.l4_forward_count,
      possible_false_reject_count: run.possible_false_reject_count,
      candidate_best_found_count: run.candidate_best_found_count,
      candidate_best_found_rate: run.candidate_best_found_rate,
      safety: run.safety
    })),
    prompt_version_comparison: buildPromptComparison(normalizedRuns, baseline),
    pool_calibration: buildPoolCalibration(normalizedRuns),
    candidate_marginal_analysis: candidateMarginalAnalysis,
    warnings: [
      "This is proxy calibration until L4 review labels are appended.",
      "Pool labels are not final authority.",
      "Multi-candidate modes should not become default unless they improve quality without expanding L4 load."
    ]
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((item) => item ?? "n/a").join(" | ")} |`)
  ].join("\n");
}

export function renderL2L3QuantitativeComparisonMarkdown(result) {
  const lines = [
    "# L2/L3 Quantitative Comparison",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- baseline_label: ${result.baseline_label}`,
    `- sample_alignment: ${result.sample_alignment.aligned}`,
    `- single_candidate_default_run: ${result.recommendation.single_candidate_default_run ?? result.recommendation.default_run}`,
    `- candidate_count_default_run: ${result.recommendation.candidate_count_default_run ?? "none"}`,
    `- decision: ${result.recommendation.decision}`,
    `- multi_candidate_policy: ${result.recommendation.multi_candidate_policy}`,
    `- l4_policy: ${result.recommendation.l4_policy}`,
    "",
    "## Run Summary",
    "",
    markdownTable(
      ["run", "avg_quality", "hard_pass", "green", "yellow", "red", "l4_forward", "candidates", "api_calls", "candidate_best_found"],
      result.run_summaries.map((run) => [
        run.label,
        run.avg_quality_score,
        `${run.hard_pass_count}/${run.sample_count}`,
        run.green,
        run.yellow,
        run.red,
        run.l4_forward_count,
        run.candidate_count,
        run.llm_api_calls,
        run.candidate_best_found_count ?? "n/a"
      ])
    ),
    "",
    "## Recommendation",
    "",
    `- single_candidate_default: ${result.recommendation.single_candidate_default_run ?? result.recommendation.default_run}`,
    `- single_candidate_reason: ${result.recommendation.default_reason}`,
    `- candidate_count_default: ${result.recommendation.candidate_count_default_run ?? "none"}`,
    `- candidate_count_reason: ${result.recommendation.candidate_count_default_reason}`,
    `- keep_multi_candidate: ${result.recommendation.keep_multi_candidate}`,
    `- exploratory_modes: ${result.recommendation.exploratory_modes.join(", ") || "none"}`,
    `- needs_l4_labels: ${result.recommendation.needs_l4_labels}`,
    "",
    "## Prompt Version Delta",
    "",
    markdownTable(
      ["run", "avg_quality", "quality_delta", "green_delta", "yellow_delta", "red_delta", "l4_delta"],
      result.prompt_version_comparison.map((item) => [
        item.label,
        item.avg_quality_score,
        item.deltas?.avg_quality_delta ?? "n/a",
        item.deltas?.green_delta ?? "n/a",
        item.deltas?.yellow_delta ?? "n/a",
        item.deltas?.red_delta ?? "n/a",
        item.deltas?.l4_forward_delta ?? "n/a"
      ])
    ),
    "",
    "## L3 Calibration Proxies",
    "",
    markdownTable(
      ["run", "green_low_quality", "yellow_count", "yellow_rate", "red_high_quality", "red_spot_check", "l4_load"],
      result.pool_calibration.map((item) => [
        item.label,
        item.green_precision_proxy.low_quality_pass_count,
        item.yellow_l4_load.yellow_count,
        item.yellow_l4_load.yellow_rate,
        item.red_spot_check.high_quality_red_count,
        item.red_spot_check.red_spot_check_count,
        item.l4_load.l4_forward_count
      ])
    ),
    "",
    "## Candidate Marginal Lift",
    ""
  ];

  if (!result.candidate_marginal_analysis.length) {
    lines.push("- none");
  } else {
    lines.push(markdownTable(
      ["run", "compared_to", "best_found", "quality_delta", "green_delta", "yellow_delta", "red_delta", "api_delta", "default_ready"],
      result.candidate_marginal_analysis.map((item) => [
        item.label,
        item.compared_to,
        item.candidate_best_found_count,
        item.deltas.avg_quality_delta,
        item.deltas.green_delta,
        item.deltas.yellow_delta,
        item.deltas.red_delta,
        item.deltas.api_call_delta,
        item.default_ready
      ])
    ));
  }

  lines.push(
    "",
    "## Next Checks",
    "",
    "- Append L4 labels before claiming real green precision or yellow overturn rate.",
    "- Promote a candidate-count mode only after it improves quality without expanding yellow, red, L4, or API load.",
    "- Keep non-default-ready candidate-count modes for explicit recheck/high-uncertainty samples.",
    ""
  );
  return `${lines.join("\n")}\n`;
}

export async function loadRunsFromBundle({ repoRoot = process.cwd(), bundleDir } = {}) {
  const root = resolvePath(repoRoot, bundleDir);
  if (!root) throw new Error("--bundle-dir is required");
  const entries = await fs.readdir(root, { withFileTypes: true });
  const runs = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const dir = path.join(root, entry.name);
    const l2Path = path.join(dir, "l2.json");
    const l3Path = path.join(dir, "l3-quality-report.json");
    try {
      const [l2Report, l3Report] = await Promise.all([readJson(l2Path), readJson(l3Path)]);
      runs.push({
        label: entry.name,
        directory: path.relative(repoRoot, dir).replaceAll("\\", "/"),
        l2Report,
        l3Report
      });
    } catch {
      // Ignore non-run subdirectories such as sample/ or partial artifacts.
    }
  }
  if (!runs.length) throw new Error(`No L2/L3 runs found in ${bundleDir}`);
  return runs;
}

export async function writeL2L3QuantitativeComparisonArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  now = new Date()
} = {}) {
  if (!result) throw new Error("result is required");
  const stamp = (now instanceof Date ? now : new Date(now)).toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "l2-l3-quantitative-comparison", stamp));
  await fs.mkdir(outputRoot, { recursive: true });
  const jsonPath = path.join(outputRoot, "quantitative-comparison.json");
  const markdownPath = path.join(outputRoot, "quantitative-comparison.md");
  const written = {
    ...result,
    output: {
      output_dir: path.relative(repoRoot, outputRoot).replaceAll("\\", "/"),
      json_path: path.relative(repoRoot, jsonPath).replaceAll("\\", "/"),
      markdown_path: path.relative(repoRoot, markdownPath).replaceAll("\\", "/")
    }
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderL2L3QuantitativeComparisonMarkdown(written), "utf8");
  return written;
}
