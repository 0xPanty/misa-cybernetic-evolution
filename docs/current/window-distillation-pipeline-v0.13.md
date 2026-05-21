# Window Distillation Pipeline v0.13

v0.13 expands local distillation from a simple intake entrypoint into a full
window-distillation pipeline:

```text
raw local source
-> redaction
-> segmentation
-> local token vector index
-> signal extraction
-> atomic lesson splitting
-> compact distillate
-> learning event
-> candidate queue
```

It still does not use Zilliz. It can build a local token vector index so source
lookup is possible without a remote vector database or embedding API.

## Source Templates

Runnable source templates live in:

```text
examples/misa-distillation/
```

The supported source kinds are:

- `chat_window`
- `failure_log`
- `farcaster_audit`

Each source provides local turns or log entries. Summary, signals, risk, and
setpoint can be supplied as hints, but they are not required. The distiller can
derive them from the local source text.

## Local Vector Index

The local index is deterministic:

- backend: `local-token-vector-v1`
- persistence: `in_memory_report`
- embedding provider calls: `0`
- external API calls: `0`
- Zilliz usage: `false`

This index is only for local source lookup inside the distillation report. It
does not write persistent memory and does not replace a production memory store.

## Atomic Lesson Splitter

Compound windows are split after segmentation and signal extraction. The
splitter is deterministic and local-only:

- policy lessons keep `explicit_user_boundary`, `public_posting_boundary`, and
  `farcaster_public_memory_risk`;
- damping lessons keep one-off or overreaction signals;
- skill lessons keep clean `reusable_workflow` signals only when the same
  segment is not carrying public-memory or damping pressure;
- case lessons keep repeated failure patterns;
- memory lessons keep stable preference or project-fact signals.

This lets one historical window produce several learning events. A reusable
workflow can become a local draft skill candidate while a public-memory risk in
the same source still routes to policy.

## Safety

The pipeline cannot:

- call model providers;
- call external APIs;
- use Zilliz as the default intake proxy;
- write persistent memory;
- publish Farcaster posts;
- publish or install Skills;
- start timers or services;
- update VPS.

## Command

```bash
npm run distill:misa
npm run distill:misa -- --json
npm run distill:misa -- --source-dir runs/history-flowtest-sources
```

Expected result:

- all three source kinds are covered;
- every source creates one distillate and at least one learning event;
- compound sources can create multiple atomic learning events;
- every distillate has redacted segments;
- every distillate has a local token vector index;
- LLM API calls are `0`;
- external API calls are `0`;
- Zilliz proxy usage is `false`.
