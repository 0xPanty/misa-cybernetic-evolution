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
  evaluateEvolutionTournamentGate,
  reviewEvolutionTournamentGate
} from "../scripts/lib/evolution-tournament-gate.mjs";
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
  reviewSkillPromotionCandidate,
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
import {
  buildLangGraphQianxuesenBridge,
  evaluateLangGraphQianxuesenBridge,
  reviewLangGraphQianxuesenBridge
} from "../scripts/lib/langgraph-qianxuesen-bridge.mjs";
import {
  buildVectorMemoryStoragePlan,
  reviewVectorMemoryStoragePlan
} from "../scripts/lib/vector-memory-storage.mjs";
import {
  buildZillizVectorAdapterPlan,
  reviewZillizVectorAdapterPlan
} from "../scripts/lib/zilliz-vector-adapter.mjs";
import {
  evaluateOmniAgentFootprintBridge,
  reviewOmniAgentFootprintBridge
} from "../scripts/lib/omniagent-footprint-bridge.mjs";
import { loadVpsConversationSources } from "../scripts/lib/vps-conversation-sources.mjs";
import {
  CHECKPOINTER_FIELDS,
  DEFAULT_STATE_INPUTS,
  GOVERNANCE_STAGES,
  INTERRUPT_DECISIONS,
  LLM_MUST_NOT
} from "../scripts/lib/langgraph-qianxuesen-contract.mjs";
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

