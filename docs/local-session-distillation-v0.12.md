# Local Session Distillation v0.12

v0.12 adds the missing local intake step before signal routing:

```text
local window or log
-> compact distillate
-> learning event
-> signal adapter
-> candidate queue
-> daily rollup
-> candidate preflight
```

The important rule is simple: the distiller is local-first. It does not use
Zilliz as an intake proxy, does not require vector lookup, and does not call a
model provider.

## What It Reads

The default source directory is:

```text
examples/misa-distillation/
```

Each source is a redacted local record with:

- a short summary;
- source references such as turn ids or log ids;
- normalized signals;
- evidence count and risk level;
- artifact evidence;
- local-only flags.

The distiller keeps `raw_window_default` false. Full raw windows are not the
normal learning input. The compact distillate is the normal input, and source
refs are kept so a later reviewer can trace the reason.

## What It Emits

`npm run distill:misa` emits:

- one compact distillate per local source;
- one fixture-shaped learning event per distillate;
- zero LLM API calls;
- zero external API calls;
- `uses_zilliz_proxy: false`;
- `vector_lookup_required: false`.

Those learning events enter the same local learning simulator as the existing
fixtures. This means the Qianxuesen loop can test real local-window signals
without depending on a vector database or a remote proxy.

## What It Refuses

The local distiller cannot:

- write persistent memory;
- replace Zilliz;
- call model providers;
- query external APIs;
- publish Farcaster posts;
- publish or install Skills;
- start timers or services;
- update VPS.

## Command

```bash
npm run distill:misa
npm run distill:misa -- --json
```

Expected local shape:

- mode: `local-session-distillation`;
- at least one local source;
- learning event count equals source count;
- LLM API calls: `0`;
- external API calls: `0`;
- Zilliz proxy used: `false`;
- production authority: `false`.
