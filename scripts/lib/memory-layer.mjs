import fs from "node:fs/promises";
import path from "node:path";
import {
  distillLocalMisaSources,
  loadLocalDistillationSources
} from "./session-distiller.mjs";
import { simulateLearningCycle } from "./learning-loop.mjs";
import { loadVpsConversationSources } from "./vps-conversation-sources.mjs";

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

const LIVE_EFFECTS_OFF = {
  writes_persistent_memory: false,
  publishes_skill: false,
  starts_timer: false,
  changes_session_mechanics: false,
  posts_publicly: false
};

const SKILL_PROMOTION_CONTRACT = {
  allowed_route_target: "skill",
  required_signals: ["reusable_workflow"],
  blocking_signals: [
    "explicit_user_boundary",
    "public_posting_boundary",
    "farcaster_public_memory_risk",
    "candidate_replay_failed",
    "avoid_overreaction",
    "single_failure",
    "repeated_failure_pattern"
  ],
  requires_candidate_state: "staged",
  requires_verification_passed: true,
  requires_positive_value: true,
  requires_no_live_effects: true,
  ambiguous_signal_policy: "stay_in_source_route_or_open_repair_ticket"
};

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function estimateTokens(text) {
  return String(text ?? "")
    .split(/[^\p{L}\p{N}_:/.-]+/u)
    .filter(Boolean)
    .length;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function possibleRoutesForSignals(signals) {
  const routes = [];
  if (signals.includes("candidate_replay_failed") || signals.includes("single_failure")) {
    routes.push("damping");
  }
  if (
    signals.includes("explicit_user_boundary")
    || signals.includes("public_posting_boundary")
    || signals.includes("farcaster_public_memory_risk")
  ) {
    routes.push("policy");
  }
  if (signals.includes("reusable_workflow")) {
    routes.push("skill");
  }
  if (signals.includes("repeated_failure_pattern")) {
    routes.push("case");
  }
  if (signals.includes("stable_user_preference") || signals.includes("stable_project_fact")) {
    routes.push("memory");
  }
  return uniqueStrings(routes);
}

function buildMixedRoutePressure(traces) {
  const mixed = traces
    .map((trace) => {
      const possible_routes = possibleRoutesForSignals(trace.observe.signals);
      return {
        source_event_id: trace.source_event_id,
        selected_route: routeForTrace(trace),
        possible_routes,
        signals: trace.observe.signals,
        summary: trace.proposed_change.summary.replace(/^Draft [a-z]+ candidate:\s*/i, "").slice(0, 120)
      };
    })
    .filter((item) => item.possible_routes.length > 1);

  const skillSuppressed = mixed.filter((item) => (
    item.possible_routes.includes("skill") && item.selected_route !== "skill"
  ));

  return {
    mixed_count: mixed.length,
    skill_signal_suppressed_count: skillSuppressed.length,
    by_selected_route: countBy(mixed, (item) => item.selected_route),
    examples: mixed.slice(0, 5),
    skill_suppressed_examples: skillSuppressed.slice(0, 5)
  };
}

function makeSkillId(trace) {
  return `l3-${trace.source_event_id}`.replace(/[^a-z0-9_.-]+/gi, "-").toLowerCase();
}

function routeForTrace(trace) {
  return trace.route.target;
}

function isVerified(trace) {
  return trace.verification.passed
    && trace.result.positive_value
    && !Object.values(trace.result.live_effects).some(Boolean);
}

export function reviewSkillPromotionCandidate(trace) {
  const signals = uniqueStrings(trace.observe.signals);
  const missingRequiredSignals = SKILL_PROMOTION_CONTRACT.required_signals
    .filter((signal) => !signals.includes(signal));
  const blockingSignals = SKILL_PROMOTION_CONTRACT.blocking_signals
    .filter((signal) => signals.includes(signal));
  const routeTarget = routeForTrace(trace);
  const liveEffectsPresent = Object.values(trace.result.live_effects).some(Boolean);
  const reasons = [];

  if (routeTarget !== SKILL_PROMOTION_CONTRACT.allowed_route_target) {
    reasons.push(`route_target=${routeTarget}`);
  }
  if (trace.candidate_review.state !== SKILL_PROMOTION_CONTRACT.requires_candidate_state) {
    reasons.push(`candidate_state=${trace.candidate_review.state}`);
  }
  if (!trace.verification.passed) {
    reasons.push("verification_failed");
  }
  if (!trace.result.positive_value) {
    reasons.push("not_positive_value");
  }
  if (liveEffectsPresent) {
    reasons.push("live_effects_present");
  }
  for (const signal of missingRequiredSignals) {
    reasons.push(`missing_required_signal:${signal}`);
  }
  for (const signal of blockingSignals) {
    reasons.push(`blocking_signal:${signal}`);
  }

  return {
    approved: reasons.length === 0,
    contract: "minimal_positive_l3_skill_promotion.v1",
    required_signals: [...SKILL_PROMOTION_CONTRACT.required_signals],
    blocking_signals: blockingSignals,
    reasons,
    evidence: {
      route_target: routeTarget,
      candidate_state: trace.candidate_review.state,
      verification_passed: trace.verification.passed,
      positive_value: trace.result.positive_value,
      live_effects_present: liveEffectsPresent,
      signals
    }
  };
}

function buildL3Skill(trace, mode) {
  const promotionReview = reviewSkillPromotionCandidate(trace);

  return {
    skill_id: makeSkillId(trace),
    source_event_id: trace.source_event_id,
    source_cycle_id: trace.cycle_id,
    route_target: routeForTrace(trace),
    title: trace.proposed_change.summary.replace(/^Draft [a-z]+ candidate:\s*/i, "").slice(0, 96),
    mode,
    candidate_state: trace.candidate_review.state,
    verification_passed: trace.verification.passed,
    procedure_outline: [
      `Trigger on signals: ${trace.observe.signals.join(", ")}`,
      `Preserve setpoint: ${trace.identify.setpoint}`,
      "Read source refs and evidence before applying the procedure.",
      "Run local validation again before any export or publication."
    ],
    promotion_review: promotionReview,
    export_allowed: mode === "minimal_positive_l3" && promotionReview.approved,
    publication_allowed: false,
    safety: {
      production_authority: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    }
  };
}

function buildOriginalAutoL3(traces) {
  const skills = traces
    .filter(isVerified)
    .filter((trace) => routeForTrace(trace) !== "ignore")
    .map((trace) => buildL3Skill(trace, "original_auto_l3"));

  const nonSkill = skills.filter((skill) => skill.route_target !== "skill");

  return {
    mode: "original_auto_l3",
    description: "Simulates the broad plan: every verified positive lesson becomes an L3 reusable skill candidate.",
    skill_count: skills.length,
    non_skill_promoted_count: nonSkill.length,
    route_counts: countBy(skills, (skill) => skill.route_target),
    risk_flags: [
      ...nonSkill.map((skill) => `${skill.source_event_id} promoted ${skill.route_target} as skill`)
    ],
    skills
  };
}

function buildMinimalPositiveL3(traces) {
  const skills = traces
    .filter(isVerified)
    .filter((trace) => reviewSkillPromotionCandidate(trace).approved)
    .map((trace) => buildL3Skill(trace, "minimal_positive_l3"));

  return {
    mode: "minimal_positive_l3",
    description: "Only verified skill-route lessons become local L3 draft skills; memory, case, policy, and damping stay in their own lanes.",
    skill_count: skills.length,
    non_skill_promoted_count: 0,
    route_counts: countBy(skills, (skill) => skill.route_target),
    risk_flags: [],
    skills
  };
}

function buildLayers({ sources, distillation, traces }) {
  const rawTokenEstimate = sources.reduce((sum, source) => (
    sum + source.turns.reduce((turnSum, turn) => turnSum + estimateTokens(turn.text), 0)
  ), 0);
  const distillateTokenEstimate = distillation.distillates.reduce((sum, item) => (
    sum + estimateTokens(item.summary) + item.extracted_signals.reduce((signalSum, signal) => signalSum + estimateTokens(signal), 0)
  ), 0);
  const compressionRatio = rawTokenEstimate > 0
    ? Math.round((distillateTokenEstimate / rawTokenEstimate) * 1000) / 1000
    : 0;

  return {
    l0_sources: {
      source_count: sources.length,
      turn_count: sources.reduce((sum, source) => sum + source.turns.length, 0),
      raw_token_estimate: rawTokenEstimate,
      redaction_statuses: countBy(sources, (source) => source.redaction_status)
    },
    l1_distillates: {
      distillate_count: distillation.distillates.length,
      learning_event_count: distillation.learning_events.length,
      atomic_lesson_count: distillation.lesson_splitter.atomic_lesson_count,
      compound_source_count: distillation.lesson_splitter.compound_source_count,
      lesson_route_counts: distillation.lesson_splitter.route_counts,
      distillate_token_estimate: distillateTokenEstimate,
      compression_ratio: compressionRatio,
      local_vector_index_used: distillation.summary.local_vector_index_used,
      vector_store_backend: distillation.summary.vector_store_backend
    },
    l2_candidates: {
      candidate_count: traces.length,
      route_counts: countBy(traces, routeForTrace),
      candidate_states: countBy(traces, (trace) => trace.candidate_review.state),
      mixed_route_pressure: buildMixedRoutePressure(traces)
    }
  };
}

function compareModes(originalAutoL3, minimalPositiveL3) {
  return {
    original_skill_count: originalAutoL3.skill_count,
    minimal_skill_count: minimalPositiveL3.skill_count,
    avoided_bad_promotions: originalAutoL3.non_skill_promoted_count - minimalPositiveL3.non_skill_promoted_count,
    original_non_skill_promoted_count: originalAutoL3.non_skill_promoted_count,
    minimal_non_skill_promoted_count: minimalPositiveL3.non_skill_promoted_count,
    verdict: originalAutoL3.non_skill_promoted_count > 0
      ? "minimal_positive_is_safer"
      : "both_modes_are_clean_on_this_sample"
  };
}

async function loadSources({ repoRoot, sourceDir, vpsRawDir }) {
  if (vpsRawDir) {
    return loadVpsConversationSources({ rawDir: path.isAbsolute(vpsRawDir) ? vpsRawDir : path.join(repoRoot, vpsRawDir) });
  }

  return loadLocalDistillationSources({
    repoRoot,
    sourceDir: sourceDir ?? path.join("examples", "misa-distillation")
  });
}

export async function reviewMemoryLayerComparison({
  repoRoot = process.cwd(),
  sourceDir,
  vpsRawDir
} = {}) {
  const sources = await loadSources({ repoRoot, sourceDir, vpsRawDir });
  const distillation = await distillLocalMisaSources({
    repoRoot,
    sources,
    requireTemplateCoverage: !sourceDir && !vpsRawDir
  });
  const traces = distillation.learning_events.map((event) => simulateLearningCycle(event));
  const layers = buildLayers({ sources, distillation, traces });
  const originalAutoL3 = buildOriginalAutoL3(traces);
  const minimalPositiveL3 = buildMinimalPositiveL3(traces);
  const comparison = compareModes(originalAutoL3, minimalPositiveL3);
  const violations = [...distillation.violations];

  if (layers.l1_distillates.compression_ratio >= 1) {
    violations.push("Layered distillation did not reduce token estimate on this sample.");
  }

  if (minimalPositiveL3.skills.some((skill) => skill.route_target !== "skill")) {
    violations.push("Minimal positive mode promoted a non-skill route.");
  }

  return {
    schema_version: "misa.memory_layer_review.v1",
    mode: "memory-layer-comparison",
    ok: violations.length === 0,
    source: {
      source_kind: vpsRawDir ? "vps_sanitized_conversation_artifacts" : "local_distillation_sources",
      source_dir: sourceDir ?? null,
      vps_raw_dir: vpsRawDir ?? null
    },
    layers,
    original_auto_l3: originalAutoL3,
    minimal_positive_l3: minimalPositiveL3,
    comparison,
    export_policy: {
      export_command: "npm run export-skills:misa",
      export_scope: "minimal_positive_l3_only",
      skill_promotion_contract: { ...SKILL_PROMOTION_CONTRACT },
      installs_skills: false,
      writes_persistent_memory: false,
      updates_vps: false,
      publication_allowed: false
    },
    safety: {
      production_authority: false,
      publication_allowed: false,
      live_effects: { ...LIVE_EFFECTS_OFF },
      blocked_operations: [...BLOCKED_OPERATIONS]
    },
    warnings: [
      "original_auto_l3 is a comparison simulation, not a production recommendation.",
      "minimal_positive_l3 exports local draft skills only; installation remains a separate human-approved action."
    ],
    violations
  };
}

export async function exportMinimalPositiveSkills({
  repoRoot = process.cwd(),
  sourceDir,
  vpsRawDir,
  outDir = path.join(repoRoot, "generated", "skill-exports")
} = {}) {
  const review = await reviewMemoryLayerComparison({ repoRoot, sourceDir, vpsRawDir });
  const outputRoot = path.isAbsolute(outDir) ? outDir : path.join(repoRoot, outDir);
  const skillsDir = path.join(outputRoot, "skills");
  await fs.mkdir(skillsDir, { recursive: true });

  const exported = [];
  for (const skill of review.minimal_positive_l3.skills) {
    const fileName = `${skill.skill_id}.md`;
    const rel = `skills/${fileName}`;
    const body = [
      `# ${skill.title}`,
      "",
      "## Status",
      "",
      "- layer: L3",
      "- state: validated_local_draft",
      "- publication_allowed: false",
      "- installation_allowed: false",
      "",
      "## Source",
      "",
      `- source_event_id: ${skill.source_event_id}`,
      `- source_cycle_id: ${skill.source_cycle_id}`,
      "",
      "## Procedure",
      "",
      ...skill.procedure_outline.map((step, index) => `${index + 1}. ${step}`),
      "",
      "## Boundaries",
      "",
      "- Do not write persistent memory.",
      "- Do not install into production Skill directories.",
      "- Do not update VPS.",
      "- Do not publish public-channel behavior.",
      ""
    ].join("\n");

    await fs.writeFile(path.join(skillsDir, fileName), body, "utf8");
    exported.push({
      skill_id: skill.skill_id,
      source_event_id: skill.source_event_id,
      route_target: skill.route_target,
      promotion_review: skill.promotion_review,
      path: rel,
      publication_allowed: false,
      installation_allowed: false
    });
  }

  const manifest = {
    schema_version: "misa.skill_export_manifest.v1",
    mode: "minimal-positive-skill-export",
    ok: review.ok,
    exported_count: exported.length,
    source_review: {
      mode: review.mode,
      source: review.source,
      comparison: review.comparison
    },
    exports: exported,
    safety: {
      production_authority: false,
      publication_allowed: false,
      installs_skills: false,
      writes_persistent_memory: false,
      updates_vps: false
    }
  };

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    ...manifest,
    output_dir: outputRoot
  };
}
