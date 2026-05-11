# Window Distillation Pipeline v0.13

v0.13 expands local distillation from a simple intake entrypoint into a full
window-distillation pipeline:

```text
raw local source
-> redaction
-> segmentation
-> local token vector index
-> signal extraction
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
```

Expected result:

- all three source kinds are covered;
- every source creates one distillate and one learning event;
- every distillate has redacted segments;
- every distillate has a local token vector index;
- LLM API calls are `0`;
- external API calls are `0`;
- Zilliz proxy usage is `false`.
