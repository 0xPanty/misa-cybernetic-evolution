import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  reviewStabilityIndicators,
  runStabilityMonitor,
  sampleDivergentPostDeployTickets,
  sampleDivergentSkillReplayResults,
  sampleStablePostDeployTickets,
  sampleStableSkillReplayResults
} from "../scripts/lib/stability-monitor.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

test("stability monitor stays normal when memory and skill indicators are stable", () => {
  const review = reviewStabilityIndicators({
    postDeployTickets: sampleStablePostDeployTickets(),
    skillReplayResults: sampleStableSkillReplayResults(),
    now: new Date("2026-05-21T00:00:00.000Z")
  });

  assert.equal(review.ok, true);
  assert.equal(review.safe_mode.active, false);
  assert.equal(review.safe_mode.state, "normal");
  assert.deepEqual(review.safe_mode.frozen_routes, []);
  assert.ok(review.safe_mode.allowed_routes.includes("memory"));
  assert.equal(review.summary.safe_mode_incident_count, 0);
  assert.equal(review.safety.production_authority, false);
  assert.equal(review.safety.live_route_table_mutated, false);
  assert.equal(review.safety.llm_api_calls, 0);
  assert.equal(review.safety.external_api_calls, 0);
});

test("stability monitor enters safe mode on divergent memory and skill indicators", async () => {
  const review = reviewStabilityIndicators({
    postDeployTickets: sampleDivergentPostDeployTickets(),
    skillReplayResults: sampleDivergentSkillReplayResults(),
    now: new Date("2026-05-21T00:00:00.000Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/stability-indicator.schema.json",
    data: review,
    name: "stability monitor safe mode"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(review.ok, false);
  assert.equal(review.summary.divergent_indicator_count, 2);
  assert.equal(review.safe_mode.active, true);
  assert.deepEqual(review.safe_mode.allowed_routes, ["damping", "ignore"]);
  assert.deepEqual(review.safe_mode.frozen_routes, ["memory", "skill", "case", "policy"]);
  assert.equal(review.safe_mode.requires_human_release, true);
  assert.equal(review.safe_mode.release_policy, "human_owner_manual_release_only");
  assert.equal(review.safe_mode.live_route_table_mutated, false);
  assert.equal(review.incidents.length, 2);
  assert.equal(review.incidents.every((incident) => incident.requires_human_release), true);
  assert.equal(review.incidents.every((incident) => incident.incident_path === null), true);
});

test("stability monitor writes incidents only when explicitly requested", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-stability-incidents-"));
  const review = await runStabilityMonitor({
    repoRoot: tempRoot,
    incidentRoot: "runs/stability-incidents",
    writeIncidents: true,
    postDeployTickets: sampleDivergentPostDeployTickets(),
    skillReplayResults: sampleDivergentSkillReplayResults(),
    now: new Date("2026-05-21T00:00:00.000Z")
  });

  assert.equal(review.ok, false);
  assert.equal(review.incidents.length, 2);
  assert.equal(review.incidents.every((incident) => typeof incident.incident_path === "string"), true);

  for (const incident of review.incidents) {
    const raw = await fs.readFile(path.join(tempRoot, incident.incident_path), "utf8");
    const payload = JSON.parse(raw);
    assert.equal(payload.schema_version, "misa.stability_incident.v1");
    assert.equal(payload.severity, "safe_mode");
    assert.deepEqual(payload.allowed_routes, ["damping", "ignore"]);
    assert.equal(payload.safety.production_authority, false);
    assert.equal(payload.safety.llm_api_calls, 0);
  }
});
