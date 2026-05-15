import path from "node:path";
import {
  evaluateHermesMappingFixtures
} from "./hermes-distillation-mapper.mjs";
import { runHermesRuntimeAdapter } from "./hermes-runtime-adapter.mjs";
import { reviewLangGraphQianxuesenBridge } from "./langgraph-qianxuesen-bridge.mjs";
import { reviewOmniAgentFootprintBridge } from "./omniagent-footprint-bridge.mjs";
import { validateJsonData } from "./schema-validation.mjs";
import { PHASES, checkResult, readJson } from "./precheck-shared.mjs";

function bridgeCheck(name, ok, details = {}) {
  return checkResult(name, ok, {
    phase: PHASES.bridges,
    ...details
  });
}

function bridgeValidation(args) {
  return validateJsonData({
    ...args,
    phase: PHASES.bridges
  });
}

export async function runBridgePrecheck({ repoRoot, repairTickets, workOrderRouting }) {
  const checks = [];

  const hermesMapping = await evaluateHermesMappingFixtures({ repoRoot });
  checks.push(bridgeCheck("Hermes distillation mapping fixture check", hermesMapping.ok, {
    fixtureCount: hermesMapping.summary.fixture_count,
    mappedCount: hermesMapping.summary.mapped_count,
    workOrders: hermesMapping.summary.work_order_count,
    blocked: hermesMapping.summary.blocked_count,
    humanOwner: hermesMapping.summary.human_owner_count,
    llmApiCalls: hermesMapping.summary.llm_api_calls,
    externalApiCalls: hermesMapping.summary.external_api_calls,
    violations: hermesMapping.violations
  }));

  for (const mapping of hermesMapping.results) {
    checks.push(await bridgeValidation({
      repoRoot,
      schemaRel: "schemas/hermes_distillation_mapping.schema.json",
      data: mapping,
      name: `validate Hermes mapping ${mapping.source.source_id}`
    }));
  }

  const hermesRuntimeAdapter = await runHermesRuntimeAdapter({
    repoRoot,
    now: new Date("2026-05-15T00:00:00Z")
  });
  checks.push(bridgeCheck("Hermes runtime adapter contract check", hermesRuntimeAdapter.ok, {
    events: hermesRuntimeAdapter.summary.event_count,
    researchDigests: hermesRuntimeAdapter.summary.research_digest_count,
    evolutionCandidates: hermesRuntimeAdapter.summary.evolution_candidate_count,
    replayRequired: hermesRuntimeAdapter.summary.replay_required_count,
    writesSkills: hermesRuntimeAdapter.safety.writes_skills,
    writesPersistentMemory: hermesRuntimeAdapter.safety.writes_persistent_memory,
    llmApiCalls: hermesRuntimeAdapter.safety.llm_api_calls,
    externalApiCalls: hermesRuntimeAdapter.safety.external_api_calls,
    violations: hermesRuntimeAdapter.violations
  }));
  checks.push(await bridgeValidation({
    repoRoot,
    schemaRel: "schemas/agent_runtime_adapter.schema.json",
    data: hermesRuntimeAdapter,
    name: "validate Hermes runtime adapter review"
  }));

  const langGraphBridge = await reviewLangGraphQianxuesenBridge({
    repoRoot,
    repairTicketReview: repairTickets,
    workOrderRouting,
    now: new Date("2026-05-12T00:00:00Z")
  });
  checks.push(bridgeCheck("LangGraph Qianxuesen bridge contract check", langGraphBridge.ok, {
    workOrders: langGraphBridge.summary.work_order_count,
    interrupts: langGraphBridge.summary.interrupt_count,
    deterministicNodes: langGraphBridge.summary.deterministic_governance_node_count,
    llmOwnedLearningDecisions: langGraphBridge.summary.llm_owned_learning_decision_count,
    liveEffectAllowed: langGraphBridge.summary.live_effect_allowed,
    violations: langGraphBridge.violations
  }));
  checks.push(await bridgeValidation({
    repoRoot,
    schemaRel: "schemas/langgraph_qianxuesen_bridge.schema.json",
    data: langGraphBridge,
    name: "validate LangGraph Qianxuesen bridge review"
  }));

  for (const footprintRel of [
    "examples/omniagent-footprint-bridge/repeated-success.input.json",
    "examples/omniagent-footprint-bridge/auto-write-risk.input.json",
    "examples/omniagent-footprint-bridge/patch-agents-md-risk.input.json"
  ]) {
    const omniAgentFootprint = await readJson(path.join(repoRoot, footprintRel));
    const omniAgentBridge = reviewOmniAgentFootprintBridge({
      footprint: omniAgentFootprint,
      now: new Date("2026-05-13T00:00:00Z")
    });
    checks.push(bridgeCheck(`OmniAgent footprint bridge contract check ${path.basename(footprintRel)}`, omniAgentBridge.ok, {
      route: omniAgentBridge.route_summary.selected_route,
      status: omniAgentBridge.route_summary.status,
      autoWritesSeen: Object.values(omniAgentBridge.footprint_summary.auto_write_indicators).some(Boolean),
      llmRouteDecisionAllowed: omniAgentBridge.control_boundary.llm_route_decision_allowed,
      automaticPromotionAllowed: omniAgentBridge.control_boundary.automatic_promotion_allowed,
      violations: omniAgentBridge.violations
    }));
    checks.push(await bridgeValidation({
      repoRoot,
      schemaRel: "schemas/omniagent_footprint_bridge.schema.json",
      data: omniAgentBridge,
      name: `validate OmniAgent footprint bridge review ${path.basename(footprintRel)}`
    }));
  }

  return {
    checks,
    artifacts: {
      hermesMapping,
      hermesRuntimeAdapter,
      langGraphBridge
    }
  };
}
