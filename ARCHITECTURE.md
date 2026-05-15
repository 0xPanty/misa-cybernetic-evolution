# Architecture

## Scope

Misa Cybernetic Evolution Layer is a sidecar learning plane for AI agents. It
does not require the live assistant to route model traffic through a new proxy at
the beginning. The initial integration is observation-only.

## Current Line

The current package line is `0.25.0`.

Versioned v0.x references later in this file are history and feature-origin
anchors. They do not create separate current lines; the current command surface
is the v0.25 shadow chain described here.

For public users, the clone-time path is:

```text
npm ci -> npm run doctor -> npm run bootstrap:local
```

The live system remains Misa/Hermes. This repository is the read-only
control-learning sidecar: it turns redacted evidence and existing
Hermes/Zilliz artifacts into local distillates, routed candidates, repair
tickets, work orders, seeded work-order variants, work-order quality evaluation
with issue/PR-shaped dev/test samples, vector-memory dry-run metadata, a
default local vector store, retrieval-ranker checks, session-distiller review
findings, and observe-only Hermes runtime plugin/adapter reports.

Plain version:

```text
evidence -> distill -> route -> candidate -> work order variants -> quality eval -> work order -> owner or primary agent
```

Candidate records and vector-store records do not equal live memory. The default
local store may write ignored runtime files under `runs/local-vector-store/`,
but anything that writes production memory, writes Zilliz, changes provider
routes, posts publicly, starts timers, or touches VPS remains outside this
sidecar unless the human owner explicitly approves a separate rollout.

## Planes

### 1. Live Runtime

The production assistant remains responsible for user interaction, tool calls,
model routing, memory reads, and channel-specific behavior.

Examples:

- chat channels
- social channels
- mail channels
- model providers
- tool runners
- memory readers

The learning plane must not silently alter this layer.

### 2. Observation Plane

The observation plane collects append-only evidence:

- session id
- channel
- task type
- model/provider metadata
- tools used
- skill attribution
- feedback
- latency and cost
- outcome estimate
- risk class
- redaction status

It should avoid storing raw private content when hashes, summaries, or redacted
snippets are enough.

### 3. Control Contract Plane

This plane turns ambiguous improvement ideas into controlled engineering work.
It defines setpoints, acceptance criteria, guardrails, sampling, delay budget,
rollback triggers, boundaries, and actuator budget.

Any change touching public output, session continuity, provider routes, deletion,
timers, or persistent memory requires a control contract.

### 4. Distillation and Identification Plane

This plane converts raw observations into causal summaries:

- what the user wanted
- what the agent tried
- which tools and skills mattered
- where errors occurred
- what feedback was received
- what reusable pattern may exist

The output is not yet memory. It is evidence for routing.

### 4.1 Hermes/Zilliz Mapping Bridge

Hermes/Zilliz and Qianxuesen stay separate.

Hermes/Zilliz owns memory distillation and retrieval evidence: summaries, chunk
refs, journal refs, audit refs, and quality/risk results. Qianxuesen owns
control learning: routing, damping, repair tickets, work-order handoff, and
closed-loop optimization.

The v0.15 mapper is only the bridge. It translates existing Hermes/Zilliz
distillation output into `local_distillation_source`, learning events, and
repair/work-order routing input. It must not copy Zilliz, create embeddings,
write the vector store, write production journals, post publicly, or mutate Misa
memory.

Default runtime assertions are fixed at:

- LLM API calls: `0`
- external API calls: `0`
- AI second-pass: off
- embedding creation: false
- Zilliz write: false
- production journal write: false
- public send: false
- autonomous execution: false

### 4.2 Runtime Adapter Bridge

Runtime adapters are thin plugs, not new learning controllers. Hermes is the
first concrete one: the adapter observes Hermes plugin hooks, `skill_manage`,
`memory`, `session_search`, and curator/background-review traces, then turns
them into Qianxuesen research digests or replay-required evolution candidates.
The installable sample under `examples/hermes-runtime-plugin` only writes local
NDJSON and can be checked with `npm run hermes:plugin:doctor`.

