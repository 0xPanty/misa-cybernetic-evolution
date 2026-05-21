# Sidecar Status Broadcast

This document defines the public sidecar health-status broadcast. It is a
read-only JSON file that lets an external agent, wrapper, dashboard, or scheduled
job see the current sidecar stability state without giving the sidecar any
authority over that external system.

## Contract

The broadcast file must validate against:

- [schemas/sidecar-status.schema.json](../../schemas/sidecar-status.schema.json)
- [examples/sidecar_status.example.json](../../examples/sidecar_status.example.json)

The CLI writes it only when explicitly requested:

```bash
npm run stability:monitor -- --write-status <path>
```

Default behavior is unchanged: `npm run stability:monitor` prints the local
review and does not write a status file.

## Suggested Paths

The repository does not own a global status location. Pick a path that your
wrapper or scheduler can read.

- Windows user profile: `%USERPROFILE%\.misa-cybernetic-evolution\sidecar-status\stability.json`
- Linux/macOS: `~/.misa-cybernetic-evolution/sidecar-status/stability.json`
- Shared-agent workspace: any project-specific shared directory you already
  trust for read-only handoff files

## Consumer Behavior

An external consumer should read the status file at session start or on a timer,
then check:

- `schema_version === "cybernetic.sidecar_status.v1"`
- `updated_at` is newer than `stale_after_minutes`
- `stability.state`

If `stability.state === "safe_mode"` and the file is not stale, the consumer may
show a human-readable warning such as:

```text
The sidecar stability monitor is in safe mode. Memory, skill, case, and policy
promotion routes should stay frozen until a human reviews the listed incidents.
Allowed routes: damping, ignore.
```

That warning is presentation only. The consumer must not treat the file as
permission to mutate memory, publish content, change routes, call providers, or
release safe mode.

## Invariants

- The broadcast is status-only and recommendation-only.
- The sidecar does not call external agents, webhooks, chat systems, or provider
  APIs to deliver this status.
- The broadcast contains no mutation request, approval token, route override, or
  production authority.
- Stability judgment stays inside the deterministic stability monitor. External
  readers only render the structured fields for humans.
