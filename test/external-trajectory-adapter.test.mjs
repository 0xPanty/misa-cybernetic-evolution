import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  runExternalTrajectoryAdaptation,
  writeExternalTrajectoryAdaptationArtifacts
} from "../scripts/lib/external-trajectory-adapter.mjs";

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function makeFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "misa-external-trajectory-"));
  await writeJson(path.join(root, "atbench", "ATBench500", "test.json"), [
    {
      conv_id: "unsafe-1",
      label: 1,
      risk_source: "malicious_tool_execution",
      failure_mode: "insecure_interaction_or_execution",
      real_world_harm: "security_and_system_integrity_harm",
      content: "raw content should not be persisted"
    }
  ]);
  await writeJson(path.join(root, "atbench-codex", "test.json"), [
    {
      id: "codex-unsafe-1",
      is_safe: false,
      risk_source: "repository_artifact_injection",
      failure_mode: "destructive_workspace_mutation",
      harm_type: "functional_and_opportunity_harm",
      reason: "unsafe rollout",
      codex_rollout: [{ type: "turn_context" }, { type: "response_item" }]
    }
  ]);
  await writeJson(path.join(root, "agentrx-github", "trajectories", "magentic-one", "trajectories_info.json"), {
    "Intent-Plan Misalignment": {
      "case-1": {
        step: 4,
        reason: "Intent-Plan Misalignment",
        name: "intent_plan_misalignment.json"
      }
    }
  });
  await writeJson(path.join(root, "swe-chat", "transcripts-file-list.json"), [
    { path: "transcripts/session-1.jsonl", size: 100 },
    { path: "transcripts/session-2.jsonl", size: 100 }
  ]);
  await fs.mkdir(path.join(root, "swe-chat", "transcripts"), { recursive: true });
  await fs.writeFile(
    path.join(root, "swe-chat", "transcripts", "session-1.jsonl"),
    [
      JSON.stringify({ type: "user", message: { role: "user", content: "This failed, please fix it." }, sessionId: "session-1" }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "I will inspect and verify." }, sessionId: "session-1" }),
      JSON.stringify({ type: "progress", data: { command: "npm test && git commit -m fix" }, sessionId: "session-1" })
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "swe-chat", "transcripts", "session-2.jsonl"),
    [
      JSON.stringify({ type: "user", message: { role: "user", content: "Check the failed deploy log." }, sessionId: "session-2" }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "The log mentions a publish command, but I am not running it." }, sessionId: "session-2" }),
      JSON.stringify({ type: "assistant", toolUseResult: { stdout: "previous log: git push origin main failed" }, sessionId: "session-2" })
    ].join("\n"),
    "utf8"
  );
  await fs.mkdir(path.join(root, "swe-rebench-openhands"), { recursive: true });
  await fs.writeFile(path.join(root, "swe-rebench-openhands", "trajectories.parquet"), "PAR1", "utf8");
  return root;
}

