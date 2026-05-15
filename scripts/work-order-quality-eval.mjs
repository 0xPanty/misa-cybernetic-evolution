#!/usr/bin/env node

import { writeJsonOutFile } from "./lib/cli-output.mjs";
import {
  DEFAULT_WORK_ORDER_BUDGET_POLICY,
  DEFAULT_WORK_ORDER_DIVERSITY_POLICY,
  DEFAULT_WORK_ORDER_EVAL_SEEDS,
  DEFAULT_WORK_ORDER_SELECTION_POLICY,
  runWorkOrderQualityEvaluation,
  writeWorkOrderQualityArtifacts
} from "./lib/work-order-quality-eval.mjs";

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

function parseSeeds(value) {
  if (!value) return DEFAULT_WORK_ORDER_EVAL_SEEDS;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const nowArg = readArg("now");
const now = nowArg ? new Date(nowArg) : new Date();
const seeds = parseSeeds(readArg("seeds") ?? readArg("seed"));
const dryRun = hasArg("dry-run") || hasArg("no-write");
const includeExternalSamples = !hasArg("no-external-samples");
const selectionPolicy = hasArg("no-selection-update")
  ? "legacy"
  : readArg("selection-policy") ?? DEFAULT_WORK_ORDER_SELECTION_POLICY;
const diversityPolicy = hasArg("no-diversity-guard")
  ? "off"
  : readArg("diversity-policy") ?? DEFAULT_WORK_ORDER_DIVERSITY_POLICY;
const budgetPolicy = hasArg("fixed-population")
  ? "fixed_5"
  : readArg("budget-policy") ?? DEFAULT_WORK_ORDER_BUDGET_POLICY;

let result = await runWorkOrderQualityEvaluation({
  seeds,
  includeExternalSamples,
  externalSampleDir: readArg("external-sample-dir"),
  selectionPolicy,
  diversityPolicy,
  budgetPolicy,
  now
});

if (!dryRun) {
  result = await writeWorkOrderQualityArtifacts({
    result,
    outDir: readArg("out-dir"),
    now
  });
}

await writeJsonOutFile(result, readArg("out-file"));

if (hasArg("json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`work-order-quality ok=${result.ok}`);
  console.log(`sources=${result.summary.source_set_count}`);
  console.log(`work_orders=${result.summary.work_order_count}`);
  console.log(`external_issue_pr_samples=${result.sample_summary.external_issue_pr_sample_count}`);
  console.log(`dev_samples=${result.sample_summary.dev_sample_count}`);
  console.log(`test_samples=${result.sample_summary.test_sample_count}`);
  console.log(`comparisons=${result.summary.comparison_count}`);
  console.log(`variants=${result.summary.variant_count}`);
  console.log(`budget_policy=${result.summary.budget_control.policy}`);
  console.log(`fixed5_variant_budget=${result.summary.budget_control.fixed5_variant_budget}`);
  console.log(`saved_variants=${result.summary.budget_control.saved_variant_count_against_fixed5}`);
  console.log(`avg_delta=${result.summary.avg_delta}`);
  console.log(`test_avg_delta=${result.summary.dev_test.test.avg_delta}`);
  console.log(`holdout_passed=${result.summary.dev_test.holdout_passed}`);
  console.log(`positive_lift_rate=${result.summary.positive_lift_rate}`);
  console.log(`safety_regressions=${result.summary.safety_regression_count}`);
  console.log(`llm_api_calls=${result.summary.llm_api_calls}`);
  console.log(`selection_policy=${result.summary.selection_update.policy}`);
  console.log(`incumbent_retained=${result.summary.selection_update.incumbent_retained_count}`);
  console.log(`diversity_policy=${result.summary.diversity_guard.policy}`);
  console.log(`diversity_applied=${result.summary.diversity_guard.applied_count}`);
  if (result.output) {
    console.log(`output_dir=${result.output.output_dir}`);
  }
}

process.exitCode = result.ok ? 0 : 1;
