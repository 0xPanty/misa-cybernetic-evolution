import { reviewSignalCandidateRollup } from "./signal-candidate-rollup.mjs";

const REAL_CHAT_SAMPLE_ID = "misa-skill-real-chat-evolution-eval-004";
const REPORT_QUEUE_LIMIT = 3;

const LIVE_EFFECTS_OFF = {
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
};

const BLOCKED_OPERATIONS = [
  "persistent_memory_write",
  "zilliz_replacement",
  "farcaster_publish",
  "skill_publication",
  "production_skill_installation",
  "session_mechanic_replacement",
  "timer_or_service_start",
  "provider_route_change"
];

const PREFLIGHT_COMMANDS = [
  "npm run distill:misa",
  "npm run simulate:misa",
  "npm run adaptive:misa",
  "npm run rollup:misa",
  "npm run evolution:evaluate:misa",
  "npm run validate:schemas",
  "npm run precheck",
  "npm test"
];

const HYGIENE_SOURCE = {
  source: "forrestchang/andrej-karpathy-skills",
  role: "candidate hygiene gate, not a new workflow",
  source_adaptations: [
    {
      source: "forrestchang/andrej-karpathy-skills",
      borrowed: [
        "avoid hidden assumptions",
        "keep scope minimal",
        "make changes traceable",
        "require success criteria",
        "use the four-question task gate"
      ],
      rejected: [
        "global always-apply rule import",
        "new runtime authority",
        "separate approval workflow"
      ]
    },
    {
      source: "mattpocock/skills",
      borrowed: [
        "resolve the decision tree before reporting a candidate",
        "answer from codebase evidence before asking the user",
        "ask only the next unresolved question",
        "flag terminology conflicts without creating a second doc system"
      ],
      rejected: [
        "mandatory grilling before every candidate",
        "new CONTEXT.md or ADR system",
        "issue tracker or triage workflow import"
      ]
    }
  ],
  borrowed: [
    "avoid hidden assumptions",
    "keep scope minimal",
    "make changes traceable",
    "require success criteria",
    "use the four-question task gate"
  ],
  rejected: [
    "global always-apply rule import",
    "new runtime authority",
    "separate approval workflow"
  ]
};

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function riskPenalty(riskLevel) {
  return {
    low: 0,
    medium: 0.04,
    high: 0.08,
    critical: 0.16
  }[riskLevel] ?? 0.06;
}

function routeValue(route) {
  return {
    skill: 0.9,
    memory: 0.84,
    case: 0.8,
    policy: 0.78,
    damping: 0.5,
    ignore: 0
  }[route] ?? 0.2;
}

function buildSignalMap(rollup) {
  return new Map(rollup.adapted_signals.map((signal) => [signal.source_event_id, signal]));
}

function sourceEventIdFor(item) {
  return item.source_signal_id.replace(/^signal-/, "");
}

function reportReason(item, signal) {
  if (item.route_target === "skill") {
    return "A repeatable workflow is ready for local draft review.";
  }
  if (item.route_target === "memory") {
    return "A stable fact or preference is ready as a draft memory candidate.";
  }
  if (item.route_target === "case") {
    return "A repeated failure pattern is ready as a draft case candidate.";
  }
  if (item.route_target === "policy") {
    return `A ${signal.evidence.risk_level} risk behavior boundary is ready for approval-only review.`;
  }
  return "The candidate needs more evidence before user review.";
}

function localCommandChainOk(item) {
  return PREFLIGHT_COMMANDS.every((command) => item.verification_commands.includes(command));
}

function localCommandShapeOk(item) {
  return item.verification_commands.every((command) => (
    command.startsWith("npm run ") || command === "npm test"
  ));
}

function hygienePrinciple(id, ok, reason) {
  return { id, ok, reason };
}

function taskGateQuestion(id, ok, yes, no, reason) {
  return {
    id,
    ok,
    decision: ok ? yes : no,
    reason
  };
}

function sourceQuestion(id, question, answer, source) {
  return { id, question, answer, source };
}

