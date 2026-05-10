# GenericAgent Context Density v0.7

v0.7 borrows one more useful idea from `lsdefine/GenericAgent`: not stronger
runtime authority, but higher information density.

GenericAgent keeps active context small by folding earlier turns into compact
summaries, using layered memory pointers, and writing experience only after
successful action evidence. Misa adapts that into a local review gate:

```bash
npm run density:misa
npm run density:misa -- --json
```

## What Misa Borrows

- compact, high-signal summaries over raw logs;
- layered pointer memory: index first, evidence below;
- action-verified memory discipline;
- skill metadata that includes quality and safety;
- explicit rejection of high-authority runtime features.

## What Misa Does Not Borrow

- broad local computer control;
- autonomous scheduler or cron creation;
- automatic memory writes;
- automatic production Skill publication;
- browser, keyboard, mouse, or ADB control.

## Review Gate

`density:misa` checks that staged skill candidates have:

- enough signal and evidence;
- concrete replayable procedure steps;
- verification commands that include density review, replay, precheck, and
  tests;
- publication disabled;
- self-repair output limited to `generated/` and `runs/self-repair/`;
- every GenericAgent high-authority feature explicitly rejected.

This makes GenericAgent a reference source, not a runtime dependency. The output
is a deterministic JSON report that can be validated by schema and included in
`precheck`.

## Positive Optimization Rule

An imported idea is positive only when it reduces noise, improves replay, or
raises safety without giving the sidecar more production authority.
