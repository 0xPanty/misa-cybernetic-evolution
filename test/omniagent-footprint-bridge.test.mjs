import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { buildAdaptiveCandidate } from "../scripts/lib/adaptive-candidate-gate.mjs";
import {
  evaluateOmniAgentFootprintBridge,
  reviewOmniAgentFootprintBridge
} from "../scripts/lib/omniagent-footprint-bridge.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

async function readFixture(name) {
  const raw = await fs.readFile(
    path.join(process.cwd(), "examples", "omniagent-footprint-bridge", name),
    "utf8"
  );
  return JSON.parse(raw);
}

async function assertBridgeSchema(result, name) {
  const validation = await validateJsonData({
    schemaRel: "schemas/omniagent_footprint_bridge.schema.json",
    data: result,
    name
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
}

test("agentmemory context injection becomes policy evidence with preserved recall provenance", async () => {
  const result = reviewOmniAgentFootprintBridge({
    footprint: await readFixture("agentmemory-context-injection.input.json"),
    now: new Date("2026-05-28T08:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.input_profile, "agentmemory_footprint_profile");
  assert.equal(result.route_summary.selected_route, "policy");
  assert.equal(result.footprint_summary.auto_write_indicators.context_injection, true);
  assert.equal(result.footprint_summary.provenance.state, "passed");
  assert.equal(result.footprint_summary.provenance.has_agentmemory_provenance, true);
  assert.equal(result.converted_learning_event.signals.includes("context_injection_risk"), true);
  assert.ok(result.converted_learning_event.source_refs.includes("agentmemory:context_packet:ctx-agentmemory-001"));
  assert.ok(result.converted_learning_event.source_refs.includes("agentmemory:observation:obs-agentmemory-007"));
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  assert.deepEqual(evaluateOmniAgentFootprintBridge(result), []);
  await assertBridgeSchema(result, "agentmemory context injection bridge output");
});

test("agentmemory provider takeover is policy-only and never imports memory authority", async () => {
  const result = reviewOmniAgentFootprintBridge({
    footprint: await readFixture("agentmemory-provider-takeover.input.json"),
    now: new Date("2026-05-28T08:01:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.route_summary.selected_route, "policy");
  assert.equal(result.footprint_summary.auto_write_indicators.memory_write, true);
  assert.equal(result.footprint_summary.auto_write_indicators.memory_provider_takeover, true);
  assert.equal(result.footprint_summary.auto_write_indicators.runtime_mutation, true);
  assert.equal(result.converted_learning_event.signals.includes("memory_provider_takeover_risk"), true);
  assert.equal(result.omniagent_borrowed.auto_memory_write_imported, false);
  assert.equal(result.control_boundary.route_owner, "qianxuesen");
  assert.equal(result.control_boundary.automatic_promotion_allowed, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  await assertBridgeSchema(result, "agentmemory provider takeover bridge output");
});

test("agentmemory recall without provenance is held as low-trust damping evidence", async () => {
  const result = reviewOmniAgentFootprintBridge({
    footprint: await readFixture("agentmemory-unverified-recall.input.json"),
    now: new Date("2026-05-28T08:02:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.route_summary.selected_route, "damping");
  assert.equal(result.footprint_summary.provenance.state, "held");
  assert.equal(result.footprint_summary.provenance.has_agentmemory_provenance, false);
  assert.equal(result.converted_learning_event.signals.includes("avoid_overreaction"), true);
  assert.equal(result.converted_learning_event.signals.includes("context_injection_risk"), false);
  assert.equal(result.converted_learning_event.source_refs.every((ref) => !ref.startsWith("agentmemory:")), true);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  await assertBridgeSchema(result, "agentmemory unverified recall bridge output");
});

test("external-only footprint cannot become validation-ready through the adaptive gate", async () => {
  const result = reviewOmniAgentFootprintBridge({
    footprint: await readFixture("repeated-success.input.json"),
    now: new Date("2026-05-13T00:00:00Z")
  });
  const candidate = buildAdaptiveCandidate(result.cycle_trace);
  const externalGate = candidate.safety_gates.find((gate) => gate.name === "external_footprint_promotion");

  assert.equal(result.route_summary.selected_route, "skill");
  assert.equal(candidate.decision, "held_for_more_evidence");
  assert.equal(candidate.verification.enters_verification, false);
  assert.equal(externalGate?.state, "held");
  assert.equal(Object.values(candidate.safety.live_effects).some(Boolean), false);
});
