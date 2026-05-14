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
  Object.freeze(["candidate_replay_failed", Object.freeze({
    kind: "replay_failure",
    level: "medium",
    reason: "failed replay should become damping or repair evidence before promotion"
  })]),
  Object.freeze(["repeated_failure_pattern", Object.freeze({
    kind: "reliability_failure",
    level: "medium",
    reason: "repeated failure pattern should be reviewed before runtime changes"
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
  })])
]);

export const PERCEPTION_SIGNAL_FAMILIES = Object.freeze([
  Object.freeze(["public_memory_risk", Object.freeze(["farcaster_public_memory_risk"])]),
  Object.freeze(["public_boundary", Object.freeze(["public_posting_boundary"])]),
  Object.freeze(["authority_boundary", Object.freeze(["explicit_user_boundary"])]),
  Object.freeze(["candidate_replay_failed", Object.freeze(["candidate_replay_failed"])]),
  Object.freeze(["overreaction_damping", Object.freeze(["avoid_overreaction", "single_failure"])]),
  Object.freeze(["repeated_failure", Object.freeze(["repeated_failure_pattern"])]),
  Object.freeze(["workflow", Object.freeze(["reusable_workflow"])]),
  Object.freeze(["user_preference", Object.freeze(["stable_user_preference"])]),
  Object.freeze(["project_fact", Object.freeze(["stable_project_fact"])]),
  Object.freeze(["public_reply_pattern", Object.freeze(["farcaster_reply_success"])])
]);
