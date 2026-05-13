# Architecture

## Scope

Misa Cybernetic Evolution Layer is a sidecar learning plane for AI agents. It
does not require the live assistant to route model traffic through a new proxy at
the beginning. The initial integration is observation-only.

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

The v0.6 repository implements the first local gate:

```bash
npm run simulate:misa
npm run crystallize:misa
npm run self-repair:misa -- --no-verify
npm run hermes:map-distillation -- --json
npm run validate:schemas
npm run precheck
npm test
```

These commands are dry-run checks. They do not call providers, start timers,
write memory, publish artifacts, post publicly, or change live channel behavior.

v0.2 added a deterministic Misa learning-loop simulation:

```text
fixture event -> observe -> identify -> route -> draft -> verify -> dry-run result
```

The simulator is deliberately small. It proves route behavior before any live
adapter exists.

v0.4 adds an attribution rule to that same small simulator: injected artifacts
are context only, while read or modified artifacts are evidence. This keeps a
listed skill from being credited unless the session actually used it, and it
keeps candidates staged, held, or rejected instead of published.

v0.5 adds a read-only skill crystallization index over staged skill routes. It
borrows GenericAgent's useful "completed work can become a reusable procedure"
shape without importing broad runtime tools, schedulers, memory writes, or
automatic Skill publication.

v0.6 adds a bounded self-repair draft runner. It may write only generated draft
skills, repair plans, and run logs. It can validate a draft, but it cannot write
Misa memory, replace Zilliz, publish Farcaster, publish Skills, touch runtime
services, or start timers.

For Misa, the current launch shape is structure reference plus local precheck.
See
[docs/misa-readonly-integration.md](./docs/misa-readonly-integration.md).
The v0.2 loop is described in
[docs/misa-learning-loop-v0.2.md](./docs/misa-learning-loop-v0.2.md).
The v0.4 evidence gate is described in
[docs/misa-learning-evidence-v0.4.md](./docs/misa-learning-evidence-v0.4.md).
The v0.5 crystallization index is described in
[docs/skill-crystallization-v0.5.md](./docs/skill-crystallization-v0.5.md).
The v0.6 self-repair draft runner is described in
[docs/self-repair-v0.6.md](./docs/self-repair-v0.6.md).

### 8. Work Order Handoff Plane

The handoff plane turns validated repair tickets and operator-quality reports
into user-visible work orders. Its job is not to execute the work. Its job is to
preserve traceability and choose the right next executor.

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

The v0.17 tournament gate is described in
[docs/evolution-tournament-gate-v0.17.md](./docs/evolution-tournament-gate-v0.17.md).

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
