import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { reviewRepairTickets } from "../scripts/lib/repair-ticket.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  buildWorkOrderRouting
} from "../scripts/lib/work-order-router.mjs";
import {
  buildWorkOrderVariants,
  runWorkOrderVariants,
  writeWorkOrderVariantArtifacts
} from "../scripts/lib/work-order-variants.mjs";

const execFileAsync = promisify(execFile);

function runNpm(args) {
  const options = {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 20
  };
  if (process.platform === "win32") {
    return execFileAsync("cmd.exe", ["/d", "/c", "npm", ...args], options);
  }
  return execFileAsync("npm", args, options);
}

test("work-order variants generate deterministic seeded choices without execution", async () => {
  const repairTickets = await reviewRepairTickets({
    now: new Date("2026-05-15T00:00:00Z")
  });
  const routing = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now: new Date("2026-05-15T00:00:00Z")
  });
  const first = buildWorkOrderVariants({
    workOrderRouting: routing,
    seed: "variant-test-seed",
    now: new Date("2026-05-15T00:00:00Z")
  });
  const second = buildWorkOrderVariants({
    workOrderRouting: routing,
    seed: "variant-test-seed",
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(first.mode, "work-order-variants");
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.summary.work_order_count, routing.work_orders.length);
  assert.equal(first.summary.variant_count, routing.work_orders.length * 5);
  assert.equal(first.summary.llm_api_calls, 0);
  assert.equal(first.summary.llm_mutation_crossover_review_worthy_count >= 0, true);
  assert.equal(first.summary.primary_agent_inline_review_count, first.summary.llm_mutation_crossover_review_worthy_count);
  assert.equal(first.summary.separate_llm_call_required_count, 0);
  assert.equal(first.safety.executes_work_orders, false);
  assert.equal(first.safety.writes_persistent_memory, false);
  assert.equal(first.safety.installs_skills, false);
  assert.equal(first.model_role_policy.evolution_model.default_call_policy, "do_not_call");
  assert.equal(first.model_role_policy.task_model.called_by_variant_layer, false);

  const orderResult = first.work_order_results[0];
  assert.equal(orderResult.variants.length, 5);
  assert.equal(orderResult.winner.execution_allowed, false);
  assert.equal(orderResult.winner.publication_allowed, false);
  assert.equal(orderResult.variants.every((variant) => variant.constraints.no_llm_call), true);
  assert.equal(orderResult.variants.every((variant) => variant.safety.calls_llm === false), true);
  assert.ok(orderResult.llm_review_gate.trigger_signals.some((signal) => signal.startsWith("value:")));
  assert.equal(orderResult.llm_mutation_crossover_gate.enabled, false);
  assert.equal(orderResult.llm_mutation_crossover_gate.call_policy, "primary_agent_inline_review");
  assert.equal(orderResult.llm_mutation_crossover_gate.intervention_mode, "primary_agent_inline_review");
  assert.equal(orderResult.llm_mutation_crossover_gate.activation_required, "included_in_current_primary_agent_context");
  assert.equal(orderResult.llm_mutation_crossover_gate.separate_llm_call_required, false);
  assert.equal(orderResult.llm_mutation_crossover_gate.primary_agent_review_required, true);
  assert.equal(orderResult.llm_mutation_crossover_gate.external_model_call_policy, "requires_explicit_enable");
  assert.equal(orderResult.llm_mutation_crossover_gate.mutation_candidate_allowed, false);
  assert.equal(orderResult.llm_mutation_crossover_gate.crossover_candidate_allowed, false);
  assert.equal(orderResult.llm_mutation_crossover_gate.route_or_winner_authority, false);
  assert.equal(orderResult.llm_mutation_crossover_gate.llm_api_calls, 0);
  assert.equal(orderResult.model_role_separation.deterministic_controller.owns_selection, true);
});

