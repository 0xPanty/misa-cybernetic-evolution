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
