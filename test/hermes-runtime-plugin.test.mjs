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
  assert.equal(doctor.summary.adapter_research_digests, 2);
  assert.equal(doctor.summary.adapter_evolution_candidates, 2);

  const adapted = await runHermesRuntimeAdapter({
    eventLogFile: eventLog,
    now: new Date("2026-05-15T00:00:00Z")
  });
  const candidateTypes = new Set(adapted.evolution_candidates.map((candidate) => candidate.candidate_type));

  assert.equal(adapted.ok, true);
  assert.equal(adapted.summary.event_count, 2);
  assert.equal(adapted.summary.research_digest_count, 2);
  assert.equal(adapted.summary.evolution_candidate_count, 2);
  assert.equal(candidateTypes.has("skill_variant"), true);
  assert.equal(candidateTypes.has("research_followup"), true);
  assert.equal(adapted.evolution_candidates.every((candidate) => candidate.status === "replay_required"), true);
  assert.equal(adapted.safety.writes_persistent_memory, false);
  assert.equal(adapted.safety.writes_skills, false);
  assert.equal(adapted.safety.llm_api_calls, 0);
  assert.equal(adapted.safety.external_api_calls, 0);
});
