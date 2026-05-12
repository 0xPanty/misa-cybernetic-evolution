# Repair Ticket v0.13

`repair-ticket:misa` turns memory-layer comparison signals into local repair
tickets that Codex can use later. It is a queue generator, not an automatic
fixer.

## Purpose

The command captures cases where broad automatic L3 promotion would create bad
skills from non-skill routes. It keeps the evidence, reproduction commands,
acceptance criteria, edit scope, and non-goals in one place.

```text
memory-layer review
-> bad-promotion clusters
-> repair-ticket JSON
-> repair-ticket Markdown
-> later Codex repair after human approval
```

## Commands

Dry-run JSON:

```bash
npm --silent run repair-ticket:misa -- --json --dry-run
```

Write machine-readable JSON to a file without depending on stdout:

```bash
npm run repair-ticket:misa -- --json --dry-run --out-file runs/repair-tickets/manual-check/repair-ticket.json
```

Write local ignored artifacts under `runs/repair-tickets/<timestamp>/`:

```bash
npm run repair-ticket:misa
```

Use a copied VPS sanitized-conversation source directory:

```bash
npm --silent run repair-ticket:misa -- --vps-raw-dir runs/vps-real-conversation-source --json --dry-run
```

Check a saved machine JSON handoff artifact for npm banners, logs, or other
text before JSON:

```bash
npm run repair-ticket:misa -- --json --dry-run --json-handoff-file runs/repair-tickets/manual-check/repair-ticket.json
```

Choose an output directory:

```bash
npm run repair-ticket:misa -- --out-dir runs/repair-tickets/manual-check
```

## Ticket Contents

Each ticket includes:

- severity and status;
- source kind and evidence counters;
- exact bad promotions with `source_event_id`;
- reproduction commands;
- acceptance criteria;
- Codex edit scope;
- explicit non-goals;
- must-fix, should-improve, and observe-only tasks.

`json_handoff_contract` tickets are generated when a machine JSON artifact is
not strict JSON. The common cause is plain `npm run ... -- --json > file`, which
can prepend npm lifecycle banner text. Use `--out-file`, `npm --silent run`, or
direct `node scripts/...` for command-to-command JSON.

## Severity

| Severity | Meaning |
|---|---|
| P0 | Minimal-positive mode or safety flags crossed a live-effect boundary |
| P1 | Broad Auto-L3 produced three or more bad promotions |
| P2 | Broad Auto-L3 produced one or two bad promotions |
| P3 | Observe-only evidence, no bad promotion on the sample |

P1/P2 tickets from `original_auto_l3` are repair candidates, not production
failures, because `minimal_positive_l3` still blocks export.

JSON handoff contract failures are P2 by default: they can break automation, but
they do not mutate production services or memory.

## Safety

The command does not:

- install Hermes skills;
- write persistent memory;
- update VPS;
- publish Farcaster posts;
- start timers or services;
- change provider routes;
- touch runtime state.

Default writes are only local files under ignored `runs/`.
