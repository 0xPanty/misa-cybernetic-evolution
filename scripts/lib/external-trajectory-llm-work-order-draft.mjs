import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { runExternalTrajectoryOnlineShadowContract } from "./external-trajectory-online-shadow-contract.mjs";

export const DEFAULT_LLM_DRAFT_MODEL = "qwen2.5:14b";
export const DEFAULT_LLM_DRAFT_PROVIDER = "mock";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120000;
export const DEFAULT_HERMES_DELEGATE_TIMEOUT_MS = 180000;
export const DEFAULT_LLM_DRAFT_CANDIDATE_COUNT = 1;
export const MAX_LLM_DRAFT_CANDIDATE_COUNT = 5;

const REQUIRED_FORBIDDEN_SCOPE = Object.freeze([
  "do_not_change_route",
  "do_not_change_winner",
  "do_not_write_memory",
  "do_not_write_zilliz",
  "do_not_create_embeddings",
  "do_not_call_external_api",
  "do_not_touch_vps",
  "do_not_push_github",
  "do_not_publish_publicly"
]);

const BASE_ALLOWED_COMMANDS = Object.freeze([
  "npm test",
  "npm run precheck",
  "npm run validate:schemas -- --json",
  "node --test test/external-trajectory-online-shadow-contract.test.mjs",
  "node --test test/curiosity-signal-gate.test.mjs",
  "node --test test/governance.test.mjs",
  "node --test test/ci-workflow.test.mjs"
]);

const LIVE_EFFECT_PATTERNS = Object.freeze([
  /\bgit\s+push\b/i,
  /\bkubectl\b/i,
  /\bsystemctl\b/i,
  /\bzilliz\s+upsert\b/i,
  /\bcast\s+send\b/i,
  /\bnpm\s+publish\b/i,
  /\bcurl\s+https?:\/\//i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\bvercel\s+--prod\b/i,
  /\.\/[\w.-]+/,
  /\bsh\s+[\w./-]+/
]);

const GENERIC_TASK_PATTERNS = Object.freeze([
  /制定.*方案/,
  /团队.*认可/,
  /相关文档/,
  /审查.*日志/,
  /优化.*流程/,
  /ensure.*proper/i,
  /review.*logs/i,
  /discuss.*team/i
]);

const HERMES_PROVIDER_ERROR_PATTERNS = Object.freeze([
  /API call failed/i,
  /HTTP\s+(?:4\d\d|5\d\d)/i,
  /RESOURCE_EXHAUSTED/i,
  /quota/i,
  /AuthError/i,
  /Traceback \(most recent call last\)/i
]);

const TASK_EXPECTATION_PATTERNS = Object.freeze([
  /must|mandatory|required|only|preserve|remain|keep|blocked|false|zero|reject|pass|fail|contains|equals|does not|do not|unauthorized|human-in-the-loop/i,
  /draft_no_write|suggestion_only|classification|successful gating|no[-\s](?:write|publish|state mutation)|side-effects|restricted/i,
  /必须|只能|仅|保留|保持|阻止|拒绝|通过|失败|包含|等于|不得|不允许|不会|不写|不改|不执行/
]);

const TASK_FIELD_PATTERNS = Object.freeze([
  /source_id|readout_family|route_hint|status|authority|execution_policy|forbidden_scope|allowed_verification_commands/i,
  /route|winner|memory|Zilliz|embedding|llm_api_calls|external_api_calls|persistent_memory|publication/i,
  /信号|字段|状态|权限|边界|路由|胜者|发布|内存|证据|白名单/
]);

const MULTI_CANDIDATE_STRATEGIES = Object.freeze([
  {
    id: "boundary_safety",
    focus: "safety boundary, no-write authority, route/winner/memory/Zilliz/embedding blocks"
  },
  {
    id: "evidence_trace",
    focus: "source_id, evidence_refs, observed signals, exact files/tests, and field-level traceability"
  },
  {
    id: "replay_verification",
    focus: "local verification commands, acceptance criteria, stop condition, and replayable failure signals"
  },
  {
    id: "compact_handoff",
    focus: "short handoff clarity for the later primary agent or L4 reviewer"
  },
  {
    id: "risk_counterexample",
    focus: "counterexample checks, low-quality traps, and false-positive prevention"
  }
]);

function asIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date("2026-05-16T05:00:00.000Z").toISOString() : date.toISOString();
}

function stableSlug(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 100) || "unknown";
}

function uniqueStrings(values = []) {
  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function normalizeCandidateCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return DEFAULT_LLM_DRAFT_CANDIDATE_COUNT;
  return Math.min(MAX_LLM_DRAFT_CANDIDATE_COUNT, Math.max(1, Math.floor(count)));
}

function candidateModeForCount(count) {
  return normalizeCandidateCount(count) <= 1 ? "light_single_default" : "explicit_candidate_recheck";
}

