# Skill Lifecycle

## States

```text
draft -> verified -> approved -> published -> deprecated
   |         |          |             |
   v         v          v             v
rejected  rejected   rejected      rolled back
```

## Candidate Actions

- create skill
- improve skill
- optimize trigger
- merge duplicate skills
- deprecate skill
- skip

## Skill Quality Requirements

A published skill should have:

- clear trigger conditions
- not-for conditions
- exact tool or file boundaries when needed
- validation scenarios
- evidence links
- version history
- rollback target

Start new candidates from
[templates/governance-skill-template.md](./templates/governance-skill-template.md).

In v0.2, Skill candidates can be produced by the Misa learning-loop simulator
only as drafts:

```bash
npm run simulate:misa
```

The simulator helps decide whether a lesson is actually a Skill. Stable facts
should go to memory, repeated failures to cases, behavior boundaries to policy,
and weak evidence to damping.

## Replay Validation

Replay compares candidate behavior with baseline behavior on historical tasks.

Publish only when:

- candidate passes static checks
- candidate is at least as safe as baseline
- candidate improves the target setpoint
- guardrails do not regress

## Description Optimization

Many skill failures are trigger failures. Optimizing the description can be safer
than rewriting the skill body.

When in doubt:

- prefer trigger refinement over body rewrite
- preserve environment-specific facts
- skip speculative changes
