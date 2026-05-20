import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildRealL2SemanticPressureReport,
  collectRealL2GatePassedBases,
  writeRealL2SemanticPressureArtifacts
} from "../lib/l3-real-l2-semantic-pressure.mjs";

const FORBIDDEN_SCOPE = [
  "do_not_change_route",
  "do_not_change_winner",
  "do_not_write_memory",
  "do_not_write_zilliz",
  "do_not_create_embeddings",
  "do_not_call_external_api",
  "do_not_touch_vps",
  "do_not_push_github",
  "do_not_publish_publicly"
];

function packetForSource(sourceId = "swe-rebench-openhands:fixture__real-l2-001") {
  return {
    source_id: sourceId,
    record: {
      source_id: sourceId,
      observed_signals: [
        "coding_replay_trajectory",
        "damping_or_failure_pressure",
        "resolved_false"
      ],
      l1_signal_profile: {
        signal_family: "keyword_risk_noise",
        risk_level: "medium",
        route_hint: "damping",
        l2_candidate_mode: "single",
        l2_candidate_count_hint: 1,
        l2_eligible: true
      }
    },
    workOrder: {
      route_hint: "damping",
      status: "draft_no_write",
      authority: "suggestion_only",
      evidence_refs: [
        "fixture__real-l2-001",
        "swe-rebench-openhands-keyword-risk-noise-requires-filter-fixture",
        "swe-rebench-openhands/sanitized-trajectories.fixture.jsonl"
      ]
    },
    context: {
      source_class: "swe_rebench_failure_metadata",
      relevant_files: [
        "experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs",
        "experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs",
        "test/curiosity-signal-gate.test.mjs"
      ],
      context_anchors: [
        sourceId,
        "fixture__real-l2-001",
        "coding_replay_trajectory",
        "damping_or_failure_pressure",
        "draft_no_write",
        "suggestion_only"
      ],
      task_focus: [
        "trace source id",
        "verify shadow-only route",
        "preserve forbidden scope"
      ]
    },
    allowed_verification_commands: [
      "npm run validate:schemas -- --json",
      "npm run precheck",
      "node --test experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs"
    ]
  };
}

function passingDraft(sourceId = "swe-rebench-openhands:fixture__real-l2-001") {
  return {
    title: `trajectory_review: ${sourceId} observe-only review`,
    problem: `${sourceId} carries coding_replay_trajectory evidence for damping_or_failure_pressure; keep it as no-write external trajectory review material.`,
    evidence_refs: [
      "fixture__real-l2-001",
      "swe-rebench-openhands-keyword-risk-noise-requires-filter-fixture",
      "swe-rebench-openhands/sanitized-trajectories.fixture.jsonl"
    ],
    concrete_tasks: [
      `In experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs, trace source_id=${sourceId} and preserve evidence_refs=fixture__real-l2-001, swe-rebench-openhands-keyword-risk-noise-requires-filter-fixture, swe-rebench-openhands/sanitized-trajectories.fixture.jsonl without adding new refs.`,
      "In experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs, check signal=coding_replay_trajectory and route_hint=damping; expected result is hint_only/suggestion_only with no route or winner change.",
      `In experiments/external-trajectory/lib/external-trajectory-online-shadow-contract.mjs, confirm ${sourceId}, damping_or_failure_pressure, damping stay observe-only and do not request memory, Zilliz, embedding, VPS, GitHub, or public publish effects.`,
      "In test/curiosity-signal-gate.test.mjs, verify status=draft_no_write and authority=suggestion_only; expected result is a draft review note only, not work-order execution."
    ],
    acceptance_criteria: [
      `${sourceId} is traceable through evidence_refs without adding new refs.`,
      "route_hint=damping remains suggestion_only and does not change route or winner authority.",
      "No memory, Zilliz, embedding, VPS, GitHub, public publish, or work-order execution effect is requested."
    ],
    verification_commands: [
      "npm run validate:schemas -- --json",
      "npm run precheck",
      "node --test experiments/external-trajectory/test/external-trajectory-online-shadow-contract.test.mjs"
    ],
    forbidden_scope: FORBIDDEN_SCOPE,
    risk_notes: [
      "Keep this review local and draft-only.",
      "Do not convert the shadow signal into route or winner authority."
    ],
    stop_condition: "Stop once the local no-write review is documented and verification commands remain within the whitelist."
  };
}

function baseSelection() {
  const sourceId = "swe-rebench-openhands:fixture__real-l2-001";
  return {
    schema_version: "misa.real_l2_semantic_pressure_base_selection.v1",
    source_profile: "fixture",
    report_count: 1,
    selected_report_count: 1,
    selected_base_count: 1,
    selected_real_llm_base_count: 1,
    selected_local_replay_base_count: 0,
    report_stats: [
      {
        report_path: "runs/fixture/l2.json",
        selected_gate_passed_rows: 1,
        stored_llm_api_calls_in_report: 1
      }
    ],
    bases: [
      {
        schema_version: "misa.real_l2_semantic_pressure_base.v1",
        source_id: sourceId,
        base_index: 0,
        report_path: "runs/fixture/l2.json",
        provider: "fixture",
        model: "fixture",
        stored_real_llm: true,
        row_llm_api_calls: 1,
        report_llm_api_calls: 1,
        candidate_count: 1,
        original_quality_score: 1,
        original_gate_class: "pass",
        original_draft_title: passingDraft(sourceId).title,
        packet: packetForSource(sourceId),
        original_draft: passingDraft(sourceId),
        original_gate: {
          ok: true,
          gate_class: "pass",
          quality_score: 1,
          violations: []
        }
      }
    ]
  };
}

