import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyActuators,
  evaluateControlContract,
  evaluateDampingRules,
  evaluateMisaIntegrationProfile
} from "../scripts/lib/governance.mjs";
import {
  loadMisaLearningEvents,
  loadMisaLearningFixtures,
  simulateLearningCycle,
  simulateMisaLearning
} from "../scripts/lib/learning-loop.mjs";
import { runPrecheck } from "../scripts/lib/precheck-core.mjs";
import { crystallizeMisaSkills } from "../scripts/lib/skill-crystallization.mjs";
import {
  buildCommandInvocation,
  runMisaSelfRepair
} from "../scripts/lib/self-repair.mjs";
import { reviewGenericAgentContextDensity } from "../scripts/lib/genericagent-density.mjs";
import { reviewAdaptiveCandidateGate } from "../scripts/lib/adaptive-candidate-gate.mjs";
import { reviewSignalIntakeContract } from "../scripts/lib/signal-intake-contract.mjs";
import { reviewSignalCandidateRollup } from "../scripts/lib/signal-candidate-rollup.mjs";
import { evaluateMisaEvolution } from "../scripts/lib/evolution-evaluator.mjs";
import {
  distillLocalMisaSources,
  distillMisaSources
} from "../scripts/lib/session-distiller.mjs";
import {
  evaluateHermesMappingFixtures,
  loadHermesMappingFixtures,
  mapHermesDistillation
} from "../scripts/lib/hermes-distillation-mapper.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";
import {
  exportMinimalPositiveSkills,
  reviewMemoryLayerComparison
} from "../scripts/lib/memory-layer.mjs";
import {
  reviewRepairTickets,
  writeRepairTicketArtifacts
} from "../scripts/lib/repair-ticket.mjs";
import {
  buildWorkOrderRouting,
  routeWorkOrders,
  workOrderFromOperationalQualityReport,
  writeWorkOrderArtifacts
} from "../scripts/lib/work-order-router.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function runNpm(args) {
  const options = {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 20
  };
  if (process.platform === "win32") {
    return execFileAsync("cmd.exe", [
      "/d",
      "/c",
      "npm",
      ...args
    ], options);
  }
  return execFileAsync("npm", args, options);
}

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

test("routes overreaction boundaries to damping unless public behavior is involved", () => {
  const base = {
    event_id: "route-overreaction-boundary",
    channel: "local",
    summary: "Do not overreact to a single provider timeout.",
    evidence_count: 1,
    outcome: "partial",
    risk_level: "medium",
    redaction_status: "redacted",
    source_type: "redacted_realish",
    redaction_note: "test",
    setpoint: "hold one-off failures before changing runtime behavior",
    artifact_evidence: {
      injected: [],
      read: ["test:route"],
      modified: [],
      tool_errors: []
    },
    expected_route: "damping",
    expected_status: "held",
    expected_publication_mode: "no_publish",
    expected_candidate_state: "held",
    created_at: "2026-05-11T08:00:00Z"
  };

  const dampingTrace = simulateLearningCycle({
    ...base,
    signals: ["single_failure", "explicit_user_boundary"]
  });
  const policyTrace = simulateLearningCycle({
    ...base,
    event_id: "route-public-overreaction-boundary",
    summary: "Do not overreact, but keep public replies behind policy approval.",
    signals: ["single_failure", "explicit_user_boundary", "public_posting_boundary"]
  });
  const publicMemoryTrace = simulateLearningCycle({
    ...base,
    event_id: "route-public-memory-risk-boundary",
    summary: "Do not overreact when public memory risk appears.",
    signals: ["single_failure", "farcaster_public_memory_risk"]
  });
  const publicMemoryAvoidTrace = simulateLearningCycle({
    ...base,
    event_id: "route-public-memory-avoid-overreaction-boundary",
    summary: "Avoid overreaction but keep public memory risk behind policy.",
    signals: ["avoid_overreaction", "farcaster_public_memory_risk"]
  });

  assert.equal(dampingTrace.route.target, "damping");
  assert.equal(dampingTrace.result.status, "held");
  assert.equal(policyTrace.route.target, "policy");
  assert.equal(policyTrace.route.publication_mode, "requires_approval");
  assert.equal(publicMemoryTrace.route.target, "policy");
  assert.equal(publicMemoryTrace.route.publication_mode, "requires_approval");
  assert.equal(publicMemoryAvoidTrace.route.target, "policy");
  assert.equal(publicMemoryAvoidTrace.route.publication_mode, "requires_approval");
});

test("public memory risk blocks reusable workflow skill export", async () => {
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-public-memory-risk-source-"));
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-public-memory-risk-export-"));

  try {
    await fs.writeFile(path.join(sourceRoot, "public-memory-risk.json"), `${JSON.stringify({
      schema_version: "misa.local_distillation_source.v1",
      source_id: "public-memory-risk-workflow",
      source_kind: "farcaster_audit",
      channel: "farcaster",
      created_at: "2026-05-11T08:10:00Z",
      local_only: true,
      uses_zilliz_proxy: false,
      vector_lookup_required: false,
      raw_window_default: false,
      redaction_status: "redacted",
      redaction_note: "Synthetic public memory risk source for routing regression.",
      summary: "A reusable workflow mentions private memory risk in a public reply context.",
      setpoint: "keep public memory risk behind policy instead of exporting a skill",
      evidence_count: 2,
      outcome: "success",
      risk_level: "high",
      source_refs: ["test:public-memory-risk"],
      signals: ["reusable_workflow", "farcaster_public_memory_risk"],
      artifact_evidence: {
        injected: [],
        read: ["test:public-memory-risk"],
        modified: [],
        tool_errors: []
      },
      turns: [
        {
          speaker: "test",
          ref: "test:public-memory-risk:turn:1",
          text: [
            "Reusable workflow: inspect the public reply draft, compare it with the source refs,",
            "check whether private Discord memory or owner-only context could leak into a public Farcaster reply,",
            "keep the candidate behind policy review, and only record local evidence for later repair.",
            "This must not become an installable skill because public memory risk is stronger than the workflow signal."
          ].join(" ")
        }
      ]
    }, null, 2)}\n`, "utf8");

    const review = await reviewMemoryLayerComparison({
      repoRoot: process.cwd(),
      sourceDir: sourceRoot
    });
    const exported = await exportMinimalPositiveSkills({
      repoRoot: process.cwd(),
      sourceDir: sourceRoot,
      outDir: outRoot
    });

    assert.equal(review.ok, true);
    assert.equal(review.layers.l2_candidates.route_counts.policy, 1);
    assert.equal(review.minimal_positive_l3.skill_count, 0);
    assert.equal(review.layers.l1_distillates.atomic_lesson_count, 1);
    assert.equal(review.layers.l2_candidates.mixed_route_pressure.skill_signal_suppressed_count, 0);
    assert.equal(exported.ok, true);
    assert.equal(exported.exported_count, 0);
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(outRoot, { recursive: true, force: true });
  }
});

