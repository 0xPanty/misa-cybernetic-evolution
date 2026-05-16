import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  runExternalTrajectoryAlpha,
  writeExternalTrajectoryAlphaArtifacts
} from "../scripts/lib/external-trajectory-alpha.mjs";

function record({ id, parserNotes = [], confidence = "medium", resolvedAvailable = true, resolved = true, pushback = false, unsafe = false, suggestionCount = 1 }) {
  return {
    sample_id: id,
    dataset: id.split(":")[0],
    sample_type: "fixture",
    normalization: {
      ok: true,
      format: "fixture",
      raw_content_persisted: false,
      parser_notes: parserNotes
    },
    adoption_ledger_sample: {
      suggestion_count: suggestionCount,
      adopted_count: 1,
      external_success_proxy: {
        available: confidence !== "none",
        kind: "fixture",
        value: resolved,
        confidence
      },
      user_pushback_proxy: {
        available: pushback,
        correction_count: pushback ? 1 : 0,
        failure_report_count: 0,
        rejection_count: 0,
        takeover_count: 0
      }
    },
    safety_boundary_sample: {
      available: true,
      expected_safe: !unsafe,
      unsafe_label: unsafe,
      risk_source: "fixture",
      failure_mode: "fixture",
      harm_type: "fixture"
    },
    resolved_proxy_sample: {
      available: resolvedAvailable,
      resolved: resolvedAvailable ? resolved : null,
      kind: resolvedAvailable ? "fixture" : "not_available",
      confidence: resolvedAvailable ? confidence : "none"
    }
  };
}

function comparison({
  id,
  dataset = id.split(":")[0],
  expected = "boundary_review",
  baselineAction = "boundary_review",
  calibratedAction = "boundary_review",
  delta = 0.1,
  rules = [],
  issues = [],
  flags = {}
}) {
  return {
    parameter_profile_id: "noise_tolerant_v1",
    sample_id: id,
    dataset,
    sample_type: "fixture",
    expected_shadow_action: expected,
    baseline: {
      action: baselineAction,
      action_matches_expected: baselineAction === expected,
      dimensions: {
        signal_fidelity: 0.7,
        safety_precision: 0.7,
        adoption_precision: 0.7,
        rejection_mapping: 0.7,
        noise_resistance: 0.7,
        coverage_honesty: 1,
        total: 0.7
      }
    },
    calibrated: {
      action: calibratedAction,
      action_matches_expected: calibratedAction === expected,
      dimensions: {
        signal_fidelity: 0.8,
        safety_precision: 0.8,
        adoption_precision: 0.8,
        rejection_mapping: 0.8,
        noise_resistance: 0.8,
        coverage_honesty: 1,
        total: 0.8
      },
      triggered_rules: rules
    },
    delta,
    improved: delta > 0,
    regressed: delta < 0,
    safety_regression: false,
    noise_false_positive_reduced: flags.noise ?? false,
    actual_risk_preserved: flags.actual ?? false,
    weak_proxy_downranked: flags.weak ?? false,
    pushback_mapped: flags.pushback ?? false,
    issue_kinds: issues
  };
}

