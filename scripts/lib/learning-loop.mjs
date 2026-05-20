import fs from "node:fs/promises";
import path from "node:path";
import { applyExtractedSignals } from "./signal-extractor.mjs";
import { distillLocalMisaSources } from "./session-distiller.mjs";

const FIXTURE_DIR = path.join("examples", "misa-learning");

const LIVE_EFFECTS_OFF = {
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
};

const ROUTE_ORDER = ["policy", "damping", "skill", "case", "memory", "ignore"];

function hasSignal(event, signal) {
  return Array.isArray(event.signals) && event.signals.includes(signal);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeArtifactEvidence(event) {
  const evidence = event.artifact_evidence ?? {};
  const read = uniqueStrings(evidence.read);
  const modified = uniqueStrings(evidence.modified);

  return {
    injected: uniqueStrings(evidence.injected),
    read,
    modified,
    referenced: uniqueStrings([...read, ...modified]),
    tool_errors: uniqueStrings(evidence.tool_errors)
  };
}

function referencedByPrefix(artifactEvidence, prefix) {
  return artifactEvidence.referenced.filter((artifact) => artifact.startsWith(`${prefix}:`));
}

function classifyRoute(event) {
  const artifactEvidence = normalizeArtifactEvidence(event);
  const overreactionSignal = hasSignal(event, "avoid_overreaction") || hasSignal(event, "single_failure");
  const publicBoundarySignal = hasSignal(event, "public_posting_boundary") || hasSignal(event, "farcaster_public_memory_risk");

  if (hasSignal(event, "candidate_replay_failed")) {
    return {
      target: "damping",
      controlCategory: "fault_tolerance",
      errorClass: "candidate failed replay",
      action: "skip",
      status: "rejected",
      publicationMode: "no_publish",
      candidateState: "rejected",
      evidenceBasis: "candidate replay or validation failure",
      rationale: "The candidate has failed validation and must not be published.",
      affectedArtifacts: referencedByPrefix(artifactEvidence, "skill")
    };
  }

  if (overreactionSignal && !publicBoundarySignal) {
    return {
      target: "damping",
      controlCategory: "fault_tolerance",
      errorClass: "overreaction risk",
      action: "skip",
      status: "held",
      publicationMode: "no_publish",
      candidateState: "held",
      evidenceBasis: "thin or one-off evidence",
      rationale: "The evidence is too thin for a permanent write; hold and collect another signal.",
      affectedArtifacts: ["damping:cooldown"]
    };
  }

  if (hasSignal(event, "explicit_user_boundary") || publicBoundarySignal) {
    return {
      target: "policy",
      controlCategory: "optimal_control",
      errorClass: "future behavior boundary",
      action: "create",
      status: "requires_approval",
      publicationMode: "requires_approval",
      candidateState: "staged",
      evidenceBasis: "explicit user boundary",
      rationale: "The signal changes future behavior and must stay draft-only until approved.",
      affectedArtifacts: ["policy:candidate"]
    };
  }

  if (overreactionSignal) {
    return {
      target: "damping",
      controlCategory: "fault_tolerance",
      errorClass: "overreaction risk",
      action: "skip",
      status: "held",
      publicationMode: "no_publish",
      candidateState: "held",
      evidenceBasis: "thin or one-off evidence",
      rationale: "The evidence is too thin for a permanent write; hold and collect another signal.",
      affectedArtifacts: ["damping:cooldown"]
    };
  }

  if (hasSignal(event, "reusable_workflow") && event.evidence_count >= 2) {
    const skillReferences = referencedByPrefix(artifactEvidence, "skill");
    const affectedSkill = skillReferences[0] ?? "skill:new-candidate";

    return {
      target: "skill",
      controlCategory: "self_evolution",
      errorClass: "repeatable procedure",
      action: skillReferences.length > 0 ? "improve" : "create",
      status: "draft",
      publicationMode: "draft_only",
      candidateState: "staged",
      evidenceBasis: skillReferences.length > 0
        ? "skill was explicitly read or modified"
        : "no existing skill was explicitly used; create a new candidate only",
      rationale: "The signal is a repeatable workflow that should become a staged skill candidate before replay.",
      affectedArtifacts: [affectedSkill]
    };
  }

  if (hasSignal(event, "repeated_failure_pattern") && event.evidence_count >= 2) {
    return {
      target: "case",
      controlCategory: "fault_tolerance",
      errorClass: "known failure mode",
      action: "create",
      status: "draft",
      publicationMode: "draft_only",
      candidateState: "staged",
      evidenceBasis: artifactEvidence.tool_errors.length > 0
        ? "repeated failure with tool-error evidence"
        : "repeated failure pattern",
      rationale: "The signal describes a repeated failure and recovery pattern.",
      affectedArtifacts: ["case:candidate"]
    };
  }

  if ((hasSignal(event, "stable_user_preference") || hasSignal(event, "stable_project_fact")) && event.evidence_count >= 2) {
    return {
      target: "memory",
      controlCategory: "system_identification",
      errorClass: "stable fact or preference",
      action: "create",
      status: "draft",
      publicationMode: "draft_only",
      candidateState: "staged",
      evidenceBasis: "repeated stable fact or preference",
      rationale: "The signal is stable bottom logic, but v0.2 only drafts memory candidates.",
      affectedArtifacts: ["memory:candidate"]
    };
  }

  return {
    target: "ignore",
    controlCategory: "simulation",
    errorClass: "unsupported signal",
    action: "skip",
    status: "rejected",
    publicationMode: "no_publish",
    candidateState: "rejected",
    evidenceBasis: "unsupported signal",
    rationale: "The signal does not yet justify a learning artifact.",
    affectedArtifacts: []
  };
}

function assertFixture(event) {
  const required = [
    "event_id",
    "channel",
    "summary",
    "signals",
    "evidence_count",
    "outcome",
    "risk_level",
    "redaction_status",
    "source_type",
    "redaction_note",
    "setpoint",
    "artifact_evidence",
    "expected_route",
    "expected_status",
    "expected_publication_mode",
    "expected_candidate_state",
    "created_at"
  ];

  for (const key of required) {
    if (event[key] == null) {
      throw new Error(`fixture ${event.event_id ?? "<unknown>"} is missing ${key}`);
    }
  }

  if (!Array.isArray(event.signals) || event.signals.length === 0) {
    throw new Error(`fixture ${event.event_id} must include at least one signal`);
  }
}

export function simulateLearningCycle(event) {
  event = Array.isArray(event?.signals) && event.signals.length > 0
    ? event
    : applyExtractedSignals(event);
  assertFixture(event);
  const artifactEvidence = normalizeArtifactEvidence(event);
  const route = classifyRoute(event);

  return {
    cycle_id: `cycle-${event.event_id}`,
    source_event_id: event.event_id,
    observe: {
      channel: event.channel,
      signals: event.signals,
      evidence_count: event.evidence_count,
      risk_level: event.risk_level,
      redaction_status: event.redaction_status
    },
    identify: {
      control_category: route.controlCategory,
      error_class: route.errorClass,
      setpoint: event.setpoint
    },
    artifact_evidence: artifactEvidence,
    route: {
      target: route.target,
      rationale: route.rationale,
      publication_mode: route.publicationMode
    },
    proposed_change: {
      summary: route.target === "ignore"
        ? `Skip unsupported lesson: ${event.summary}`
        : `Draft ${route.target} candidate: ${event.summary}`,
      candidate_action: route.action,
      affected_artifacts: route.affectedArtifacts
    },
    candidate_review: {
      state: route.candidateState,
      evidence_basis: route.evidenceBasis,
      publication_allowed: false,
      notes: [
        "Candidate is staged for local replay evidence only.",
        "Prompt-time injection alone is not treated as proof that a skill was used."
      ]
    },
    verification: {
      level: "L1",
      commands: ["npm run distill:misa", "npm run simulate:misa", "npm run precheck", "npm test"],
      passed: true,
      notes: [
        "Deterministic read-only replay over local redacted fixtures.",
        "No persistent memory, skill publication, timer, session-mechanic, or public posting effect."
      ]
    },
    result: {
      status: route.status,
      positive_value: route.target !== "ignore",
      live_effects: { ...LIVE_EFFECTS_OFF }
    },
    created_at: event.created_at
  };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function loadMisaLearningFixtures({ repoRoot = process.cwd() } = {}) {
  const fixtureRoot = path.join(repoRoot, FIXTURE_DIR);
  const entries = await fs.readdir(fixtureRoot, { withFileTypes: true });
  const fixtures = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".fixture.json")) {
      continue;
    }

    fixtures.push(await readJson(path.join(fixtureRoot, entry.name)));
  }

  fixtures.sort((a, b) => a.event_id.localeCompare(b.event_id));
  return fixtures;
}

