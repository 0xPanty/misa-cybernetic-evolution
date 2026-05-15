import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CALIBRATION_SAMPLE_SETS } from "./current-line-calibration.mjs";
import { reviewRepairTickets } from "./repair-ticket.mjs";
import { buildWorkOrderRouting } from "./work-order-router.mjs";
import { buildWorkOrderVariants } from "./work-order-variants.mjs";

const DEFAULT_NOW = new Date("2026-05-15T00:00:00Z");
export const DEFAULT_EXTERNAL_SAMPLE_DIR = path.join("examples", "work-order-quality", "external-issue-pr");

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

export const DEFAULT_WORK_ORDER_SELECTION_POLICY = "quality_replacement";
export const DEFAULT_WORK_ORDER_DIVERSITY_POLICY = "strategy_guard";
const SCORE_TIE_TOLERANCE = 0.001;

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

function stableSlug(value) {
  return String(value || "sample")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120) || "sample";
}

function stableHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
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

function variantMetrics(order, orderResult, selectedVariant) {
  const variant = selectedVariant
    ?? orderResult.variants.find((item) => item.variant_id === orderResult.winner.variant_id)
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

function scoreVariant(order, orderResult, variant, surface) {
  const metrics = variantMetrics(order, orderResult, variant);
  const { variant: scoredVariant, ...serializableMetrics } = metrics;
  return {
    surface,
    variant_id: scoredVariant?.variant_id,
    strategy: scoredVariant?.strategy,
    metrics: serializableMetrics,
    dimensions: dimensionsFromMetrics(metrics)
  };
}

export function scoreVariantCandidate(order, orderResult, variant) {
  return scoreVariant(order, orderResult, variant, "variant_candidate");
}

export function scoreVariantWinner(order, orderResult) {
  return scoreVariant(order, orderResult, undefined, "variant_winner");
}

function hasSafetyRegression(score) {
  const safety = score.metrics.safety;
  return Boolean(
    safety.durable_or_public_effect_allowed
      || safety.writes_persistent_memory
      || safety.installs_skills
      || safety.calls_external_api
      || safety.executes_work_orders
  );
}

function normalizeSelectionPolicy(policy) {
  return policy === "legacy" ? "legacy" : DEFAULT_WORK_ORDER_SELECTION_POLICY;
}

function normalizeDiversityPolicy(policy) {
  return policy === "off" ? "off" : DEFAULT_WORK_ORDER_DIVERSITY_POLICY;
}

function diversityStrategyFamily(order) {
  if (["critical", "high"].includes(order.risk_level)) return ["boundary_tightening"];
  if (order.risk_level === "medium") return ["replay_extension", "compact_handoff", "evidence_expansion"];
  if (order.risk_level === "low") return ["conservative_patch"];
  return ["compact_handoff", "evidence_expansion", "replay_extension"];
}

function buildCandidateScores(order, orderResult, baseline) {
  return orderResult.variants.map((variant) => {
    const score = scoreVariantCandidate(order, orderResult, variant);
    const delta = round(score.dimensions.total - baseline.dimensions.total);
    const safetyRegression = hasSafetyRegression(score);
    return {
      variant,
      score,
      delta,
      safety_regression: safetyRegression,
      replacement_allowed: delta > 0 && !safetyRegression
    };
  });
}

function compareCandidateRank(a, b) {
  return b.score.dimensions.total - a.score.dimensions.total
    || b.variant.scores.qianxuesen_alignment - a.variant.scores.qianxuesen_alignment
    || b.variant.scores.composite - a.variant.scores.composite
    || b.variant.scores.safety - a.variant.scores.safety
    || b.variant.scores.evidence - a.variant.scores.evidence
    || a.variant.variant_id.localeCompare(b.variant.variant_id);
}

function chooseDiversityCandidate({ order, seed, selected, candidates }) {
  if (!selected?.replacement_allowed) return undefined;
  const family = diversityStrategyFamily(order);
  if (family.length <= 1) return undefined;

  const viable = candidates.filter((candidate) => (
    candidate.replacement_allowed
      && family.includes(candidate.variant.strategy)
      && candidate.score.dimensions.total >= selected.score.dimensions.total - SCORE_TIE_TOLERANCE
  ));
  if (!viable.length) return undefined;

  const offset = stableHash(`${seed}:${order.work_order_id}:diversity`) % family.length;
  const rotatedFamily = [
    ...family.slice(offset),
    ...family.slice(0, offset)
  ];
  const chosen = viable.sort((a, b) => (
    rotatedFamily.indexOf(a.variant.strategy) - rotatedFamily.indexOf(b.variant.strategy)
    || compareCandidateRank(a, b)
  ))[0];
  return chosen.variant.strategy === selected.variant.strategy ? undefined : chosen;
}

function selectQualityWinner({
  order,
  orderResult,
  baseline,
  seed,
  selectionPolicy,
  diversityPolicy
}) {
  const candidates = buildCandidateScores(order, orderResult, baseline);
  const legacy = candidates.find((candidate) => candidate.variant.variant_id === orderResult.winner.variant_id)
    ?? candidates[0];
  const ranked = [...candidates]
    .filter((candidate) => selectionPolicy === "legacy" || candidate.replacement_allowed)
    .sort(compareCandidateRank);
  let selected = selectionPolicy === "legacy" ? legacy : ranked[0];
  const selectedBeforeDiversity = selected;
  const diversityEnabled = diversityPolicy === DEFAULT_WORK_ORDER_DIVERSITY_POLICY;
  const diversityCandidate = diversityEnabled
    ? chooseDiversityCandidate({ order, seed, selected, candidates })
    : undefined;
  if (diversityCandidate) {
    selected = diversityCandidate;
  }

  const candidateStrategyCounts = countBy(candidates, (candidate) => candidate.variant.strategy);
  const replacementAllowed = selectionPolicy === "legacy"
    ? Boolean(selected)
    : Boolean(selected?.replacement_allowed);
  const winnerScore = replacementAllowed ? {
    ...selected.score,
    surface: "variant_winner"
  } : baseline;
  const winnerDelta = round(winnerScore.dimensions.total - baseline.dimensions.total);

  return {
    winnerScore,
    winnerDelta,
    safetyRegression: hasSafetyRegression(winnerScore),
    selection_update: {
      policy: selectionPolicy,
      incumbent_score: baseline.dimensions.total,
      selected_score: winnerScore.dimensions.total,
      selected_delta: winnerDelta,
      selected_surface: replacementAllowed ? "variant_winner" : "incumbent_baseline",
      selected_variant_id: replacementAllowed ? selected.variant.variant_id : null,
      selected_strategy: replacementAllowed ? selected.variant.strategy : null,
      replacement_allowed: replacementAllowed,
      rejected_candidate_count: candidates.filter((candidate) => !candidate.replacement_allowed).length,
      safety_passed: !hasSafetyRegression(winnerScore)
    },
    diversity_guard: {
      policy: diversityPolicy,
      enabled: diversityEnabled,
      applied: Boolean(diversityCandidate),
      candidate_strategy_count: Object.keys(candidateStrategyCounts).length,
      candidate_strategy_entropy: entropy(candidateStrategyCounts),
      strategy_family: diversityStrategyFamily(order),
      selected_strategy_before_guard: selectedBeforeDiversity?.variant.strategy ?? null,
      selected_strategy_after_guard: replacementAllowed ? selected.variant.strategy : null,
      retained_variant_id: diversityCandidate?.variant.variant_id ?? null,
      retained_strategy: diversityCandidate?.variant.strategy ?? null,
      retained_delta: diversityCandidate?.delta ?? null,
      reason: diversityCandidate
        ? "near-tie quality candidate from a different Qianxuesen-fit strategy kept as the selected draft to avoid premature convergence"
        : diversityEnabled
          ? "no same-quality alternate strategy was safer or equally fit for this risk level"
          : "diversity guard disabled"
    }
  };
}

function compareScores({
  sourceLabel,
  sourceKind,
  split,
  seed,
  order,
  orderResult,
  selectionPolicy,
  diversityPolicy
}) {
  const baseline = scoreBaselineWorkOrder(order);
  const selection = selectQualityWinner({
    order,
    orderResult,
    baseline,
    seed,
    selectionPolicy,
    diversityPolicy
  });
  const winner = selection.winnerScore;
  const delta = selection.winnerDelta;
  const safetyRegression = selection.safetyRegression;
  const positiveLift = delta > 0 && !safetyRegression;

  return {
    source_label: sourceLabel,
    source_kind: sourceKind,
    split,
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
    selection_update: selection.selection_update,
    diversity_guard: selection.diversity_guard,
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

function externalSampleTaskGate(sample) {
  const highRisk = ["critical", "high"].includes(sample.task.risk_level);
  return {
    complex_enough: sample.task.severity !== "P3" || sample.task.reproduction_commands.length > 1,
    valuable_enough: true,
    doable_enough: sample.task.reproduction_commands.length > 0
      && sample.task.acceptance_criteria.length > 0
      && sample.task.editable_scope.length > 0,
    error_discovery_cost: highRisk ? "high" : "medium",
    verdict: highRisk ? "human_owner_review_before_delegate" : "ask_user_then_delegate",
    reasons: [
      "External issue/PR-style sample preserves source evidence before optimization.",
      "Reproduction commands and acceptance criteria are explicit.",
      highRisk ? "High-risk sample must stabilize boundaries before execution." : "Sample stays replay-gated and local."
    ]
  };
}

function externalSampleToWorkOrder(sample) {
  const taskGate = externalSampleTaskGate(sample);
  const executor = sample.task.category === "operator_quality"
    ? {
      executor_type: "persona_operator_agent",
      label: "Persona or operator agent",
      reason: "The external sample concerns operator behavior quality."
    }
    : {
      executor_type: "specialized_engineering_agent",
      label: "Specialized engineering agent",
      reason: "The external issue/PR sample has code, test, or documentation repair scope."
    };

  return {
    work_order_id: `wo-external-${stableSlug(sample.sample_id)}`,
    title: sample.task.title,
    category: sample.task.category,
    severity: sample.task.severity,
    risk_level: sample.task.risk_level,
    status: "pending_agent_review",
    source: {
      source_type: "external_issue_pr_sample",
      source_id: sample.sample_id,
      source_kind: sample.source.dataset,
      repository: sample.source.repository,
      issue_id: sample.source.issue_id,
      split: sample.split
    },
    summary: sample.task.problem_statement,
    source_refs: [
      {
        kind: "external_sample",
        id: sample.sample_id,
        note: sample.labels.expected_quality_signal ?? ""
      },
      ...sample.task.source_refs
    ],
    delivery: {
      receiver_type: "primary_agent",
      receiver_label: "Primary agent",
      delivery_policy: "deliver_to_agent_for_review",
      reason: "The primary agent reviews the external issue/PR-style work order before any execution."
    },
    suggested_executor: executor,
    task_gate: taskGate,
    traceability: {
      evidence: {
        dataset: sample.source.dataset,
        repository: sample.source.repository,
        issue_id: sample.source.issue_id,
        pull_request_id: sample.source.pull_request_id ?? null,
        split: sample.split,
        expected_strategy_family: sample.labels.expected_strategy_family
      },
      reproduction_commands: sample.task.reproduction_commands,
      acceptance_criteria: sample.task.acceptance_criteria,
      editable_scope: sample.task.editable_scope,
      forbidden_scope: sample.task.forbidden_scope,
      audit_required: true,
      rollback_required: ["P0", "P1"].includes(sample.task.severity),
      source_refs_required: true
    },
    execution_policy: {
      requires_user_confirmation: sample.task.risk_level !== "low",
      auto_execute_allowed: false,
      self_evolution_allowed: sample.task.severity !== "P0",
      agent_self_review_allowed: true,
      agent_may_self_resolve: false,
      owner_report_required: sample.task.risk_level !== "low",
      durable_or_public_effect_allowed: false,
      experience_capture_mode: "candidate_log_only",
      default_next_step: sample.task.risk_level === "low"
        ? "agent_self_review_then_report_owner"
        : "ask_user_to_choose_executor"
    },
    escalation: {
      allowed: sample.task.risk_level !== "low",
      recommended_when: "Escalate if the repair crosses the declared forbidden scope or the replay result is unstable.",
      stronger_model_slots: ["stronger_model", executor.executor_type],
      user_can_decline_execution: true
    },
    user_prompt: [
      `External issue/PR sample: ${sample.task.title}.`,
      `Summary: ${sample.task.problem_statement}`,
      `Suggested executor: ${executor.label}.`,
      `Risk level: ${sample.task.risk_level}.`,
      "Keep this as local evaluation evidence; do not execute without approval."
    ].join(" ")
  };
}

export async function loadExternalIssuePrSamples({
  repoRoot = process.cwd(),
  sampleDir = DEFAULT_EXTERNAL_SAMPLE_DIR
} = {}) {
  const root = path.isAbsolute(sampleDir) ? sampleDir : path.join(repoRoot, sampleDir);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const samples = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sample.json")) {
      continue;
    }
    samples.push(await readJson(path.join(root, entry.name)));
  }
  return samples.sort((a, b) => a.sample_id.localeCompare(b.sample_id));
}

async function buildDefaultCorpus({
  repoRoot = process.cwd(),
  sampleSets = DEFAULT_CALIBRATION_SAMPLE_SETS,
  operatorReports = DEFAULT_OPERATOR_QUALITY_REPORTS,
  externalSamples,
  externalSampleDir = DEFAULT_EXTERNAL_SAMPLE_DIR,
  includeExternalSamples = true,
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
      split: "local_regression",
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
      split: "local_regression",
      routing: buildWorkOrderRouting({
        operationalReports: [item.report],
        now
      })
    });
  }

  const issuePrSamples = includeExternalSamples
    ? externalSamples ?? await loadExternalIssuePrSamples({ repoRoot, sampleDir: externalSampleDir })
    : [];
  for (const sample of issuePrSamples) {
    const order = externalSampleToWorkOrder(sample);
    corpus.push({
      source_label: sample.sample_id,
      source_kind: "external_issue_pr_sample",
      split: sample.split,
      labels: sample.labels,
      routing: {
        schema_version: "misa.work_order_routing.v1",
        mode: "work-order-routing",
        ok: true,
        created_at: asIsoDate(now),
        receiver_slots: {},
        routing_policy: {
          mode: "external_issue_pr_eval",
          auto_execute_allowed: false,
          max_auto_severity: "P3",
          auto_execute_categories: [],
          primary_agent_report_first: true,
          stronger_model_policy: "recommend_when_high_risk_or_complex",
          durable_or_public_effect_policy: "human_owner_required"
        },
        summary: {
          work_order_count: 1,
          by_category: { [order.category]: 1 },
          by_suggested_executor: { [order.suggested_executor.executor_type]: 1 },
          requires_user_confirmation_count: order.execution_policy.requires_user_confirmation ? 1 : 0,
          auto_executable_count: 0,
          agent_self_review_count: 1,
          owner_report_required_count: order.execution_policy.owner_report_required ? 1 : 0,
          escalation_available_count: order.escalation.allowed ? 1 : 0,
          stronger_model_recommended_count: order.risk_level === "low" ? 0 : 1
        },
        work_orders: [order],
        safety: {
          auto_execute_allowed: false,
          durable_or_public_effect_allowed: false,
          primary_agent_must_report_first: true,
          agent_self_review_default: true,
          user_may_escalate_to_stronger_model: true,
          traceability_required: true
        },
        warnings: [
          "External issue/PR samples are evaluation fixtures, not execution approval."
        ]
      }
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
  const bySplit = countBy(comparisons, (item) => item.split);
  const selectionRows = comparisons.map((item) => item.selection_update);
  const diversityRows = comparisons.map((item) => item.diversity_guard);
  const uniqueWorkOrderIds = new Set(comparisons.map((item) => item.work_order_id));
  const uniqueShapes = new Set(comparisons.map(sampleShapeKey));
  const highRisk = comparisons.filter((item) => ["critical", "high"].includes(item.risk_level));
  const mediumRisk = comparisons.filter((item) => item.risk_level === "medium");
  const lowRisk = comparisons.filter((item) => item.risk_level === "low");

  const splitStats = (split) => {
    const rows = comparisons.filter((item) => item.split === split);
    return {
      comparison_count: rows.length,
      avg_baseline_score: round(avg(rows.map((item) => item.baseline.dimensions.total))),
      avg_winner_score: round(avg(rows.map((item) => item.winner.dimensions.total))),
      avg_delta: round(avg(rows.map((item) => item.delta))),
      positive_lift_rate: round(avg(rows.map((item) => boolScore(item.positive_lift)))),
      regression_count: rows.filter((item) => item.delta < 0).length,
      safety_regression_count: rows.filter((item) => item.safety_regression).length
    };
  };
  const dev = splitStats("dev");
  const test = splitStats("test");
  const overfitGap = dev.comparison_count && test.comparison_count
    ? round(dev.avg_delta - test.avg_delta)
    : 0;

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
    selection_update: {
      policy: selectionRows[0]?.policy ?? DEFAULT_WORK_ORDER_SELECTION_POLICY,
      replacement_allowed_count: selectionRows.filter((item) => item.replacement_allowed).length,
      incumbent_retained_count: selectionRows.filter((item) => item.selected_surface === "incumbent_baseline").length,
      rejected_candidate_count: selectionRows.reduce((sum, item) => sum + item.rejected_candidate_count, 0),
      avg_selected_delta: round(avg(selectionRows.map((item) => item.selected_delta))),
      safety_passed_count: selectionRows.filter((item) => item.safety_passed).length
    },
    diversity_guard: {
      policy: diversityRows[0]?.policy ?? DEFAULT_WORK_ORDER_DIVERSITY_POLICY,
      enabled: diversityRows.some((item) => item.enabled),
      applied_count: diversityRows.filter((item) => item.applied).length,
      unique_winner_strategy_count: Object.keys(byStrategy).filter((key) => key !== "undefined").length,
      avg_candidate_strategy_entropy: round(avg(diversityRows.map((item) => item.candidate_strategy_entropy))),
      retained_strategy_counts: countBy(
        diversityRows.filter((item) => item.retained_strategy),
        (item) => item.retained_strategy
      )
    },
    by_category: byCategory,
    by_risk: byRisk,
    by_split: bySplit,
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
    },
    dev_test: {
      dev,
      test,
      overfit_gap: overfitGap,
      holdout_passed: test.comparison_count > 0
        && test.safety_regression_count === 0
        && test.regression_count === 0
        && test.positive_lift_rate >= 0.95
    }
  };
}

