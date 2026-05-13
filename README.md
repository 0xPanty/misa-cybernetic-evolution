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

## LangGraph/Qianxuesen Bridge

![LangGraph carries the loop; Qianxuesen owns the learning.](docs/assets/langgraph-qianxuesen-flow.svg)

The diagram is also available as a Remotion storyboard source at
[`docs/remotion/langgraph-qianxuesen-flow.tsx`](docs/remotion/langgraph-qianxuesen-flow.tsx)
for future animation or video rendering.

## v0.17 Quickstart

This repository is safe to run locally. The default checks are dry-run checks:
they read repository files, validate schemas, and report governance failures.
They do not call model providers, write memories, start timers, or touch live
channels.

```bash
npm install
npm run simulate:misa
npm run crystallize:misa
npm run self-repair:misa -- --no-verify --validation-mode
npm run distill:misa
npm run hermes:map-distillation -- --json
npm run density:misa
npm run adaptive:misa
npm run intake:misa
npm run rollup:misa
npm run evolution:evaluate:misa
npm run evolution:tournament:misa
npm run evolution:tournament:misa -- --vps-raw-dir runs/vps-real-conversation-source
npm run evolution:tournament:misa -- --vps-raw-dir runs/vps-real-conversation-source --judge-mode auto
npm run memory-layer:misa
npm run export-skills:misa
npm run repair-ticket:misa -- --dry-run
npm run work-order:route -- --dry-run
npm run langgraph:bridge -- --json
npm run omniagent:footprint
npm run validate:schemas
npm run precheck
npm test
```

For machine-to-machine JSON handoff, do not redirect plain `npm run ... -- --json`
stdout into the next command. Use `npm --silent run ... -- --json`, direct
`node scripts/... --json`, or `--out-file <path>` so the file contains only
JSON.

The handoff contract is checked as part of the repair/work-order path. If
`work-order:route --repair-ticket-file <path>` receives an npm-banner-polluted
file, it reports a `json_handoff_contract` repair work order instead of failing
with an unstructured JSON parse error.

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
  and Farcaster audits into atomic learning events with redaction,
  segmentation, local token vectors, route-specific lesson splitting, and no
  Zilliz/model/external API dependency;
- the v0.15 Hermes distillation mapper translates existing Hermes/Zilliz
  summaries, chunk refs, journal refs, audit refs, risk, outcome, and quality
  results into Qianxuesen local distillation sources, learning events, and
  repair/work-order routing input without copying Zilliz or making API calls;
- the memory-layer comparison reports L0 source refs, L1 distillates, L2 route
  candidates, and two L3 strategies so broad auto-skill promotion can be
  compared against the minimal positive export path, including compound-window
  diagnostics where skill-like signals can be separated from safer policy or
  damping lessons before export;
- the skill export command writes local L3 draft skills only from the minimal
  positive path and does not install Skills, write memory, or update VPS;
- the repair-ticket queue turns memory-layer over-promotion evidence into
  Codex-ready local tickets with reproduction commands, acceptance criteria,
  edit scope, explicit non-goals, and wording that names whether the risk is
  case, memory, policy, or another non-skill route;
- the work-order router converts repair tickets and operator-quality reports
  into traceable primary-agent handoff packets, with suggested executors,
  escalation options, user confirmation, and source refs preserved;
- the LangGraph/Qianxuesen bridge contract captures the safe fusion shape:
  LangGraph may provide State, checkpointer, interrupt, and custom-node carrier
  mechanics, while Qianxuesen keeps deterministic learning-route authority and
  maps repair/work orders into human-boundary interrupts;
  its generated `determinism_contract` scopes that claim to the local
  Qianxuesen sidecar after input ingest: rule/symbolic distill, local
  `local-token-vector-v1`, fixed route table, and zero LLM route decisions;
  its AGT-inspired `action_policy_contract` adds a fail-closed local rule
  matrix before bridge actions, and `decision_bom` records the owner, policy,
  action, outcome, evidence refs, human-boundary status, completeness score,
  and integrity hash for audit;
- the OmniAgent footprint bridge borrows event-lifecycle, complexity, risk, and
  failure signals as sensor input only, then converts them into Qianxuesen
  learning events without importing automatic `AGENTS.md`, memory, Skill, LLM
  route, or production side effects;
- the v0.10 signal rollup connects signal adapters, the candidate queue, and
  the daily Qianxuesen rollup without adding live runtime authority;
- the v0.11 candidate preflight gate turns daily-rollup candidates into local
  optimization preflights, and only reportable candidates are queued for Huan
  review; its lightweight candidate hygiene gate keeps hidden assumptions,
  over-large scope, untraceable edits, missing success criteria, and weak
  four-question task fit out of the report queue, then adds codebase-first
  clarification and terminology checks without importing a second doc or issue
  workflow;
