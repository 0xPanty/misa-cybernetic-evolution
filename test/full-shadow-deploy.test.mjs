import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runFullShadowDeploy } from "../scripts/full-shadow-deploy.mjs";

test("full shadow deploy wires Hermes logs, distiller review, inbox, and value proof without live effects", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-full-shadow-"));
  const pluginDir = path.join(tempRoot, "hermes-plugin");
  const eventLogFile = path.join(tempRoot, "qianxuesen-runtime-events.ndjson");
  const reportRoot = path.join(tempRoot, "full-shadow-report");
  const workOrderRoot = path.join(tempRoot, "work-orders");

  const result = await runFullShadowDeploy({
    pluginDir,
    eventLogFile,
    reportRoot,
    workOrderRoot,
    seedCount: 2,
    now: new Date("2026-05-23T11:00:00Z")
  });

  assert.equal(result.mode, "full-shadow-deploy");
  assert.equal(result.ok, true);
  assert.equal(result.summary.seed_count, 2);
  assert.equal(result.summary.value_comparisons, 36);
  assert.equal(result.summary.positive_lift_rate, 1);
  assert.ok(result.summary.window_atomic_lessons > 0);
  assert.equal(result.safety.full_shadow_online, true);
  assert.equal(result.safety.production_deploy, false);
  assert.equal(result.safety.starts_background_service, false);
  assert.equal(result.safety.installs_observe_only_hermes_plugin, true);
  assert.equal(result.safety.writes_window_distillation_report, true);
  assert.equal(result.safety.writes_local_vector_store, true);
  assert.equal(result.safety.writes_work_order_inbox, true);
  assert.equal(result.safety.writes_zilliz, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.safety.hermes_memory_written, false);
  assert.equal(result.safety.hermes_skills_written, false);
  assert.equal(result.safety.blocks_runtime_tools, false);
  assert.equal(result.safety.can_promote_to_production, false);
  assert.equal(result.artifacts.hermes_runtime_adapter.ok, true);
  assert.equal(result.artifacts.hermes_work_order.ok, true);
  assert.equal(result.artifacts.window_distillation.ok, true);
  assert.equal(result.artifacts.window_distillation.zilliz_proxy_used, false);
  assert.equal(result.artifacts.window_distillation.production_authority, false);
  assert.equal(result.artifacts.session_distiller_review.ok, true);
  assert.equal(result.artifacts.work_order_inbox.ok, true);
  assert.equal((await fs.stat(path.join(pluginDir, "plugin.yaml"))).isFile(), true);
  assert.equal((await fs.stat(eventLogFile)).isFile(), true);
  assert.equal((await fs.stat(path.join(reportRoot, "window-distillation.json"))).isFile(), true);
  assert.equal((await fs.stat(path.join(reportRoot, "latest.json"))).isFile(), true);
  assert.equal((await fs.stat(path.join(workOrderRoot, "latest-index.json"))).isFile(), true);
});
