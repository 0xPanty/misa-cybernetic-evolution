import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { crystallizeMisaSkills } from "./skill-crystallization.mjs";

const DEFAULT_WRITE_SCOPE = [
  "generated/skill-drafts",
  "generated/repair-plans",
  "runs/self-repair"
];

const SAFETY = {
  publication_allowed: false,
  writes_persistent_memory: false,
  touches_runtime: false,
  starts_timer_or_service: false,
  requires_human_publish_approval: true
};

const VERIFY_COMMANDS = [
  { label: "validate:schemas", command: "npm run validate:schemas", args: ["run", "validate:schemas"] },
  { label: "distill:misa", command: "npm run distill:misa", args: ["run", "distill:misa"] },
  { label: "density:misa", command: "npm run density:misa", args: ["run", "density:misa"] },
  { label: "adaptive:misa", command: "npm run adaptive:misa", args: ["run", "adaptive:misa"] },
  { label: "intake:misa", command: "npm run intake:misa", args: ["run", "intake:misa"] },
  { label: "rollup:misa", command: "npm run rollup:misa", args: ["run", "rollup:misa"] },
  { label: "evolution:evaluate:misa", command: "npm run evolution:evaluate:misa", args: ["run", "evolution:evaluate:misa"] },
  { label: "precheck", command: "npm run precheck", args: ["run", "precheck"] },
  { label: "test", command: "npm test", args: ["test"] }
];

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
  /\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|NOVAI|NEYNAR|DISCORD|FARCASTER|AGENTMAIL)_API_KEY\s*=\s*[^\s]+/gi,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g
];

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function toTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function redactSecrets(text) {
  let redacted = String(text ?? "");
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED:SECRET]");
  }
  return redacted;
}

function safeFileLabel(label) {
  return String(label).replace(/[^a-z0-9_.-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function relativePath(base, target) {
  return path.relative(base, target).split(path.sep).join("/");
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function appendJsonl(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(data)}\n`, "utf8");
}

function buildSkillDraft(candidate, state = "draft_generated") {
  const lines = [
    `# ${candidate.proposed_skill.title.trimEnd()}`,
    "",
    "## Status",
    "",
    `- state: ${state}`,
    "- publication_allowed: false",
    "- human_publish_approval_required: true",
    "",
    "## Trigger",
    "",
    ...candidate.trigger_conditions.map((item) => `- ${item}`),
    "",
    "## Procedure",
    "",
    ...candidate.procedure_outline.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Evidence",
    "",
    `- source_event_id: ${candidate.source_event_id}`,
    `- source_cycle_id: ${candidate.source_cycle_id}`,
    `- evidence_basis: ${candidate.evidence.evidence_basis}`,
    `- quality_score: ${candidate.quality.score}`,
    "",
    "## Boundaries",
    "",
    "- Do not write persistent memory.",
    "- Do not replace Zilliz.",
    "- Do not publish Farcaster posts.",
    "- Do not publish this Skill automatically.",
    "- Do not change session mechanics.",
    "- Do not start timers or services.",
    "",
    "## Missing Before Publication",
    "",
    ...candidate.quality.missing_fields.map((item) => `- ${item}`),
    ""
  ];

  return lines.map((line) => line.trimEnd()).join("\n");
}

function buildRepairPlan(candidate, generatedFiles, status = "draft_generated") {
  return {
    schema_version: "misa.self_repair_plan.v1",
    candidate_id: candidate.candidate_id,
    proposed_skill: {
      ...candidate.proposed_skill,
      title: candidate.proposed_skill.title.trimEnd()
    },
    action: status === "validated_draft" ? "generate_validated_draft" : "generate_review_draft",
    status,
    write_scope: [...DEFAULT_WRITE_SCOPE],
    generated_files: generatedFiles,
    verification: {
      max_auto_fix_attempts: candidate.self_repair.max_auto_fix_attempts,
      commands: VERIFY_COMMANDS.map((command) => command.command),
      timeout_required: true,
      failure_behavior: "stop_and_request_human_review"
    },
    blocked_operations: candidate.safety.blocked_operations,
    safety: { ...SAFETY }
  };
}

function buildPatchDiff(files) {
  const chunks = [];
  for (const file of files) {
    chunks.push(`*** Add File: ${file.relative}`);
    for (const line of file.content.split("\n")) {
      chunks.push(`+${line}`);
    }
  }
  return `${chunks.join("\n")}\n`;
}

async function runAllowedCommand({ repoRoot, runDir, command, timeoutMs }) {
  const started = Date.now();
  const stdoutChunks = [];
  const stderrChunks = [];
  let timedOut = false;
  const isWindows = process.platform === "win32";

  const child = spawn(isWindows ? command.command : npmExecutable(), isWindows ? [] : command.args, {
    cwd: repoRoot,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 1000).unref();
  }, timeoutMs);

  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

  const exitCode = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? -1));
  });
  clearTimeout(timer);

  const durationMs = Date.now() - started;
  const stdout = redactSecrets(Buffer.concat(stdoutChunks).toString("utf8"));
  const stderr = redactSecrets(Buffer.concat(stderrChunks).toString("utf8"));
  const outputDir = path.join(runDir, "test-output");
  await fs.mkdir(outputDir, { recursive: true });
  const outputLabel = safeFileLabel(command.label);
  const stdoutRel = `test-output/${outputLabel}.stdout.txt`;
  const stderrRel = `test-output/${outputLabel}.stderr.txt`;
  await fs.writeFile(path.join(runDir, stdoutRel), stdout, "utf8");
  await fs.writeFile(path.join(runDir, stderrRel), stderr, "utf8");

  return {
    label: command.label,
    command: command.command,
    exit_code: exitCode,
    timed_out: timedOut,
    duration_ms: durationMs,
    stdout_path: stdoutRel,
    stderr_path: stderrRel,
    ok: exitCode === 0 && !timedOut
  };
}

