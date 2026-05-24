import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  runHermesRuntimePluginDoctor,
  runHermesRuntimePluginInstall
} from "../scripts/lib/hermes-runtime-plugin.mjs";
import { runHermesRuntimeAdapter } from "../scripts/lib/hermes-runtime-adapter.mjs";

const PYTHON = process.env.PYTHON ?? "python";
const PYTHON_AVAILABLE = spawnSync(PYTHON, ["--version"], { encoding: "utf8" }).status === 0;
const PYTHON_OPTIONAL_OUTSIDE_CI = !PYTHON_AVAILABLE && !process.env.CI
  ? "Python is unavailable; Hermes plugin hook execution is skipped outside CI"
  : false;

function pythonString(value) {
  return JSON.stringify(value);
}

test("Hermes runtime plugin installs to a local plugin directory and stays observe-only", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-hermes-plugin-install-"));
  const pluginDir = path.join(tempRoot, "plugins", "qianxuesen-runtime-adapter");
  const eventLog = path.join(tempRoot, "qianxuesen-runtime-events.ndjson");
  const result = await runHermesRuntimePluginInstall({
    pluginDir,
    eventLogFile: eventLog,
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.mode, "hermes-runtime-plugin-install");
  assert.equal(result.ok, true);
  assert.equal(result.safety.writes_plugin_files, true);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(result.safety.blocks_runtime, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal((await fs.stat(path.join(pluginDir, "plugin.yaml"))).isFile(), true);
  assert.equal((await fs.stat(path.join(pluginDir, "__init__.py"))).isFile(), true);
  assert.equal((await fs.stat(path.join(pluginDir, "README.md"))).isFile(), true);
});

test("Hermes runtime plugin doctor validates source sample without requiring an event log", async () => {
  const result = await runHermesRuntimePluginDoctor({
    pluginDir: path.join("examples", "hermes-runtime-plugin"),
    eventLogFile: path.join(os.tmpdir(), "missing-qianxuesen-runtime-events.ndjson"),
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.mode, "hermes-runtime-plugin-doctor");
  assert.equal(result.ok, true);
  assert.equal(result.summary.event_log_present, false);
  assert.equal(result.safety.writes_plugin_files, false);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(result.safety.llm_api_calls, 0);
});

test("Hermes model I/O tap redacts canaries before NDJSON persistence", { skip: PYTHON_OPTIONAL_OUTSIDE_CI }, async () => {
  assert.equal(PYTHON_AVAILABLE, true, "Python is required for the CI-blocking Hermes plugin redaction test");

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-hermes-plugin-redaction-"));
  const eventLog = path.join(tempRoot, "qianxuesen-runtime-events.ndjson");
  const pluginFile = path.resolve("examples", "hermes-runtime-plugin", "__init__.py");
  const canaries = [
    "SECRET_PROMPT_DO_NOT_LEAK",
    "FAKE_API_TOKEN_DO_NOT_LEAK",
    "LONG_CODE_SNIPPET_DO_NOT_LEAK:function privateExample(){return 42;}",
    "TOOL_ARGS_DO_NOT_LEAK",
    "ASSISTANT_OUTPUT_DO_NOT_LEAK"
  ];
  const script = `
import importlib.util
import os

os.environ["QIANXUESEN_HERMES_EVENT_LOG"] = ${pythonString(eventLog)}
spec = importlib.util.spec_from_file_location("qianxuesen_runtime_adapter", ${pythonString(pluginFile)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Ctx:
    def __init__(self):
        self.hooks = {}
    def register_hook(self, name, handler):
        self.hooks[name] = handler

ctx = Ctx()
module.register(ctx)
ctx.hooks["pre_api_request"](
    session_id="s-redaction-canary",
    task_id="task-redaction-canary",
    provider="openai-compatible",
    model="synthetic-model",
    base_url="https://example.invalid/provider",
    api_mode="chat_completions",
    api_call_count=1,
    api_key=${pythonString(canaries[1])},
    request_messages=[
        {"role": "system", "content": ${pythonString(canaries[0])}},
        {"role": "user", "content": ${pythonString(canaries[2])}},
        {"role": "tool", "status": "error", "content": ${pythonString(canaries[3])}},
    ],
    tools=[
        {"type": "function", "function": {"name": "private_tool", "description": ${pythonString(canaries[3])}}}
    ],
    message_count=3,
    tool_count=1,
    approx_input_tokens=123,
    request_char_count=2048
)
ctx.hooks["post_api_request"](
    session_id="s-redaction-canary",
    task_id="task-redaction-canary",
    provider="openai-compatible",
    model="synthetic-model",
    base_url="https://example.invalid/provider",
    api_mode="chat_completions",
    api_call_count=1,
    usage={"input_tokens": 123, "output_tokens": 45, "cache_read_input_tokens": 10},
    assistant_message={"content": ${pythonString(canaries[4])}}
)
`;
  const run = spawnSync(PYTHON, ["-c", script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const rawLog = await fs.readFile(eventLog, "utf8");
  const records = rawLog.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(records.length, 2);

  for (const canary of canaries) {
    assert.equal(rawLog.includes(canary), false, `${canary} leaked into model_io_tap NDJSON`);
  }
  for (const record of records) {
    assert.equal(record.record_kind, "model_io_tap");
    assert.equal(record.redaction_status, "at_tap_point");
    assert.equal(record.raw_prompt_persisted, false);
    assert.equal(record.raw_private_content_exported, false);
    assert.equal(record.contains_raw_private_content, false);
    assert.equal(record.source_contract.llm_api_calls, 0);
  }
});

test("installed Hermes plugin emits NDJSON hooks that adapt-runtime can replay", { skip: !PYTHON_AVAILABLE }, async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-hermes-plugin-hooks-"));
  const pluginDir = path.join(tempRoot, "plugins", "qianxuesen-runtime-adapter");
  const eventLog = path.join(tempRoot, "qianxuesen-runtime-events.ndjson");
  await runHermesRuntimePluginInstall({
    pluginDir,
    eventLogFile: eventLog,
    now: new Date("2026-05-15T00:00:00Z")
  });

  const script = `
import importlib.util
import os

os.environ["QIANXUESEN_HERMES_EVENT_LOG"] = ${pythonString(eventLog)}
spec = importlib.util.spec_from_file_location("qianxuesen_runtime_adapter", ${pythonString(path.join(pluginDir, "__init__.py"))})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Ctx:
    def __init__(self):
        self.hooks = {}
    def register_hook(self, name, handler):
        self.hooks[name] = handler

ctx = Ctx()
module.register(ctx)
ctx.hooks["pre_tool_call"](
    session_id="s-hermes-plugin-test",
    tool_call_id="tool-skill",
    tool_name="skill_manage",
    args={"action": "patch", "name": "reply-quality", "private_content": "do not persist this"},
    context={"terms": ["Hermes", "skill_manage"], "signals": ["external_framework_change"], "evidence_refs": ["simulated-hermes-hook"]}
)
ctx.hooks["post_tool_call"](
    session_id="s-hermes-plugin-test",
    tool_call_id="tool-search",
    tool_name="session_search",
    args={"query": "do not persist this query", "limit": 3},
    result={"success": True, "items": ["do not persist this result"]},
    context={"terms": ["session_search"], "conversation_signals": ["research_needed"], "evidence_refs": ["simulated-hermes-search"]}
)
ctx.hooks["pre_api_request"](
    session_id="s-hermes-plugin-test",
    task_id="task-model-io",
    provider="openai-compatible",
    model="synthetic-model",
    base_url="https://example.invalid/private-provider",
    api_mode="chat_completions",
    api_call_count=1,
    request_messages=[
        {"role": "system", "content": "do not persist this system prompt"},
        {"role": "user", "content": "do not persist this user message"},
        {"role": "tool", "status": "error", "content": "do not persist this failed tool result"},
    ],
    tools=[
        {"type": "function", "function": {"name": "private_tool", "description": "do not persist this tool schema"}}
    ],
    message_count=3,
    tool_count=1,
    approx_input_tokens=321,
    request_char_count=4096
)
ctx.hooks["post_api_request"](
    session_id="s-hermes-plugin-test",
    task_id="task-model-io",
    provider="openai-compatible",
    model="synthetic-model",
    base_url="https://example.invalid/private-provider",
    api_mode="chat_completions",
    api_call_count=1,
    usage={"input_tokens": 321, "output_tokens": 45, "cache_read_input_tokens": 100},
    finish_reason="stop",
    assistant_message={"content": "do not persist this answer"}
)
`;
  const run = spawnSync(PYTHON, ["-c", script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const rawLog = await fs.readFile(eventLog, "utf8");
  assert.match(rawLog, /"schema_version": "misa\.hermes_runtime_event\.v1"/);
  assert.doesNotMatch(rawLog, /do not persist this/);

  const doctor = await runHermesRuntimePluginDoctor({
    pluginDir,
    eventLogFile: eventLog,
    now: new Date("2026-05-15T00:00:00Z")
  });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.summary.event_log_present, true);
  assert.equal(doctor.summary.adapter_events, 2);
  assert.equal(doctor.summary.adapter_model_io_taps, 2);
  assert.equal(doctor.summary.adapter_research_digests, 2);
  assert.equal(doctor.summary.adapter_evolution_candidates, 2);

  const adapted = await runHermesRuntimeAdapter({
    eventLogFile: eventLog,
    now: new Date("2026-05-15T00:00:00Z")
  });
  const candidateTypes = new Set(adapted.evolution_candidates.map((candidate) => candidate.candidate_type));

  assert.equal(adapted.ok, true);
  assert.equal(adapted.summary.event_count, 2);
  assert.equal(adapted.summary.model_io_tap_count, 2);
  assert.equal(adapted.summary.research_digest_count, 2);
  assert.equal(adapted.summary.evolution_candidate_count, 2);
  assert.equal(adapted.summary.official_evolution_candidate_count, 0);
  assert.equal(adapted.summary.inferred_evolution_pressure_count, 2);
  assert.equal(adapted.summary.work_order_stream_count, 0);
  assert.equal(adapted.summary.observability_stream_count, 7);
  assert.equal(adapted.summary.measurement_quality_gate_count, 1);
  assert.equal(adapted.summary.measurement_gate_bias_monitor_count, 1);
  assert.equal(adapted.observability_stream.some((record) => record.record_kind === "action_history_monitor"), true);
  assert.equal(adapted.observability_stream.filter((record) => record.record_kind === "model_io_tap").length, 2);
  assert.equal(adapted.observability_stream.find((record) => record.record_kind === "measurement_quality_gate").verdict, "clean_measurement");
  assert.equal(adapted.observability_stream.some((record) => record.record_kind === "model_io_tap" && record.metrics.context_byte_size === 4096), true);
  assert.equal(adapted.observability_stream.some((record) => record.record_kind === "model_io_tap" && record.metrics.tool_result_error_count === 1), true);
  assert.equal(candidateTypes.has("skill_variant"), true);
  assert.equal(candidateTypes.has("research_followup"), true);
  assert.equal(adapted.evolution_candidates.every((candidate) => candidate.status === "observed"), true);
  assert.equal(adapted.evolution_candidates.every((candidate) => candidate.routing_stream === "observability_stream"), true);
  assert.equal(adapted.safety.writes_persistent_memory, false);
  assert.equal(adapted.safety.writes_skills, false);
  assert.equal(adapted.safety.llm_api_calls, 0);
  assert.equal(adapted.safety.external_api_calls, 0);
});
