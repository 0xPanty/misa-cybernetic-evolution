import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeJsonOutFile } from "./cli-output.mjs";
import {
  DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG,
  runHermesRuntimeAdapter
} from "./hermes-runtime-adapter.mjs";

export const DEFAULT_HERMES_RUNTIME_PLUGIN_SOURCE = "examples/hermes-runtime-plugin";
export const DEFAULT_HERMES_RUNTIME_PLUGIN_DIR = path.join(
  os.homedir(),
  ".hermes",
  "plugins",
  "qianxuesen-runtime-adapter"
);

const PLUGIN_FILES = ["plugin.yaml", "__init__.py", "README.md"];
const REQUIRED_HOOKS = [
  "pre_tool_call",
  "post_tool_call",
  "pre_api_request",
  "post_api_request",
  "pre_llm_call",
  "post_llm_call",
  "on_session_end"
];

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date("2026-05-15T00:00:00Z").toISOString()
    : date.toISOString();
}

function expandHome(relOrAbs) {
  if (relOrAbs === "~") return os.homedir();
  if (relOrAbs?.startsWith("~/") || relOrAbs?.startsWith("~\\")) {
    return path.join(os.homedir(), relOrAbs.slice(2));
  }
  return relOrAbs;
}

function resolvePath(repoRoot, relOrAbs) {
  const expanded = expandHome(relOrAbs);
  return path.isAbsolute(expanded) ? expanded : path.join(repoRoot, expanded);
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function dirExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function checkResult(name, ok, details = {}) {
  return { name, ok, ...details };
}

function countChecks(checks) {
  return {
    total: checks.length,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok).length
  };
}

function pluginSafety({ writesPluginFiles }) {
  return {
    writes_plugin_files: writesPluginFiles,
    writes_persistent_memory: false,
    writes_skills: false,
    blocks_runtime: false,
    starts_services: false,
    llm_api_calls: 0,
    external_api_calls: 0,
    provider_credentials_read: false,
    public_posting_allowed: false
  };
}

async function readTextIfExists(filePath) {
  return await fileExists(filePath) ? await fs.readFile(filePath, "utf8") : "";
}

function requiredHookCheck(manifestText, moduleText) {
  const missingFromManifest = REQUIRED_HOOKS.filter((hook) => !manifestText.includes(hook));
  const missingFromModule = REQUIRED_HOOKS.filter((hook) => !moduleText.includes(hook));
  return {
    ok: missingFromManifest.length === 0 && missingFromModule.length === 0,
    required_hooks: REQUIRED_HOOKS,
    missing_from_manifest: missingFromManifest,
    missing_from_module: missingFromModule
  };
}

function forbiddenRuntimeAuthorityCheck(moduleText) {
  const forbiddenPatterns = [
    /\brequests\b/,
    /\bhttpx\b/,
    /\burllib\b/,
    /\bsubprocess\b/,
    /\bopenai\b/i,
    /\banthropic\b/i,
    /\bmemory\.add\b/,
    /\bskill_manage\b[\s\S]{0,80}\bpatch\b/
  ];
  const matches = forbiddenPatterns
    .map((pattern) => pattern.exec(moduleText)?.[0])
    .filter(Boolean);
  return {
    ok: matches.length === 0,
    matches
  };
}

export async function runHermesRuntimePluginInstall({
  repoRoot = process.cwd(),
  sourceDir = DEFAULT_HERMES_RUNTIME_PLUGIN_SOURCE,
  pluginDir = DEFAULT_HERMES_RUNTIME_PLUGIN_DIR,
  eventLogFile = DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG,
  now = new Date("2026-05-15T00:00:00Z"),
  outFile
} = {}) {
  const resolvedSourceDir = resolvePath(repoRoot, sourceDir);
  const resolvedPluginDir = resolvePath(repoRoot, pluginDir);
  const copied = [];

  await fs.mkdir(resolvedPluginDir, { recursive: true });
  for (const fileName of PLUGIN_FILES) {
    const from = path.join(resolvedSourceDir, fileName);
    const to = path.join(resolvedPluginDir, fileName);
    await fs.copyFile(from, to);
    copied.push(to);
  }

  const doctor = await runHermesRuntimePluginDoctor({
    repoRoot,
    pluginDir: resolvedPluginDir,
    eventLogFile,
    now
  });
  const checks = [
    checkResult("plugin files copied", copied.length === PLUGIN_FILES.length, {
      copied_files: copied
    }),
    checkResult("installed plugin passes doctor", doctor.ok, {
      doctor_checks: doctor.summary
    })
  ];
  const result = {
    schema_version: "misa.hermes_runtime_plugin_install.v1",
    mode: "hermes-runtime-plugin-install",
    ok: checks.every((check) => check.ok),
    created_at: asIsoDate(now),
    plugin_dir: resolvedPluginDir,
    event_log_file: eventLogFile,
    summary: countChecks(checks),
    checks,
    doctor,
    safety: pluginSafety({ writesPluginFiles: true }),
    next_commands: [
      "npm run hermes:plugin:doctor",
      `npm run hermes:adapt-runtime -- --event-log ${eventLogFile} --json`
    ]
  };

  await writeJsonOutFile(result, outFile, { repoRoot });
  return result;
}