function candidateStrategies(candidateCount) {
  return MULTI_CANDIDATE_STRATEGIES
    .slice(0, normalizeCandidateCount(candidateCount))
    .map((strategy, index) => ({
      candidate_id: strategy.id,
      focus: strategy.focus,
      ordinal: index + 1
    }));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function resolvePath(repoRoot, maybePath) {
  if (!maybePath) return null;
  return path.isAbsolute(maybePath) ? maybePath : path.join(repoRoot, maybePath);
}

function commandForPerceptionDigest(perceptionDigestPath) {
  if (!perceptionDigestPath) return null;
  return `npm run external:online-shadow -- --json --dry-run --perception-digest ${perceptionDigestPath}`;
}

function classifySource(packet) {
  const signals = new Set(packet.record.observed_signals ?? []);
  if (signals.has("public_posting_boundary") || signals.has("farcaster_public_memory_risk")) return "public_boundary";
  if (signals.has("candidate_replay_failed")) return "candidate_replay";
  if (packet.record.source_kind === "custom_workflow" || signals.has("test_regression")) return "workflow_ci";
  if (signals.has("repeated_failure_pattern")) return "repeated_failure";
  if (packet.record.primary_route_pressure === "skill") return "skill_candidate";
  if (packet.record.primary_route_pressure === "memory") return "memory_candidate";
  return "trajectory_review";
}

function contextForPacket(packet) {
  const sourceClass = classifySource(packet);
  const commonFiles = [
    "scripts/lib/external-trajectory-online-shadow-contract.mjs",
    "test/external-trajectory-online-shadow-contract.test.mjs"
  ];
  const commonAnchors = [
    packet.record.source_id,
    packet.record.readout_family,
    packet.record.primary_route_pressure,
    packet.ticket?.severity,
    "draft_no_write",
    "external:online-shadow",
    ...(packet.record.observed_signals ?? []),
    ...(packet.workOrder.evidence_refs ?? [])
  ];

  if (sourceClass === "public_boundary") {
    return {
      source_class: sourceClass,
      relevant_files: uniqueStrings([
        ...commonFiles,
        "test/fixtures/perception/shadow-sources/01-public-memory-risk.json",
        "test/fixtures/perception/shadow-sources/10-discord-public-memory-risk.json",
        "test/curiosity-signal-gate.test.mjs",
        "test/governance.test.mjs",
        "scripts/lib/perception-sidecar.mjs"
      ]),
      context_anchors: uniqueStrings([
        ...commonAnchors,
        "public_posting_boundary",
        "farcaster_public_memory_risk",
        "explicit_user_boundary",
        "publication_allowed=false",
        "manual review",
        "public boundary"
      ]),
      task_focus: [
        "check that public-channel evidence stays review-only",
        "verify sanitizer/manual-review boundary coverage",
        "keep public posting and memory writes blocked"
      ]
    };
  }

  if (sourceClass === "candidate_replay") {
    return {
      source_class: sourceClass,
      relevant_files: uniqueStrings([
        ...commonFiles,
        "test/fixtures/perception/shadow-sources/02-candidate-replay-failed.json",
        "test/curiosity-signal-gate.test.mjs",
        "test/governance.test.mjs",
        "scripts/lib/evolution-evaluator.mjs",
        "scripts/lib/evolution-tournament.mjs"
      ]),
      context_anchors: uniqueStrings([
        ...commonAnchors,
        "candidate_replay_failed",
        "avoid_overreaction",
        "replay",
        "damping",
        "local shadow calibration"
      ]),
      task_focus: [
        "separate failed replay evidence from promotion evidence",
        "keep the failure in damping or repair review",
        "verify no candidate is promoted only because replay was attempted"
      ]
    };
  }

  if (sourceClass === "workflow_ci") {
    return {
      source_class: sourceClass,
      relevant_files: uniqueStrings([
        ...commonFiles,
        ".github/workflows/current-line-shadow.yml",
        "test/ci-workflow.test.mjs",
        "examples/external-trajectory-online-shadow/generic-workflow-adapter/adapter.mjs",
        "examples/external-trajectory-online-shadow/generic-workflow-adapter/input.workflow-events.json"
      ]),
      context_anchors: uniqueStrings([
        ...commonAnchors,
        "custom_workflow",
        "test_regression",
        "repeated_failure_pattern",
        "ci:run",
        "github:example-org/example-repo:pull/42"
      ]),
      task_focus: [
        "check sanitized CI refs only",
        "verify the generic adapter preserves source_project/repo/time/task_family",
        "keep workflow review as observe-only draft material"
      ]
    };
  }

  return {
    source_class: sourceClass,
    relevant_files: uniqueStrings([
      ...commonFiles,
      "test/curiosity-signal-gate.test.mjs",
      "scripts/lib/perception-sidecar.mjs"
    ]),
    context_anchors: uniqueStrings(commonAnchors),
    task_focus: [
      "explain the signal in sanitized form",
      "preserve local shadow-only review",
      "verify no route, winner, memory, or external effect is introduced"
    ]
  };
}

function allowedCommandsForPacket(packet, perceptionDigestPath) {
  const commands = [...BASE_ALLOWED_COMMANDS];
  const onlineShadowCommand = commandForPerceptionDigest(perceptionDigestPath);
  if (onlineShadowCommand) commands.push(onlineShadowCommand);

  const sourceClass = classifySource(packet);
  if (sourceClass === "public_boundary") {
    commands.push("node --test test/curiosity-signal-gate.test.mjs test/governance.test.mjs");
  } else if (sourceClass === "candidate_replay") {
    commands.push("node --test test/curiosity-signal-gate.test.mjs test/governance.test.mjs");
  } else if (sourceClass === "workflow_ci") {
    commands.push("node --test test/ci-workflow.test.mjs test/external-trajectory-online-shadow-contract.test.mjs");
  }
  return uniqueStrings(commands);
}

function findBySource(items, sourceId) {
  return (items ?? []).find((item) => item.source_id === sourceId) ?? null;
}

export function buildLlmWorkOrderDraftingPackets({
  onlineShadowReport,
  perceptionDigestPath,
  sourceIds = [],
  maxSamples = 5
} = {}) {
  if (!onlineShadowReport) throw new Error("onlineShadowReport is required");
  const idFilter = new Set(sourceIds);
  const records = onlineShadowReport.online_shadow_records ?? [];
  const workOrders = onlineShadowReport.work_order_drafts ?? [];
  const selected = records
    .filter((record) => workOrders.some((order) => order.source_id === record.source_id))
    .filter((record) => !idFilter.size || idFilter.has(record.source_id))
    .slice(0, Math.max(1, Number(maxSamples) || 5));

  return selected.map((record) => {
    const packet = {
      source_id: record.source_id,
      record,
      ticket: findBySource(onlineShadowReport.repair_ticket_drafts, record.source_id),
      workOrder: findBySource(workOrders, record.source_id),
      reviewHints: (onlineShadowReport.review_hints ?? []).filter((hint) => hint.source_id === record.source_id),
      perception_digest_path: perceptionDigestPath ?? onlineShadowReport.input?.perception_digest_path ?? null
    };
    const context = contextForPacket(packet);
    return {
      ...packet,
      context,
      allowed_verification_commands: allowedCommandsForPacket(packet, packet.perception_digest_path),
      output_contract: {
        required_fields: [
          "title",
          "problem",
          "evidence_refs",
          "concrete_tasks",
          "acceptance_criteria",
          "verification_commands",
          "forbidden_scope",
          "risk_notes",
          "stop_condition",
          "llm_notes"
        ],
        required_forbidden_scope: [...REQUIRED_FORBIDDEN_SCOPE]
      }
    };
  });
}

function promptForPacket(packet, { previousFailure, candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT } = {}) {
  const requestedCandidateCount = normalizeCandidateCount(candidateCount);
  const strategies = candidateStrategies(requestedCandidateCount);
  const compactPacket = {
    source_id: packet.source_id,
    source_kind: packet.record.source_kind,
    readout_family: packet.record.readout_family,
    route_hint: packet.workOrder.route_hint,
    severity: packet.ticket?.severity,
    priority: packet.record.suggested_priority,
    observed_signals: packet.record.observed_signals,
    evidence_refs: packet.workOrder.evidence_refs,
    review_hints: packet.reviewHints.map((hint) => ({
      kind: hint.kind,
      level: hint.level,
      reason: hint.reason,
      evidence_refs: hint.evidence_refs
    })),
    current_template_work_order: {
      title: packet.workOrder.title,
      review_tasks: packet.workOrder.review_tasks,
      non_goals: packet.workOrder.non_goals
    },
    source_class: packet.context.source_class,
    relevant_files: packet.context.relevant_files,
    context_anchors: packet.context.context_anchors,
    task_focus: packet.context.task_focus,
    allowed_verification_commands: packet.allowed_verification_commands,
    required_forbidden_scope: packet.output_contract.required_forbidden_scope
  };

  const retryText = previousFailure
    ? `\nPrevious output failed the local gate: ${previousFailure.violations.join(", ")}. Return a corrected JSON object only.\n`
    : "";

  const singleReturnShape = `{
  "title": string,
  "problem": string,
  "evidence_refs": string[],
  "concrete_tasks": string[],
  "acceptance_criteria": string[],
  "verification_commands": string[],
  "forbidden_scope": string[],
  "risk_notes": string[],
  "stop_condition": string,
  "llm_notes": string
}`;

  const multiReturnShape = `{
  "candidates": [
    {
      "candidate_id": string,
      "strategy": string,
      "title": string,
      "problem": string,
      "evidence_refs": string[],
      "concrete_tasks": string[],
      "acceptance_criteria": string[],
      "verification_commands": string[],
      "forbidden_scope": string[],
      "risk_notes": string[],
      "stop_condition": string,
      "llm_notes": string
    }
  ]
}`;

  return `You are an engineering work-order drafter. Return JSON only, with no explanation.${retryText}

Goal: turn the template work_order_draft into a concrete, executable, and reviewable engineering work-order draft for a later primary agent or L4 reviewer.
This is an internal agent-facing draft, not a final user-facing response.

Hard boundaries:
- Draft only. Do not execute anything.
- Do not change route or winner authority.
- Do not write memory, Zilliz, or embeddings.
- Do not call external APIs.
- Do not touch VPS.
- Do not push GitHub.
- Do not publish public content.

${requestedCandidateCount > 1
    ? `Output exactly this JSON shape with exactly ${requestedCandidateCount} candidates:
${multiReturnShape}

Candidate strategy requirements:
${strategies.map((item) => `- ${item.candidate_id}: ${item.focus}`).join("\n")}
- Candidates must be meaningfully different. Do not return the same tasks with only wording changes.
- Each candidate must independently satisfy every quality requirement below.`
    : `Output exactly this JSON shape:
${singleReturnShape}`}

Quality requirements:
- Keep the title specific; do not reuse a template title such as "Explain external trajectory signal".
- concrete_tasks must contain at least 4 engineering review tasks.
- Every concrete task must include a concrete anchor: file path, source_id, signal name, evidence ref, field name, or test name.
- Prefer this shape: "In <file/test>, check <source_id/signal/field>; expected result is <specific false/no-write/suggestion-only/pass condition>."
- Do not merely write "review", "verify", "ensure", or "audit" a broad logic path. Name the exact field, signal, and pass condition.
- Do not end a task with vague phrases like "related tests", "as expected", "correct implementation", or "coverage". Use concrete expectations such as route_change_allowed=false or authority=suggestion_only.
- verification_commands must be copied exactly from allowed_verification_commands. Do not invent commands.
- evidence_refs must preserve every input evidence_refs item. Do not invent refs.
- forbidden_scope must include every required_forbidden_scope item.
- Avoid vague work like "team approval", "make a plan", or "optimize the process" unless the same sentence names a concrete file or test.
- Do not request real posting, real database writes, real deployment, or live execution.

Input:
${JSON.stringify(compactPacket, null, 2)}
`;
}

function stripJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return body.slice(start, end + 1);
  return body;
}

