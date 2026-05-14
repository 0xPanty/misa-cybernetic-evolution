# Misa Cybernetic Evolution Layer

A control-theoretic learning sidecar for Hermes-style AI agents.

Current package version: `0.21.0`. The current line keeps source-lineage and
retrieval trace metadata for vector-memory dry runs, adds read-only
session-distiller cybernetic review, and keeps the control boundary stable: no
live Zilliz writes, no embeddings, and no runtime changes.

![Misa Cybernetic Evolution Layer control loop](docs/assets/langgraph-qianxuesen-flow.svg)

## One-Line Verdict

This is the local control layer that helps Misa learn from real work without
silently changing production behavior.

## Current Position

This repository is a local dry-run and shadow-ready learning plane. It turns
completed agent work into evidence-backed drafts for memory, skills, cases,
policy, and damping.

It is useful as:

- Misa/Hermes structure reference;
- local precheck layer;
- read-only replay and distillation fixture suite;
- local candidate optimization and repair-ticket generator;
- primary-agent work-order handoff format.

It is not a production autonomous brain.

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
| VPS update authority | not enabled |
| LLM route or winner authority | not enabled |

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
-> let the agent self-review and resolve low-risk local work when policy allows
-> classify logs, decisions, candidate experience, policy, and work orders for vector storage
-> attach original-source refs, replay keys, and retrieval hints for future hit explanation
-> produce a shadow perception digest that prioritizes sources without route authority
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
| Learning-loop simulation | `npm run simulate:misa` | local fixtures only |
| Local session distillation | `npm run distill:misa` | no Zilliz, no embedding provider, no external API |
| Shadow perception digest | `npm run perception:digest -- --json` | sensor/prioritizer only; optional `--ledger-file` emits action recommendations and no-write ledger update proposals |
| Perception log layout | `npm run perception:layout` | local directory contract only; `--init` creates separated dry-run folders under the chosen root |
| Hermes/Zilliz mapping | `npm run hermes:map-distillation -- --json` | translates refs, does not copy or write Zilliz |
| Context-density review | `npm run density:misa` | rejects high-authority runtime imports |
| Adaptive candidate gate | `npm run adaptive:misa` | local candidate widening only |
| Signal intake contract | `npm run intake:misa` | cadence contract, no scheduler startup |
| Daily signal rollup | `npm run rollup:misa` | local queue and report only |
| Candidate preflight | `npm run evolution:evaluate:misa` | report queue only |
| Evolution tournament | `npm run evolution:tournament:misa` | local draft winner only |
| Memory-layer comparison | `npm run memory-layer:misa` | compares broad vs minimal L3 |
| Local skill export | `npm run export-skills:misa` | writes draft files, does not install Skills |
| Repair tickets | `npm run repair-ticket:misa -- --dry-run` | local work queue only |
| Session distiller review | `npm run session-distiller:review -- --json --summary-file <file>` | review distiller/Zilliz artifacts and open work-order candidates only |
| Work-order routing | `npm run work-order:route -- --dry-run` | default risk-graded self-review, still no durable/public execution |
| Vector memory classification | `npm run vector-memory:classify -- --json` | Zilliz/local-vector storage plan only, no writes |
| Vector retrieval ranker | `npm run vector-memory:rank -- --eval-fixtures` | kind filter and same-source rerank dry-run, no embeddings or writes |
| Zilliz adapter dry-run | `npm run zilliz:adapt -- --json` | collection and upsert payload only, no embeddings or writes |
| LangGraph bridge contract | `npm run langgraph:bridge -- --json` | carrier contract only |
| OmniAgent footprint bridge | `npm run omniagent:footprint` | footprint as evidence only |
| Current-line smoke | `npm run smoke:current-line` | one dry-run guard for session review, work orders, tournament, vector/ranker, and Zilliz adapter |
| Current-line calibration | `npm run calibrate:current-line` | redacted sample calibration for signal layers, route, work-order, retrieval, tournament, and judge value |

## Current-Line Command Map

| Concept name | Actual command |
| --- | --- |
| Current-line smoke guard | `npm run smoke:current-line` |
| Real-sample calibration report | `npm run calibrate:current-line` |
| Session-distiller review | `npm run session-distiller:review -- --json --summary-file examples/session-distiller-summary.example.json` |
| Work-order route check | `npm run work-order:route -- --dry-run` |
| Vector-memory classification | `npm run vector-memory:classify -- --json` |
| Retrieval-ranker regression | `npm run vector-memory:rank -- --eval-fixtures` |
| Zilliz adapter dry-run | `npm run zilliz:adapt -- --json` |
| Evolution tournament | `npm run evolution:tournament:misa` |

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

