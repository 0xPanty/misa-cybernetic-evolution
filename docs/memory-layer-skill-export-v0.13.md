# Memory Layer and Skill Export v0.13

This module tests the useful GenericAgent idea without importing GenericAgent's
runtime authority.

It compares two paths over the same local distillation output:

```text
L0 redacted source refs
-> L1 compact distillates
-> L1a atomic lesson split
-> L2 route candidates
-> L3 local draft skills
-> L4 approved publication later, outside this repo
```

## Original Auto-L3 Simulation

`original_auto_l3` models the broad suggestion:

```text
every verified positive lesson -> L3 skill candidate
```

The report keeps this as a comparison mode only. If memory, case, policy, or
damping routes are promoted as skills, the report counts them as bad
promotions.

## Minimal Positive L3

`minimal_positive_l3` is the recommended path:

```text
verified lesson + skill route + staged candidate -> local L3 draft skill
```

Memory stays memory, cases stay cases, policies stay approval-only policy
candidates, and damping stays suppression or hold evidence.

## Mixed Route Pressure

Historical windows can contain more than one lesson: a reusable workflow, a
failure pattern, and a production boundary can appear in the same source. The
memory-layer report therefore includes `mixed_route_pressure` diagnostics under
L2. The session distiller now also splits compound windows into atomic lessons
before the router runs. This does not relax export rules. It lets clean
`reusable_workflow` lessons reach the minimal positive L3 path while policy,
case, memory, and damping lessons stay in their own lanes.

The safety rule is still strict: if `farcaster_public_memory_risk` appears, that
atomic lesson routes to `policy`. A skill export is allowed only when the skill
lesson itself does not carry public-memory risk.

## Commands

```bash
npm run memory-layer:misa
npm run memory-layer:misa -- --json
npm run export-skills:misa
npm run export-skills:misa -- --json
npm run repair-ticket:misa -- --json --dry-run
```

For a copied VPS sanitized-conversation source directory:

```bash
npm run memory-layer:misa -- --vps-raw-dir runs/vps-real-conversation-source --json
npm run export-skills:misa -- --vps-raw-dir runs/vps-real-conversation-source --out-dir runs/vps-real-skill-export --json
npm run repair-ticket:misa -- --vps-raw-dir runs/vps-real-conversation-source --json --dry-run
```

## Repair Tickets

`repair-ticket:misa` converts the comparison result into a Codex-ready repair
ticket. It records exact bad promotions, reproduction commands, acceptance
criteria, Codex edit scope, and non-goals. The default write path is local and
ignored under `runs/repair-tickets/`; `--dry-run` prints the review without
writing artifacts.

## Safety

The export command writes local files only. It does not:

- install Skills;
- write persistent memory;
- update VPS;
- publish Farcaster posts;
- start timers or services;
- change provider routes.
