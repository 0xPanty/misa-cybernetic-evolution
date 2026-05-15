import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CALIBRATION_SAMPLE_SETS } from "./current-line-calibration.mjs";
import { reviewRepairTickets } from "./repair-ticket.mjs";
import { buildWorkOrderRouting } from "./work-order-router.mjs";
import { buildWorkOrderVariants } from "./work-order-variants.mjs";

const DEFAULT_NOW = new Date("2026-05-15T00:00:00Z");

export const DEFAULT_WORK_ORDER_EVAL_SEEDS = Object.freeze([
  "quality-01",
  "quality-02",
  "quality-03",
  "quality-04",
  "quality-05",
  "quality-06",
  "quality-07",
  "quality-08",
  "quality-09",
  "quality-10"
]);

export const DEFAULT_OPERATOR_QUALITY_REPORTS = Object.freeze([
  {
    label: "operator_tighten",
    report: {
      schema: "misa.hermes.farcaster.daily_report.v1",
      report_date: "2026-05-12",
      counts: {
        outcomes_considered: 12,
        blocked_transitions: 2
      },
      operator_quality: {
        schema: "misa.hermes.farcaster.operator_quality.v1",
        verdict: "tighten",
        recommendations: [
          "lower priority for repeated author/thread/topic before the next cycle",
          "quality brakes are active; inspect blocks before loosening thresholds"
        ]
      }
    }
  },
  {
    label: "operator_watch",
    report: {
      schema: "misa.hermes.farcaster.daily_report.v1",
      report_date: "2026-05-13",
      counts: {
        outcomes_considered: 6,
        blocked_transitions: 1
      },
      operator_quality: {
        schema: "misa.hermes.farcaster.operator_quality.v1",
        verdict: "watch",
        recommendations: [
          "watch repeated topical drift before changing behavior"
        ]
      }
    }
  },
  {
    label: "operator_healthy",
    report: {
      schema: "misa.hermes.farcaster.daily_report.v1",
      report_date: "2026-05-14",
      counts: {
        outcomes_considered: 4
      },
      operator_quality: {
        schema: "misa.hermes.farcaster.operator_quality.v1",
        verdict: "healthy",
        recommendations: [
          "operator quality looks steady; keep current soft-presence settings"
        ]
      }
    }
  }
]);

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function countBy(values, selector = (value) => value) {
  return values.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function entropy(counts) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (!total) return 0;
  const raw = Object.values(counts).reduce((sum, count) => {
    const p = count / total;
    return p > 0 ? sum - p * Math.log2(p) : sum;
  }, 0);
  const max = Math.log2(Math.max(Object.keys(counts).length, 1));
  return max ? round(raw / max) : 0;
}

function boolScore(value) {
  return value ? 1 : 0;
}

function cappedCount(count, cap) {
  return clamp01((count ?? 0) / cap);
}

function objectHasValues(value) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function sourceArgsForSampleSet(sampleSet) {
  if (sampleSet.vps_raw_dir) return { vpsRawDir: sampleSet.vps_raw_dir };
  return { sourceDir: sampleSet.source_dir };
}

function operationSafety(candidate) {
  const safety = candidate.safety ?? {};
  const executionPolicy = candidate.execution_policy ?? {};
  return {
    executes_work_orders: safety.executes_work_orders === true || candidate.execution_allowed === true,
    durable_or_public_effect_allowed: safety.durable_or_public_effect_allowed === true
      || executionPolicy.durable_or_public_effect_allowed === true
      || candidate.publication_allowed === true,
    writes_persistent_memory: safety.writes_persistent_memory === true,
    installs_skills: safety.installs_skills === true,
    calls_llm: safety.calls_llm === true,
    calls_external_api: safety.calls_external_api === true
  };
}

