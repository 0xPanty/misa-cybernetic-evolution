import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function adaptationRecord({
  sampleId,
  dataset = "swe-rebench-openhands",
  issues = [],
  safetyBoundary = false,
  resolved = true
}) {
  return {
    sample_id: sampleId,
    dataset,
    sample_type: "fixture",
    source_ref: {
      path_hint: `${dataset}/${sampleId}.jsonl`,
      record_hint: sampleId
    },
    normalization: {
      ok: true,
      format: "fixture",
      raw_content_persisted: false,
      parser_notes: []
    },
    adoption_ledger_sample: {
      suggestion_count: 1,
      adopted_count: resolved ? 1 : 0,
      external_success_proxy: {
        available: true,
        kind: "fixture",
        value: resolved,
        confidence: "medium"
      },
      user_pushback_proxy: {
        available: false,
        correction_count: 0,
        failure_report_count: 0,
        rejection_count: 0,
        takeover_count: 0
      }
    },
    rejection_reason_sample: {
      available: !resolved,
      reasons: resolved ? [] : ["fixture_failed_proxy"]
    },
    safety_boundary_sample: {
      available: safetyBoundary,
      expected_safe: safetyBoundary ? false : null,
      unsafe_label: safetyBoundary ? true : null,
      risk_source: safetyBoundary ? "fixture_actual_command" : "unknown",
      failure_mode: safetyBoundary ? "actual_command_context" : "unknown",
      harm_type: safetyBoundary ? "durable_effect_boundary" : "unknown"
    },
    resolved_proxy_sample: {
      available: true,
      resolved,
      kind: "fixture",
      confidence: "medium"
    },
    issues: issues.map((kind, index) => ({
      issue_id: `${sampleId}-${index}`,
      dataset,
      sample_id: sampleId,
      severity: "medium",
      kind,
      message: `Fixture issue for ${kind}.`,
      calibration_target: kind
    }))
  };
}

test("L1 alpha simulation finds local candidate and handoff pressure without LLM calls", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-l1-alpha-"));
  try {
    const adaptation = {
      schema_version: "misa.external_trajectory_adaptation.v1",
      mode: "external-trajectory-adaptation",
      ok: true,
      batch: {
        sampling_profile: "fixture"
      },
      summary: {
        sample_count: 3
      },
      records: [
        adaptationRecord({
          sampleId: "swe-rebench-openhands:actual-command",
          issues: ["actual_command_context_requires_classification"],
          safetyBoundary: true
        }),
        adaptationRecord({
          sampleId: "swe-rebench-openhands:keyword-noise",
          issues: ["keyword_risk_noise_requires_filter"]
        }),
        adaptationRecord({
          sampleId: "swe-rebench-openhands:resolved-false",
          issues: ["resolved_false_proxy_needs_negative_mapping"],
          resolved: false
        })
      ],
      safety: {
        shadow_only: true,
        persists_raw_external_data: false
      }
    };
    const adaptationPath = path.join(tempRoot, "adaptation.json");
    await fs.writeFile(adaptationPath, `${JSON.stringify(adaptation, null, 2)}\n`);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/l1-alpha-simulation.mjs",
      "--adaptation-report",
      adaptationPath,
      "--no-write",
      "--json"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024
    });
    const result = JSON.parse(stdout);

    assert.equal(result.ok, true);
    assert.equal(result.input.llm_api_calls, 0);
    assert.equal(result.safety.llm_api_calls, 0);
    assert.equal(result.safety.touches_vps, false);
    assert.equal(result.alpha_summary.sample_count, 3);
    assert.equal(result.alpha_summary.l2_eligible_count, 3);
    assert.equal(result.alpha_summary.candidate_count_hint_counts["2"], 1);
    assert.equal(result.alpha_summary.candidate_count_hint_counts["1"], 2);
    assert.equal(result.alpha_summary.simulated_handoff_floor_counts.primary_agent, 1);
    assert.equal(result.alpha_summary.simulated_handoff_floor_counts.no_context_agent, 2);
    assert.ok(result.alpha_summary.gemini_probe_set.selected_source_ids.includes("swe-rebench-openhands:actual-command"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
