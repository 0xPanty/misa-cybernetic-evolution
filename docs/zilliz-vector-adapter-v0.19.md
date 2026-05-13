# Zilliz Vector Adapter v0.19

`zilliz:adapt` turns the vector memory classification plan into a Zilliz-ready
dry-run payload.

It still does not write Zilliz. It prepares the shape a live writer would need:
collections, vector fields, text payloads, metadata, and grouped upsert batches.
The public payload now includes source-lineage fields, so future live records can
be filtered and explained by original source, not only vector similarity.

## Why It Exists

`vector-memory:classify` answers: "What kind of memory is this?"

`zilliz:adapt` answers: "If we later write it to Zilliz, what exactly would we
write, and is the metadata safe?"

That keeps the public repo useful without hiding side effects behind one
command.

## Output

The adapter emits:

- `collection_plans`: collection names, primary key, vector field, text field,
  metadata field, scalar metadata fields, and record counts;
- `upsert_batches`: records grouped by collection with `text`, `metadata`, and
  `embedding_status: "not_created"`;
- `metadata_checks`: required metadata, authority boundary, source lineage,
  collection, and text payload checks;
- `safety`: dry-run proof that no embeddings were created and no Zilliz write
  happened.

The Zilliz-ready metadata includes both scalar filters and JSON replay details:

- scalar filters: `original_source_kind`, `original_source_id`,
  `original_chunk_hash`;
- JSON refs: `original_source`, `retrieval_trace`, `retrieval_hints`;
- replay rule: every upsert record must include the vector `record_id` in
  `retrieval_trace.replay_keys`.

That gives a future retriever a stronger path:

```text
query -> vector candidates -> metadata filters -> authority gate
      -> trace_path_continuity score -> source replay / explanation
```

Default vector settings:

```json
{
  "vector_dimension": 768,
  "metric_type": "COSINE",
  "embedding_model": "gemini-embedding-001"
}
```

The adapter can be run with different values:

```bash
npm run zilliz:adapt -- --json --vector-dim 768 --metric-type COSINE --embedding-model gemini-embedding-001
```

## Command

Generate a payload from the current local chain:

```bash
npm run zilliz:adapt -- --json
```

Use an existing vector classification file:

```bash
npm run zilliz:adapt -- --vector-memory-file runs/vector-memory/classification.json --json
```

Write clean JSON for another tool:

```bash
npm run zilliz:adapt -- --json --out-file runs/vector-memory/zilliz-adapter.json
```

## Boundary

The adapter refuses `--write`, `--allow-write`, and `--live`.

It does not:

- create embeddings;
- read provider credentials;
- write Zilliz;
- write persistent memory;
- touch VPS or runtime services;
- promote candidate or audit records into behavior.

Before any future live writer is allowed, run a reversible synthetic
write/delete probe against the target collection.
