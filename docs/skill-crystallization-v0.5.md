# Skill Crystallization v0.5

v0.5 adds a read-only skill crystallization index on top of the existing Misa
learning replay.

The useful GenericAgent idea is simple: repeated completed work can become a
small reusable procedure. This repository borrows only that indexing shape. It
does not borrow GenericAgent's broad runtime tool authority, shell execution,
automatic installs, scheduler, or autonomous memory writes.

## What It Does

`npm run crystallize:misa` reads the deterministic Misa replay traces and
extracts only staged `skill` routes. Each candidate contains:

- source event and cycle ids;
- one-line summary;
- trigger conditions;
- affected skill artifact;
- evidence basis and artifact evidence;
- procedure outline;
- verification commands;
- safety block with `publication_allowed=false` and all live effects disabled.

## What It Does Not Do

The command does not:

- publish a Skill;
- write persistent memory;
- replace Zilliz;
- post to Farcaster;
- change Discord, AgentMail, Farcaster, or session mechanics;
- start timers, services, schedulers, or daemons.

## Safety Rule

Every generated candidate must validate against
`schemas/skill_crystallization_candidate.schema.json`.

The schema requires `publication_allowed=false` and requires every live-effect
flag to be `false`. `npm run precheck` also validates generated candidates, so a
future accidental live-effect path fails the repository gate.

## Command

```bash
npm run crystallize:misa
npm run crystallize:misa -- --json
```

This is useful as a read-only reference for Misa/Hermes. It is not a production
publisher.
