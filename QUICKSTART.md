# Quickstart

This repo runs locally by default. No Zilliz account, provider key, VPS, timer,
or public-channel credential is required for the local path.

## Requirements

- Node.js 20 or newer
- npm

## Install

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
npm run health:qianxuesen
npm run precheck
npm test
```

## What This Does Not Do

The local quickstart does not:

- write Zilliz;
- call embedding providers;
- read provider credentials;
- touch VPS;
- start background services;
- publish to Discord, Farcaster, or any public channel;
- promote memory or change Qianxuesen routes automatically.

External vector stores are optional. If a user plugs in Zilliz, Qdrant, LanceDB,
Chroma, pgvector, or a custom backend, the adapter must still accept
`misa.local_session_distillation.v1` and preserve source lineage.