function openQuestion(id, question, recommended_answer, asks_huan = false) {
  return { id, question, recommended_answer, asks_huan };
}

function terminologyFor(item, signal) {
  const normalizedSignals = signal?.normalized_signals ?? [];
  const mentionsFarcaster = item.source_signal_id.includes("farcaster")
    || normalizedSignals.some((value) => value.includes("farcaster"));

  return {
    status: mentionsFarcaster ? "surface_term_aligned" : "aligned",
    canonical_terms: [
      {
        term: "Qianxuesen",
        meaning: "Misa/Hermes cybernetic learning and control layer"
      },
      {
        term: "Farcaster",
        meaning: "Hermes surface used for validation, not the system identity"
      },
      {
        term: "candidate",
        meaning: "local optimization proposal, not an approved production change"
      }
    ],
    conflicts: mentionsFarcaster && item.route_target !== "policy"
      ? [
        {
          term: "Farcaster",
          note: "Keep Farcaster framed as a surface signal; do not rename the Qianxuesen layer into a Farcaster framework."
        }
      ]
      : []
  };
}

function buildClarification(item, signal, taskGate, principles) {
  const failedQuestions = taskGate.filter((question) => !question.ok);
  const failedPrinciples = principles.filter((principle) => !principle.ok);
  const suppressed = item.suppression_applied || item.queue_state === "rejected_suppression";
  const codebaseAnswered = [
    sourceQuestion(
      "source_signal",
      "Which local signal produced this candidate?",
      signal?.source_event_id ?? "missing adapted signal",
      "adapted_signal"
    ),
    sourceQuestion(
      "route",
      "Which route does the local router assign?",
      item.route_target,
      "candidate_queue"
    ),
    sourceQuestion(
      "verification",
      "Can the candidate be verified by the existing local command chain?",
      localCommandChainOk(item) ? "yes" : "not yet",
      "candidate_queue.verification_commands"
    ),
    sourceQuestion(
      "live_effects",
      "Does this candidate carry live production authority?",
      signal?.safety?.production_authority === false ? "no" : "unknown",
      "adapted_signal.safety"
    )
  ];

  const openQuestions = [];
  if (suppressed) {
    openQuestions.push(openQuestion(
      "suppression",
      "Should this failed or suppressed candidate be reconsidered now?",
      "No. Keep it in the experience ledger until new evidence or a changed verifier appears."
    ));
  } else if (failedQuestions.length > 0 || failedPrinciples.length > 0) {
    for (const question of failedQuestions) {
      openQuestions.push(openQuestion(
        question.id,
        `Unresolved task gate: ${question.id}`,
        question.decision === "read_only_or_human_in_the_loop"
          ? "Keep the candidate read-only or ask Huan before any durable/public effect."
          : "Hold the candidate or reduce scope before reporting."
      ));
    }
    for (const principle of failedPrinciples) {
      openQuestions.push(openQuestion(
        principle.id,
        `Unresolved hygiene principle: ${principle.id}`,
        "Use existing local evidence first; ask Huan only if the answer is not in code, docs, or the next rollup."
      ));
    }
  }

  const needsHuanAnswer = openQuestions.filter((question) => question.asks_huan);

  return {
    source: "mattpocock/skills grill-me",
    mode: "codebase_first_decision_tree",
    status: openQuestions.length === 0
      ? "resolved_by_evidence"
      : suppressed
        ? "suppressed"
        : "hold_for_more_evidence",
    rule: "Ask one unresolved question only after local code, docs, and rollup evidence cannot answer it.",
    codebase_answered: codebaseAnswered,
    open_questions: openQuestions,
    needs_huan_answer: needsHuanAnswer,
    recommended_next_question: needsHuanAnswer[0] ?? openQuestions[0] ?? null
  };
}

