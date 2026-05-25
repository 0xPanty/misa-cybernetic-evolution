# Changelog and Calibration Notes

This file keeps the version-history detail out of the README. The README should
stay focused on current state, current boundary, and current validation.

## Current Line

The package is currently `0.28.0`.

The current direction is v0.26 convergence: keep the control boundary stable,
make vector-memory hits traceable to opaque original-source refs, rank retrieval
hits by requested kind before same-source context, let the session-distiller ask
Qianxuesen for read-only work-order review, calibrate the current line on
redacted samples, pin the shadow chain in CI, and close the Hermes plugin
adapter loop with local NDJSON replay. Work-order output now has a seeded local
variant generator so the system can compare several draft task shapes before
handoff. The work-order quality evaluator now checks whether the final selected
work-order packet improves Qianxuesen control-loop quality rather than merely
passing the command path, and it now carries local issue/PR-shaped dev/test
samples so future tuning has a holdout guard.
The evaluator now also adds a small selection/update rule and a medium-risk
diversity guard: selected winners must beat the incumbent baseline without
safety regression, and same-quality medium-risk candidates can rotate across
replay, compact handoff, and evidence expansion instead of collapsing into one
strategy.
It also uses a small risk-adaptive budget: high-risk work keeps the full
population, medium-risk work keeps replay/compact/evidence coverage, and
low-risk work spends fewer candidate slots without losing the held-out quality
lift.
LLM mutation/crossover and Evolution/Task model separation are now represented
as explicit zero-call gates: review-worthy boundary signals go straight into
the current primary agent's inline review context, while any external or
stronger-model mutation/crossover still requires explicit enablement. Route,
score, selection, safety, and execution stay outside LLM authority.

v0.26 adds Hermes evolution-grade evidence and a local value proof command.
Hermes runtime events can now carry frozen baseline, held-out split, before/after
score, sample count, and metric-gaming-risk evidence into replay-required work
orders. `npm run hermes:value-proof` replays the local work-order corpus, Hermes
adapter samples, the evolution-grade fixture, and a bad-evidence control group
across deterministic seeds before reporting the Hermes intake as value-positive.

The open-source entry now also has a one-command local sidecar path:
`node scripts/setup-local.mjs` for fresh clones and `npm run deploy:local` after
dependencies are installed. It runs doctor, local bootstrap, and Hermes value
proof while keeping production deploys, provider calls, Zilliz writes, Hermes
memory writes, and skill mutation disabled.

The one-command full-shadow path is also present: `node scripts/setup-full-shadow.mjs`
for fresh clones and `npm run deploy:full-shadow` after dependencies are
installed. It wires local sidecar readiness, deterministic window distillation,
Hermes observe-only plugin install, event-log replay, Hermes work-order
generation, session-distiller cybernetic review, work-order inbox export, owner
digest reporting, and value proof. `npm run deploy:vps-shadow` installs the existing VPS-style
session-distiller `ExecStartPost` hook on Linux hosts that already run
`misa-session-distiller.service`.

The work-order inbox now closes the L4 report loop: repeated session-distiller
failures are grouped by failure class, the owner digest writes JSON/Markdown
handoff artifacts, and reported work orders remember the occurrence count that
has already been surfaced. Matching failures keep appending evidence to the same
work order; a fresh digest is raised only when new unreported evidence crosses
the observation threshold. The digest remains report-only and cannot execute
work orders.

v0.27.1 adds `npm run update:vps-shadow`, the safe one-command VPS updater. It
refuses tracked local changes, fast-forwards from `origin/main`, runs `npm ci`,
runs the full-shadow self-check, and refreshes the VPS session-distiller hook.
`--dry-run` prints the sequence without changing git state or system files.

v0.27.2 makes the VPS hook refresh complete by updating
`MISA_CYBERNETIC_EXPECT_COMMIT` in the session-distiller env file to the current
repo commit when `deploy:vps-shadow` installs the hook. This keeps the Hermes
wrapper pin aligned after one-command updates.

v0.27.3 keeps that installer idempotent on older VPS installs by removing the
legacy `20-cybernetic-review.conf` drop-in when the current
`cybernetic-review.conf` hook is installed, so the same review hook does not run
twice after one service execution.