function serializeProviderError(error) {
  const cause = error?.cause;
  return {
    name: error?.name ?? "Error",
    code: cause?.code ?? error?.code ?? "provider_error",
    message: String(error?.message ?? error ?? "provider call failed").slice(0, 300)
  };
}

function parseJsonArray(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null;
  } catch {
    return null;
  }
}

function replaceArgPlaceholders(args, replacements) {
  return (args ?? []).map((arg) => String(arg)
    .replaceAll("{prompt}", replacements.prompt)
    .replaceAll("{audit_packet_json}", JSON.stringify(replacements.auditPacket)));
}

function hermesDelegateCommandFromEnv() {
  if (process.env.HERMES_DELEGATE_COMMAND) return process.env.HERMES_DELEGATE_COMMAND;
  if (fsSync.existsSync("/root/.local/bin/hermes")) return "/root/.local/bin/hermes";
  return "hermes";
}

function hermesDelegateArgsFromEnv() {
  return parseJsonArray(process.env.HERMES_DELEGATE_ARGS_JSON);
}

function hermesDelegateProviderFromEnv() {
  return process.env.HERMES_DELEGATE_PROVIDER || null;
}

function hermesDelegateModelFromEnv() {
  return process.env.HERMES_DELEGATE_MODEL || null;
}

export function buildHermesDelegateDefaultArgs({
  prompt,
  provider = hermesDelegateProviderFromEnv(),
  model = hermesDelegateModelFromEnv()
} = {}) {
  const args = ["--ignore-rules"];
  if (provider) args.push("--provider", provider);
  if (model) args.push("--model", model);
  args.push("-t", "delegation", "-z", prompt);
  return args;
}

export function buildHermesDelegateAuditPacket(packet, {
  candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT
} = {}) {
  const requestedCandidateCount = normalizeCandidateCount(candidateCount);
  return {
    schema_version: "misa.external_trajectory_l2_audit_packet.v1",
    mode: "hermes-delegate-observe-only",
    layer: "L2",
    role: "no-context-auditor",
    context_policy: {
      inherit_chat_history: false,
      parent_context_allowed: false,
      allowed_context: "this audit packet only",
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false
    },
    execution_policy: {
      observe_only: true,
      draft_only: true,
      execute_work_order: false,
      route_change_allowed: false,
      winner_change_allowed: false,
      memory_write_allowed: false,
      zilliz_write_allowed: false,
      embedding_creation_allowed: false,
      vps_touch_allowed: false,
      github_push_allowed: false,
      public_publish_allowed: false
    },
    source: {
      source_id: packet.source_id,
      source_kind: packet.record.source_kind,
      readout_family: packet.record.readout_family,
      route_hint: packet.workOrder.route_hint,
      severity: packet.ticket?.severity ?? null,
      priority: packet.record.suggested_priority,
      observed_signals: packet.record.observed_signals ?? [],
      evidence_refs: packet.workOrder.evidence_refs ?? [],
      source_class: packet.context.source_class,
      relevant_files: packet.context.relevant_files,
      context_anchors: packet.context.context_anchors,
      task_focus: packet.context.task_focus,
      allowed_verification_commands: packet.allowed_verification_commands
    },
    current_template_work_order: {
      title: packet.workOrder.title,
      status: packet.workOrder.status,
      authority: packet.workOrder.authority,
      review_tasks: packet.workOrder.review_tasks,
      non_goals: packet.workOrder.non_goals
    },
    output_contract: {
      required_fields: packet.output_contract.required_fields,
      required_forbidden_scope: packet.output_contract.required_forbidden_scope,
      min_concrete_tasks: 4,
      weak_task_count_must_be: 0,
      verification_commands_must_be_whitelisted: true,
      requested_candidate_count: requestedCandidateCount,
      candidate_strategies: candidateStrategies(requestedCandidateCount)
    }
  };
}