function buildCandidateHygiene(item, signal) {
  const evidenceCount = signal?.evidence?.evidence_count ?? 0;
  const normalizedSignals = signal?.normalized_signals ?? [];
  const positiveOrBoundaryValue = signal?.evidence?.positive_value === true
    || item.route_target === "policy"
    || item.route_target === "case";
  const knownRoute = ["memory", "skill", "case", "policy", "damping"].includes(item.route_target);
  const localCommandsOk = localCommandChainOk(item);
  const approvalOnly = item.approval_required_for_production === true
    && item.production_authority === false
    && signal?.safety?.production_authority === false
    && signal?.safety?.publication_allowed === false
    && !Object.values(signal?.safety?.live_effects ?? {}).some(Boolean);

  const taskGate = [
    taskGateQuestion(
      "complex_enough",
      item.priority !== "low" && knownRoute,
      "candidate_preflight",
      "workflow_or_hold",
      "Low-priority or unsupported routes should not become reportable optimization candidates."
    ),
    taskGateQuestion(
      "valuable_enough",
      evidenceCount >= 2 && positiveOrBoundaryValue,
      "candidate_preflight",
      "hold_or_suppress",
      "A candidate needs at least two evidence points and positive value or a real boundary reason."
    ),
    taskGateQuestion(
      "parts_doable",
      item.verification_required && localCommandsOk,
      "candidate_preflight",
      "reduce_scope",
      "Every reportable candidate must carry the local verification command chain."
    ),
    taskGateQuestion(
      "error_cost_managed",
      approvalOnly,
      "human_review_only",
      "read_only_or_human_in_the_loop",
      "Preflight may only report to Huan; it cannot create live effects or production authority."
    )
  ];

  const principles = [
    hygienePrinciple(
      "no_hidden_assumptions",
      Boolean(signal) && normalizedSignals.length > 0,
      "The candidate must be grounded in an adapted signal with normalized evidence."
    ),
    hygienePrinciple(
      "minimal_scope",
      knownRoute && localCommandShapeOk(item),
      "The candidate stays inside one known route and uses only local npm/test commands."
    ),
    hygienePrinciple(
      "traceable_change",
      Boolean(item.candidate_id) && Boolean(signal?.source_event_id),
      "The candidate must trace back to an exact source_event_id."
    ),
    hygienePrinciple(
      "success_criteria_present",
      item.verification_required && localCommandsOk,
      "A reportable candidate needs explicit verification commands before review."
    ),
    hygienePrinciple(
      "four_question_gate",
      taskGate.every((question) => question.ok),
      "The candidate must pass complexity, value, doability, and error-cost checks."
    )
  ];
  const clarification = buildClarification(item, signal, taskGate, principles);
  const terminology = terminologyFor(item, signal);
  const reportable = item.queue_state === "ready_for_daily_rollup"
    && !item.suppression_applied
    && clarification.status === "resolved_by_evidence"
    && principles.every((principle) => principle.ok);

  return {
    ...HYGIENE_SOURCE,
    reportable,
    verdict: reportable
      ? "passes_hygiene"
      : item.suppression_applied
        ? "suppress"
        : "hold_or_reduce_scope",
    task_gate: taskGate,
    principles,
    clarification,
    terminology
  };
}

function candidateScore(item, signal) {
  const evidenceScore = Math.min(signal.evidence.evidence_count, 4) / 4;
  const routeScore = routeValue(item.route_target);
  const localReady = item.queue_state === "ready_for_daily_rollup" ? 1 : 0;
  const safetyScore = item.production_authority === false && signal.safety.publication_allowed === false ? 1 : 0;
  const suppressionPenalty = item.suppression_applied ? 0.4 : 0;

  return round(
    evidenceScore * 0.34
      + routeScore * 0.24
      + localReady * 0.22
      + safetyScore * 0.2
      - riskPenalty(signal.evidence.risk_level)
      - suppressionPenalty
  );
}

