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
  determineNextStep,
  recordRuntimeErrorSignal,
  replayRuntimeThread
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

test("v0.28 runtime thread records the v0.27 candidate reducer handoff in the event log", async () => {
  const packets = await examplePackets();
  const { thread } = buildRuntimeThreadFromPackets({
    ...packets,
    now: FIXED_NOW
  });
  const reducerEvent = thread.event_log.find((event) => event.event_type === "candidate_reducer_ready");

  assert.ok(reducerEvent);
  assert.equal(reducerEvent.payload.candidate_count, packets.candidateReducer.summary.candidate_count);
  assert.equal(
    reducerEvent.payload.candidate_result_refs.length,
    packets.candidateReducer.candidate_results.length
  );
  assert.equal(reducerEvent.payload.reducer_policy.same_input_same_seed_same_output, true);
  assert.equal(reducerEvent.payload.reducer_policy.runtime_fetch_allowed, false);
  assert.equal(reducerEvent.payload.reducer_policy.llm_tool_calls_allowed, false);
  assert.equal(reducerEvent.payload.candidate_result_refs[0].output_surface, "draft_candidate_only");
  assert.equal(reducerEvent.payload.candidate_result_refs[0].execution_allowed, false);
  assert.equal(reducerEvent.payload.candidate_result_refs[0].publication_allowed, false);
});

test("v0.28 runtime thread local gate completes only after resume and stays no-effect", async () => {
  const packets = await examplePackets();
  const { thread, nextStep, localGate } = buildRuntimeThreadFromPackets({
    ...packets,
    humanDecision: "choose_executor",
    runLocalGate: true,
    now: FIXED_NOW
  });
  const gateEvent = thread.event_log.find((event) => event.event_type === "local_gate_passed");

  assert.ok(gateEvent);
  assert.equal(localGate.ok, true);
  assert.equal(localGate.checks.event_log_has_candidate_context, true);
  assert.equal(localGate.checks.event_log_has_candidate_reducer, true);
  assert.equal(localGate.checks.candidate_layer_connected, true);
  assert.equal(localGate.checks.resumed_before_local_gate, true);
  assert.equal(thread.status, "completed");
  assert.equal(thread.business_state.phase, "completed");
  assert.equal(thread.business_state.completed_step_count, 1);
  assert.equal(nextStep.step_type, "complete");
  assert.equal(gateEvent.payload.safety.executes_work_orders, false);
  assert.equal(gateEvent.payload.safety.calls_model_providers, false);
  assert.equal(gateEvent.payload.safety.calls_external_api, false);
  assert.equal(gateEvent.payload.safety.touches_vps, false);
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

test("v0.28 runtime thread replay rebuilds the same local-gated next step from the event log", async () => {
  const packets = await examplePackets();
  const { thread, nextStep } = buildRuntimeThreadFromPackets({
    ...packets,
    humanDecision: "choose_executor",
    runLocalGate: true,
    now: FIXED_NOW
  });
  const replay = replayRuntimeThread(thread, { now: FIXED_NOW });
  const secondReplay = replayRuntimeThread(thread, { now: FIXED_NOW });

  assert.deepEqual(secondReplay, replay);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed_event_count, thread.event_log.length);
  assert.equal(replay.thread.status, thread.status);
  assert.equal(replay.thread.business_state.phase, thread.business_state.phase);
  assert.equal(replay.thread.business_state.completed_step_count, thread.business_state.completed_step_count);
  assert.equal(replay.next_step.step_type, nextStep.step_type);
  assert.equal(replay.next_step.step_id, nextStep.step_id);
});

test("v0.28 runtime thread error signal fails closed without live authority", async () => {
  const packets = await examplePackets();
  const { thread: resumedThread } = buildRuntimeThreadFromPackets({
    ...packets,
    humanDecision: "choose_executor",
    now: FIXED_NOW
  });
  const { thread, nextStep, errorSignal } = recordRuntimeErrorSignal(resumedThread, {
    errorType: "candidate_replay_failed",
    summary: "Candidate replay failed during deterministic local gate.",
    payload: {
      source_event_id: "test-runtime-error"
    },
    now: FIXED_NOW
  });
  const errorEvent = thread.event_log.find((event) => event.event_type === "runtime_error_compacted");

  assert.ok(errorEvent);
  assert.equal(errorSignal.execution_allowed, false);
  assert.equal(errorSignal.repair_required, true);
  assert.equal(thread.status, "failed");
  assert.equal(thread.business_state.phase, "failed");
  assert.equal(nextStep.step_type, "error");
  assert.equal(nextStep.execution.tool_call_allowed, false);
  assert.equal(nextStep.execution.provider_call_allowed, false);
  assert.equal(nextStep.execution.external_api_allowed, false);
  assert.equal(nextStep.execution.vps_touch_allowed, false);
  assert.equal(thread.safety.executes_work_orders, false);
  assert.equal(thread.safety.touches_vps, false);
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

test("v0.28 runtime thread CLI can run a deterministic local gate artifact", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-runtime-thread-gate-"));
  const outFile = path.join(tempRoot, "runtime-thread-local-gate.json");

  await execFileAsync(process.execPath, [
    "scripts/runtime-thread.mjs",
    "--now",
    FIXED_NOW.toISOString(),
    "--seed",
    "runtime-thread-test",
    "--decision",
    "choose_executor",
    "--run-local-gate",
    "--out-file",
    outFile
  ], {
    cwd: process.cwd()
  });

  const parsed = JSON.parse(await fs.readFile(outFile, "utf8"));

  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.status, "completed");
  assert.equal(parsed.summary.next_step_type, "complete");
  assert.equal(parsed.summary.local_gate_passed_count, 1);
  assert.equal(parsed.summary.runtime_error_count, 0);
  assert.equal(parsed.replay.next_step.step_type, "complete");
  assert.equal(parsed.safety.calls_external_api, false);
});
