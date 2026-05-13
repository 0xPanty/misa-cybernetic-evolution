# Vector Retrieval Ranker v0.20

`vector-memory:rank` is the local dry-run scorer for vector-memory search
quality.

It does not call an embedding provider, read credentials, write Zilliz, or touch
runtime services. It models the read-side logic a future live retriever should
use after Zilliz returns candidate hits.

## Why It Exists

The v0.19 adapter made records traceable, but a real shadow test showed a
quality problem: a `repair_work_order` query could rank a same-source
`policy_boundary` first because pure vector similarity saw them as related.

v0.20 fixes the design at the retrieval layer:

```text
query intent
-> primary kind search
-> same-source context search
-> global fallback only if primary search fails
-> score parts and replay summary
```

Plain version: first search the right shelf, then bring in sibling records as
context. A policy record can explain a repair order, but it should not steal the
repair-order slot.

## Query Phases

1. **Primary kind search**
   - infer or receive `requested_kind`;
   - search only that kind and its collection first;
   - example: `kind == "repair_work_order"` and
     `collection == "misa_work_order_memory"`.

2. **Same-source context search**
   - after the primary hit exists, fetch siblings with matching
     `original_source_id`, `source_id`, or `decision_trace_id`;
   - use these as explanation and guardrail context;
   - do not let them outrank a valid primary hit.

3. **Global fallback search**
   - run only when no primary-kind hit clears the minimum score;
   - fallback hits are useful diagnostics, not the default answer.

## Ranking Inputs

The ranker exposes score parts instead of hiding the decision:

- `vector_similarity`
- `kind_intent_match`
- `query_phase_priority`
- `same_source_context_match`
- `authority_weight`
- `trace_path_continuity`
- `surface_guard`

This makes bad hits debuggable. If a result wins, the report can show whether it
won because of vector score, kind match, source continuity, or authority.

## Built-in Multi-round Eval

Run the local regression suite:

```bash
npm run vector-memory:rank -- --eval-fixtures
```

The fixtures intentionally do not reuse one sample. They cover repair, policy,
decision, audit, promoted experience, and persona cases across multiple source
ids. The expected quality bar is:

- `top1_exact_recall = 1`
- `top1_kind_precision = 1`
- `top3_expected_recall = 1`
- `noise_top1_wrong_kind_count = 0`

## Boundary

This is still public local logic only.

It does not:

- create embeddings;
- read provider keys;
- write Zilliz;
- write persistent memory;
- update VPS services;
- promote candidate or audit records into behavior.

The live writer/retriever should use this logic only after an explicit live
approval and a reversible Zilliz probe.