test("v0.17 tournament gate optimizes candidates without production authority", async () => {
  const result = await reviewEvolutionTournamentGate();
  const winnerIds = new Set(result.winner_queue.map((winner) => winner.variant_id));

  assert.equal(result.mode, "evolution-tournament-gate");
  assert.equal(result.ok, true);
  assert.equal(result.tournament_policy.route_owner, "qianxuesen");
  assert.equal(result.tournament_policy.candidate_generation, "multi_variant_local");
  assert.equal(result.tournament_policy.winner_surface, "draft_recommendation_only");
  assert.equal(result.control_boundary.optimizer_role, "candidate_layer_only");
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);
  assert.equal(result.control_boundary.automatic_promotion_allowed, false);
  assert.equal(result.summary.tournament_count, result.source.report_queue_count);
  assert.ok(result.summary.variant_count >= result.summary.tournament_count * 3);
  assert.equal(result.summary.winner_count, result.summary.tournament_count);
  assert.ok(result.summary.rejected_variant_count >= result.summary.tournament_count);
  assert.equal(result.safety.production_authority, false);
  assert.equal(result.safety.publication_allowed, false);
  assert.equal(result.safety.automatic_write_allowed, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  assert.equal(result.judge_escalation.mode, "judge_escalation_gate.v1");
  assert.equal(result.judge_escalation.recommended, false);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.equal(result.judge_escalation.llm_api_calls, 0);
  assert.equal(result.judge_escalation.reasons.includes("null"), false);
  assert.equal(result.judge_escalation.llm_review_value.level, "none");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "do_not_call");
  assert.equal(result.judge_escalation.llm_review_value.should_change_winner, false);
  assert.equal(result.judge.mode, "advise");
  assert.equal(result.judge.status, "advice_only");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.equal(result.quality_assessment.llm_api_calls, 0);
  assert.equal(result.quality_comparison.status, "baseline_only");
  assert.ok(result.algorithm_adaptation.borrowed.includes("multi-variant candidate search"));
  assert.ok(result.algorithm_adaptation.rejected.includes("automatic memory writes"));
  assert.ok(result.rejected_variant_ledger.some((item) => (
    item.blocked_requests.includes("skill_publication")
  )));

  for (const tournament of result.tournaments) {
    assert.ok(winnerIds.has(tournament.winner.variant_id));
    assert.equal(tournament.winner.publication_allowed, false);
    assert.equal(tournament.winner.production_authority, false);
    assert.equal(tournament.variants.some((variant) => variant.tournament_status === "rejected"), true);

    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    assert.ok(winner);
    assert.equal(winner.constraints.hard_gate_passed, true);
    assert.equal(winner.route_target, tournament.route_target);
    assert.equal(typeof winner.scores.strategy_fit, "number");
    assert.equal(Object.values(winner.safety.live_effects).some(Boolean), false);
  }

  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("v0.17 tournament gate can compare source-backed VPS samples without LLM calls", async () => {
  const result = await reviewEvolutionTournamentGate({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source"
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.source_kind, "vps_sanitized_conversation_artifacts");
  assert.equal(result.source.vps_raw_dir, "test/fixtures/evolution/vps-real-conversation-source");
  assert.equal(result.summary.tournament_count, 3);
  assert.equal(result.summary.route_counts.skill, 1);
  assert.equal(result.summary.route_counts.case, 1);
  assert.equal(result.summary.route_counts.policy, 1);
  assert.equal(result.judge_escalation.recommended, true);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.ok(result.judge_escalation.score >= result.judge_escalation.threshold);
  assert.ok(result.judge_escalation.reasons.includes("real_vps_sample"));
  assert.ok(result.judge_escalation.reasons.includes("policy_skill_pressure"));
  assert.equal(result.judge_escalation.llm_review_value.level, "high");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "call_when_auto_enabled");
  assert.equal(result.judge_escalation.llm_review_value.waste_risk, "low");
  assert.ok(result.judge_escalation.llm_review_value.targets.some((target) => target.target === "public_boundary"));
  assert.equal(result.judge_escalation.reasons.includes("null"), false);
  assert.ok(result.judge_escalation.signals.winner_strategy_diversity >= 2);
  assert.equal(result.judge.mode, "advise");
  assert.equal(result.judge.status, "advice_only");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.equal(result.quality_assessment.llm_api_calls, 0);
  assert.ok(result.quality_assessment.overall_quality_score > 0.8);
  assert.equal(result.quality_comparison.decision_authority, "deterministic_qianxuesen_gate_only");
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("v0.17 tournament gate picks route-sensitive winners for compact fixture samples", async () => {
  const result = await reviewEvolutionTournamentGate({
    sourceDir: "test/fixtures/evolution/route-sensitive-sources"
  });
  const winnerStrategies = new Set(result.winner_queue.map((winner) => winner.strategy));

  assert.equal(result.ok, true);
  assert.equal(result.source.source_kind, "local_distillation_sources");
  assert.ok(result.summary.tournament_count >= 5);
  assert.ok(winnerStrategies.has("baseline"));
  assert.ok(winnerStrategies.has("trace_reflective"));
  assert.ok(winnerStrategies.has("pareto_compact"));
  assert.equal(result.tournaments.every((tournament) => (
    tournament.variants.every((variant) => typeof variant.scores.strategy_fit === "number")
  )), true);
  assert.equal(result.judge_escalation.recommended, true);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.equal(result.judge_escalation.llm_review_value.level, "high");
  assert.ok(result.judge_escalation.llm_review_value.targets.some((target) => target.target === "batch_pattern_review"));
  assert.equal(result.judge_escalation.signals.winner_strategy_monoculture, false);
  assert.equal(result.judge_escalation.reasons.includes("null"), false);
  assert.ok(result.judge_escalation.reasons.includes("large_batch_review"));
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("near-threshold judge samples stay deterministic but are surfaced", async () => {
  const result = await reviewEvolutionTournamentGate({
    sourceDir: "test/fixtures/evolution/judge-calibration-sources",
    judgeMode: "auto"
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge_escalation.recommended, false);
  assert.equal(result.judge_escalation.near_threshold, true);
  assert.equal(result.judge_escalation.llm_review_value.level, "medium");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "deterministic_default_review_optional");
  assert.equal(result.judge_escalation.llm_review_value.waste_risk, "medium");
  assert.equal(result.judge_escalation.suggested_mode, "deterministic_default_review_optional");
  assert.ok(result.judge_escalation.score < result.judge_escalation.threshold);
  assert.ok(result.judge_escalation.threshold_delta < 0);
  assert.ok(Math.abs(result.judge_escalation.threshold_delta) <= result.judge_escalation.near_threshold_margin);
  assert.ok(result.judge_escalation.reasons.includes("near_threshold"));
  assert.equal(result.judge.mode, "auto");
  assert.equal(result.judge.status, "skipped_not_recommended");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.ok(result.judge.notes.some((note) => note.includes("near threshold")));
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});

test("auto judge stays at zero calls when escalation gate says deterministic is enough", async () => {
  const result = await reviewEvolutionTournamentGate({
    judgeMode: "auto"
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge_escalation.recommended, false);
  assert.equal(result.judge_escalation.near_threshold, false);
  assert.equal(result.judge_escalation.llm_review_value.level, "none");
  assert.equal(result.judge_escalation.llm_review_value.call_policy, "do_not_call");
  assert.equal(result.judge.mode, "auto");
  assert.equal(result.judge.status, "skipped_not_recommended");
  assert.equal(result.judge.llm_api_calls, 0);
  assert.equal(result.quality_comparison.status, "baseline_only");
});

test("auto judge calls the optional reviewer only when escalation gate recommends it", async () => {
  const result = await reviewEvolutionTournamentGate({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source",
    judgeMode: "auto",
    judgeModel: "mock-judge",
    llmJudge: async () => ({
      overall_quality_score: 0.89,
      dimensions: {
        route_preservation: 1,
        safety_lock: 1,
        holdout_strength: 0.88,
        failure_learning: 0.84,
        compactness: 0.74,
        source_coverage: 1
      },
      notes: ["Mock judge adds reflection only."],
      suggested_next_experiments: ["Add one mixed-route holdout sample."]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge_escalation.recommended, true);
  assert.equal(result.judge_escalation.llm_review_value.level, "high");
  assert.equal(result.judge.mode, "auto");
  assert.equal(result.judge.status, "completed");
  assert.equal(result.judge.llm_api_calls, 1);
  assert.equal(result.quality_comparison.status, "completed");
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);
});

test("optional LLM judge adds comparison data without changing the deterministic winner", async () => {
  const result = await reviewEvolutionTournamentGate({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source",
    judgeMode: "llm",
    judgeModel: "mock-judge",
    llmJudge: async () => ({
      overall_quality_score: 0.91,
      dimensions: {
        route_preservation: 1,
        safety_lock: 1,
        holdout_strength: 0.9,
        failure_learning: 0.88,
        compactness: 0.78,
        source_coverage: 1
      },
      notes: ["Mock judge sees clean route preservation and useful loser evidence."],
      suggested_next_experiments: ["Run one more local holdout with mixed skill-policy signals."]
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.judge.mode, "llm");
  assert.equal(result.judge.status, "completed");
  assert.equal(result.judge.llm_api_calls, 1);
  assert.equal(result.judge.model, "mock-judge");
  assert.equal(result.quality_comparison.status, "completed");
  assert.equal(result.quality_comparison.llm_overall_quality_score, 0.91);
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);

  for (const tournament of result.tournaments) {
    assert.equal(tournament.winner.production_authority, false);
    assert.equal(tournament.winner.publication_allowed, false);
    const winner = tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id);
    assert.equal(winner.route_target, tournament.route_target);
  }
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
  assert.equal(result.export_policy.skill_promotion_contract.allowed_route_target, "skill");
  assert.ok(result.export_policy.skill_promotion_contract.required_signals.includes("reusable_workflow"));
  assert.ok(result.export_policy.skill_promotion_contract.blocking_signals.includes("farcaster_public_memory_risk"));
  assert.ok(result.export_policy.skill_promotion_contract.blocking_signals.includes("repeated_failure_pattern"));
});

test("minimal positive skill promotion keeps clean real workflows and blocks ambiguous routes", async () => {
  const real = await reviewMemoryLayerComparison({
    vpsRawDir: "test/fixtures/evolution/vps-real-conversation-source"
  });
  const exportedSkill = real.minimal_positive_l3.skills.find((skill) => (
    skill.source_event_id === "misa-distilled-vps-live-edge-redaction-sanitized-redaction-workflow"
  ));

  assert.equal(real.ok, true);
  assert.ok(exportedSkill);
  assert.equal(exportedSkill.export_allowed, true);
  assert.equal(exportedSkill.promotion_review.approved, true);
  assert.deepEqual(exportedSkill.promotion_review.reasons, []);
  assert.ok(exportedSkill.promotion_review.evidence.signals.includes("reusable_workflow"));

  const unsafePublicSkill = reviewSkillPromotionCandidate({
    observe: {
      signals: ["reusable_workflow", "farcaster_public_memory_risk"],
      risk_level: "high"
    },
    route: { target: "skill" },
    candidate_review: { state: "staged" },
    verification: { passed: true },
    result: {
      positive_value: true,
      live_effects: {
        writes_persistent_memory: false,
        publishes_skill: false,
        starts_timer: false,
        changes_session_mechanics: false,
        posts_publicly: false
      }
    }
  });
  const unsafeCaseSkill = reviewSkillPromotionCandidate({
    observe: {
      signals: ["reusable_workflow", "repeated_failure_pattern"],
      risk_level: "medium"
    },
    route: { target: "skill" },
    candidate_review: { state: "staged" },
    verification: { passed: true },
    result: {
      positive_value: true,
      live_effects: {
        writes_persistent_memory: false,
        publishes_skill: false,
        starts_timer: false,
        changes_session_mechanics: false,
        posts_publicly: false
      }
    }
  });

  assert.equal(unsafePublicSkill.approved, false);
  assert.ok(unsafePublicSkill.reasons.includes("blocking_signal:farcaster_public_memory_risk"));
  assert.equal(unsafeCaseSkill.approved, false);
  assert.ok(unsafeCaseSkill.reasons.includes("blocking_signal:repeated_failure_pattern"));
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
    assert.equal(manifest.exports.every((item) => item.promotion_review.approved === true), true);
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

test("work-order routing defaults to agent-first risk grading", async () => {
  const repairTickets = await reviewRepairTickets({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(result.mode, "work-order-routing");
  assert.equal(result.ok, true);
  assert.equal(result.routing_policy.mode, "risk_graded_default");
  assert.equal(result.safety.auto_execute_allowed, true);
  assert.equal(result.safety.primary_agent_must_report_first, false);
  assert.equal(result.safety.agent_self_review_default, true);
  assert.equal(result.summary.work_order_count, repairTickets.tickets.length);
  assert.equal(result.summary.requires_user_confirmation_count, 0);
  assert.equal(result.summary.auto_executable_count, 0);
  assert.equal(result.summary.agent_self_review_count, result.summary.work_order_count);
  assert.equal(result.summary.owner_report_required_count, result.summary.work_order_count);

  const order = result.work_orders[0];
  assert.equal(order.status, "pending_agent_review");
  assert.equal(order.delivery.receiver_type, "primary_agent");
  assert.equal(order.delivery.delivery_policy, "deliver_to_agent_for_review");
  assert.equal(order.suggested_executor.executor_type, "specialized_engineering_agent");
  assert.equal(order.execution_policy.requires_user_confirmation, false);
  assert.equal(order.execution_policy.auto_execute_allowed, false);
  assert.equal(order.execution_policy.agent_self_review_allowed, true);
  assert.equal(order.execution_policy.agent_may_self_resolve, false);
  assert.equal(order.execution_policy.owner_report_required, true);
  assert.equal(order.execution_policy.experience_capture_mode, "candidate_log_only");
  assert.equal(order.execution_policy.durable_or_public_effect_allowed, false);
  assert.equal(order.execution_policy.default_next_step, "agent_self_review_then_report_owner");
  assert.equal(order.escalation.user_can_decline_execution, true);
  assert.equal(order.model_handoff.stronger_model_recommended, true);
  assert.match(order.model_handoff.reason, /Durable or public effects remain blocked/);
  assert.ok(order.source_refs.some((ref) => ref.kind === "repair_ticket"));
  assert.ok(order.traceability.acceptance_criteria.includes("minimal_positive_l3.non_skill_promoted_count == 0"));
  assert.match(order.user_prompt, /I received a work order/);
  assert.match(order.user_prompt, /minimal-positive mode already blocked the bad export/);
});

test("LangGraph bridge keeps Qianxuesen in charge of learning routes", async () => {
  const repairTickets = await reviewRepairTickets({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const workOrderRouting = buildWorkOrderRouting({
    repairTicketReview: repairTickets,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildLangGraphQianxuesenBridge({
    repairTicketReview: repairTickets,
    workOrderRouting,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const schemaCheck = await validateJsonData({
    repoRoot: process.cwd(),
    schemaRel: "schemas/langgraph_qianxuesen_bridge.schema.json",
    data: result,
    name: "validate generated LangGraph bridge"
  });

  assert.equal(result.mode, "langgraph-qianxuesen-bridge");
  assert.equal(result.ok, true);
  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.integration_principle.carrier_layer, "LangGraph");
  assert.equal(result.integration_principle.control_layer, "Qianxuesen");
  assert.equal(result.determinism_contract.claim_scope, "qianxuesen_sidecar_after_input_ingest");
  assert.equal(result.determinism_contract.input_boundary.upstream_artifacts_may_be_llm_generated, true);
  assert.equal(result.determinism_contract.input_boundary.upstream_artifacts_are_evidence_not_authority, true);
  assert.equal(result.determinism_contract.distill.implementation, "rule_symbolic_local_token_vector");
  assert.equal(result.determinism_contract.distill.uses_llm, false);
  assert.equal(result.determinism_contract.distill.vector_backend, "local-token-vector-v1");
  assert.equal(result.determinism_contract.route.implementation, "signal_rules_and_route_table");
  assert.equal(result.determinism_contract.route.uses_llm, false);
  assert.equal(result.langgraph_contract.checkpointer.required, true);
  assert.equal(result.langgraph_contract.interrupt.required, true);
  assert.equal(result.summary.work_order_count, workOrderRouting.summary.work_order_count);
  assert.equal(result.summary.interrupt_count, workOrderRouting.summary.owner_report_required_count);
  assert.equal(result.summary.llm_owned_learning_decision_count, 0);
  assert.equal(result.summary.action_policy_effective_decision, "require_interrupt");
  assert.equal(result.summary.decision_bom_completeness_score, 1);
  assert.equal(result.safety.llm_route_decision_allowed, false);
  assert.equal(result.safety.graph_can_execute_live_effects, false);
  assert.equal(result.action_policy_contract.policy_engine.default_action, "deny");
  assert.equal(result.action_policy_contract.policy_engine.conflict_resolution, "deny_overrides");
  assert.equal(result.action_policy_contract.policy_engine.fail_closed, true);
  assert.equal(result.action_policy_contract.policy_engine.llm_in_decision_loop, false);
  assert.equal(result.action_policy_contract.effective_decision, "require_interrupt");
  assert.ok(result.action_policy_contract.rules.some((rule) => rule.rule_id === "deny_llm_learning_authority"));
  assert.ok(result.action_policy_contract.rules.some((rule) => rule.rule_id === "require_interrupt_for_durable_or_public_effect"));
  assert.equal(result.decision_bom.reconstruction_mode, "from_existing_bridge_signals");
  assert.equal(result.decision_bom.completeness_score, 1);
  assert.deepEqual(result.decision_bom.missing_required_fields, []);
  assert.equal(
    result.decision_bom.required_fields.find((field) => field.name === "decision_outcome").value,
    result.action_policy_contract.effective_decision
  );
  assert.equal(result.langgraph_contract.custom_nodes.every((node) => node.owner === "qianxuesen_deterministic"), true);
  assert.equal(result.langgraph_contract.custom_nodes.every((node) => node.llm_decision_allowed === false), true);
  assert.deepEqual(result.langgraph_contract.state_inputs, DEFAULT_STATE_INPUTS);
  assert.deepEqual(result.langgraph_contract.checkpointer.persist_fields, CHECKPOINTER_FIELDS);
  assert.deepEqual(result.langgraph_contract.custom_nodes.map((node) => node.stage_id), GOVERNANCE_STAGES.map((stage) => stage.stage_id));
  assert.deepEqual(result.governance_hooks.map((hook) => hook.from_node), GOVERNANCE_STAGES.map((stage) => stage.from_node));
  assert.deepEqual(result.governance_hooks.map((hook) => hook.to_node), GOVERNANCE_STAGES.map((stage) => stage.to_node));
  assert.deepEqual(result.decision_boundary.llm_agent_must_not, LLM_MUST_NOT);
  assert.deepEqual(result.langgraph_contract.llm_nodes.forbidden_learning_decisions, LLM_MUST_NOT);
  assert.equal(result.interrupt_queue.length, workOrderRouting.summary.owner_report_required_count);
  assert.equal(result.interrupt_queue.every((item) => item.owner_report_required === true), true);
  assert.equal(result.interrupt_queue.every((item) => item.effect_boundary.execution_allowed_without_human === false), true);
  assert.equal(result.interrupt_queue.every((item) => item.effect_boundary.requires_interrupt === true), true);
  assert.deepEqual(result.interrupt_queue[0].resume_policy.accepted_decisions, INTERRUPT_DECISIONS);
});

test("LangGraph bridge flags downgraded LLM-owned governance", async () => {
  const result = await reviewLangGraphQianxuesenBridge({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const downgraded = structuredClone(result);
  downgraded.langgraph_contract.custom_nodes[0].owner = "llm_agent";
  downgraded.langgraph_contract.custom_nodes[0].llm_decision_allowed = true;
  downgraded.governance_hooks[0].llm_may_override = true;
  downgraded.safety.llm_route_decision_allowed = true;
  downgraded.determinism_contract.distill.uses_llm = true;
  downgraded.determinism_contract.route.llm_may_override = true;
  downgraded.action_policy_contract.policy_engine.default_action = "allow";
  downgraded.action_policy_contract.policy_engine.llm_in_decision_loop = true;
  downgraded.action_policy_contract.rules = downgraded.action_policy_contract.rules
    .filter((rule) => rule.rule_id !== "deny_llm_learning_authority");
  downgraded.decision_bom.completeness_score = 0.83;
  downgraded.decision_bom.missing_required_fields = ["policy_rules_evaluated"];
  downgraded.summary.llm_owned_learning_decision_count = 1;
  downgraded.decision_boundary.llm_agent_must_not = downgraded.decision_boundary.llm_agent_must_not
    .filter((item) => item !== "write_persistent_memory");
  downgraded.langgraph_contract.llm_nodes.forbidden_learning_decisions = downgraded.langgraph_contract.llm_nodes.forbidden_learning_decisions
    .filter((item) => item !== "touch_vps_or_services");
  downgraded.langgraph_contract.checkpointer.persist_fields = downgraded.langgraph_contract.checkpointer.persist_fields
    .filter((item) => item !== "interrupt_decisions");
  downgraded.interrupt_queue = [
    {
      interrupt_id: "interrupt-bad-example",
      source_id: "repair-local-distillation-sources-auto-l3-overpromotion",
      source_type: "work_order",
      title: "Bad example",
      reason: "bad resume policy",
      suggested_executor: "specialized_engineering_agent",
      requires_user_confirmation: false,
      owner_report_required: true,
      durable_or_public_effect: false,
      resume_policy: {
        accepted_decisions: ["execute_locally"],
        require_source_refs: true,
        require_approval_record: true
      },
      effect_boundary: {
        requires_interrupt: true,
        execution_allowed_without_human: false
      }
    }
  ];
  downgraded.summary.interrupt_count = 1;

  const checked = evaluateLangGraphQianxuesenBridge(downgraded);

  assert.equal(checked.ok, false);
  assert.ok(checked.violations.includes("custom_governance_nodes_must_be_deterministic"));
  assert.ok(checked.violations.includes("governance_hooks_must_not_be_llm_overridable"));
  assert.ok(checked.violations.includes("llm_route_decision_allowed_must_be_false"));
  assert.ok(checked.violations.includes("llm_owned_learning_decision_count_must_be_zero"));
  assert.ok(checked.violations.includes("llm_learning_route_boundary_missing"));
  assert.ok(checked.violations.includes("distill_determinism_contract_mismatch"));
  assert.ok(checked.violations.includes("route_determinism_contract_mismatch"));
  assert.ok(checked.violations.includes("action_policy_engine_must_be_fail_closed"));
  assert.ok(checked.violations.includes("action_policy_rules_missing"));
  assert.ok(checked.violations.includes("decision_bom_must_be_complete"));
  assert.ok(checked.violations.includes("decision_bom_integrity_hash_mismatch"));
  assert.ok(checked.violations.includes("langgraph_checkpointer_fields_missing"));
  assert.ok(checked.violations.includes("interrupt_resume_decisions_missing"));
});

test("LangGraph bridge example stays aligned with generated contract constants", async () => {
  const example = JSON.parse(await fs.readFile(
    path.join(process.cwd(), "examples", "langgraph_qianxuesen_bridge.example.json"),
    "utf8"
  ));
  const result = await reviewLangGraphQianxuesenBridge({
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.deepEqual(example.langgraph_contract.state_inputs, result.langgraph_contract.state_inputs);
  assert.deepEqual(example.determinism_contract, result.determinism_contract);
  assert.deepEqual(example.action_policy_contract, result.action_policy_contract);
  assert.deepEqual(example.decision_bom.required_fields, result.decision_bom.required_fields);
  assert.equal(example.decision_bom.completeness_score, result.decision_bom.completeness_score);
  assert.deepEqual(example.langgraph_contract.checkpointer.persist_fields, result.langgraph_contract.checkpointer.persist_fields);
  assert.deepEqual(example.langgraph_contract.llm_nodes.forbidden_learning_decisions, result.langgraph_contract.llm_nodes.forbidden_learning_decisions);
  assert.deepEqual(example.decision_boundary.llm_agent_must_not, result.decision_boundary.llm_agent_must_not);
  assert.deepEqual(
    example.langgraph_contract.custom_nodes.map((node) => [node.stage_id, node.node_id]),
    result.langgraph_contract.custom_nodes.map((node) => [node.stage_id, node.node_id])
  );
  assert.deepEqual(
    example.governance_hooks.map((hook) => [hook.stage_id, hook.from_node, hook.to_node, hook.hook]),
    result.governance_hooks.map((hook) => [hook.stage_id, hook.from_node, hook.to_node, hook.hook])
  );
  assert.deepEqual(example.interrupt_queue[0].resume_policy.accepted_decisions, INTERRUPT_DECISIONS);
  assert.deepEqual(result.interrupt_queue[0].resume_policy.accepted_decisions, INTERRUPT_DECISIONS);
});

test("LangGraph bridge maps compact Hermes high-risk work orders to human interrupts", async () => {
  const input = JSON.parse(await fs.readFile(
    path.join(process.cwd(), "examples", "hermes-distillation-mapping", "high-risk.input.json"),
    "utf8"
  ));
  const mapping = await mapHermesDistillation(input);
  const result = buildLangGraphQianxuesenBridge({
    workOrderRouting: {
      work_order: mapping.work_order
    },
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(mapping.routing.suggested_executor, "human_owner");
  assert.equal(result.ok, true);
  assert.equal(result.summary.work_order_count, 1);
  assert.equal(result.summary.interrupt_count, 1);
  assert.equal(result.state_projection.repair_ticket_count, 1);
  assert.equal(result.state_projection.human_owner_work_order_count, 1);

  const interrupt = result.interrupt_queue[0];
  assert.equal(interrupt.suggested_executor, "human_owner");
  assert.equal(interrupt.resume_policy.human_owner_required, true);
  assert.equal(interrupt.effect_boundary.durable_or_public_effect, true);
  assert.ok(interrupt.effect_boundary.blocked_surfaces.includes("persistent_memory"));
  assert.ok(interrupt.effect_boundary.blocked_surfaces.includes("runtime_service"));
  assert.ok(interrupt.effect_boundary.blocked_surfaces.includes("provider_or_credential"));
});

test("vector memory storage classification separates audit, decision, experience, policy, and work orders", async () => {
  const routing = await routeWorkOrders({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const bridge = await reviewLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const schemaCheck = await validateJsonData({
    repoRoot: process.cwd(),
    schemaRel: "schemas/vector_memory_storage.schema.json",
    data: result,
    name: "validate generated vector memory storage classification"
  });

  assert.equal(result.mode, "vector-memory-storage-classification");
  assert.equal(result.ok, true);
  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.strategy.classification_only, true);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.summary.zilliz_write_count, 0);
  assert.ok(result.collections.some((item) => item.collection === "misa_experience_memory"));
  assert.ok(result.local_layout.some((item) => item.local_dir === "memory/agent-experience/candidate"));
  assert.ok(result.records.some((record) => record.kind === "audit_log"));
  assert.ok(result.records.some((record) => record.kind === "decision_trace"));
  assert.ok(result.records.some((record) => record.kind === "agent_experience_candidate"));
  assert.ok(result.records.some((record) => record.kind === "repair_work_order"));
  assert.ok(result.records.some((record) => record.kind === "policy_boundary"));
  assert.equal(
    result.records
      .filter((record) => ["audit_only", "candidate"].includes(record.metadata.authority))
      .every((record) => record.metadata.can_influence_behavior === false),
    true
  );
});

test("vector memory classification keeps low-risk autonomous work bounded", async () => {
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
  const routing = buildWorkOrderRouting({
    operationalReports: [report],
    now: new Date("2026-05-12T00:00:00Z")
  });
  const bridge = buildLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(routing.summary.auto_executable_count, 1);
  assert.equal(bridge.action_policy_contract.effective_decision, "allow_bounded_local_work");
  assert.equal(result.summary.owner_approval_required_count > 0, true);
  assert.ok(result.summary.by_kind.agent_experience_candidate >= 1);
  assert.ok(result.summary.by_kind.policy_boundary >= 1);
  assert.equal(result.summary.zilliz_write_count, 0);
  assert.ok(result.records.some((record) => (
    record.kind === "policy_boundary"
    && record.metadata.blocked_surfaces.includes("public_posting")
    && record.metadata.blocked_surfaces.includes("provider_credentials")
  )));
});

test("Zilliz vector adapter prepares dry-run collection schemas and upsert payloads", async () => {
  const routing = await routeWorkOrders({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const bridge = await reviewLangGraphQianxuesenBridge({
    workOrderRouting: routing,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const storage = buildVectorMemoryStoragePlan({
    workOrderRouting: routing,
    langGraphBridge: bridge,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const result = buildZillizVectorAdapterPlan({
    vectorMemoryStorage: storage,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const reviewed = await reviewZillizVectorAdapterPlan({
    vectorMemoryStorage: storage,
    now: new Date("2026-05-12T00:00:00Z")
  });
  const schemaCheck = await validateJsonData({
    repoRoot: process.cwd(),
    schemaRel: "schemas/zilliz_vector_adapter.schema.json",
    data: result,
    name: "validate generated Zilliz vector adapter dry-run"
  });

  assert.equal(result.mode, "zilliz-vector-adapter-dry-run");
  assert.equal(result.ok, true);
  assert.equal(reviewed.summary.record_count, result.summary.record_count);
  assert.equal(schemaCheck.ok, true, JSON.stringify(schemaCheck.errors ?? [], null, 2));
  assert.equal(result.adapter.vector_dimension, 768);
  assert.equal(result.adapter.embedding_model, "gemini-embedding-001");
  assert.equal(result.safety.dry_run, true);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.safety.embedding_created, false);
  assert.equal(result.safety.external_api_calls, 0);
  assert.equal(result.summary.zilliz_write_count, 0);
  assert.equal(result.summary.records_requiring_embedding, storage.summary.record_count);
  assert.ok(result.collection_plans.some((plan) => plan.collection === "misa_work_order_memory"));
  assert.ok(result.collection_plans.every((plan) => plan.vector.embedding_created === false));
  assert.ok(result.upsert_batches.length > 0);
  assert.ok(result.upsert_batches.every((batch) => batch.zilliz_written === false));
  assert.ok(result.upsert_batches.flatMap((batch) => batch.records).every((record) => (
    record.embedding === null
    && record.embedding_status === "not_created"
    && record.metadata.record_id === record.record_id
  )));
  assert.equal(result.metadata_checks.every((check) => check.ok), true);
  assert.equal(
    result.upsert_batches
      .flatMap((batch) => batch.records)
      .filter((record) => ["audit_only", "candidate"].includes(record.metadata.authority))
      .every((record) => record.metadata.can_influence_behavior === false),
    true
  );
});

test("Zilliz vector adapter flags unsafe metadata instead of silently preparing writes", async () => {
  const storage = await reviewVectorMemoryStoragePlan({
    now: new Date("2026-05-12T00:00:00Z")
  });
  const badStorage = {
    ...storage,
    records: storage.records.map((record, index) => index === 0
      ? {
          ...record,
          metadata: {
            ...record.metadata,
            authority: "candidate",
            can_influence_behavior: true
          }
        }
      : record)
  };
  const result = buildZillizVectorAdapterPlan({
    vectorMemoryStorage: badStorage,
    now: new Date("2026-05-12T00:00:00Z")
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.metadata_violation_count > 0, true);
  assert.ok(result.metadata_checks.some((check) => (
    check.check === "behavior_authority"
    && check.ok === false
  )));
  assert.equal(result.safety.zilliz_written, false);
});

test("VPS conversation loader accepts symlinked sanitized JSON files", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-vps-conversation-symlink-"));
  try {
    const targetPath = path.join(tempRoot, "sanitized-conversation-target.json");
    const linkPath = path.join(tempRoot, "sanitized-conversation-link.json");
    await fs.writeFile(targetPath, `${JSON.stringify({
      conversation: {
        cast: {
          text: "A sanitized VPS conversation confirms public replies need local safety checks.",
          direct_replies: [
            { text: "Keep public-channel lessons behind approval before reuse." }
          ]
        }
      }
    })}\n`, "utf8");

    try {
      await fs.symlink(targetPath, linkPath, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
        t.skip(`symlink creation is not available: ${error.code}`);
        return;
      }
      throw error;
    }

    const sources = await loadVpsConversationSources({ rawDir: tempRoot });
    assert.equal(sources.length, 2);
    assert.ok(sources.some((source) => source.source_id.includes("sanitized-conversation-link")));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
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
  assert.equal(order.status, "agent_ready_to_execute");
  assert.equal(order.delivery.delivery_policy, "notify_then_execute_within_scope");
  assert.equal(order.execution_policy.requires_user_confirmation, false);
  assert.equal(order.execution_policy.auto_execute_allowed, true);
  assert.equal(order.execution_policy.agent_self_review_allowed, true);
  assert.equal(order.execution_policy.agent_may_self_resolve, true);
  assert.equal(order.execution_policy.owner_report_required, false);
  assert.equal(order.execution_policy.default_next_step, "execute_within_scope");
  assert.equal(order.execution_policy.durable_or_public_effect_allowed, false);
  assert.equal(order.model_handoff.stronger_model_recommended, false);

  const bridge = buildLangGraphQianxuesenBridge({
    workOrderRouting: result,
    now: new Date("2026-05-12T00:00:00Z")
  });
  assert.equal(bridge.action_policy_contract.effective_decision, "allow_bounded_local_work");
  assert.equal(bridge.summary.interrupt_count, 0);
  assert.ok(bridge.action_policy_contract.evaluated_action.blocked_surfaces.includes("public_or_channel_output"));
  assert.ok(bridge.action_policy_contract.evaluated_action.blocked_surfaces.includes("provider_or_credential"));
});

test("work-order routing conservative modes do not inherit public-default auto flags", async () => {
  const repairTickets = await reviewRepairTickets({
    now: new Date("2026-05-12T00:00:00Z")
  });

  for (const mode of ["report_only", "ask_before_execution"]) {
    const result = buildWorkOrderRouting({
      repairTicketReview: repairTickets,
      routingPolicy: {
        mode,
        auto_execute_allowed: true,
        auto_execute_categories: ["*"],
        primary_agent_report_first: false
      },
      now: new Date("2026-05-12T00:00:00Z")
    });

    assert.equal(result.routing_policy.mode, mode);
    assert.equal(result.safety.auto_execute_allowed, false);
    assert.equal(result.safety.primary_agent_must_report_first, true);
    assert.equal(result.summary.auto_executable_count, 0);
    assert.equal(result.work_orders.every((order) => order.execution_policy.auto_execute_allowed === false), true);
  }
});

test("work-order routing full-agent mode can auto-handle non-durable higher-risk work", () => {
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

  const result = buildWorkOrderRouting({
    operationalReports: [report],
    routingPolicy: {
      mode: "full_agent",
      auto_execute_allowed: true
    },
    now: new Date("2026-05-12T00:00:00Z")
  });

  const order = result.work_orders[0];
  assert.equal(result.routing_policy.mode, "full_agent");
  assert.equal(result.summary.auto_executable_count, 1);
  assert.equal(order.severity, "P1");
  assert.equal(order.status, "agent_ready_to_execute");
  assert.equal(order.delivery.delivery_policy, "notify_then_execute_within_scope");
  assert.equal(order.execution_policy.auto_execute_allowed, true);
  assert.equal(order.execution_policy.agent_may_self_resolve, true);
  assert.equal(order.execution_policy.owner_report_required, false);
  assert.equal(order.execution_policy.experience_capture_mode, "candidate_log_only");
  assert.equal(order.model_handoff.stronger_model_recommended, true);
  assert.match(order.model_handoff.reason, /advisory for non-durable in-scope work/);
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
  assert.equal(order.execution_policy.agent_self_review_allowed, true);
  assert.equal(order.execution_policy.auto_execute_allowed, false);
  assert.equal(order.execution_policy.agent_may_self_resolve, false);
  assert.equal(order.execution_policy.owner_report_required, true);
  assert.equal(order.execution_policy.experience_capture_mode, "candidate_log_only");
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
    assert.equal(persisted.safety.auto_execute_allowed, true);
    assert.equal(persisted.safety.durable_or_public_effect_allowed, false);
    assert.match(markdown, /# Work Order Routing/);
    assert.match(markdown, /agent_self_review_count:/);
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
    assert.equal(order.execution_policy.requires_user_confirmation, false);
    assert.equal(order.execution_policy.auto_execute_allowed, false);
    assert.equal(order.execution_policy.agent_self_review_allowed, true);
    assert.equal(order.execution_policy.owner_report_required, true);
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

test("OmniAgent repeated success footprint becomes evidence-only skill route", async () => {
  const raw = await fs.readFile(
    path.join(process.cwd(), "examples/omniagent-footprint-bridge/repeated-success.input.json"),
    "utf8"
  );
  const result = reviewOmniAgentFootprintBridge({
    footprint: JSON.parse(raw),
    now: new Date("2026-05-13T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.route_summary.selected_route, "skill");
  assert.equal(result.converted_learning_event.signals.includes("reusable_workflow"), true);
  assert.equal(result.control_boundary.route_owner, "qianxuesen");
  assert.equal(result.control_boundary.llm_route_decision_allowed, false);
  assert.equal(result.control_boundary.automatic_promotion_allowed, false);
  assert.equal(result.omniagent_borrowed.automatic_writes_imported, false);
  assert.equal(Object.values(result.safety.live_effects).some(Boolean), false);
  assert.deepEqual(evaluateOmniAgentFootprintBridge(result), []);
});

test("OmniAgent automatic writes become policy evidence instead of imported evolution", async () => {
  const raw = await fs.readFile(
    path.join(process.cwd(), "examples/omniagent-footprint-bridge/auto-write-risk.input.json"),
    "utf8"
  );
  const result = reviewOmniAgentFootprintBridge({
    footprint: JSON.parse(raw),
    now: new Date("2026-05-13T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.route_summary.selected_route, "policy");
  assert.equal(result.route_summary.publication_mode, "requires_approval");
  assert.equal(result.footprint_summary.auto_write_indicators.agents_md_write, true);
  assert.equal(result.footprint_summary.auto_write_indicators.memory_write, true);
  assert.equal(result.footprint_summary.auto_write_indicators.skill_write, true);
  assert.equal(result.omniagent_borrowed.auto_agents_md_promotion_imported, false);
  assert.equal(result.omniagent_borrowed.auto_memory_write_imported, false);
  assert.equal(result.omniagent_borrowed.auto_skill_install_imported, false);
  assert.equal(result.cycle_trace.candidate_review.publication_allowed, false);
});

test("OmniAgent patch-style AGENTS write is blocked as policy evidence", async () => {
  const raw = await fs.readFile(
    path.join(process.cwd(), "examples/omniagent-footprint-bridge/patch-agents-md-risk.input.json"),
    "utf8"
  );
  const result = reviewOmniAgentFootprintBridge({
    footprint: JSON.parse(raw),
    now: new Date("2026-05-13T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.route_summary.selected_route, "policy");
  assert.equal(result.footprint_summary.tools_used.includes("apply_patch"), true);
  assert.equal(result.footprint_summary.auto_write_indicators.agents_md_write, true);
  assert.equal(result.converted_learning_event.signals.includes("explicit_user_boundary"), true);
  assert.equal(result.omniagent_borrowed.auto_agents_md_promotion_imported, false);
  assert.equal(result.cycle_trace.candidate_review.publication_allowed, false);
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
