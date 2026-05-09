import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyActuators,
  evaluateControlContract,
  evaluateDampingRules,
  evaluateMisaIntegrationProfile
} from "../scripts/lib/governance.mjs";
import {
  loadMisaLearningFixtures,
  simulateLearningCycle,
  simulateMisaLearning
} from "../scripts/lib/learning-loop.mjs";
import { runPrecheck } from "../scripts/lib/precheck-core.mjs";

test("classifies high-risk actuators", () => {
  const matches = classifyActuators([
    "write draft",
    "start timer",
    "change provider route"
  ]);

  assert.deepEqual(matches.map((match) => match.id), [
    "background_timer",
    "provider_route"
  ]);
});

test("blocks high-risk control contract without approval", () => {
  const result = evaluateControlContract({
    contract_id: "unsafe",
    primary_setpoint: "change production provider route",
    acceptance: ["smoke test"],
    guardrail_metrics: [],
    sampling_plan: "local",
    recovery_target: "restore previous provider",
    rollback_trigger: "smoke fails",
    boundary: ["provider route"],
    actuator_budget: ["change provider route"],
    created_at: "2026-05-09T08:00:00Z"
  });

  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /approval/);
});

test("accepts default damping rules", () => {
  const result = evaluateDampingRules({
    ruleset_id: "default",
    promotion_thresholds: {
      skill_candidate_after_successes: 3,
      case_candidate_after_failures: 2,
      policy_requires_approval: true,
      high_risk_requires_contract: true
    },
    cooldown_policy: {
      verifier_failures: 2
    }
  });

  assert.equal(result.ok, true);
});

test("blocks Misa live-effect integration profile", () => {
  const result = evaluateMisaIntegrationProfile({
    profile_id: "unsafe",
    target_agent: "Misa",
    mode: "live",
    blocked_surfaces: [],
    live_effects: {
      calls_model_providers: true,
      starts_timers: false,
      writes_persistent_memory: false,
      changes_session_mechanics: false,
      changes_provider_routes: false,
      posts_publicly: false,
      deletes_data: false
    },
    secrets_required: true,
    verification_commands: []
  });

  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /reference_only/);
  assert.match(result.violations.join("\n"), /calls_model_providers/);
});

test("repository dry-run precheck passes", async () => {
  const result = await runPrecheck();

  assert.equal(result.mode, "dry-run");
  assert.equal(result.ok, true);
});

test("routes explicit public posting boundary to policy draft", () => {
  const trace = simulateLearningCycle({
    event_id: "policy-test",
    channel: "farcaster",
    summary: "Do not send real Farcaster posts unless explicitly asked.",
    signals: ["explicit_user_boundary", "public_posting_boundary"],
    evidence_count: 2,
    outcome: "success",
    risk_level: "high",
    redaction_status: "clean",
    source_type: "synthetic",
    redaction_note: "unit test synthetic event",
    setpoint: "avoid public-channel side effects",
    artifact_evidence: {
      injected: [],
      read: [],
      modified: [],
      tool_errors: []
    },
    expected_route: "policy",
    expected_status: "requires_approval",
    expected_publication_mode: "requires_approval",
    expected_candidate_state: "staged",
    created_at: "2026-05-10T00:00:00Z"
  });

  assert.equal(trace.route.target, "policy");
  assert.equal(trace.route.publication_mode, "requires_approval");
  assert.equal(trace.candidate_review.state, "staged");
  assert.equal(trace.result.live_effects.posts_publicly, false);
});

test("holds single failures as damping instead of learning too much", () => {
  const trace = simulateLearningCycle({
    event_id: "damping-test",
    channel: "local",
    summary: "A single failure should not change provider routes.",
    signals: ["single_failure", "avoid_overreaction"],
    evidence_count: 1,
    outcome: "failure",
    risk_level: "medium",
    redaction_status: "clean",
    source_type: "synthetic",
    redaction_note: "unit test synthetic event",
    setpoint: "avoid overreaction",
    artifact_evidence: {
      injected: [],
      read: [],
      modified: [],
      tool_errors: ["tool:transient-validation-failure"]
    },
    expected_route: "damping",
    expected_status: "held",
    expected_publication_mode: "no_publish",
    expected_candidate_state: "held",
    created_at: "2026-05-10T00:00:00Z"
  });

  assert.equal(trace.route.target, "damping");
  assert.equal(trace.result.status, "held");
  assert.equal(trace.proposed_change.candidate_action, "skip");
});

