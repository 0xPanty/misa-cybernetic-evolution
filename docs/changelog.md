# Changelog and Calibration Notes

This file keeps the version-history detail out of the README. The README should
stay focused on current state, current boundary, and current validation.

## Current Line

The package is currently `0.23.0`.

The current direction is v0.23 convergence: keep the control boundary stable,
make vector-memory hits traceable to opaque original-source refs, rank retrieval
hits by requested kind before same-source context, let the session-distiller ask
Qianxuesen for read-only work-order review, calibrate the current line on
redacted samples, pin the shadow chain in CI, and close the Hermes plugin
adapter loop with local NDJSON replay. Work-order output now has a seeded local
variant generator so the system can compare several draft task shapes before
handoff.

The calibration report now also exposes the current signal-layer map: source
signals, deterministic route signals, perception hints, work-order pressure,
retrieval-ranker inputs, and tournament quality signals. This is a review
surface only, not a new authority layer.

Precheck static hygiene also stays narrow: the secret scan walks source-like
text files and skips ignored output or dependency directories such as local run
artifacts and installed packages, so generated shadow evidence does not become
noise in the main gate.

The tournament gate now keeps its constants and frozen output contract in a
small dedicated module. This is a maintenance split only: scorer behavior,
winner selection, and route authority are unchanged.

Current-line calibration now includes a small redacted holdout group. It checks
that public-memory risk can suppress unsafe workflow promotion, while a clean
local workflow still routes to `skill`; the holdout stays medium-value and
near-threshold instead of forcing an automatic judge call.

The public repo now has a default local persistent vector store. It stores the
public `misa.local_session_distillation.v1` template under ignored run files,
exposes upsert/query/stats/rollback, and keeps the backend swappable for Zilliz,
Qdrant, LanceDB, Chroma, pgvector, or a custom adapter.

Open-source readiness now has first-class entrypoints: `npm run doctor` for a
read-only clone check and `npm run bootstrap:local` for initializing the ignored
local vector store plus a bootstrap report.

The first skill-evolution adapter surface is now present. It adds
`skill:evolution`, a skill control contract schema, a behavior event schema, and
a Farcaster reply operator example. The supervisor can block hard-boundary drift
and surface replay-required evolution candidates, but it cannot mutate skills,
write memory, publish content, or promote candidates without replay.

The Hermes runtime adapter line is now present. It adds
`hermes:adapt-runtime`, `hermes:plugin:install`, and
`hermes:plugin:doctor`. The adapter can read fixture JSON or observe-only plugin
NDJSON logs, normalize Hermes hook traces, and surface research digests plus
replay-required candidates without blocking Hermes, writing memory, mutating
skills, or calling providers.

The work-order variant line is now present. It adds `work-order:variants`, a
seeded local candidate search that scores several work-order shapes and only
recommends LLM critique when value and uncertainty signals justify the token
cost. It does not call a model, execute work, write memory, install skills, or
change route/winner authority.

## Version History

Rows before v0.23 are historical anchors for retained behavior. They should not
be read as competing current tracks; the current line is the v0.23 convergence
chain above.

| Version | Added | Boundary |
| --- | --- | --- |
| v0.2 | Deterministic dry-run learning loop: observe, identify, route, draft, verify | no publication |
| v0.3 | Read-only replay fixtures for route expectations | local replay only |
| v0.4 | Evidence gate for artifact attribution | injected-only context does not prove skill use |
| v0.5 | Skill crystallization index | draft candidates only |
| v0.6 | Self-repair draft runner | writes drafts/reports, not production |
| v0.7 | GenericAgent-inspired context-density gate | rejects broad runtime authority |
| v0.8 | EvoMap-inspired adaptive candidate gate | local candidate widening only |
| v0.9 | Signal-intake cadence contract | no scheduler startup |
| v0.10 | Signal candidate queue and daily rollup | local report only |
| v0.11 | Candidate preflight and report queue | human review before durable change |
| v0.12 | Local session distillation | no Zilliz proxy, no external API |
| v0.13 | Full local window distillation, memory-layer comparison, Skill export, repair tickets | local draft artifacts only |
| v0.14 | Work-order routing | primary-agent handoff, no execution |
| v0.15 | Hermes/Zilliz mapping and LangGraph/Qianxuesen bridge | translate refs, do not copy or write stores |
| v0.16 | OmniAgent footprint bridge | footprint as evidence only |
| v0.17 | Evolution tournament gate | local draft optimizer only |
| v0.18 | `strategy_fit` and `llm_review_value` | LLM critique only, no route/winner authority |
| v0.19 | Vector-memory original-source lineage and retrieval hints | dry-run metadata only, no Zilliz write |
| v0.20 | Kind-filtered retrieval plan and same-source reranker | read-side dry-run only, no embeddings or Zilliz write |
| v0.20.1 | Kind-aware embedding text headers | dry-run payload text only, no provider call or Zilliz write |
| v0.21 | Session-distiller review, current-line smoke/calibration, shadow CI, and tournament experience ledger | read-only artifact review and local shadow evidence only |
| v0.22 | Hermes runtime plugin install/doctor plus NDJSON adapter replay | observe-only local event capture, no memory write, skill write, block, LLM, or external API |
| v0.23 | Seeded work-order variants and value-gated LLM critique recommendation | local draft search only, no model call or execution |