function fixture() {
  const records = [
    record({
      id: "sanitized-command-stress:actual",
      parserNotes: [
        "risk_keyword_context=actual_command",
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=1",
        "non_actual_risk_keyword_count=0",
        "command_contexts=git_push_or_publish.actual_command:1"
      ]
    }),
    record({
      id: "sanitized-command-stress:noise",
      parserNotes: [
        "risk_keyword_context=non_actual_or_log",
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=1",
        "command_contexts=destructive.tool_result_output:1"
      ],
      confidence: "weak"
    }),
    record({
      id: "swe-chat:weak",
      confidence: "weak",
      resolvedAvailable: false
    }),
    record({
      id: "swe-chat:pushback",
      pushback: true,
      suggestionCount: 25
    }),
    record({
      id: "swe-chat:resolved-false",
      confidence: "medium",
      resolvedAvailable: true,
      resolved: false
    }),
    record({
      id: "swe-chat:benign-command",
      parserNotes: [
        "risk_keyword_context=none",
        "raw_risk_keyword_count=0",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=0",
        "command_contexts=test_or_verify.actual_command:1"
      ]
    })
  ];
  const comparisons = [
    comparison({
      id: "sanitized-command-stress:actual",
      rules: ["actual_command_keyword_keeps_boundary_review"],
      issues: ["publish_command_context_requires_classification"],
      flags: { actual: true }
    }),
    comparison({
      id: "sanitized-command-stress:noise",
      expected: "noise_filtered_review",
      calibratedAction: "noise_filtered_review",
      rules: ["non_actual_keyword_filtered_as_noise"],
      issues: ["keyword_risk_noise_requires_filter"],
      flags: { noise: true }
    }),
    comparison({
      id: "swe-chat:weak",
      expected: "weak_proxy_holdout",
      baselineAction: "adoption_candidate",
      calibratedAction: "weak_proxy_holdout",
      rules: ["weak_proxy_requires_holdout"],
      issues: ["adoption_proxy_weak_or_missing"],
      flags: { weak: true }
    }),
    comparison({
      id: "swe-chat:pushback",
      expected: "rejection_mapping_review",
      baselineAction: "adoption_candidate",
      calibratedAction: "rejection_mapping_review",
      rules: ["user_pushback_maps_to_rejection_review"],
      issues: ["user_pushback_needs_rejection_mapping"],
      flags: { pushback: true }
    }),
    comparison({
      id: "swe-chat:resolved-false",
      expected: "boundary_review",
      baselineAction: "adoption_candidate",
      calibratedAction: "boundary_review",
      delta: 0.08,
      rules: ["resolved_false_maps_to_boundary_review"],
      issues: ["resolved_false_proxy_needs_negative_mapping"]
    }),
    comparison({
      id: "swe-chat:benign-command",
      expected: "accept_shadow_evidence",
      baselineAction: "accept_shadow_evidence",
      calibratedAction: "accept_shadow_evidence",
      delta: 0.04,
      rules: ["resolved_proxy_can_support_acceptance"]
    })
  ];

  for (let index = 0; index < 20; index += 1) {
    const id = `swe-chat:high-tool-${index}`;
    records.push(record({
      id,
      suggestionCount: 25
    }));
    comparisons.push(comparison({
      id,
      expected: "boundary_review",
      baselineAction: "boundary_review",
      calibratedAction: "boundary_review",
      delta: 0.03,
      rules: ["high_tool_activity_review_budget"]
    }));
  }

  for (let index = 0; index < 20; index += 1) {
    const dataset = index % 2 === 0 ? "swe-chat" : "swe-rebench-openhands";
    const id = `${dataset}:failed-nonactual-${index}`;
    records.push(record({
      id,
      parserNotes: [
        "risk_keyword_context=non_actual_or_log",
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=1",
        "command_contexts=destructive.tool_result_output:1"
      ],
      confidence: "medium",
      resolvedAvailable: true,
      resolved: false
    }));
    comparisons.push(comparison({
      id,
      dataset,
      expected: "boundary_review",
      baselineAction: "adoption_candidate",
      calibratedAction: "boundary_review",
      delta: 0.12,
      rules: ["resolved_false_maps_to_boundary_review"],
      issues: ["resolved_false_proxy_needs_negative_mapping"]
    }));
  }

  return {
    adaptation: {
      schema_version: "misa.external_trajectory_adaptation.v1",
      mode: "external-trajectory-adaptation",
      baseline: { commit: "a3f6cfb" },
      records,
      issues: [],
      safety: { shadow_only: true, persists_raw_external_data: false }
    },
    sideBySide: {
      schema_version: "misa.external_trajectory_side_by_side.v1",
      mode: "external-trajectory-side-by-side",
      input: {
        adaptation_report_path: null,
        baseline_commit: "a3f6cfb"
      },
      calibration_draft: {
        parameter_profile_id: "noise_tolerant_v1"
      },
      parameter_sweep: {
        selected_profile_id: "noise_tolerant_v1",
        recommended_profile_id: "noise_tolerant_v1",
        candidates: [
          {
            parameter_profile_id: "noise_tolerant_v1",
            status: "eligible",
            control_loop_fit_score: 0.875,
            objective_score: 0.152,
            avg_delta: 0.1,
            safety_regression_count: 0
          },
          {
            parameter_profile_id: "risk_keyword_lenient_v1",
            status: "rejected_safety_regression",
            control_loop_fit_score: 0.353,
            objective_score: -4.0,
            avg_delta: 0.08,
            safety_regression_count: 3
          }
        ]
      },
      summary: {
        sample_count: comparisons.length,
        avg_delta: 0.1,
        safety_regression_count: 0,
        blocked_coverage_issue_count: 1,
        dev_holdout: { holdout_passed: true }
      },
      comparisons
    }
  };
}

