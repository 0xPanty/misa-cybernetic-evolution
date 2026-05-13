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
| GenericAgent | completed work can be crystallized into small reusable skills; active context should maximize information density | add a skill candidate index, bounded self-repair draft loop, and context-density gate over replay results | broad shell/tool authority, autonomous scheduler, automatic memory writes, production publication, desktop/browser/ADB live control |
| EvoMap/evolver | self-evolution benefits from wide mutation candidates, adaptive strategy switching, hard/soft failure classification, suppression, and blast-radius gates | add a local adaptive candidate gate: generate more candidates/signals first, filter with safety gates, verify surviving candidates, keep production hard-locked | daemon loop, Hub worker execution, marketplace/ATP auto-delivery, host-runtime `sessions_spawn` authority, automatic production writes |
| NousResearch/hermes-agent-self-evolution | self-evolution should compare multiple variants with train/validation/holdout data and Pareto-style scoring | add a local tournament gate after Qianxuesen preflight: generate variants, score them, choose a draft-only winner, record rejected variants as evidence, and use a local escalation gate to decide whether optional LLM review is worth the cost | automatic Skill writes, memory writes, LLM-owned route decisions, prompt/code auto-evolution, continuous production loop |
| Cybernetic Systems Engineering | control/data/state surfaces and minimal control input | use surface language only where it prevents real confusion | a heavy approval process for every small change |
| self-evolution | simple categories and experience summary template | use plain route labels and positive-value checks | Heartbeat/timer learning or unimplemented scripts |

## v0.2 Borrowing Rules

1. Borrow only what produces a runnable positive function.
2. Keep every v0.2 action dry-run.
3. Prefer small route decisions over broad governance.
4. Do not add a second planning system.
5. Do not touch live channel mechanics, provider routes, timers, or persistent
   memory writes.
6. Borrowing an external agent idea must pass the context-density review before
   it can become part of the Misa process.
7. v0.8 may generate more local candidates and learning signals, but production
   authority remains blocked until explicit human approval and separate live
   rollout evidence exist.
8. v0.17 may run aggressive candidate tournaments, but only inside the local
   draft sandbox; winner selection is not publication approval. Optional LLM
   review is gated by deterministic local escalation advice and cannot change
   routes or winners.

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
