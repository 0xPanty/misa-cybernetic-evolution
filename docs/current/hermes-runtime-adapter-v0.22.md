# Hermes Runtime Adapter v0.22

`hermes:adapt-runtime` is the first concrete runtime plug for the universal
Qianxuesen adapter contract. The matching sample plugin lives at
`examples/hermes-runtime-plugin`.

It is observe-only by default. The adapter does not start services, write Hermes
memory, mutate Hermes skills, block runtime tools, call LLMs, or call external
APIs. The install command only copies the local plugin files into a Hermes
plugin folder.

## Plain Shape

```text
Hermes hook/tool trace
-> normalize into Qianxuesen runtime event
-> create research digest or replay-required candidate
-> send candidate into replay/tournament later
```

Hermes stays the carrier runtime. Qianxuesen stays the learning controller.

## Control-Plane Write-Deny

The adapter output includes `misa.control_plane_write_deny.v1`:

```text
default_decision=deny
direct_writes_allowed=false
bypass_allowed=false
allowed_surface=observe_and_emit_replay_required_candidates
```

This is the explicit form of the observe-only boundary. Hermes runtime events
may become research digests or replay-required candidates, but they cannot
directly write Hermes memory, Hermes skills, Qianxuesen state, or candidate
promotion state.

## Plugin Install And Doctor

```bash
npm run hermes:plugin:install
npm run hermes:plugin:doctor
```

Default install target:

```text
~/.hermes/plugins/qianxuesen-runtime-adapter/
```

Default event log:

```text
~/.hermes/qianxuesen-runtime-events.ndjson
```

Use `--plugin-dir` or `--event-log` when Hermes uses a different local path.
`hermes:plugin:doctor` validates the plugin shape and, when an event log exists,
replays that NDJSON through `hermes:adapt-runtime`.

## Mapped Hermes Surfaces

| Hermes surface | Qianxuesen use |
| --- | --- |
| `pre_tool_call` | observe tool intent before runtime execution |
| `post_tool_call` | observe result, failure, and evidence refs |
| `pre_llm_call` | observe model-request boundary |
| `post_llm_call` | observe output and background-review pressure |
| `on_session_end` | flush adapter events into a digest boundary |
| `skill_manage` | skill variant pressure, replay required |
| `memory` | memory or policy pressure, no durable write |
| `session_search` / web research | research digest evidence |
| Hermes curator | background skill lifecycle pressure |

## Candidate Rule

The adapter can produce:

- `research_digest`
- `skill_variant`
- `policy_boundary_variant`
- `research_followup`
- `damping_rule_candidate`

All evolution candidates are marked:

- `replay_required: true`
- `tournament_required: true`
- `can_promote_now: false`

This keeps the useful Hermes self-improvement signal without letting runtime
events directly rewrite Qianxuesen memory, skills, policy, or route state.

## Evolution-Grade Samples

The adapter can also preserve a compact `evolution_evidence` block when Hermes
emits before/after replay evidence. This is the minimum useful proof shape:

- `baseline_snapshot_id`: the frozen behavior being compared against;
- `holdout_split_id`: the held-out sample split, not the same sample used to
  notice the issue;
- `before_score` / `after_score`: the measured direction of change;
- `sample_count`: how much replay pressure backed the claim;
- `metric_gaming_risk`: whether the metric looks easy to game.

Qualified evidence can support optimization only when the direction is positive,
the baseline and held-out split are present, and the gaming risk is not high.
It still creates replay-required candidates only; it does not promote anything.

## Verification

```bash
npm run hermes:adapt-runtime -- --json
npm run hermes:adapt-runtime -- --fixture-file test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json --json
npm run hermes:work-order -- --fixture-file test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json --json --dry-run
npm run hermes:adapt-runtime -- --event-log ~/.hermes/qianxuesen-runtime-events.ndjson --json
npm run hermes:plugin:doctor
npm run validate:schemas
npm run smoke:current-line
npm run precheck
npm test
```

The default fixture is:

- `test/fixtures/hermes-runtime-adapter/hermes-self-improvement-events.json`

The evolution-grade fixture is:

- `test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json`

The output schema is:

- `schemas/agent_runtime_adapter.schema.json`