The universal rule stays the same for other frameworks: the framework carries
runtime events, while Qianxuesen owns route, replay, tournament, and promotion.
Each framework still needs a small adapter because hooks and tool names differ.
The shared contract keeps those adapters replaceable.

### 5. Routing Plane

The router decides the artifact class:

- memory candidate
- skill draft
- case record
- policy proposal
- damping hold
- ignored noise

The key rule:

Stable bottom logic goes to memory. Reusable procedures go to skills. Repeated
failure and recovery patterns go to cases. Behavior boundaries go to policy.
Thin or one-off evidence goes to damping or ignore.

### 6. Evolution Plane

The evolution plane can propose:

- create skill
- improve skill
- optimize skill trigger
- merge duplicate skills
- deprecate skill
- patch memory
- create known-failure case
- skip

It produces draft artifacts only.

### 7. Verification Plane

The verifier evaluates candidates through layered gates:

- L0 static checks
- L1 replay
- L2 shadow
- L3 canary
- L4 publication

The verifier should compare candidate behavior against baseline behavior instead
of relying on model confidence.

The current local confidence chain is grouped by phase and kept canonical in
[docs/verification-matrix.md](./docs/verification-matrix.md). Architecture
describes what the verifier proves; the verification matrix owns the exact
command order.

These commands are dry-run checks. They do not call providers, start timers,
write memory, publish artifacts, post publicly, or change live channel behavior.

Historical version detail lives in
[docs/changelog.md](./docs/changelog.md). The important current rule is that
the precheck chain must show which phase failed: static files and versions,
machine contracts, local smoke, bridge checks, or current-line vector/session
review.

The current-line smoke and calibration commands are narrower shadow guards. They
cover session review, work-order routing, tournament, vector classification,
retrieval ranking, skill-evolution supervision, Hermes runtime adapter
normalization, Zilliz adapter dry-run, route coverage, repair/work-order
mapping, perception hints, and judge-escalation value without touching VPS or
production state. The signal-layer details live in
[docs/current-line-calibration-v0.21.md](./docs/current-line-calibration-v0.21.md).

The GitHub Actions workflow `.github/workflows/current-line-shadow.yml` pins
that same shadow posture for pull requests and `main`: schema validation,
current-line smoke, calibration, precheck, and tests. It has read-only
repository permissions and does not reference secrets or deployment commands.

The implementation follows the same split: `precheck-core.mjs` only orchestrates,
while `precheck-static.mjs`, `precheck-contracts.mjs`, `precheck-smoke.mjs`,
`precheck-bridges.mjs`, and `precheck-current-line.mjs` own their phase checks.
That keeps the command surface stable while making failures easier to locate.

The original v0.2 simulation remains the base deterministic loop:

```text
fixture event -> observe -> identify -> route -> draft -> verify -> dry-run result
```

The simulator is deliberately small. It proves route behavior before any live
adapter exists.

v0.4 added an attribution rule to that same small simulator: injected artifacts
are context only, while read or modified artifacts are evidence. This keeps a
listed skill from being credited unless the session actually used it, and it
keeps candidates staged, held, or rejected instead of published.

v0.5 added a read-only skill crystallization index over staged skill routes. It
borrows GenericAgent's useful "completed work can become a reusable procedure"
shape without importing broad runtime tools, schedulers, memory writes, or
automatic Skill publication.

v0.6 added a bounded self-repair draft runner. It may write only generated draft
skills, repair plans, and run logs. It can validate a draft, but it cannot write
Misa memory, replace Zilliz, publish Farcaster, publish Skills, touch runtime
services, or start timers.

