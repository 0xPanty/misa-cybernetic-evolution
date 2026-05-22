import { generatorForWorkOrderContext } from "./candidate-generation-context.mjs";

const DEFAULT_NOW = new Date("2026-05-21T00:00:00Z");

const SAFETY = Object.freeze({
  production_authority: false,
  executes_work_orders: false,
  writes_persistent_memory: false,
  installs_skills: false,
  calls_model_providers: false,
  calls_external_api: false,
  touches_vps: false
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

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function worldAdmissionGate(world) {
  const missing = [];
  if (!world || typeof world !== "object") {
    missing.push("world");
  } else {
    for (const key of ["datasets", "metrics", "constraints", "budgets"]) {
      const value = world[key];
      if (Array.isArray(value) ? value.length === 0 : !value || typeof value !== "object") {
        missing.push(key);
      }
    }
  }

  return {
    world_required: true,
    world_parseable: missing.length === 0,
    decision: missing.length === 0 ? "accepted" : "rejected",
    reason: missing.length === 0
      ? "Current control world includes datasets, metrics, constraints, and budgets."
      : `Missing control world fields: ${missing.join(", ")}`
  };
}

function candidateFromContext(workOrderContext, { seed }) {
  const generator = generatorForWorkOrderContext(workOrderContext);
  const fingerprint = stableHash(JSON.stringify({
    seed,
    work_order_id: workOrderContext.work_order_id,
    route_kind: workOrderContext.route_kind,
    acceptance_criteria: workOrderContext.acceptance_criteria,
    forbidden_scope: workOrderContext.forbidden_scope,
    generator_id: generator.generator_id
  }));
  return {
    candidate_id: `candidate-${workOrderContext.work_order_id}-${fingerprint}`,
    source_work_order_id: workOrderContext.work_order_id,
    generator_id: generator.generator_id,
    deterministic_fingerprint: fingerprint,
    output_surface: "draft_candidate_only",
    world_admission_required: true,
    control_intent: {
      intent_kind: "draft_candidate",
      affected_setpoints: [],
      affected_actuators: ["runtime.draft_candidate"]
    },
    execution_allowed: false,
    publication_allowed: false,
    human_escalation_required: workOrderContext.human_escalation_required
  };
}

export function buildFactorCandidateReducer({
  candidateContext,
  seed = "factor-candidate-reducer-v1",
  now = DEFAULT_NOW
} = {}) {
  const admissionGate = worldAdmissionGate(candidateContext?.world);
  const results = admissionGate.decision === "accepted"
    ? (candidateContext?.work_order_contexts ?? []).map((context) => candidateFromContext(context, { seed }))
    : [];
  return {
    schema_version: "misa.factor_candidate_reducer.v1",
    mode: "factor-candidate-reducer",
    ok: admissionGate.decision === "accepted",
    created_at: iso(now),
    seed,
    context_ref: {
      schema_version: "misa.candidate_generation_context.v1",
      source_id: candidateContext?.source?.source_id ?? null,
      work_order_count: candidateContext?.work_order_contexts?.length ?? 0,
      world_id: candidateContext?.world?.world_id ?? null
    },
    reducer_policy: {
      same_input_same_seed_same_output: true,
      runtime_fetch_allowed: false,
      llm_tool_calls_allowed: false,
      route_or_winner_authority: false
    },
    admission_gate: admissionGate,
    summary: {
      candidate_count: results.length,
      human_escalation_required_count: results.filter((item) => item.human_escalation_required).length,
      by_generator: countBy(results, (item) => item.generator_id)
    },
    candidate_results: results,
    safety: { ...SAFETY },
    warnings: [
      "Reducer output is a deterministic draft surface only.",
      "Same candidate context plus same seed yields the same candidate fingerprints.",
      "Execution, publication, memory writes, provider calls, and VPS touches stay blocked."
    ]
  };
}
