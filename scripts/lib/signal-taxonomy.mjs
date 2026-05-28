export const PERCEPTION_ROUTE_PRIORITY = Object.freeze({
  policy: 95,
  damping: 82,
  case: 76,
  skill: 68,
  memory: 54,
  ignore: 20
});

export const PERCEPTION_RISK_SIGNAL_HINTS = Object.freeze([
  Object.freeze(["farcaster_public_memory_risk", Object.freeze({
    kind: "public_boundary",
    level: "high",
    reason: "public memory risk needs policy attention before any downstream learning"
  })]),
  Object.freeze(["public_posting_boundary", Object.freeze({
    kind: "public_boundary",
    level: "high",
    reason: "public channel behavior must stay behind approval"
  })]),
  Object.freeze(["explicit_user_boundary", Object.freeze({
    kind: "authority_boundary",
    level: "medium",
    reason: "explicit user boundary should be preserved before routing"
  })]),
  Object.freeze(["context_injection_risk", Object.freeze({
    kind: "context_boundary",
    level: "high",
    reason: "external context injection can change model behavior and must stay behind policy review"
  })]),
  Object.freeze(["memory_provider_takeover_risk", Object.freeze({
    kind: "memory_authority_boundary",
    level: "high",
    reason: "external memory providers must not take over Hermes/Zilliz memory authority"
  })]),
  Object.freeze(["candidate_replay_failed", Object.freeze({
    kind: "replay_failure",
    level: "medium",
    reason: "failed replay should become damping or repair evidence before promotion"
  })]),
  Object.freeze(["repeated_failure_pattern", Object.freeze({
    kind: "reliability_failure",
    level: "medium",
    reason: "repeated failure pattern should be reviewed before runtime changes"
  })]),
  Object.freeze(["external_framework_change", Object.freeze({
    kind: "external_drift",
    level: "medium",
    reason: "external framework or protocol changes can invalidate old skill behavior"
  })]),
  Object.freeze(["competitor_change", Object.freeze({
    kind: "competitive_pressure",
    level: "medium",
    reason: "competitor or adjacent-framework changes can create useful evolution pressure"
  })]),
  Object.freeze(["knowledge_gap", Object.freeze({
    kind: "knowledge_gap",
    level: "medium",
    reason: "known uncertainty should become research evidence before behavior changes"
  })]),
  Object.freeze(["research_needed", Object.freeze({
    kind: "research_needed",
    level: "medium",
    reason: "explicit research need should be captured before generating variants"
  })]),
  Object.freeze(["user_correction", Object.freeze({
    kind: "user_correction",
    level: "medium",
    reason: "user corrections are strong evidence that current behavior needs calibration"
  })])
]);

export const PERCEPTION_NOVELTY_SIGNAL_HINTS = Object.freeze([
  Object.freeze(["reusable_workflow", Object.freeze({
    kind: "workflow_candidate",
    reason: "possible repeatable workflow worth downstream skill evaluation"
  })]),
  Object.freeze(["stable_project_fact", Object.freeze({
    kind: "project_fact_candidate",
    reason: "stable project fact may help memory routing after validation"
  })]),
  Object.freeze(["stable_user_preference", Object.freeze({
    kind: "user_preference_candidate",
    reason: "stable user preference may help memory routing after validation"
  })]),
  Object.freeze(["farcaster_reply_success", Object.freeze({
    kind: "public_reply_pattern",
    reason: "successful public reply pattern is useful only with public-boundary checks"
  })]),
  Object.freeze(["external_framework_change", Object.freeze({
    kind: "external_framework_candidate",
    reason: "external framework drift may justify a research digest or skill variant"
  })]),
  Object.freeze(["competitor_change", Object.freeze({
    kind: "competitor_candidate",
    reason: "competitor change may be useful as external evolution pressure"
  })]),
  Object.freeze(["knowledge_gap", Object.freeze({
    kind: "research_gap_candidate",
    reason: "knowledge gaps should be researched before becoming candidates"
  })]),
  Object.freeze(["research_needed", Object.freeze({
    kind: "research_digest_candidate",
    reason: "explicit research need may become a research digest candidate"
  })]),
  Object.freeze(["repeated_terminology", Object.freeze({
    kind: "terminology_candidate",
    reason: "repeated domain terms can indicate missing external or conceptual context"
  })])
]);

export const PERCEPTION_SIGNAL_FAMILIES = Object.freeze([
  Object.freeze(["public_memory_risk", Object.freeze(["farcaster_public_memory_risk"])]),
  Object.freeze(["public_boundary", Object.freeze(["public_posting_boundary"])]),
  Object.freeze(["authority_boundary", Object.freeze(["explicit_user_boundary"])]),
  Object.freeze(["context_boundary", Object.freeze(["context_injection_risk"])]),
  Object.freeze(["memory_authority_boundary", Object.freeze(["memory_provider_takeover_risk"])]),
  Object.freeze(["candidate_replay_failed", Object.freeze(["candidate_replay_failed"])]),
  Object.freeze(["overreaction_damping", Object.freeze(["avoid_overreaction", "single_failure"])]),
  Object.freeze(["repeated_failure", Object.freeze(["repeated_failure_pattern"])]),
  Object.freeze(["external_framework_change", Object.freeze(["external_framework_change"])]),
  Object.freeze(["competitor_change", Object.freeze(["competitor_change"])]),
  Object.freeze(["knowledge_gap", Object.freeze(["knowledge_gap", "research_needed"])]),
  Object.freeze(["user_correction", Object.freeze(["user_correction"])]),
  Object.freeze(["repeated_terminology", Object.freeze(["repeated_terminology"])]),
  Object.freeze(["workflow", Object.freeze(["reusable_workflow"])]),
  Object.freeze(["user_preference", Object.freeze(["stable_user_preference"])]),
  Object.freeze(["project_fact", Object.freeze(["stable_project_fact"])]),
  Object.freeze(["public_reply_pattern", Object.freeze(["farcaster_reply_success"])])
]);
