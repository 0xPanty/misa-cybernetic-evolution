# Quickstart

This repo runs locally by default. No Zilliz account, provider key, VPS, timer,
or public-channel credential is required for the local path.

## Requirements

- Node.js 20 or newer
- npm

## Install

One command after clone:

```bash
git clone https://github.com/0xPanty/misa-cybernetic-evolution.git
cd misa-cybernetic-evolution
node scripts/setup-local.mjs
```

That command runs `npm ci`, then runs the local sidecar quickstart. It creates
only ignored local artifacts and prints the report path.

If dependencies are already installed:

```bash
npm run deploy:local
```

The local deploy runs:

```text
doctor -> bootstrap:local -> hermes:value-proof
```

It proves the current clone is ready, initializes the ignored local vector store,
and checks the committed work-order/Hermes samples for positive local value.

## Full Shadow Deploy

To attach the full observe-only sidecar chain:

```bash
node scripts/setup-full-shadow.mjs
```

If dependencies are already installed:

```bash
npm run deploy:full-shadow
```

That command runs:

```text
local quickstart
-> deterministic window distillation
-> Hermes observe-only plugin install
-> Hermes event-log adapter replay
-> Hermes work-order chain
-> session-distiller cybernetic review
-> work-order inbox export
-> Hermes value proof
```

The first run may show `hermes_events: 0`. That is normal before Hermes has
loaded the plugin and emitted hook events. The event log is already attached, so
later Hermes events can be replayed through the same command.

On a Linux/VPS host that already has `misa-session-distiller.service`, install
the VPS-style `ExecStartPost` hook:

```bash
npm run deploy:vps-shadow
```

Dry-run first:

```bash
bash scripts/deploy/install-vps-full-shadow.sh --dry-run
```

Manual install path:

```bash
git clone https://github.com/0xPanty/misa-cybernetic-evolution.git
cd misa-cybernetic-evolution
npm ci
```

## Check The Clone

```bash
npm run doctor
```

`doctor` verifies schemas, current-line smoke, local vector-store dry-run, and
precheck. It is read-only and does not initialize a persistent store.

## Bootstrap The Local Store

```bash
npm run bootstrap:local
```

This creates the ignored local runtime store:

```text
runs/local-vector-store/
```

It also writes a bootstrap report:

```text
runs/bootstrap-local/latest.json
```

## Useful Commands

```bash
npm run vector-store:local -- --mode stats
npm run vector-store:local -- --mode query --query "public posting policy" --route policy
npm run work-order:variants -- --json --dry-run
npm run work-order:evaluate -- --json --dry-run
npm run hermes:plugin:doctor
npm run skill:evolution
npm run curiosity:signals
npm run health:qianxuesen
npm run precheck
npm test
```

For the heavier curiosity sample check, run:

```bash
npm run curiosity:signals -- --source-dir test/fixtures/perception/curiosity-realistic-sources
```

## Optional Hermes Plugin

To install the observe-only Hermes plugin sample locally:

```bash
npm run hermes:plugin:install
npm run hermes:plugin:doctor
```

It writes local NDJSON events only:

```text
~/.hermes/qianxuesen-runtime-events.ndjson
```

Replay those captured events through the adapter:

```bash
npm run hermes:adapt-runtime -- --event-log ~/.hermes/qianxuesen-runtime-events.ndjson --json
```

## What This Does Not Do

The local quickstart does not:

- write Zilliz;
- call embedding providers;
- call LLM providers;
- read provider credentials;
- touch VPS;
- start background services;
- deploy production services;
- write Hermes memory;
- mutate Hermes skills;
- publish to Discord, Farcaster, or any public channel;
- promote memory or change Qianxuesen routes automatically.

External vector stores are optional. If a user plugs in Zilliz, Qdrant, LanceDB,
Chroma, pgvector, or a custom backend, the adapter must still accept
`misa.local_session_distillation.v1` and preserve source lineage.
