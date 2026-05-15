import fs from "node:fs/promises";
import path from "node:path";
import { routeWorkOrders } from "./work-order-router.mjs";

const DEFAULT_SEED = "misa-work-order-variants-v1";
const DEFAULT_NOW = new Date("2026-05-15T00:00:00Z");

const STRATEGIES = [
  {
    strategy: "conservative_patch",
    mutation_kind: "scope_narrowing",
    summary: "Keep the original work order shape, but narrow the edit scope and make the first pass smaller.",
    acceptance: "the first implementation pass touches only the smallest necessary file set",
    verification: "run the original reproduction command before any wider refactor",
    forbidden: "do not expand the task into adjacent cleanup"
  },
  {
    strategy: "evidence_expansion",
    mutation_kind: "evidence_strengthening",
    summary: "Add source refs, before/after evidence, and reproduction notes before execution.",
    acceptance: "the work order names the source evidence and the expected before/after behavior",
    verification: "verify the failing or drifting behavior is reproduced before patching",
    forbidden: "do not act on an untraceable summary"
  },
  {
    strategy: "boundary_tightening",
    mutation_kind: "safety_boundary_refinement",
    summary: "Keep the useful work, but make blocked durable, public, memory, skill, provider, or VPS effects explicit.",
    acceptance: "blocked operations remain visible in the work order and verifier output",
    verification: "run the no-live-effect guard after the work order is handled",
    forbidden: "do not write memory, publish, install skills, call providers, or touch production"
  },
  {
    strategy: "replay_extension",
    mutation_kind: "replay_dataset_refinement",
    summary: "Turn the work order into a replayable comparison task with a baseline and a candidate check.",
    acceptance: "the task has at least one baseline check and one candidate check",
    verification: "compare baseline and candidate behavior before reporting a winner",
    forbidden: "do not promote the candidate only because it sounds better"
  },
  {
    strategy: "compact_handoff",
    mutation_kind: "handoff_compaction",
    summary: "Compress the handoff to the executor into source, task, acceptance, forbidden scope, and stop condition.",
    acceptance: "the final work order can be executed without reading unrelated project history",
    verification: "the handoff still preserves source refs, acceptance criteria, and forbidden scope",
    forbidden: "do not remove rollback, audit, or forbidden-scope notes"
  }
];

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed, salt) {
  return (stableHash(`${seed}:${salt}`) % 10000) / 10000;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function severityValue(severity) {
  return { P0: 1, P1: 0.82, P2: 0.58, P3: 0.34 }[severity] ?? 0.45;
}

function riskValue(riskLevel) {
  return { critical: 1, high: 0.86, medium: 0.58, low: 0.3 }[riskLevel] ?? 0.45;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function safeId(value) {
  return String(value || "work-order")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 100) || "work-order";
}

function countWords(values = []) {
  return values.join(" ").split(/\s+/).filter(Boolean).length;
}

function evidenceScore(order) {
  const trace = order.traceability ?? {};
  const refs = order.source_refs ?? [];
  const reproduction = trace.reproduction_commands ?? [];
  const acceptance = trace.acceptance_criteria ?? [];
  return clamp01(
    refs.length * 0.12
      + reproduction.length * 0.16
      + acceptance.length * 0.12
      + (trace.source_refs_required ? 0.18 : 0)
      + (trace.audit_required ? 0.12 : 0)
      + (Object.keys(trace.evidence ?? {}).length ? 0.18 : 0)
  );
}

function baseValueScore(order) {
  return clamp01(
    severityValue(order.severity) * 0.34
      + riskValue(order.risk_level) * 0.24
      + (order.task_gate?.valuable_enough ? 0.16 : 0)
      + (order.task_gate?.doable_enough ? 0.12 : 0)
      + (order.model_handoff?.stronger_model_recommended ? 0.08 : 0)
      + (order.execution_policy?.agent_self_review_allowed ? 0.06 : 0)
  );
}

function uncertaintyScore(order, variants) {
  const sorted = [...variants].sort((a, b) => b.scores.composite - a.scores.composite);
  const margin = sorted.length > 1 ? sorted[0].scores.composite - sorted[1].scores.composite : 1;
  return clamp01(
    (order.model_handoff?.stronger_model_recommended ? 0.28 : 0)
      + (["critical", "high"].includes(order.risk_level) ? 0.22 : 0)
      + (order.task_gate?.error_discovery_cost === "high" ? 0.16 : 0)
      + (margin < 0.06 ? 0.22 : margin < 0.1 ? 0.12 : 0)
      + (order.category === "operator_quality" ? 0.08 : 0)
  );
}

function scoreStrategyFit(order, strategy) {
  if (strategy === "conservative_patch") {
    return clamp01(0.62 + (order.severity === "P3" ? 0.16 : 0) + (order.risk_level === "low" ? 0.12 : 0));
  }
  if (strategy === "evidence_expansion") {
    return clamp01(0.58 + (evidenceScore(order) < 0.75 ? 0.24 : 0) + (order.model_handoff?.stronger_model_recommended ? 0.08 : 0));
  }
  if (strategy === "boundary_tightening") {
    return clamp01(0.56 + (["critical", "high"].includes(order.risk_level) ? 0.24 : 0) + (order.traceability?.forbidden_scope?.length ? 0.08 : 0));
  }
  if (strategy === "replay_extension") {
    return clamp01(0.56 + (order.execution_policy?.self_evolution_allowed ? 0.14 : 0) + (order.task_gate?.complex_enough ? 0.12 : 0));
  }
  if (strategy === "compact_handoff") {
    return clamp01(0.64 + (countWords([order.summary, ...(order.traceability?.acceptance_criteria ?? [])]) > 60 ? 0.18 : 0));
  }
  return 0.5;
}

function qianxuesenStrategyAlignment(order, strategy) {
  if (["critical", "high"].includes(order.risk_level)) {
    if (strategy === "boundary_tightening") return 1;
    if (strategy === "replay_extension") return 0.62;
    if (strategy === "compact_handoff") return 0.58;
    if (strategy === "evidence_expansion") return 0.55;
    return 0.42;
  }
  if (order.risk_level === "medium") {
    if (strategy === "replay_extension") return 1;
    if (strategy === "compact_handoff") return 0.84;
    if (strategy === "evidence_expansion") return 0.78;
    if (strategy === "boundary_tightening") return 0.62;
    return 0.48;
  }
  if (order.risk_level === "low") {
    if (strategy === "conservative_patch") return 1;
    if (strategy === "compact_handoff") return 0.72;
    if (strategy === "boundary_tightening") return 0.6;
    if (strategy === "evidence_expansion") return 0.56;
    return 0.5;
  }
  return 0.55;
}

function buildVariant(order, strategyDef, { seed, rank }) {
  const trace = order.traceability ?? {};
  const baseValue = baseValueScore(order);
  const evidence = evidenceScore(order);
  const strategyFit = scoreStrategyFit(order, strategyDef.strategy);
  const qianxuesenAlignment = qianxuesenStrategyAlignment(order, strategyDef.strategy);
  const safety = 1;
  const clarity = clamp01(
    (trace.acceptance_criteria?.length ? 0.28 : 0)
      + (trace.reproduction_commands?.length ? 0.18 : 0)
      + (trace.forbidden_scope?.length ? 0.18 : 0)
      + (order.user_prompt ? 0.12 : 0)
      + (order.suggested_executor?.executor_type ? 0.1 : 0)
  );
  const complexityPenalty = clamp01(
    (trace.editable_scope?.length ?? 0) * 0.04
      + (trace.reproduction_commands?.length ?? 0) * 0.03
      + (order.model_handoff?.stronger_model_recommended ? 0.08 : 0)
  );
  const novelty = clamp01(0.35 + rank * 0.08 + seededUnit(seed, `${order.work_order_id}:${strategyDef.strategy}`) * 0.16);
  const deterministicJitter = seededUnit(seed, `${strategyDef.strategy}:${order.work_order_id}:score`) * 0.025;
  const composite = clamp01(
    baseValue * 0.2
      + evidence * 0.18
      + safety * 0.2
      + clarity * 0.16
      + strategyFit * 0.16
      + qianxuesenAlignment * 0.08
      + novelty * 0.06
      - complexityPenalty * 0.08
      + deterministicJitter
  );

  return {
    variant_id: `${order.work_order_id}:${strategyDef.strategy}`,
    strategy: strategyDef.strategy,
    mutation_kind: strategyDef.mutation_kind,
    source_work_order_id: order.work_order_id,
    title: `${order.title} (${strategyDef.strategy.replaceAll("_", " ")})`,
    summary: strategyDef.summary,
    proposed_task_shape: {
      keep: [
        "source refs",
        "suggested executor",
        "acceptance criteria",
        "forbidden scope",
        "no-live-effect boundary"
      ],
      add_or_emphasize: [
        strategyDef.acceptance,
        strategyDef.verification
      ],
      stop_condition: strategyDef.forbidden
    },
    acceptance_criteria: [
      ...(trace.acceptance_criteria ?? []),
      strategyDef.acceptance
    ],
    verification_focus: strategyDef.verification,
    forbidden_scope: [
      ...(trace.forbidden_scope ?? []),
      strategyDef.forbidden
    ],
    requested_operations: [],
    safety: {
      production_authority: false,
      durable_or_public_effect_allowed: false,
      writes_persistent_memory: false,
      installs_skills: false,
      calls_llm: false,
      calls_external_api: false
    },
    scores: {
      value: round(baseValue),
      evidence: round(evidence),
      safety: round(safety),
      clarity: round(clarity),
      strategy_fit: round(strategyFit),
      qianxuesen_alignment: round(qianxuesenAlignment),
      novelty: round(novelty),
      complexity_penalty: round(complexityPenalty),
      deterministic_jitter: round(deterministicJitter),
      composite: round(composite)
    },
    constraints: {
      hard_gate_passed: safety === 1,
      route_preserved: true,
      source_trace_preserved: true,
      no_live_effects: true,
      no_llm_call: true,
      no_direct_execution: true,
      violations: []
    }
  };
}

function chooseWinner(variants) {
  return [...variants].sort((a, b) => (
    b.scores.composite - a.scores.composite
    || b.scores.safety - a.scores.safety
    || b.scores.evidence - a.scores.evidence
    || a.variant_id.localeCompare(b.variant_id)
  ))[0];
}

function selectStrategyDefinitions(order, { seed, populationSize, requiredStrategies = [] }) {
  const byStrategy = new Map(STRATEGIES.map((strategy) => [strategy.strategy, strategy]));
  const required = requiredStrategies
    .map((strategy) => byStrategy.get(strategy))
    .filter(Boolean);
  const selected = [];
  const seen = new Set();

  for (const strategy of required) {
    if (!seen.has(strategy.strategy) && selected.length < populationSize) {
      selected.push(strategy);
      seen.add(strategy.strategy);
    }
  }

  const seeded = STRATEGIES
    .filter((strategy) => !seen.has(strategy.strategy))
    .map((strategy, index) => ({
      strategy,
      sortKey: seededUnit(seed, `${order.work_order_id}:${strategy.strategy}:order`),
      index
    }))
    .sort((a, b) => a.sortKey - b.sortKey || a.index - b.index);

  for (const item of seeded) {
    if (selected.length >= populationSize) break;
    selected.push(item.strategy);
  }

  return selected;
}

function buildLlmReviewGate(order, variants, winner) {
  const sorted = [...variants].sort((a, b) => b.scores.composite - a.scores.composite);
  const runnerUp = sorted.find((variant) => variant.variant_id !== winner.variant_id);
  const margin = runnerUp ? winner.scores.composite - runnerUp.scores.composite : 1;
  const value = baseValueScore(order);
  const uncertainty = uncertaintyScore(order, variants);
  const importantCategory = ["engineering_repair", "operator_quality"].includes(order.category);
  const recommended = value >= 0.62
    && uncertainty >= 0.55
    && margin <= 0.1
    && importantCategory;

  return {
    recommended,
    level: recommended ? "high" : uncertainty >= 0.45 ? "medium" : "none",
    expected_value: recommended ? "critique_only" : uncertainty >= 0.45 ? "diagnostic_note_only" : "none",
    reason: recommended
      ? "High-value work order with close deterministic variants; an LLM critique may improve clarity before execution."
      : "Deterministic scoring is enough; spending a model call would likely add noise.",
    trigger_signals: [
      `value:${round(value)}`,
      `uncertainty:${round(uncertainty)}`,
      `winner_margin:${round(margin)}`,
      `risk:${order.risk_level}`,
      `category:${order.category}`
    ],
    call_policy: recommended ? "call_when_auto_enabled" : "do_not_call",
    should_change_winner: false,
    allowed_outputs: [
      "critique_note",
      "risk_note",
      "clarity_improvement",
      "verification_gap",
      "overdesign_warning"
    ],
    forbidden_outputs: [
      "execute_work_order",
      "publish_change",
      "write_memory",
      "install_skill",
      "skip_replay"
    ],
    llm_api_calls: 0
  };
}

function buildLlmMutationCrossoverGate(order, variants, winner, llmReviewGate) {
  const sorted = [...variants].sort((a, b) => b.scores.composite - a.scores.composite);
  const runnerUp = sorted.find((variant) => variant.variant_id !== winner.variant_id);
  const margin = runnerUp ? winner.scores.composite - runnerUp.scores.composite : 1;
  const strategyCount = new Set(variants.map((variant) => variant.strategy)).size;
  const highValueButUncertain = llmReviewGate.recommended && margin <= 0.1;
  const candidateValue = highValueButUncertain && order.risk_level !== "low"
    ? "review_worthy"
    : llmReviewGate.level === "medium"
      ? "diagnostic_only"
      : "none";

  return {
    enabled: false,
    candidate_value: candidateValue,
    level: candidateValue === "review_worthy" ? "high" : candidateValue === "diagnostic_only" ? "medium" : "none",
    call_policy: "do_not_call",
    activation_required: "explicit_manual_enable_after_holdout_lift",
    reason: candidateValue === "review_worthy"
      ? "A stronger model could critique mutation or crossover ideas, but the deterministic controller keeps winner authority."
      : "Deterministic candidates are enough for this work order; LLM mutation/crossover would add cost before proven value.",
    trigger_signals: [
      `risk:${order.risk_level}`,
      `strategy_count:${strategyCount}`,
      `winner_margin:${round(margin)}`,
      `review_gate:${llmReviewGate.level}`,
      `winner_strategy:${winner.strategy}`
    ],
    allowed_outputs_if_enabled: [
      "mutation_suggestion",
      "crossover_suggestion",
      "verification_gap",
      "overdesign_warning"
    ],
    forbidden_outputs: [
      "execute_work_order",
      "change_route",
      "change_winner_without_deterministic_rescore",
      "publish_change",
      "write_memory",
      "install_skill",
      "skip_holdout"
    ],
    mutation_candidate_allowed: false,
    crossover_candidate_allowed: false,
    should_change_winner: false,
    route_or_winner_authority: false,
    llm_api_calls: 0
  };
}

function buildModelRoleSeparation() {
  return {
    policy: "deterministic_controller_owns_route_score_and_selection",
    deterministic_controller: {
      owns_route: true,
      owns_scoring: true,
      owns_selection: true,
      owns_safety_gate: true
    },
    evolution_model: {
      role: "optional_candidate_critic_or_mutation_crossover_suggester",
      default_call_policy: "do_not_call",
      can_execute: false,
      can_change_route: false,
      can_change_winner: false,
      can_write_memory: false
    },
    task_model: {
      role: "approved_work_order_executor_after_handoff",
      called_by_variant_layer: false,
      can_self_select_candidate: false,
      can_bypass_acceptance_or_forbidden_scope: false
    }
  };
}

function variantLedger(variants, winner) {
  return variants
    .filter((variant) => variant.variant_id !== winner.variant_id)
    .map((variant) => ({
      variant_id: variant.variant_id,
      strategy: variant.strategy,
      status: variant.constraints.hard_gate_passed ? "loser" : "rejected",
      reason: variant.constraints.hard_gate_passed
        ? `safe but lower composite than ${winner.variant_id}`
        : `rejected by constraints: ${variant.constraints.violations.join(", ")}`,
      retained_as: variant.constraints.hard_gate_passed ? "non_winning_work_order_experience" : "blocked_shape_evidence"
    }));
}

function buildOrderResult(order, { seed, populationSize, requiredStrategies }) {
  const selected = selectStrategyDefinitions(order, {
    seed,
    populationSize,
    requiredStrategies
  }).map((strategy, index) => buildVariant(order, strategy, { seed, rank: index }));
  const variants = selected.sort((a, b) => b.scores.composite - a.scores.composite || a.variant_id.localeCompare(b.variant_id));
  const winner = chooseWinner(variants);
  const llmReviewGate = buildLlmReviewGate(order, variants, winner);
  const llmMutationCrossoverGate = buildLlmMutationCrossoverGate(order, variants, winner, llmReviewGate);

  return {
    work_order_id: order.work_order_id,
    title: order.title,
    category: order.category,
    severity: order.severity,
    risk_level: order.risk_level,
    source: order.source ?? {},
    candidate_value_score: round(baseValueScore(order)),
    variants,
    winner: {
      variant_id: winner.variant_id,
      strategy: winner.strategy,
      composite_score: winner.scores.composite,
      recommended_surface: "work_order_draft_only",
      execution_allowed: false,
      publication_allowed: false,
      rationale: winner.summary
    },
    loser_ledger: variantLedger(variants, winner),
    llm_review_gate: llmReviewGate,
    llm_mutation_crossover_gate: llmMutationCrossoverGate,
    model_role_separation: buildModelRoleSeparation()
  };
}

function countBy(items, fn) {
  return items.reduce((counts, item) => {
    const key = fn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function buildSummary(results) {
  const variants = results.flatMap((result) => result.variants);
  return {
    work_order_count: results.length,
    variant_count: variants.length,
    winner_count: results.length,
    rejected_variant_count: variants.filter((variant) => !variant.constraints.hard_gate_passed).length,
    llm_critique_recommended_count: results.filter((result) => result.llm_review_gate.recommended).length,
    llm_mutation_crossover_review_worthy_count: results.filter((result) => result.llm_mutation_crossover_gate.candidate_value === "review_worthy").length,
    llm_api_calls: 0,
    external_api_calls: 0,
    by_winner_strategy: countBy(results, (result) => result.winner.strategy)
  };
}

export function buildWorkOrderVariants({
  workOrderRouting,
  seed = DEFAULT_SEED,
  populationSize = 5,
  requiredStrategies = [],
  now = DEFAULT_NOW
} = {}) {
  const size = Math.max(3, Math.min(Number(populationSize) || 5, STRATEGIES.length));
  const orderResults = (workOrderRouting?.work_orders ?? []).map((order) => buildOrderResult(order, {
    seed,
    populationSize: size,
    requiredStrategies
  }));
  const summary = buildSummary(orderResults);

  return {
    schema_version: "misa.work_order_variants.v1",
    mode: "work-order-variants",
    ok: true,
    created_at: asIsoDate(now),
    seed,
    mutation_policy: {
      population_size: size,
      max_rounds: 1,
      deterministic_seeded_randomness: true,
      strategies: STRATEGIES.map((item) => item.strategy),
      llm_policy: {
        default_call_policy: "do_not_call",
        intervention_rule: "recommend critique only when deterministic value, uncertainty, and close-margin signals justify token cost",
        allowed_role: "critique_only",
        mutation_crossover_policy: {
          enabled: false,
          default_call_policy: "do_not_call",
          activation_rule: "requires explicit manual enablement and side-by-side holdout lift before any LLM mutation or crossover candidate is generated",
          allowed_role_if_enabled: "candidate_suggester_only",
          route_or_winner_authority: false,
          llm_api_calls: 0
        },
        route_or_winner_authority: false
      }
    },
    model_role_policy: buildModelRoleSeparation(),
    source_routing_summary: workOrderRouting?.summary ?? {
      work_order_count: 0
    },
    summary,
    work_order_results: orderResults,
    safety: {
      production_authority: false,
      executes_work_orders: false,
      writes_persistent_memory: false,
      installs_skills: false,
      durable_or_public_effect_allowed: false,
      changes_route: false,
      changes_winner_authority: false,
      llm_api_calls: 0,
      external_api_calls: 0
    },
    warnings: [
      "Work-order variants are local draft choices, not execution permission.",
      "Seeded randomness expands the candidate search space while keeping tests reproducible.",
      "LLM critique is only recommended by value signals; this command does not call a model.",
      "LLM mutation and crossover are formal gates only; they are disabled by default and have no route, winner, or execution authority."
    ]
  };
}

export async function runWorkOrderVariants({
  repoRoot = process.cwd(),
  workOrderRouting,
  seed = DEFAULT_SEED,
  populationSize = 5,
  requiredStrategies = [],
  now = DEFAULT_NOW
} = {}) {
  const routing = workOrderRouting ?? await routeWorkOrders({ repoRoot, now });
  return buildWorkOrderVariants({
    workOrderRouting: routing,
    seed,
    populationSize,
    requiredStrategies,
    now
  });
}

function renderMarkdown(result) {
  const lines = [
    "# Work Order Variants",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- seed: ${result.seed}`,
    `- work_order_count: ${result.summary.work_order_count}`,
    `- variant_count: ${result.summary.variant_count}`,
    `- llm_critique_recommended_count: ${result.summary.llm_critique_recommended_count}`,
    `- llm_mutation_crossover_review_worthy_count: ${result.summary.llm_mutation_crossover_review_worthy_count}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    "",
    "## Safety",
    "",
    `- executes_work_orders: ${result.safety.executes_work_orders}`,
    `- writes_persistent_memory: ${result.safety.writes_persistent_memory}`,
    `- installs_skills: ${result.safety.installs_skills}`,
    `- durable_or_public_effect_allowed: ${result.safety.durable_or_public_effect_allowed}`,
    ""
  ];

  for (const item of result.work_order_results) {
    lines.push(
      `## ${item.work_order_id}`,
      "",
      `- title: ${item.title}`,
      `- severity: ${item.severity}`,
      `- risk_level: ${item.risk_level}`,
      `- winner: ${item.winner.variant_id}`,
      `- winner_strategy: ${item.winner.strategy}`,
      `- llm_review: ${item.llm_review_gate.level}`,
      `- llm_mutation_crossover: ${item.llm_mutation_crossover_gate.level}`,
      "",
      item.winner.rationale,
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function writeWorkOrderVariantArtifacts({
  result,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "work-order-variants", stamp));

  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "work-order-variants.json");
  const mdPath = path.join(outputRoot, "work-order-variants.md");
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