- the v0.17 evolution tournament gate makes the self-evolution lane more active
  without widening production authority: reportable candidates generate multiple
  local variants, run train/validation/holdout proxy checks, select a
  Pareto-style draft winner, and retain unsafe auto-publish variants in a
  rejected ledger;
- the dry-run precheck passes required-file, governance, damping, and secret
  assignment checks;
- the minimal test suite passes.

## Misa Integration Verdict

This version can be used as Misa's official structure reference, local precheck
layer, dry-run learning-loop simulator, and read-only replay fixture suite.

That is a real launch shape: Misa can rely on the docs, schemas, templates, and
checks when designing future learning/memory/skill changes.

What this v0.17 does not include is a background runtime service. It does not
start timers, change Discord/Farcaster session mechanics, call model providers,
post publicly, publish skills, or write Misa memory by itself.

In plain terms, v0.17 is accepted as a local control-theoretic learning engine,
not as an autonomous production brain. It can read redacted local evidence,
compress it, route it, draft safe local artifacts, and explain what should be
repaired next. It cannot make production decisions by itself.

| Scope | Verdict |
| --- | --- |
| Local learning-plane architecture | accepted |
| Local real-sample simulation | accepted |
| Memory/skill/case/policy/damping routing | accepted for dry-run use |
| Minimal L3 draft skill export | accepted as local files only |
| Active candidate tournament | accepted as local draft optimization only |
| Repair-ticket generation | accepted as a local Codex work queue |
| Work-order routing | accepted as primary-agent handoff packets |
| Automatic memory writes | not enabled |
| Automatic Skill installation | not enabled |
| VPS updates or deployment | not enabled |
| Farcaster/Discord live behavior changes | not enabled |

The current safety posture is deliberate: positive learning is allowed to move
forward locally, but every durable or public effect stays behind an explicit
human approval boundary.

## v0.17 Closed Loop

The current closed loop is:

```text
redacted local source
or existing Hermes/Zilliz distillation artifact
-> distill and segment
-> map Hermes/Zilliz refs into local Qianxuesen input
-> split compound windows into atomic lessons
-> extract signals
-> create learning events
-> route to memory / skill / case / policy / damping
-> compare broad Auto-L3 against minimal positive L3
-> export only safe local skill drafts
-> generate repair tickets for unsafe over-promotion patterns
-> route work orders to the primary agent with suggested executor and escalation options
-> project the same work orders into a LangGraph-compatible interrupt/checkpoint contract
-> map external OmniAgent-style execution footprints into evidence-only learning events
-> run reportable candidates through a local evolution tournament
-> choose the best safe draft variant and retain rejected variants as evidence
-> validate with schemas, precheck, and tests
```

The important decision is the L3 split:

- `original_auto_l3` is only a comparison simulation. It asks: what would happen
  if every verified positive lesson became a Skill?
- `minimal_positive_l3` is the safe path. It exports only verified lessons that
  are already routed as `skill`.

This difference matters. Real conversations often contain several lessons in
one window. A single window can include a useful workflow, a repeated failure,
a private-memory risk, and a VPS boundary at the same time. The distiller now
splits those windows into atomic lessons before routing. Broad Auto-L3 still
shows what would go wrong if every verified lesson became a Skill.
Minimal-positive L3 exports only the lessons that are already clean `skill`
routes. Memory stays memory, case stays case, policy stays policy, and damping
stays damping.

## Route Meanings

The router intentionally separates five useful destinations:

| Route | Meaning | Example |
| --- | --- | --- |
| `memory` | stable user preference or project fact | "Huan wants Chinese-first, plainspoken answers." |
| `skill` | repeatable procedure | "Run these checks after changing the cybernetic gate." |
| `case` | repeated failure or recovery pattern | "Provider timeouts should be diagnosed before redesign." |
| `policy` | future behavior boundary or approval rule | "Do not leak private memory into public Farcaster replies." |
| `damping` | hold weak evidence to avoid overreaction | "Do not rebuild a provider path from one timeout." |

Two guard rules are especially important:

- `single_failure` and `avoid_overreaction` normally route to `damping`, so one
  bad run does not become permanent memory or a new Skill.
- `public_posting_boundary` and `farcaster_public_memory_risk` route to
  `policy`, even when a workflow signal is also present. Public-channel memory
  risk is a safety boundary, not a normal optimization hint.

## Historical Sample Validation

v0.13 was checked against local historical conversation summaries in two ways.
These artifacts are generated under ignored `runs/` directories and are not
committed.

The first run used 30 compound historical rollout summaries. This is a pressure
test for long, mixed windows. The atomic lesson splitter turned those 30 windows
into 87 route-specific lessons.

