import fs from "node:fs/promises";
import path from "node:path";

const JSON_HANDOFF_MAY_EDIT = [
  "scripts/lib/cli-output.mjs",
  "scripts/lib/json-handoff-contract.mjs",
  "scripts/lib/repair-ticket.mjs",
  "scripts/work-order-router.mjs",
  "scripts/repair-ticket.mjs",
  "test/governance.test.mjs",
  "docs/current/repair-ticket-v0.13.md",
  "docs/current/work-order-routing-v0.14.md"
];

const JSON_HANDOFF_MUST_NOT_EDIT = [
  "Hermes runtime files",
  "Misa persona or production memory",
  "Farcaster production publisher",
  "VPS services",
  "provider credentials or .env files"
];

const JSON_HANDOFF_NON_GOALS = [
  "Do not strip banner text and pretend the artifact was valid JSON.",
  "Do not auto-execute the generated work order.",
  "Do not write persistent memory.",
  "Do not update VPS.",
  "Do not start timers or services."
];

function stableSlug(value) {
  return String(value || "json-handoff")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90) || "json-handoff";
}

function firstNonEmptyLine(text) {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
}

function trimEvidence(value, max = 180) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function classifyJsonParseFailure(text, error) {
  const firstLine = firstNonEmptyLine(text);
  const firstNonWhitespace = text.match(/\S/)?.[0] ?? "";
  const npmBanner = /^>\s+\S+/.test(firstLine);
  const hasJsonPayload = /(^|\n)\s*[{[]/.test(text);

  if (npmBanner) {
    return {
      issue_code: "npm_lifecycle_banner_before_json",
      title: "Machine JSON handoff polluted by npm lifecycle banner",
      likely_cause: "A bare npm run command wrote npm lifecycle banner text to stdout before the JSON payload."
    };
  }

  if (firstNonWhitespace && !["{", "["].includes(firstNonWhitespace)) {
    return {
      issue_code: "leading_non_json_stdout",
      title: "Machine JSON handoff polluted by leading stdout text",
      likely_cause: "The command wrote logs, banners, or warnings before the JSON payload."
    };
  }

  if (hasJsonPayload) {
    return {
      issue_code: "mixed_or_truncated_json_stdout",
      title: "Machine JSON handoff is mixed or truncated",
      likely_cause: "The artifact contains a JSON-looking payload but is not strict machine JSON."
    };
  }

  return {
    issue_code: "invalid_machine_json_artifact",
    title: "Machine JSON handoff artifact is not parseable JSON",
    likely_cause: "The artifact is empty, truncated, or not JSON."
  };
}

export function analyzeJsonHandoffText(text, {
  artifactPath = null,
  artifactRole = "machine_json"
} = {}) {
  try {
    return {
      ok: true,
      parseable: true,
      artifact_path: artifactPath,
      artifact_role: artifactRole,
      data: JSON.parse(text)
    };
  } catch (error) {
    const classification = classifyJsonParseFailure(text, error);
    return {
      ok: false,
      parseable: false,
      artifact_path: artifactPath,
      artifact_role: artifactRole,
      severity: "P2",
      first_line: trimEvidence(firstNonEmptyLine(text)),
      first_non_whitespace: text.match(/\S/)?.[0] ?? "",
      byte_count: Buffer.byteLength(text, "utf8"),
      line_count: text.length ? text.split(/\r?\n/).length : 0,
      parse_error: error.message,
      safe_patterns: [
        "--out-file <path>",
        "npm --silent run ... -- --json",
        "node scripts/... --json"
      ],
      ...classification
    };
  }
}

export async function readJsonHandoffArtifact(filePath, options = {}) {
  const text = await fs.readFile(filePath, "utf8");
  return analyzeJsonHandoffText(text, {
    artifactPath: filePath,
    ...options
  });
}

export async function readStrictJsonArtifact(filePath, options = {}) {
  const result = await readJsonHandoffArtifact(filePath, options);
  if (result.ok) return result.data;
  const error = new Error(`${result.title}: ${filePath}`);
  error.name = "JsonHandoffContractError";
  error.diagnostic = result;
  throw error;
}

export function ticketFromJsonHandoffDiagnostic(diagnostic) {
  const artifactName = diagnostic.artifact_path
    ? path.basename(diagnostic.artifact_path)
    : diagnostic.artifact_role;

  return {
    ticket_id: `repair-json-handoff-contract-${stableSlug(diagnostic.issue_code)}-${stableSlug(artifactName)}`,
    title: "Machine JSON handoff contract check",
    severity: diagnostic.severity ?? "P2",
    status: "repair_candidate",
    source_kind: "json_handoff_contract",
    problem_statement: "A machine JSON artifact is not strict JSON. Downstream commands must not need to strip npm banners, logs, or warnings before JSON.parse. Use --out-file, npm --silent run, or direct node for machine handoff.",
    evidence: {
      source_count: 1,
      turn_count: 1,
      raw_token_estimate: 1,
      distillate_token_estimate: 1,
      compression_ratio: 1,
      route_counts: {
        engineering_repair: 1
      },
      original_auto_l3_skill_count: 0,
      minimal_l3_skill_count: 0,
      original_non_skill_promoted_count: 0,
      minimal_non_skill_promoted_count: 0,
      avoided_bad_promotions: 0,
      verdict: "json_handoff_contract_failed",
      artifact_role: diagnostic.artifact_role,
      artifact_path: diagnostic.artifact_path,
      issue_code: diagnostic.issue_code,
      likely_cause: diagnostic.likely_cause,
      first_line: diagnostic.first_line,
      first_non_whitespace: diagnostic.first_non_whitespace,
      byte_count: diagnostic.byte_count,
      line_count: diagnostic.line_count,
      parse_error: diagnostic.parse_error,
      safe_patterns: diagnostic.safe_patterns
    },
    bad_promotions: [],
    reproduction_commands: [
      "npm run repair-ticket:misa -- --json --dry-run --out-file runs/repair-tickets/manual-check/repair-ticket.json",
      "npm run work-order:route -- --repair-ticket-file runs/repair-tickets/manual-check/repair-ticket.json --json --dry-run --out-file runs/work-orders/manual-check/work-orders.json",
      "npm --silent run repair-ticket:misa -- --json --dry-run > runs/repair-tickets/manual-check/repair-ticket.json",
      "npm --silent run work-order:route -- --repair-ticket-file runs/repair-tickets/manual-check/repair-ticket.json --json --dry-run > runs/work-orders/manual-check/work-orders.json"
    ],
    acceptance_criteria: [
      "machine JSON artifacts parse with JSON.parse without stripping text",
      "JSON-to-JSON command handoffs use --out-file, npm --silent run, or direct node",
      "work-order:route reports contaminated --repair-ticket-file input as a repair work order instead of throwing an unstructured parse error",
      "npm run validate:schemas passes",
      "npm run precheck passes",
      "npm test passes"
    ],
    codex_scope: {
      may_edit: [...JSON_HANDOFF_MAY_EDIT],
      must_not_edit: [...JSON_HANDOFF_MUST_NOT_EDIT]
    },
    non_goals: [...JSON_HANDOFF_NON_GOALS],
    repair_tasks: {
      must_fix: [
        "Machine-readable JSON files must contain only JSON.",
        "Downstream commands must not depend on manually cleaning npm lifecycle output."
      ],
      should_improve: [
        "Prefer --out-file for command-to-command JSON handoff.",
        "Keep npm --silent run documented for redirected stdout use.",
        "Add regression coverage with a deliberately npm-banner-polluted artifact."
      ],
      observe_only: [
        "Human-readable stdout may still include normal npm banners when it is not used as a machine JSON artifact."
      ]
    },
    quality_notes: [
      "actionable: exact artifact path and parse error are present",
      "bounded: fix stays in CLI, docs, and tests",
      "safe: no live service or memory write is required"
    ]
  };
}

export function ticketsFromJsonHandoffDiagnostics(diagnostics = []) {
  return diagnostics
    .filter((diagnostic) => diagnostic && diagnostic.ok === false)
    .map((diagnostic) => ticketFromJsonHandoffDiagnostic(diagnostic));
}

export function buildJsonHandoffRepairTicketReview({
  diagnostics = [],
  now = new Date("2026-05-12T00:00:00Z")
} = {}) {
  const tickets = ticketsFromJsonHandoffDiagnostics(diagnostics);
  return {
    schema_version: "misa.repair_ticket_review.v1",
    mode: "repair-ticket-review",
    ok: true,
    created_at: now.toISOString(),
    source: {
      source_kind: "json_handoff_contract",
      source_dir: null,
      vps_raw_dir: null
    },
    source_review: {
      mode: "json-handoff-contract",
      ok: tickets.length === 0,
      comparison: {
        issue_count: tickets.length,
        verdict: tickets.length ? "json_handoff_contract_failed" : "json_handoff_contract_passed"
      }
    },
    summary: {
      ticket_count: tickets.length,
      highest_severity: tickets.length ? "P2" : "P3",
      severity_counts: tickets.length ? { P2: tickets.length } : {},
      repair_candidate_count: tickets.length,
      bad_promotion_count: 0,
      minimal_non_skill_promoted_count: 0,
      live_effect_violation: false,
      verdict: tickets.length ? "json_handoff_contract_failed" : "json_handoff_contract_passed"
    },
    tickets,
    safety: {
      production_authority: false,
      publication_allowed: false,
      installs_skills: false,
      writes_persistent_memory: false,
      updates_vps: false,
      touches_runtime: false,
      live_effects: {},
      blocked_operations: [
        "persistent_memory_write",
        "zilliz_replacement",
        "farcaster_publish",
        "skill_publication",
        "production_skill_installation",
        "timer_or_service_start",
        "provider_route_change"
      ]
    },
    warnings: [
      "json_handoff_contract tickets report machine JSON transport issues only.",
      "Generated work orders are routing packets, not automatic execution."
    ],
    violations: []
  };
}