function dimensionsFromMetrics(metrics) {
  const sourceTrace = avg([
    cappedCount(metrics.source_refs, 4),
    boolScore(metrics.source_refs_required),
    boolScore(metrics.source_trace_preserved),
    boolScore(metrics.has_evidence)
  ]);
  const replayability = avg([
    cappedCount(metrics.reproduction_commands, 2),
    cappedCount(metrics.acceptance_criteria, 5),
    boolScore(metrics.has_verification_focus),
    boolScore(metrics.has_stop_condition)
  ]);
  const boundarySafety = avg([
    cappedCount(metrics.forbidden_scope, 4),
    boolScore(!metrics.safety.durable_or_public_effect_allowed),
    boolScore(!metrics.safety.writes_persistent_memory),
    boolScore(!metrics.safety.installs_skills),
    boolScore(!metrics.safety.calls_external_api),
    boolScore(!metrics.safety.executes_work_orders)
  ]);
  const handoffClarity = avg([
    boolScore(metrics.has_title),
    boolScore(metrics.has_summary),
    boolScore(metrics.has_executor),
    boolScore(metrics.has_delivery_policy),
    boolScore(metrics.has_default_next_step),
    cappedCount(metrics.acceptance_criteria, 5),
    boolScore(metrics.has_stop_condition)
  ]);
  const controlLoopFit = avg([
    sourceTrace,
    boolScore(metrics.has_route),
    boolScore(metrics.has_task_gate),
    boolScore(metrics.has_owner_or_escalation),
    replayability,
    boundarySafety
  ]);
  const qianxuesenFit = clamp01(
    sourceTrace * 0.2
    + replayability * 0.2
    + boundarySafety * 0.25
    + handoffClarity * 0.15
    + controlLoopFit * 0.2
  );
  const overdesignPenalty = clamp01(
    Math.max(0, metrics.acceptance_criteria - 10) * 0.015
    + Math.max(0, metrics.forbidden_scope - 8) * 0.015
    + (metrics.requested_operations ?? 0) * 0.05
  );
  const total = clamp01(
    sourceTrace * 0.18
    + replayability * 0.22
    + boundarySafety * 0.22
    + handoffClarity * 0.18
    + controlLoopFit * 0.1
    + qianxuesenFit * 0.1
    - overdesignPenalty
  );

  return {
    source_trace: round(sourceTrace),
    replayability: round(replayability),
    boundary_safety: round(boundarySafety),
    handoff_clarity: round(handoffClarity),
    control_loop_fit: round(controlLoopFit),
    qianxuesen_fit: round(qianxuesenFit),
    overdesign_penalty: round(overdesignPenalty),
    total: round(total)
  };
}

function baselineMetrics(order) {
  return {
    has_title: Boolean(order.title),
    has_summary: Boolean(order.summary),
    has_route: Boolean(order.category),
    has_task_gate: Boolean(order.task_gate),
    has_executor: Boolean(order.suggested_executor?.executor_type),
    has_delivery_policy: Boolean(order.delivery?.delivery_policy),
    has_default_next_step: Boolean(order.execution_policy?.default_next_step),
    has_owner_or_escalation: Boolean(order.execution_policy?.owner_report_required || order.escalation?.allowed),
    has_verification_focus: false,
    has_stop_condition: false,
    has_evidence: objectHasValues(order.traceability?.evidence),
    source_refs_required: order.traceability?.source_refs_required === true,
    source_trace_preserved: true,
    source_refs: order.source_refs?.length ?? 0,
    reproduction_commands: order.traceability?.reproduction_commands?.length ?? 0,
    acceptance_criteria: order.traceability?.acceptance_criteria?.length ?? 0,
    forbidden_scope: order.traceability?.forbidden_scope?.length ?? 0,
    requested_operations: 0,
    safety: operationSafety({
      execution_policy: order.execution_policy,
      safety: {
        durable_or_public_effect_allowed: order.execution_policy?.durable_or_public_effect_allowed === true
      }
    })
  };
}