v0.28.0 adds the Hermes model I/O tap and emit-only measurement quality gate.
The Hermes plugin now observes `pre_api_request` and
`post_api_request` as redacted model-I/O digests, storing only counts and hashes.
The adapter cross-checks those digests with the action-history monitor to emit
measurement verdicts such as `clean_measurement`, `suspect_input_contamination`,
`suspect_behavior_loop`, `suspect_compound_failure`, and
`insufficient_evidence`. A separate `measurement_gate_bias_monitor` watches
prospective candidate-type skew before any future Phase 2-B replay authority.
All three records are schema-locked to `observability_stream`, cannot enter
`work_order_stream` or `evolution_candidates`, cannot trigger tournament or
replay, and cannot be read by the agent. Redaction canary tests are now in the
main `npm test` path. Live `model_io_tap` sessions are calibration input for
future trigger bands and review policy; they do not create a shortcut from
diagnostic telemetry to replay, tournament, or live authority.

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
read-only clone check, `npm run bootstrap:local` for initializing the ignored
local vector store plus a bootstrap report, and `npm run deploy:local` for the
combined local sidecar setup. `npm run deploy:full-shadow` extends that into
the full observe-only window-distillation/Hermes/session-distiller/work-order
chain.

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

The work-order quality evaluation line is now present. It adds
`work-order:evaluate`, a baseline-vs-winner scorer for final work-order packets.
It tracks source trace, replayability, boundary safety, handoff clarity,
control-loop fit, Qianxuesen fit, sample diversity, dev/test holdout lift, and
zero-call safety.

The v0.26 architecture closeout is now complete as a control-plane hardening
line. It closes the plant/setpoint/sensor/post-deploy/stability/outer-loop
architecture gaps, then finishes P4 engineering hardening: control-path provider
guards, provider dynamic-import detection, loser-pressure sample splitting,
work-order quality artifact splitting, current/history docs separation,
sidecar status broadcast, and a work-order quality golden snapshot. The
remaining `work-order-quality-eval.mjs` body split is intentionally deferred to
the next time scoring logic needs a real change; it is backlog, not a current
blocker.

The v0.27 candidate layer starts the 12-factor integration at the candidate
generation boundary, not at runtime autonomy. It adds locked candidate context,
versioned prompt templates, unified human escalation packets, a deterministic
candidate reducer, route-focused generator charters, and an explicit control
boundary document. It does not import HumanLayer, BAML, launch/pause/resume
runtime state, multi-entry triggers, provider calls, or production/VPS authority.

The v0.28 runtime thread starts the launch/pause/resume layer as a local event
log and deterministic next-step reducer. It adds `agent_thread` and `next_step`
contracts, pauses on unified human escalation packets, records human decisions as
resume events, and routes resumed work to a local gate. It does not enable
webhooks, cron triggers, tool execution, provider calls, memory writes, service
starts, or production/VPS authority.

## Version History

Rows before v0.28 are historical anchors for retained behavior. They should not
be read as competing current tracks; the current package line is v0.28.0 and the
current command surface is the local/shadow gate described above.

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
| v0.24 | Work-order quality evaluation plus Qianxuesen strategy alignment | baseline-vs-winner scoring only, no execution or model call |
| v0.25 | Issue/PR-shaped external work-order samples, dev/test holdout, work-order quality replacement, medium-risk diversity guard, risk-adaptive candidate budget, zero-call LLM mutation/crossover gate, and Evolution/Task model split | local fixture adapter only, no external fetch, execution, model call, external API, winner authority, or task-model call |
| v0.26 | Cybernetic architecture closeout plus P4 hardening: plant model, measurable setpoints, deterministic sensor, post-deploy review, stability monitor, outer-loop review, control-path provider guards, docs current/history split, sidecar status broadcast, and work-order quality golden snapshot | local control-plane contracts and reports only; no production/VPS authority, provider call, webhook push, execution, memory write, or route/winner authority change |
| v0.27 | Factor-compliant candidate layer: locked context, versioned prompts, unified human escalation, deterministic reducer, small route-focused generator charters, and documented dumb zone / authority matrix | candidate-generation discipline only; no runtime autonomy, HumanLayer, BAML, provider call, execution, memory write, skill install, production/VPS authority, or route/winner authority change |
| v0.28 | Runtime thread contract: local event log, unified execution/business state, deterministic next-step reducer, pause on human escalation, and resume via recorded human decision | local orchestration skeleton only; no webhook/cron trigger, tool execution, provider call, memory write, service start, production/VPS authority, or route/winner authority change |

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
