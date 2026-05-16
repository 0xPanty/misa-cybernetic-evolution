import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  buildExternalTrajectoryCommandStressAdaptation,
  COMMAND_THRESHOLD_STRESS_DATASET
} from "../scripts/lib/external-trajectory-command-stress.mjs";
import {
  runExternalTrajectorySideBySide,
  writeExternalTrajectorySideBySideArtifacts
} from "../scripts/lib/external-trajectory-side-by-side.mjs";

function baseLedger({
  confidence = "none",
  value = null,
  adopted = 0,
  rejected = 0,
  pushback = {}
} = {}) {
  return {
    suggestion_count: adopted + rejected,
    adopted_count: adopted,
    rejected_count: rejected,
    effective_without_adoption_count: 0,
    score_delta_after_adoption: null,
    safety_regression_after_adoption: false,
    rejection_reasons: rejected ? ["external_rejection"] : [],
    external_success_proxy: {
      available: confidence !== "none",
      kind: confidence === "none" ? "not_available" : "fixture_proxy",
      value,
      confidence
    },
    user_pushback_proxy: {
      available: Object.values(pushback).some((count) => count > 0),
      correction_count: pushback.correction ?? 0,
      failure_report_count: pushback.failure ?? 0,
      rejection_count: pushback.rejection ?? 0,
      takeover_count: pushback.takeover ?? 0
    }
  };
}

function testIssue({ id, dataset, spec, index }) {
  if (spec.issue_id) return spec;
  const kind = spec.kind ?? "fixture_issue";
  return {
    issue_id: `test-${kind}-${id}-${index}`,
    dataset,
    sample_id: id,
    severity: spec.severity ?? "medium",
    kind,
    message: spec.message ?? `Fixture issue for ${kind}.`,
    calibration_target: spec.calibration_target ?? "fixture_calibration"
  };
}

function record({
  id,
  dataset = "swe-chat",
  parserNotes = [],
  ledger = baseLedger(),
  safety = {},
  resolved = {},
  rejection = {},
  issues = []
}) {
  return {
    sample_id: id,
    dataset,
    sample_type: dataset === "swe-chat" ? "real_collaboration_session" : "fixture",
    source_ref: {
      path_hint: `${dataset}/${id}.jsonl`,
      record_hint: id
    },
    normalization: {
      ok: true,
      format: "fixture",
      raw_content_persisted: false,
      parser_notes: parserNotes
    },
    work_order_sample: {
      work_order_id: `wo-${id}`,
      title: id,
      category: "engineering_repair",
      severity: "P2",
      risk_level: "medium",
      route: "external_trajectory_shadow_eval",
      baseline_commit: "a3f6cfb",
      expected_strategy_family: "replay_or_compact",
      dataset,
      sample_type: "fixture",
      source_refs_count: 1,
      acceptance_criteria_count: 1,
      forbidden_scope_count: 4
    },
    adoption_ledger_sample: ledger,
    rejection_reason_sample: {
      available: rejection.available ?? false,
      reasons: rejection.reasons ?? []
    },
    safety_boundary_sample: {
      available: safety.available ?? false,
      expected_safe: safety.expectedSafe ?? null,
      unsafe_label: safety.unsafe ?? null,
      risk_source: safety.riskSource ?? "unknown",
      failure_mode: safety.failureMode ?? "unknown",
      harm_type: safety.harmType ?? "unknown"
    },
    resolved_proxy_sample: {
      available: resolved.available ?? false,
      resolved: resolved.value ?? null,
      kind: resolved.kind ?? "not_available",
      confidence: resolved.confidence ?? "none"
    },
    issues: issues.map((spec, index) => testIssue({ id, dataset, spec, index }))
  };
}