## Historical Sample Validation

The v0.13 local distillation pipeline was checked against local historical
conversation summaries. These artifacts are generated under ignored `runs/`
directories and are not committed.

Compound-window pressure run:

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

Atomic-route pressure run:

```text
sources: 15
atomic_lessons: 17
compound_sources: 2
routes: skill 3 / case 3 / policy 5 / memory 3 / damping 3
minimal_l3_skill_count: 3
minimal_non_skill_promoted_count: 0
violations: 0
```

The important result: skill signals can be recovered from compound windows
without relaxing the public-memory-risk rule. Public memory risk still routes to
policy, and no exported Skill carries that signal.

## v0.18 Tournament Calibration

v0.18 kept the v0.17 local tournament and added two decision-quality checks:

- `strategy_fit`: the winning variant must fit route/source pressure, not only
  be short;
- `llm_review_value`: optional model review must name a concrete critique target
  before `--judge-mode auto` can spend a call.

Calibration workload:

| Sample group | Tournament decisions | Winner / review behavior |
| --- | ---: | --- |
| Default candidate preflight | 3 | deterministic only; `llm_review_value=none`; `llm_api_calls=0` |
| VPS sanitized conversation sample | 3 | high-value review; targets `public_boundary`, `policy_skill_boundary`, `close_tiebreak_review` |
| 30 compound historical summaries | 87 | high-value review; routes case 21 / memory 44 / skill 7 / policy 4 / damping 11 |
| 15 atomic historical lessons | 17 | medium-value optional review; deterministic default; `llm_api_calls=0` |
| History chunks, six 5-source runs | 87 | separates high-value damping/boundary review from low-value close-tie noise |
| Atomic route slices, five route-specific runs | 14 | single-route small samples stay deterministic unless another high-value target exists |

Aggregate:

```text
sample_groups: 14
tournament_decisions: 211
legacy_pressure_only_recommended: 7
v0.18_auto_recommended: 6
v0.18_optional_review: 2
v0.18_deterministic_only: 6
avoided_low_value_calls: 2
recommended_without_high_value: 0
high_value_not_called: 0
violations: 0
```

The practical result: LLM review now has to say what it will improve. Large
batches, public-boundary samples, tight damping-vs-compact margins, and
policy/skill or policy/memory boundary pressure can justify review. Plain close
scores in small single-route samples do not justify a model call by themselves.

## Reviewer Finding Closed

A read-only review found one real routing bug during v0.13 hardening:
`farcaster_public_memory_risk` was recognized as a signal but was not always
routed to `policy` when it appeared without `public_posting_boundary`.

The fix is covered in:

- `scripts/lib/session-distiller.mjs`
- `scripts/lib/learning-loop.mjs`
- `scripts/lib/memory-layer.mjs`
- `test/governance.test.mjs`

Regression coverage checks that:

- `single_failure + farcaster_public_memory_risk` routes to `policy`;
- `avoid_overreaction + farcaster_public_memory_risk` routes to `policy`;
- `reusable_workflow + farcaster_public_memory_risk` does not export a Skill.

## v0.19 Calibration and Lineage Target

The v0.19 target was a shadow result log with human labels plus replayable
source-lineage fields:

- candidate route;
- evidence count;
- winner and runner-up;
- winner margin;
- original source id / chunk hash when available;
- retrieval trace continuity;
- rejected reason;
- `llm_review_value.targets`;
- human accept/reject;
- reason for disagreement, if any.

v0.21 partially covers this with current-line calibration and redacted holdout
fixtures. The remaining useful dataset is still human-labeled shadow evidence,
not another authority layer. Use it to tune thresholds and target scoring. Do
not widen production authority to get more data.