function promptForHermesDelegate(packet, {
  previousFailure,
  candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT
} = {}) {
  const requestedCandidateCount = normalizeCandidateCount(candidateCount);
  const auditPacket = buildHermesDelegateAuditPacket(packet, { candidateCount: requestedCandidateCount });
  const strategies = candidateStrategies(requestedCandidateCount);
  const retryText = previousFailure
    ? `\nPrevious output failed the local gate: ${previousFailure.violations.join(", ")}. Return a corrected JSON object only.\n`
    : "";

  return `You are a fresh Hermes L2 no-context audit sub-agent.
Use delegate_task if it is available; otherwise complete the same observe-only audit directly.
Do not use any chat history, memory, Zilliz, embeddings, route/winner authority, VPS, GitHub push, public posting, or real work-order execution.
Only use the AuditPacket below. Return JSON only, with exactly the draft shape requested by output_contract.${retryText}

Quality target:
- Do not reuse the current_template_work_order title.
- Write a specific title that names source_id and the boundary being audited.
- concrete_tasks must contain exactly 4-6 engineering review tasks.
- Every concrete task must name a file/test target, source_id or signal/evidence ref, a field/boundary to inspect, and an explicit expected result.
- Prefer this task shape: "In <file/test>, check <source_id/signal/field>; expected result is <specific false/no-write/suggestion-only/pass condition>."
- Do not write broad tasks like "Analyze the file", "Verify the logic", "Execute the command", "Audit coverage", or "ensure correct gating" unless the same sentence also states the exact field and expected result.
- verification_commands must be copied exactly from source.allowed_verification_commands.
- evidence_refs must preserve every source.evidence_refs item and must not invent new refs.
- The result should be useful to an engineer reviewing production quality, not a policy summary.
${requestedCandidateCount > 1
    ? `- Return exactly ${requestedCandidateCount} meaningfully different candidates in the requested candidates array.
- Use these candidate strategies:
${strategies.map((item) => `  - ${item.candidate_id}: ${item.focus}`).join("\n")}
- Every candidate must independently satisfy the quality target.`
    : ""}

AuditPacket:
${JSON.stringify(auditPacket, null, 2)}

Return shape:
${requestedCandidateCount > 1
    ? `{
  "candidates": [
    {
      "candidate_id": string,
      "strategy": string,
      "title": string,
      "problem": string,
      "evidence_refs": string[],
      "concrete_tasks": string[],
      "acceptance_criteria": string[],
      "verification_commands": string[],
      "forbidden_scope": string[],
      "risk_notes": string[],
      "stop_condition": string,
      "llm_notes": string
    }
  ]
}`
    : `{
  "title": string,
  "problem": string,
  "evidence_refs": string[],
  "concrete_tasks": string[],
  "acceptance_criteria": string[],
  "verification_commands": string[],
  "forbidden_scope": string[],
  "risk_notes": string[],
  "stop_condition": string,
  "llm_notes": string
}`}`;
}

async function runHermesDelegateCommand({
  command,
  args,
  stdinPayload,
  repoRoot,
  timeoutMs
}) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        MISA_CYBERNETIC_OBSERVE_ONLY: "1",
        MISA_CYBERNETIC_NO_WRITE: "1",
        HERMES_DELEGATE_NO_CONTEXT: "1",
        HERMES_DELEGATE_OBSERVE_ONLY: "1"
      }
    });

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let timeout = null;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeout = setTimeout(() => {
        const error = new Error(`hermes-delegate timeout after ${timeoutMs}ms`);
        error.code = "hermes_delegate_timeout";
        child.kill();
        fail(error);
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      error.code = error.code ?? "hermes_delegate_unavailable";
      fail(error);
    });
    child.on("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      if (settled) return;
      if (code !== 0) {
        const error = new Error(`hermes-delegate exited with code ${code ?? signal}: ${stderr || stdout}`.slice(0, 500));
        error.code = "hermes_delegate_failed";
        fail(error);
        return;
      }
      if (HERMES_PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(stdout))) {
        const error = new Error(stdout.trim().slice(0, 500) || "hermes-delegate provider error");
        error.code = "hermes_delegate_provider_error";
        fail(error);
        return;
      }
      settled = true;
      resolve(stdout);
    });

    child.stdin.end(`${JSON.stringify(stdinPayload, null, 2)}\n`);
  });
}

async function callHermesDelegate({
  packet,
  repoRoot,
  command,
  args,
  hermesProvider,
  hermesModel,
  timeoutMs,
  previousFailure,
  candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT
}) {
  const requestedCandidateCount = normalizeCandidateCount(candidateCount);
  const auditPacket = buildHermesDelegateAuditPacket(packet, { candidateCount: requestedCandidateCount });
  const prompt = promptForHermesDelegate(packet, { previousFailure, candidateCount: requestedCandidateCount });
  const effectiveCommand = command ?? hermesDelegateCommandFromEnv();
  const configuredArgs = args ?? hermesDelegateArgsFromEnv();
  const effectiveArgs = configuredArgs
    ? replaceArgPlaceholders(configuredArgs, { prompt, auditPacket })
    : buildHermesDelegateDefaultArgs({
      prompt,
      provider: hermesProvider,
      model: hermesModel
    });
  return await runHermesDelegateCommand({
    command: effectiveCommand,
    args: effectiveArgs,
    repoRoot,
    timeoutMs,
    stdinPayload: {
      schema_version: "misa.hermes_delegate_bridge_input.v1",
      provider: "hermes-delegate",
      mode: "l2_no_context_observe_only",
      prompt,
      audit_packet: auditPacket
    }
  });
}

async function readOllamaStream(body, { onReader } = {}) {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  onReader?.(reader);
  let buffer = "";
  let output = "";

  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const chunk = JSON.parse(trimmed);
    if (chunk.error) throw new Error(`ollama failed: ${chunk.error}`);
    output += chunk.response ?? "";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }
  buffer += decoder.decode();
  consumeLine(buffer);
  return output;
}

async function callOllama({ prompt, model, endpoint, timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS }) {
  const controller = new AbortController();
  let reader = null;
  const timeoutError = () => new Error(`ollama timeout after ${timeoutMs}ms`);
  const run = (async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        format: "json",
        options: {
          temperature: 0,
          num_ctx: 8192,
          num_predict: 1600
        }
      })
    });
    if (!response.ok) throw new Error(`ollama failed ${response.status}`);
    if (response.body) {
      return await readOllamaStream(response.body, {
        onReader: (activeReader) => {
          reader = activeReader;
        }
      });
    }
    const data = await response.json();
    return data.response;
  })();

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return await run;

  let timeout = null;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = timeoutError();
      controller.abort(error);
      if (reader) {
        reader.cancel(error).catch(() => {});
      }
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timeout);
  }
}

