import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { buildDefaultCandidateGenerationContext } from "../scripts/lib/candidate-generation-context.mjs";
import { buildFactorCandidateReducer } from "../scripts/lib/factor-candidate-reducer.mjs";
import { humanEscalationsFromWorkOrderRouting } from "../scripts/lib/human-escalation.mjs";
import {
  buildRuntimeThreadFromPackets,
  determineNextStep
} from "../scripts/lib/runtime-thread.mjs";
import { routeWorkOrders } from "../scripts/lib/work-order-router.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

const FIXED_NOW = new Date("2026-05-21T00:00:00Z");
const execFileAsync = promisify(execFile);

async function examplePackets() {
  const workOrderRouting = await routeWorkOrders({
    repoRoot: process.cwd(),
    now: FIXED_NOW
  });
  const candidateContext = await buildDefaultCandidateGenerationContext({
    repoRoot: process.cwd(),
    workOrderRouting,
    now: FIXED_NOW
  });
  const candidateReducer = buildFactorCandidateReducer({
    candidateContext,
    seed: "runtime-thread-test",
    now: FIXED_NOW
  });
  return {
    candidateContext,
    candidateReducer,
    humanEscalations: humanEscalationsFromWorkOrderRouting(workOrderRouting, { now: FIXED_NOW })
  };
}

test("v0.28 runtime thread pauses on unresolved human escalation", async () => {
  const packets = await examplePackets();
  const { thread, nextStep } = buildRuntimeThreadFromPackets({
    ...packets,
    now: FIXED_NOW
  });
  const threadCheck = await validateJsonData({
    schemaRel: "schemas/agent_thread.schema.json",
    data: thread,
    name: "agent thread"
  });
  const stepCheck = await validateJsonData({
    schemaRel: "schemas/next_step.schema.json",
    data: nextStep,
    name: "next step"
  });

  assert.equal(threadCheck.ok, true, JSON.stringify(threadCheck.errors ?? [], null, 2));
  assert.equal(stepCheck.ok, true, JSON.stringify(stepCheck.errors ?? [], null, 2));
  assert.equal(thread.status, "paused");
  assert.equal(thread.business_state.phase, "waiting_for_human");
  assert.equal(thread.business_state.pending_human_escalation_ids.length, 1);
  assert.equal(nextStep.step_type, "pause_for_human");
  assert.equal(nextStep.execution.provider_call_allowed, false);
  assert.equal(nextStep.execution.vps_touch_allowed, false);
  assert.equal(nextStep.authority.llm_may_choose_next_step, false);
});

test("v0.28 runtime thread resumes to local gate after human decision", async () => {
  const packets = await examplePackets();
  const { thread, nextStep } = buildRuntimeThreadFromPackets({
    ...packets,
    humanDecision: "choose_executor",
    now: FIXED_NOW
  });

  assert.equal(thread.status, "running");
  assert.equal(thread.business_state.phase, "local_gate");
  assert.equal(thread.business_state.pending_human_escalation_ids.length, 0);
  assert.equal(thread.business_state.last_human_decision, "choose_executor");
  assert.equal(nextStep.step_type, "run_local_gate");
  assert.equal(nextStep.resume_policy.replay_from_event_log, true);
  assert.equal(nextStep.execution.tool_call_allowed, false);
  assert.equal(thread.safety.executes_work_orders, false);
  assert.equal(thread.safety.calls_model_providers, false);
});

test("v0.28 runtime thread reducer is deterministic for same packets and decision", async () => {
  const packets = await examplePackets();
  const first = buildRuntimeThreadFromPackets({
    ...packets,
    humanDecision: "choose_executor",
    now: FIXED_NOW
  });
  const second = buildRuntimeThreadFromPackets({
    ...packets,
    humanDecision: "choose_executor",
    now: FIXED_NOW
  });

  assert.deepEqual(second, first);
  assert.deepEqual(
    determineNextStep(first.thread, { now: FIXED_NOW }),
    determineNextStep(second.thread, { now: FIXED_NOW })
  );
});

test("v0.28 runtime thread CLI writes strict JSON handoff artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-runtime-thread-"));
  const outFile = path.join(tempRoot, "runtime-thread.json");

  await execFileAsync(process.execPath, [
    "scripts/runtime-thread.mjs",
    "--now",
    FIXED_NOW.toISOString(),
    "--seed",
    "runtime-thread-test",
    "--out-file",
    outFile
  ], {
    cwd: process.cwd()
  });

  const parsed = JSON.parse(await fs.readFile(outFile, "utf8"));

  assert.equal(parsed.mode, "runtime-thread-review");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.thread.schema_version, "misa.agent_thread.v1");
  assert.equal(parsed.next_step.schema_version, "misa.next_step.v1");
  assert.equal(parsed.safety.touches_vps, false);
});