v0.18 adds two decision-quality checks:

- `strategy_fit`, so the winner must fit the route/source pressure;
- `llm_review_value`, so model review is only suggested when there is a concrete
  critique target.

Default judge mode is `advise`, which keeps `llm_api_calls=0`. `--judge-mode auto`
may call a reviewer only when `llm_review_value.level=high`. The reviewer can
add critique notes, but it cannot change the route or winner.

## Validation

For the normal local confidence chain:

```bash
npm install
npm run validate:schemas
npm run precheck
npm test
```

For the broader local learning-chain smoke:

```bash
npm run smoke:current-line
npm run calibrate:current-line
```

The same chain is pinned in GitHub Actions as
`.github/workflows/current-line-shadow.yml`. It runs schema validation,
current-line smoke, current-line calibration, precheck, and tests with
`MISA_SHADOW_MODE=true` and no secrets.

The calibration report also names the current signal layers directly:
source-distillation signals, Qianxuesen route signals, shadow perception hints,
work-order pressure, retrieval-ranker inputs, and tournament quality signals.
That map is descriptive only; it does not add a new controller or any write
authority.

For the expanded module-by-module version:

```bash
npm run simulate:misa
npm run distill:misa
npm run perception:digest
npm run perception:layout
npm run perception:digest -- --source-dir test/fixtures/perception/shadow-sources --ledger-file test/fixtures/perception/handled-signal-ledger.json
npm run rollup:misa
npm run evolution:evaluate:misa
npm run evolution:tournament:misa
npm run memory-layer:misa
npm run repair-ticket:misa -- --dry-run
npm run session-distiller:review -- --json --summary-file examples/session-distiller-summary.example.json
npm run work-order:route -- --dry-run
npm run vector-memory:classify -- --json
npm run vector-memory:rank -- --eval-fixtures
npm run zilliz:adapt -- --json
npm run calibrate:current-line
```

For machine-to-machine JSON handoff, do not redirect plain npm-script JSON
stdout into the next command. Use silent npm mode, direct script execution, or
`--out-file <path>` so the file contains only JSON.

## v0.21 Direction

Do not add another governance layer by default. The useful v0.21 work is:

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
9. reduce maintenance noise in precheck, README, and tests.

The scarce thing now is not more abstraction. It is calibration evidence and
replayable source lineage.

The new public default for work orders follows that rule too: let the agent
practice on bounded local work, keep self-review logs as candidate experience,
and only widen authority when the user explicitly asks for it.

## Documentation Map

Current-state docs:

Versioned document names such as v0.18 and v0.20 are historical anchors for
features that still feed the v0.21 line. They are not separate current release
tracks; use the command map and validation chain above for the current surface.

- [Architecture](./ARCHITECTURE.md)
- [Control contract](./CONTROL_CONTRACT.md)
- [Verification matrix](./docs/verification-matrix.md)
- [Source synthesis](./docs/source-synthesis.md)
- [Memory-layer and Skill export](./docs/memory-layer-skill-export-v0.13.md)
- [Work-order routing](./docs/work-order-routing-v0.14.md)
- [Vector memory storage](./docs/vector-memory-storage-v0.19.md)
- [Zilliz vector adapter](./docs/zilliz-vector-adapter-v0.19.md)
- [Retrieval lineage](./docs/retrieval-lineage-v0.19.md)
- [Vector retrieval ranker](./docs/vector-retrieval-ranker-v0.20.md)
- [Evolution tournament v0.18](./docs/evolution-tournament-gate-v0.18.md)
- [Current-line calibration v0.21](./docs/current-line-calibration-v0.21.md)

Bridge docs:

- [Hermes/Zilliz mapping](./docs/hermes-distillation-mapping-v0.15.md)
- [LangGraph/Qianxuesen bridge](./docs/langgraph-qianxuesen-bridge-v0.15.md)
- [OmniAgent footprint bridge](./docs/omniagent-footprint-bridge-v0.16.md)

History and calibration:

- [Version changelog and calibration notes](./docs/changelog.md)

## Remotion Diagram Source

The diagram above has a Remotion storyboard source at
[docs/remotion/langgraph-qianxuesen-flow.tsx](./docs/remotion/langgraph-qianxuesen-flow.tsx).
It is kept as a future animation source for the same logic: evidence in, local
control decisions, safe drafts out, human boundary preserved.

## License

Apache-2.0