test("work-order variants validate against schema and gate LLM critique by value signals", async () => {
  const result = await runWorkOrderVariants({
    seed: "schema-test-seed",
    now: new Date("2026-05-15T00:00:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/work_order_variants.schema.json",
    data: result,
    name: "validate work-order variants"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(result.summary.llm_api_calls, 0);
  assert.equal(result.summary.external_api_calls, 0);
  assert.equal(result.summary.primary_agent_inline_review_count, result.summary.llm_mutation_crossover_review_worthy_count);
  assert.equal(result.summary.separate_llm_call_required_count, 0);
  assert.equal(result.mutation_policy.llm_policy.route_or_winner_authority, false);
  assert.equal(result.mutation_policy.llm_policy.mutation_crossover_policy.enabled, false);
  assert.equal(result.mutation_policy.llm_policy.mutation_crossover_policy.llm_api_calls, 0);
  assert.equal(result.model_role_policy.deterministic_controller.owns_route, true);
  assert.equal(result.model_role_policy.evolution_model.can_change_winner, false);
  assert.equal(result.model_role_policy.task_model.called_by_variant_layer, false);
  for (const orderResult of result.work_order_results) {
    assert.equal(orderResult.llm_review_gate.should_change_winner, false);
    assert.equal(orderResult.llm_review_gate.llm_api_calls, 0);
    assert.ok(["do_not_call", "call_when_auto_enabled"].includes(orderResult.llm_review_gate.call_policy));
    assert.equal(orderResult.llm_mutation_crossover_gate.should_change_winner, false);
    assert.equal(orderResult.llm_mutation_crossover_gate.llm_api_calls, 0);
    assert.ok(["do_not_call", "primary_agent_inline_review"].includes(orderResult.llm_mutation_crossover_gate.call_policy));
    assert.ok(["none", "primary_agent_diagnostic_note", "primary_agent_inline_review"].includes(orderResult.llm_mutation_crossover_gate.intervention_mode));
    assert.equal(orderResult.llm_mutation_crossover_gate.separate_llm_call_required, false);
    assert.equal(orderResult.llm_mutation_crossover_gate.external_model_call_policy, "requires_explicit_enable");
    assert.equal(orderResult.model_role_separation.evolution_model.can_execute, false);
  }
});

test("work-order variants preserve required strategies under smaller budgets", async () => {
  const repairTickets = await reviewRepairTickets({
    now: new Date("2026-05-15T00:00:00Z")
  });
  const routing = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now: new Date("2026-05-15T00:00:00Z")
  });
  const result = buildWorkOrderVariants({
    workOrderRouting: routing,
    seed: "required-strategy-budget-test",
    populationSize: 3,
    requiredStrategies: ["boundary_tightening"],
    now: new Date("2026-05-15T00:00:00Z")
  });

  for (const orderResult of result.work_order_results) {
    assert.equal(orderResult.variants.length, 3);
    assert.ok(orderResult.variants.some((variant) => variant.strategy === "boundary_tightening"));
    assert.equal(orderResult.variants.every((variant) => variant.constraints.no_direct_execution), true);
    assert.equal(orderResult.variants.every((variant) => variant.safety.calls_llm === false), true);
    assert.equal(orderResult.llm_mutation_crossover_gate.llm_api_calls, 0);
    assert.equal(orderResult.model_role_separation.task_model.can_self_select_candidate, false);
  }
});

test("work-order variant artifacts write local JSON and Markdown only", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-work-order-variants-"));

  try {
    const result = await runWorkOrderVariants({
      seed: "artifact-test-seed",
      now: new Date("2026-05-15T00:00:00Z")
    });
    const written = await writeWorkOrderVariantArtifacts({
      result,
      outDir: tempRoot,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "work-order-variants");
    assert.equal(persisted.safety.executes_work_orders, false);
    assert.match(markdown, /# Work Order Variants/);
    assert.match(markdown, /llm_api_calls: 0/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("work-order variant CLI writes clean JSON handoff artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-work-order-variants-cli-"));
  const outFile = path.join(tempRoot, "variants.json");

  try {
    await runNpm([
      "run",
      "work-order:variants",
      "--",
      "--json",
      "--dry-run",
      "--seed",
      "cli-test-seed",
      "--out-file",
      outFile
    ]);
    const result = JSON.parse(await fs.readFile(outFile, "utf8"));
    assert.equal(result.mode, "work-order-variants");
    assert.equal(result.ok, true);
    assert.equal(result.seed, "cli-test-seed");
    assert.equal(result.summary.llm_api_calls, 0);
    assert.equal(result.summary.llm_mutation_crossover_review_worthy_count >= 0, true);
    assert.equal(result.summary.primary_agent_inline_review_count, result.summary.llm_mutation_crossover_review_worthy_count);
    assert.equal(result.summary.separate_llm_call_required_count, 0);
    assert.equal(result.model_role_policy.evolution_model.default_call_policy, "do_not_call");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
