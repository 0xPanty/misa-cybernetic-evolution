#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { writeJsonOutFile } from "./lib/cli-output.mjs";
import { buildHermesRuntimeAdapterReport } from "./lib/hermes-runtime-adapter.mjs";
import {
  buildHermesWorkOrderPipeline,
  runHermesWorkOrderPipeline
} from "./lib/hermes-work-order.mjs";
import { runWorkOrderQualityEvaluation } from "./lib/work-order-quality-eval.mjs";

const DEFAULT_SEED_COUNT = 500;
const DEFAULT_NOW = new Date("2026-05-23T00:00:00Z");

const HERMES_INPUTS = Object.freeze([
  {
    label: "hermes_default",
    options: {}
  },
  {
    label: "hermes_evolution_grade",
    options: {
      fixtureFile: "test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json"
    }
  },
  {
    label: "hermes_plugin_ndjson",
    options: {
      eventLogFile: "examples/hermes-runtime-plugin/sample-events.ndjson",
      runtimeCommit: "local-plugin-sample"
    }
  }
]);

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

function parseSeedCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0
    ? Math.max(1, Math.floor(count))
    : DEFAULT_SEED_COUNT;
}

function buildSeeds(seedCount) {
  return Array.from({ length: seedCount }, (_, index) => `value-proof-${String(index + 1).padStart(4, "0")}`);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeComparisons(label, comparisons) {
  if (!comparisons.length) {
    return {
      label,
      comparison_count: 0,
      positive_lift_count: 0,
      positive_lift_rate: 0,
      regression_count: 0,
      zero_or_negative_count: 0,
      safety_regression_count: 0,
      avg_delta: 0,
      min_delta: 0,
      p05_delta: 0,
      p50_delta: 0,
      p95_delta: 0,
      max_delta: 0,
      by_strategy: {},
      by_risk: {},
      evolution_evidence_count: 0,
      supported_optimization_evidence_count: 0,
      evidence_support_rate: 0,
      worst: []
    };
  }
  const deltas = comparisons.map((item) => item.delta);
  const positiveLiftCount = comparisons.filter((item) => item.positive_lift).length;
  const evidenceRows = comparisons.filter((item) => item.evolution_evidence);
  const supportedEvidenceCount = evidenceRows.filter((item) => item.evolution_evidence?.can_support_optimization).length;
  const worst = [...comparisons]
    .sort((left, right) => (
      left.delta - right.delta
      || String(left.work_order_id).localeCompare(String(right.work_order_id))
    ))
    .slice(0, 5)
    .map((item) => ({
      work_order_id: item.work_order_id,
      category: item.category,
      risk_level: item.risk_level,
      delta: item.delta,
      positive_lift: item.positive_lift,
      safety_regression: item.safety_regression,
      strategy: item.selected_strategy ?? item.winner?.strategy ?? null
    }));

  return {
    label,
    comparison_count: comparisons.length,
    positive_lift_count: positiveLiftCount,
    positive_lift_rate: comparisons.length ? round(positiveLiftCount / comparisons.length) : 0,
    regression_count: comparisons.filter((item) => item.delta < 0).length,
    zero_or_negative_count: comparisons.filter((item) => item.delta <= 0).length,
    safety_regression_count: comparisons.filter((item) => item.safety_regression).length,
    avg_delta: round(avg(deltas)),
    min_delta: round(Math.min(...deltas)),
    p05_delta: round(quantile(deltas, 0.05)),
    p50_delta: round(quantile(deltas, 0.5)),
    p95_delta: round(quantile(deltas, 0.95)),
    max_delta: round(Math.max(...deltas)),
    by_strategy: countBy(comparisons, (item) => item.selected_strategy ?? item.winner?.strategy ?? "none"),
    by_risk: countBy(comparisons, (item) => item.risk_level ?? "unknown"),
    evolution_evidence_count: evidenceRows.length,
    supported_optimization_evidence_count: supportedEvidenceCount,
    evidence_support_rate: evidenceRows.length ? round(supportedEvidenceCount / evidenceRows.length) : 0,
    worst
  };
}

function negativeControlFixture() {
  return {
    source: {
      runtime: "hermes-agent",
      runtime_commit: "bad-evidence-control",
      source_url: "local-negative-control"
    },
    events: [
      {
        event_id: "bad-negative-delta",
        hook: "pre_tool_call",
        tool_name: "skill_manage",
        args: { action: "patch", name: "bad-skill" },
        context: {
          conversation_signals: ["knowledge_gap"],
          evidence_refs: ["bad-negative-delta-source"],
          evolution_evidence: {
            evidence_id: "bad-negative-delta-proof",
            metric: "heldout_quality",
            baseline_snapshot_id: "baseline-a",
            holdout_split_id: "holdout-a",
            before_score: 0.8,
            after_score: 0.6,
            sample_count: 20,
            metric_gaming_risk: "low"
          }
        }
      },
      {
        event_id: "bad-high-gaming-risk",
        hook: "pre_tool_call",
        tool_name: "skill_manage",
        args: { action: "patch", name: "gaming-skill" },
        context: {
          conversation_signals: ["knowledge_gap"],
          evidence_refs: ["bad-high-gaming-source"],
          evolution_evidence: {
            evidence_id: "bad-high-gaming-proof",
            metric: "easy_to_game_metric",
            baseline_snapshot_id: "baseline-b",
            holdout_split_id: "holdout-b",
            before_score: 0.4,
            after_score: 0.9,
            sample_count: 20,
            metric_gaming_risk: "high"
          }
        }
      },
      {
        event_id: "bad-missing-holdout",
        hook: "pre_tool_call",
        tool_name: "skill_manage",
        args: { action: "patch", name: "missing-holdout-skill" },
        context: {
          conversation_signals: ["knowledge_gap"],
          evidence_refs: ["bad-missing-holdout-source"],
          evolution_evidence: {
            evidence_id: "bad-missing-holdout-proof",
            metric: "local_train_score",
            baseline_snapshot_id: "baseline-c",
            before_score: 0.4,
            after_score: 0.7,
            sample_count: 20,
            metric_gaming_risk: "low"
          }
        }
      }
    ]
  };
}

function runNegativeControl(now) {
  const adapter = buildHermesRuntimeAdapterReport({
    fixture: negativeControlFixture(),
    now
  });
  const pipeline = buildHermesWorkOrderPipeline({
    adapterReport: adapter,
    seed: "negative-control",
    now
  });
  const evidence = adapter.evolution_candidates.map((candidate) => ({
    source_event_id: candidate.source_event_ids[0],
    delta: candidate.evolution_evidence.delta,
    holdout_backed: candidate.evolution_evidence.holdout_backed,
    metric_gaming_risk: candidate.evolution_evidence.metric_gaming_risk,
    can_support_optimization: candidate.evolution_evidence.can_support_optimization
  }));

  return {
    ok: adapter.ok && pipeline.ok,
    event_count: adapter.summary.event_count,
    evolution_evidence_count: adapter.summary.evolution_evidence_count,
    holdout_evidence_count: adapter.summary.holdout_evidence_count,
    positive_optimization_evidence_count: adapter.summary.positive_optimization_evidence_count,
    supported_optimization_evidence_count: pipeline.quality.summary.supported_optimization_evidence_count,
    safety_regression_count: pipeline.quality.summary.safety_regression_count,
    llm_api_calls: pipeline.safety.llm_api_calls,
    external_api_calls: pipeline.safety.external_api_calls,
    correctly_rejected_bad_evidence: adapter.summary.positive_optimization_evidence_count === 0
      && pipeline.quality.summary.supported_optimization_evidence_count === 0
      && evidence.every((item) => item.can_support_optimization === false),
    evidence
  };
}

export async function runHermesValueProof({
  repoRoot = process.cwd(),
  seedCount = DEFAULT_SEED_COUNT,
  now = DEFAULT_NOW
} = {}) {
  const seeds = buildSeeds(seedCount);
  const workOrderEval = await runWorkOrderQualityEvaluation({
    repoRoot,
    seeds,
    includeExternalSamples: true,
    now
  });
  const hermesRunSummaries = [];
  const hermesComparisons = [];

  for (const input of HERMES_INPUTS) {
    for (const seed of seeds) {
      const result = await runHermesWorkOrderPipeline({
        ...input.options,
        repoRoot,
        seed,
        now
      });
      hermesRunSummaries.push({
        label: input.label,
        seed,
        ok: result.ok,
        events: result.adapter.summary.event_count,
        work_orders: result.routing.summary.work_order_count,
        evolution_evidence: result.adapter.summary.evolution_evidence_count,
        positive_optimization_evidence: result.adapter.summary.positive_optimization_evidence_count,
        llm_api_calls: result.safety.llm_api_calls,
        external_api_calls: result.safety.external_api_calls,
        writes_memory: result.safety.writes_persistent_memory,
        writes_skills: result.safety.writes_skills
      });
      for (const comparison of result.quality.comparisons) {
        hermesComparisons.push({
          ...comparison,
          source_label: input.label,
          seed
        });
      }
    }
  }

  const workOrderComparisons = workOrderEval.comparisons.map((item) => ({
    ...item,
    source_label: item.source_label ?? "work_order_quality_eval"
  }));
  const allComparisons = [...workOrderComparisons, ...hermesComparisons];
  const safetyCounters = {
    work_order_eval_llm_api_calls: workOrderEval.summary.llm_api_calls,
    work_order_eval_external_api_calls: workOrderEval.summary.external_api_calls,
    hermes_llm_api_calls: hermesRunSummaries.reduce((sum, item) => sum + item.llm_api_calls, 0),
    hermes_external_api_calls: hermesRunSummaries.reduce((sum, item) => sum + item.external_api_calls, 0),
    hermes_write_memory_runs: hermesRunSummaries.filter((item) => item.writes_memory).length,
    hermes_write_skill_runs: hermesRunSummaries.filter((item) => item.writes_skills).length
  };
  const negativeControl = runNegativeControl(now);
  const combined = summarizeComparisons("combined_work_order_plus_hermes", allComparisons);
  const deterministicValueGatePassed = allComparisons.length > 0
    && allComparisons.every((item) => item.positive_lift)
    && allComparisons.every((item) => !item.safety_regression)
    && workOrderEval.summary.dev_test.holdout_passed
    && Object.values(safetyCounters).every((value) => value === 0)
    && negativeControl.correctly_rejected_bad_evidence;

  return {
    schema_version: "misa.hermes_value_proof.v1",
    mode: "hermes-value-proof",
    ok: deterministicValueGatePassed,
    created_at: now.toISOString(),
    seed_count: seedCount,
    sample_surface: {
      work_order_source_set_count: workOrderEval.summary.source_set_count,
      work_order_count: workOrderEval.summary.work_order_count,
      unique_work_order_shape_count: workOrderEval.summary.unique_work_order_shape_count,
      external_issue_pr_sample_count: workOrderEval.sample_summary.external_issue_pr_sample_count,
      hermes_source_count: HERMES_INPUTS.length
    },
    work_order_quality_eval: {
      ok: workOrderEval.ok,
      holdout_passed: workOrderEval.summary.dev_test.holdout_passed,
      dev_avg_delta: workOrderEval.summary.dev_test.dev.avg_delta,
      test_avg_delta: workOrderEval.summary.dev_test.test.avg_delta,
      overfit_gap: workOrderEval.summary.dev_test.overfit_gap,
      variant_count: workOrderEval.summary.variant_count,
      budget_saved_variants: workOrderEval.summary.budget_control.saved_variant_count_against_fixed5,
      model_role_clean_split_count: workOrderEval.summary.model_role_separation.clean_split_count,
      llm_mutation_crossover_enabled_count: workOrderEval.summary.llm_mutation_crossover.enabled_count,
      ...summarizeComparisons("work_order_quality_eval", workOrderComparisons)
    },
    hermes_by_source: Object.fromEntries(HERMES_INPUTS.map((input) => {
      const runs = hermesRunSummaries.filter((item) => item.label === input.label);
      return [
        input.label,
        {
          runs: runs.length,
          all_runs_ok: runs.every((item) => item.ok),
          total_events: runs.reduce((sum, item) => sum + item.events, 0),
          total_work_orders: runs.reduce((sum, item) => sum + item.work_orders, 0),
          total_evolution_evidence: runs.reduce((sum, item) => sum + item.evolution_evidence, 0),
          total_positive_optimization_evidence: runs.reduce((sum, item) => sum + item.positive_optimization_evidence, 0),
          ...summarizeComparisons(input.label, hermesComparisons.filter((item) => item.source_label === input.label))
        }
      ];
    })),
    combined,
    negative_control: negativeControl,
    safety_counters: safetyCounters,
    verdict: deterministicValueGatePassed
      ? "positive_for_current_local_corpus"
      : "not_release_ready",
    hard_limit: "This is deterministic evidence for the current local corpus and seeds, not a mathematical guarantee for unknown future data."
      + " It measures Qianxuesen's synthetic/local discriminator consistency, not Hermes official self-evolution accuracy; the current runtime tap has no official_evolution_candidate rows unless explicitly supplied."
  };
}

function printSummary(result) {
  console.log("misa Hermes value proof");
  console.log(`ok: ${result.ok}`);
  console.log(`seed_count: ${result.seed_count}`);
  console.log(`work_order_sources: ${result.sample_surface.work_order_source_set_count}`);
  console.log(`external_issue_pr_samples: ${result.sample_surface.external_issue_pr_sample_count}`);
  console.log(`combined_comparisons: ${result.combined.comparison_count}`);
  console.log(`positive_lift_rate: ${result.combined.positive_lift_rate}`);
  console.log(`avg_delta: ${result.combined.avg_delta}`);
  console.log(`min_delta: ${result.combined.min_delta}`);
  console.log(`safety_regressions: ${result.combined.safety_regression_count}`);
  console.log(`holdout_passed: ${result.work_order_quality_eval.holdout_passed}`);
  console.log(`evolution_evidence: ${result.combined.evolution_evidence_count}`);
  console.log(`supported_optimization_evidence: ${result.combined.supported_optimization_evidence_count}`);
  console.log(`negative_control_rejected: ${result.negative_control.correctly_rejected_bad_evidence}`);
  console.log(`llm_api_calls: ${result.safety_counters.work_order_eval_llm_api_calls + result.safety_counters.hermes_llm_api_calls}`);
  console.log(`external_api_calls: ${result.safety_counters.work_order_eval_external_api_calls + result.safety_counters.hermes_external_api_calls}`);
  console.log(`verdict: ${result.verdict}`);
}

async function main() {
  const nowArg = readArg("now");
  const result = await runHermesValueProof({
    repoRoot: process.cwd(),
    seedCount: parseSeedCount(readArg("seed-count")),
    now: nowArg ? new Date(nowArg) : DEFAULT_NOW
  });

  await writeJsonOutFile(result, readArg("out-file"));

  if (hasArg("json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
