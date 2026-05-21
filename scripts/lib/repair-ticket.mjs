import fs from "node:fs/promises";
import path from "node:path";
import {
  readJsonHandoffArtifact,
  ticketsFromJsonHandoffDiagnostics
} from "./json-handoff-contract.mjs";
import { reviewMemoryLayerComparison } from "./memory-layer.mjs";

const CODEX_MAY_EDIT = [
  "scripts/lib/memory-layer.mjs",
  "scripts/lib/cli-output.mjs",
  "scripts/lib/json-handoff-contract.mjs",
  "scripts/lib/repair-ticket.mjs",
  "scripts/work-order-router.mjs",
  "scripts/repair-ticket.mjs",
  "schemas/memory_layer.schema.json",
  "schemas/repair_ticket.schema.json",
  "schemas/work_order_routing.schema.json",
  "test/governance.test.mjs",
  "docs/current/memory-layer-skill-export-v0.13.md",
  "docs/current/repair-ticket-v0.13.md",
  "docs/current/work-order-routing-v0.14.md"
];

const CODEX_MUST_NOT_EDIT = [
  "Hermes runtime files",
  "Misa persona or production memory",
  "Farcaster production publisher",
  "VPS services",
  "provider credentials or .env files"
];

const NON_GOALS = [
  "Do not install Hermes skills.",
  "Do not write persistent memory.",
  "Do not update VPS.",
  "Do not touch production Farcaster actions.",
  "Do not start timers or services.",
  "Do not change provider routes."
];

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function stampFor(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sourceArgs(source) {
  const args = [];
  if (source.source_dir) {
    args.push(`--source-dir ${source.source_dir}`);
  }
  if (source.vps_raw_dir) {
    args.push(`--vps-raw-dir ${source.vps_raw_dir}`);
  }
  return args;
}

function commandWithArgs(command, source, extra = []) {
  const args = [...sourceArgs(source), ...extra];
  return args.length ? `${command} -- ${args.join(" ")}` : command;
}

function liveEffectViolation(review) {
  const effects = review.safety?.live_effects ?? {};
  return Object.values(effects).some(Boolean)
    || review.export_policy?.installs_skills === true
    || review.export_policy?.writes_persistent_memory === true
    || review.export_policy?.updates_vps === true
    || review.export_policy?.publication_allowed === true
    || review.safety?.publication_allowed === true;
}

function severityFor(review, badPromotionCount) {
  if (liveEffectViolation(review) || review.minimal_positive_l3.non_skill_promoted_count > 0) {
    return "P0";
  }
  if (badPromotionCount >= 3) {
    return "P1";
  }
  if (badPromotionCount > 0) {
    return "P2";
  }
  return "P3";
}

function statusFor(severity, badPromotionCount) {
  if (severity === "P0") {
    return "must_fix";
  }
  if (badPromotionCount > 0) {
    return "repair_candidate";
  }
  return "observe_only";
}

function badPromotions(review) {
  return review.original_auto_l3.skills
    .filter((skill) => skill.route_target !== "skill")
    .map((skill) => ({
      source_event_id: skill.source_event_id,
      wrong_route_promoted_as_skill: skill.route_target,
      title: skill.title,
      repair_hint: `Keep this as ${skill.route_target}, not L3 skill export.`
    }));
}

function readableSourceKind(sourceKind) {
  const known = {
    local_distillation_sources: "local distillation sources",
    vps_sanitized_conversation_artifacts: "VPS sanitized conversation artifacts",
    json_handoff_contract: "machine JSON handoff artifacts"
  };
  return known[sourceKind] ?? sourceKind.replace(/[_-]+/g, " ");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function promotionRouteSummary(promotions) {
  const routes = uniqueSorted(promotions.map((promotion) => promotion.wrong_route_promoted_as_skill));
  if (routes.length === 0) {
    return "no non-skill routes";
  }
  if (routes.length === 1) {
    return routes[0];
  }
  return `${routes.slice(0, -1).join(", ")} and ${routes.at(-1)}`;
}

function ticketTitle(review, promotions) {
  if (!promotions.length) {
    return `Auto-L3 promotion watch for ${readableSourceKind(review.source.source_kind)}`;
  }
  return `Auto-L3 non-skill promotion from ${readableSourceKind(review.source.source_kind)}`;
}

function problemStatement(review, promotions) {
  const sourceLabel = readableSourceKind(review.source.source_kind);
  if (!promotions.length) {
    return `No non-skill promotion was observed in ${sourceLabel}; keep this as observe-only regression evidence.`;
  }
  const routes = promotionRouteSummary(promotions);
  return [
    `Broad Auto-L3 would promote ${routes} lessons from ${sourceLabel} into skills.`,
    "Minimal-positive mode blocked the export, so this is a local design/regression risk, not a live production incident.",
    "Keep regression coverage and repair-ticket wording specific enough that future agents know which route owns each lesson."
  ].join(" ");
}

function acceptanceCriteria() {
  return [
    "minimal_positive_l3.non_skill_promoted_count == 0",
    "every exported skill has route_target == skill",
    "export_policy.installs_skills == false",
    "export_policy.writes_persistent_memory == false",
    "export_policy.updates_vps == false",
    "export_policy.publication_allowed == false",
    "repair ticket schema validation passes",
    "npm run precheck passes",
    "npm test passes"
  ];
}

function buildTicket(review) {
  const promotions = badPromotions(review);
  const severity = severityFor(review, promotions.length);
  const sourceKind = review.source.source_kind.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  return {
    ticket_id: `repair-${sourceKind}-auto-l3-overpromotion`,
    title: ticketTitle(review, promotions),
    severity,
    status: statusFor(severity, promotions.length),
    source_kind: review.source.source_kind,
    problem_statement: problemStatement(review, promotions),
    evidence: {
      source_count: review.layers.l0_sources.source_count,
      turn_count: review.layers.l0_sources.turn_count,
      raw_token_estimate: review.layers.l0_sources.raw_token_estimate,
      distillate_token_estimate: review.layers.l1_distillates.distillate_token_estimate,
      compression_ratio: review.layers.l1_distillates.compression_ratio,
      route_counts: review.layers.l2_candidates.route_counts,
      original_auto_l3_skill_count: review.comparison.original_skill_count,
      minimal_l3_skill_count: review.comparison.minimal_skill_count,
      original_non_skill_promoted_count: review.comparison.original_non_skill_promoted_count,
      minimal_non_skill_promoted_count: review.comparison.minimal_non_skill_promoted_count,
      avoided_bad_promotions: review.comparison.avoided_bad_promotions,
      verdict: review.comparison.verdict
    },
    bad_promotions: promotions,
    reproduction_commands: [
      commandWithArgs("npm --silent run memory-layer:misa", review.source, ["--json"]),
      commandWithArgs("npm --silent run repair-ticket:misa", review.source, ["--json", "--dry-run"]),
      commandWithArgs("npm --silent run export-skills:misa", review.source, ["--json"])
    ],
    acceptance_criteria: acceptanceCriteria(),
    codex_scope: {
      may_edit: [...CODEX_MAY_EDIT],
      must_not_edit: [...CODEX_MUST_NOT_EDIT]
    },
    non_goals: [...NON_GOALS],
    repair_tasks: {
      must_fix: [
        "Non-skill routes must never export as L3 skills.",
        "Minimal-positive export must remain the only exportable path."
      ],
      should_improve: [
        "Repair-ticket wording should name the exact non-skill route owner for each candidate.",
        "Regression tests should cover non-skill over-promotion with exact source_event_id evidence.",
        "Markdown output should be readable by Huan and precise enough for Codex."
      ],
      observe_only: [
        "original_auto_l3 remains a comparison simulation, not a production recommendation.",
        "A P1/P2 ticket from original_auto_l3 is not a live failure while minimal_positive_l3 blocks export."
      ]
    },
    quality_notes: promotions.length
      ? [
        "actionable: exact source_event_id and wrong route are present",
        "bounded: Codex edit scope is explicit",
        "safe: non-goals block live effects"
      ]
      : [
        "low urgency: no bad promotion on this sample",
        "observe-only: keep as regression evidence"
      ]
  };
}

function buildSummary(review, tickets) {
  const severityCounts = countBy(tickets, (ticket) => ticket.severity);
  return {
    ticket_count: tickets.length,
    highest_severity: tickets.some((ticket) => ticket.severity === "P0")
      ? "P0"
      : tickets.some((ticket) => ticket.severity === "P1")
        ? "P1"
        : tickets.some((ticket) => ticket.severity === "P2")
          ? "P2"
          : "P3",
    severity_counts: severityCounts,
    repair_candidate_count: tickets.filter((ticket) => ticket.status !== "observe_only").length,
    bad_promotion_count: tickets.reduce((sum, ticket) => sum + (ticket.bad_promotions ?? []).length, 0),
    minimal_non_skill_promoted_count: review.minimal_positive_l3.non_skill_promoted_count,
    live_effect_violation: liveEffectViolation(review),
    verdict: review.comparison.verdict
  };
}

export function buildRepairTicketReviewFromMemoryLayer(review, {
  now = new Date("2026-05-11T00:00:00Z"),
  extraTickets = []
} = {}) {
  const tickets = [];
  const ticket = buildTicket(review);
  if (ticket.bad_promotions.length > 0 || ticket.severity === "P0") {
    tickets.push(ticket);
  }
  tickets.push(...extraTickets);

  const violations = [...review.violations];
  if (review.minimal_positive_l3.non_skill_promoted_count !== 0) {
    violations.push("Minimal positive mode promoted a non-skill route.");
  }
  if (liveEffectViolation(review)) {
    violations.push("Repair ticket detected a live-effect or publication boundary violation.");
  }

  const summary = buildSummary(review, tickets);
  return {
    schema_version: "misa.repair_ticket_review.v1",
    mode: "repair-ticket-review",
    ok: violations.length === 0,
    created_at: now.toISOString(),
    source: review.source,
    source_review: {
      mode: review.mode,
      ok: review.ok,
      comparison: review.comparison
    },
    summary,
    tickets,
    safety: {
      production_authority: false,
      publication_allowed: false,
      installs_skills: false,
      writes_persistent_memory: false,
      updates_vps: false,
      touches_runtime: false,
      live_effects: review.safety.live_effects,
      blocked_operations: review.safety.blocked_operations
    },
    warnings: [
      "repair-ticket:misa is a local repair queue generator, not an automatic fixer.",
      "Codex repair scope is limited to memory-layer, skill-export, repair-ticket, replay-eval, schema, docs, and tests."
    ],
    violations
  };
}

export async function reviewRepairTickets({
  repoRoot = process.cwd(),
  sourceDir,
  vpsRawDir,
  jsonHandoffFiles = [],
  memoryLayerReview,
  now = new Date("2026-05-11T00:00:00Z")
} = {}) {
  const review = memoryLayerReview ?? await reviewMemoryLayerComparison({ repoRoot, sourceDir, vpsRawDir });
  const diagnostics = [];
  for (const filePath of jsonHandoffFiles) {
    diagnostics.push(await readJsonHandoffArtifact(filePath, { artifactRole: "machine_json_handoff" }));
  }
  const extraTickets = ticketsFromJsonHandoffDiagnostics(diagnostics);
  return buildRepairTicketReviewFromMemoryLayer(review, { now, extraTickets });
}

function renderMarkdown(review) {
  const lines = [
    "# Misa Repair Tickets",
    "",
    `- ok: ${review.ok}`,
    `- created_at: ${review.created_at}`,
    `- source_kind: ${review.source.source_kind}`,
    `- ticket_count: ${review.summary.ticket_count}`,
    `- highest_severity: ${review.summary.highest_severity}`,
    `- verdict: ${review.summary.verdict}`,
    "",
    "## Safety",
    "",
    `- publication_allowed: ${review.safety.publication_allowed}`,
    `- installs_skills: ${review.safety.installs_skills}`,
    `- writes_persistent_memory: ${review.safety.writes_persistent_memory}`,
    `- updates_vps: ${review.safety.updates_vps}`,
    `- touches_runtime: ${review.safety.touches_runtime}`,
    ""
  ];

  for (const ticket of review.tickets) {
    lines.push(
      `## ${ticket.ticket_id}`,
      "",
      `- severity: ${ticket.severity}`,
      `- status: ${ticket.status}`,
      `- title: ${ticket.title}`,
      "",
      ticket.problem_statement,
      "",
      "### Evidence",
      "",
      `- original_auto_l3_skill_count: ${ticket.evidence.original_auto_l3_skill_count}`,
      `- minimal_l3_skill_count: ${ticket.evidence.minimal_l3_skill_count}`,
      `- avoided_bad_promotions: ${ticket.evidence.avoided_bad_promotions}`,
      `- route_counts: ${JSON.stringify(ticket.evidence.route_counts)}`,
      ...(ticket.evidence.issue_code
        ? [
          `- issue_code: ${ticket.evidence.issue_code}`,
          `- artifact_path: ${ticket.evidence.artifact_path ?? ""}`,
          `- parse_error: ${ticket.evidence.parse_error ?? ""}`
        ]
        : []),
      "",
      "### Bad Promotions",
      ""
    );

    for (const promotion of ticket.bad_promotions) {
      lines.push(
        `- ${promotion.source_event_id}: ${promotion.wrong_route_promoted_as_skill} -> skill`,
        `  - ${promotion.repair_hint}`
      );
    }

    lines.push(
      "",
      "### Must Fix",
      "",
      ...ticket.repair_tasks.must_fix.map((task) => `- ${task}`),
      "",
      "### Should Improve",
      "",
      ...ticket.repair_tasks.should_improve.map((task) => `- ${task}`),
      "",
      "### Acceptance",
      "",
      ...ticket.acceptance_criteria.map((criterion) => `- ${criterion}`),
      "",
      "### Reproduce",
      "",
      ...ticket.reproduction_commands.map((command) => `- \`${command}\``),
      "",
      "### Non-Goals",
      "",
      ...ticket.non_goals.map((goal) => `- ${goal}`),
      ""
    );
  }

  if (review.violations.length) {
    lines.push("## Violations", "", ...review.violations.map((violation) => `- ${violation}`), "");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeRepairTicketArtifacts({
  review,
  repoRoot = process.cwd(),
  outDir,
  now = new Date()
} = {}) {
  const outputRoot = path.isAbsolute(outDir ?? "")
    ? outDir
    : path.join(repoRoot, outDir ?? path.join("runs", "repair-tickets", stampFor(now)));

  await fs.mkdir(outputRoot, { recursive: true });

  const jsonPath = path.join(outputRoot, "repair-ticket.json");
  const mdPath = path.join(outputRoot, "repair-ticket.md");
  const withOutput = {
    ...review,
    output: {
      output_dir: outputRoot,
      json_path: jsonPath,
      markdown_path: mdPath
    }
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(withOutput, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, renderMarkdown(withOutput), "utf8");

  return withOutput;
}
