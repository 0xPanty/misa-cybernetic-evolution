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
| `pre_api_request` | observe redacted model-input digest after Hermes assembles provider request |
| `post_api_request` | observe redacted model-output usage digest after provider response |
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

These records are boundary observations by default. A runtime operation log is
not an official Hermes self-evolution candidate. The report therefore separates:

- `official_evolution_candidate_count`: explicit Hermes self-evolution rows;
- `inferred_evolution_pressure_count`: runtime logs interpreted as pressure;
- `boundary_observation_count`: all Layer A boundary observations;
- `work_order_stream_count`: the subset that should consume inbox attention.

Every candidate-like record must carry:

- `signal_origin`: `runtime_operation_log`,
  `hermes_official_self_evolution`, or `qianxuesen_replay_synthesis`;
- `interpretation`: what Qianxuesen is allowed to infer from that origin;
- `confidence`: `high`, `medium`, or `low`, assigned by deterministic rules.

Layer A runtime logs default to `observability_stream`. They become work orders
only when a registered anomaly rule fires. Explicit Hermes self-evolution rows
and Qianxuesen replay-synthesized evidence can enter `work_order_stream`, but
still cannot promote themselves.

This keeps the useful Hermes boundary signal without letting runtime events
directly rewrite Qianxuesen memory, skills, policy, route state, or human inbox.

Pre/post tool hooks are folded by a redacted `action_identity_fingerprint`, not
by the whole payload fingerprint. The identity hash covers tool, action, target
name/path, and Hermes target fingerprint, but not post-call result content. This
keeps the intent/result pair attached to one anomaly while still preferring the
`post_tool_call` row as the work-order representative when it exists.

## Anomaly Work-Order Gate

`anomaly_rules.version` is attached to every report so future threshold changes
do not make old ledgers incomparable. The first registry is deterministic:

- `skill_manage_create_burst`;
- `persistent_skill_mutation_pressure`;
- `write_file_sensitive_path`;
- `repeated_failure_then_skill_create`;
- `post_tool_call_failure_after_skill_manage`;
- `memory_write_boundary_pressure`.

The work-order stream is anomaly-based:

```text
runtime_operation_log
-> boundary_observation
-> observability_stream by default
-> work_order_stream only on anomaly or explicit evidence
```

## Action-History Monitor

The adapter also emits one readonly `action_history_monitor` record when runtime
operation logs contain tool-call history. This is not an anomaly rule and does
not bump `hermes-boundary-anomaly-rules.v1`.

The monitor has only two MVP metrics:

- `failure_after_repeat_rate`: a `post_tool_call` returned `error` or `failed`,
  then the next tool-call event repeated the same `action_identity_fingerprint`;
- `query_entropy`: Shannon entropy over retrieval/search tool query text.

Its output is schema-locked:

```text
record_kind = action_history_monitor
signal_origin = runtime_operation_log
routing_stream = observability_stream
can_promote_now = false
replay_required = false
tournament_required = false
```

So it can explain loops or query collapse, but it cannot create work orders,
trigger tournaments, or promote itself.

## Model I/O Tap

The Hermes plugin also emits `model_io_tap` records from `pre_api_request` and
`post_api_request`. This is an experimental input-side diagnostic, not a new
control loop. It exists to answer one narrow question: when the agent behaved
badly, was the model being fed a clean case file or a bloated/unstable one?

The tap stores only deterministic counts and hashes:

- `input_tokens`, `output_tokens`, and `cache_read_tokens` when Hermes exposes
  usage;
- `message_count` and `context_byte_size`;
- `tool_schema_count`;
- `tool_result_error_count`;
- `system_prompt_hash` and `tool_schema_hash`.

It does not persist raw prompts, raw tool schemas, raw tool results, assistant
answers, or provider keys. Its output is schema-locked:

```text
record_kind = model_io_tap
signal_origin = runtime_operation_log
routing_stream = observability_stream
can_promote_now = false
replay_required = false
tournament_required = false
raw_prompt_persisted = false
raw_private_content_exported = false
```

