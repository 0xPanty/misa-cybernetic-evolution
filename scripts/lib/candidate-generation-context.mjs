import fs from "node:fs/promises";
import path from "node:path";
import { routeWorkOrders } from "./work-order-router.mjs";
import { buildRouteGeneratorScope, generatorForRoute } from "./route-focused-candidate-generators.mjs";
import { loadPromptTemplateManifest, promptRefsFromManifest } from "./prompt-templates.mjs";

const DEFAULT_NOW = new Date("2026-05-21T00:00:00Z");

const CONTEXT_POLICY = Object.freeze({
  input_locked: true,
  runtime_fetch_allowed: false,
  llm_tool_calls_allowed: false,
  route_authority: false,
  winner_authority: false,
  allowed_context_sections: [
    "metric_context",
    "work_order_contexts",
    "generator_scope",
    "prompt_templates"
  ],
  forbidden_context_sources: [
    "raw_private_memory",
    "provider_runtime",
    "unredacted_logs",
    "vps_state",
    "live_channel_state"
  ]
});

const SAFETY = Object.freeze({
  production_authority: false,
  executes_work_orders: false,
  writes_persistent_memory: false,
  installs_skills: false,
  calls_model_providers: false,
  calls_external_api: false,
  touches_vps: false,
  changes_route: false,
  changes_winner_authority: false
});

function iso(value) {
  const date = value instanceof Date ? value : new Date(value ?? DEFAULT_NOW);
  return Number.isNaN(date.getTime()) ? DEFAULT_NOW.toISOString() : date.toISOString();
}

