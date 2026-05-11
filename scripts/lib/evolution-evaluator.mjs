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

function preflightChecks(item, signal) {
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
      ok: PREFLIGHT_COMMANDS.every((command) => item.verification_commands.includes(command)),
      reason: "A reportable candidate must include the local simulation and test chain."
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
  const checks = preflightChecks(item, signal);
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