function deterministicDraftForPacket(packet) {
  const fileA = packet.context.relevant_files[0];
  const fileB = packet.context.relevant_files[1] ?? fileA;
  const signal = packet.record.observed_signals?.[0] ?? packet.record.readout_family;
  const command = packet.allowed_verification_commands[0];
  const commandB = packet.allowed_verification_commands.includes("npm run precheck")
    ? "npm run precheck"
    : packet.allowed_verification_commands[1] ?? command;

  return {
    title: `${packet.context.source_class}: ${packet.source_id} observe-only review`,
    problem: `${packet.source_id} carries ${signal} evidence for ${packet.record.readout_family}; keep it as no-write external trajectory review material.`,
    evidence_refs: [...packet.workOrder.evidence_refs],
    concrete_tasks: [
      `In ${fileA}, trace source_id=${packet.source_id} and preserve evidence_refs=${packet.workOrder.evidence_refs.join(", ")} without adding new refs.`,
      `In ${fileB}, check signal=${signal} and route_hint=${packet.workOrder.route_hint}; expected result is hint_only/suggestion_only with no route or winner change.`,
      `In ${fileA}, confirm ${packet.context.context_anchors.slice(0, 3).join(", ")} stay observe-only and do not request memory, Zilliz, embedding, VPS, GitHub, or public publish effects.`,
      `In ${fileB}, verify status=${packet.workOrder.status} and authority=${packet.workOrder.authority}; expected result is a draft review note only, not work-order execution.`
    ],
    acceptance_criteria: [
      `${packet.source_id} keeps every original evidence ref in the draft.`,
      `No task requests route, winner, memory, Zilliz, embedding, VPS, GitHub, public publish, or external API effects.`,
      `The verification commands are selected from the allowed local command list.`
    ],
    verification_commands: uniqueStrings([command, commandB]).slice(0, 2),
    forbidden_scope: [...REQUIRED_FORBIDDEN_SCOPE],
    risk_notes: [
      `${packet.record.readout_family} is review pressure only, not execution authority.`,
      `Weak model output must be rejected if it invents commands or omits evidence refs.`
    ],
    stop_condition: "Stop after local draft review and gate validation; do not execute the work order.",
    llm_notes: "Deterministic mock draft used for tests; real providers must pass the same gate."
  };
}

async function callDraftProvider({
  packet,
  provider,
  model,
  ollamaEndpoint,
  ollamaTimeoutMs,
  prompt,
  hermesDelegateOptions = {},
  previousFailure,
  candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT
}) {
  if (provider === "mock") {
    const requestedCandidateCount = normalizeCandidateCount(candidateCount);
    const draft = deterministicDraftForPacket(packet);
    const raw = requestedCandidateCount > 1
      ? JSON.stringify({
        candidates: candidateStrategies(requestedCandidateCount).map((strategy) => ({
          candidate_id: strategy.candidate_id,
          strategy: strategy.candidate_id,
          ...draft,
          title: `${draft.title} (${strategy.candidate_id})`,
          llm_notes: `${draft.llm_notes} Mock candidate focus: ${strategy.focus}`
        }))
      })
      : JSON.stringify(draft);
    return {
      raw,
      llm_api_calls: 0,
      provider_error: null
    };
  }
  if (provider === "ollama") {
    try {
      return {
        raw: await callOllama({
          prompt: promptForPacket(packet, { previousFailure, candidateCount }),
          model,
          endpoint: ollamaEndpoint,
          timeoutMs: ollamaTimeoutMs
        }),
        llm_api_calls: 1,
        provider_error: null
      };
    } catch (error) {
      return {
        raw: "",
        llm_api_calls: 1,
        provider_error: serializeProviderError(error)
      };
    }
  }
  if (provider === "hermes-delegate") {
    try {
      return {
        raw: await callHermesDelegate({
          packet,
          repoRoot: hermesDelegateOptions.repoRoot ?? process.cwd(),
          command: hermesDelegateOptions.command,
          args: hermesDelegateOptions.args,
          hermesProvider: hermesDelegateOptions.provider,
          hermesModel: hermesDelegateOptions.model,
          timeoutMs: hermesDelegateOptions.timeoutMs ?? DEFAULT_HERMES_DELEGATE_TIMEOUT_MS,
          previousFailure,
          candidateCount
        }),
        llm_api_calls: 1,
        provider_error: null
      };
    } catch (error) {
      return {
        raw: "",
        llm_api_calls: 1,
        provider_error: serializeProviderError(error)
      };
    }
  }
  if (typeof provider === "function") {
    try {
      return {
        raw: await provider({
          packet,
          prompt: prompt ?? promptForPacket(packet, { previousFailure, candidateCount }),
          previousFailure
        }),
        llm_api_calls: 1,
        provider_error: null
      };
    } catch (error) {
      return {
        raw: "",
        llm_api_calls: 1,
        provider_error: serializeProviderError(error)
      };
    }
  }
  throw new Error(`unsupported LLM draft provider: ${provider}`);
}

function taskSpecificityHits(draft, packet) {
  const text = [
    draft?.title,
    draft?.problem,
    ...(draft?.concrete_tasks ?? []),
    ...(draft?.acceptance_criteria ?? []),
    ...(draft?.risk_notes ?? [])
  ].join("\n");
  const anchors = [
    ...packet.context.context_anchors,
    ...packet.context.relevant_files,
    ...packet.context.task_focus
  ].filter((anchor) => String(anchor).length >= 4);
  return uniqueStrings(anchors.filter((anchor) => text.includes(anchor))).length;
}

function genericTaskCount(draft) {
  return (draft?.concrete_tasks ?? []).filter((task) => (
    GENERIC_TASK_PATTERNS.some((pattern) => pattern.test(task))
      && !/[\\/]|\.mjs|\.json|\.md|test\/|scripts\/|schemas\/|source_id|evidence|ref|signal|route|winner|memory|Zilliz|embedding|VPS|GitHub/i.test(task)
  )).length;
}

function actionableTaskDetails(draft, packet) {
  return (draft?.concrete_tasks ?? []).map((task) => {
    const text = String(task ?? "");
    const hasFileOrTest = packet.context.relevant_files.some((filePath) => text.includes(filePath))
      || /\b(?:scripts|test|schemas|examples)[\\/][\w./-]+\.(?:mjs|json|md)\b/i.test(text);
    const hasSourceOrRef = text.includes(packet.source_id)
      || (packet.workOrder.evidence_refs ?? []).some((ref) => text.includes(ref));
    const hasSignal = [
      packet.record.readout_family,
      packet.context.source_class,
      ...(packet.record.observed_signals ?? []),
      ...packet.context.task_focus
    ].some((signal) => signal && text.includes(signal));
    const hasField = TASK_FIELD_PATTERNS.some((pattern) => pattern.test(text));
    const hasExpectation = TASK_EXPECTATION_PATTERNS.some((pattern) => pattern.test(text));
    const anchorTypeCount = [
      hasFileOrTest,
      hasSourceOrRef,
      hasSignal,
      hasField,
      hasExpectation
    ].filter(Boolean).length;

    return {
      task: text,
      actionable: anchorTypeCount >= 3 && hasExpectation,
      anchorTypeCount,
      hasFileOrTest,
      hasSourceOrRef,
      hasSignal,
      hasField,
      hasExpectation
    };
  });
}

