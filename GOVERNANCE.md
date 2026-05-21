# Governance

## Artifact Lifecycle

```text
observed -> summarized -> routed -> drafted -> verified -> approved -> published
                              |          |          |          |
                              v          v          v          v
                    ignored / damping  rejected   rejected   rolled back
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

### Damping

Route to damping when the safest action is to hold:

- single transient failure
- weak evidence
- possible overreaction
- repeated verifier failure
- high-risk actuator without enough evidence

Damping is a positive route. It prevents Misa from turning one noisy signal into
a permanent memory, skill, or policy.

## Damping and Cooldown

The learning plane should resist oscillation:

- one event may create a draft, not a permanent rule
- repeated evidence is required for promotion
- repeated rejection triggers cooldown
- verifier failure blocks publication
- conflicting controllers must pause and escalate

The default thresholds live in
[docs/current/damping-rules.md](./docs/current/damping-rules.md) and
[schemas/damping_rules.schema.json](./schemas/damping_rules.schema.json).

Run the local dry-run gate before publishing a governance change:

```bash
npm run simulate:misa
npm run precheck
```

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

## Misa Launch Profile

Misa can use this repository as a structure reference and local precheck layer:

- [docs/current/misa-readonly-integration.md](./docs/current/misa-readonly-integration.md)
- [examples/misa_readonly_integration.example.json](./examples/misa_readonly_integration.example.json)

The local precheck keeps the v0.2 shape honest: docs, schemas, examples, and
tests should run cleanly, and this repo should not quietly become a Misa
background service.

## Misa Learning Loop v0.2

The v0.2 simulator routes Misa-style events into:

- memory candidates;
- skill drafts;
- case records;
- policy candidates;
- damping holds;
- ignored noise.

Run:

```bash
npm run simulate:misa
```

This is dry-run only. A `memory` route does not write Zilliz. A `skill` route
does not publish a Skill. A `policy` route does not change runtime behavior.

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

## Governance Skill Template

Reusable agent procedures should start from
[docs/templates/governance-skill-template.md](./docs/templates/governance-skill-template.md).

The template requires:

- trigger conditions;
- not-for conditions;
- read and write boundaries;
- damping rules;
- verification plan;
- rollback notes;
- evidence ids.

Do not publish a Skill from a single successful run. One event may create a
draft only.
