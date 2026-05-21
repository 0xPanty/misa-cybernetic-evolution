import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  reviewStabilityIndicators,
  sampleDivergentPostDeployTickets,
  sampleDivergentSkillReplayResults,
  sampleStablePostDeployTickets,
  sampleStableSkillReplayResults,
  toSidecarStatus
} from "../scripts/lib/stability-monitor.mjs";

const execFileAsync = promisify(execFile);

async function assertValidSidecarStatus(status, name = "sidecar status") {
  const validation = await validateJsonData({
    schemaRel: "schemas/sidecar-status.schema.json",
    data: status,
    name
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
}

test("sidecar status stays normal for stable stability review", async () => {
  const review = reviewStabilityIndicators({
    postDeployTickets: sampleStablePostDeployTickets(),
    skillReplayResults: sampleStableSkillReplayResults(),
    now: new Date("2026-05-21T00:00:00.000Z")
  });
  const status = toSidecarStatus(review);

  assert.equal(status.schema_version, "cybernetic.sidecar_status.v1");
  assert.equal(status.updated_at, "2026-05-21T00:00:00.000Z");
  assert.equal(status.stability.state, "normal");
  assert.deepEqual(status.stability.frozen_routes, []);
  assert.equal(status.stability.requires_human_release, false);
  assert.deepEqual(status.stability.incidents, []);
  assert.equal(status.safety.production_authority, false);
  assert.equal(status.safety.is_recommendation_only, true);
  assert.equal(status.safety.llm_api_calls, 0);
  assert.equal(status.safety.external_api_calls, 0);
  await assertValidSidecarStatus(status, "normal sidecar status");
});

test("sidecar status broadcasts safe mode incidents without mutation authority", async () => {
  const review = reviewStabilityIndicators({
    postDeployTickets: sampleDivergentPostDeployTickets(),
    skillReplayResults: sampleDivergentSkillReplayResults(),
    now: new Date("2026-05-21T00:00:00.000Z")
  });
  const status = toSidecarStatus(review);

  assert.equal(status.stability.state, "safe_mode");
  assert.deepEqual(status.stability.allowed_routes, ["damping", "ignore"]);
  assert.deepEqual(status.stability.frozen_routes, ["memory", "skill", "case", "policy"]);
  assert.equal(status.stability.requires_human_release, true);
  assert.equal(status.stability.incidents.length, 2);
  assert.equal(status.stability.incidents.every((incident) => typeof incident.indicator_id === "string"), true);
  assert.equal(status.stability.incidents.every((incident) => incident.value >= incident.threshold), true);
  assert.equal(status.safety.production_authority, false);
  assert.equal(status.safety.is_recommendation_only, true);
  await assertValidSidecarStatus(status, "safe mode sidecar status");
});

test("sidecar status supports custom stale window", () => {
  const review = reviewStabilityIndicators({
    now: new Date("2026-05-21T00:00:00.000Z")
  });
  const status = toSidecarStatus(review, { staleAfterMinutes: 30 });

  assert.equal(status.stale_after_minutes, 30);
});

test("stability monitor CLI writes validated sidecar status only when requested", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sidecar-status-"));
  const statusPath = path.join(tempRoot, "sidecar-status", "stability.json");

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "scripts/stability-monitor.mjs",
        "--demo-divergent",
        "--write-status",
        statusPath,
        "--json"
      ], {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10
      }),
      (error) => error.code === 1
    );

    const status = JSON.parse(await fs.readFile(statusPath, "utf8"));
    assert.equal(status.stability.state, "safe_mode");
    assert.equal(status.stability.requires_human_release, true);
    assert.equal(status.safety.production_authority, false);
    assert.equal(status.safety.llm_api_calls, 0);
    await assertValidSidecarStatus(status, "CLI sidecar status");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("stability monitor CLI default does not write sidecar status", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sidecar-status-default-"));
  const statusPath = path.join(tempRoot, "stability.json");

  try {
    await execFileAsync(process.execPath, [
      "scripts/stability-monitor.mjs",
      "--json"
    ], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 10
    });

    await assert.rejects(
      fs.stat(statusPath),
      (error) => error.code === "ENOENT"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
