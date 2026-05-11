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

## v0.13 Quickstart

This repository is safe to run locally. The default checks are dry-run checks:
they read repository files, validate schemas, and report governance failures.
They do not call model providers, write memories, start timers, or touch live
channels.

```bash
npm install
npm run simulate:misa
npm run crystallize:misa
npm run self-repair:misa -- --no-verify
npm run distill:misa
npm run density:misa
npm run adaptive:misa
npm run intake:misa
npm run rollup:misa
npm run evolution:evaluate:misa
npm run memory-layer:misa
npm run export-skills:misa
npm run repair-ticket:misa -- --dry-run
npm run validate:schemas
npm run precheck
npm test
```

Expected result:

- all JSON schemas compile;
- all checked examples validate;
- the Misa learning-loop simulation routes synthetic and redacted real-ish
  example events into memory, skill, case, policy, and damping candidates
  without live effects;
- the skill crystallization index extracts staged skill candidates while keeping
  publication disabled;
- the self-repair draft runner can generate skill drafts, repair plans, and run
  logs without touching production runtime surfaces;
- the GenericAgent-inspired context-density review accepts only high-signal,
  evidence-backed candidates and explicitly rejects high-authority runtime
  imports;
- the EvoMap-inspired adaptive candidate gate generates a wider set of local
  learning signals, rejects or holds weak candidates, and sends only safe
  candidates into validation;
- the signal-intake cadence contract separates 30-minute signal scans from
  daily durable learning, keeps chat distillation summary-first, and treats
  Farcaster as per-reply defense plus daily learning rollup;
- the v0.13 local session distiller turns redacted local windows, failure logs,
  and Farcaster audits into learning events with redaction, segmentation, local
  token vectors, and no Zilliz/model/external API dependency;
- the memory-layer comparison reports L0 source refs, L1 distillates, L2 route
  candidates, and two L3 strategies so broad auto-skill promotion can be
  compared against the minimal positive export path, including mixed-route
  pressure where skill-like signals are intentionally suppressed by safer routes;
- the skill export command writes local L3 draft skills only from the minimal
  positive path and does not install Skills, write memory, or update VPS;
- the repair-ticket queue turns memory-layer over-promotion evidence into
  Codex-ready local tickets with reproduction commands, acceptance criteria,
  edit scope, and explicit non-goals;
- the v0.10 signal rollup connects signal adapters, the candidate queue, and
  the daily Qianxuesen rollup without adding live runtime authority;
- the v0.11 candidate preflight gate turns daily-rollup candidates into local
  optimization preflights, and only reportable candidates are queued for Huan
  review;
- the dry-run precheck passes required-file, governance, damping, and secret
  assignment checks;
- the minimal test suite passes.

## Misa Integration Verdict

This version can be used as Misa's official structure reference, local precheck
layer, dry-run learning-loop simulator, and read-only replay fixture suite.

That is a real launch shape: Misa can rely on the docs, schemas, templates, and
checks when designing future learning/memory/skill changes.

What this v0.13 does not include is a background runtime service. It does not
start timers, change Discord/Farcaster session mechanics, call model providers,
post publicly, publish skills, or write Misa memory by itself.

See [docs/misa-readonly-integration.md](./docs/misa-readonly-integration.md).
See [docs/misa-learning-loop-v0.2.md](./docs/misa-learning-loop-v0.2.md) for
the runnable learning-loop simulation.
See [docs/misa-learning-replay-v0.3.md](./docs/misa-learning-replay-v0.3.md)
for the read-only replay fixture layer.
See [docs/misa-learning-evidence-v0.4.md](./docs/misa-learning-evidence-v0.4.md)
for the artifact evidence and candidate review gate.
See [docs/skill-crystallization-v0.5.md](./docs/skill-crystallization-v0.5.md)
for the read-only skill crystallization index.
See [docs/self-repair-v0.6.md](./docs/self-repair-v0.6.md) for the bounded
self-repair draft runner.
See [docs/genericagent-context-density-v0.7.md](./docs/genericagent-context-density-v0.7.md)
for the GenericAgent-inspired information-density gate.
See [docs/evolver-adaptive-gate-v0.8.md](./docs/evolver-adaptive-gate-v0.8.md)
for the EvoMap-inspired adaptive candidate gate.
See [docs/signal-intake-cadence-v0.9.md](./docs/signal-intake-cadence-v0.9.md)
for the session-distiller, failure-log, and Farcaster intake cadence contract.
See [docs/signal-candidate-rollup-v0.10.md](./docs/signal-candidate-rollup-v0.10.md)
for the local signal adapter -> candidate queue -> daily rollup chain.
See [docs/evolution-candidate-preflight-v0.11.md](./docs/evolution-candidate-preflight-v0.11.md)
for the candidate preflight -> report queue gate.
See [docs/local-session-distillation-v0.12.md](./docs/local-session-distillation-v0.12.md)
for the local window -> distillate -> learning event intake step.
See [docs/window-distillation-pipeline-v0.13.md](./docs/window-distillation-pipeline-v0.13.md)
for the full local redaction -> segmentation -> token vector -> signal extraction pipeline.
See [docs/memory-layer-skill-export-v0.13.md](./docs/memory-layer-skill-export-v0.13.md)
for the GenericAgent-inspired L0-L4 comparison and local skill export path.
See [docs/repair-ticket-v0.13.md](./docs/repair-ticket-v0.13.md)
for the local Codex repair-ticket queue.

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

