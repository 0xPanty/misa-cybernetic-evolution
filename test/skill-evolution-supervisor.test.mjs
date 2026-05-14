import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  runSkillEvolutionSupervisor,
  superviseSkillEvolution
} from "../scripts/lib/skill-evolution-supervisor.mjs";

const execFileAsync = promisify(execFile);

async function readJson(relPath) {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), relPath), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runNode(args) {
  return execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 20
  });
}

test("skill evolution supervisor accepts safe behavior and keeps evolution replay-gated", async () => {
  const result = await runSkillEvolutionSupervisor({
    now: new Date("2026-05-14T12:30:00Z")
  });

  assert.equal(result.mode, "skill-evolution-supervisor");
  assert.equal(result.ok, true);
  assert.equal(result.summary.status, "pass");
  assert.equal(result.summary.evolution_candidate_count, 1);
  assert.equal(result.summary.replay_required_count, 1);
  assert.equal(result.promotion_gate.can_promote_now, false);
  assert.equal(result.promotion_gate.replay_required, true);
  assert.equal(result.safety.no_write, true);
  assert.equal(result.safety.production_authority, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.supervisor_changes_skill, false);
  assert.equal(result.routing.owner, "qianxuesen");

  const candidate = result.evolution_candidates[0];
  assert.equal(candidate.target, "reply_scoring");
  assert.equal(candidate.status, "replay_required");
  assert.equal(candidate.allowed_space_match, true);
  assert.equal(candidate.promotion_gate.can_promote_now, false);
});

test("skill evolution supervisor blocks private memory in public behavior", async () => {
  const contract = await readJson("examples/skill-evolution/farcaster_reply_operator.contract.json");
  const event = clone(await readJson("examples/behavior-events/farcaster_public_reply.event.json"));
  event.event_id = "behavior-farcaster-private-memory-risk";
  event.action = "auto_publish_high_risk";
  event.effects.persistent_write = true;
  event.effects.durable_effect = true;
  event.authority.requested_authority = "live_write";
  event.result.status = "executed";
  event.risk.level = "blocking";
  event.risk.triggers.push("private_memory_used");
  event.inputs.memory_used.push({
    memory_class: "private",
    ref: "memory:owner-private-note",
    reason: "Unsafe test fixture"
  });

  const result = superviseSkillEvolution({
    contract,
    behaviorEvent: event,
    now: new Date("2026-05-14T12:35:00Z")
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.status, "fail");
  assert.ok(result.violations.some((violation) => violation.code === "forbidden_action"));
  assert.ok(result.violations.some((violation) => violation.code === "forbidden_memory_used"));
  assert.ok(result.violations.some((violation) => violation.code === "missing_qianxuesen_gate"));
  assert.equal(result.safety.live_effect_allowed, false);
  assert.equal(result.safety.event_persistent_write, true);
  assert.equal(result.routing.recommended_route, "policy");
});

test("skill evolution supervisor blocks forbidden evolution targets", async () => {
  const contract = await readJson("examples/skill-evolution/farcaster_reply_operator.contract.json");
  const event = clone(await readJson("examples/behavior-events/farcaster_public_reply.event.json"));
  event.event_id = "behavior-farcaster-forbidden-evolution";
  event.evolution.candidate.target = "live_publish_policy";

  const result = superviseSkillEvolution({
    contract,
    behaviorEvent: event,
    now: new Date("2026-05-14T12:40:00Z")
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.code === "forbidden_evolution_target"));
  assert.equal(result.evolution_candidates[0].status, "blocked");
  assert.equal(result.evolution_candidates[0].forbidden_space_match, true);
  assert.equal(result.promotion_gate.can_promote_now, false);
});

test("skill evolution CLI writes strict JSON handoff artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-skill-evolution-"));
  const outFile = path.join(tempRoot, "skill-evolution.json");

  try {
    await runNode([
      "scripts/skill-evolution-supervisor.mjs",
      "--json",
      "--out-file",
      outFile,
      "--now",
      "2026-05-14T12:45:00Z"
    ]);

    const persisted = JSON.parse(await fs.readFile(outFile, "utf8"));
    assert.equal(persisted.mode, "skill-evolution-supervisor");
    assert.equal(persisted.ok, true);
    assert.equal(persisted.summary.replay_required_count, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
