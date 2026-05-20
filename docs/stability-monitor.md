# Stability Monitor

The stability monitor is the divergence brake for the local learning loop.

Plain version: damping says "do not overreact to one weak signal." Stability
monitoring says "if a route keeps getting worse, stop feeding it more
candidates until a human reviews it."

Machine-readable files:

- [schemas/stability-indicator.schema.json](../schemas/stability-indicator.schema.json)
- [examples/stability_indicator.example.json](../examples/stability_indicator.example.json)
- [scripts/lib/stability-monitor.mjs](../scripts/lib/stability-monitor.mjs)

## First Indicators

The first two indicators watch the routes most likely to diverge:

- `memory_route.promote_rollback_ratio`: how many recent memory deployments were later negative
- `skill_route.replay_failure_streak`: how many skill candidates failed replay in a row

Both are deterministic. They read local ticket/replay evidence and do not call
an LLM, provider, VPS, or production runtime.

## Safe Mode

When an indicator crosses its safe-mode threshold, the monitor emits:

- `safe_mode.state: "safe_mode"`
- `allowed_routes: ["damping", "ignore"]`
- `frozen_routes: ["memory", "skill", "case", "policy"]`
- `release_policy: "human_owner_manual_release_only"`

The monitor itself does not mutate the live route table. It outputs the route
gate state and, when explicitly requested by CLI, writes incident records under
`runs/stability-incidents/`, which is ignored by git.

## Boundary

The safety lock is fixed:

- `production_authority: false`
- `publication_allowed: false`
- `live_route_table_mutated: false`
- `writes_persistent_memory: false`
- `llm_api_calls: 0`
- `external_api_calls: 0`

Safe mode can stop local learning from accelerating on a bad path. It cannot
deploy, rollback production, rewrite memory, or release itself. Manual release
is required after review.