```text
sources: 30
distillates: 30
atomic_lessons: 87
compound_sources: 28
routes: policy 29 / damping 21 / skill 14 / memory 13 / case 10
minimal_l3_skill_count: 14
minimal_non_skill_promoted_count: 0
public_memory_risk_routes: policy only
skill_with_public_memory_risk: 0
violations: 0
```

The important result is that skill signals are no longer buried just because the
same historical window also contains policy or damping pressure. Public memory
risk still routes only to policy, and no exported skill carries that risk signal.

The second run used 15 atomized historical source lessons: three examples each
for skill, case, policy, memory, and damping. Two sources still contained a
separate policy boundary, so the splitter emitted 17 atomic lessons.

```text
sources: 15
atomic_lessons: 17
compound_sources: 2
routes: skill 3 / case 3 / policy 5 / memory 3 / damping 3
minimal_l3_skill_count: 3
minimal_non_skill_promoted_count: 0
violations: 0
```

This remains the calibration set: the downstream routing works when the input
lesson is small enough, and compound windows now get split before the system
tries to promote anything durable.

## Repair Tickets

`repair-ticket:misa` is a maintenance queue, not an automatic fixer.

It exists for cases where the comparison path sees a risk such as:

```text
case -> wrongly promoted as skill
policy -> wrongly promoted as skill
memory -> wrongly promoted as skill
damping -> wrongly promoted as skill
```

The command records:

- exact bad promotions and `source_event_id` values;
- reproduction commands;
- acceptance criteria;
- files Codex may edit;
- files and live surfaces Codex must not edit;
- non-goals such as no Skill install, no persistent memory write, no VPS update,
  no public posting, and no provider-route changes.

Default writes go only to ignored local `runs/repair-tickets/` folders. A
repair ticket is a work order for a later approved Codex repair pass. It is not
a live runtime action.

## Work Order Routing

`work-order:route` turns tickets and operator-quality reports into generic
handoff packets. This is the open-source version of the operating pattern:

```text
work order appears
-> primary agent tells the user what arrived
-> user chooses handle, hold, or escalate
-> engineering work can go to a coding agent
-> operator/persona quality can go to the persona agent
-> high-risk changes go to the human owner
```

The packet keeps traceability attached: source refs, evidence, reproduction
commands, acceptance criteria, editable scope, forbidden scope, audit need, and
rollback need. It does not execute the work order by itself.

The behavior is configurable through `routing_policy`:

- `report_only`: only notify the user and wait;
- `ask_before_execution`: default, ask the user before execution;
- `agent_autonomous_low_risk`: allow only configured low-risk categories;
- `agent_autonomous_within_scope`: allow configured in-scope work, while still
  blocking public, durable, credential, memory, or production effects.

Every work order also includes `model_handoff`, so the primary agent can tell
the user when the current model should hold the task or hand it to a stronger
model.

See [docs/work-order-routing-v0.14.md](./docs/work-order-routing-v0.14.md).

## Reviewer Finding Closed

A gpt-5.5 xhigh read-only review found one real routing bug during v0.13
hardening: `farcaster_public_memory_risk` was recognized as a signal but was
not always routed to `policy` when it appeared without `public_posting_boundary`.

The fix is now covered in:

- `scripts/lib/session-distiller.mjs`
- `scripts/lib/learning-loop.mjs`
- `scripts/lib/memory-layer.mjs`
- `test/governance.test.mjs`

Regression coverage now checks that:

- `single_failure + farcaster_public_memory_risk` routes to `policy`;
- `avoid_overreaction + farcaster_public_memory_risk` routes to `policy`;
- `reusable_workflow + farcaster_public_memory_risk` does not export a Skill.

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
See [docs/evolution-tournament-gate-v0.17.md](./docs/evolution-tournament-gate-v0.17.md)
for the active candidate tournament loop.
See [docs/local-session-distillation-v0.12.md](./docs/local-session-distillation-v0.12.md)
for the local window -> distillate -> learning event intake step.
See [docs/window-distillation-pipeline-v0.13.md](./docs/window-distillation-pipeline-v0.13.md)
for the full local redaction -> segmentation -> token vector -> signal extraction pipeline.
See [docs/memory-layer-skill-export-v0.13.md](./docs/memory-layer-skill-export-v0.13.md)
for the GenericAgent-inspired L0-L4 comparison and local skill export path.
See [docs/repair-ticket-v0.13.md](./docs/repair-ticket-v0.13.md)
for the local Codex repair-ticket queue.
See [docs/work-order-routing-v0.14.md](./docs/work-order-routing-v0.14.md)
for the primary-agent handoff and executor-choice layer.
See [docs/hermes-distillation-mapping-v0.15.md](./docs/hermes-distillation-mapping-v0.15.md)
for the Hermes/Zilliz -> Qianxuesen mapping bridge.

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