function variantMetrics(order, orderResult) {
  const variant = orderResult.variants.find((item) => item.variant_id === orderResult.winner.variant_id)
    ?? orderResult.variants[0];
  return {
    has_title: Boolean(variant.title),
    has_summary: Boolean(variant.summary),
    has_route: Boolean(orderResult.category),
    has_task_gate: Boolean(order.task_gate),
    has_executor: Boolean(order.suggested_executor?.executor_type),
    has_delivery_policy: Boolean(order.delivery?.delivery_policy),
    has_default_next_step: Boolean(order.execution_policy?.default_next_step),
    has_owner_or_escalation: Boolean(order.execution_policy?.owner_report_required || order.escalation?.allowed),
    has_verification_focus: Boolean(variant.verification_focus),
    has_stop_condition: Boolean(variant.proposed_task_shape?.stop_condition),
    has_evidence: objectHasValues(order.traceability?.evidence),
    source_refs_required: order.traceability?.source_refs_required === true,
    source_trace_preserved: variant.constraints?.source_trace_preserved === true,
    source_refs: variant.constraints?.source_trace_preserved ? order.source_refs?.length ?? 0 : 0,
    reproduction_commands: order.traceability?.reproduction_commands?.length ?? 0,
    acceptance_criteria: variant.acceptance_criteria?.length ?? 0,
    forbidden_scope: variant.forbidden_scope?.length ?? 0,
    requested_operations: variant.requested_operations?.length ?? 0,
    safety: operationSafety({
      execution_allowed: orderResult.winner.execution_allowed,
      publication_allowed: orderResult.winner.publication_allowed,
      safety: {
        ...variant.safety,
        executes_work_orders: false
      }
    }),
    variant
  };
}

export function scoreBaselineWorkOrder(order) {
  const metrics = baselineMetrics(order);
  return {
    surface: "baseline_work_order",
    metrics,
    dimensions: dimensionsFromMetrics(metrics)
  };
}

export function scoreVariantWinner(order, orderResult) {
  const metrics = variantMetrics(order, orderResult);
  const { variant, ...serializableMetrics } = metrics;
  return {
    surface: "variant_winner",
    variant_id: variant?.variant_id,
    strategy: variant?.strategy,
    metrics: serializableMetrics,
    dimensions: dimensionsFromMetrics(metrics)
  };
}

function compareScores({
  sourceLabel,
  sourceKind,
  seed,
  order,
  orderResult
}) {
  const baseline = scoreBaselineWorkOrder(order);
  const winner = scoreVariantWinner(order, orderResult);
  const delta = round(winner.dimensions.total - baseline.dimensions.total);
  const safetyRegression = winner.metrics.safety.durable_or_public_effect_allowed
    || winner.metrics.safety.writes_persistent_memory
    || winner.metrics.safety.installs_skills
    || winner.metrics.safety.calls_external_api
    || winner.metrics.safety.executes_work_orders;
  const positiveLift = delta > 0 && !safetyRegression;

  return {
    source_label: sourceLabel,
    source_kind: sourceKind,
    seed,
    work_order_id: order.work_order_id,
    category: order.category,
    severity: order.severity,
    risk_level: order.risk_level,
    baseline,
    winner,
    delta,
    positive_lift: positiveLift,
    safety_regression: Boolean(safetyRegression),
    llm_review_gate: {
      level: orderResult.llm_review_gate.level,
      call_policy: orderResult.llm_review_gate.call_policy,
      llm_api_calls: orderResult.llm_review_gate.llm_api_calls,
      recommended: orderResult.llm_review_gate.recommended
    },
    qianxuesen_signals: {
      high_risk_boundary_fit: ["critical", "high"].includes(order.risk_level)
        && winner.strategy === "boundary_tightening",
      medium_risk_replay_or_compact_fit: order.risk_level === "medium"
        && ["replay_extension", "compact_handoff", "evidence_expansion"].includes(winner.strategy),
      low_risk_conservative_fit: order.risk_level === "low"
        && winner.strategy === "conservative_patch",
      route_preserved: orderResult.variants.every((variant) => variant.constraints.route_preserved),
      source_trace_preserved: orderResult.variants.every((variant) => variant.constraints.source_trace_preserved),
      no_direct_execution: orderResult.variants.every((variant) => variant.constraints.no_direct_execution)
    }
  };
}

