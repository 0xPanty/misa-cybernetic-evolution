# Governance

## Artifact Lifecycle

```text
observed -> summarized -> routed -> drafted -> verified -> approved -> published
                              |          |          |          |
                              v          v          v          v
                           ignored    rejected   rejected   rolled back
```

## Promotion Rules

### Memory

Promote to memory only when the lesson is stable bottom logic:

- durable user preference
- stable project fact
- persistent constraint
- proven operating principle

Do not promote:

- one-off task details
- unsupported guesses
- transient mood
- single-run success
- unverified correction

### Skill

Promote to skill when the lesson is a reusable procedure:

- repeated workflow
- tool sequence
- verification recipe
- channel-specific operating pattern
- recovery procedure

Skill candidates must pass replay or equivalent validation before publication.

### Case Library

Promote to case when the lesson is a failure or recovery pattern:

- repeated error signature
- known provider failure
- tool misuse pattern
- rollback recipe
- diagnostic decision tree

### Policy

Promote to policy only when the rule changes future behavior. Policy updates
need the strongest validation because they can affect many tasks.

## Damping and Cooldown

The learning plane should resist oscillation:

- one event may create a draft, not a permanent rule
- repeated evidence is required for promotion
- repeated rejection triggers cooldown
- verifier failure blocks publication
- conflicting controllers must pause and escalate

## Owner Matrix

| Owner | Responsibility |
| --- | --- |
| Runtime owner | live channel behavior and user-visible output |
| Memory owner | durable facts and preference integrity |
| Skill owner | reusable procedures and trigger descriptions |
| Case owner | known failures and recovery patterns |
| Governance owner | publication policy, rollback, metrics |

## High-Risk Changes

These require explicit approval:

- public posting behavior
- provider route changes
- session mechanics
- background timers
- deletion or pruning
- persistent memory writes from weak evidence
- security or redaction policy changes

## Evidence Requirements

A publication record should include:

- source event ids
- trajectory summary
- candidate diff
- validation result
- risk class
- rollback target
- approver or gate id

No evidence, no publication.