export function gateLlmWorkOrderDraft({ packet, draft, parseOk = true, providerError = null } = {}) {
  const violations = [];
  const refs = packet?.workOrder?.evidence_refs ?? [];
  const activeText = JSON.stringify({
    title: draft?.title,
    problem: draft?.problem,
    tasks: draft?.concrete_tasks,
    acceptance: draft?.acceptance_criteria,
    commands: draft?.verification_commands,
    risk_notes: draft?.risk_notes,
    stop_condition: draft?.stop_condition
  });

  if (providerError) violations.push("provider_call_failed");
  if (!parseOk) violations.push("json_parse_failed");
  if (!draft || typeof draft !== "object") violations.push("draft_missing");
  if (!draft?.title || /Explain external trajectory signal/i.test(draft.title)) violations.push("generic_title");
  if (!Array.isArray(draft?.concrete_tasks) || draft.concrete_tasks.length < 4) violations.push("too_few_concrete_tasks");
  if (!Array.isArray(draft?.acceptance_criteria) || draft.acceptance_criteria.length < 2) violations.push("too_few_acceptance_criteria");
  if (!Array.isArray(draft?.verification_commands) || draft.verification_commands.length < 2) violations.push("too_few_verification_commands");
  if (!Array.isArray(draft?.verification_commands)
    || !draft.verification_commands.every((command) => packet.allowed_verification_commands.includes(command))) {
    violations.push("non_whitelisted_verification_command");
  }
  if (!refs.every((ref) => draft?.evidence_refs?.includes(ref))) violations.push("missing_source_refs");
  if (!REQUIRED_FORBIDDEN_SCOPE.every((item) => draft?.forbidden_scope?.includes(item))) violations.push("missing_forbidden_scope");
  if (LIVE_EFFECT_PATTERNS.some((pattern) => pattern.test(activeText))) violations.push("live_effect_language_detected");

  const specificityHits = taskSpecificityHits(draft, packet);
  const vagueTaskCount = genericTaskCount(draft);
  const actionability = actionableTaskDetails(draft, packet);
  const actionableTaskCount = actionability.filter((task) => task.actionable).length;
  const weakTaskCount = Math.max(0, (draft?.concrete_tasks?.length ?? 0) - actionableTaskCount);
  if (specificityHits < 3) violations.push("too_few_context_anchors");
  if (vagueTaskCount > 1) violations.push("too_many_generic_tasks");
  if (actionableTaskCount < 4) violations.push("too_few_actionable_tasks");
  if (weakTaskCount > 0) violations.push("too_many_weak_tasks");

  const scoreParts = {
    title_specific: draft?.title && !/Explain external trajectory signal/i.test(draft.title) ? 1 : 0,
    refs_preserved: refs.length ? refs.filter((ref) => draft?.evidence_refs?.includes(ref)).length / refs.length : 1,
    commands_whitelisted: draft?.verification_commands?.length
      ? draft.verification_commands.filter((command) => packet.allowed_verification_commands.includes(command)).length / draft.verification_commands.length
      : 0,
    task_count: Math.min((draft?.concrete_tasks?.length ?? 0) / 4, 1),
    context_specificity: Math.min(specificityHits / 5, 1),
    actionable_tasks: Math.min(actionableTaskCount / 4, 1),
    generic_penalty: Math.min(vagueTaskCount / 4, 1),
    weak_task_penalty: Math.min(weakTaskCount / 4, 1)
  };
  const quality_score = Math.round(1000 * Math.max(0,
    scoreParts.title_specific * 0.12
      + scoreParts.refs_preserved * 0.16
      + scoreParts.commands_whitelisted * 0.18
      + scoreParts.task_count * 0.12
      + scoreParts.context_specificity * 0.18
      + scoreParts.actionable_tasks * 0.24
      - scoreParts.generic_penalty * 0.1
      - scoreParts.weak_task_penalty * 0.1
  )) / 1000;

  if (quality_score < 0.74) violations.push("quality_score_below_threshold");

  return {
    ok: violations.length === 0,
    violations,
    quality_score,
    checks: {
      parseOk,
      concreteTaskCount: draft?.concrete_tasks?.length ?? 0,
      acceptanceCount: draft?.acceptance_criteria?.length ?? 0,
      verificationCommandCount: draft?.verification_commands?.length ?? 0,
      preservedRefs: refs.filter((ref) => draft?.evidence_refs?.includes(ref)).length,
      requiredRefs: refs.length,
      whitelistedCommands: (draft?.verification_commands ?? [])
        .filter((command) => packet.allowed_verification_commands.includes(command)).length,
      specificityHits,
      genericTaskCount: vagueTaskCount,
      actionableTaskCount,
      weakTaskCount,
      taskActionability: actionability,
      providerError
    }
  };
}

function extractCandidateDrafts(parsed, requestedCandidateCount) {
  if (!parsed || typeof parsed !== "object") return [];
  const requested = normalizeCandidateCount(requestedCandidateCount);
  const rawCandidates = Array.isArray(parsed.candidates)
    ? parsed.candidates
    : Array.isArray(parsed.drafts)
      ? parsed.drafts
      : [parsed];
  return rawCandidates
    .filter((draft) => draft && typeof draft === "object")
    .slice(0, requested)
    .map((draft, index) => ({
      candidate_id: String(draft.candidate_id ?? draft.id ?? candidateStrategies(requested)[index]?.candidate_id ?? `candidate_${index + 1}`),
      strategy: String(draft.strategy ?? candidateStrategies(requested)[index]?.candidate_id ?? `candidate_${index + 1}`),
      draft
    }));
}

function compareCandidateResults(left, right) {
  const leftGate = left.gate ?? {};
  const rightGate = right.gate ?? {};
  if (Boolean(leftGate.ok) !== Boolean(rightGate.ok)) return leftGate.ok ? -1 : 1;
  if ((leftGate.quality_score ?? 0) !== (rightGate.quality_score ?? 0)) {
    return (rightGate.quality_score ?? 0) - (leftGate.quality_score ?? 0);
  }
  const leftChecks = leftGate.checks ?? {};
  const rightChecks = rightGate.checks ?? {};
  if ((leftChecks.weakTaskCount ?? 0) !== (rightChecks.weakTaskCount ?? 0)) {
    return (leftChecks.weakTaskCount ?? 0) - (rightChecks.weakTaskCount ?? 0);
  }
  if ((leftChecks.actionableTaskCount ?? 0) !== (rightChecks.actionableTaskCount ?? 0)) {
    return (rightChecks.actionableTaskCount ?? 0) - (leftChecks.actionableTaskCount ?? 0);
  }
  if ((leftChecks.specificityHits ?? 0) !== (rightChecks.specificityHits ?? 0)) {
    return (rightChecks.specificityHits ?? 0) - (leftChecks.specificityHits ?? 0);
  }
  return (left.index ?? 0) - (right.index ?? 0);
}

