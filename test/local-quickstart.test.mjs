import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runLocalSidecarQuickstart } from "../scripts/local-quickstart.mjs";

test("local quickstart bootstraps the sidecar and proves local value without live effects", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-local-quickstart-"));
  const vectorRoot = path.join(tempRoot, "local-vector-store");
  const bootstrapReportRoot = path.join(tempRoot, "bootstrap-report");
  const reportRoot = path.join(tempRoot, "quickstart-report");

  const result = await runLocalSidecarQuickstart({
    vectorRoot,
    bootstrapReportRoot,
    reportRoot,
    seedCount: 2,
    now: new Date("2026-05-23T10:00:00Z")
  });

  assert.equal(result.mode, "local-sidecar-quickstart");
  assert.equal(result.ok, true);
  assert.equal(result.summary.seed_count, 2);
  assert.equal(result.summary.positive_lift_rate, 1);
  assert.equal(result.safety.one_command_local_deploy, true);
  assert.equal(result.safety.production_deploy, false);
  assert.equal(result.safety.starts_background_service, false);
  assert.equal(result.safety.writes_local_vector_store, true);
  assert.equal(result.safety.writes_zilliz, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.safety.hermes_memory_written, false);
  assert.equal(result.safety.hermes_skills_written, false);
  assert.equal(result.safety.can_promote_to_production, false);
  assert.equal(result.artifacts.hermes_value_proof.negative_control_rejected, true);
  assert.equal((await fs.stat(path.join(vectorRoot, "records.jsonl"))).isFile(), true);
  assert.equal((await fs.stat(path.join(reportRoot, "latest.json"))).isFile(), true);
});