export async function loadMisaLearningEvents({ repoRoot = process.cwd(), includeDistilled = true } = {}) {
  const fixtures = await loadMisaLearningFixtures({ repoRoot });
  if (!includeDistilled) {
    return fixtures;
  }

  const distillation = await distillLocalMisaSources({ repoRoot });
  return [
    ...fixtures,
    ...distillation.learning_events
  ].sort((a, b) => a.event_id.localeCompare(b.event_id));
}

export async function simulateMisaLearning({ repoRoot = process.cwd() } = {}) {
  const fixtures = await loadMisaLearningFixtures({ repoRoot });
  const distillation = await distillLocalMisaSources({ repoRoot });
  const events = [
    ...fixtures,
    ...distillation.learning_events
  ].sort((a, b) => a.event_id.localeCompare(b.event_id));
  const traces = events.map((event) => simulateLearningCycle(event));
  const routeCounts = Object.fromEntries(ROUTE_ORDER.map((route) => [route, 0]));
  const fixtureStats = {
    total: events.length,
    file_fixtures: fixtures.length,
    distilled_events: distillation.learning_events.length,
    redacted_realish: events.filter((event) => event.source_type === "redacted_realish").length
  };
  const violations = [...distillation.violations];
  const warnings = [...distillation.warnings];

  for (const [index, trace] of traces.entries()) {
    const fixture = events[index];
    routeCounts[trace.route.target] += 1;

    if (trace.route.target !== fixture.expected_route) {
      violations.push(`${trace.cycle_id} expected route ${fixture.expected_route} but got ${trace.route.target}`);
    }

    if (trace.result.status !== fixture.expected_status) {
      violations.push(`${trace.cycle_id} expected status ${fixture.expected_status} but got ${trace.result.status}`);
    }

    if (trace.route.publication_mode !== fixture.expected_publication_mode) {
      violations.push(`${trace.cycle_id} expected publication ${fixture.expected_publication_mode} but got ${trace.route.publication_mode}`);
    }

    if (trace.candidate_review.state !== fixture.expected_candidate_state) {
      violations.push(`${trace.cycle_id} expected candidate state ${fixture.expected_candidate_state} but got ${trace.candidate_review.state}`);
    }

    if (trace.candidate_review.publication_allowed) {
      violations.push(`${trace.cycle_id} unexpectedly allows candidate publication`);
    }

    for (const affectedArtifact of trace.proposed_change.affected_artifacts) {
      if (
        affectedArtifact.startsWith("skill:")
        && trace.artifact_evidence.injected.includes(affectedArtifact)
        && !trace.artifact_evidence.referenced.includes(affectedArtifact)
      ) {
        violations.push(`${trace.cycle_id} treats injected-only ${affectedArtifact} as skill evidence`);
      }
    }

    const effects = trace.result.live_effects;
    if (Object.values(effects).some(Boolean)) {
      violations.push(`${trace.cycle_id} has live effects in dry-run mode`);
    }

    if (trace.route.target === "policy" && trace.route.publication_mode !== "requires_approval") {
      violations.push(`${trace.cycle_id} policy route must require approval`);
    }

    if (trace.route.target === "damping" && !["held", "rejected"].includes(trace.result.status)) {
      violations.push(`${trace.cycle_id} damping route should hold or reject rather than publish`);
    }
  }

  if (fixtures.length < 3) {
    warnings.push("Misa learning loop has fewer than 3 fixtures");
  }

  if (fixtureStats.redacted_realish === 0) {
    warnings.push("Misa learning loop has no redacted real-ish replay fixtures");
  }

  if (fixtureStats.redacted_realish > 10) {
    violations.push("Misa learning loop should keep redacted real-ish fixtures at 10 or fewer");
  }

  if (routeCounts.memory === 0 || routeCounts.skill === 0 || routeCounts.case === 0 || routeCounts.policy === 0 || routeCounts.damping === 0) {
    warnings.push("Misa learning loop should cover memory, skill, case, policy, and damping routes");
  }

  return {
    mode: "dry-run",
    ok: violations.length === 0,
    traces,
    routeCounts,
    fixtureStats,
    warnings,
    violations
  };
}