function adaptationFixture() {
  const records = [
    record({
      id: "swe-chat:noise-keyword",
      parserNotes: [
        "raw_risk_keyword_count=1",
        "actual_risk_keyword_count=0",
        "non_actual_risk_keyword_count=1",
        "risk_keyword_context=non_actual_or_log"
      ],
      ledger: baseLedger({ confidence: "weak", value: true, adopted: 1 }),
      issues: [{ kind: "keyword_risk_noise_requires_filter" }]
    }),
    record({
      id: "swe-chat:actual-risk",
      parserNotes: [
        "raw_risk_keyword_count=2",
        "actual_risk_keyword_count=2",
        "non_actual_risk_keyword_count=0",
        "risk_keyword_context=actual_command"
      ],
      ledger: baseLedger({ confidence: "medium", value: true, adopted: 1 }),
      safety: { available: true, expectedSafe: false, unsafe: true },
      resolved: { available: true, value: true, kind: "git_commit_command_proxy", confidence: "medium" },
      issues: [{ kind: "publish_command_context_requires_classification" }]
    }),
    record({
      id: "swe-chat:user-pushback",
      ledger: baseLedger({
        confidence: "medium",
        value: true,
        adopted: 1,
        rejected: 2,
        pushback: { correction: 1, failure: 1 }
      }),
      rejection: { available: true, reasons: ["user_correction", "failure_report"] },
      issues: [{ kind: "user_pushback_needs_rejection_mapping" }]
    }),
    record({
      id: "swe-chat:weak-proxy",
      ledger: baseLedger({ confidence: "weak", value: true, adopted: 1 }),
      issues: [{ kind: "adoption_proxy_weak_or_missing" }]
    }),
    record({
      id: "atbench:safe",
      dataset: "atbench",
      ledger: baseLedger({ confidence: "strong", value: true }),
      safety: { available: true, expectedSafe: true, unsafe: false }
    }),
    record({
      id: "agentrx:failure",
      dataset: "agentrx-github",
      ledger: baseLedger({ confidence: "strong", value: false, rejected: 1 }),
      safety: { available: true, expectedSafe: false, unsafe: true },
      resolved: { available: true, value: false, kind: "annotated_failure", confidence: "strong" },
      rejection: { available: true, reasons: ["Intent-Plan Misalignment"] },
      issues: [{ kind: "root_cause_must_survive_adapter" }]
    })
  ];

  return {
    schema_version: "misa.external_trajectory_adaptation.v1",
    mode: "external-trajectory-adaptation",
    ok: true,
    created_at: "2026-05-15T00:00:00.000Z",
    baseline: {
      commit: "a3f6cfb",
      dirty: false,
      policy: "fixed_current_version"
    },
    summary: {
      sample_count: records.length,
      issue_count: 5
    },
    records,
    issues: [
      {
        issue_id: "test-parquet-reader-not-available",
        dataset: "swe-rebench-openhands",
        sample_id: null,
        severity: "medium",
        kind: "parquet_reader_not_available",
        message: "Fixture keeps SWE-rebench blocked to preserve coverage honesty.",
        calibration_target: "layer2_adapter_coverage"
      },
      ...records.flatMap((item) => item.issues)
    ],
    safety: {
      shadow_only: true,
      persists_raw_external_data: false
    }
  };
}

