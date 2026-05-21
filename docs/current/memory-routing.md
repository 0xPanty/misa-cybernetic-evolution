# Memory Routing

The router decides where a lesson belongs.

## Routing Table

| Signal | Destination |
| --- | --- |
| Durable fact | memory candidate |
| Reusable workflow | skill draft |
| Repeated failure | case record |
| Behavioral rule | policy proposal |
| Single weak signal or overreaction risk | damping hold |
| One-off detail | ignore or short-lived session note |
| Unsupported inference | reject |

## Rules

1. Do not learn from silence.
2. Do not infer durable preference from a single event.
3. Do not store raw private content when a redacted summary is enough.
4. Store bottom logic in memory.
5. Store procedure in skills.
6. Store failure and recovery patterns in cases.
7. Preserve evidence links for every promoted artifact.
8. Use damping when the right move is to wait, not write.

## Promotion Thresholds

Suggested defaults:

- one event: draft only
- two similar failures: case candidate
- three confirmed successes: skill candidate
- explicit user correction: memory candidate, pending verification
- high-risk behavior change: policy proposal with approval required
- single transient failure: damping hold, no publication