test("does not treat injected-only skill as skill attribution evidence", () => {
  const trace = simulateLearningCycle({
    event_id: "skill-injected-only-test",
    channel: "local",
    summary: "A reusable workflow appeared while an old skill was merely listed in the prompt.",
    signals: ["reusable_workflow"],
    evidence_count: 3,
    outcome: "success",
    risk_level: "medium",
    redaction_status: "clean",
    source_type: "synthetic",
    redaction_note: "unit test synthetic event",
    setpoint: "avoid crediting prompt-time injection as skill use",
    artifact_evidence: {
      injected: ["skill:old-trigger"],
      read: [],
      modified: [],
      tool_errors: []
    },
    expected_route: "skill",
    expected_status: "draft",
    expected_publication_mode: "draft_only",
    expected_candidate_state: "staged",
    created_at: "2026-05-10T00:00:00Z"
  });

  assert.equal(trace.route.target, "skill");
  assert.equal(trace.proposed_change.candidate_action, "create");
  assert.deepEqual(trace.artifact_evidence.referenced, []);
  assert.deepEqual(trace.proposed_change.affected_artifacts, ["skill:new-candidate"]);
  assert.match(trace.candidate_review.evidence_basis, /no existing skill/);
});

test("uses read or modified skill evidence for existing skill improvement", () => {
  const trace = simulateLearningCycle({
    event_id: "skill-read-evidence-test",
    channel: "local",
    summary: "A recovery skill was actually read and then showed a reusable improvement point.",
    signals: ["reusable_workflow"],
    evidence_count: 3,
    outcome: "success",
    risk_level: "medium",
    redaction_status: "clean",
    source_type: "synthetic",
    redaction_note: "unit test synthetic event",
    setpoint: "credit only explicit skill use",
    artifact_evidence: {
      injected: ["skill:misa-hermes-recovery"],
      read: ["skill:misa-hermes-recovery"],
      modified: [],
      tool_errors: []
    },
    expected_route: "skill",
    expected_status: "draft",
    expected_publication_mode: "draft_only",
    expected_candidate_state: "staged",
    created_at: "2026-05-10T00:00:00Z"
  });

  assert.equal(trace.proposed_change.candidate_action, "improve");
  assert.deepEqual(trace.artifact_evidence.referenced, ["skill:misa-hermes-recovery"]);
  assert.deepEqual(trace.proposed_change.affected_artifacts, ["skill:misa-hermes-recovery"]);
  assert.match(trace.candidate_review.evidence_basis, /explicitly read or modified/);
});

test("rejects failed candidate replay without publishing", () => {
  const trace = simulateLearningCycle({
    event_id: "candidate-replay-failed-test",
    channel: "local",
    summary: "A skill candidate failed local replay and should stay unpublished.",
    signals: ["candidate_replay_failed", "reusable_workflow"],
    evidence_count: 2,
    outcome: "failure",
    risk_level: "medium",
    redaction_status: "clean",
    source_type: "synthetic",
    redaction_note: "unit test synthetic event",
    setpoint: "block weak candidates after replay failure",
    artifact_evidence: {
      injected: ["skill:misa-hermes-recovery"],
      read: ["skill:misa-hermes-recovery"],
      modified: [],
      tool_errors: ["tool:replay-regression"]
    },
    expected_route: "damping",
    expected_status: "rejected",
    expected_publication_mode: "no_publish",
    expected_candidate_state: "rejected",
    created_at: "2026-05-10T00:00:00Z"
  });

  assert.equal(trace.route.target, "damping");
  assert.equal(trace.result.status, "rejected");
  assert.equal(trace.candidate_review.state, "rejected");
  assert.equal(trace.candidate_review.publication_allowed, false);
  assert.equal(trace.route.publication_mode, "no_publish");
});

test("Misa learning simulation covers practical positive routes", async () => {
  const result = await simulateMisaLearning();

  assert.equal(result.ok, true);
  assert.ok(result.routeCounts.memory >= 1);
  assert.ok(result.routeCounts.skill >= 1);
  assert.ok(result.routeCounts.case >= 1);
  assert.ok(result.routeCounts.policy >= 1);
  assert.ok(result.routeCounts.damping >= 1);
  assert.equal(result.traces.every((trace) => trace.result.positive_value), true);
});

test("Misa replay fixtures stay inside the redacted real-ish cap", async () => {
  const fixtures = await loadMisaLearningFixtures();
  const redactedRealish = fixtures.filter((fixture) => fixture.source_type === "redacted_realish");

  assert.equal(fixtures.length, 10);
  assert.equal(redactedRealish.length, 5);
  assert.ok(redactedRealish.length <= 10);
  assert.equal(redactedRealish.every((fixture) => fixture.redaction_status === "redacted"), true);
});

test("Misa replay fixtures match declared route expectations", async () => {
  const fixtures = await loadMisaLearningFixtures();

  for (const fixture of fixtures) {
    const trace = simulateLearningCycle(fixture);

    assert.equal(trace.verification.level, "L1");
    assert.equal(trace.route.target, fixture.expected_route);
    assert.equal(trace.result.status, fixture.expected_status);
    assert.equal(trace.route.publication_mode, fixture.expected_publication_mode);
    assert.equal(trace.candidate_review.state, fixture.expected_candidate_state);
    assert.equal(trace.candidate_review.publication_allowed, false);
    assert.equal(Object.values(trace.result.live_effects).some(Boolean), false);
  }
});