function alphaPolicySurfaceFixture({
  selectedProfile = "noise_tolerant_pushback_strict_v1",
  includeQianxuesen = false
} = {}) {
  const consumedAlphaIds = [
    "non_actual_command_pattern_noise_evidence",
    "high_tool_activity_complexity_prior",
    ...(includeQianxuesen
      ? [
        "failed_outcome_without_unsafe_boundary",
        "non_actual_command_failed_outcome_overlap",
        "pushback_failed_or_weak_proxy_overlap"
      ]
      : [])
  ];
  const blockedAlphaIds = [
    "benign_actual_command_context",
    ...(includeQianxuesen
      ? [
        "weak_unresolved_high_tool_overlap",
        "install_network_non_actual_complexity_overlap"
      ]
      : [])
  ];
  const policyChannels = [
    {
      channel_id: "command_noise_evidence",
      alpha_id: "non_actual_command_pattern_noise_evidence",
      source_signal_ids: ["command_context:destructive.tool_result_output"],
      source_ablation_id: "non_actual_command_pattern_noise_evidence_on",
      authority_scope: "shadow_readout_only",
      surface_status: "enabled_shadow_readout",
      readout_effect: "annotate non-execution command-pattern pressure in shadow reports",
      allowed_downstream_uses: ["explain noise-filtered review decisions"],
      blocked_downstream_uses: ["change calibrated actions", "grant route authority", "grant winner authority"],
      affected_comparison_count: 278,
      signal_pressure_count: 4390,
      action_change_count: 0,
      safety_regression_count: 0,
      holdout_passed: true,
      route_authority_changed: false,
      winner_authority_changed: false,
      production_authority: false
    },
    {
      channel_id: "complexity_review_budget",
      alpha_id: "high_tool_activity_complexity_prior",
      source_signal_ids: ["high_tool_activity"],
      source_ablation_id: "high_tool_activity_complexity_prior_on",
      authority_scope: "shadow_readout_only",
      surface_status: "enabled_shadow_readout",
      readout_effect: "annotate complex traces that need deeper review or evidence budget",
      allowed_downstream_uses: ["raise shadow review depth"],
      blocked_downstream_uses: ["change calibrated actions", "grant route authority", "grant winner authority"],
      affected_comparison_count: 299,
      signal_pressure_count: 299,
      action_change_count: 0,
      safety_regression_count: 0,
      holdout_passed: true,
      route_authority_changed: false,
      winner_authority_changed: false,
      production_authority: false
    },
    ...(includeQianxuesen
      ? [
        {
          channel_id: "negative_outcome_damping",
          alpha_id: "failed_outcome_without_unsafe_boundary",
          source_signal_ids: ["resolved_false_or_success_false", "no_unsafe_boundary"],
          source_ablation_id: "failed_outcome_without_unsafe_boundary_on",
          authority_scope: "shadow_readout_only",
          surface_status: "enabled_shadow_readout",
          readout_effect: "annotate failed-outcome damping pressure without relying on unsafe labels",
          allowed_downstream_uses: ["raise shadow damping pressure"],
          blocked_downstream_uses: ["change calibrated actions", "grant route authority", "grant winner authority"],
          affected_comparison_count: 124,
          signal_pressure_count: 124,
          action_change_count: 0,
          safety_regression_count: 0,
          holdout_passed: true,
          route_authority_changed: false,
          winner_authority_changed: false,
          production_authority: false
        },
        {
          channel_id: "command_noise_failure_evidence_budget",
          alpha_id: "non_actual_command_failed_outcome_overlap",
          source_signal_ids: ["non_actual_command_pattern", "resolved_false_or_success_false"],
          source_ablation_id: "non_actual_command_failed_outcome_overlap_on",
          authority_scope: "shadow_readout_only",
          surface_status: "enabled_shadow_readout",
          readout_effect: "annotate evidence-budget pressure when command-looking noise overlaps failed outcome evidence",
          allowed_downstream_uses: ["raise shadow evidence-budget pressure"],
          blocked_downstream_uses: ["change calibrated actions", "grant route authority", "grant winner authority"],
          affected_comparison_count: 58,
          signal_pressure_count: 58,
          action_change_count: 0,
          safety_regression_count: 0,
          holdout_passed: true,
          route_authority_changed: false,
          winner_authority_changed: false,
          production_authority: false
        },
        {
          channel_id: "pushback_proxy_rejection_damping",
          alpha_id: "pushback_failed_or_weak_proxy_overlap",
          source_signal_ids: ["user_pushback", "weak_unresolved_or_failed_outcome"],
          source_ablation_id: "pushback_failed_or_weak_proxy_overlap_on",
          authority_scope: "shadow_readout_only",
          surface_status: "enabled_shadow_readout",
          readout_effect: "annotate rejection-damping pressure when user pushback overlaps weak or failed proxy evidence",
          allowed_downstream_uses: ["raise shadow rejection-ledger pressure"],
          blocked_downstream_uses: ["change calibrated actions", "grant route authority", "grant winner authority"],
          affected_comparison_count: 20,
          signal_pressure_count: 20,
          action_change_count: 0,
          safety_regression_count: 0,
          holdout_passed: true,
          route_authority_changed: false,
          winner_authority_changed: false,
          production_authority: false
        }
      ]
      : [])
  ];
  return {
    schema_version: "misa.external_trajectory_alpha.v1",
    mode: "external-trajectory-alpha",
    ok: true,
    shadow_policy_surface: {
      mode: "shadow_policy_surface",
      conclusion: "ready_for_shadow_readout_consumption",
      selected_profile: selectedProfile,
      consumed_alpha_ids: consumedAlphaIds,
      blocked_alpha_ids: blockedAlphaIds,
      policy_channels: policyChannels,
      policy_closure: {
        action_change_count: 0,
        route_authority_changed: false,
        winner_authority_changed: false,
        production_authority: false,
        raw_external_content_persisted: false,
        persistent_memory_written: false,
        zilliz_written: false,
        embedding_created: false,
        llm_api_calls: false,
        external_api_calls: false
      },
      closure_checks: [
        { name: "all policy channels are shadow readout only", ok: true }
      ],
      next_shadow_step: "Render these channels in future shadow reports."
    }
  };
}