async function buildDefaultCorpus({
  repoRoot = process.cwd(),
  sampleSets = DEFAULT_CALIBRATION_SAMPLE_SETS,
  operatorReports = DEFAULT_OPERATOR_QUALITY_REPORTS,
  now = DEFAULT_NOW
} = {}) {
  const corpus = [];

  for (const sampleSet of sampleSets) {
    const repairTicketReview = await reviewRepairTickets({
      repoRoot,
      ...sourceArgsForSampleSet(sampleSet),
      now
    });
    corpus.push({
      source_label: sampleSet.sample_set_id,
      source_kind: "repair_ticket_sample_set",
      routing: buildWorkOrderRouting({
        repairTicketReview,
        now
      })
    });
  }

  for (const item of operatorReports) {
    corpus.push({
      source_label: item.label,
      source_kind: "operator_quality_report",
      routing: buildWorkOrderRouting({
        operationalReports: [item.report],
        now
      })
    });
  }

  return corpus;
}

function sampleShapeKey(comparison) {
  return [
    comparison.work_order_id,
    comparison.category,
    comparison.severity,
    comparison.risk_level
  ].join("|");
}

function summarizeComparisons(comparisons, corpus) {
  const baselineScores = comparisons.map((item) => item.baseline.dimensions.total);
  const winnerScores = comparisons.map((item) => item.winner.dimensions.total);
  const deltas = comparisons.map((item) => item.delta);
  const byStrategy = countBy(comparisons, (item) => item.winner.strategy);
  const byCategory = countBy(comparisons, (item) => item.category);
  const byRisk = countBy(comparisons, (item) => item.risk_level);
  const uniqueWorkOrderIds = new Set(comparisons.map((item) => item.work_order_id));
  const uniqueShapes = new Set(comparisons.map(sampleShapeKey));
  const highRisk = comparisons.filter((item) => ["critical", "high"].includes(item.risk_level));
  const mediumRisk = comparisons.filter((item) => item.risk_level === "medium");
  const lowRisk = comparisons.filter((item) => item.risk_level === "low");

  return {
    source_set_count: corpus.length,
    work_order_count: new Set(comparisons.map((item) => `${item.source_label}:${item.work_order_id}`)).size,
    unique_work_order_id_count: uniqueWorkOrderIds.size,
    unique_work_order_shape_count: uniqueShapes.size,
    seed_count: new Set(comparisons.map((item) => item.seed)).size,
    comparison_count: comparisons.length,
    variant_count: comparisons.length * 5,
    positive_lift_count: comparisons.filter((item) => item.positive_lift).length,
    positive_lift_rate: round(avg(comparisons.map((item) => boolScore(item.positive_lift)))),
    regression_count: comparisons.filter((item) => item.delta < 0).length,
    safety_regression_count: comparisons.filter((item) => item.safety_regression).length,
    avg_baseline_score: round(avg(baselineScores)),
    avg_winner_score: round(avg(winnerScores)),
    avg_delta: round(avg(deltas)),
    min_delta: round(Math.min(...deltas)),
    max_delta: round(Math.max(...deltas)),
    by_winner_strategy: byStrategy,
    strategy_entropy: entropy(byStrategy),
    by_category: byCategory,
    by_risk: byRisk,
    llm_critique_recommended_count: comparisons.filter((item) => item.llm_review_gate.recommended).length,
    llm_api_calls: comparisons.reduce((sum, item) => sum + item.llm_review_gate.llm_api_calls, 0),
    external_api_calls: 0,
    qianxuesen_signal_fit: {
      high_risk_count: highRisk.length,
      high_risk_boundary_fit_count: highRisk.filter((item) => item.qianxuesen_signals.high_risk_boundary_fit).length,
      medium_risk_count: mediumRisk.length,
      medium_risk_replay_or_compact_fit_count: mediumRisk.filter((item) => item.qianxuesen_signals.medium_risk_replay_or_compact_fit).length,
      low_risk_count: lowRisk.length,
      low_risk_conservative_fit_count: lowRisk.filter((item) => item.qianxuesen_signals.low_risk_conservative_fit).length,
      route_preserved_count: comparisons.filter((item) => item.qianxuesen_signals.route_preserved).length,
      source_trace_preserved_count: comparisons.filter((item) => item.qianxuesen_signals.source_trace_preserved).length,
      no_direct_execution_count: comparisons.filter((item) => item.qianxuesen_signals.no_direct_execution).length
    }
  };
}

