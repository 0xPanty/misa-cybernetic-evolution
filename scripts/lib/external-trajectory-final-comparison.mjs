import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_NOW = new Date("2026-05-16T00:00:00Z");
const DEFAULT_BASELINE_REF = "origin/codex/local-vector-store-adapter";
const DEFAULT_BASELINE_COMMIT = "3e79083";
const DEFAULT_OPTIMIZED_REF = "codex/local-vector-store-adapter";

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function avg(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator) : 0;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function relativePathOrNull(repoRoot, maybePath) {
  if (!maybePath) return null;
  const resolved = path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
  return path.relative(repoRoot, resolved).replaceAll("\\", "/");
}

async function latestReport({ repoRoot, runsDir, fileName }) {
  const root = path.join(repoRoot, runsDir);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, fileName))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error(`No ${fileName} found under ${runsDir}`);
}

function comparisonStats(comparisons) {
  const baselineExpectedMatchCount = comparisons.filter((item) => item.baseline?.action_matches_expected).length;
  const optimizedExpectedMatchCount = comparisons.filter((item) => item.calibrated?.action_matches_expected).length;
  const actionChangeCount = comparisons.filter((item) => item.baseline?.action !== item.calibrated?.action).length;

  return {
    count: comparisons.length,
    baseline_avg_score: avg(comparisons.map((item) => item.baseline?.dimensions?.total ?? 0)),
    optimized_avg_score: avg(comparisons.map((item) => item.calibrated?.dimensions?.total ?? 0)),
    avg_delta: avg(comparisons.map((item) => item.delta ?? 0)),
    baseline_expected_match_count: baselineExpectedMatchCount,
    optimized_expected_match_count: optimizedExpectedMatchCount,
    baseline_expected_match_rate: rate(baselineExpectedMatchCount, comparisons.length),
    optimized_expected_match_rate: rate(optimizedExpectedMatchCount, comparisons.length),
    expected_match_lift: round(rate(optimizedExpectedMatchCount, comparisons.length) - rate(baselineExpectedMatchCount, comparisons.length)),
    improved_count: comparisons.filter((item) => item.improved).length,
    unchanged_count: comparisons.filter((item) => !item.improved && !item.regressed).length,
    regression_count: comparisons.filter((item) => item.regressed).length,
    safety_regression_count: comparisons.filter((item) => item.safety_regression).length,
    baseline_to_optimized_action_change_count: actionChangeCount
  };
}

function groupedStats(comparisons, selector) {
  const buckets = new Map();
  for (const comparison of comparisons) {
    const key = selector(comparison);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(comparison);
  }
  return Object.fromEntries(
    [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => [key, comparisonStats(items)])
  );
}

function actionTransitions(comparisons) {
  return countBy(comparisons, (item) => `${item.baseline?.action ?? "unknown"} -> ${item.calibrated?.action ?? "unknown"}`);
}

function defaultPolicyClosure() {
  return {
    action_change_count: 0,
    route_authority_changed: false,
    winner_authority_changed: false,
    production_authority: false,
    raw_external_content_persisted: false,
    persistent_memory_written: false,
    zilliz_written: false,
    embedding_created: false,
    llm_api_calls: false,
    external_api_calls: false
  };
}

function shadowReadoutClosure(sideBySide) {
  const closure = sideBySide?.shadow_policy_readout?.policy_closure ?? {};
  return {
    ...defaultPolicyClosure(),
    ...closure
  };
}

function qianxuesenGeneralization(alpha) {
  return (alpha?.qianxuesen_alpha_fit?.candidates ?? []).map((candidate) => ({
    candidate_id: candidate.candidate_id,
    decision: candidate.decision,
    authority_scope: candidate.authority_scope,
    sample_count: candidate.sample_count,
    avg_delta: candidate.avg_delta,
    expected_match_lift: candidate.expected_match_lift,
    safety_regression_count: candidate.safety_regression_count,
    regression_count: candidate.regression_count,
    source_scope: candidate.source_scope,
    generalization_status: candidate.generalization_status,
    holdout_passed: candidate.holdout_summary?.holdout_passed ?? null,
    holdout_avg_delta: candidate.holdout_summary?.holdout_avg_delta ?? null,
    action_change_count: candidate.action_change_count ?? 0,
    route_authority_changed: candidate.route_authority_changed ?? false,
    winner_authority_changed: candidate.winner_authority_changed ?? false,
    production_authority: candidate.production_authority ?? false
  }));
}