function preflightChecks(item, signal, hygiene) {
  return [
    {
      id: "has_source_signal",
      ok: Boolean(signal),
      reason: "The candidate must come from an adapted daily-rollup signal."
    },
    {
      id: "ready_before_report",
      ok: item.queue_state === "ready_for_daily_rollup",
      reason: "Only ready candidates can be shown to Huan for a real change decision."
    },
    {
      id: "evidence_threshold",
      ok: (signal?.evidence.evidence_count ?? 0) >= 2,
      reason: "At least two evidence points are required before reporting an optimization."
    },
    {
      id: "not_suppressed",
      ok: !item.suppression_applied,
      reason: "Suppressed candidates stay in the failure ledger."
    },
    {
      id: "local_command_chain",
      ok: localCommandChainOk(item),
      reason: "A reportable candidate must include the local simulation and test chain."
    },
    {
      id: "candidate_hygiene_gate",
      ok: hygiene.reportable,
      reason: "A reportable candidate must avoid hidden assumptions, stay small, remain traceable, include success criteria, and pass the four-question task gate."
    },
    {
      id: "no_live_effects",
      ok: item.production_authority === false
        && signal?.safety?.production_authority === false
        && signal?.safety?.publication_allowed === false
        && !Object.values(signal?.safety?.live_effects ?? {}).some(Boolean),
      reason: "Preflight cannot write memory, publish, start services, post publicly, or change providers."
    }
  ];
}

function buildOptimizationCandidate(item, signal) {
  const sourceEventId = sourceEventIdFor(item);
  const candidateHygiene = buildCandidateHygiene(item, signal);
  const checks = preflightChecks(item, signal, candidateHygiene);
  const score = signal ? candidateScore(item, signal) : 0;
  const passed = checks.every((check) => check.ok);
  const status = passed
    ? "preflight_passed"
    : item.queue_state === "rejected_suppression"
      ? "suppressed"
      : "held_for_more_evidence";

  return {
    candidate_id: item.candidate_id,
    source_event_id: sourceEventId,
    route_target: item.route_target,
    queue_state: item.queue_state,
    proposed_optimization: {
      action: passed ? "report_to_huan_for_approval" : "do_not_report_yet",
      reason: signal ? reportReason(item, signal) : "Missing adapted signal evidence.",
      requires_huan_approval: true,
      production_authority: false
    },
    local_preflight: {
      status,
      score,
      checks,
      commands: passed ? [...PREFLIGHT_COMMANDS] : [],
      simulated_before_report: passed,
      report_to_huan: passed
    },
    candidate_hygiene: candidateHygiene,
    evidence: signal
      ? {
          evidence_count: signal.evidence.evidence_count,
          risk_level: signal.evidence.risk_level,
          redaction_status: signal.evidence.redaction_status,
          normalized_signals: signal.normalized_signals
        }
      : null,
    prediction: passed
      ? "safe_to_report_after_local_preflight"
      : status === "suppressed"
        ? "suppress_and_record_experience"
        : "hold_until_more_evidence",
    label: item.queue_state,
    trajectory: [
      "signal_adapter",
      "candidate_queue",
      "daily_rollup",
      `candidate:${item.candidate_id}`,
      `preflight:${status}`,
      passed ? "report_queue" : "internal_only"
    ],
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    }
  };
}

function buildReportQueue(candidates) {
  return candidates
    .filter((candidate) => candidate.local_preflight.report_to_huan)
    .sort((a, b) => b.local_preflight.score - a.local_preflight.score)
    .slice(0, REPORT_QUEUE_LIMIT)
    .map((candidate, index) => ({
      report_id: `report-${candidate.source_event_id}`,
      rank: index + 1,
      candidate_id: candidate.candidate_id,
      source_event_id: candidate.source_event_id,
      route_target: candidate.route_target,
      score: candidate.local_preflight.score,
      hygiene_verdict: candidate.candidate_hygiene.verdict,
      clarification_status: candidate.candidate_hygiene.clarification.status,
      next_unresolved_question: candidate.candidate_hygiene.clarification.recommended_next_question,
      terminology_status: candidate.candidate_hygiene.terminology.status,
      summary: candidate.proposed_optimization.reason,
      ask_huan: "Approve or reject this optimization before any durable change.",
      allowed_next_step: "human_review_only",
      report_policy: `top_${REPORT_QUEUE_LIMIT}_preflight_passed_candidates_per_rollup`,
      production_authority: false
    }));
}

