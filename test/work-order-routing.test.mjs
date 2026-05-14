import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildLangGraphQianxuesenBridge } from "../scripts/lib/langgraph-qianxuesen-bridge.mjs";
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