test("real L2 semantic pressure keeps clean controls separate from bad semantic mutations", () => {
  const result = buildRealL2SemanticPressureReport({
    baseSelection: baseSelection(),
    sourceProfile: "fixture",
    now: new Date("2026-05-20T06:00:00.000Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.base_count, 1);
  assert.equal(result.summary.clean_control_count, 1);
  assert.equal(result.summary.bad_sample_count, 5);
  assert.equal(result.summary.bad_format_gate_pass_count, 5);
  assert.equal(result.summary.l3_false_pass_count, 5);
  assert.equal(result.summary.semantic_false_pass_caught_count, 5);
  assert.equal(result.summary.semantic_false_pass_recall, 1);
  assert.equal(result.summary.clean_semantic_false_positive_count, 0);
  assert.equal(result.summary.observer_candidate_count_2_suggestion_count, 3);
  assert.equal(result.summary.observer_primary_agent_suggestion_count, 2);
  assert.equal(result.summary.observer_recommendation_executed_count, 0);
  assert.equal(result.summary.observer_formal_gate_mutation_count, 0);
  assert.ok(result.samples.every((sample) => sample.semantic_recommendation_executed === false));
  assert.ok(result.samples.every((sample) => sample.semantic_formal_gate_mutated === false));
  assert.ok(result.samples.every((sample) => !("semantic_actions" in sample)));
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.writes_durable_bad_seed, false);
  assert.equal(result.safety.writes_pool_decisions_jsonl, false);
});

test("real L2 semantic observer keeps recommendations separate from formal gate results", () => {
  const result = buildRealL2SemanticPressureReport({
    baseSelection: baseSelection(),
    sourceProfile: "fixture",
    now: new Date("2026-05-20T06:00:00.000Z")
  });

  const badSamples = result.samples.filter((sample) => sample.synthetic_bad);
  assert.equal(badSamples.length, 5);
  assert.ok(badSamples.every((sample) => sample.gate_ok === true));
  assert.ok(badSamples.every((sample) => sample.l3_false_pass === true));
  assert.ok(badSamples.every((sample) => sample.semantic_trigger === true));
  assert.ok(badSamples.every((sample) => sample.semantic_observation.recommendation_only === true));
  assert.ok(badSamples.every((sample) => sample.semantic_observation.formal_gate_mutated === false));

  const wrongObjective = badSamples.find((sample) => sample.variant_id === "wrong_objective_same_l2_shell");
  const boundary = badSamples.find((sample) => sample.variant_id === "boundary_contradiction_same_l2_shell");
  assert.deepEqual(wrongObjective.semantic_recommended_actions, ["candidate_count_2"]);
  assert.deepEqual(boundary.semantic_recommended_actions, ["primary_agent_review_suggested"]);
  assert.equal(boundary.semantic_lifecycle_budget.terminal_recommendation, true);
});

test("real L2 semantic source selector can filter stored real LLM outputs", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-real-l2-semantic-"));
  try {
    const reportDir = path.join(tempRoot, "runs", "fixture");
    await fs.mkdir(reportDir, { recursive: true });
    const sourceId = "swe-rebench-openhands:fixture__real-l2-001";
    await fs.writeFile(path.join(reportDir, "l2.json"), JSON.stringify({
      schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
      summary: {
        llm_api_calls: 1
      },
      results: [
        {
          source_id: sourceId,
          provider: "fixture",
          model: "fixture",
          llm_api_calls: 1,
          packet: packetForSource(sourceId),
          draft: passingDraft(sourceId),
          provider_error: null,
          gate: {
            ok: true,
            gate_class: "pass",
            quality_score: 1,
            violations: []
          }
        },
        {
          source_id: "filtered-out",
          packet: packetForSource("filtered-out"),
          draft: passingDraft("filtered-out"),
          provider_error: null,
          gate: {
            ok: false
          }
        }
      ]
    }, null, 2), "utf8");

    const selected = await collectRealL2GatePassedBases({
      repoRoot: tempRoot,
      sourceProfile: "real-llm-only"
    });

    assert.equal(selected.selected_base_count, 1);
    assert.equal(selected.selected_real_llm_base_count, 1);
    assert.equal(selected.bases[0].source_id, sourceId);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("real L2 semantic artifacts avoid pool-decisions filename", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-real-l2-semantic-artifacts-"));
  try {
    const result = buildRealL2SemanticPressureReport({
      baseSelection: baseSelection(),
      sourceProfile: "fixture",
      now: new Date("2026-05-20T06:00:00.000Z")
    });
    const written = await writeRealL2SemanticPressureArtifacts({
      result,
      outDir: tempRoot,
      now: new Date("2026-05-20T06:00:00.000Z")
    });
    const files = await fs.readdir(tempRoot);
    assert.equal(files.includes("pool-decisions.jsonl"), false);
    assert.equal(files.includes("semantic-pressure-samples.jsonl"), true);
    assert.equal(written.safety.writes_durable_bad_seed, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
