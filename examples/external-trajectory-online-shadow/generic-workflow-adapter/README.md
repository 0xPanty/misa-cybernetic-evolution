# Generic Workflow Adapter Template

This is the public plug template for custom workflows.

Use it when a project has its own event shape, such as CI failures, GitHub
reviews, Discord moderation notes, customer feedback, or another agent runtime.
The adapter only translates that source into `misa.perception_digest.v1`.

It does not execute work orders, write memory, write Zilliz, create embeddings,
call an LLM, call external APIs, change routes, or change winners.

## Run

```bash
npm run external:generic-adapter -- --json
```

Write the digest to a file:

```bash
npm run external:generic-adapter -- --out-file runs/manual/generic-workflow-digest.json
```

Feed the digest into the online shadow contract:

```bash
npm run external:online-shadow -- --perception-digest runs/manual/generic-workflow-digest.json --json --dry-run
```

## Input Shape

The adapter reads `input.workflow-events.json` by default. Each event should
preserve:

```text
event_id
source_project
repo
time
task_family
source_kind
source_refs
observed_signals
route_pressure
priority
```

Adapters for real systems can use any internal parsing they need. Their public
output should still be the same sanitized digest shape.

## Boundary

The adapter is a plug converter:

```text
custom workflow logs/events
-> generic adapter template
-> misa.perception_digest.v1
```

The online shadow contract is the socket:

```text
misa.perception_digest.v1
-> npm run external:online-shadow
-> readout / hints / draft tickets / draft work orders
```
