import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildQianxuesenFullLoopHealth,
  runQianxuesenFullLoopHealth
} from "../scripts/lib/qianxuesen-full-loop-health.mjs";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

test("qianxuesen full-loop health writes latest plus timestamped history", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "misa-qianxuesen-health-"));
  const now = new Date("2026-05-14T08:30:00Z");
  const report = await runQianxuesenFullLoopHealth({ rootDir, now });
  const historyRoot = path.join(rootDir, "history", report.run_id);
  const latestJson = path.join(rootDir, "latest.json");
  const latestMd = path.join(rootDir, "latest.md");
  const historyJson = path.join(historyRoot, "health.json");
  const historyMd = path.join(historyRoot, "health.md");
  const smokeArtifact = path.join(historyRoot, "artifacts", "current-line-smoke.json");
  const calibrationArtifact = path.join(historyRoot, "artifacts", "current-line-calibration.json");

  assert.equal(report.schema_version, "misa.qianxuesen_full_loop_health.v1");
  assert.equal(report.ok, true);
  assert.equal(report.status, "pass");
  assert.equal(report.scope, "qianxuesen-full-loop");
  assert.equal(report.verdict.summary, "full_loop_shadow_passed");
  assert.match(report.verdict.plain, /passed without live effects/);
  assert.ok(report.key_findings.length >= 5);
  assert.ok(report.key_findings.some((finding) => finding.includes("Routes covered")));
  assert.equal(report.blocking_failures.length, 0);
  assert.equal(report.safety.live_effect_allowed, false);
  assert.equal(report.safety.writes_persistent_memory, false);
  assert.equal(report.safety.zilliz_written, false);
  assert.equal(report.safety.embedding_created, false);
  assert.equal(report.safety.changes_route, false);
  assert.equal(report.safety.changes_winner, false);
  assert.equal(report.safety.controller_authority_leaked, false);
  assert.equal(report.coverage.route_coverage.includes("policy"), true);
  assert.equal(report.component_summaries.current_line_smoke.checks.passed, 12);
  assert.equal(report.component_summaries.skill_evolution.replay_required, 1);
  assert.equal(report.component_summaries.skill_evolution.no_write, true);
  assert.equal(report.component_summaries.hermes_runtime_adapter.evolution_candidates, 4);
  assert.equal(report.component_summaries.hermes_runtime_adapter.writes_skills, false);
  assert.equal(report.component_summaries.hermes_runtime_adapter.blocks_runtime, false);
  assert.equal(report.component_summaries.source_distillation.sources, 18);
  assert.equal(report.component_summaries.qianxuesen_route_decision.owner, "qianxuesen");
  assert.equal(report.component_summaries.perception.authority, "hint_only");
  assert.equal(report.component_summaries.perception.replay_ok, true);
  assert.equal(report.component_summaries.curiosity_signal_gate.authority, "advice_only");
  assert.equal(report.component_summaries.curiosity_signal_gate.llm_variant_generation_count, 3);
  assert.equal(report.component_summaries.curiosity_signal_gate.optional_review_count, 4);
  assert.equal(report.component_summaries.curiosity_signal_gate.missed_review_worthy_count, 0);
  assert.equal(report.component_summaries.curiosity_signal_gate.noise_selected_count, 0);
  assert.equal(report.component_summaries.retrieval.all_top1_kind_match, true);
  assert.equal(report.component_summaries.tournament.production_authority, false);
  assert.equal(report.component_summaries.judge.llm_api_calls, 0);
  assert.equal(report.component_summaries.sample_sets.length, 5);
  assert.equal(report.component_summaries.sample_sets.every((sample) => sample.ok), true);
  assert.equal(report.retention.default_history, true);
  assert.equal(report.retention.latest_files_are_overwritten, true);
  assert.equal(report.retention.history_files_are_append_only_by_run_id, true);
  assert.ok(Buffer.byteLength(JSON.stringify(report), "utf8") < 100000);

  for (const status of Object.values(report.component_status)) {
    assert.equal(status, "pass");
  }

  for (const filePath of [latestJson, latestMd, historyJson, historyMd, smokeArtifact, calibrationArtifact]) {
    const stat = await fs.stat(filePath);
    assert.equal(stat.isFile(), true, filePath);
  }

  assert.equal((await readJson(latestJson)).run_id, report.run_id);
  assert.equal((await readJson(historyJson)).run_id, report.run_id);
  assert.match(await fs.readFile(latestMd, "utf8"), /## Key Findings/);
  assert.match(await fs.readFile(latestMd, "utf8"), /## Sample Sets/);

  const smoke = await readJson(smokeArtifact);
  const calibration = await readJson(calibrationArtifact);
  smoke.summary.zilliz_written = true;
  smoke.checks.find((check) => check.name === "no live writes or provider calls").ok = false;

  const unsafe = buildQianxuesenFullLoopHealth({
    now,
    runId: "unsafe-smoke",
    smoke,
    calibration
  });

  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.component_status.safety_boundary, "fail");
  assert.ok(unsafe.blocking_failures.some((failure) => failure.name === "zilliz_written"));
});