test("external trajectory alpha extracts architecture-actionable signals", async () => {
  const { adaptation, sideBySide } = fixture();
  const result = await runExternalTrajectoryAlpha({
    adaptation,
    sideBySide,
    now: new Date("2026-05-15T13:00:00Z")
  });

  assert.equal(result.mode, "external-trajectory-alpha");
  assert.equal(result.ok, true);
  assert.equal(result.input.baseline_commit, "a3f6cfb");
  assert.equal(result.input.selected_parameter_profile, "noise_tolerant_v1");
  assert.ok(result.summary.actionable_alpha_count >= 4);
  assert.ok(result.summary.top_actionable_signal_ids.includes("actual_command_without_unsafe_label"));
  assert.ok(result.summary.top_actionable_signal_ids.includes("non_actual_command_keyword_noise"));
  assert.ok(result.summary.top_actionable_signal_ids.includes("weak_unresolved_proxy"));
  assert.ok(result.summary.top_actionable_signal_ids.includes("user_pushback"));
  assert.ok(result.summary.top_actionable_signal_ids.includes("resolved_false_proxy"));

  const bySignal = new Map(result.signal_analysis.map((item) => [item.signal_id, item]));
  assert.equal(bySignal.get("actual_command_without_unsafe_label").decision, "promote_to_gate_support");
  assert.equal(bySignal.get("non_actual_command_keyword_noise").decision, "promote_to_noise_filter");
  assert.equal(bySignal.get("weak_unresolved_proxy").decision, "promote_to_holdout_gate");
  assert.equal(bySignal.get("user_pushback").decision, "promote_to_rejection_gate");
  assert.equal(bySignal.get("resolved_false_proxy").decision, "promote_to_negative_outcome_gate");
  assert.equal(bySignal.get("success_proxy_false").decision, "promote_to_negative_outcome_gate");
  assert.ok(Array.isArray(result.missed_alpha_candidates));
  assert.equal(result.alpha_inspection.conclusion, "alpha_found_with_guardrails");
  assert.ok(result.alpha_inspection.promoted_alpha.some((item) => item.alpha_id === "non_actual_command_pattern_noise_evidence"));
  assert.equal(result.alpha_inspection.non_actual_command_pattern_alpha.top_signals[0].signal_id, "command_context:destructive.tool_result_output");
  assert.equal(result.alpha_ablation.conclusion, "guarded_alpha_can_enter_shadow_readout_only");
  assert.ok(result.alpha_ablation.enabled_alpha_ids.includes("non_actual_command_pattern_noise_evidence"));
  assert.ok(result.alpha_ablation.blocked_alpha_ids.includes("benign_actual_command_context"));
  assert.ok(result.alpha_ablation.scenarios.some((item) => item.ablation_id === "high_tool_activity_complexity_prior_on"));
  assert.equal(result.alpha_ablation.scenarios.every((item) => item.action_change_count === 0), true);
  assert.equal(result.alpha_ablation.scenarios.every((item) => item.winner_authority_changed === false), true);
  assert.equal(result.shadow_policy_surface.conclusion, "ready_for_shadow_readout_consumption");
  assert.deepEqual(result.shadow_policy_surface.consumed_alpha_ids.sort(), [
    "high_tool_activity_complexity_prior",
    "non_actual_command_pattern_noise_evidence"
  ]);
  assert.ok(result.shadow_policy_surface.blocked_alpha_ids.includes("benign_actual_command_context"));
  assert.ok(result.shadow_policy_surface.policy_channels.some((item) => item.channel_id === "command_noise_evidence"));
  assert.ok(result.shadow_policy_surface.policy_channels.some((item) => item.channel_id === "complexity_review_budget"));
  assert.equal(result.shadow_policy_surface.policy_channels.every((item) => item.authority_scope === "shadow_readout_only"), true);
  assert.equal(result.shadow_policy_surface.policy_closure.action_change_count, 0);
  assert.equal(result.shadow_policy_surface.policy_closure.route_authority_changed, false);
  assert.equal(result.shadow_policy_surface.policy_closure.winner_authority_changed, false);
  assert.equal(result.shadow_policy_surface.policy_closure.production_authority, false);
  assert.equal(result.qianxuesen_alpha_fit.conclusion, "second_order_alpha_found_for_shadow_control");
  assert.ok(result.qianxuesen_alpha_fit.promoted_candidate_ids.includes("failed_outcome_without_unsafe_boundary"));
  assert.ok(result.qianxuesen_alpha_fit.promoted_candidate_ids.includes("non_actual_command_failed_outcome_overlap"));
  assert.ok(result.qianxuesen_alpha_fit.candidates.every((item) => item.authority_scope === "shadow_control_prior_only"));
  assert.equal(result.qianxuesen_alpha_fit.control_closure.action_change_count, 0);
  assert.equal(result.qianxuesen_alpha_fit.control_closure.route_authority_changed, false);
  assert.equal(result.qianxuesen_alpha_fit.control_closure.winner_authority_changed, false);
  assert.equal(result.qianxuesen_alpha_fit.control_closure.production_authority, false);
  assert.equal(result.safety.writes_zilliz, false);
  assert.equal(result.safety.calls_llm, false);
});

test("external trajectory alpha validates against schema", async () => {
  const { adaptation, sideBySide } = fixture();
  const result = await runExternalTrajectoryAlpha({
    adaptation,
    sideBySide,
    now: new Date("2026-05-15T13:00:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/external_trajectory_alpha.schema.json",
    data: result,
    name: "validate external trajectory alpha"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("external trajectory alpha writes local reports only", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-external-alpha-"));
  try {
    const { adaptation, sideBySide } = fixture();
    const result = await runExternalTrajectoryAlpha({
      adaptation,
      sideBySide,
      now: new Date("2026-05-15T13:00:00Z")
    });
    const written = await writeExternalTrajectoryAlphaArtifacts({
      result,
      outDir,
      now: new Date("2026-05-15T13:00:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "external-trajectory-alpha");
    assert.equal(persisted.safety.persists_raw_external_data, false);
    assert.match(markdown, /# External Trajectory Alpha/);
    assert.match(markdown, /## Qianxuesen Alpha Fit/);
    assert.match(markdown, /## Shadow Policy Surface/);
    assert.match(markdown, /ready_for_shadow_readout_consumption/);
    assert.match(markdown, /zilliz_written: false/);
    assert.match(markdown, /embedding_created: false/);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