For Misa, the launch shape is still structure reference plus local precheck.
The newer v0.19-v0.25 line adds vector-memory lineage, kind-aware retrieval
ranking, Zilliz adapter dry-run payloads, read-only session-distiller
cybernetic review, the observe-only Hermes runtime plugin/adapter, and seeded
work-order variants plus work-order quality evaluation with a local issue/PR
dev/test holdout. Those features are confidence-chain inputs, not production
authority.

### 8. Work Order Handoff Plane

The handoff plane turns validated repair tickets and operator-quality reports
into user-visible work orders. Its job is not to execute the work. Its job is to
preserve traceability and choose the right next executor.

The v0.23 work-order variant layer sits just before handoff finalization. It
does a seeded local search over several work-order shapes, scores them
deterministically, and recommends one draft winner. LLM critique is only a
value-gated recommendation with `llm_api_calls=0` by default. It cannot execute,
publish, write memory, install skills, or change route/winner authority.

The v0.24 quality layer checks that this actually improves the final work-order
packet. It compares baseline routing output against the selected variant on
source trace, replayability, boundary safety, handoff clarity, control-loop fit,
and Qianxuesen fit. The evaluator is still report-only and zero-call.

The v0.25 sample adapter feeds that evaluator with local issue/PR-shaped
fixtures split into `dev` and `test`. Dev samples are for tuning future
strategy weights; test samples are a holdout guard before claiming the work
order got smarter.

Each work order goes first to the primary agent, which reports the summary to
the user and asks whether to handle, hold, or escalate. Engineering repairs can
be delegated to a specialized coding agent. Operator or persona quality issues
can be delegated to the persona/operator agent for self-review. High-risk
public, durable, credential, memory, or production changes go to the human owner.

The v0.14 handoff layer is described in
[docs/work-order-routing-v0.14.md](./docs/work-order-routing-v0.14.md).

### 8.1 LangGraph Carrier Bridge

LangGraph is treated as a carrier layer, not as the learning controller.

The useful parts are State, checkpointer, interrupt, resume trace, and custom
nodes. The bridge maps Qianxuesen repair tickets and work orders into
LangGraph-compatible human-boundary interrupts. Custom nodes may call local
Qianxuesen distill, route, repair-ticket, and work-order functions, but they
must remain deterministic from the graph's point of view.

The forbidden shape is an LLM graph node choosing memory, skill, policy, case,
or damping routes. That would make the control loop weaker. The allowed shape
is LangGraph carrying evidence and pause/resume mechanics while Qianxuesen owns
the route decision.

The v0.15 bridge contract is described in
[docs/langgraph-qianxuesen-bridge-v0.15.md](./docs/langgraph-qianxuesen-bridge-v0.15.md).

### 8.2 OmniAgent Footprint Bridge

OmniAgent is treated as an external footprint source, not as the learning
controller.

The useful parts are lifecycle events, complexity signals, Guardian-like risk
signals, and Reflexion/failure signals. The bridge maps those events into local
Qianxuesen learning events, then the existing route table decides memory, skill,
case, policy, damping, or ignore.

The forbidden shape is importing OmniAgent's automatic `AGENTS.md` promotion,
memory writes, Skill installation, LLM-owned route decisions, or production
runtime changes. If those appear in a footprint, they become policy evidence or
damping pressure instead of live behavior.

The v0.16 bridge is described in
[docs/omniagent-footprint-bridge-v0.16.md](./docs/omniagent-footprint-bridge-v0.16.md).

### 8.3 Evolution Tournament Gate

The evolution tournament is treated as an inner optimizer, not as the learning
controller.

The useful parts borrowed from Hermes-style self-evolution are multi-variant
candidate search, train/validation/holdout checks, trace-aware failure
reflection, and Pareto-style winner selection. The tournament starts only after
the Qianxuesen route table and candidate preflight have already produced
reportable local candidates.

The forbidden shape is an optimizer that writes memory, installs Skills,
rewrites prompts, evolves code, changes providers, starts timers, touches VPS,
or decides memory/skill/policy routes. Those actions stay outside this gate.
Unsafe aggressive variants can appear as negative samples, but they must be
rejected before any effect happens.