test("atomic lesson splitter recovers skill lessons from compound windows", async () => {
  const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-compound-lesson-source-"));
  const outRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-compound-lesson-export-"));
  const source = {
    schema_version: "misa.local_distillation_source.v1",
    source_id: "compound-policy-damping-skill-window",
    source_kind: "chat_window",
    channel: "local",
    created_at: "2026-05-11T08:20:00Z",
    local_only: true,
    uses_zilliz_proxy: false,
    vector_lookup_required: false,
    raw_window_default: false,
    redaction_status: "redacted",
    redaction_note: "Synthetic compound source for atomic lesson splitter regression.",
    summary: "A historical window mixed a reusable validation workflow, a single timeout, and a public memory boundary.",
    setpoint: "split compound history into route-specific lessons before export",
    evidence_count: 4,
    outcome: "partial",
    risk_level: "high",
    source_refs: ["history:compound-window"],
    signals: [
      "reusable_workflow",
      "single_failure",
      "explicit_user_boundary",
      "public_posting_boundary",
      "farcaster_public_memory_risk",
      "stable_project_fact"
    ],
    artifact_evidence: {
      injected: [],
      read: ["history:compound-window"],
      modified: [],
      tool_errors: ["tool:single-provider-timeout"]
    },
    turns: [
      {
        speaker: "history",
        ref: "history:compound:policy",
        text: "Policy boundary: private Discord memory must not leak into public Farcaster replies."
      },
      {
        speaker: "history",
        ref: "history:compound:damping",
        text: "Single provider timeout was transient; hold the evidence before any provider redesign."
      },
      {
        speaker: "history",
        ref: "history:compound:skill",
        text: "Reusable workflow: after cybernetic gate changes, run validate:schemas, precheck, npm test, and git diff check before handoff."
      }
    ]
  };

  try {
    await fs.writeFile(path.join(sourceRoot, "compound-window.json"), `${JSON.stringify(source, null, 2)}\n`, "utf8");

    const distillation = await distillMisaSources([source], { requireTemplateCoverage: false });
    const review = await reviewMemoryLayerComparison({
      repoRoot: process.cwd(),
      sourceDir: sourceRoot
    });
    const exported = await exportMinimalPositiveSkills({
      repoRoot: process.cwd(),
      sourceDir: sourceRoot,
      outDir: outRoot
    });
    const routes = new Set(distillation.learning_events.map((event) => event.expected_route));
    const skillEvent = distillation.learning_events.find((event) => event.expected_route === "skill");
    const policyEvent = distillation.learning_events.find((event) => event.expected_route === "policy");

    assert.equal(distillation.ok, true);
    assert.equal(distillation.lesson_splitter.compound_source_count, 1);
    assert.equal(distillation.lesson_splitter.route_counts.skill, 1);
    assert.equal(distillation.lesson_splitter.route_counts.policy, 1);
    assert.equal(distillation.lesson_splitter.route_counts.damping, 1);
    assert.deepEqual([...routes].sort(), ["damping", "policy", "skill"]);
    assert.ok(skillEvent);
    assert.equal(skillEvent.lesson_scope, "atomic");
    assert.equal(skillEvent.signals.includes("farcaster_public_memory_risk"), false);
    assert.ok(policyEvent);
    assert.equal(policyEvent.signals.includes("farcaster_public_memory_risk"), true);
    assert.equal(review.ok, true);
    assert.equal(review.layers.l2_candidates.route_counts.skill, 1);
    assert.equal(review.layers.l2_candidates.route_counts.policy, 1);
    assert.equal(review.layers.l2_candidates.route_counts.damping, 1);
    assert.equal(review.minimal_positive_l3.skill_count, 1);
    assert.equal(review.minimal_positive_l3.non_skill_promoted_count, 0);
    assert.equal(exported.ok, true);
    assert.equal(exported.exported_count, 1);
    assert.equal(exported.exports[0].route_target, "skill");
  } finally {
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.rm(outRoot, { recursive: true, force: true });
  }
});

test("repository dry-run precheck passes", async () => {
  const result = await runPrecheck();

  assert.equal(result.mode, "dry-run");
  assert.equal(result.ok, true);
});

test("Misa skill crystallization stays read-only and indexed", async () => {
  const result = await crystallizeMisaSkills();
  const candidateIds = new Set(result.candidates.map((candidate) => candidate.candidate_id));

  assert.equal(result.mode, "read-only-crystallization");
  assert.equal(result.ok, true);
  assert.equal(result.index.skill_candidates, 3);
  assert.equal(candidateIds.size, result.candidates.length);
  assert.equal(result.index.publication_allowed, false);
  assert.equal(Object.values(result.index.live_effects).some(Boolean), false);

  for (const candidate of result.candidates) {
    assert.equal(candidate.route.target, "skill");
    assert.equal(candidate.proposed_skill.target_surface, "draft_skill");
    assert.equal(candidate.quality.ready_for_draft, true);
    assert.equal(candidate.quality.ready_for_publish, false);
    assert.equal(candidate.self_repair.allowed, true);
    assert.equal(candidate.safety.publication_allowed, false);
    assert.equal(Object.values(candidate.safety.live_effects).some(Boolean), false);
    assert.ok(candidate.verification_commands.includes("npm run self-repair:misa -- --no-verify"));
    assert.ok(candidate.verification_commands.includes("npm run distill:misa"));
    assert.ok(candidate.verification_commands.includes("npm run density:misa"));
    assert.ok(candidate.verification_commands.includes("npm run adaptive:misa"));
    assert.ok(candidate.verification_commands.includes("npm run intake:misa"));
    assert.ok(candidate.verification_commands.includes("npm run rollup:misa"));
    assert.ok(candidate.verification_commands.includes("npm run evolution:evaluate:misa"));
    assert.ok(candidate.verification_commands.includes("npm run crystallize:misa"));
  }
});

