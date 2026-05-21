# External Trajectory Online Observe-only Shadow Contract v0.29

This is the next contract after the second Pro review closeout. It lets real
signals enter the external trajectory readout path, but only as observation and
review material.

Command:

```bash
npm run external:online-shadow -- --json --dry-run
```

Default input:

```text
examples/perception_digest.example.json
```

Optional input:

```bash
npm run external:online-shadow -- --perception-digest <path-to-sanitized-perception-digest.json>
```

Public adapter example:

```text
examples/external-trajectory-online-shadow/generic-workflow-digest.example.json
examples/external-trajectory-online-shadow/generic-workflow-adapter/
```

## Public Adapter Pattern

This contract is the generic plug socket. A workflow-specific adapter is only a
thin plug converter.

```text
custom workflow logs/events
-> workflow-specific adapter
-> misa.perception_digest.v1
-> npm run external:online-shadow
-> external trajectory readout / hints / draft tickets / draft work orders
```

The core contract should not know whether the source came from Hermes,
Farcaster, GitHub, Discord, CI, a customer-feedback queue, or another agent
runtime. That complexity belongs in the adapter that prepares the sanitized
digest.

Every custom adapter should preserve these fields when full perception is
available:

```text
source_project
repo
time
task_family
source_refs
observed_signals
route_pressure
```

The adapter may be complex internally. The contract boundary stays simple:

```text
input is sanitized evidence
output is observe-only review material
no route authority
no winner authority
no writes
no execution
```

The runnable template is:

```bash
npm run external:generic-adapter -- --json
```

It converts:

```text
examples/external-trajectory-online-shadow/generic-workflow-adapter/input.workflow-events.json
```

into a `misa.perception_digest.v1` payload that can be passed to:

```bash
npm run external:online-shadow -- --perception-digest <digest.json> --json --dry-run
```

## Contract

Allowed outputs:

```text
external_trajectory_readout
review_hints
repair_ticket_drafts
work_order_drafts
```

Blocked effects:

```text
route_change
winner_change
persistent_memory_write
zilliz_write
embedding_creation
raw_external_content_persistence
live_llm_call
external_api_call
work_order_execution
vps_touch
github_push
public_publish
```

The contract is deliberately narrower than production authority. A signal can
be explained, queued for review, or turned into a no-write draft ticket/work
order. It cannot change route selection, winner selection, memory, storage, or
runtime behavior.

## Online Observe-only Shadow

Input must already be sanitized signal/reference evidence. The contract accepts:

```text
misa.perception_digest.v1
sanitized_signal_refs
runtime_observation_refs
```

Each source ref becomes an `online_shadow_record` with:

```text
source_id
source_kind
source_refs
observed_signals
primary_route_pressure
readout_family
external_trajectory_readout.admission=observe_only
authority_closure
```

This is enough for the external trajectory readout to say, in plain terms, why a
real signal matters. It is not enough to promote the signal into a hard gate.

## No-write Suggestion/Ticket Contract

Review hints, repair tickets, and work orders stay drafts:

```text
authority=hint_only or suggestion_only
status=draft_no_write
auto_execute_allowed=false
route_change_allowed=false
winner_change_allowed=false
persistent_memory_write_allowed=false
zilliz_write_allowed=false
embedding_creation_allowed=false
llm_call_allowed=false
external_api_call_allowed=false
human_review_required=true
```

So the output is useful for a human/agent review pass, but it is not an action
surface.

## Full-perception Holdout Fields

Fresh online validation still needs stronger independence fields once full
perception exists:

```text
source_project
repo
time
task_family
```

Until those fields are available, online observe-only evidence can be used as
readout and review pressure only. It should not be claimed as an independent
production holdout.

## Artifacts

Implementation:

```text
scripts/external-trajectory-online-shadow-contract.mjs
scripts/lib/external-trajectory-online-shadow-contract.mjs
schemas/external_trajectory_online_shadow_contract.schema.json
examples/external-trajectory-online-shadow/generic-workflow-digest.example.json
examples/external-trajectory-online-shadow/generic-workflow-adapter/
test/external-trajectory-online-shadow-contract.test.mjs
```

Generated outputs:

```text
runs/external-trajectory-online-shadow/<timestamp>/external-trajectory-online-shadow-contract.json
runs/external-trajectory-online-shadow/<timestamp>/external-trajectory-online-shadow-contract.md
```
