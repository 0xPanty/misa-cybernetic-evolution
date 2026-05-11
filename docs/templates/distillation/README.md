# Distillation Templates

These templates describe the three local inputs supported by `npm run
distill:misa`:

- `chat_window`
- `failure_log`
- `farcaster_audit`

The runnable examples live in `examples/misa-distillation/`. They are valid
input files, not placeholders.

Each template keeps the same rules:

- `local_only: true`
- `uses_zilliz_proxy: false`
- `vector_lookup_required: false`
- `raw_window_default: false`
- no model-provider call
- no external API call

The distiller can still build a local token vector index for source lookup. That
index is local and deterministic; it is not Zilliz and it does not call an
embedding provider.