For full validation or CI, redirect self-repair outputs with `--run-root`,
`--generated-root`, and `--repair-plan-root` so the check does not rewrite
tracked `generated/` artifacts.

For a quick validation pass, use `--validation-mode`. It keeps generated drafts
inside `runs/self-repair-validation/` instead of the tracked `generated/`
sample area.

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
splits it into source-referenced segments, builds a local
`local-token-vector-v1` index, extracts signals, splits compound windows into
atomic lessons, and emits fixture-shaped learning events. The vector index is
local and deterministic. It is not Zilliz and it does not call an embedding
provider.

v0.13 also adds `npm run memory-layer:misa` and `npm run export-skills:misa`.
The first command compares the broad GenericAgent-style idea of sending every
verified lesson to L3 skills against the safer Misa path: only verified
`skill`-route lessons become local L3 drafts. The export command writes only
those minimal L3 drafts into a local export folder; it never installs them.

v0.13 adds `npm run repair-ticket:misa` as a local maintenance queue for this
new memory-layer path. It turns over-promotion evidence into JSON and Markdown
repair tickets for later Codex work. It does not fix automatically, write
memory, install skills, touch runtime state, or update VPS.

v0.14 adds `npm run work-order:route` as the generic handoff layer. It converts
repair tickets and operator-quality reports into traceable work orders for the
primary agent to report to the user. Each work order keeps source refs,
evidence, acceptance criteria, suggested executor, escalation options, and a
plain user prompt. It still does not execute anything automatically.

v0.15 adds `npm run hermes:map-distillation` as the bridge from already-produced
Hermes/Zilliz distillation artifacts into this control-learning layer. It keeps
Hermes/Zilliz responsible for memory distillation and retrieval, keeps
Qianxuesen responsible for control learning and repair routing, and preserves
source refs, chunk refs, journal refs, and audit refs. It does not turn this
repository into a general Zilliz memory framework or a Farcaster bot. It is a
pure local script by default: zero LLM calls, zero external API calls, no
embedding, no Zilliz writes, no production journal writes, no Misa memory
writes, and no public sends.

v0.17 adds `npm run evolution:tournament:misa`, a local evolution tournament
gate. It borrows the useful Nous/Hermes self-evolution optimization shape:
generate multiple candidate variants, score them on train/validation/holdout
checks, select a Pareto-style winner, and keep rejected variants as evidence.
It does not borrow automatic memory writes, Skill installation, LLM-owned route
decisions, automatic prompt rewrites, code evolution, or continuous production
self-improvement.

The tournament also accepts local source-backed samples such as
`--vps-raw-dir runs/vps-real-conversation-source`. Default judge mode is
`advise`: the local escalation gate says whether LLM review is worth it while
keeping `llm_api_calls=0`. `--judge-mode auto` calls the optional reviewer only
when that gate recommends it; `--judge-mode llm` forces the offline comparison
pass. The reviewer can score and reflect on draft quality, but it cannot change
routes, approve winners, write memory, install Skills, change prompts, evolve
code, or touch VPS.

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
│   ├── memory-layer-skill-export-v0.13.md
│   ├── repair-ticket-v0.13.md
│   ├── work-order-routing-v0.14.md
│   ├── hermes-distillation-mapping-v0.15.md
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
│   ├── hermes_distillation_mapping.schema.json
│   ├── memory_layer.schema.json
│   ├── repair_ticket.schema.json
│   ├── work_order_routing.schema.json
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
│   ├── memory_layer.example.json
│   ├── repair_ticket.example.json
│   ├── work_order_routing.example.json
│   ├── misa-distillation/
│   ├── hermes-distillation-mapping/
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
│   ├── hermes-distillation-mapper.mjs
│   ├── memory-layer.mjs
│   ├── export-skills.mjs
│   ├── repair-ticket.mjs
│   ├── work-order-router.mjs
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

This is a v0.17 engineering scaffold. It is ready to publish as a public
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
- Hermes/Zilliz distillation mapping into Qianxuesen local control-learning
  inputs, repair tickets, and work-order routing summaries;
- L0-L4 memory-layer comparison and minimal local Skill export;
- mixed-route pressure diagnostics for compound historical windows;
- local Codex repair-ticket queue for over-promotion evidence;
- generic work-order routing for primary-agent handoff, user choice, and
  stronger-model escalation;
- public-memory-risk route guard so Farcaster memory leakage risk stays policy;
- GenericAgent context-density gate;
- EvoMap-inspired adaptive candidate gate;
- signal candidate queue and daily rollup report;
- candidate preflight and report queue;
- local evolution tournament gate for multi-variant candidate optimization;
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