function buildExperienceLedger(candidates) {
  return candidates
    .filter((candidate) => candidate.local_preflight.status === "suppressed")
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      source_event_id: candidate.source_event_id,
      route_target: candidate.route_target,
      lesson: "Do not bring this candidate to Huan until new evidence or a changed verifier exists.",
      score: candidate.local_preflight.score
    }));
}

function buildHoldQueue(candidates) {
  return candidates
    .filter((candidate) => candidate.local_preflight.status === "held_for_more_evidence")
    .map((candidate) => ({
      candidate_id: candidate.candidate_id,
      source_event_id: candidate.source_event_id,
      route_target: candidate.route_target,
      reason: "Not enough local preflight evidence to report.",
      next_signal_needed: "another matching signal in a later scan or daily rollup"
    }));
}

export async function evaluateMisaEvolution({ repoRoot = process.cwd() } = {}) {
  const rollup = await reviewSignalCandidateRollup({ repoRoot });
  const signalByEvent = buildSignalMap(rollup);
  const candidates = rollup.candidate_queue.items.map((item) => {
    const signal = signalByEvent.get(sourceEventIdFor(item));
    return buildOptimizationCandidate(item, signal);
  });
  const reportQueue = buildReportQueue(candidates);
  const experienceLedger = buildExperienceLedger(candidates);
  const holdQueue = buildHoldQueue(candidates);
  const realChat = candidates.find((candidate) => candidate.source_event_id === REAL_CHAT_SAMPLE_ID);
  const violations = [...rollup.violations];

  if (!realChat) {
    violations.push("Real chat preflight fixture did not enter the v0.11 candidate preflight.");
  } else if (realChat.local_preflight.status !== "preflight_passed") {
    violations.push("Real chat preflight fixture did not pass local preflight.");
  }

  if (reportQueue.length === 0) {
    violations.push("Candidate preflight produced no reportable optimization candidates.");
  }

  for (const candidate of candidates) {
    if (candidate.local_preflight.report_to_huan && candidate.local_preflight.status !== "preflight_passed") {
      violations.push(`${candidate.candidate_id} reports to Huan without passing preflight.`);
    }
    if (candidate.local_preflight.report_to_huan && !candidate.candidate_hygiene.reportable) {
      violations.push(`${candidate.candidate_id} reports to Huan without passing candidate hygiene.`);
    }
    if (Object.values(candidate.safety.live_effects).some(Boolean)) {
      violations.push(`${candidate.candidate_id} has live effects in local preflight.`);
    }
  }

  return {
    schema_version: "misa.evolution_candidate_preflight.v1",
    mode: "candidate-preflight-local-simulation",
    ok: violations.length === 0,
    sequence: [
      "signal_adapter",
      "candidate_queue",
      "daily_rollup",
      "optimization_candidate",
      "local_preflight",
      "report_queue_or_internal_ledger"
    ],
    source: {
      signal_rollup_mode: rollup.mode,
      adapted_signal_count: rollup.summary.adapted_signal_count,
      queue_item_count: rollup.summary.queue_item_count,
      real_chat_fixture_id: REAL_CHAT_SAMPLE_ID
    },
    summary: {
      optimization_candidate_count: candidates.length,
      preflight_passed_count: candidates.filter((candidate) => candidate.local_preflight.status === "preflight_passed").length,
      hygiene_reportable_count: candidates.filter((candidate) => candidate.candidate_hygiene.reportable).length,
      report_queue_count: reportQueue.length,
      report_queue_limit: REPORT_QUEUE_LIMIT,
      held_count: holdQueue.length,
      suppressed_count: experienceLedger.length,
      real_chat_preflight_status: realChat?.local_preflight.status ?? "missing",
      production_authority: false
    },
    optimization_candidates: candidates,
    report_queue: reportQueue,
    hold_queue: holdQueue,
    experience_ledger: experienceLedger,
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    },
    warnings: [
      "v0.11 preflights candidate optimizations before reporting them to Huan.",
      "Passing preflight means ready for human review only, not approval to write memory, publish Skills, post publicly, start services, or update VPS."
    ],
    violations
  };
}
