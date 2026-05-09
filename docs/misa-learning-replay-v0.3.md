# Misa Learning Replay v0.3

v0.3 adds a small L1 read-only replay layer on top of the v0.2 simulator.

The goal is narrow: prove that redacted real-ish Misa examples route the same
way every time. It does not call providers, write memory, publish skills, start
timers, change session mechanics, or post publicly.

## What Changed

- `schemas/misa_learning_fixture.schema.json` defines the local fixture shape.
- Each fixture declares its expected route, status, and publication mode.
- `examples/misa-learning/` now contains 10 fixtures total:
  - 5 synthetic baseline fixtures from v0.2;
  - 5 redacted real-ish replay fixtures.
- `npm run validate:schemas` validates every `*.fixture.json` file.
- `npm run simulate:misa` checks declared route expectations and keeps all live
  effects off.
- `npm test` includes route expectation tests.

## Replay Fixture Cap

Redacted real-ish fixtures stay capped at 10 or fewer. That keeps v0.3 useful
without turning the repo into a session archive.

## Current Boundary

This is replay only. Passing v0.3 means the route model is stable for the local
fixtures. It does not approve:

- session-distiller backlog processing;
- background timers;
- Discord or Farcaster session-mechanic changes;
- Zilliz or persistent-memory writes;
- automatic Skill publication;
- gbrain/cbrain adapter work.

v0.4 keeps the same boundary and adds artifact evidence/candidate review checks.
See [misa-learning-evidence-v0.4.md](./misa-learning-evidence-v0.4.md).
