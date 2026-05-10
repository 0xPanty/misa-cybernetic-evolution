# Source Synthesis

This document keeps v0.2 grounded. It records what the project borrows from each
source, what it changes for Misa, and what it deliberately does not import.

The goal is useful engineering adaptation, not copying every idea.

## Core Intent

Misa Cybernetic Evolution Layer is not mainly a memory manager. It is a
control-theoretic learning loop:

```text
observe -> identify error -> route lesson -> draft change -> verify -> publish later
```

Memory is one output. Skills, cases, policies, damping decisions, and ignored
noise are also valid outputs.

## Sources

| Source | Useful idea | Adaptation for Misa | Not imported into v0.2 |
| --- | --- | --- | --- |
| Engineering cybernetics | feedback, error, delay, stability, simulation | treat learning as a controlled loop with dry-run verification | abstract theory without runnable checks |
| Kura Hermes three-stage article | collect, analyze, then land the result | keep Misa's learning plane beside runtime first | blind automation or live writeback |
| SkillClaw | session evidence can evolve skills after real interaction | borrow the summarize/aggregate/verify shape | proxy integration, daemon evolution, auto skill publication |
| GenericAgent | completed work can be crystallized into small reusable skills | add a read-only skill candidate index over replay results | broad shell/tool authority, autonomous scheduler, automatic memory writes |
| Cybernetic Systems Engineering | control/data/state surfaces and minimal control input | use surface language only where it prevents real confusion | a heavy approval process for every small change |
| self-evolution | simple categories and experience summary template | use plain route labels and positive-value checks | Heartbeat/timer learning or unimplemented scripts |

## v0.2 Borrowing Rules

1. Borrow only what produces a runnable positive function.
2. Keep every v0.2 action dry-run.
3. Prefer small route decisions over broad governance.
4. Do not add a second planning system.
5. Do not touch live channel mechanics, provider routes, timers, or persistent
   memory writes.

## Route Model

| Route | Meaning | Example |
| --- | --- | --- |
| `memory` | stable fact, preference, or long-term constraint | Chinese-first, conclusion-first response style |
| `skill` | repeatable procedure | recovery starts from the three core Misa project files |
| `case` | repeated failure or recovery pattern | provider timeout handling |
| `policy` | future behavior boundary | no real Farcaster post without explicit approval |
| `damping` | do not overreact yet | one transient failure is not enough to rewrite routes |
| `ignore` | unsupported signal | one-off noise |

## Why This Is Positive

The v0.2 simulator makes the learning loop visible before it affects Misa. It
shows whether a lesson becomes memory, skill, case, policy, or damping, and it
keeps the result as a draft. That reduces memory pollution and prevents
overreaction while still turning repeated useful experience into structured
candidate improvements.
