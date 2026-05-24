# Hermes Runtime Plugin Skeleton

This is a minimal observe-only plugin shape for Hermes.

It registers Hermes lifecycle hooks and writes redacted NDJSON events to:

```text
~/.hermes/qianxuesen-runtime-events.ndjson
```

or to `QIANXUESEN_HERMES_EVENT_LOG` when that environment variable is set.

It deliberately does not block tools, write memory, mutate skills, call models,
or call external APIs. The generated event stream should be replayed through the
local `hermes:adapt-runtime` contract before any candidate is considered.

`pre_api_request` and `post_api_request` emit `model_io_tap` records. These are
not raw prompt dumps. They keep only hashes and counts: message count, context
byte size, tool schema count, tool-result error count, token usage when Hermes
provides it, and stable hashes for system prompts and tool schemas.

## Local Install

```bash
npm run hermes:plugin:install
npm run hermes:plugin:doctor
```

By default, install copies this folder to:

```text
~/.hermes/plugins/qianxuesen-runtime-adapter/
```

For a custom Hermes plugin folder:

```bash
npm run hermes:plugin:install -- --plugin-dir /path/to/hermes/plugins/qianxuesen-runtime-adapter
npm run hermes:plugin:doctor -- --plugin-dir /path/to/hermes/plugins/qianxuesen-runtime-adapter
```

## Replay Captured Events

After Hermes emits hooks, replay the local event log:

```bash
npm run hermes:adapt-runtime -- --event-log ~/.hermes/qianxuesen-runtime-events.ndjson --json
```

The adapter turns research/search traces into `research_digests` and turns
skill, memory, curator, or failure pressure into replay-required
`evolution_candidates`. It still does not write memory, install skills, block
runtime tools, call LLMs, or touch external APIs.

`model_io_tap` records stay in `observability_stream` only. They do not create
work orders, trigger tournaments, enter replay reports, or allow the running
agent to read its own prompt digest.
