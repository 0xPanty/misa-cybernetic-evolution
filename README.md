<div align="center">

# Misa Cybernetic Evolution

### A control-theoretic sidecar for long-lived AI agents.

**Core refusal:** agents do not get to grade themselves.

*Engineering Cybernetics for agents, inspired by Qian Xuesen (1954).*

[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.28.0-green.svg)](./docs/history/changelog.md)
[![Tests](https://img.shields.io/badge/tests-195_pass_/_0_fail-success.svg)](#validation-snapshot)
[![Experiments](https://img.shields.io/badge/experiments-85_pass_/_0_fail-success.svg)](#validation-snapshot)
[![Mode](https://img.shields.io/badge/mode-measurement_first-yellow.svg)](#current-state)
[![Boundary](https://img.shields.io/badge/boundary-human_authorized-informational.svg)](#current-boundary)
[![Theory](https://img.shields.io/badge/anchor-Qian_Xuesen_1954-purple.svg)](#related-work)

</div>

---

Current package version: `0.28.0`.

## Control-Theoretic Agent Evolution

Misa Cybernetic Evolution lets long-lived agent systems learn from real work
without letting them quietly rewrite their own memory, skills, routes,
evaluation metrics, or live behavior.

The Qianxuesen layer, named after Qian Xuesen's *Engineering Cybernetics*
(1954), is the deterministic control layer for distillation, routing, replay,
and boundary checks. It observes the running agent through redacted sensors,
distills evidence into controllable signals, validates measurement before
candidate judgment, and keeps durable authority in a separate control layer.

The central thesis is simple: **the agent is the controlled object, not the judge of its own evolution.** An agent may produce behavior, traces, and candidate changes. It does not own the memory writer, route table, evaluation metric, or promotion decision.

The system is built around a hard separation of roles:

| Layer | Role | Boundary |
| --- | --- | --- |
| Control-layer window distillation | turns redacted work windows into source-backed candidate evidence | can seed candidates |
| Hermes runtime observability | watches action loops, API boundaries, and redacted model I/O quality | cannot promote |
| Measurement quality gate | cross-checks candidate evidence against runtime and input-quality evidence | evaluates the measurement, not the candidate |
| L2/L3 control path | validates replay, routes pressure, and feeds repair signals back into the loop | no self-rewrite, no winner override |
| Human boundary | decides durable authority after local evidence and replay | the only live actuator |

This is the difference between agent self-belief and controlled positive evolution. The repo does not ask an agent whether it improved. It asks whether the evidence is sourced, whether the measurement was clean, whether replay holds up, whether the route is deterministic, and whether a human has granted authority.

```text
no measurement        -> no evolution claim
no source lineage     -> no durable learning
no clean measurement  -> no candidate judgment
no held-out replay    -> no promotion
no human boundary     -> no live authority
```

v0.28 makes the loop sharper. Lane A provides control-layer window
distillation. Lane B provides Hermes runtime and model-I/O observability. The
`measurement_quality_gate` cross-checks both before a result can be treated as
meaningful. `L3` feedback can tighten future source selection, gate repair, and
variant generation, but it cannot rewrite memory, override a tournament winner,
or turn dirty telemetry into an autonomous replay.


---

![Misa Cybernetic Evolution Layer v0.28 control loop](docs/assets/misa-cybernetic-evolution-v0.28.svg)

[Open the full-size architecture diagram](docs/assets/misa-cybernetic-evolution-v0.28.svg)

The public architecture diagram intentionally shows only the two data-backed
lanes: control-layer window distillation and Hermes runtime/model-I/O
observability. The Lane A distillation template makes the evidence packet
explicit: source ledger, observation, claim, supporting evidence,
counter-evidence, uncertainty, route hint, and replay requirement. The middle
of the diagram shows the cross-validation gate and the L3 feedback path:
runtime diagnostics can tighten future source selection, gate repair, and
variant generation, but cannot directly change tournament winners.

## Current State

This repository is a local-first and shadow-ready learning plane. It is useful
when you want an agent system to learn from real work without quietly rewriting
memory, changing skills, switching routes, or taking live authority.

It provides:

- a deterministic cybernetic routing layer for memory, skill, case,
  policy, and damping signals;
- an observe-only Hermes runtime adapter and plugin surface;
- replay-gated work orders, seeded variants, and local quality comparison;
- local vector-store and retrieval-lineage contracts;
- a runtime thread contract for launch/pause/resume state without live effects;
- measurement-quality diagnostics for action loops and polluted model input;
- schema, tests, and value-proof commands that keep the boundary falsifiable.

The public guarantee is crisp: v0.28.0 validates the measurement boundary,
redaction path, stream separation, and deterministic gate wiring. Additional
live-session data improves threshold calibration without giving the agent a new
authority path.

## What Is Already Proven

The current release has strong evidence for the safety and boundary side:

| Claim | Evidence |
| --- | --- |
| Runtime observations do not become promotion authority | `signal_origin` defaults to `runtime_operation_log`; runtime logs cannot trigger tournament |
| Hermes model-I/O tap does not persist raw prompts | CI canary test injects prompt, fake token, tool args, code-like content, and assistant output, then asserts none reach NDJSON |
| Measurement gate is observe-only | schema and tests lock it to `observability_stream`; it cannot enter `work_order_stream` or `evolution_candidates` |
| Missing input evidence is not treated as clean | old VPS tap replay returns `insufficient_evidence`, not `clean_measurement` |
| Work-order quality is measurable locally | `hermes:value-proof` and work-order quality tests compare deterministic candidates against held-out evidence |

The calibration layer is deliberately downstream of the boundary layer. More
`model_io_tap` sessions can tune thresholds, trigger-rate bands, and review
policy; they do not create a shortcut from dirty telemetry to replay,
tournament, or live action.

## v0.28.0 Headline

v0.28.0 adds a second question before candidate judgment:

```text
old question: did the candidate improve the result?
new question: was the measurement clean enough to trust?
```

The new Hermes runtime records are:

| Record | Reads | Says | Authority |
| --- | --- | --- | --- |
| `action_history_monitor` | tool sequence | is the agent looping or repeating failed actions? | observability only |
| `model_io_tap` | redacted model request/response digest | was the model fed bloated or unstable context? | observability only |
| `measurement_quality_gate` | monitor + model I/O tap | is this measurement clean, suspicious, compound, or insufficient? | emit-only |
| `measurement_gate_bias_monitor` | gate verdict + candidate type counts | would the gate skew against one candidate type? | emit-only |

These records are diagnostic instruments. They do not decide winners, update
memory, write skills, call providers, block tools, or let the agent optimize its
own report card.

## Design Thesis

Most agent "self-evolution" demos look strong because the agent can rewrite more
things: memory, prompts, tools, skills, plans, and sometimes its own evaluation
criteria. That can feel powerful, but it also creates the classic failure mode:
the agent starts optimizing the story it tells about itself instead of improving
the measured behavior.

This repository takes the opposite bet:

```text
no measurement -> no evolution claim
no source lineage -> no durable learning
no held-out replay -> no promotion
no clean measurement -> no candidate judgment
no human boundary -> no live authority
```

That is the core idea from Engineering Cybernetics applied to agents: define the
controlled system, observe it through explicit sensors, compare behavior against
setpoints, and let actuators change only what they are allowed to change.
Positive evolution is allowed, but only when it survives source trace, replay,
holdout evidence, deterministic routing, and boundary checks. Runtime noise can
become a work order. It cannot silently become truth.

In practice, the sidecar separates three questions that many agent systems blur
together:

| Question | Layer | Why it matters |
| --- | --- | --- |
| Did the candidate improve behavior? | Qianxuesen / Layer A | prevents fake progress |
| Is the agent stuck or looping? | Action history monitor / Layer C | catches bad effort patterns |
| Was the model fed a polluted case file? | Model I/O tap + measurement gate / Layer C | prevents blaming a candidate for a bad measurement |

This is why the project is more about cybernetics than vibe coding: it treats
learning as a controlled measurement loop, not a permission slip for the agent to
rewrite itself.

## Validation Snapshot

Latest v0.28.0 local acceptance run:

| Check | Result |
| --- | --- |
| Schema validation | `npm run validate:schemas` PASS |
| Main test suite | `npm test` 195 pass / 0 fail / 1 skipped |
| Experiment suite | `npm run test:experiments` 85 pass / 0 fail |
| Hermes value proof | `npm run hermes:value-proof` ok, positive lift, zero safety regressions |
| Historical VPS tap replay | 2382 events replayed; work orders stayed 2; SNR stayed 0.039; old logs correctly returned `insufficient_evidence` |
| Redaction canary | prompt, fake token, tool args, code-like content, and assistant output did not persist to NDJSON |

The important reading is:

```text
the boundary is strong,
the measurements are explicit,
the failure-to-prove case fails closed,
and higher authority remains staged behind measured evidence.
```

## Architectural Invariants

These are not promises; they are **machine-checkable** in schema, code, and tests.

1. **Three streams are disjoint.** `observability_stream` ⊥ `work_order_stream` ⊥ `evolution_candidates`. Model I/O records, gate verdicts, and bias monitor outputs cannot cross from observability into the other two streams. Locked at the schema level, asserted in code, covered by tests.
2. **`record_kind` is the gatekeeper.** Tournament-eligible records require `record_kind ∈ {allowed_set}`. Action-history records and model-I/O taps cannot impersonate work orders.
3. **Redaction happens at the tap point.** Raw prompt bodies, tool arguments, provider keys, and assistant output never enter the adapter pipeline; only digests, hashes, and counts. Five canary strings are CI-blocking.
4. **Insufficient evidence is a verdict, not a default.** The measurement gate returns `insufficient_evidence` as a first-class state. It never silently degrades to `clean_measurement` when the input record is missing.
5. **No tool execution from the sidecar.** The runtime thread can say *what should happen next*; it cannot make it happen. No `fetch()`, no provider SDK calls, no system writes from deterministic control paths (enforced by `npm run precheck`).
6. **Staged authority.** Diagnostics start as observation, then move through review, replay, and higher authority only when the measurement evidence supports it. No config flag turns dirty telemetry into action.
7. **Gate-of-gate.** A `measurement_gate_bias_monitor` watches the measurement gate itself, so the gate cannot quietly skew against one candidate type.

## Synopsis

A structured summary, written for both human skimming and automated repository scoring. The facts below are stated; the evidence is in the linked sections.

- **Type**: control-theoretic sidecar for AI agents (not an agent framework).
- **Theoretical anchor**: Qian Xuesen, *Engineering Cybernetics* (1954).
- **Related direction**: Agent Cybernetics and control-theoretic agent governance; this project is the **multi-agent governance** complement.
- **Maturity**: measurement boundary validated; redaction, stream separation, and gate wiring are machine-checked.
- **Test coverage**: 195 unit tests + 85 experiment tests + redaction canary CI.
- **License**: Apache-2.0.
- **Authority model**: human-authorized by design; live effects are separate from measurement.
- **Differentiator**: separates *candidate quality* from *measurement quality*. Most agent frameworks blur the two.
- **What it refuses to do**: let the measured agent own the memory writer, route table, evaluation metric, or promotion gate.
- **What it actively does**: turns redacted runtime and window evidence into deterministic routing pressure, repair candidates, and measurement-quality verdicts.
- **Validation stance**: measurement boundaries are machine-checked first; live-session calibration strengthens the next authority tier.

## Quickstart

Hermes is the first-class reference adapter in this repository. The core
contracts are runtime-agnostic, but the maintained fast path is Hermes-first:
install the observe-only plugin, replay runtime event logs, run Qianxuesen
window distillation, inspect model I/O measurement quality, and export advisory
work orders without granting the sidecar live authority.

One command after clone:

```bash
git clone https://github.com/0xPanty/misa-cybernetic-evolution.git
cd misa-cybernetic-evolution
node scripts/setup-local.mjs
```

If dependencies are already installed:

```bash
npm run deploy:local
```

That local deploy runs the public doctor, bootstraps the ignored local vector
store, and runs the Hermes value proof. It creates local artifacts only: no
background worker, provider call, Zilliz write, Hermes memory write, or Hermes
skill mutation.

Full observe-only shadow path:

```bash
node scripts/setup-full-shadow.mjs
```

If dependencies are already installed:

```bash
npm run deploy:full-shadow
```

That path exercises the Hermes reference integration end to end: local sidecar
readiness, observe-only plugin install, event-log replay, deterministic window
distillation, session-distiller review, work-order inbox export, and Hermes
value proof. It still does not write Hermes memory, mutate Hermes skills, open
live service authority, call providers, or promote candidates.

Manual path:

```bash
git clone https://github.com/0xPanty/misa-cybernetic-evolution.git
cd misa-cybernetic-evolution
npm ci
npm run doctor
npm run bootstrap:local
```

The full clone-to-local-store path is documented in
[QUICKSTART.md](./QUICKSTART.md).

## System Shape

The framework has three layers:

| Layer | Owner | Job |
| --- | --- | --- |
| Input and carrier | LangGraph-compatible carrier, local files, existing Hermes/Zilliz refs | carry state, source refs, checkpoints, interrupts, and resume traces |
| Qianxuesen control | this repo's deterministic sidecar | distill, split, route, gate, compare, and keep live effects off |
| Output and human boundary | primary agent plus human owner | let the agent self-review and fix low-risk local items, while durable changes still need approval |

The important rule is simple: carrier tools may move evidence around, but the
Qianxuesen route table owns learning decisions.

## Current Boundary

The safety boundary is deliberate:

| Surface | Current state |
| --- | --- |
| Persistent memory writes | not enabled |
| Skill installation or publication | not enabled |
| Provider route changes | not enabled |
| Discord/Farcaster live behavior changes | not enabled |
| Background timers or services | not enabled |
| VPS update authority | explicit `update:vps-shadow` only; no autonomous VPS update |
| LLM route or winner authority | not enabled |
| Local vector-store writes | explicit command only, under ignored `runs/local-vector-store/` |
| Skill evolution changes | replay-required candidates only, no automatic skill mutation |
| Hermes runtime adapter | observe-only hook normalization; no runtime block, memory write, or skill write |
| Hermes model I/O tap | redacted counts and hashes only; no raw prompt, tool body, provider key, or assistant output |
| Measurement quality gate | emit-only diagnostic; no replay trigger, no tournament trigger, no Layer A block |
| Stability safe mode | monitor output only; when active, accept `damping` and `ignore` until human release |
| Outer-loop review | recommendation only; cannot change setpoints, route predicates, or metric registry without human review |

In plain terms: this sidecar can read redacted local evidence, compress it,
route it, draft safe local artifacts, compare candidate variants, and explain
what should be repaired next. It cannot make production decisions by itself.

## Core Loop

```text
redacted local source
or existing Hermes/Zilliz distillation artifact
-> distill and segment
-> map refs into local Qianxuesen input
-> split compound windows into atomic lessons
-> route to memory / skill / case / policy / damping
-> compare broad Auto-L3 against minimal positive L3
-> export only safe local skill drafts
-> generate repair tickets for unsafe over-promotion patterns
-> route work orders to the primary agent
-> compare baseline work orders against variant winners on Qianxuesen quality metrics
-> let the agent self-review and resolve low-risk local work when policy allows
-> supervise behavior events against skill evolution contracts
-> open replay-required improvement candidates inside allowed evolution space
-> classify logs, decisions, candidate experience, policy, and work orders for vector storage
-> optionally upsert the public distillation template into the default local vector store
-> attach original-source refs, replay keys, and retrieval hints for future hit explanation
-> produce a shadow perception digest that prioritizes sources without route authority
-> score which existing signals are worth LLM or GEPA-style variant generation
-> normalize Hermes runtime hook traces into research digests and replay candidates
-> observe action-history loops and redacted model-I/O measurement quality
-> keep raw logs, redacted sources, perception digests, handoffs, and archives separated
-> run reportable candidates through a local evolution tournament
-> choose the best safe draft variant
-> mark whether optional LLM review has concrete critique value
-> validate with schemas, precheck, and tests
```

The route split is the core control rule:

| Route | Meaning | Example |
| --- | --- | --- |
| `memory` | stable user preference or project fact | "Huan wants Chinese-first, plainspoken answers." |
| `skill` | repeatable procedure | "Run these checks after changing the cybernetic gate." |
| `case` | repeated failure or recovery pattern | "Provider timeouts should be diagnosed before redesign." |
| `policy` | future behavior boundary or approval rule | "Do not leak private memory into public Farcaster replies." |
| `damping` | hold weak evidence to avoid overreaction | "Do not rebuild a provider path from one timeout." |

Two rules matter most:

- one bad run normally goes to `damping`, not permanent memory or a new Skill;
- public-channel memory risk goes to `policy`, even when a workflow signal is
  also present.

## Current Capabilities

| Capability | Command | Boundary |
| --- | --- | --- |
| Local sidecar bootstrap | `node scripts/setup-local.mjs` or `npm run deploy:local` | doctor, local bootstrap, and Hermes value proof; local artifacts only |
| Full Hermes shadow path | `node scripts/setup-full-shadow.mjs` or `npm run deploy:full-shadow` | observe-only plugin, event-log replay, window distillation, session review, work-order inbox, and value proof |
| Hermes value proof | `npm run hermes:value-proof` | deterministic local proof over the work-order corpus, Hermes adapter samples, and bad-evidence controls |
| Current-line smoke | `npm run smoke:current-line` | one dry-run guard across session review, work orders, tournament, runtime adapter, runtime thread, health, vector store, ranker, and Zilliz adapter |
| Current-line calibration | `npm run calibrate:current-line` | redacted sample calibration for signal layers, route, retrieval, tournament, and judge value |
| Full-loop health | `npm run health:qianxuesen` | small latest/history manifest for the local shadow loop, with artifact pointers |
| Evolution tournament | `npm run evolution:tournament:misa` | local draft winner only; no route, winner, or live authority change |
| Precheck gate | `npm run precheck` | static, schema, bridge, smoke, and current-line contract checks |

The full command surface lives in `package.json`; the public gate order and
reviewer-facing command chain live in
[docs/current/verification-matrix.md](./docs/current/verification-matrix.md).

## Experiments

External trajectory analysis and L1-L4 selection audit commands now live under
`experiments/`. They are experiment lines, not current package requirements.
Default CI and `npm test` do not run them; run `npm run test:experiments` only
when you intentionally want to replay those lines.

The old `external:*`, `selection-audit:*`, `l1-*`, and `l3-*` command families
have been renamed under these experiment script families:

- `experiments:external:*`
- `experiments:selection-audit:*`

See `experiments/external-trajectory/README.md` and
`experiments/selection-audit/README.md`.

## Current-Line Command Map

README keeps only the short human entrypoints. The canonical command surface and
CI order live in [docs/current/verification-matrix.md](./docs/current/verification-matrix.md).

The two current-line commands most reviewers should reach for are:

- `npm run smoke:current-line`
- `npm run calibrate:current-line`

For a quick run-level verdict plus artifact pointers, use:

- `npm run health:qianxuesen`

It writes a small ignored manifest under `runs/qianxuesen-full-loop/` with
`latest.json`, `latest.md`, and timestamped history. It does not copy full logs
or add runtime authority.

## Optional VPS Session-Distiller Hook

The deploy helper in `scripts/deploy/misa-cybernetic-session-distiller-review.sh`
can be installed as an `ExecStartPost` hook for the existing Hermes
`misa-session-distiller.service`.

On a Linux/VPS host with that service already present:

```bash
npm run deploy:vps-shadow
```

To update an existing VPS checkout and refresh the shadow hook in one command:

```bash
npm run update:vps-shadow
```

The updater refuses to run when tracked local files are modified. It then runs
`git fetch`, `git merge --ff-only`, `npm ci`, `deploy:full-shadow`, and
`deploy:vps-shadow`. Use `--dry-run` to print the same sequence without changing
the checkout or system files.

For review without writing system files:

```bash
bash scripts/deploy/install-vps-full-shadow.sh --dry-run
```

It reads the same session-distiller environment, calls the Hermes wrapper in
`session-distiller-review` mode, and writes review evidence under the existing
session-distiller artifact directory. It does not start a new cybernetic timer,
write Zilliz, call embedding providers, publish, install skills, or change live
session mechanics.

When enabled, the same hook also calls `work-order:inbox` and splits
`repair_work_orders[]` into agent-claimable JSON files under:

```text
/root/misa-hermes-project/work-orders/cybernetic/
  inbox/
  in-progress/
  done/
  failed/
  ignored/
```

Those files are an inbox for a primary agent or Codex-style repair pass. They
are not shell jobs and do not execute themselves.

## Perception Log Layout

`perception:layout` records the folder split for future full-log perception. By
default it only prints the contract. Passing `--init` creates the local dry-run
tree under `runs/perception-runtime`, which is ignored by Git.

```text
runs/perception-runtime/
  runtime/raw/
  runtime/redacted-sources/
  perception/digests/
  perception/signal-ledger/
  perception/attention/
  handoff/
  archive/
```

Plain rule: raw logs are not learning material. Redacted and normalized sources
feed perception; perception outputs hints, duplicate-cluster reports, and
no-write ledger proposals; only selected attention items move toward handoff.
Noise, already-handled repeats, and rejected candidates stay in one archive
bucket instead of becoming their own workflow.

Perception output names such as `action_recommendations`, `attention_queue`, and
`ledger_update_proposals` are review surfaces, not execution commands. They must
stay `hint_only` or `proposal_only`, and ledger proposals must stay `no_write`.

## Curiosity Signal Gate

`curiosity:signals` decides which existing signals are worth deeper LLM or
GEPA-style variant generation. It does not create a second candidate pool.

Plain rule:

```text
all signals stay in the existing candidate flow
ordinary signals stay deterministic
high-value signals may ask an LLM to draft variants later
Qianxuesen still owns route, replay, tournament, and promotion
```

The gate looks at perception priority, route pressure, ledger recurrence,
public-boundary risk, replay failures, repeated failures, duplicate workflow
evidence, external framework/protocol drift, competitor pressure, user
corrections, knowledge gaps, repeated terminology, and review-value hints. Its
output is advisory only:
`llm_variant_generation_recommended`, `deterministic_review_optional`,
`ordinary_candidate_flow`, or suppression for handled/noisy items.

The important distinction is simple: a one-off buzzword stays cheap and
deterministic; an external change plus a knowledge gap can become a research
digest or LLM-generated variant candidate, but it still has to pass replay and
tournament before anything durable changes.

## Local Vector Store

`vector-store:local` is the default public-repo vector backend. It gives users
who do not run Zilliz a persistent local store with `upsert`, `query`, `stats`,
and `rollback` surfaces.

Users who already run Zilliz, Qdrant, LanceDB, Chroma, pgvector, or another
store can replace the backend, but the adapter must accept the same
`misa.local_session_distillation.v1` template and return the same source-lineage
fields.

## Skill Evolution Adapter

`skill:evolution` is the first behavior-layer plug-in surface. A behavior layer
reports a structured event, a skill declares its allowed evolution space, and
Qianxuesen checks both sides.

The default Farcaster example proves the intended shape:

- public reply drafts may create `reply_scoring` improvement candidates;
- candidates must pass replay before promotion;
- private-memory, high-risk publish, and direct durable writes stay blocked;
- the supervisor does not call LLMs, mutate skills, write memory, or change
  route ownership.

This is the "runway plus guardrail" layer: it gives skills a place to evolve
while keeping hard boundaries machine-checkable.

## Hermes Runtime Adapter

`hermes:adapt-runtime` is the first concrete framework plug shape. It does not
try to make Qianxuesen a Hermes-only feature. It maps Hermes hook evidence into
the universal adapter contract:

- `skill_manage` changes become replay-required skill candidates;
- `memory` writes become memory or policy pressure, not durable memory;
- `session_search` and external-research traces become research digests;
- curator/background review output becomes candidate pressure;
- `pre_api_request` and `post_api_request` become redacted `model_io_tap`
  digests;
- action-history and model-I/O evidence can produce an emit-only
  `measurement_quality_gate` verdict;
- every candidate still has to enter replay and tournament before promotion.

Plain rule: Hermes can be the carrier runtime, but Qianxuesen still owns the
learning decision. The default adapter is observe-only and call-free.

The installable sample lives in `examples/hermes-runtime-plugin`:

```bash
npm run hermes:plugin:install
npm run hermes:plugin:doctor
npm run hermes:adapt-runtime -- --event-log ~/.hermes/qianxuesen-runtime-events.ndjson --json
```

The plugin only writes a local NDJSON event log. It does not block Hermes tools,
write Hermes memory, change skills, call models, or call external APIs.

The v0.28 model-I/O path records only the shape of the case file, not its raw
content:

```text
message_count
context_byte_size
tool_schema_count
tool_result_error_count
token_usage
system_prompt_hash
tool_schema_hash
```

That gives the sidecar a way to say "this measurement may be dirty" without
letting the agent read its own diagnosis or optimize for the gate.

Hermes signals do not stop at observe-only. The public work-order chain turns
runtime pressure into Qianxuesen work orders:

```bash
npm run hermes:work-order -- --event-log ~/.hermes/qianxuesen-runtime-events.ndjson --json --dry-run
```

That command moves qualified boundary pressure into work orders, seeded variants,
selected winners, and quality comparisons. Runtime-operation logs alone are not
treated as official Hermes self-evolution. They stay boundary observations unless
explicit evidence or a registered anomaly rule says otherwise. The command still
does not write Hermes memory, mutate skills, publish, call models, or call
external APIs.

For "does this actually improve behavior?" checks, use the evolution-grade
fixture. It carries frozen baseline, held-out split, before/after scores, sample
count, and metric-gaming risk:

```bash
npm run hermes:work-order -- --fixture-file test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json --json --dry-run
```

That evidence can support optimization, but it still only produces
replay-required work orders. It does not promote, write, or execute.

For an open-source release check, `hermes:value-proof` runs the local
work-order corpus, Hermes adapter samples, the evolution-grade fixture, and a
bad-evidence control group across deterministic seeds:

```bash
npm run hermes:value-proof
npm run hermes:value-proof -- --seed-count 500 --json
```

The command must report positive lift, held-out pass, zero safety regressions,
zero provider/API calls, and rejection of negative/high-gaming/missing-holdout
evidence before the Hermes intake should be described as value-positive.

## Evolution Tournament

The tournament is an inner optimizer, not the learning controller.

It borrows the useful shape from self-evolution systems:

- generate multiple draft variants;
- score train/validation/holdout checks;
- keep route and source trace fixed;
- choose a Pareto-style local winner;
- retain safe losers and unsafe variants as local experience evidence.

It rejects the dangerous shape:

- no automatic memory writes;
- no Skill installation;
- no LLM-owned route decisions;
- no prompt or code self-rewrite;
- no provider or VPS changes;
- no continuous production self-improvement loop.

The `experience_ledger` in tournament output is only a local shadow ledger. It
keeps source-backed preflight notes, non-winning safe variants, and rejected
unsafe variants for later comparison; it does not write memory or publish
anything.

## Work-Order Variants

`work-order:variants` adds the EvoPrompt-inspired part that fits this repo: a
small seeded search over possible work-order shapes. It does not create a new
controller.

```text
work-order:route
-> seeded work-order variants
-> deterministic scoring
-> optional LLM critique recommendation only when value signals justify it
-> one draft winner, losers retained as experience
```

Default behavior is zero-call and local-only:

- seeded randomness is reproducible;
- the command does not execute work orders;
- LLM critique is only recommended, never called by default;
- route, winner authority, memory writes, skill installs, public output, and
  production effects stay blocked.

v0.18 adds two decision-quality checks:

- `strategy_fit`, so the winner must fit the route/source pressure;
- `llm_review_value`, so model review is only suggested when there is a concrete
  critique target.

Default judge mode is `advise`, which keeps `llm_api_calls=0`. `--judge-mode auto`
may call a reviewer only when `llm_review_value.level=high`. The reviewer can
add critique notes, but it cannot change the route or winner.

## Work-Order Quality Evaluation

`work-order:evaluate` keeps the EvoPrompt-inspired search honest. It compares
the original work-order packet with the variant winner across source trace,
replayability, boundary safety, handoff clarity, control-loop fit, and
Qianxuesen fit.

The point is not that the command passes. The point is whether the final work
order is more useful for the next agent without adding live effects or token
spend.

```bash
npm run work-order:evaluate -- --json --dry-run
```

## Factor-Compliant Candidate Layer

v0.27 adds 12-factor-style micro discipline under the Qianxuesen macro control
loop. It does not import a new runtime framework.

The local candidate layer now has:

- locked candidate-generation context;
- versioned prompt templates under `prompts/`;
- a unified `human_escalation` packet;
- a deterministic candidate reducer keyed by context and seed;
- small route-focused generator charters;
- a documented dumb zone and authority matrix.

Plain rule:

```text
Qianxuesen owns route, metric, stability, winner, and authority.
The factor layer only makes candidate generation cleaner and easier to review.
```

## Runtime Thread

v0.28 starts the runtime execution-orchestration layer as a replayable event-log
contract. It models launch, pause, resume, and next-step selection without
coupling orchestration to a resident runtime daemon.

The local runtime thread now has:

- `agent_thread` as one packet for event log plus business state;
- `next_step` as the deterministic reducer output;
- pause on `human_escalation`;
- resume through a recorded human decision event;
- v0.27 candidate reducer refs recorded in the event log;
- deterministic event-log replay;
- a local gate after resume;
- compact error signals that fail closed;
- no tool execution, provider call, service start, memory write, or VPS touch.

`health:components` adds the Aeon-inspired part that fits this repo: pure local
health reducers with positive feedback, registered setpoints, falsifiable
degradation evidence, and cooldown-aware diagnostic candidates. Those candidates
stay inside `damping`, `policy`, or `ignore`, go to `human_escalation`, and are
replay-required before any repair path can be chosen.

Plain rule:

```text
The thread can say what should happen next.
It cannot do the thing by itself.
```

## Validation

The canonical validation chain lives in
[docs/current/verification-matrix.md](./docs/current/verification-matrix.md). Keep that file
and `.github/workflows/current-line-shadow.yml` as the source of truth for the
exact CI order.

Current local review usually runs the same shadow gate:

```bash
npm run validate:schemas
npm run smoke:current-line
npm run calibrate:current-line
npm run candidate:context -- --json
npm run candidate:reduce -- --json --seed stable-review
npm run runtime:thread -- --json
npm run precheck
npm test
```

For release-style local review, also run:

```bash
npm run test:experiments
npm run hermes:value-proof
```

For Hermes measurement-gate changes, `npm test` includes the redaction canary
test and the known-answer verdict matrix. These tests prove the gate is wired
and the tap does not persist raw canaries. Live `model_io_tap` sessions are the
calibration input for future threshold tuning.

The calibration signal-layer details live in
[docs/current/current-line-calibration-v0.21.md](./docs/current/current-line-calibration-v0.21.md).
That map is descriptive only; it does not add a controller, writer, provider
call, or route authority.

`npm run precheck` also runs a static no-provider-call guard over the
deterministic control paths. The route, metric, signal extractor,
post-deploy, stability, and outer-loop modules must not contain `fetch()` or
provider SDK/API endpoint calls.

For machine-to-machine JSON handoff, do not redirect plain npm-script JSON
stdout into the next command. Use silent npm mode, direct script execution, or
`--out-file <path>` so the file contains only JSON.

## Current Development Discipline

Do not add another governance layer by default. The useful current-line work is:

1. keep the current route labels and tournament variants stable;
2. keep vector-memory records traceable back to opaque original-source refs;
3. rank retrieval hits by requested kind before same-source context;
4. keep `should_change_winner=false` and LLM route authority blocked;
5. let session-distiller review open repair work-order candidates without
   mutating production state;
6. record shadow tournament outcomes with human accept/reject labels;
7. calibrate `strategy_fit`, `judge_escalation`, and `llm_review_value` against
   redacted samples with `npm run calibrate:current-line`;
8. keep the signal-layer map visible in calibration output instead of spreading
   it across chat-only explanations;
9. reduce maintenance noise in precheck, README, and tests;
10. keep the Hermes adapter loop installable, observe-only, redacted, and
    replayable from local NDJSON;
11. make work-order output smarter through seeded variants and value-gated LLM
    critique recommendations;
12. measure final work-order quality against Qianxuesen control-loop metrics
    instead of treating command success as enough;
13. add local issue/PR-shaped dev/test samples so quality changes must pass a
    held-out work-order check, not only the original regression set.

The next leverage is not more abstraction. It is richer calibration evidence and
replayable source lineage.

The new public default for work orders follows that rule too: let the agent
practice on bounded local work, keep self-review logs as candidate experience,
and only widen authority when the user explicitly asks for it.

## Documentation Map

Current-state docs:

Versioned document names such as v0.18 and v0.20 are historical anchors for
features that still feed the v0.28 package line. They are not separate current
release tracks; use the command map and validation chain above for the current
surface.

- [Architecture](./ARCHITECTURE.md)
- [Control contract](./CONTROL_CONTRACT.md)
- [Verification matrix](./docs/current/verification-matrix.md) - canonical command surface and current local shadow gate
- [Source synthesis](./docs/current/source-synthesis.md)
- [Memory-layer and Skill export](./docs/current/memory-layer-skill-export-v0.13.md)
- [Work-order routing](./docs/current/work-order-routing-v0.14.md)
- [Work-order variants](./docs/current/work-order-variants-v0.23.md)
- [Work-order quality evaluation](./docs/current/work-order-quality-eval-v0.24.md)
- [Work-order external samples](./docs/current/work-order-external-samples-v0.25.md)
- [Factor-compliant candidate layer](./docs/current/factor-compliant-candidate-layer-v0.27.md)
- [Control boundaries](./docs/current/control-boundaries.md)
- [Runtime thread](./docs/current/runtime-thread-v0.28.md)
- [Component health diagnostics](./docs/current/component-health-diagnostics-v0.29.md)
- [Skill evolution adapter](./docs/current/skill-evolution-adapter-v0.22.md)
- [Skill control intake template](./docs/current/skill-control-intake-template.md)
- [Hermes runtime adapter](./docs/current/hermes-runtime-adapter-v0.22.md)
- [Hermes self-evolution reality check](./docs/current/hermes-self-evolution-reality-check-v0.2.md)
- [Vector memory storage](./docs/current/vector-memory-storage-v0.19.md)
- [Local vector store](./docs/current/local-vector-store-v0.21.md)
- [Zilliz vector adapter](./docs/current/zilliz-vector-adapter-v0.19.md)
- [Retrieval lineage](./docs/current/retrieval-lineage-v0.19.md)
- [Vector retrieval ranker](./docs/current/vector-retrieval-ranker-v0.20.md)
- [Evolution tournament v0.18](./docs/current/evolution-tournament-gate-v0.18.md)
- [Current-line calibration v0.21](./docs/current/current-line-calibration-v0.21.md)

Bridge docs:

- [Hermes/Zilliz mapping](./docs/current/hermes-distillation-mapping-v0.15.md)
- [LangGraph/Qianxuesen bridge](./docs/current/langgraph-qianxuesen-bridge-v0.15.md)
- [OmniAgent footprint bridge](./docs/current/omniagent-footprint-bridge-v0.16.md)

History and calibration:

- [Version changelog and calibration notes](./docs/history/changelog.md)

## Diagram Source

The current architecture diagram is rendered by the fixed-layout SVG renderer at
[scripts/render-architecture-diagram.mjs](./scripts/render-architecture-diagram.mjs).
It avoids automatic graph layout so the README diagram stays readable on GitHub:

```bash
npm run docs:architecture-diagram
```

The older Remotion storyboard at
[docs/remotion/langgraph-qianxuesen-flow.tsx](./docs/remotion/langgraph-qianxuesen-flow.tsx)
is kept as historical animation source.

## Related Work

- **Qian Xuesen, *Engineering Cybernetics*, 1954** — the foundational thesis: treat learning as a controlled system with explicit sensors, setpoints, and bounded actuators. This repo applies that frame to AI agents.
- **arXiv:2605.10754, *Agent Cybernetics*, 2026** — single-agent control-theoretic principles (P1–P6) and desiderata (D1–D3). This project is the **multi-agent governance** complement: where the paper formalizes how one agent should be controlled, this repo addresses how a measurement and boundary layer should sit beside many agents without granting itself authority.
- **12-factor agents** — micro-discipline borrowed for the candidate-generation layer (locked context, versioned prompts, deterministic reducers). Stays inside the Qianxuesen macro loop, does not import a new runtime framework.
- **EvoPrompt** — seeded local search inspiration for `work-order:variants`. Zero-call by default; LLM critique is recommended only when a concrete value signal justifies it.
- **Aeon-style health reducers** — pure local health reducers with positive feedback, registered setpoints, and falsifiable degradation evidence inspired `health:components`. Diagnostic candidates stay in `damping`, `policy`, or `ignore` until a human reviews them.

## License

Apache-2.0
