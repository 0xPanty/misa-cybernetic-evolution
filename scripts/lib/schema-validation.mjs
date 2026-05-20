import fs from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const SCHEMA_EXAMPLE_PAIRS = [
  ["schemas/plant_model.schema.json", "examples/plant_model.example.json"],
  ["schemas/metric_registry.schema.json", "examples/metric_registry.example.json"],
  ["schemas/control_contract.schema.json", "examples/control_contract.example.json"],
  ["schemas/control_contract.schema.json", "examples/misa_readonly_control_contract.example.json"],
  ["schemas/learning_event.schema.json", "examples/learning_event.example.json"],
  ["schemas/learning_item.schema.json", "examples/learning_item.example.json"],
  ["schemas/learning_cycle_trace.schema.json", "examples/learning_cycle_trace.example.json"],
  ["schemas/skill_crystallization_candidate.schema.json", "examples/misa_skill_crystallization_candidate.example.json"],
  ["schemas/self_repair_run.schema.json", "examples/self_repair_run.example.json"],
  ["schemas/genericagent_context_density.schema.json", "examples/genericagent_context_density.example.json"],
  ["schemas/adaptive_candidate_gate.schema.json", "examples/adaptive_candidate_gate.example.json"],
  ["schemas/signal_intake_contract.schema.json", "examples/signal_intake_contract.example.json"],
  ["schemas/signal_candidate_rollup.schema.json", "examples/signal_candidate_rollup.example.json"],
  ["schemas/evolution_tournament_gate.schema.json", "examples/evolution_tournament_gate.example.json"],
  ["schemas/deployment-ticket.schema.json", "examples/deployment_ticket.example.json"],
  ["schemas/memory_layer.schema.json", "examples/memory_layer.example.json"],
  ["schemas/repair_ticket.schema.json", "examples/repair_ticket.example.json"],
  ["schemas/work_order_routing.schema.json", "examples/work_order_routing.example.json"],
  ["schemas/skill_evolution_contract.schema.json", "examples/skill-evolution/farcaster_reply_operator.contract.json"],
  ["schemas/behavior_event.schema.json", "examples/behavior-events/farcaster_public_reply.event.json"],
  ["schemas/langgraph_qianxuesen_bridge.schema.json", "examples/langgraph_qianxuesen_bridge.example.json"],
  ["schemas/vector_memory_storage.schema.json", "examples/vector_memory_storage.example.json"],
  ["schemas/zilliz_vector_adapter.schema.json", "examples/zilliz_vector_adapter.example.json"],
  ["schemas/perception_digest.schema.json", "examples/perception_digest.example.json"],
  ["schemas/perception_digest.schema.json", "examples/external-trajectory-online-shadow/generic-workflow-digest.example.json"],
  ["schemas/perception_log_layout.schema.json", "examples/perception_log_layout.example.json"],
  ["schemas/signal_ledger.schema.json", "examples/signal_ledger.example.json"],
  ["schemas/damping_rules.schema.json", "examples/damping_rules.example.json"],
  ["schemas/integration_profile.schema.json", "examples/misa_readonly_integration.example.json"]
];

const SCHEMA_DIRECTORY_PAIRS = [
  ["schemas/misa_learning_fixture.schema.json", "examples/misa-learning", ".fixture.json"],
  ["schemas/local_distillation_source.schema.json", "examples/misa-distillation", ".json"],
  ["schemas/external_work_order_sample.schema.json", "examples/work-order-quality/external-issue-pr", ".sample.json"]
];

const SCHEMA_ONLY_FILES = [
  "schemas/agent_runtime_adapter.schema.json",
  "schemas/session_distillation_review.schema.json",
  "schemas/hermes_distillation_mapping.schema.json",
  "schemas/omniagent_footprint_bridge.schema.json",
  "schemas/local_vector_store.schema.json",
  "schemas/work_order_variants.schema.json",
  "schemas/work_order_quality_eval.schema.json",
  "schemas/external_work_order_sample.schema.json",
  "schemas/external_trajectory_adaptation.schema.json",
  "schemas/external_trajectory_side_by_side.schema.json",
  "schemas/external_trajectory_alpha.schema.json",
  "schemas/external_trajectory_final_comparison.schema.json",
  "schemas/external_trajectory_online_shadow_contract.schema.json"
];

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function createAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });
  addFormats(ajv);
  return ajv;
}

export async function validateSchemas({ repoRoot = process.cwd() } = {}) {
  const ajv = createAjv();
  const checks = [];

  const schemaRels = new Set([
    ...SCHEMA_EXAMPLE_PAIRS.map(([schema]) => schema),
    ...SCHEMA_DIRECTORY_PAIRS.map(([schema]) => schema),
    ...SCHEMA_ONLY_FILES
  ]);

  for (const schemaRel of schemaRels) {
    const schemaPath = path.join(repoRoot, schemaRel);
    const schema = await readJson(schemaPath);
    ajv.compile(schema);
    checks.push({
      name: `compile ${schemaRel}`,
      ok: true,
      checkKind: "schema_compile",
      schemaRel
    });
  }

  for (const [schemaRel, exampleRel] of SCHEMA_EXAMPLE_PAIRS) {
    const schema = await readJson(path.join(repoRoot, schemaRel));
    const example = await readJson(path.join(repoRoot, exampleRel));
    const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
    const ok = validate(example);
    checks.push({
      name: `validate ${exampleRel}`,
      ok,
      errors: ok ? [] : validate.errors,
      checkKind: "schema_example_validation",
      schemaRel,
      dataRel: exampleRel
    });
  }

  for (const [schemaRel, dirRel, suffix] of SCHEMA_DIRECTORY_PAIRS) {
    const schema = await readJson(path.join(repoRoot, schemaRel));
    const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
    const dirPath = path.join(repoRoot, dirRel);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const fixtureNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
      .map((entry) => entry.name)
      .sort();

    for (const fixtureName of fixtureNames) {
      const fixtureRel = path.join(dirRel, fixtureName);
      const fixture = await readJson(path.join(repoRoot, fixtureRel));
      const ok = validate(fixture);
      checks.push({
        name: `validate ${fixtureRel}`,
        ok,
        errors: ok ? [] : validate.errors,
        checkKind: "schema_directory_validation",
        schemaRel,
        dataRel: fixtureRel
      });
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

export async function validateJsonData({
  repoRoot = process.cwd(),
  schemaRel,
  data,
  name = "data",
  phase
} = {}) {
  const ajv = createAjv();
  for (const dependencyRel of [
    "schemas/misa_learning_fixture.schema.json",
    "schemas/learning_cycle_trace.schema.json"
  ]) {
    if (dependencyRel === schemaRel) {
      continue;
    }
    try {
      ajv.addSchema(await readJson(path.join(repoRoot, dependencyRel)));
    } catch {
      // Optional dependency schemas are only needed for bridge-style composite schemas.
    }
  }
  const schema = await readJson(path.join(repoRoot, schemaRel));
  const validate = ajv.compile(schema);
  const ok = validate(data);

  return {
    name,
    ok,
    errors: ok ? [] : validate.errors,
    checkKind: "json_data_validation",
    schemaRel,
    ...(phase ? { phase } : {})
  };
}
