import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { buildCandidateGenerationContext } from "../scripts/lib/candidate-generation-context.mjs";
import {
  humanEscalationFromWorkOrder,
  humanEscalationsFromWorkOrderRouting
} from "../scripts/lib/human-escalation.mjs";
import { buildFactorCandidateReducer } from "../scripts/lib/factor-candidate-reducer.mjs";
import {
  ROUTE_GENERATOR_CHARTERS,
  buildRouteGeneratorScope
} from "../scripts/lib/route-focused-candidate-generators.mjs";
import {
  assertPromptTemplateFilesExist,
  loadPromptTemplateManifest
} from "../scripts/lib/prompt-templates.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

const FIXED_NOW = new Date("2026-05-21T00:00:00Z");

async function readJson(rel) {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), rel), "utf8"));
}

async function exampleInputs() {
  return {
    workOrderRouting: await readJson("examples/work_order_routing.example.json"),
    metricRegistry: await readJson("examples/metric_registry.example.json"),
    promptManifest: await loadPromptTemplateManifest({ repoRoot: process.cwd() })
  };
}

test("v0.27 candidate context locks what generators can see", async () => {
  const { workOrderRouting, metricRegistry, promptManifest } = await exampleInputs();
  const context = buildCandidateGenerationContext({
    workOrderRouting,
    metricRegistry,
    promptManifest,
    now: FIXED_NOW,
    sourceId: "test-context"
  });
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/candidate_generation_context.schema.json",
    data: context,
    name: "candidate context"
  });

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(context.context_policy.input_locked, true);
  assert.equal(context.context_policy.runtime_fetch_allowed, false);
  assert.equal(context.context_policy.llm_tool_calls_allowed, false);
  assert.equal(context.context_policy.route_authority, false);
  assert.equal(context.safety.calls_model_providers, false);
  assert.equal(context.work_order_contexts.length, 1);
  assert.equal(context.work_order_contexts[0].human_escalation_required, true);
  assert.ok(context.metric_context.some((metric) => metric.metric_id === "skill.replay_pass_rate"));
  assert.equal(context.prompt_templates[0].template_id, "candidate-layer.work-order-variant.v1");
});

test("prompt manifest is versioned and every template file exists", async () => {
  const manifest = await loadPromptTemplateManifest({ repoRoot: process.cwd() });
  const fileCheck = await assertPromptTemplateFilesExist({
    repoRoot: process.cwd(),
    manifest
  });
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/prompt_template_manifest.schema.json",
    data: manifest,
    name: "prompt manifest"
  });

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(fileCheck.ok, true, fileCheck.missing.join(", "));
  assert.equal(manifest.policy.runtime_string_concatenation_allowed, false);
  assert.equal(manifest.policy.unversioned_prompt_allowed, false);
  assert.equal(manifest.policy.llm_may_choose_template, false);
});

test("human escalation packet gives high-risk work orders one review shape", async () => {
  const { workOrderRouting } = await exampleInputs();
  const order = workOrderRouting.work_orders[0];
  const escalation = humanEscalationFromWorkOrder(order, { now: FIXED_NOW });
  const allEscalations = humanEscalationsFromWorkOrderRouting(workOrderRouting, { now: FIXED_NOW });
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/human_escalation.schema.json",
    data: escalation,
    name: "human escalation"
  });

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(allEscalations.length, 1);
  assert.equal(escalation.trigger_source, "work_order");
  assert.equal(escalation.authority_policy.human_owner_required, true);
  assert.equal(escalation.authority_policy.agent_may_execute_without_decision, false);
  assert.equal(escalation.authority_policy.llm_may_change_decision, false);
  assert.equal(escalation.safety.executes_work_orders, false);
});

test("factor candidate reducer is deterministic for the same locked context and seed", async () => {
  const { workOrderRouting, metricRegistry, promptManifest } = await exampleInputs();
  const context = buildCandidateGenerationContext({
    workOrderRouting,
    metricRegistry,
    promptManifest,
    now: FIXED_NOW,
    sourceId: "test-context"
  });
  const first = buildFactorCandidateReducer({
    candidateContext: context,
    seed: "stable-review",
    now: FIXED_NOW
  });
  const second = buildFactorCandidateReducer({
    candidateContext: context,
    seed: "stable-review",
    now: FIXED_NOW
  });
  const schemaCheck = await validateJsonData({
    schemaRel: "schemas/factor_candidate_reducer.schema.json",
    data: first,
    name: "factor candidate reducer"
  });

  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.deepEqual(second, first);
  assert.equal(first.reducer_policy.same_input_same_seed_same_output, true);
  assert.equal(first.reducer_policy.runtime_fetch_allowed, false);
  assert.equal(first.summary.candidate_count, 1);
  assert.equal(first.summary.human_escalation_required_count, 1);
  assert.equal(first.candidate_results[0].execution_allowed, false);
  assert.equal(first.candidate_results[0].publication_allowed, false);
});

test("route-focused generator charters stay small, disposable, and no-effect", () => {
  const routeKinds = new Set(ROUTE_GENERATOR_CHARTERS.map((charter) => charter.route_kind));
  const scope = buildRouteGeneratorScope({
    routeKinds: ["memory", "skill", "case", "policy", "damping", "work_order"]
  });

  assert.deepEqual([...routeKinds].sort(), ["case", "damping", "memory", "policy", "skill", "work_order"]);
  assert.equal(scope.routing, "small-focused-route-generators");
  assert.equal(scope.charters.length, 6);

  for (const charter of scope.charters) {
    assert.equal(charter.persistent_state, false);
    assert.ok(charter.max_steps <= 20);
    assert.ok(charter.forbidden_actions.includes("call_provider"));
    assert.ok(charter.output_surface.includes("draft"));
  }
});