## Misa Learning Loop v0.13

v0.2 adds a deterministic dry-run loop for Misa:

```text
Misa event -> observe -> identify -> route -> draft -> verify -> hold for later publication
```

The router does not treat every lesson as memory. It can route a lesson to:

- `memory`: stable facts and preferences
- `skill`: repeatable procedures
- `case`: repeated failures and recovery patterns
- `policy`: future behavior boundaries
- `damping`: do not overreact yet
- `ignore`: unsupported noise

Run it locally:

```bash
npm run simulate:misa
```

This is L1 read-only replay over local fixtures. It proves the route model is
runnable, positive, and stable for declared route expectations; it does not
publish anything.

v0.4 adds the smallest useful evidence gate from SkillClaw-style systems:
`injected` artifacts do not count as attribution evidence. Only artifacts that
were explicitly `read` or `modified` can justify improving an existing skill.
Otherwise, a repeatable workflow can only stage a new candidate. Every generated
trace also carries `candidate_review`, and publication remains disabled.

v0.5 adds `npm run crystallize:misa`, a GenericAgent-inspired read-only index
over staged skill routes. It produces skill crystallization candidates for
Misa/Hermes reference use, but it still does not publish skills or write memory.

v0.6 adds `npm run self-repair:misa`. It can turn staged skill candidates into
draft skill files, repair plans, command logs, and final reports under
`generated/` and `runs/self-repair/`. A passing run marks the output as
`validated_draft`; `--no-verify` only marks `draft_generated`. It still cannot
publish the Skill or change production.

v0.7 adds `npm run density:misa`, a second GenericAgent-inspired gate. It borrows
contextual information density, layered pointer memory, and action-verified
memory discipline, while explicitly rejecting GenericAgent's broad tool
authority, autonomous scheduler, automatic memory writes, production Skill
publication, and desktop/browser/ADB control.

v0.8 adds `npm run adaptive:misa`, an EvoMap-inspired candidate gate. It lets
Misa generate more local candidates and learning signals first, then filters
them through evidence, live-effect, command-allowlist, suppression, and
production-authority gates. Good candidates can enter validation; production
authority remains false.

v0.9 adds `npm run intake:misa`, a cadence contract for the real signal feeds
around Misa. Chat windows are distilled and scanned every 30 minutes, but
durable Qianxuesen learning is a daily rollup. Session summaries are read
before any source-fragment lookup. Distiller failures enter an exception queue.
Farcaster checks candidate replies before posting, but only sends pooled
behavior feedback into daily learning. Extra judge API calls are conditional,
not the default.

v0.10 adds `npm run rollup:misa`, a local closed-loop report. It adapts
session-distiller summaries, failure logs, and Farcaster behavior signals into a
candidate queue, then summarizes that queue through a 24-hour daily rollup. It
is still local and draft-only: no scheduler, no provider call, no Farcaster
post, no persistent memory write, no Skill publication, and no VPS update.

v0.11 adds `npm run evolution:evaluate:misa`, a local candidate preflight gate.
It starts after the v0.10 daily rollup has produced optimization candidates.
Each candidate must pass local simulation checks before it can enter the
`report_queue` for Huan review. Held or suppressed candidates stay internal and
become more-evidence or failure-experience records. Passing preflight is not
approval to write memory, publish Skills, post publicly, start services, or
update VPS.

v0.12 adds `npm run distill:misa`, a local session-distillation step before
candidate generation. It reads redacted local window sources from
`examples/misa-distillation/`, emits compact learning events, and then those
events flow through the same simulator, candidate queue, daily rollup, and
preflight gate. It does not use Zilliz as an intake proxy, does not require
vector lookup, and reports `0` LLM API calls plus `0` external API calls.

v0.13 expands that distiller into the full local window pipeline. It accepts
`chat_window`, `failure_log`, and `farcaster_audit` sources, redacts raw text,
splits it into source-referenced segments, builds a local `local-token-vector-v1`
index, extracts signals, and emits fixture-shaped learning events. The vector
index is local and deterministic. It is not Zilliz and it does not call an
embedding provider.