test("v0.13 distills local windows with a local vector index and no Zilliz proxy", async () => {
  const result = await distillLocalMisaSources();
  const events = await loadMisaLearningEvents();
  const sourceKinds = new Set(result.distillates.map((item) => item.source_kind));
  const distilledEvent = result.learning_events.find(
    (event) => event.event_id === "misa-distilled-local-window-zilliz-boundary-005"
  );

  assert.equal(result.mode, "local-session-distillation");
  assert.equal(result.ok, true);
  assert.ok(result.summary.source_count >= 3);
  assert.equal(result.summary.source_count, result.summary.learning_event_count);
  assert.equal(result.summary.zilliz_proxy_used, false);
  assert.equal(result.summary.local_vector_index_used, true);
  assert.equal(result.summary.vector_store_backend, "local-token-vector-v1");
  assert.equal(result.summary.vector_lookup_required, false);
  assert.equal(result.summary.raw_window_default, false);
  assert.ok(result.summary.segment_count >= result.summary.source_count);
  assert.equal(result.summary.llm_api_calls, 0);
  assert.equal(result.summary.external_api_calls, 0);
  assert.equal(result.safety.production_authority, false);
  assert.deepEqual([...sourceKinds].sort(), ["chat_window", "failure_log", "farcaster_audit"]);
  assert.equal(result.distillates.every((item) => item.input_policy.uses_zilliz_proxy === false), true);
  assert.equal(result.distillates.every((item) => item.input_policy.local_vector_index === true), true);
  assert.equal(result.distillates.every((item) => item.local_vector_index.backend === "local-token-vector-v1"), true);
  assert.equal(result.distillates.every((item) => item.local_vector_index.uses_zilliz_proxy === false), true);
  assert.equal(result.distillates.every((item) => item.input_policy.llm_api_calls === 0), true);
  assert.ok(distilledEvent);
  assert.equal(distilledEvent.expected_route, "memory");
  assert.equal(events.some((event) => event.event_id === distilledEvent.event_id), true);
});

test("v0.15 maps Hermes/Zilliz distillation artifacts into Qianxuesen local inputs without API calls", async () => {
  const fixtures = await loadHermesMappingFixtures();

  assert.equal(fixtures.length, 5);

  for (const fixture of fixtures) {
    const expectedPath = path.join(
      process.cwd(),
      "examples",
      "hermes-distillation-mapping",
      `${fixture.fixture_id}.expected.json`
    );
    const expected = JSON.parse(await fs.readFile(expectedPath, "utf8"));
    const result = await mapHermesDistillation(fixture.input);
    const schemaCheck = await validateJsonData({
      repoRoot: process.cwd(),
      schemaRel: "schemas/hermes_distillation_mapping.schema.json",
      data: result,
      name: `validate ${fixture.fixture_id}`
    });

    assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
    assert.deepEqual(result.expectation_summary, expected);
    assert.equal(result.summary.llm_api_calls, 0);
    assert.equal(result.summary.external_api_calls, 0);
    assert.equal(result.safety.ai_second_pass_enabled, false);
    assert.equal(result.safety.embedding_created, false);
    assert.equal(result.safety.zilliz_written, false);
    assert.equal(result.safety.production_journal_written, false);
    assert.equal(result.safety.writes_persistent_memory, false);
    assert.equal(result.safety.posts_publicly, false);
    assert.equal(result.safety.autonomous_execution_allowed, false);
    assert.equal(result.local_distillation_source.uses_zilliz_proxy, false);
    assert.equal(result.local_distillation_source.vector_lookup_required, false);
  }
});

test("v0.15 mapping routes quality, repair, missing evidence, and high risk through the right gates", async () => {
  const review = await evaluateHermesMappingFixtures();
  const byId = new Map(review.results.map((item) => [item.source.source_id, item]));

  assert.equal(review.ok, true);
  assert.equal(review.summary.fixture_count, 5);
  assert.equal(review.summary.llm_api_calls, 0);
  assert.equal(review.summary.external_api_calls, 0);

  const normal = byId.get("normal-summary");
  assert.equal(normal.routing.route_targets.includes("memory"), true);
  assert.equal(normal.routing.route_targets.includes("case"), true);
  assert.equal(normal.work_order, null);

  const farcaster = byId.get("farcaster-quality");
  assert.equal(farcaster.routing.suggested_executor, "persona_operator_agent");
  assert.equal(farcaster.work_order.category, "operator_quality");
  assert.equal(farcaster.work_order.auto_execute_allowed, false);
  assert.equal(farcaster.safety.posts_publicly, false);

  const repeated = byId.get("repeated-failure");
  assert.equal(repeated.routing.route_targets.includes("repair_ticket"), true);
  assert.equal(repeated.work_order.suggested_executor, "specialized_engineering_agent");
  assert.ok(repeated.work_order.reproduction_commands.length > 0);
  assert.ok(repeated.work_order.acceptance_criteria.length > 0);

  const missing = byId.get("missing-evidence");
  assert.equal(missing.evidence.evidence_status, "needs_evidence");
  assert.equal(missing.routing.routing_status, "blocked");
  assert.equal(missing.work_order, null);

  const highRisk = byId.get("high-risk");
  assert.deepEqual(highRisk.learning_events.map((event) => event.expected_route), ["policy"]);
  assert.equal(highRisk.routing.suggested_executor, "human_owner");
  assert.equal(highRisk.routing.audit_required, true);
  assert.equal(highRisk.routing.rollback_required, true);
  assert.equal(highRisk.work_order.auto_execute_allowed, false);
  assert.equal(highRisk.work_order.rollback_required, true);
});

test("custom historical source dirs do not require example template coverage", async () => {
  const source = {
    schema_version: "misa.local_distillation_source.v1",
    source_id: "history-single-chat-window",
    source_kind: "chat_window",
    channel: "local",
    created_at: "2026-05-11T08:00:00Z",
    local_only: true,
    uses_zilliz_proxy: false,
    vector_lookup_required: false,
    raw_window_default: false,
    redaction_status: "redacted",
    redaction_note: "Synthetic historical source for custom source-dir coverage behavior.",
    summary: "A repeatable local validation workflow exists in history.",
    setpoint: "turn repeatable local validation into a draft skill only after checks",
    evidence_count: 2,
    outcome: "success",
    risk_level: "low",
    source_refs: ["history:single"],
    signals: ["reusable_workflow", "stable_project_fact"],
    artifact_evidence: {
      injected: [],
      read: ["history:single"],
      modified: [],
      tool_errors: []
    },
    turns: [
      {
        speaker: "history",
        ref: "history:single:turn:1",
        text: "Reusable workflow: collect local evidence, validate schemas, run precheck, then hold for review."
      }
    ]
  };

  const strict = await distillMisaSources([source]);
  const relaxed = await distillMisaSources([source], { requireTemplateCoverage: false });

  assert.equal(strict.ok, false);
  assert.match(strict.violations.join("\n"), /cover chat windows, failure logs, and Farcaster audits/);
  assert.equal(relaxed.ok, true);
  assert.equal(relaxed.checks.some((check) => check.id === "covers_all_distillation_templates"), false);
  assert.equal(relaxed.summary.source_count, 1);
  assert.equal(relaxed.learning_events[0].expected_route, "skill");
});