function selectBestCandidate(candidateResults) {
  return [...candidateResults].sort(compareCandidateResults)[0] ?? null;
}

function summarizeCandidateSelection({ candidateResults, winner, requestedCandidateCount }) {
  const candidateCount = candidateResults.length;
  const qualityScores = candidateResults.map((candidate) => candidate.gate.quality_score);
  const bestQuality = winner?.gate?.quality_score ?? 0;
  const passed = candidateResults.filter((candidate) => candidate.gate.ok).length;
  return {
    requested_candidate_count: normalizeCandidateCount(requestedCandidateCount),
    returned_candidate_count: candidateCount,
    expected_candidate_count_met: candidateCount >= normalizeCandidateCount(requestedCandidateCount),
    winner_candidate_id: winner?.candidate_id ?? null,
    winner_strategy: winner?.strategy ?? null,
    winner_quality_score: bestQuality,
    candidate_quality_scores: qualityScores,
    candidate_passed_gate_count: passed,
    candidate_failed_gate_count: candidateCount - passed,
    avg_candidate_quality_score: candidateCount
      ? Math.round(1000 * qualityScores.reduce((sum, score) => sum + score, 0) / candidateCount) / 1000
      : 0
  };
}

async function draftOnePacket({
  packet,
  repoRoot,
  provider,
  model,
  ollamaEndpoint,
  ollamaTimeoutMs,
  hermesDelegateCommand,
  hermesDelegateArgs,
  hermesDelegateProvider,
  hermesDelegateModel,
  hermesDelegateTimeoutMs,
  repairAttempts,
  candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT
}) {
  const requestedCandidateCount = normalizeCandidateCount(candidateCount);
  let previousFailure = null;
  let raw = "";
  let draft = null;
  let parseOk = false;
  let llmApiCalls = 0;
  let gate = null;
  let providerError = null;
  let parsed = null;
  let candidates = [];
  let winner = null;
  let candidateSelection = summarizeCandidateSelection({
    candidateResults: [],
    winner: null,
    requestedCandidateCount
  });

  for (let attempt = 0; attempt <= repairAttempts; attempt += 1) {
    const providerResult = await callDraftProvider({
      packet,
      provider,
      model,
      ollamaEndpoint,
      ollamaTimeoutMs,
      hermesDelegateOptions: provider === "hermes-delegate"
        ? {
          repoRoot,
          command: hermesDelegateCommand,
          args: hermesDelegateArgs,
          provider: hermesDelegateProvider,
          model: hermesDelegateModel,
          timeoutMs: hermesDelegateTimeoutMs
        }
        : undefined,
      previousFailure,
      candidateCount: requestedCandidateCount
    });
    raw = providerResult.raw;
    llmApiCalls += providerResult.llm_api_calls;
    providerError = providerResult.provider_error ?? null;
    if (providerError) {
      draft = null;
      parseOk = false;
      gate = gateLlmWorkOrderDraft({ packet, draft, parseOk, providerError });
      candidates = [];
      winner = null;
      candidateSelection = summarizeCandidateSelection({
        candidateResults: [],
        winner: null,
        requestedCandidateCount
      });
      break;
    }
    try {
      parsed = JSON.parse(stripJson(raw));
      parseOk = true;
    } catch {
      parsed = null;
      parseOk = false;
    }
    const candidateDrafts = parseOk ? extractCandidateDrafts(parsed, requestedCandidateCount) : [];
    candidates = candidateDrafts.map((candidate, index) => ({
      candidate_id: candidate.candidate_id,
      strategy: candidate.strategy,
      index,
      draft: candidate.draft,
      gate: gateLlmWorkOrderDraft({ packet, draft: candidate.draft, parseOk })
    }));
    winner = selectBestCandidate(candidates);
    draft = winner?.draft ?? null;
    gate = winner
      ? winner.gate
      : gateLlmWorkOrderDraft({ packet, draft: null, parseOk });
    candidateSelection = summarizeCandidateSelection({
      candidateResults: candidates,
      winner,
      requestedCandidateCount
    });
    if (gate.ok) break;
    previousFailure = gate;
  }

  return {
    source_id: packet.source_id,
    model,
    provider: typeof provider === "string" ? provider : "custom",
    llm_api_calls: llmApiCalls,
    candidate_selection: candidateSelection,
    packet: {
      source_class: packet.context.source_class,
      readout_family: packet.record.readout_family,
      route_hint: packet.workOrder.route_hint,
      severity: packet.ticket?.severity ?? null,
      priority: packet.record.suggested_priority,
      observed_signals: packet.record.observed_signals,
      evidence_refs: packet.workOrder.evidence_refs,
      relevant_files: packet.context.relevant_files,
      allowed_verification_commands: packet.allowed_verification_commands
    },
    draft,
    winner_candidate_id: winner?.candidate_id ?? null,
    winner_strategy: winner?.strategy ?? null,
    candidates: candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      strategy: candidate.strategy,
      draft: candidate.draft,
      gate: candidate.gate
    })),
    loser_ledger: candidates
      .filter((candidate) => candidate.candidate_id !== winner?.candidate_id)
      .map((candidate) => ({
        candidate_id: candidate.candidate_id,
        strategy: candidate.strategy,
        quality_score: candidate.gate.quality_score,
        ok: candidate.gate.ok,
        violations: candidate.gate.violations
      })),
    raw_response: raw,
    provider_error: providerError,
    gate
  };
}

