# Skill Control Intake Template

This template turns a skill description into a small control contract that
Qianxuesen can supervise. It is designed for humans or weaker LLMs: answer the
fields directly, cite evidence, and avoid open-ended interpretation.

## Intake Fields

```json
{
  "skill_id": "",
  "skill_name": "",
  "owner_surface": "",
  "source_ref": "",
  "primary_goal": "",
  "not_goals": [],
  "inputs": [],
  "outputs": [],
  "allowed_actions": [],
  "forbidden_actions": [],
  "allowed_memory_classes": [],
  "forbidden_memory_classes": [],
  "public_output_policy": "none | draft_only | draft_or_gated_publish | gated_publish_allowed",
  "persistent_write_policy": "forbidden | draft_only | gated_only | allowed",
  "risk_triggers": [],
  "expected_routes": [],
  "optimization_targets": [],
  "success_signals": [],
  "allowed_evolution_space": [],
  "forbidden_evolution_space": [],
  "promotion_rules": [],
  "rollback_triggers": [],
  "human_review_required_when": [],
  "llm_judge_recommended_when": []
}
```

## Evidence Rule

For every important field, keep a short evidence ref:

```json
{
  "id": "draft-not-publish",
  "summary": "The skill drafts replies but does not own publish authority.",
  "confidence": "high",
  "needs_review": false
}
```

If the skill doc is unclear, set `confidence` to `low` or `needs_review` to
`true`. Do not invent missing authority.

## Control Mapping

Every skill contract must map to the Qianxuesen control loop:

| Control slot | Meaning |
| --- | --- |
| target | what the skill should improve |
| observation | what runtime evidence Qianxuesen can see |
| comparison | how actual behavior is compared with the target |
| correction | what happens when behavior drifts |
| damping | how repeated evidence is separated from one-off noise |

## Evolution Space

Do not only write boundaries. Also name the safe runway where the skill may
improve:

- scoring weights
- retrieval hints
- draft prompt variants
- cooldown or damping rules
- reusable success patterns

Forbidden evolution space should cover authority roots, private memory policy,
credentials, live publishing, and direct durable writes.

## Farcaster Reply Operator

The committed example is:

- [../examples/skill-evolution/farcaster_reply_operator.contract.json](../examples/skill-evolution/farcaster_reply_operator.contract.json)
- [../examples/behavior-events/farcaster_public_reply.event.json](../examples/behavior-events/farcaster_public_reply.event.json)

It proves the first public behavior adapter shape: public reply drafts can
produce replay-required optimization candidates without gaining publish
authority.