test("GenericAgent context density review adopts logic and rejects runtime authority", async () => {
  const result = await reviewGenericAgentContextDensity();
  const byId = new Map(result.adaptations.map((item) => [item.id, item]));

  assert.equal(result.mode, "genericagent-context-density-review");
  assert.equal(result.ok, true);
  assert.ok(result.summary.overall_score >= 0.82);
  assert.equal(byId.get("contextual_information_density").status, "adopted");
  assert.equal(byId.get("layered_pointer_memory").status, "adopted");
  assert.equal(byId.get("genericagent_runtime_authority").status, "rejected");
  assert.equal(byId.get("autonomous_scheduler").status, "rejected");
  assert.ok(byId.get("genericagent_runtime_authority").blocked_operations.includes("production_skill_publication"));
  assert.equal(result.candidate_reviews.every((review) => review.decision === "positive"), true);
});

test("adaptive v0.8 widens candidates while keeping production locked", async () => {
  const result = await reviewAdaptiveCandidateGate();
  const bySource = new Map(result.candidates.map((candidate) => [candidate.source_event_id, candidate]));
  const failedReplay = bySource.get("misa-damping-candidate-replay-failed-003");

  assert.equal(result.mode, "adaptive-candidate-gate");
  assert.equal(result.ok, true);
  assert.equal(result.operator_safety_profile.candidate_generation, "wide");
  assert.equal(result.operator_safety_profile.production_authority, false);
  assert.ok(result.summary.generated_candidate_count > result.summary.skill_candidate_count);
  assert.ok(result.summary.validation_ready_count >= 6);
  assert.ok(result.summary.held_count >= 1);
  assert.ok(result.summary.rejected_count >= 1);
  assert.equal(result.candidates.every((candidate) => candidate.safety.production_authority === false), true);
  assert.equal(result.candidates.every((candidate) => candidate.safety.publication_allowed === false), true);
  assert.equal(result.candidates.every((candidate) => !Object.values(candidate.safety.live_effects).some(Boolean)), true);
  assert.ok(failedReplay);
  assert.equal(failedReplay.decision, "rejected");
  assert.equal(failedReplay.suppression.applied, true);

  for (const candidate of result.candidates.filter((item) => item.decision === "validation_ready")) {
    assert.equal(candidate.verification.enters_verification, true);
    assert.ok(candidate.verification.commands.includes("npm run distill:misa"));
    assert.ok(candidate.verification.commands.includes("npm run adaptive:misa"));
    assert.ok(candidate.verification.commands.includes("npm run intake:misa"));
    assert.ok(candidate.verification.commands.includes("npm run rollup:misa"));
    assert.ok(candidate.verification.commands.includes("npm run evolution:evaluate:misa"));
    assert.ok(candidate.safety_gates.some((gate) => gate.name === "production_authority" && gate.state === "blocked_by_design"));
  }
});

