# Local Vector Store v0.21

`vector-store:local` is the default vector backend for the public repository.
It exists so a user can run the Qianxuesen loop without first provisioning
Zilliz or another external vector database.

## Plain Contract

The storage engine is swappable, but the data contract is not. Every adapter
must accept the public distillation output:

```text
misa.local_session_distillation.v1
```

That keeps the rest of the loop stable:

```text
distill:misa
-> vector-store adapter upsert
-> vector-store query
-> vector-memory ranker
-> perception / Qianxuesen route review
-> repair ticket / work order / health report
```

## Default Backend

The built-in backend is:

```text
local-jsonl-token-vector-v1
```

It writes under the ignored runtime path:

```text
runs/local-vector-store/
  manifest.json
  records.jsonl
  history/<batch-id>/
    records.jsonl
    upsert-manifest.json
    rollback.json
```

This is a persistent local vector store, not a cloud service. It uses a
deterministic local token vector and does not call embedding providers.

## Commands

Print the adapter contract:

```bash
npm run vector-store:local -- --mode contract
```

Upsert the default public distillation fixtures:

```bash
npm run vector-store:local -- --mode upsert
```

Dry-run the same upsert without writing the store:

```bash
npm run vector-store:local -- --mode upsert --dry-run
```

Query the local store:

```bash
npm run vector-store:local -- --mode query --query "public posting policy" --route policy
```

Show stats:

```bash
npm run vector-store:local -- --mode stats
```

Roll back one batch:

```bash
npm run vector-store:local -- --mode rollback --batch-id <batch-id>
```

## Swappable Adapter Interface

External backends can replace the default local store. Supported target shapes
include:

- Zilliz
- Qdrant
- LanceDB
- Chroma
- pgvector
- custom adapter

Every adapter must implement the same surfaces:

- `upsert_distillation`
- `query`
- `delete_batch`
- `stats`

Every adapter must keep these fields:

- `record_id`
- `collection`
- `kind`
- `route`
- `text`
- `vector`
- `metadata.source_id`
- `metadata.distillate_id`
- `metadata.learning_event_id`
- `metadata.original_source_id`
- `metadata.original_chunk_hash`
- `metadata.retrieval_trace`

## Safety Boundary

The local vector store is allowed to write only its own ignored runtime files.
It does not:

- write Zilliz;
- create provider embeddings;
- read provider credentials;
- promote memory;
- change a Qianxuesen route;
- change tournament winners;
- publish anything;
- update VPS or services.

Records are retrieval inventory. They become useful because the downstream
ranker, perception layer, and Qianxuesen review can query and replay them. They
do not authorize behavior by themselves.
