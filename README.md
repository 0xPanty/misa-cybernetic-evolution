# Misa Cybernetic Evolution Layer

A control-theoretic learning plane for Hermes-style AI agents.

Misa Cybernetic Evolution Layer is a reference architecture for turning real
agent work into governed memory, skills, cases, and policy updates. It treats an
AI assistant as a cybernetic system: observable, controllable, delayed,
disturbed, and capable of learning only when the evidence supports it.

The project is designed for teams building long-running personal agents,
developer agents, social agents, and multi-channel assistants that must improve
without corrupting memory, breaking session continuity, or silently changing
production behavior.

## Why This Exists

Most agent systems can already talk, call tools, and write notes. The hard part
is not making them "learn more"; it is making sure the learning is:

- evidence-backed
- correctly routed
- validated before publication
- reversible
- auditable
- safe across live channels

This repository proposes a learning plane that sits beside the live runtime. The
agent can keep operating normally while the learning plane observes completed
work, identifies reusable patterns, drafts candidate changes, verifies them with
replay or shadow runs, and publishes only versioned artifacts with rollback
evidence.

## Core Idea

```text
Live Runtime
  Chat channels / tools / model providers / memory readers
        |
        v
Observation Plane
  session events / tool traces / skill attribution / feedback
        |
        v
Control Contract Plane
  setpoint / acceptance / guardrails / delay / rollback / boundary
        |
        v
Distillation and Identification Plane
  trajectory summary / error class / system identification
        |
        v
Routing Plane
  memory candidate / skill draft / case record / policy proposal / ignore
        |
        v
Evolution Plane
  create skill / improve skill / optimize trigger / memory patch / skip
        |
        v
Verification Plane
  static checks / replay / shadow / canary / approval
        |
        v
Publication and Governance
  registry / version / evidence log / rollback / dashboard
```

## Design Principles

1. Separate the live runtime from the learning plane.
2. Never promote a lesson without evidence.
3. Put stable bottom logic in memory; put reusable procedures in skills.
4. Put repeated failure modes in a case library.
5. Treat every permanent write as a controlled publication event.
6. Prefer replay, shadow, and canary validation over prompt confidence.
7. Keep one source of truth for each artifact type.
8. Make recovery faster than debate: version, rollback, and retain evidence.

## What It Borrows

This architecture combines several ideas:

- engineering cybernetics: feedback, stability, delay, noise, fault tolerance,
  optimal control, and simulation
- systems engineering: project-level control topology, owner boundaries, and
  frozen interfaces
- harness engineering: real tools, real logs, explicit evidence, and escalation
  thresholds
- skill evolution systems: session evidence, skill attribution, candidate
  generation, replay validation, versioned publication

The result is not a prompt pack. It is a governance layer for agent learning.

## Runtime Boundary

The first production rule is simple:

The learning plane should not be placed directly on the critical model path until
it has proven itself in shadow mode.

For a mature assistant, this means:

- do not replace the provider route first
- do not rewrite channel session mechanics first
- do not auto-start background timers first
- do not publish memory or skills from a single successful run

Start with observation and draft generation. Promote only after validation.

## Artifact Types

| Artifact | Purpose | Publication rule |
| --- | --- | --- |
| `LearningEvent` | Raw evidence from a completed turn or task | append-only |
| `TrajectorySummary` | Compact causal summary of a session | generated from events |
| `LearningItem` | Candidate memory, skill, case, or policy change | draft first |
| `SkillCandidate` | Proposed skill creation or update | replay before publish |
| `CaseRecord` | Known failure or recovery pattern | evidence-backed |
| `ControlContract` | Goal, guardrails, delay, rollback, and boundary | required for risky changes |
| `PublicationRecord` | Version, evidence, approval, and rollback data | immutable |

## Control Contract

Every non-trivial learning or runtime change starts with a short control
contract:

- Primary setpoint: what should improve
- Acceptance: how success is proven
- Guardrail metrics: what must not regress
- Sampling plan: where and how often to observe
- Known delays: CI, caches, queues, review, propagation
- Recovery target: how fast the system must return to safety
- Rollback trigger: when to stop and revert
- Boundary: what may be changed
- Coupling notes: what may be indirectly affected
- Actuator budget: which control inputs are allowed

See [CONTROL_CONTRACT.md](./CONTROL_CONTRACT.md).

## Verification Levels

| Level | Name | Purpose |
| --- | --- | --- |
| L0 | Static checks | schema, path, redaction, format, registry consistency |
| L1 | Replay | compare candidate behavior against historical tasks |
| L2 | Shadow | run beside production without changing live output |
| L3 | Canary | limited activation on low-risk traffic or tasks |
| L4 | Publication | versioned release with evidence and rollback |

## Damping Rules

These rules prevent unstable self-modification:

- Do not learn from silence.
- Do not store one-off success as long-term memory.
- Require repeated evidence before promotion.
- Cool down after repeated verifier failures.
- Use one primary controller per artifact.
- Treat provider routes, public posting, deletion, timers, and session mechanics
  as high-risk control inputs.
- Prefer smaller reversible decisions before large irreversible ones.

## Suggested Repository Layout

```text
.
├── README.md
├── ARCHITECTURE.md
├── CONTROL_CONTRACT.md
├── GOVERNANCE.md
├── SECURITY.md
├── docs/
│   ├── control-theory-mapping.md
│   ├── memory-routing.md
│   ├── skill-lifecycle.md
│   └── verification-matrix.md
├── schemas/
│   ├── learning_event.schema.json
│   ├── learning_item.schema.json
│   └── control_contract.schema.json
└── examples/
    └── control_contract.example.json
```

## Minimal Implementation Path

1. Record `LearningEvent` from completed tasks.
2. Generate trajectory summaries from events.
3. Route summaries into memory, skill, case, policy, or ignore queues.
4. Produce draft-only candidates.
5. Validate candidates with static checks and replay.
6. Publish versioned artifacts only after approval.
7. Run periodic optimization for duplicates, dead skills, drift, and cost.

## Metrics

Teams should measure the learning plane itself:

- learning precision
- replay win rate
- rollback MTTR
- memory pollution rate
- skill duplication rate
- human intervention rate
- external-channel safety incidents
- evidence coverage

## Status

This is a design-first v0.1 repository. It is intended to be used as a public
architecture blueprint and implementation scaffold.

## License

Apache-2.0. See [LICENSE](./LICENSE).