export async function buildExternalTrajectoryLlmWorkOrderDraftReport({
  repoRoot = process.cwd(),
  onlineShadowReport,
  onlineShadowReportPath,
  perceptionDigestPath,
  sourceIds = [],
  maxSamples = 5,
  provider = DEFAULT_LLM_DRAFT_PROVIDER,
  model = DEFAULT_LLM_DRAFT_MODEL,
  ollamaEndpoint = "http://127.0.0.1:11434/api/generate",
  ollamaTimeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  hermesDelegateCommand,
  hermesDelegateArgs,
  hermesDelegateProvider,
  hermesDelegateModel,
  hermesDelegateTimeoutMs = DEFAULT_HERMES_DELEGATE_TIMEOUT_MS,
  repairAttempts = 1,
  candidateCount = DEFAULT_LLM_DRAFT_CANDIDATE_COUNT,
  now = new Date()
} = {}) {
  const requestedCandidateCount = normalizeCandidateCount(candidateCount);
  const candidateMode = candidateModeForCount(requestedCandidateCount);
  const report = onlineShadowReport
    ?? (onlineShadowReportPath
      ? await readJson(resolvePath(repoRoot, onlineShadowReportPath))
      : await runExternalTrajectoryOnlineShadowContract({
        repoRoot,
        perceptionDigestPath,
        now
      }));
  const digestPath = perceptionDigestPath ?? report.input?.perception_digest_path ?? null;
  const packets = buildLlmWorkOrderDraftingPackets({
    onlineShadowReport: report,
    perceptionDigestPath: digestPath,
    sourceIds,
    maxSamples
  });
  const results = [];
  for (const packet of packets) {
    results.push(await draftOnePacket({
      packet,
      repoRoot,
      provider,
      model,
      ollamaEndpoint,
      ollamaTimeoutMs,
      hermesDelegateCommand,
      hermesDelegateArgs,
      hermesDelegateProvider,
      hermesDelegateModel,
      hermesDelegateTimeoutMs,
      repairAttempts,
      candidateCount: requestedCandidateCount
    }));
  }
  const llmApiCalls = results.reduce((count, result) => count + result.llm_api_calls, 0);
  const allCandidates = results.flatMap((result) => result.candidates ?? []);
  const candidateQualitySum = allCandidates.reduce((sum, candidate) => sum + candidate.gate.quality_score, 0);
  const expectedCandidateCountMet = results.filter((result) => (
    result.candidate_selection?.expected_candidate_count_met
  )).length;

  return {
    schema_version: "misa.external_trajectory_llm_work_order_draft.v1",
    mode: "external-trajectory-llm-work-order-draft",
    ok: results.every((result) => result.gate.ok),
    created_at: asIsoDate(now),
    input: {
      online_shadow_report_path: onlineShadowReportPath ?? null,
      perception_digest_path: digestPath,
      source_ids: sourceIds,
      max_samples: maxSamples,
      requested_candidate_count: requestedCandidateCount,
      candidate_mode: candidateMode,
      default_candidate_count: DEFAULT_LLM_DRAFT_CANDIDATE_COUNT
    },
    model,
    provider: typeof provider === "string" ? provider : "custom",
    delegate: {
      provider: hermesDelegateProvider ?? null,
      model: hermesDelegateModel ?? null
    },
    summary: {
      sample_count: results.length,
      draft_count: results.filter((result) => result.draft).length,
      candidate_mode: candidateMode,
      requested_candidate_count: requestedCandidateCount,
      candidate_count: allCandidates.length,
      expected_candidate_count_met: expectedCandidateCountMet,
      expected_candidate_count_miss: results.length - expectedCandidateCountMet,
      winner_selected_count: results.filter((result) => result.winner_candidate_id).length,
      candidate_passed_gate_count: allCandidates.filter((candidate) => candidate.gate.ok).length,
      candidate_failed_gate_count: allCandidates.filter((candidate) => !candidate.gate.ok).length,
      avg_candidate_quality_score: allCandidates.length
        ? Math.round(1000 * candidateQualitySum / allCandidates.length) / 1000
        : 0,
      passed_gate_count: results.filter((result) => result.gate.ok).length,
      failed_gate_count: results.filter((result) => !result.gate.ok).length,
      provider_error_count: results.filter((result) => result.provider_error).length,
      avg_quality_score: results.length
        ? Math.round(1000 * results.reduce((sum, result) => sum + result.gate.quality_score, 0) / results.length) / 1000
        : 0,
      llm_api_calls: llmApiCalls,
      external_api_calls: provider === "ollama" ? 0 : 0,
      route_changes: 0,
      winner_changes: 0,
      memory_writes: 0,
      zilliz_writes: 0,
      embedding_creations: 0,
      vps_touches: 0,
      github_pushes: 0,
      public_publishes: 0
    },
    safety: {
      local_only: true,
      no_write: true,
      executes_work_orders: false,
      changes_route: false,
      changes_winner: false,
      writes_memory: false,
      writes_zilliz: false,
      creates_embeddings: false,
      touches_vps: false,
      pushes_github: false,
      publishes_publicly: false
    },
    results,
    warnings: [
      "This command drafts work orders only; it never executes them.",
      "Weak local models are allowed only behind command whitelist, source-ref preservation, context-anchor, and no-live-effect gates.",
      "Provider output must be rejected when it invents commands or stays generic."
    ]
  };
}

export function renderLlmWorkOrderDraftMarkdown(result) {
  const lines = [
    "# External Trajectory LLM Work Order Draft",
    "",
    `- ok: ${result.ok}`,
    `- created_at: ${result.created_at}`,
    `- provider: ${result.provider}`,
    `- model: ${result.model}`,
    `- hermes_delegate_provider: ${result.delegate?.provider ?? "none"}`,
    `- hermes_delegate_model: ${result.delegate?.model ?? "none"}`,
    `- sample_count: ${result.summary.sample_count}`,
    `- candidate_mode: ${result.summary.candidate_mode}`,
    `- requested_candidate_count: ${result.summary.requested_candidate_count}`,
    `- candidate_count: ${result.summary.candidate_count}`,
    `- winner_selected_count: ${result.summary.winner_selected_count}`,
    `- passed_gate_count: ${result.summary.passed_gate_count}`,
    `- failed_gate_count: ${result.summary.failed_gate_count}`,
    `- avg_quality_score: ${result.summary.avg_quality_score}`,
    `- llm_api_calls: ${result.summary.llm_api_calls}`,
    ""
  ];

  for (const item of result.results) {
    lines.push(
      `## ${item.source_id}`,
      "",
      `- gate_ok: ${item.gate.ok}`,
      `- quality_score: ${item.gate.quality_score}`,
      `- candidates: ${item.candidates?.length ?? 0}`,
      `- winner_candidate_id: ${item.winner_candidate_id ?? "none"}`,
      `- winner_strategy: ${item.winner_strategy ?? "none"}`,
      `- violations: ${item.gate.violations.join(", ") || "none"}`,
      `- provider_error: ${item.provider_error?.code ?? "none"}`,
      `- title: ${item.draft?.title ?? "PARSE_FAILED"}`,
      `- verification_commands: ${(item.draft?.verification_commands ?? []).join(" | ")}`,
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function writeExternalTrajectoryLlmWorkOrderDraftArtifacts({
  repoRoot = process.cwd(),
  result,
  outDir,
  now = new Date()
} = {}) {
  const stamp = asIsoDate(now).replace(/[:.]/g, "-");
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "external-trajectory-llm-work-order-draft", stamp));
  await fs.mkdir(outputRoot, { recursive: true });
  const jsonPath = path.join(outputRoot, "external-trajectory-llm-work-order-draft.json");
  const markdownPath = path.join(outputRoot, "external-trajectory-llm-work-order-draft.md");
  const written = {
    ...result,
    output: {
      output_dir: path.relative(repoRoot, outputRoot).replaceAll("\\", "/"),
      json_path: path.relative(repoRoot, jsonPath).replaceAll("\\", "/"),
      markdown_path: path.relative(repoRoot, markdownPath).replaceAll("\\", "/")
    }
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(written, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderLlmWorkOrderDraftMarkdown(written), "utf8");
  return written;
}