v0.13 also adds `npm run memory-layer:misa` and `npm run export-skills:misa`.
The first command compares the broad GenericAgent-style idea of sending every
verified lesson to L3 skills against the safer Misa path: only verified
`skill`-route lessons become local L3 drafts. The export command writes only
those minimal L3 drafts into a local export folder; it never installs them.

v0.13 adds `npm run repair-ticket:misa` as a local maintenance queue for this
new memory-layer path. It turns over-promotion evidence into JSON and Markdown
repair tickets for later Codex work. It does not fix automatically, write
memory, install skills, touch runtime state, or update VPS.

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

See [docs/damping-rules.md](./docs/damping-rules.md) for the enforceable
defaults and [schemas/damping_rules.schema.json](./schemas/damping_rules.schema.json)
for the machine-readable form.

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
│   ├── damping-rules.md
│   ├── misa-learning-loop-v0.2.md
│   ├── misa-learning-replay-v0.3.md
│   ├── misa-readonly-integration.md
│   ├── evolver-adaptive-gate-v0.8.md
│   ├── signal-candidate-rollup-v0.10.md
│   ├── local-session-distillation-v0.12.md
│   ├── window-distillation-pipeline-v0.13.md
│   ├── memory-routing.md
│   ├── source-synthesis.md
│   ├── skill-lifecycle.md
│   ├── verification-matrix.md
│   └── templates/
│       └── governance-skill-template.md
├── schemas/
│   ├── damping_rules.schema.json
│   ├── integration_profile.schema.json
│   ├── adaptive_candidate_gate.schema.json
│   ├── signal_candidate_rollup.schema.json
│   ├── local_distillation_source.schema.json
│   ├── session_distillation_review.schema.json
│   ├── learning_cycle_trace.schema.json
│   ├── misa_learning_fixture.schema.json
│   ├── learning_event.schema.json
│   ├── learning_item.schema.json
│   └── control_contract.schema.json
├── examples/
│   ├── control_contract.example.json
│   ├── damping_rules.example.json
│   ├── adaptive_candidate_gate.example.json
│   ├── signal_candidate_rollup.example.json
│   ├── misa-distillation/
│   ├── learning_event.example.json
│   ├── learning_item.example.json
│   ├── learning_cycle_trace.example.json
│   ├── misa-learning/
│   │   ├── memory_user_style.fixture.json
│   │   ├── skill_recovery_workflow.fixture.json
│   │   ├── case_provider_timeout.fixture.json
│   │   ├── case_retrieval_noise_realish.fixture.json
│   │   ├── damping_provider_retry_realish.fixture.json
│   │   ├── policy_public_posting.fixture.json
│   │   ├── policy_timer_restore_realish.fixture.json
│   │   ├── memory_project_boundary_realish.fixture.json
│   │   ├── skill_readonly_audit_realish.fixture.json
│   │   ├── damping_candidate_replay_failed.fixture.json
│   │   └── damping_single_failure.fixture.json
│   ├── misa_readonly_control_contract.example.json
│   └── misa_readonly_integration.example.json
├── scripts/
│   ├── precheck.mjs
│   ├── adaptive-candidates.mjs
│   ├── distill-misa.mjs
│   ├── signal-rollup.mjs
│   ├── simulate-learning.mjs
│   └── validate-schemas.mjs
└── test/
    └── governance.test.mjs
```

## Minimal Implementation Path

1. Record `LearningEvent` from completed tasks.
2. Generate trajectory summaries from events.
3. Route summaries into memory, skill, case, policy, damping, or ignore queues.
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

This is a v0.13 engineering scaffold. It is ready to publish as a public
architecture blueprint with local dry-run validation and a runnable Misa
learning-loop simulation plus read-only replay fixtures and local distillation
sources.

Current scope:

- sidecar learning-plane architecture;
- control contract schema and example;
- learning event and learning item schemas and examples;
- damping rules schema and documentation;
- Misa launch profile for reference/precheck use;
- Misa learning-loop simulator and route expectation fixtures;
- full local window distillation without Zilliz proxy or API calls;
- L0-L4 memory-layer comparison and minimal local Skill export;
- GenericAgent context-density gate;
- EvoMap-inspired adaptive candidate gate;
- signal candidate queue and daily rollup report;
- candidate preflight and report queue;
- source synthesis for Kura, SkillClaw, CSE, and self-evolution references;
- governance Skill template;
- local schema validation, dry-run precheck, and minimal tests.

Deferred scope:

- runtime brain replacement;
- gbrain/cbrain adapter work;
- live channel session changes;
- provider route changes;
- background timers;
- automatic memory or skill publication.

## License

Apache-2.0. See [LICENSE](./LICENSE).
