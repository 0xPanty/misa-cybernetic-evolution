# Component Health Diagnostics v0.29

`health:components` adds local health sensing before any self-heal executor is
enabled.

Plain rule:

```text
Health is a deterministic reducer, not an LLM score.
Diagnostics become replayable candidates for a human owner, not automatic fixes.
```

## Scope

The command reads current-line smoke checks or a saved smoke JSON artifact. It
classifies local components, preserves positive feedback, and emits diagnostic
candidates only when a component is degraded or critical.

It may:

- classify components as `HEALTHY`, `WARNING`, `DEGRADED`, or `CRITICAL`;
- preserve positive feedback for passing behavior;
- count consecutive failures from an optional local history file;
- suppress repeated diagnostics during a 24-hour cooldown;
- emit replayable diagnostic candidates with `auto_execute=false`;
- keep the legacy `diagnostic_work_orders` array as an alias for old readers.

It must not:

- execute work orders or candidates;
- let an agent consume the diagnostic candidate directly;
- call model providers or external APIs;
- write persistent memory;
- write Zilliz or create embeddings;
- start timers, services, webhooks, or workers;
- touch VPS or production;
- change route, metric, winner, setpoint, or authority decisions.

## Pure Reducers

The health layer exposes four pure reducers. They use only local check fields
and optional local history. There is no model call and no 1-5 LLM rating.

| Reducer | Plant component | Metric id | Formula |
| --- | --- | --- | --- |
| `session_distiller_health` | `session_distiller.health_schema_pass_rate` | `session_distiller.health_schema_pass_rate` | schema-valid outputs / total distiller outputs |
| `runtime_thread_health` | `runtime_thread.health_registered_actuator_rate` | `runtime_thread.health_registered_actuator_rate` | registered next-step actuator hits / total next-step decisions |
| `work_order_inbox_health` | `work_order_inbox.health_dead_letter_rate`, `work_order_inbox.health_median_ack_latency_ms` | both matching metric ids | dead letters / total inbox items, plus median human ACK latency |
| `vector_store_health` | `vector_store.health_hit_rate`, `vector_store.health_write_failure_count` | both matching metric ids | retrieval hit rate plus write-failure count |

Each metric id is registered in
[examples/metric_registry.example.json](../../examples/metric_registry.example.json),
and each plant component is registered in
[examples/plant_model.example.json](../../examples/plant_model.example.json).

## Setpoints

Repeated-failure escalation uses the registered setpoint
`component_health.escalation_threshold`. The default target is `3`, but it is
data, not a magic number in the decision path. A slow-loop review can recommend
moving it to `2`, `5`, or another value by changing the setpoint with evidence.

The same command output includes the setpoint object used for the run.

## Diagnostic Candidates

Diagnostics are not a sixth route. A diagnostic is a special candidate whose
`route` is one of:

- `damping`: recommend pausing or dampening the local path;
- `policy`: recommend a slow-loop policy or threshold review;
- `ignore`: archive the observation.

Each diagnostic candidate includes:

- `evidence_ref.kind=health_sequence`;
- a deterministic `replay_key`;
- a deterministic fingerprint;
- `replay_required=true`;
- `llm_generated=false`;
- `delivery.receiver_type=human_owner`;
- `human_escalation.queue=human_escalation`;
- `execution_policy.agent_self_review_allowed=false`.

The human owner is the only consumer. An agent may produce the candidate, but it
does not get to read the candidate and repair itself automatically. After human
approval, the candidate still goes through the existing replay/local-gate path.

## Falsifiable Degradation

Every component carries `degradation_evidence`. The explanation has to be
falsifiable:

- the source check failed;
- a deterministic risk field crossed a registered setpoint;
- consecutive failures reached `component_health.escalation_threshold`.

If those inputs change, the reducer result must change. That keeps health as a
control signal instead of a dashboard color.

## Commands

Run the current local smoke checks, then classify component health:

```bash
npm run health:components -- --json
```

Classify a saved smoke artifact without rerunning smoke:

```bash
npm run health:components -- --smoke-file runs/manual/current-line-smoke.json --json
```

Use a previous local history file for consecutive-failure and cooldown logic:

```bash
npm run health:components -- --smoke-file runs/manual/current-line-smoke.json --history-file runs/manual/component-health-history.json --json
```

Write a strict JSON handoff artifact:

```bash
npm run health:components -- --out-file runs/manual/component-health.json
```

## Positive Feedback

Every component keeps the passing signal that made it useful, for example:

- no production authority;
- no persistent memory write;
- no Zilliz write;
- no embedding creation;
- no model or external API call;
- no work-order execution;
- positive candidate lift;
- deterministic runtime next step.

This makes the report useful even when everything passes. It shows which parts
of the loop are actively contributing signal instead of only saying "no
failure."

## Boundary

This layer is not the automatic self-heal executor. It is the missing health
sense between "the local loop passed once" and "the system can explain which
part is degrading over time."

The intended chain is:

```text
current-line smoke
-> component-health pure reducers
-> positive feedback / falsifiable degradation signal
-> replayable diagnostic candidate in damping|policy|ignore
-> human_escalation inbox
-> existing replay and local gate only if the human owner approves
```