test("external trajectory adapter emits one sanitized record per readable sample", async () => {
  const root = await makeFixtureRoot();
  try {
    const result = await runExternalTrajectoryAdaptation({
      datasetRoot: root,
      maxPerDataset: 1,
      baselineCommit: "a3f6cfb",
      baselineDirty: false,
      now: new Date("2026-05-15T00:00:00Z")
    });

    assert.equal(result.mode, "external-trajectory-adaptation");
    assert.equal(result.ok, true);
    assert.equal(result.baseline.commit, "a3f6cfb");
    assert.equal(result.baseline.policy, "fixed_current_version");
    assert.equal(result.summary.sample_count, 4);
    assert.deepEqual(result.summary.by_dataset, {
      "atbench": 1,
      "atbench-codex": 1,
      "agentrx-github": 1,
      "swe-chat": 1
    });
    assert.equal(result.summary.blocked_dataset_count, 1);
    assert.ok(result.issues.some((item) => item.kind === "parquet_reader_not_available"));
    assert.equal(result.safety.shadow_only, true);
    assert.equal(result.safety.calls_llm, false);
    assert.equal(result.safety.calls_external_api, false);
    assert.equal(result.safety.touches_vps, false);
    assert.equal(result.safety.pushes_to_github, false);
    assert.equal(result.records.every((record) => record.normalization.raw_content_persisted === false), true);
    assert.equal(JSON.stringify(result).includes("raw content should not be persisted"), false);
    assert.ok(result.records.some((record) => record.adoption_ledger_sample.rejection_reasons.length > 0));
    assert.ok(result.records.some((record) => record.resolved_proxy_sample.available));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("external trajectory adapter separates risk keywords from actual command context", async () => {
  const root = await makeFixtureRoot();
  try {
    const result = await runExternalTrajectoryAdaptation({
      datasetRoot: root,
      datasets: ["swe-chat"],
      maxPerDataset: 2,
      samplingProfile: "stratified",
      baselineCommit: "a3f6cfb",
      baselineDirty: false,
      now: new Date("2026-05-15T00:00:00Z")
    });

    assert.equal(result.summary.sample_count, 2);
    assert.equal(result.summary.swe_chat_context.raw_risk_keyword_records, 1);
    assert.equal(result.summary.swe_chat_context.actual_risk_keyword_records, 0);
    assert.equal(result.summary.swe_chat_context.likely_noise_keyword_records, 1);
    assert.ok(result.issues.some((item) => item.kind === "keyword_risk_noise_requires_filter"));
    assert.equal(result.summary.adoption_ledger.safety_regression_after_adoption_count, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("external trajectory adapter classifies payload command context without unknown fallback", async () => {
  const root = await makeFixtureRoot();
  const manifestPath = path.join(root, "swe-chat", "transcripts-file-list.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.push({ path: "transcripts/session-3.jsonl", size: 100 });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(root, "swe-chat", "transcripts", "session-3.jsonl"),
    [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell_command",
          arguments: JSON.stringify({ command: "git commit -m payload-classifier" })
        },
        sessionId: "session-3"
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call_output",
          output: "stdout mentions npm test and prior denied rm -rf temp output"
        },
        sessionId: "session-3"
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "exec_command_end",
          command: "git push origin main",
          stdout: "pytest passed",
          stderr: ""
        },
        sessionId: "session-3"
      }),
      JSON.stringify({
        type: "turn_context",
        payload: {
          user_instructions: "Plan text says do not run git reset --hard."
        },
        sessionId: "session-3"
      }),
      JSON.stringify({
        type: "queue-operation",
        operation: "enqueue",
        content: "Queued transcript text mentions git commit but is not a live command.",
        sessionId: "session-3"
      }),
      JSON.stringify({
        type: "gemini",
        content: "Model text suggests yarn test as a plan, not as a live command.",
        sessionId: "session-3"
      })
    ].join("\n"),
    "utf8"
  );

  try {
    const result = await runExternalTrajectoryAdaptation({
      datasetRoot: root,
      datasets: ["swe-chat"],
      maxPerDataset: 3,
      samplingProfile: "head",
      baselineCommit: "a3f6cfb",
      baselineDirty: false,
      now: new Date("2026-05-15T00:00:00Z")
    });

    const record = result.records.find((item) => item.sample_id === "swe-chat:session-3");
    assert.ok(record);
    const commandContexts = record.normalization.parser_notes
      .find((note) => note.startsWith("command_contexts="));
    assert.ok(commandContexts.includes("git_commit.actual_command:1"));
    assert.ok(commandContexts.includes("git_commit.quoted_or_log_output:1"));
    assert.ok(commandContexts.includes("git_push_or_publish.actual_command:1"));
    assert.ok(commandContexts.includes("destructive.tool_result_output:1"));
    assert.ok(commandContexts.includes("destructive.plan_or_instruction:1"));
    assert.ok(commandContexts.includes("test_or_verify.plan_or_instruction:1"));
    assert.equal(commandContexts.includes(".unknown"), false);
    assert.equal(JSON.stringify(result).includes("payload-classifier"), false);
    assert.equal(JSON.stringify(result).includes("prior denied rm -rf temp output"), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("external trajectory adapter reads SWE-rebench sanitized JSONL sidecar", async () => {
  const root = await makeFixtureRoot();
  const sidecarPath = path.join(root, "swe-rebench-openhands", "sanitized-trajectories.jsonl");
  await fs.writeFile(
    sidecarPath,
    [
      JSON.stringify({
        instance_id: "swe-sidecar-actual",
        resolved: true,
        adopted_count: 1,
        suggestion_count: 3,
        raw_risk_keyword_count: 1,
        actual_risk_keyword_count: 1,
        non_actual_risk_keyword_count: 0,
        command_contexts: "install_or_dependency.actual_command:1"
      }),
      JSON.stringify({
        instance_id: "swe-sidecar-noise",
        resolved: true,
        adopted_count: 1,
        confidence: "weak",
        raw_risk_keyword_count: 2,
        actual_risk_keyword_count: 0,
        non_actual_risk_keyword_count: 2,
        command_contexts: "git_push_or_publish.tool_result_output:2"
      }),
      JSON.stringify({
        instance_id: "swe-sidecar-pushback",
        resolved: false,
        adopted_count: 1,
        correction_count: 1,
        failure_report_count: 1,
        raw_risk_keyword_count: 0,
        actual_risk_keyword_count: 0,
        non_actual_risk_keyword_count: 0
      })
    ].join("\n"),
    "utf8"
  );

  try {
    const result = await runExternalTrajectoryAdaptation({
      datasetRoot: root,
      datasets: ["swe-rebench-openhands"],
      maxPerDataset: 3,
      samplingProfile: "stratified",
      baselineCommit: "a3f6cfb",
      baselineDirty: false,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const validation = await validateJsonData({
      schemaRel: "schemas/external_trajectory_adaptation.schema.json",
      data: result,
      name: "validate swe rebench sidecar adaptation"
    });

    assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
    assert.equal(result.summary.sample_count, 3);
    assert.deepEqual(result.summary.by_dataset, { "swe-rebench-openhands": 3 });
    assert.equal(result.summary.blocked_dataset_count, 0);
    assert.equal(result.issues.some((item) => item.kind === "parquet_reader_not_available"), false);
    assert.equal(result.records.every((record) => record.normalization.format === "sanitized_jsonl_sidecar"), true);
    assert.equal(result.records.every((record) => record.normalization.raw_content_persisted === false), true);
    assert.ok(result.records.some((record) => record.normalization.parser_notes.includes("risk_keyword_context=actual_command")));
    assert.ok(result.records.some((record) => record.normalization.parser_notes.includes("risk_keyword_context=non_actual_or_log")));
    assert.ok(result.issues.some((item) => item.kind === "swe_rebench_actual_command_context_requires_classification"));
    assert.ok(result.issues.some((item) => item.kind === "keyword_risk_noise_requires_filter"));
    assert.ok(result.issues.some((item) => item.kind === "user_pushback_needs_rejection_mapping"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("external trajectory adapter validates against schema", async () => {
  const root = await makeFixtureRoot();
  try {
    const result = await runExternalTrajectoryAdaptation({
      datasetRoot: root,
      maxPerDataset: 1,
      baselineCommit: "a3f6cfb",
      baselineDirty: false,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const validation = await validateJsonData({
      schemaRel: "schemas/external_trajectory_adaptation.schema.json",
      data: result,
      name: "validate external trajectory adaptation"
    });

    assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("external trajectory adapter writes local reports only", async () => {
  const root = await makeFixtureRoot();
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-external-trajectory-out-"));
  try {
    const result = await runExternalTrajectoryAdaptation({
      datasetRoot: root,
      maxPerDataset: 1,
      baselineCommit: "a3f6cfb",
      baselineDirty: false,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const written = await writeExternalTrajectoryAdaptationArtifacts({
      result,
      outDir,
      now: new Date("2026-05-15T00:00:00Z")
    });
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "external-trajectory-adaptation");
    assert.equal(persisted.safety.persists_raw_external_data, false);
    assert.match(markdown, /# External Trajectory Adaptation/);
    assert.match(markdown, /raw_external_data_persisted: false/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outDir, { recursive: true, force: true });
  }
});