async function runOneCandidate({
  repoRoot,
  candidate,
  runRoot,
  generatedRoot,
  repairPlanRoot,
  verify,
  timeoutMs,
  now
}) {
  const runId = `${toTimestamp(now)}-${candidate.candidate_id}`;
  const runDir = path.join(runRoot, runId);
  await fs.mkdir(runDir, { recursive: true });

  const draftPath = path.join(generatedRoot, `${candidate.proposed_skill.slug}.md`);
  const planPath = path.join(repairPlanRoot, `${candidate.candidate_id}.json`);
  const generatedFiles = [
    relativePath(repoRoot, draftPath),
    relativePath(repoRoot, planPath)
  ];
  const manifest = {
    schema_version: "misa.self_repair_manifest.v1",
    run_id: runId,
    candidate_id: candidate.candidate_id,
    mode: "self-repair-draft",
    repo_root: repoRoot,
    run_dir: relativePath(repoRoot, runDir),
    write_scope: [...DEFAULT_WRITE_SCOPE],
    verify,
    command_timeout_ms: timeoutMs,
    safety: { ...SAFETY },
    created_at: now.toISOString()
  };

  await writeJson(path.join(runDir, "run-manifest.json"), manifest);
  await writeJson(path.join(runDir, "candidate-before.json"), candidate);

  const commands = [];
  if (verify) {
    for (const command of VERIFY_COMMANDS) {
      const result = await runAllowedCommand({ repoRoot, runDir, command, timeoutMs });
      commands.push(result);
      await appendJsonl(path.join(runDir, "command-log.jsonl"), result);
      if (!result.ok) {
        break;
      }
    }
  }

  const failed = commands.find((command) => !command.ok);
  const status = failed ? "needs_human_review" : (verify ? "validated_draft" : "draft_generated");
  const skillDraft = buildSkillDraft(candidate, status);
  const repairPlan = buildRepairPlan(candidate, generatedFiles, status);
  const generated = [
    { relative: generatedFiles[0], path: draftPath, content: skillDraft },
    { relative: generatedFiles[1], path: planPath, content: `${JSON.stringify(repairPlan, null, 2)}\n` }
  ];

  await writeJson(path.join(runDir, "repair-plan.json"), repairPlan);

  for (const file of generated) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(file.path, file.content, "utf8");
  }

  await fs.writeFile(path.join(runDir, "patch.diff"), buildPatchDiff(generated), "utf8");

  const finalReport = {
    schema_version: "misa.self_repair_run.v1",
    run_id: runId,
    candidate_id: candidate.candidate_id,
    mode: "self-repair-draft",
    status,
    attempts: 1,
    write_scope: [...DEFAULT_WRITE_SCOPE],
    generated_files: generatedFiles,
    commands: commands.map((command) => ({
      label: command.label,
      command: command.command,
      exit_code: command.exit_code,
      timed_out: command.timed_out,
      duration_ms: command.duration_ms
    })),
    safety: { ...SAFETY },
    needs_human_review: status !== "validated_draft",
    created_at: now.toISOString()
  };

  if (failed) {
    await writeJson(path.join(runDir, "failure-report.json"), {
      run_id: runId,
      candidate_id: candidate.candidate_id,
      failed_command: failed.label,
      exit_code: failed.exit_code,
      timed_out: failed.timed_out,
      next_step: "stop and request human review before any further repair"
    });
  }

  await writeJson(path.join(runDir, "final-report.json"), finalReport);
  await appendJsonl(path.join(runRoot, "index.jsonl"), {
    run_id: runId,
    candidate_id: candidate.candidate_id,
    status,
    generated_files: generatedFiles,
    report_path: relativePath(repoRoot, path.join(runDir, "final-report.json")),
    created_at: now.toISOString(),
    digest: shortHash(JSON.stringify(finalReport))
  });

  return {
    ok: status === "validated_draft" || status === "draft_generated",
    run_id: runId,
    candidate_id: candidate.candidate_id,
    status,
    generated_files: generatedFiles,
    run_dir: relativePath(repoRoot, runDir),
    final_report: relativePath(repoRoot, path.join(runDir, "final-report.json")),
    commands: finalReport.commands,
    needs_human_review: finalReport.needs_human_review
  };
}

export async function runMisaSelfRepair({
  repoRoot = process.cwd(),
  candidateId,
  runRoot = path.join(repoRoot, "runs", "self-repair"),
  generatedRoot = path.join(repoRoot, "generated", "skill-drafts"),
  repairPlanRoot = path.join(repoRoot, "generated", "repair-plans"),
  verify = true,
  timeoutMs = 120000,
  now = new Date()
} = {}) {
  const crystallization = await crystallizeMisaSkills({ repoRoot });
  const candidates = crystallization.candidates.filter((candidate) => (
    candidate.self_repair.allowed
    && candidate.quality.ready_for_draft
    && !candidate.quality.ready_for_publish
    && (!candidateId || candidate.candidate_id === candidateId)
  ));

  const runs = [];
  for (const candidate of candidates) {
    runs.push(await runOneCandidate({
      repoRoot,
      candidate,
      runRoot,
      generatedRoot,
      repairPlanRoot,
      verify,
      timeoutMs,
      now
    }));
  }

  return {
    mode: "self-repair-draft",
    ok: runs.length > 0 && runs.every((run) => run.ok),
    selected_candidate_id: candidateId ?? null,
    candidate_count: candidates.length,
    verify,
    write_scope: [...DEFAULT_WRITE_SCOPE],
    safety: { ...SAFETY },
    runs
  };
}