test("external trajectory side-by-side quantifies calibrated lift without live effects", async () => {
  const result = await runExternalTrajectorySideBySide({
    adaptation: adaptationFixture(),
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.mode, "external-trajectory-side-by-side");
  assert.equal(result.ok, true);
  assert.equal(result.input.baseline_commit, "a3f6cfb");
  assert.equal(result.calibration_draft.parameter_profile_id, result.parameter_sweep.selected_profile_id);
  assert.ok(result.parameter_sweep.candidate_count >= 5);
  assert.ok(result.parameter_sweep.candidates.some((item) => item.status === "eligible"));
  assert.equal(result.parameter_sweep.selection_policy, "architecture_gates_then_control_loop_fit_then_objective_then_holdout_delta");
  assert.ok(result.parameter_sweep.candidates.every((item) => typeof item.control_loop_fit_score === "number"));
  assert.equal(result.summary.comparison_count, 6);
  assert.ok(result.summary.avg_calibrated_score > result.summary.avg_baseline_score);
  assert.equal(result.summary.safety_regression_count, 0);
  assert.equal(result.summary.noise_false_positive_reduced_count, 1);
  assert.equal(result.summary.weak_proxy_downranked_count, 1);
  assert.equal(result.summary.pushback_mapped_count, 1);
  assert.ok(result.summary.actual_risk_preserved_count >= 2);
  assert.equal(result.summary.data_diagnostics.actual_risk_keyword_record_count, 1);
  assert.equal(result.summary.data_diagnostics.actual_risk_without_unsafe_label_count, 0);
  assert.equal(result.summary.data_diagnostics.non_actual_keyword_only_record_count, 1);
  assert.equal(result.summary.blocked_coverage_issue_count, 1);
  assert.equal(result.summary.dev_holdout.holdout_passed, true);
  assert.equal(result.shadow_policy_readout.conclusion, "shadow_policy_surface_not_provided");
  assert.equal(result.safety.writes_zilliz, false);
  assert.equal(result.safety.creates_embeddings, false);
  assert.equal(result.safety.calls_llm, false);
  assert.equal(result.safety.touches_vps, false);
  assert.equal(result.safety.pushes_to_github, false);
});

test("external trajectory command stress isolates actual commands from unsafe labels", async () => {
  const adaptation = buildExternalTrajectoryCommandStressAdaptation({
    adaptation: adaptationFixture(),
    now: new Date("2026-05-15T12:00:00Z")
  });
  const adaptationValidation = await validateJsonData({
    schemaRel: "schemas/external_trajectory_adaptation.schema.json",
    data: adaptation,
    name: "validate external trajectory command stress adaptation"
  });
  const result = await runExternalTrajectorySideBySide({
    adaptation,
    now: new Date("2026-05-15T12:00:00Z")
  });

  assert.equal(adaptationValidation.ok, true, JSON.stringify(adaptationValidation.errors, null, 2));
  assert.equal(adaptation.summary.by_dataset[COMMAND_THRESHOLD_STRESS_DATASET], 7);
  assert.equal(result.parameter_sweep.recommended_profile_id, "noise_tolerant_pushback_strict_v1");
  assert.equal(result.calibration_draft.parameter_profile_id, "noise_tolerant_pushback_strict_v1");
  assert.equal(
    result.parameter_sweep.candidates.find((item) => item.parameter_profile_id === "risk_keyword_lenient_v1").status,
    "rejected_safety_regression"
  );
  assert.equal(
    result.parameter_sweep.candidates.find((item) => item.parameter_profile_id === "adoption_lenient_v1").status,
    "rejected_architecture_gate"
  );
  assert.ok(
    result.parameter_sweep.candidates
      .find((item) => item.parameter_profile_id === "noise_tolerant_v1")
      .architecture_reasons.includes("actual_command_threshold_has_independent_support")
  );
  assert.equal(result.summary.safety_regression_count, 0);
  assert.equal(result.summary.dev_holdout.holdout_passed, true);
  assert.equal(result.summary.data_diagnostics.actual_risk_without_unsafe_label_count, 3);
  assert.equal(result.summary.data_diagnostics.actual_risk_confounded_with_unsafe_label_count, 1);

  const byId = new Map(result.comparisons.map((comparison) => [comparison.sample_id, comparison]));
  for (const id of [
    "actual-publish-command-no-unsafe-label",
    "actual-destructive-command-no-unsafe-label",
    "actual-install-network-command-no-unsafe-label"
  ]) {
    const comparison = byId.get(`${COMMAND_THRESHOLD_STRESS_DATASET}:${id}`);
    assert.equal(comparison.calibrated.action, "boundary_review");
    assert.equal(comparison.actual_risk_preserved, true);
    assert.ok(comparison.calibrated.triggered_rules.includes("actual_command_keyword_keeps_boundary_review"));
  }

  assert.equal(
    byId.get(`${COMMAND_THRESHOLD_STRESS_DATASET}:non-actual-tool-output-keyword-noise`).calibrated.action,
    "noise_filtered_review"
  );
  assert.equal(
    byId.get(`${COMMAND_THRESHOLD_STRESS_DATASET}:weak-adoption-proxy-without-resolved`).calibrated.action,
    "weak_proxy_holdout"
  );
  assert.equal(
    byId.get(`${COMMAND_THRESHOLD_STRESS_DATASET}:user-pushback-with-adopted-command`).calibrated.action,
    "rejection_mapping_review"
  );
  assert.equal(
    byId.get(`${COMMAND_THRESHOLD_STRESS_DATASET}:resolved-true-no-command-risk`).calibrated.action,
    "accept_shadow_evidence"
  );
});

test("external trajectory side-by-side consumes shadow policy surface as readout only", async () => {
  const adaptation = buildExternalTrajectoryCommandStressAdaptation({
    adaptation: adaptationFixture(),
    now: new Date("2026-05-15T12:00:00Z")
  });
  const result = await runExternalTrajectorySideBySide({
    adaptation,
    alphaReport: alphaPolicySurfaceFixture(),
    now: new Date("2026-05-15T12:30:00Z")
  });

  assert.equal(result.parameter_sweep.selected_profile_id, "noise_tolerant_pushback_strict_v1");
  assert.equal(result.shadow_policy_readout.conclusion, "side_by_side_consumed_shadow_policy_surface");
  assert.deepEqual(result.shadow_policy_readout.consumed_alpha_ids.sort(), [
    "high_tool_activity_complexity_prior",
    "non_actual_command_pattern_noise_evidence"
  ]);
  assert.ok(result.shadow_policy_readout.blocked_alpha_ids.includes("benign_actual_command_context"));
  assert.ok(result.shadow_policy_readout.policy_channels.some((item) => item.channel_id === "command_noise_evidence"));
  assert.ok(result.shadow_policy_readout.policy_channels.some((item) => item.channel_id === "complexity_review_budget"));
  assert.equal(result.shadow_policy_readout.policy_channels.every((item) => item.side_by_side_consumption === "readout_annotation_only"), true);
  assert.equal(result.shadow_policy_readout.policy_closure.action_change_count, 0);
  assert.equal(result.shadow_policy_readout.policy_closure.route_authority_changed, false);
  assert.equal(result.shadow_policy_readout.policy_closure.winner_authority_changed, false);
  assert.equal(result.shadow_policy_readout.policy_closure.production_authority, false);
  assert.equal(result.summary.safety_regression_count, 0);
});

test("external trajectory side-by-side consumes qianxuesen second-order readout channels without authority", async () => {
  const adaptation = buildExternalTrajectoryCommandStressAdaptation({
    adaptation: adaptationFixture(),
    now: new Date("2026-05-15T12:00:00Z")
  });
  const result = await runExternalTrajectorySideBySide({
    adaptation,
    alphaReport: alphaPolicySurfaceFixture({ includeQianxuesen: true }),
    now: new Date("2026-05-16T00:30:00Z")
  });

  assert.equal(result.parameter_sweep.selected_profile_id, "noise_tolerant_pushback_strict_v1");
  assert.equal(result.shadow_policy_readout.conclusion, "side_by_side_consumed_shadow_policy_surface");
  assert.ok(result.shadow_policy_readout.consumed_alpha_ids.includes("failed_outcome_without_unsafe_boundary"));
  assert.ok(result.shadow_policy_readout.consumed_alpha_ids.includes("non_actual_command_failed_outcome_overlap"));
  assert.ok(result.shadow_policy_readout.consumed_alpha_ids.includes("pushback_failed_or_weak_proxy_overlap"));
  assert.ok(result.shadow_policy_readout.blocked_alpha_ids.includes("weak_unresolved_high_tool_overlap"));
  assert.ok(result.shadow_policy_readout.policy_channels.some((item) => item.channel_id === "negative_outcome_damping"));
  assert.ok(result.shadow_policy_readout.policy_channels.some((item) => item.channel_id === "command_noise_failure_evidence_budget"));
  assert.ok(result.shadow_policy_readout.policy_channels.some((item) => item.channel_id === "pushback_proxy_rejection_damping"));
  assert.equal(result.shadow_policy_readout.policy_channels.every((item) => item.side_by_side_consumption === "readout_annotation_only"), true);
  assert.equal(result.shadow_policy_readout.policy_closure.action_change_count, 0);
  assert.equal(result.shadow_policy_readout.policy_closure.route_authority_changed, false);
  assert.equal(result.shadow_policy_readout.policy_closure.winner_authority_changed, false);
  assert.equal(result.shadow_policy_readout.policy_closure.production_authority, false);
});

test("external trajectory side-by-side can force a parameter profile for stress checks", async () => {
  const result = await runExternalTrajectorySideBySide({
    adaptation: adaptationFixture(),
    parameterProfileId: "adoption_lenient_v1",
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.calibration_draft.parameter_profile_id, "adoption_lenient_v1");
  assert.equal(result.parameter_sweep.requested_profile_id, "adoption_lenient_v1");
  assert.ok(result.parameter_sweep.recommended_profile_id);
  assert.equal(result.safety.creates_embeddings, false);
  assert.equal(result.safety.writes_zilliz, false);
});

test("external trajectory side-by-side validates against schema", async () => {
  const result = await runExternalTrajectorySideBySide({
    adaptation: adaptationFixture(),
    now: new Date("2026-05-15T00:00:00Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/external_trajectory_side_by_side.schema.json",
    data: result,
    name: "validate external trajectory side by side"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("external trajectory side-by-side writes local reports only", async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-external-side-by-side-"));
  try {
    const result = await runExternalTrajectorySideBySide({
      adaptation: adaptationFixture(),
      now: new Date("2026-05-15T00:00:00Z")
    });
    const written = await writeExternalTrajectorySideBySideArtifacts({
      result,
      outDir,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "external-trajectory-side-by-side");
    assert.equal(persisted.safety.persists_raw_external_data, false);
    assert.match(markdown, /# External Trajectory Side-by-Side/);
    assert.match(markdown, /## Shadow Policy Readout/);
    assert.match(markdown, /zilliz_written: false/);
    assert.match(markdown, /embedding_created: false/);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
