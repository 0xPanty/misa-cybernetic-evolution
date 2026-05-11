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
import { runMisaSelfRepair } from "../scripts/lib/self-repair.mjs";
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
  exportMinimalPositiveSkills,
  reviewMemoryLayerComparison
} from "../scripts/lib/memory-layer.mjs";
import {
  reviewRepairTickets,
  writeRepairTicketArtifacts
} from "../scripts/lib/repair-ticket.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
    assert.equal(review.layers.l2_candidates.mixed_route_pressure.skill_signal_suppressed_count, 1);
    assert.equal(exported.ok, true);
    assert.equal(exported.exported_count, 0);
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
  assert.equal(result.report_queue.every((report) => report.allowed_next_step === "human_review_only"), true);
  assert.equal(
    result.optimization_candidates
      .filter((candidate) => candidate.local_preflight.status !== "preflight_passed")
      .every((candidate) => candidate.local_preflight.report_to_huan === false),
    true
  );
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
    assert.equal(report.status, "draft_generated");
    assert.equal(report.safety.requires_human_publish_approval, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
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
