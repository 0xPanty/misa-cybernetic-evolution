import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildHermesRuntimeAdapterReport,
  runHermesRuntimeAdapter
} from "../scripts/lib/hermes-runtime-adapter.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

test("Hermes runtime adapter turns self-improvement traces into replay-gated pressure", async () => {
  const result = await runHermesRuntimeAdapter({
    now: new Date("2026-05-15T00:00:00Z")
  });
  const candidateTypes = new Set(result.evolution_candidates.map((candidate) => candidate.candidate_type));
  const checkNames = new Set(result.checks.map((check) => check.name));

  assert.equal(result.mode, "hermes-runtime-adapter");
  assert.equal(result.ok, true);
  assert.equal(result.adapter.runtime, "hermes-agent");
  assert.equal(result.adapter.default_mode, "observe_only");
  assert.equal(result.universal_contract.control_owner, "qianxuesen");
  assert.equal(result.universal_contract.framework_role, "carrier_runtime");
  assert.equal(result.summary.event_count, 4);
  assert.equal(result.summary.normalized_event_count, 4);
  assert.equal(result.summary.skill_manage_event_count, 1);
  assert.equal(result.summary.memory_write_event_count, 1);
  assert.equal(result.summary.external_information_event_count, 2);
  assert.equal(result.summary.research_digest_count, 2);
  assert.equal(result.summary.evolution_candidate_count, 4);
  assert.equal(result.summary.replay_required_count, 4);
  assert.equal(result.summary.tournament_required_count, 4);
  assert.equal(candidateTypes.has("skill_variant"), true);
  assert.equal(candidateTypes.has("policy_boundary_variant"), true);
  assert.equal(candidateTypes.has("research_followup"), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.replay_required), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.tournament_required), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.can_promote_now === false), true);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(result.safety.blocks_runtime, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.ok(checkNames.has("Hermes hook surface is mapped"));
  assert.ok(checkNames.has("skill_manage changes become replay-gated candidates"));
  assert.ok(checkNames.has("external information becomes research digest evidence"));
});

test("Hermes runtime adapter output validates against the universal adapter schema", async () => {
  const result = await runHermesRuntimeAdapter();
  const validation = await validateJsonData({
    schemaRel: "schemas/agent_runtime_adapter.schema.json",
    data: result,
    name: "validate Hermes runtime adapter report"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("Hermes runtime adapter can read observe-only plugin NDJSON event logs", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-hermes-runtime-events-"));
  const eventLog = path.join(tempRoot, "events.ndjson");
  const events = [
    {
      event_id: "plugin-pretool-skill-patch-001",
      hook: "pre_tool_call",
      tool_name: "skill_manage",
      args: {
        action: "patch",
        name: "farcaster-reply",
        fingerprint: "abc"
      },
      context: {
        conversation_signals: ["knowledge_gap", "user_correction"],
        terms: ["Hermes", "Farcaster"]
      }
    },
    {
      event_id: "plugin-posttool-session-search-002",
      hook: "post_tool_call",
      tool_name: "session_search",
      args: {
        query: "Farcaster protocol changes"
      },
      result: {
        success: true
      },
      context: {
        conversation_signals: ["research_needed"],
        terms: ["session_search"]
      }
    }
  ];
  await fs.writeFile(eventLog, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");

  const result = await runHermesRuntimeAdapter({
    eventLogFile: eventLog,
    runtimeCommit: "test-runtime",
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.adapter.runtime_commit, "test-runtime");
  assert.equal(result.summary.event_count, 2);
  assert.equal(result.summary.evolution_candidate_count, 2);
  assert.equal(result.summary.research_digest_count, 2);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(result.safety.llm_api_calls, 0);
});

test("empty Hermes event capture stays observe-only", () => {
  const result = buildHermesRuntimeAdapterReport({
    fixture: {
      source: {
        runtime: "hermes-agent",
        runtime_commit: "unknown",
        source_url: "https://github.com/NousResearch/hermes-agent"
      },
      events: []
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.event_count, 0);
  assert.equal(result.summary.evolution_candidate_count, 0);
  assert.equal(result.safety.production_authority, false);
  assert.equal(result.safety.llm_api_calls, 0);
});