test("signal intake cadence separates half-hour scans from daily learning", () => {
  const result = reviewSignalIntakeContract();
  const byId = new Map(result.source_contracts.map((source) => [source.id, source]));
  const sessionSuccess = byId.get("session_distiller_success");
  const sessionFailure = byId.get("session_distiller_failure");
  const farcaster = byId.get("farcaster_behavior");

  assert.equal(result.mode, "signal-intake-contract");
  assert.equal(result.ok, true);
  assert.equal(result.cadence.signal_scan_interval_minutes, 30);
  assert.equal(result.cadence.learning_rollup_interval_hours, 24);
  assert.equal(sessionSuccess.read_policy.default_input, "distilled_summary");
  assert.equal(sessionSuccess.read_policy.full_raw_default, false);
  assert.equal(sessionSuccess.learning_policy.durable_learning_rollup, "daily");
  assert.equal(sessionFailure.learning_policy.durable_learning_rollup, "daily");
  assert.equal(sessionFailure.learning_policy.immediate_exception_queue, true);
  assert.equal(farcaster.learning_policy.durable_learning_rollup, "daily");
  assert.equal(result.cadence.farcaster_defense_mode, "per_candidate_reply");
  assert.equal(result.api_policy.farcaster_extra_judge_api_default, false);
  assert.equal(result.api_policy.engagement_is_not_quality_by_itself, true);
  assert.equal(result.safety.production_authority, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  assert.deepEqual(result.safety.blocked_operations, [
    "persistent_memory_write",
    "zilliz_replacement",
    "farcaster_publish",
    "skill_publication",
    "production_skill_installation",
    "session_mechanic_replacement",
    "timer_or_service_start",
    "provider_route_change"
  ]);
});

test("v0.10 signal rollup closes adapter queue and daily rollup locally", async () => {
  const result = await reviewSignalCandidateRollup();
  const adapters = new Map(result.signal_adapters.map((adapter) => [adapter.source_contract_id, adapter]));
  const readyItems = result.candidate_queue.items.filter((item) => item.queue_state === "ready_for_daily_rollup");

  assert.equal(result.mode, "signal-candidate-daily-rollup");
  assert.equal(result.ok, true);
  assert.equal(result.summary.adapted_signal_count, result.summary.queue_item_count);
  assert.ok(result.adapted_signals.some((signal) => signal.source_event_id === "misa-distilled-local-window-zilliz-boundary-005"));
  assert.ok(result.adapted_signals.some((signal) => signal.source_event_id === "misa-distilled-failure-log-provider-timeout-006"));
  assert.ok(result.adapted_signals.some((signal) => signal.source_event_id === "misa-distilled-farcaster-reply-audit-007"));
  assert.equal(result.daily_rollup.window_hours, 24);
  assert.ok(adapters.get("session_distiller_success").mapped_signal_count > 0);
  assert.ok(adapters.get("session_distiller_failure").mapped_signal_count > 0);
  assert.ok(adapters.get("farcaster_behavior").mapped_signal_count > 0);
  assert.ok(readyItems.length > 0);
  assert.equal(readyItems.every((item) => item.verification_commands.includes("npm run rollup:misa")), true);
  assert.equal(result.daily_rollup.durable_outputs.publication_allowed, false);
  assert.equal(result.daily_rollup.durable_outputs.writes_persistent_memory, false);
  assert.equal(result.safety.production_authority, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
});

test("v0.11 preflights optimization candidates before reporting to Huan", async () => {
  const result = await evaluateMisaEvolution();
  const realChat = result.optimization_candidates.find(
    (candidate) => candidate.source_event_id === "misa-skill-real-chat-evolution-eval-004"
  );
  const farcasterAudit = result.optimization_candidates.find(
    (candidate) => candidate.source_event_id === "misa-distilled-farcaster-reply-audit-007"
  );
  const heldClarification = result.optimization_candidates.find(
    (candidate) => candidate.candidate_hygiene.clarification.status === "hold_for_more_evidence"
  );

  assert.equal(result.mode, "candidate-preflight-local-simulation");
  assert.equal(result.ok, true);
  assert.deepEqual(result.sequence, [
    "signal_adapter",
    "candidate_queue",
    "daily_rollup",
    "optimization_candidate",
    "local_preflight",
    "report_queue_or_internal_ledger"
  ]);
  assert.equal(result.summary.real_chat_preflight_status, "preflight_passed");
  assert.ok(result.optimization_candidates.some(
    (candidate) => candidate.source_event_id === "misa-distilled-local-window-zilliz-boundary-005"
  ));
  assert.ok(result.summary.report_queue_count > 0);
  assert.ok(result.summary.report_queue_count <= result.summary.report_queue_limit);
  assert.ok(result.summary.held_count > 0);
  assert.ok(result.summary.suppressed_count > 0);
  assert.ok(realChat);
  assert.equal(realChat.route_target, "skill");
  assert.equal(realChat.local_preflight.status, "preflight_passed");
  assert.equal(realChat.local_preflight.report_to_huan, true);
  assert.equal(realChat.local_preflight.simulated_before_report, true);
  assert.equal(realChat.candidate_hygiene.reportable, true);
  assert.equal(realChat.candidate_hygiene.verdict, "passes_hygiene");
  assert.equal(realChat.candidate_hygiene.role, "candidate hygiene gate, not a new workflow");
  assert.ok(realChat.candidate_hygiene.source_adaptations.some((adaptation) => (
    adaptation.source === "mattpocock/skills"
      && adaptation.borrowed.includes("answer from codebase evidence before asking the user")
      && adaptation.rejected.includes("new CONTEXT.md or ADR system")
  )));
  assert.equal(realChat.candidate_hygiene.principles.length, 5);
  assert.equal(realChat.candidate_hygiene.task_gate.length, 4);
  assert.equal(realChat.candidate_hygiene.principles.every((principle) => principle.ok), true);
  assert.equal(realChat.candidate_hygiene.task_gate.every((question) => question.ok), true);
  assert.equal(realChat.candidate_hygiene.clarification.mode, "codebase_first_decision_tree");
  assert.equal(realChat.candidate_hygiene.clarification.status, "resolved_by_evidence");
  assert.equal(realChat.candidate_hygiene.clarification.codebase_answered.length, 4);
  assert.equal(realChat.candidate_hygiene.clarification.open_questions.length, 0);
  assert.equal(realChat.candidate_hygiene.clarification.needs_huan_answer.length, 0);
  assert.equal(realChat.candidate_hygiene.clarification.recommended_next_question, null);
  assert.equal(realChat.candidate_hygiene.terminology.status, "aligned");
  assert.equal(realChat.candidate_hygiene.terminology.conflicts.length, 0);
  assert.ok(farcasterAudit);
  assert.equal(farcasterAudit.candidate_hygiene.terminology.status, "surface_term_aligned");
  assert.equal(farcasterAudit.candidate_hygiene.terminology.conflicts.length, 0);
  assert.ok(heldClarification);
  assert.ok(heldClarification.candidate_hygiene.clarification.recommended_next_question);
  assert.equal(heldClarification.candidate_hygiene.clarification.needs_huan_answer.length, 0);
  assert.equal(result.summary.hygiene_reportable_count, result.summary.preflight_passed_count);
  assert.equal(result.report_queue.every((report) => report.allowed_next_step === "human_review_only"), true);
  assert.equal(result.report_queue.every((report) => report.hygiene_verdict === "passes_hygiene"), true);
  assert.equal(result.report_queue.every((report) => report.clarification_status === "resolved_by_evidence"), true);
  assert.equal(result.report_queue.every((report) => report.next_unresolved_question === null), true);
  assert.equal(result.report_queue.every((report) => ["aligned", "surface_term_aligned"].includes(report.terminology_status)), true);
  assert.equal(
    result.optimization_candidates
      .filter((candidate) => candidate.local_preflight.status !== "preflight_passed")
      .every((candidate) => candidate.local_preflight.report_to_huan === false),
    true
  );
  assert.equal(
    result.optimization_candidates
      .filter((candidate) => candidate.local_preflight.report_to_huan)
      .every((candidate) => candidate.candidate_hygiene.reportable),
    true
  );
  assert.ok(result.optimization_candidates.some(
    (candidate) => candidate.candidate_hygiene.verdict === "hold_or_reduce_scope"
  ));
  assert.ok(result.experience_ledger.length > 0);
  assert.equal(result.optimization_candidates.length, result.source.queue_item_count);
  assert.equal(result.safety.production_authority, false);
  assert.equal(result.safety.publication_allowed, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
});

test("memory layer comparison rejects broad automatic L3 promotion", async () => {
  const result = await reviewMemoryLayerComparison();

  assert.equal(result.mode, "memory-layer-comparison");
  assert.equal(result.ok, true);
  assert.ok(result.layers.l0_sources.raw_token_estimate > result.layers.l1_distillates.distillate_token_estimate);
  assert.ok(result.layers.l1_distillates.compression_ratio < 1);
  assert.ok(result.layers.l2_candidates.mixed_route_pressure);
  assert.ok(result.layers.l2_candidates.mixed_route_pressure.mixed_count >= 1);
  assert.ok(result.original_auto_l3.non_skill_promoted_count > 0);
  assert.equal(result.minimal_positive_l3.non_skill_promoted_count, 0);
  assert.equal(result.comparison.verdict, "minimal_positive_is_safer");
  assert.equal(result.export_policy.installs_skills, false);
  assert.equal(result.export_policy.writes_persistent_memory, false);
  assert.equal(result.export_policy.updates_vps, false);
});

test("export-skills writes only minimal positive local drafts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-skill-export-"));

  try {
    const result = await exportMinimalPositiveSkills({
      repoRoot: process.cwd(),
      outDir: tempRoot
    });

    assert.equal(result.mode, "minimal-positive-skill-export");
    assert.equal(result.ok, true);
    assert.equal(result.safety.publication_allowed, false);
    assert.equal(result.safety.installs_skills, false);
    assert.equal(result.safety.writes_persistent_memory, false);
    assert.equal(result.safety.updates_vps, false);

    const manifest = JSON.parse(await fs.readFile(path.join(tempRoot, "manifest.json"), "utf8"));
    assert.equal(manifest.exported_count, result.exported_count);
    assert.equal(manifest.exports.every((item) => item.route_target === "skill"), true);
    assert.equal(manifest.exports.every((item) => item.publication_allowed === false), true);
    assert.equal(manifest.exports.every((item) => item.installation_allowed === false), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("repair-ticket queue converts over-promotion evidence into Codex-ready tickets", async () => {
  const result = await reviewRepairTickets();
  const actualBadPromotions = result.tickets.reduce((sum, ticket) => sum + ticket.bad_promotions.length, 0);

  assert.equal(result.mode, "repair-ticket-review");
  assert.equal(result.ok, true);
  assert.equal(result.safety.publication_allowed, false);
  assert.equal(result.safety.installs_skills, false);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.updates_vps, false);
  assert.equal(result.safety.touches_runtime, false);
  assert.ok(result.summary.ticket_count >= 1);
  assert.ok(result.summary.bad_promotion_count >= 1);
  assert.equal(result.summary.bad_promotion_count, actualBadPromotions);
  assert.equal(result.summary.minimal_non_skill_promoted_count, 0);

  const ticket = result.tickets[0];
  assert.match(ticket.ticket_id, /auto-l3-overpromotion/);
  assert.match(ticket.title, /Auto-L3 non-skill promotion from local distillation sources/);
  assert.match(ticket.problem_statement, /local design\/regression risk/);
  assert.match(ticket.problem_statement, /not a live production incident/);
  assert.ok(["P1", "P2"].includes(ticket.severity));
  assert.equal(ticket.status, "repair_candidate");
  assert.ok(ticket.bad_promotions.length >= 1);
  assert.ok(ticket.bad_promotions.every((item) => item.wrong_route_promoted_as_skill !== "skill"));
  assert.ok(ticket.reproduction_commands.some((command) => command.includes("memory-layer:misa")));
  assert.ok(ticket.reproduction_commands.some((command) => command.includes("repair-ticket:misa")));
  assert.ok(ticket.acceptance_criteria.includes("minimal_positive_l3.non_skill_promoted_count == 0"));
  assert.ok(ticket.acceptance_criteria.includes("every exported skill has route_target == skill"));
  assert.ok(ticket.codex_scope.may_edit.includes("scripts/lib/repair-ticket.mjs"));
  assert.ok(ticket.non_goals.includes("Do not write persistent memory."));
  assert.ok(ticket.repair_tasks.must_fix.includes("Non-skill routes must never export as L3 skills."));
});

test("repair-ticket example keeps summary counts aligned with ticket details", async () => {
  const example = JSON.parse(await fs.readFile(
    path.join(process.cwd(), "examples", "repair_ticket.example.json"),
    "utf8"
  ));
  const actualBadPromotions = example.tickets.reduce((sum, ticket) => sum + ticket.bad_promotions.length, 0);
  const actualRepairCandidates = example.tickets.filter((ticket) => ticket.status !== "observe_only").length;
  const actualSeverityCounts = example.tickets.reduce((counts, ticket) => {
    counts[ticket.severity] = (counts[ticket.severity] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(example.summary.ticket_count, example.tickets.length);
  assert.equal(example.summary.bad_promotion_count, actualBadPromotions);
  assert.equal(example.summary.repair_candidate_count, actualRepairCandidates);
  assert.deepEqual(example.summary.severity_counts, actualSeverityCounts);
});

test("repair-ticket artifacts write JSON and Markdown without runtime effects", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-repair-ticket-"));

  try {
    const review = await reviewRepairTickets({
      now: new Date("2026-05-11T02:00:00Z")
    });
    const written = await writeRepairTicketArtifacts({
      review,
      outDir: tempRoot,
      now: new Date("2026-05-11T02:00:00Z")
    });

    assert.equal(written.output.output_dir, tempRoot);
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "repair-ticket-review");
    assert.equal(persisted.safety.writes_persistent_memory, false);
    assert.equal(persisted.safety.installs_skills, false);
    assert.match(markdown, /# Misa Repair Tickets/);
    assert.match(markdown, /### Acceptance/);
    assert.match(markdown, /Do not update VPS/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("work-order routing sends repair tickets through primary-agent user choice", async () => {
  const repairTickets = await reviewRepairTickets({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(result.mode, "work-order-routing");
  assert.equal(result.ok, true);
  assert.equal(result.routing_policy.mode, "ask_before_execution");
  assert.equal(result.safety.auto_execute_allowed, false);
  assert.equal(result.safety.primary_agent_must_report_first, true);
  assert.equal(result.summary.work_order_count, repairTickets.tickets.length);
  assert.equal(result.summary.requires_user_confirmation_count, result.summary.work_order_count);
  assert.equal(result.summary.auto_executable_count, 0);

  const order = result.work_orders[0];
  assert.equal(order.delivery.receiver_type, "primary_agent");
  assert.equal(order.delivery.delivery_policy, "report_to_user_before_execution");
  assert.equal(order.suggested_executor.executor_type, "specialized_engineering_agent");
  assert.equal(order.execution_policy.requires_user_confirmation, true);
  assert.equal(order.execution_policy.auto_execute_allowed, false);
  assert.equal(order.execution_policy.durable_or_public_effect_allowed, false);
  assert.equal(order.escalation.user_can_decline_execution, true);
  assert.equal(order.model_handoff.stronger_model_recommended, true);
  assert.match(order.model_handoff.reason, /Durable or public effects remain blocked/);
  assert.ok(order.source_refs.some((ref) => ref.kind === "repair_ticket"));
  assert.ok(order.traceability.acceptance_criteria.includes("minimal_positive_l3.non_skill_promoted_count == 0"));
  assert.match(order.user_prompt, /I received a work order/);
  assert.match(order.user_prompt, /minimal-positive mode already blocked the bad export/);
});

test("work-order routing policy can allow only bounded low-risk autonomous work", () => {
  const report = {
    schema: "misa.hermes.farcaster.daily_report.v1",
    report_date: "2026-05-12",
    counts: {
      outcomes_considered: 4
    },
    operator_quality: {
      schema: "misa.hermes.farcaster.operator_quality.v1",
      verdict: "healthy",
      recommendations: [
        "operator quality looks steady; keep current soft-presence settings"
      ]
    }
  };

  const result = buildWorkOrderRouting({
    operationalReports: [report],
    routingPolicy: {
      mode: "agent_autonomous_low_risk",
      auto_execute_allowed: true,
      max_auto_severity: "P3",
      auto_execute_categories: ["operator_quality"]
    },
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(result.routing_policy.mode, "agent_autonomous_low_risk");
  assert.equal(result.safety.auto_execute_allowed, true);
  assert.equal(result.summary.auto_executable_count, 1);

  const order = result.work_orders[0];
  assert.equal(order.category, "operator_quality");
  assert.equal(order.severity, "P3");
  assert.equal(order.delivery.delivery_policy, "notify_then_execute_within_scope");
  assert.equal(order.execution_policy.requires_user_confirmation, false);
  assert.equal(order.execution_policy.auto_execute_allowed, true);
  assert.equal(order.execution_policy.default_next_step, "execute_within_scope");
  assert.equal(order.execution_policy.durable_or_public_effect_allowed, false);
  assert.equal(order.model_handoff.stronger_model_recommended, false);
});

test("work-order routing maps operator quality to persona self-review instead of engineering", () => {
  const report = {
    schema: "misa.hermes.farcaster.daily_report.v1",
    report_date: "2026-05-12",
    counts: {
      outcomes_considered: 12,
      blocked_transitions: 2
    },
    operator_quality: {
      schema: "misa.hermes.farcaster.operator_quality.v1",
      verdict: "tighten",
      recommendations: [
        "lower priority for repeated author/thread/topic before the next cycle",
        "quality brakes are active; inspect blocks before loosening thresholds"
      ]
    }
  };

  const order = workOrderFromOperationalQualityReport(report, {
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(order.category, "operator_quality");
  assert.equal(order.severity, "P1");
  assert.equal(order.delivery.receiver_type, "primary_agent");
  assert.equal(order.suggested_executor.executor_type, "persona_operator_agent");
  assert.equal(order.execution_policy.self_evolution_allowed, true);
  assert.equal(order.execution_policy.auto_execute_allowed, false);
  assert.ok(order.traceability.forbidden_scope.includes("live publisher"));
  assert.match(order.user_prompt, /hand it to a stronger model/);
});

test("work-order artifacts write traceable JSON and Markdown without execution", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-work-orders-"));

  try {
    const result = await routeWorkOrders({
      now: new Date("2026-05-12T00:00:00Z")
    });
    const written = await writeWorkOrderArtifacts({
      routing: result,
      outDir: tempRoot,
      now: new Date("2026-05-12T00:00:00Z")
    });

    assert.equal(written.output.output_dir, tempRoot);
    const persisted = JSON.parse(await fs.readFile(written.output.json_path, "utf8"));
    const markdown = await fs.readFile(written.output.markdown_path, "utf8");

    assert.equal(persisted.mode, "work-order-routing");
    assert.equal(persisted.safety.auto_execute_allowed, false);
    assert.equal(persisted.safety.durable_or_public_effect_allowed, false);
    assert.match(markdown, /# Work Order Routing/);
    assert.match(markdown, /### User Prompt/);
    assert.match(markdown, /### Traceability/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("npm-launched JSON handoff writes clean out-file artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-json-handoff-"));
  const repairTicketPath = path.join(tempRoot, "repair-ticket.json");
  const workOrderPath = path.join(tempRoot, "work-orders.json");

  try {
    await runNpm([
      "run",
      "repair-ticket:misa",
      "--",
      "--json",
      "--dry-run",
      "--out-file",
      repairTicketPath
    ]);

    const repairTicketReview = JSON.parse(await fs.readFile(repairTicketPath, "utf8"));
    assert.equal(repairTicketReview.mode, "repair-ticket-review");
    assert.equal(repairTicketReview.ok, true);

    await runNpm([
      "run",
      "work-order:route",
      "--",
      "--repair-ticket-file",
      repairTicketPath,
      "--json",
      "--dry-run",
      "--out-file",
      workOrderPath
    ]);

    const workOrderRouting = JSON.parse(await fs.readFile(workOrderPath, "utf8"));
    assert.equal(workOrderRouting.mode, "work-order-routing");
    assert.equal(workOrderRouting.ok, true);
    assert.equal(workOrderRouting.summary.work_order_count, repairTicketReview.tickets.length);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("repair-ticket review flags npm-banner-polluted machine JSON artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-json-contract-"));
  const pollutedPath = path.join(tempRoot, "repair-ticket.polluted.json");

  try {
    await fs.writeFile(
      pollutedPath,
      [
        "> misa-cybernetic-evolution@0.15.0 repair-ticket:misa",
        "> node scripts/repair-ticket.mjs --json --dry-run",
        "",
        "{\"mode\":\"repair-ticket-review\",\"ok\":true}"
      ].join("\n"),
      "utf8"
    );

    const result = await reviewRepairTickets({
      jsonHandoffFiles: [pollutedPath],
      now: new Date("2026-05-12T00:00:00Z")
    });

    const ticket = result.tickets.find((item) => item.source_kind === "json_handoff_contract");
    assert.ok(ticket);
    assert.equal(ticket.severity, "P2");
    assert.equal(ticket.status, "repair_candidate");
    assert.equal(ticket.evidence.issue_code, "npm_lifecycle_banner_before_json");
    assert.match(ticket.problem_statement, /strict JSON/);
    assert.ok(ticket.acceptance_criteria.includes("machine JSON artifacts parse with JSON.parse without stripping text"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("work-order routing reports contaminated repair-ticket files as JSON handoff work orders", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-json-contract-route-"));
  const pollutedPath = path.join(tempRoot, "repair-ticket.polluted.json");
  const outPath = path.join(tempRoot, "work-orders.json");

  try {
    const repairTicketReview = await reviewRepairTickets({
      now: new Date("2026-05-12T00:00:00Z")
    });
    await fs.writeFile(
      pollutedPath,
      [
        "> misa-cybernetic-evolution@0.15.0 repair-ticket:misa",
        "> node scripts/repair-ticket.mjs --json --dry-run",
        "",
        JSON.stringify(repairTicketReview, null, 2)
      ].join("\n"),
      "utf8"
    );

    await runNpm([
      "run",
      "work-order:route",
      "--",
      "--repair-ticket-file",
      pollutedPath,
      "--json",
      "--dry-run",
      "--out-file",
      outPath
    ]);

    const routing = JSON.parse(await fs.readFile(outPath, "utf8"));
    assert.equal(routing.mode, "work-order-routing");
    assert.equal(routing.ok, true);
    assert.equal(routing.summary.work_order_count, 1);

    const order = routing.work_orders[0];
    assert.match(order.work_order_id, /^wo-repair-json-handoff-contract-/);
    assert.equal(order.source.source_kind, "json_handoff_contract");
    assert.equal(order.severity, "P2");
    assert.equal(order.category, "engineering_repair");
    assert.equal(order.execution_policy.requires_user_confirmation, true);
    assert.equal(order.execution_policy.auto_execute_allowed, false);
    assert.equal(order.traceability.evidence.issue_code, "npm_lifecycle_banner_before_json");
    assert.match(order.summary, /machine JSON artifact is not strict JSON/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("Misa self repair writes draft artifacts without production effects", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-self-repair-"));

  try {
    const result = await runMisaSelfRepair({
      repoRoot: process.cwd(),
      candidateId: "skill-candidate-misa-skill-recovery-workflow-001",
      runRoot: path.join(tempRoot, "runs", "self-repair"),
      generatedRoot: path.join(tempRoot, "generated", "skill-drafts"),
      repairPlanRoot: path.join(tempRoot, "generated", "repair-plans"),
      verify: false,
      now: new Date("2026-05-11T01:30:00Z")
    });

    assert.equal(result.mode, "self-repair-draft");
    assert.equal(result.ok, true);
    assert.equal(result.candidate_count, 1);
    assert.equal(result.safety.publication_allowed, false);
    assert.equal(result.safety.writes_persistent_memory, false);
    assert.equal(result.safety.touches_runtime, false);

    const run = result.runs[0];
    assert.equal(run.status, "draft_generated");
    assert.equal(run.needs_human_review, true);
    assert.equal(run.commands.length, 0);
    assert.ok(run.generated_files.some((file) => file.endsWith("misa-hermes-recovery-refinement.md")));

    const draftPath = path.join(tempRoot, "generated", "skill-drafts", "misa-hermes-recovery-refinement.md");
    const reportPath = path.join(tempRoot, "runs", "self-repair", run.run_id, "final-report.json");
    const draft = await fs.readFile(draftPath, "utf8");
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));

    assert.match(draft, /publication_allowed: false/);
    assert.match(draft, /state: draft_generated/);
    assert.match(draft, /Do not write persistent memory/);
    assert.doesNotMatch(draft, /[ \t]+$/m);
    assert.equal(report.status, "draft_generated");
    assert.equal(report.safety.requires_human_publish_approval, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("Misa self repair validation mode keeps drafts under ignored run roots", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-self-repair-validation-"));

  try {
    const result = await runMisaSelfRepair({
      repoRoot: process.cwd(),
      candidateId: "skill-candidate-misa-skill-recovery-workflow-001",
      runRoot: path.join(tempRoot, "runs", "self-repair-validation"),
      validationMode: true,
      verify: false,
      now: new Date("2026-05-11T01:32:00Z")
    });

    assert.equal(result.ok, true);
    assert.equal(result.validation_mode, true);

    const run = result.runs[0];
    assert.ok(run.generated_files.every((file) => file.startsWith(path.relative(process.cwd(), tempRoot).split(path.sep).join("/"))));
    assert.ok(run.generated_files.every((file) => file.includes("/runs/self-repair-validation/")));
    assert.ok(run.generated_files.every((file) => !file.startsWith("generated/")));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("self repair trims generated draft and repair-plan titles", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-self-repair-trim-"));

  try {
    const result = await runMisaSelfRepair({
      repoRoot: process.cwd(),
      candidateId: "skill-candidate-misa-skill-real-chat-evolution-eval-004",
      runRoot: path.join(tempRoot, "runs", "self-repair"),
      generatedRoot: path.join(tempRoot, "generated", "skill-drafts"),
      repairPlanRoot: path.join(tempRoot, "generated", "repair-plans"),
      verify: false,
      now: new Date("2026-05-11T01:35:00Z")
    });

    assert.equal(result.ok, true);
    const draftPath = path.join(tempRoot, "generated", "skill-drafts", "real-chat-evolution-eval-004.md");
    const planPath = path.join(tempRoot, "generated", "repair-plans", "skill-candidate-misa-skill-real-chat-evolution-eval-004.json");
    const draft = await fs.readFile(draftPath, "utf8");
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"));

    assert.doesNotMatch(draft.split("\n")[0], /[ \t]$/);
    assert.doesNotMatch(plan.proposed_skill.title, /[ \t]$/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("self repair verifier builds shell-free Windows npm invocations", () => {
  const command = {
    label: "validate:schemas",
    command: "npm run validate:schemas",
    args: ["run", "validate:schemas"]
  };
  const windows = buildCommandInvocation(command, "win32");
  const linux = buildCommandInvocation(command, "linux");

  assert.equal(windows.file, "cmd.exe");
  assert.deepEqual(windows.args, ["/d", "/c", "npm", "run", "validate:schemas"]);
  assert.equal(windows.shell, false);
  assert.equal(linux.file, "npm");
  assert.deepEqual(linux.args, ["run", "validate:schemas"]);
  assert.equal(linux.shell, false);
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

  assert.equal(fixtures.length, 12);
  assert.equal(redactedRealish.length, 6);
  assert.ok(redactedRealish.length <= 10);
  assert.equal(redactedRealish.every((fixture) => fixture.redaction_status === "redacted"), true);
});

test("Misa replay fixtures match declared route expectations", async () => {
  const fixtures = await loadMisaLearningFixtures();

  for (const fixture of fixtures) {
    const trace = simulateLearningCycle(fixture);

    assert.equal(trace.verification.level, "L1");
    assert.ok(trace.verification.commands.includes("npm run distill:misa"));
    assert.equal(trace.route.target, fixture.expected_route);
    assert.equal(trace.result.status, fixture.expected_status);
    assert.equal(trace.route.publication_mode, fixture.expected_publication_mode);
    assert.equal(trace.candidate_review.state, fixture.expected_candidate_state);
    assert.equal(trace.candidate_review.publication_allowed, false);
    assert.equal(Object.values(trace.result.live_effects).some(Boolean), false);
  }
});