The v0.18 tournament gate is described in
[docs/evolution-tournament-gate-v0.18.md](./docs/evolution-tournament-gate-v0.18.md).

### 8.4 Vector Memory and Retrieval Lineage

Vector-memory classification is a storage plan, not a memory write. The dry-run
records keep kind, authority, source lineage, replay keys, and retrieval hints
so a future hit can explain where it came from and whether it may influence
behavior.

The ranker models the read path:

```text
requested kind -> same-source context -> fallback only if primary kind misses
```

This keeps a related policy record from stealing the result slot when the user
asked for a repair work order.

The Zilliz adapter prepares collection and upsert payload shape only. It does
not create embeddings, read provider keys, write Zilliz, or promote records.

The local vector store is the default public-repo backend. It persists the
public distillation template locally, exposes `upsert`, `query`, `stats`, and
`rollback`, and keeps the adapter contract swappable for Zilliz, Qdrant,
LanceDB, Chroma, pgvector, or custom stores. Swapping the backend does not
change the required `misa.local_session_distillation.v1` input shape.

### 8.5 Skill Evolution Adapter

The skill evolution adapter turns arbitrary behavior layers into a uniform
supervision surface. A behavior adapter reports what a skill tried to do:
action, memory classes, public-output flag, durable-write flag, risk triggers,
authority request, and feedback signals.

The skill contract says what the skill is allowed to do and where it may evolve.
That second half matters: the contract is not only a brake. It also declares
safe optimization targets such as scoring weights, retrieval hints, prompt
variants, cooldown rules, and reusable success patterns.

Qianxuesen compares the event with the contract, then returns one of three
useful outcomes:

- pass: behavior fits the contract;
- fail: hard boundary drift, missing gate, private memory, or forbidden action;
- replay-required candidate: safe evolution idea that still needs historical
  proof before promotion.

The first committed adapter pair is Farcaster-specific, but the shape is not.
Discord, email, code repair, support, and calendar agents should plug in through
the same `behavior_event` contract.

The supervisor has no write authority. It does not mutate the skill, publish
content, write memory, call providers, change route ownership, or promote a
candidate without replay.

### 8.6 Session-Distiller Review

Session-distiller review is live-adjacent but read-only. It can inspect a
distiller summary, Zilliz manifest rows, rollback traces, and LLM artifacts, then
open repair work-order candidates for trace gaps or failed sessions.

It must not rewrite production Zilliz rows, change session mechanics, start or
restart services, write persistent memory, or change Misa public behavior.

### 9. Publication and Governance Plane

Publication creates immutable records:

- artifact id
- version
- content hash
- source evidence ids
- validation result
- approver or automated gate id
- rollback target
- publication timestamp

## Control Surfaces

Every change should be classified by surface:

| Surface | Examples | Default stance |
| --- | --- | --- |
| Control plane | routing, gates, retries, publishing, cooldowns | can iterate in shadow |
| Data plane | real user output, public posting, tool execution | gated |
| State plane | memory, journals, vector stores, registries | versioned and reversible |

If a change touches more than one surface, record the complexity transfer.

## Complexity Transfer Ledger

When a change claims to simplify the system, record:

- original location of complexity
- new location of complexity
- benefit
- new cost
- new failure mode

This prevents hidden complexity from being mistaken for simplification.

## Controller Conflict Rule

Only one primary controller may write the same artifact at a time. Other systems
may observe, suggest, or validate, but not publish concurrently.

Examples:

- memory writer and skill publisher must not both mutate the same lesson
- session distiller and trajectory summarizer must not race on the same session
- policy optimizer and channel runtime must not both change public behavior

## Decision Door Classification

Classify each decision:

- two-way door: reversible, safe for small experiments
- one-way door: hard to undo, requires frozen boundary and explicit approval

Provider routes, public posting behavior, persistent deletion, timers, and
session mechanics should be treated as one-way-door decisions by default.