function buildChecks(result) {
  return [
    {
      name: "same sanitized batch is used for baseline and optimized readout",
      ok: result.overall.count === result.side_by_side_input.comparison_count
        && result.overall.count === result.side_by_side_input.sample_count,
      sample_count: result.side_by_side_input.sample_count,
      comparison_count: result.side_by_side_input.comparison_count
    },
    {
      name: "optimized readout improves average score",
      ok: result.overall.avg_delta > 0,
      avg_delta: result.overall.avg_delta
    },
    {
      name: "optimized readout has no comparison regressions",
      ok: result.overall.regression_count === 0,
      regression_count: result.overall.regression_count
    },
    {
      name: "optimized readout has no safety regressions",
      ok: result.overall.safety_regression_count === 0,
      safety_regression_count: result.overall.safety_regression_count
    },
    {
      name: "side-by-side holdout passed",
      ok: result.side_by_side_input.holdout_passed === true,
      holdout_passed: result.side_by_side_input.holdout_passed
    },
    {
      name: "shadow readout changed no authority",
      ok: result.shadow_readout_closure.action_change_count === 0
        && result.shadow_readout_closure.route_authority_changed === false
        && result.shadow_readout_closure.winner_authority_changed === false
        && result.shadow_readout_closure.production_authority === false,
      policy_closure: result.shadow_readout_closure
    },
    {
      name: "comparison has no live storage or provider effects",
      ok: result.boundaries.zilliz_written === false
        && result.boundaries.embedding_created === false
        && result.boundaries.llm_api_calls === false
        && result.boundaries.external_api_calls === false
        && result.boundaries.vps_touched === false
        && result.boundaries.github_pushed === false,
      boundaries: result.boundaries
    }
  ];
}

function verdictFor(result) {
  const checks = result.checks ?? [];
  const passed = checks.every((check) => check.ok);
  if (passed) return "optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression";
  return "not_ready_for_closeout";
}

export async function runExternalTrajectoryFinalComparison({
  repoRoot = process.cwd(),
  sideBySideReportPath,
  alphaReportPath,
  sideBySide,
  alpha,
  now = DEFAULT_NOW,
  baselineRef = DEFAULT_BASELINE_REF,
  baselineCommit = DEFAULT_BASELINE_COMMIT,
  optimizedRef = DEFAULT_OPTIMIZED_REF,
  optimizedCommit = "HEAD"
} = {}) {
  const sideBySidePath = sideBySideReportPath
    ? resolvePath(repoRoot, sideBySideReportPath)
    : await latestReport({
      repoRoot,
      runsDir: "runs/external-trajectory-side-by-side",
      fileName: "external-trajectory-side-by-side.json"
    });
  const alphaPath = alphaReportPath
    ? resolvePath(repoRoot, alphaReportPath)
    : await latestReport({
      repoRoot,
      runsDir: "runs/external-trajectory-alpha",
      fileName: "external-trajectory-alpha.json"
    });

  const sideBySideData = sideBySide ?? await readJson(sideBySidePath);
  const alphaData = alpha ?? await readJson(alphaPath);
  const comparisons = sideBySideData.comparisons ?? [];
  const closure = shadowReadoutClosure(sideBySideData);

  const result = {
    schema_version: "misa.external_trajectory_final_comparison.v1",
    mode: "external-trajectory-final-comparison",
    ok: false,
    created_at: asIsoDate(now),
    comparison_scope: "github_baseline_pre_external_trajectory_vs_local_optimized_shadow_readout",
    baseline: {
      ref: baselineRef,
      commit: baselineCommit,
      behavior: "pre_optimization_baseline_action_and_score"
    },
    optimized: {
      ref: optimizedRef,
      commit: optimizedCommit,
      behavior: "optimized_calibrated_shadow_action_and_score",
      selected_profile: sideBySideData.parameter_sweep?.selected_profile_id
        ?? sideBySideData.calibration_draft?.parameter_profile_id
        ?? null
    },
    measurement_note: "The GitHub baseline commit does not contain the external-trajectory evaluation harness, so the current harness is used as a neutral measurement layer: baseline action/score represents pre-optimization behavior, and calibrated action/score represents optimized behavior on the same sanitized sample batch.",
    side_by_side_input: {
      report_path: relativePathOrNull(repoRoot, sideBySidePath),
      alpha_report_path: relativePathOrNull(repoRoot, alphaPath),
      sample_count: sideBySideData.summary?.sample_count ?? comparisons.length,
      comparison_count: comparisons.length,
      avg_delta: sideBySideData.summary?.avg_delta ?? avg(comparisons.map((item) => item.delta ?? 0)),
      safety_regression_count: sideBySideData.summary?.safety_regression_count ?? comparisons.filter((item) => item.safety_regression).length,
      holdout_passed: sideBySideData.summary?.dev_holdout?.holdout_passed ?? null,
      shadow_policy_readout_conclusion: sideBySideData.shadow_policy_readout?.conclusion ?? null
    },
    overall: comparisonStats(comparisons),
    by_dataset: groupedStats(comparisons, (item) => item.dataset ?? "unknown"),
    by_expected_shadow_action: groupedStats(comparisons, (item) => item.expected_shadow_action ?? "unknown"),
    action_transitions: actionTransitions(comparisons),
    shadow_readout_closure: closure,
    qianxuesen_generalization: qianxuesenGeneralization(alphaData),
    boundaries: {
      shadow_only: true,
      route_authority_changed: closure.route_authority_changed,
      winner_authority_changed: closure.winner_authority_changed,
      production_authority: closure.production_authority,
      raw_external_content_persisted: closure.raw_external_content_persisted,
      persistent_memory_written: closure.persistent_memory_written,
      zilliz_written: closure.zilliz_written,
      embedding_created: closure.embedding_created,
      llm_api_calls: closure.llm_api_calls,
      external_api_calls: closure.external_api_calls,
      vps_touched: false,
      github_pushed: false
    },
    warnings: [
      "This is a local shadow-only comparison report, not production route or winner authority.",
      "The GitHub baseline predates the external-trajectory harness, so baseline behavior is measured through the current neutral comparison layer."
    ]
  };

  result.checks = buildChecks(result);
  result.verdict = verdictFor(result);
  result.ok = result.verdict === "optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression";
  return result;
}

