import fs from "node:fs/promises";
import path from "node:path";

export function renderWorkOrderQualityMarkdown(result) {
  const lines = [
    "# Work Order Quality Evaluation",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- source_set_count: ${result.summary.source_set_count}`,
    `- work_order_count: ${result.summary.work_order_count}`,
    `- external_issue_pr_samples: ${result.sample_summary.external_issue_pr_sample_count}`,
    `- dev_samples: ${result.sample_summary.dev_sample_count}`,
    `- test_samples: ${result.sample_summary.test_sample_count}`,
    `- comparison_count: ${result.summary.comparison_count}`,
    `- variant_count: ${result.summary.variant_count}`,
    `- budget_policy: ${result.summary.budget_control.policy}`,
    `- fixed5_variant_budget: ${result.summary.budget_control.fixed5_variant_budget}`,
    `- saved_variant_count_against_fixed5: ${result.summary.budget_control.saved_variant_count_against_fixed5}`,
    `- avg_baseline_score: ${result.summary.avg_baseline_score}`,
    `- avg_winner_score: ${result.summary.avg_winner_score}`,
    `- avg_delta: ${result.summary.avg_delta}`,
    `- test_avg_delta: ${result.summary.dev_test.test.avg_delta}`,
    `- holdout_passed: ${result.summary.dev_test.holdout_passed}`,
    `- positive_lift_rate: ${result.summary.positive_lift_rate}`,
    `- safety_regression_count: ${result.summary.safety_regression_count}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    `- llm_mutation_crossover_review_worthy_count: ${result.summary.llm_mutation_crossover.review_worthy_count}`,
    `- primary_agent_inline_review_count: ${result.summary.llm_mutation_crossover.primary_agent_inline_review_count}`,
    `- separate_llm_call_required_count: ${result.summary.llm_mutation_crossover.separate_llm_call_required_count}`,
    `- llm_mutation_crossover_enabled_count: ${result.summary.llm_mutation_crossover.enabled_count}`,
    `- model_role_clean_split_count: ${result.summary.model_role_separation.clean_split_count}`,
    `- selection_policy: ${result.summary.selection_update.policy}`,
    `- replacement_allowed_count: ${result.summary.selection_update.replacement_allowed_count}`,
    `- incumbent_retained_count: ${result.summary.selection_update.incumbent_retained_count}`,
    `- diversity_policy: ${result.summary.diversity_guard.policy}`,
    `- diversity_applied_count: ${result.summary.diversity_guard.applied_count}`,
    `- unique_winner_strategy_count: ${result.summary.diversity_guard.unique_winner_strategy_count}`,
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
  await fs.writeFile(mdPath, renderWorkOrderQualityMarkdown(withOutput), "utf8");

  return withOutput;
}