function buildRecommendations(summary) {
  const recs = [];
  const highRiskFit = summary.qianxuesen_signal_fit.high_risk_count
    ? summary.qianxuesen_signal_fit.high_risk_boundary_fit_count / summary.qianxuesen_signal_fit.high_risk_count
    : 1;
  if (summary.unique_work_order_shape_count < summary.work_order_count) {
    recs.push({
      recommendation_id: "add_external_issue_pr_samples",
      priority: "high",
      reason: "Local sample sets exercise the chain, but several source sets collapse into the same work-order shape.",
      qianxuesen_fit: "Add issue/PR style benchmark adapters so the control loop is judged on final work-order quality, not only local replay shape."
    });
  }
  if (summary.avg_delta > 0 && summary.safety_regression_count === 0) {
    recs.push({
      recommendation_id: "keep_variant_layer_shadow_only",
      priority: "high",
      reason: "Variant winners improve the measured handoff without creating live-effect or provider-call regressions.",
      qianxuesen_fit: "Keep this as L2 draft optimization before any execution authority."
    });
  }
  if (highRiskFit < 0.9) {
    recs.push({
      recommendation_id: "strengthen_high_risk_boundary_alignment",
      priority: "high",
      reason: "High-risk work orders should prefer boundary tightening unless replay evidence clearly beats it.",
      qianxuesen_fit: "Qianxuesen should stabilize the control boundary before optimizing handoff wording."
    });
  }
  if (summary.qianxuesen_signal_fit.medium_risk_count > 0) {
    recs.push({
      recommendation_id: "add_replay_weight_for_medium_risk",
      priority: "medium",
      reason: "Medium-risk work orders benefit from replay or compact handoff, but this should be enforced by data rather than taste.",
      qianxuesen_fit: "Favor replay-required candidates when risk is medium and source evidence is enough."
    });
  }
  if (summary.llm_critique_recommended_count > 0 && summary.llm_api_calls === 0) {
    recs.push({
      recommendation_id: "keep_llm_gate_advisory_until_holdout",
      priority: "medium",
      reason: "The gate can identify high-value critique points without spending tokens.",
      qianxuesen_fit: "Only enable model critique after holdout data shows the critique improves final work-order quality."
    });
  }
  if (summary.strategy_entropy < 0.65) {
    recs.push({
      recommendation_id: "watch_strategy_diversity",
      priority: "medium",
      reason: "Winner strategies are somewhat concentrated; this can be correct for high-risk data, but needs larger samples.",
      qianxuesen_fit: "Track diversity before adding multi-round mutation or crossover."
    });
  }
  return recs;
}