export function renderExternalTrajectoryFinalComparisonMarkdown(result) {
  const lines = [
    "# External Trajectory Final Comparison",
    "",
    "## Summary",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- baseline: ${result.baseline.ref}@${result.baseline.commit}`,
    `- optimized: ${result.optimized.ref}@${result.optimized.commit}`,
    `- selected_profile: ${result.optimized.selected_profile}`,
    `- samples: ${result.overall.count}`,
    `- baseline_avg_score: ${result.overall.baseline_avg_score}`,
    `- optimized_avg_score: ${result.overall.optimized_avg_score}`,
    `- avg_delta: ${result.overall.avg_delta}`,
    `- baseline_expected_match_rate: ${result.overall.baseline_expected_match_rate}`,
    `- optimized_expected_match_rate: ${result.overall.optimized_expected_match_rate}`,
    `- expected_match_lift: ${result.overall.expected_match_lift}`,
    `- improved_count: ${result.overall.improved_count}`,
    `- regression_count: ${result.overall.regression_count}`,
    `- safety_regression_count: ${result.overall.safety_regression_count}`,
    `- baseline_to_optimized_action_change_count: ${result.overall.baseline_to_optimized_action_change_count}`,
    `- verdict: ${result.verdict}`,
    "",
    "## Dataset Result",
    ""
  ];

  for (const [dataset, stats] of Object.entries(result.by_dataset)) {
    lines.push(`- ${dataset}: n=${stats.count}, delta=${stats.avg_delta}, match_lift=${stats.expected_match_lift}, safety_regressions=${stats.safety_regression_count}`);
  }

  lines.push("", "## Expected Action Result", "");
  for (const [action, stats] of Object.entries(result.by_expected_shadow_action)) {
    lines.push(`- ${action}: n=${stats.count}, delta=${stats.avg_delta}, match_lift=${stats.expected_match_lift}, action_changes=${stats.baseline_to_optimized_action_change_count}`);
  }

  lines.push("", "## Qianxuesen Generalization", "");
  for (const candidate of result.qianxuesen_generalization) {
    lines.push(`- ${candidate.candidate_id}: decision=${candidate.decision}, generalization=${candidate.generalization_status}, samples=${candidate.sample_count}, holdout_passed=${candidate.holdout_passed}, action_changes=${candidate.action_change_count}`);
  }

  lines.push(
    "",
    "## Boundary",
    "",
    `- shadow_only: ${result.boundaries.shadow_only}`,
    `- route_authority_changed: ${result.boundaries.route_authority_changed}`,
    `- winner_authority_changed: ${result.boundaries.winner_authority_changed}`,
    `- production_authority: ${result.boundaries.production_authority}`,
    `- raw_external_content_persisted: ${result.boundaries.raw_external_content_persisted}`,
    `- zilliz_written: ${result.boundaries.zilliz_written}`,
    `- embedding_created: ${result.boundaries.embedding_created}`,
    `- llm_api_calls: ${result.boundaries.llm_api_calls}`,
    `- external_api_calls: ${result.boundaries.external_api_calls}`,
    `- vps_touched: ${result.boundaries.vps_touched}`,
    `- github_pushed: ${result.boundaries.github_pushed}`,
    "",
    "## Checks",
    "",
    ...result.checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.name}`),
    "",
    "## Measurement Note",
    "",
    result.measurement_note,
    ""
  );

  return `${lines.join("\n")}\n`;
}

export async function writeExternalTrajectoryFinalComparisonArtifacts({
  result,
  repoRoot = process.cwd(),
  outDir,
  now = DEFAULT_NOW
} = {}) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "external-trajectory-final-comparison", stamp));
  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "external-trajectory-final-comparison.json");
  const markdownPath = path.join(outputRoot, "external-trajectory-final-comparison.md");
  const written = {
    ...result,
    output: {
      output_dir: path.relative(repoRoot, outputRoot).replaceAll("\\", "/"),
      json_path: path.relative(repoRoot, jsonPath).replaceAll("\\", "/"),
      markdown_path: path.relative(repoRoot, markdownPath).replaceAll("\\", "/")
    }
  };

  await writeJson(jsonPath, written);
  await fs.writeFile(markdownPath, renderExternalTrajectoryFinalComparisonMarkdown(written), "utf8");
  return written;
}