The first phase is not decision-authorized. These records do not feed Layer A,
replay reports, tournaments, SNR, or anomaly rules. They can be cross-checked by
the measurement quality gate only as Layer C observability.

Before VPS deployment, the plugin redaction test is blocking. The test injects
multiple canaries into synthetic prompts, fake provider fields, tool args, long
code-like content, and assistant output. `npm test` must prove none of those
canaries reach NDJSON; only counts, hashes, and booleans may be persisted.

## Measurement Quality Gate

Phase 2-A adds an emit-only `measurement_quality_gate` record inside Layer C.
It cross-checks `action_history_monitor` and `model_io_tap`, but it does not
block Layer A yet.

The gate answers a narrower question than tournament quality:

```text
not: is this candidate good?
yes: is this measurement environment clean enough to trust?
```

The first registry is separate from anomaly rules:

```text
hermes-measurement-gate-rules.v1
```

MVP verdicts:

- `clean_measurement`: monitor and model I/O evidence are present and no
  measurement contamination rule fired;
- `suspect_input_contamination`: model input looks dirty, such as very large
  context, too many exposed tools, or accumulated failed tool results;
- `suspect_behavior_loop`: action history looks like a loop, such as repeated
  failure-after-repeat or collapsed search entropy;
- `suspect_compound_failure`: input contamination and behavior-loop rules both
  fired in the same window;
- `insufficient_evidence`: the gate saw too little monitor/model-I/O evidence to
  treat the measurement as clean.

Phase 2-A authority is locked down:

```text
record_kind = measurement_quality_gate
gate_phase = emit_only
routing_stream = observability_stream
blocks_layer_a = false
triggers_replay = false
agent_can_read = false
llm_api_calls = 0
```

So the gate can produce a measurement verdict for later calibration, but dirty
measurements are not filtered yet. Later phases may earn manual replay or auto
replay authority only after real data shows the gate is stable.

The adapter also emits a separate `measurement_gate_bias_monitor` record. This is
the gate-of-gate: it watches whether the gate would mark one candidate type dirty
more often than others. In Phase 2-A it is only a current-window snapshot. It does
not block Layer A, trigger replay, or judge candidate quality.

Strong validation is ordered:

1. `redaction` is a deploy blocker. If canaries leak into NDJSON, do not deploy
   the plugin to VPS.
2. `known-answer fixtures` prove mechanical wiring only. They check that each
   deterministic rule produces the expected verdict, but they do not prove the
   thresholds are correct.
3. `real-run calibration` is required before Phase 2-B. Start manual review only
   after at least 50 real sessions, dirty verdict rate stays in the 5%-30% band,
   human review agrees with dirty verdicts at least 70% of the time, and the
   gate-bias monitor shows no candidate-type skew.

The report also emits `sidecar_signal_to_noise_ratio`:

```text
work_order_stream_count / boundary_observation_count
target band: 0.05 - 0.20
```

Too high means the sidecar is becoming noisy. Too low can mean it is missing
useful anomalies. The metric is a deterministic reducer and does not use LLMs.

Observability retention is declared as:

```text
raw_events_window=30d
aggregated_stats_window=1y
enforcement_mode=declared_only_no_deletion
```

This version does not delete or compact historical logs.

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

## Value Proof Scope

`npm run hermes:value-proof` runs deterministic comparisons on the local
Qianxuesen corpus, local Hermes fixtures, and the evolution-grade sample file.
Those 11500-style comparisons prove internal discriminator consistency on known
local samples, including `positive_lift_rate=1.0` and negative-control rejection.

They are not a measured accuracy score for Hermes official self-evolution. A
real runtime tap with only `runtime_operation_log` rows has:

```text
official_evolution_candidate_count=0
```

Layer B validation starts only when Hermes emits explicit
`hermes_official_self_evolution` rows or Qianxuesen synthesizes replay evidence.

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