export async function runWorkOrderQualityEvaluation({
  repoRoot = process.cwd(),
  seeds = DEFAULT_WORK_ORDER_EVAL_SEEDS,
  sampleSets = DEFAULT_CALIBRATION_SAMPLE_SETS,
  operatorReports = DEFAULT_OPERATOR_QUALITY_REPORTS,
  now = DEFAULT_NOW
} = {}) {
  const seedList = Array.isArray(seeds) && seeds.length ? seeds : DEFAULT_WORK_ORDER_EVAL_SEEDS;
  const corpus = await buildDefaultCorpus({
    repoRoot,
    sampleSets,
    operatorReports,
    now
  });
  const comparisons = [];

  for (const item of corpus) {
    for (const order of item.routing.work_orders) {
      for (const seed of seedList) {
        const variantRun = buildWorkOrderVariants({
          workOrderRouting: {
            ...item.routing,
            work_orders: [order],
            summary: {
              ...item.routing.summary,
              work_order_count: 1
            }
          },
          seed,
          now
        });
        comparisons.push(compareScores({
          sourceLabel: item.source_label,
          sourceKind: item.source_kind,
          seed,
          order,
          orderResult: variantRun.work_order_results[0]
        }));
      }
    }
  }

  const summary = summarizeComparisons(comparisons, corpus);
  const recommendations = buildRecommendations(summary);

  return {
    schema_version: "misa.work_order_quality_eval.v1",
    mode: "work-order-quality-eval",
    ok: summary.safety_regression_count === 0 && summary.regression_count === 0 && summary.positive_lift_rate >= 0.95,
    created_at: asIsoDate(now),
    seeds: seedList,
    sample_summary: {
      source_set_count: summary.source_set_count,
      work_order_count: summary.work_order_count,
      unique_work_order_id_count: summary.unique_work_order_id_count,
      unique_work_order_shape_count: summary.unique_work_order_shape_count,
      sample_quality: summary.unique_work_order_shape_count >= summary.work_order_count
        ? "diverse_enough_for_local_gate"
        : "useful_but_needs_external_issue_pr_samples"
    },
    summary,
    qianxuesen_adaptation: {
      interpretation: "evaluate the final work-order packet as a control-loop output, not just the variant generator command",
      required_positive_direction: [
        "source trace stays preserved",
        "replay or verification focus becomes clearer",
        "boundary safety does not regress",
        "handoff is easier for an agent to execute or report",
        "LLM critique remains value-gated and zero-call by default"
      ],
      next_adaptation_candidates: recommendations
    },
    comparisons,
    safety: {
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      installs_skills: false,
      durable_or_public_effect_allowed: false,
      changes_route: false,
      changes_winner_authority: false,
      llm_api_calls: summary.llm_api_calls,
      external_api_calls: summary.external_api_calls
    },
    warnings: [
      "This evaluates final work-order quality signals; it does not execute any work order.",
      "Local source sets are useful for regression, but external issue/PR samples are needed before claiming broad quality lift.",
      "LLM critique recommendations are advisory and zero-call in this evaluation."
    ]
  };
}

function renderMarkdown(result) {
  const lines = [
    "# Work Order Quality Evaluation",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- source_set_count: ${result.summary.source_set_count}`,
    `- work_order_count: ${result.summary.work_order_count}`,
    `- comparison_count: ${result.summary.comparison_count}`,
    `- variant_count: ${result.summary.variant_count}`,
    `- avg_baseline_score: ${result.summary.avg_baseline_score}`,
    `- avg_winner_score: ${result.summary.avg_winner_score}`,
    `- avg_delta: ${result.summary.avg_delta}`,
    `- positive_lift_rate: ${result.summary.positive_lift_rate}`,
    `- safety_regression_count: ${result.summary.safety_regression_count}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    "",
    "## Strategy Winners",
    "",
    ...Object.entries(result.summary.by_winner_strategy).map(([strategy, count]) => `- ${strategy}: ${count}`),
    "",
    "## Qianxuesen Adaptation",
    "",
    ...result.qianxuesen_adaptation.next_adaptation_candidates.map((item) => (
      `- ${item.recommendation_id} (${item.priority}): ${item.reason}`
    )),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeWorkOrderQualityArtifacts({
  result,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "work-order-quality", stamp));
  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "work-order-quality.json");
  const mdPath = path.join(outputRoot, "work-order-quality.md");
  const withOutput = {
    ...result,
    output: {
      output_dir: outputRoot,
      json_path: jsonPath,
      markdown_path: mdPath
    }
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(withOutput, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderMarkdown(withOutput), "utf8");

  return withOutput;
}