export async function runHermesRuntimePluginDoctor({
  repoRoot = process.cwd(),
  pluginDir = DEFAULT_HERMES_RUNTIME_PLUGIN_SOURCE,
  eventLogFile = DEFAULT_HERMES_RUNTIME_PLUGIN_EVENT_LOG,
  now = new Date("2026-05-15T00:00:00Z"),
  outFile
} = {}) {
  const resolvedPluginDir = resolvePath(repoRoot, pluginDir);
  const manifestPath = path.join(resolvedPluginDir, "plugin.yaml");
  const modulePath = path.join(resolvedPluginDir, "__init__.py");
  const readmePath = path.join(resolvedPluginDir, "README.md");
  const resolvedEventLog = resolvePath(repoRoot, eventLogFile);

  const [manifestText, moduleText, readmeText] = await Promise.all([
    readTextIfExists(manifestPath),
    readTextIfExists(modulePath),
    readTextIfExists(readmePath)
  ]);
  const hookCheck = requiredHookCheck(manifestText, moduleText);
  const authorityCheck = forbiddenRuntimeAuthorityCheck(moduleText);
  const eventLogPresent = await fileExists(resolvedEventLog);
  let eventLogAdapter;
  let eventLogError;

  if (eventLogPresent) {
    try {
      eventLogAdapter = await runHermesRuntimeAdapter({
        repoRoot,
        eventLogFile: resolvedEventLog,
        now
      });
    } catch (error) {
      eventLogError = error.message;
    }
  }

  const checks = [
    checkResult("plugin directory exists", await dirExists(resolvedPluginDir), {
      plugin_dir: resolvedPluginDir
    }),
    checkResult("plugin manifest exists", await fileExists(manifestPath), {
      manifest: manifestPath
    }),
    checkResult("plugin module exists", await fileExists(modulePath), {
      module: modulePath
    }),
    checkResult("plugin readme exists", await fileExists(readmePath), {
      readme: readmePath
    }),
    checkResult("required Hermes hooks are declared", hookCheck.ok, hookCheck),
    checkResult("plugin module exposes register(ctx)", /def\s+register\s*\(\s*ctx\s*\)/.test(moduleText), {}),
    checkResult("manifest declares observe-only mode", (
      manifestText.includes("observe_only")
      && manifestText.includes("default_action: observe")
    )),
    checkResult("plugin writes NDJSON local event log", (
      moduleText.includes("QIANXUESEN_HERMES_EVENT_LOG")
      && moduleText.includes(".ndjson")
      && readmeText.includes("qianxuesen-runtime-events.ndjson")
    )),
    checkResult("plugin has no direct runtime authority", authorityCheck.ok, authorityCheck),
    checkResult("event log adapter replay is readable when present", (
      eventLogPresent ? Boolean(eventLogAdapter?.ok) && !eventLogError : true
    ), {
      event_log_file: resolvedEventLog,
      event_log_present: eventLogPresent,
      adapter_events: eventLogAdapter?.summary?.event_count ?? 0,
      adapter_model_io_taps: eventLogAdapter?.summary?.model_io_tap_count ?? 0,
      adapter_research_digests: eventLogAdapter?.summary?.research_digest_count ?? 0,
      adapter_evolution_candidates: eventLogAdapter?.summary?.evolution_candidate_count ?? 0,
      error: eventLogError
    })
  ];
  const result = {
    schema_version: "misa.hermes_runtime_plugin_doctor.v1",
    mode: "hermes-runtime-plugin-doctor",
    ok: checks.every((check) => check.ok),
    created_at: asIsoDate(now),
    plugin_dir: resolvedPluginDir,
    event_log_file: resolvedEventLog,
    summary: {
      ...countChecks(checks),
      event_log_present: eventLogPresent,
      adapter_events: eventLogAdapter?.summary?.event_count ?? 0,
      adapter_model_io_taps: eventLogAdapter?.summary?.model_io_tap_count ?? 0,
      adapter_research_digests: eventLogAdapter?.summary?.research_digest_count ?? 0,
      adapter_evolution_candidates: eventLogAdapter?.summary?.evolution_candidate_count ?? 0
    },
    checks,
    safety: pluginSafety({ writesPluginFiles: false }),
    notes: [
      "doctor checks local files only",
      "missing event log is allowed before Hermes has emitted hooks",
      "when the event log exists, doctor replays it through hermes:adapt-runtime"
    ]
  };

  await writeJsonOutFile(result, outFile, { repoRoot });
  return result;
}