function buildRecommendations(summary) {
  const recs = [];
  const highRiskFit = summary.qianxuesen_signal_fit.high_risk_count
    ? summary.qianxuesen_signal_fit.high_risk_boundary_fit_count / summary.qianxuesen_signal_fit.high_risk_count
    : 1;
  if (summary.unique_work_order_shape_count < summary.work_order_count && summary.dev_test.test.comparison_count === 0) {
    recs.push({
      recommendation_id: "add_external_issue_pr_samples",
      priority: "high",
      reason: "Local sample sets exercise the chain, but several source sets collapse into the same work-order shape.",
      qianxuesen_fit: "Add issue/PR style benchmark adapters so the control loop is judged on final work-order quality, not only local replay shape."
    });
  }
  if (summary.unique_work_order_shape_count < summary.work_order_count && summary.dev_test.test.comparison_count > 0) {
    recs.push({
      recommendation_id: "expand_external_issue_pr_samples",
      priority: "medium",
      reason: "The adapter and holdout split are working, but a few local regression sources still share the same work-order shape.",
      qianxuesen_fit: "Scale the issue/PR-style corpus before claiming broad benchmark quality."
    });
  }
  if (summary.dev_test.test.comparison_count > 0 && summary.dev_test.holdout_passed) {
    recs.push({
      recommendation_id: "keep_dev_test_split_in_gate",
      priority: "high",
      reason: "The held-out issue/PR-style samples improved without safety regression.",
      qianxuesen_fit: "Keep dev/test split as the guard before adding replacement, mutation, or crossover."
    });
  }
  if (summary.selection_update.incumbent_retained_count === 0 && summary.safety_regression_count === 0) {
    recs.push({
      recommendation_id: "keep_quality_replacement_rule",
      priority: "high",
      reason: "Every selected variant beat the incumbent work order and passed the no-regression safety gate.",
      qianxuesen_fit: "Selection/update now behaves like a control replacement rule instead of always trusting the newest candidate."
    });
  }
  if (summary.diversity_guard.applied_count > 0) {
    recs.push({
      recommendation_id: "keep_diversity_guard_for_medium_risk",
      priority: "medium",
      reason: "Near-tie medium-risk candidates can rotate across replay, compact, and evidence shapes without lowering quality.",
      qianxuesen_fit: "This avoids premature convergence while preserving the medium-risk replay-or-compact control policy."
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
  externalSamples,
  externalSampleDir = DEFAULT_EXTERNAL_SAMPLE_DIR,
  includeExternalSamples = true,
  selectionPolicy = DEFAULT_WORK_ORDER_SELECTION_POLICY,
  diversityPolicy = DEFAULT_WORK_ORDER_DIVERSITY_POLICY,
  now = DEFAULT_NOW
} = {}) {
  const seedList = Array.isArray(seeds) && seeds.length ? seeds : DEFAULT_WORK_ORDER_EVAL_SEEDS;
  const normalizedSelectionPolicy = normalizeSelectionPolicy(selectionPolicy);
  const normalizedDiversityPolicy = normalizeDiversityPolicy(diversityPolicy);
  const corpus = await buildDefaultCorpus({
    repoRoot,
    sampleSets,
    operatorReports,
    externalSamples,
    externalSampleDir,
    includeExternalSamples,
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
          split: item.split,
          seed,
          order,
          orderResult: variantRun.work_order_results[0],
          selectionPolicy: normalizedSelectionPolicy,
          diversityPolicy: normalizedDiversityPolicy
        }));
      }
    }
  }

  const summary = summarizeComparisons(comparisons, corpus);
  const recommendations = buildRecommendations(summary);

  return {
    schema_version: "misa.work_order_quality_eval.v1",
    mode: "work-order-quality-eval",
    ok: summary.safety_regression_count === 0
      && summary.regression_count === 0
      && summary.positive_lift_rate >= 0.95
      && summary.dev_test.holdout_passed,
    created_at: asIsoDate(now),
    seeds: seedList,
    sample_summary: {
      source_set_count: summary.source_set_count,
      work_order_count: summary.work_order_count,
      unique_work_order_id_count: summary.unique_work_order_id_count,
      unique_work_order_shape_count: summary.unique_work_order_shape_count,
      split_counts: countBy(corpus, (item) => item.split),
      external_issue_pr_sample_count: corpus.filter((item) => item.source_kind === "external_issue_pr_sample").length,
      dev_sample_count: corpus.filter((item) => item.split === "dev").length,
      test_sample_count: corpus.filter((item) => item.split === "test").length,
      sample_quality: summary.unique_work_order_shape_count >= summary.work_order_count
        ? "diverse_enough_for_local_gate"
        : corpus.some((item) => item.source_kind === "external_issue_pr_sample")
          ? "mixed_with_external_issue_pr_samples_but_still_needs_benchmark_scale"
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
        "new selected winners must beat the incumbent before replacement",
        "medium-risk near ties should preserve strategy diversity without lowering quality",
        "LLM critique remains value-gated and zero-call by default"
      ],
      dev_test_policy: {
        dev_split: "use dev samples for strategy-weight tuning and replacement-rule experiments",
        test_split: "use test samples only for holdout quality checks",
        overfit_gap: summary.dev_test.overfit_gap,
        holdout_passed: summary.dev_test.holdout_passed
      },
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
      "Local issue/PR fixtures prove the adapter shape and dev/test split, but full benchmark-scale data is still needed before claiming broad quality lift.",
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
    `- external_issue_pr_samples: ${result.sample_summary.external_issue_pr_sample_count}`,
    `- dev_samples: ${result.sample_summary.dev_sample_count}`,
    `- test_samples: ${result.sample_summary.test_sample_count}`,
    `- comparison_count: ${result.summary.comparison_count}`,
    `- variant_count: ${result.summary.variant_count}`,
    `- avg_baseline_score: ${result.summary.avg_baseline_score}`,
    `- avg_winner_score: ${result.summary.avg_winner_score}`,
    `- avg_delta: ${result.summary.avg_delta}`,
    `- test_avg_delta: ${result.summary.dev_test.test.avg_delta}`,
    `- holdout_passed: ${result.summary.dev_test.holdout_passed}`,
    `- positive_lift_rate: ${result.summary.positive_lift_rate}`,
    `- safety_regression_count: ${result.summary.safety_regression_count}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
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
  await fs.writeFile(mdPath, renderMarkdown(withOutput), "utf8");

  return withOutput;
}