function stableHash(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function readJson(repoRoot, rel) {
  const raw = await fs.readFile(path.join(repoRoot, rel), "utf8");
  return JSON.parse(raw);
}

function sourceRefLabel(ref) {
  if (typeof ref === "string") return ref;
  return [ref.kind, ref.id].filter(Boolean).join(":");
}

function routeKindFromOrder(order) {
  const routeCounts = order.traceability?.evidence?.route_counts ?? {};
  const routeKinds = ["memory", "skill", "case", "policy", "damping"].filter((route) => routeCounts[route] > 0);
  return routeKinds.length === 1 ? routeKinds[0] : "work_order";
}

function needsHumanEscalation(order) {
  return order.suggested_executor?.executor_type === "human_owner"
    || order.execution_policy?.requires_user_confirmation === true
    || ["critical", "high"].includes(order.risk_level)
    || order.model_handoff?.stronger_model_recommended === true;
}

function workOrderContext(order, promptTemplateId) {
  const routeKind = routeKindFromOrder(order);
  return {
    work_order_id: order.work_order_id,
    route_kind: routeKind,
    title: order.title,
    category: order.category,
    severity: order.severity,
    risk_level: order.risk_level,
    source_refs: (order.source_refs ?? []).map(sourceRefLabel).filter(Boolean),
    evidence_summary: order.traceability?.evidence ?? {},
    acceptance_criteria: order.traceability?.acceptance_criteria ?? [],
    forbidden_scope: order.traceability?.forbidden_scope ?? [],
    suggested_executor: order.suggested_executor?.executor_type ?? "primary_agent",
    human_escalation_required: needsHumanEscalation(order),
    prompt_template_id: promptTemplateId
  };
}

function metricContextFromRegistry(registry) {
  return (registry.metrics ?? []).map((metric) => ({
    metric_id: metric.metric_id,
    direction: metric.direction,
    owner: metric.owner,
    description: metric.description
  }));
}

function buildControlWorld({
  source,
  metricContext,
  workOrderContexts,
  generatorScope
}) {
  const datasetRefs = [...new Set(workOrderContexts.flatMap((order) => order.source_refs ?? []))].sort();
  const forbiddenScopes = [...new Set(workOrderContexts.flatMap((order) => order.forbidden_scope ?? []))].sort();
  const metricIds = metricContext.map((metric) => metric.metric_id).sort();
  const maxGeneratorSteps = Math.max(0, ...generatorScope.charters.map((charter) => charter.max_steps ?? 0));
  const worldSeed = {
    source,
    datasetRefs,
    metricIds,
    forbiddenScopes,
    work_order_count: workOrderContexts.length,
    maxGeneratorSteps
  };

  return {
    schema_version: "misa.control_world.v1",
    world_id: `world-${stableHash(JSON.stringify(worldSeed))}`,
    datasets: [
      {
        dataset_id: "work_order_contexts",
        source_type: source.source_type,
        source_id: source.source_id,
        record_count: workOrderContexts.length,
        source_refs: datasetRefs
      }
    ],
    metrics: metricContext.map((metric) => ({
      metric_id: metric.metric_id,
      direction: metric.direction,
      owner: metric.owner
    })),
    constraints: {
      red_lines: [
        "production_authority=false",
        "runtime_fetch_allowed=false",
        "llm_tool_calls_allowed=false",
        "single_control_intent_required",
        ...CONTEXT_POLICY.forbidden_context_sources.map((item) => `forbidden_context:${item}`),
        ...forbiddenScopes.map((item) => `forbidden_scope:${item}`)
      ],
      forbidden_context_sources: [...CONTEXT_POLICY.forbidden_context_sources],
      forbidden_scope: forbiddenScopes
    },
    budgets: {
      iteration_budget: 1,
      max_candidate_count: workOrderContexts.length,
      max_generator_steps: maxGeneratorSteps,
      risk_budget: "single_intent_only"
    }
  };
}

export function buildCandidateGenerationContext({
  workOrderRouting,
  metricRegistry,
  promptManifest,
  now = DEFAULT_NOW,
  sourceId = null
} = {}) {
  const promptTemplates = promptRefsFromManifest(promptManifest);
  const defaultTemplateId = promptTemplates[0]?.template_id ?? "candidate-layer.work-order-variant.v1";
  const workOrderContexts = (workOrderRouting?.work_orders ?? []).map((order) => workOrderContext(order, defaultTemplateId));
  const routeKinds = [...new Set(workOrderContexts.map((item) => item.route_kind))];
  const generatorScope = buildRouteGeneratorScope({
    routeKinds: routeKinds.length ? routeKinds : ["work_order"]
  });
  const source = {
    source_type: "work_order_routing",
    source_id: sourceId ?? workOrderRouting?.mode ?? null
  };
  const metricContext = metricContextFromRegistry(metricRegistry);

  return {
    schema_version: "misa.candidate_generation_context.v1",
    mode: "factor-compliant-candidate-context",
    created_at: iso(now),
    source,
    context_policy: { ...CONTEXT_POLICY },
    prompt_templates: promptTemplates,
    metric_context: metricContext,
    work_order_contexts: workOrderContexts,
    world: buildControlWorld({
      source,
      metricContext,
      workOrderContexts,
      generatorScope
    }),
    generator_scope: generatorScope,
    safety: { ...SAFETY },
    warnings: [
      "Candidate context is a locked input packet, not permission to execute.",
      "LLM outputs remain proposals only.",
      "Runtime fetch, provider calls, route changes, winner changes, VPS touches, and memory writes stay blocked."
    ]
  };
}

export async function buildDefaultCandidateGenerationContext({
  repoRoot = process.cwd(),
  workOrderRouting,
  metricRegistry,
  promptManifest,
  now = DEFAULT_NOW
} = {}) {
  const routing = workOrderRouting ?? await routeWorkOrders({ repoRoot, now });
  const registry = metricRegistry ?? await readJson(repoRoot, "examples/metric_registry.example.json");
  const manifest = promptManifest ?? await loadPromptTemplateManifest({ repoRoot });
  return buildCandidateGenerationContext({
    workOrderRouting: routing,
    metricRegistry: registry,
    promptManifest: manifest,
    now
  });
}

export function generatorForWorkOrderContext(context) {
  return generatorForRoute(context.route_kind);
}
