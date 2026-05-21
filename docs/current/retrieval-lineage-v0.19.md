# Retrieval Lineage v0.19

This note is the public design for stronger hit quality and path replay around
`vector-memory:classify` and `zilliz:adapt`.

It is still dry-run only. It does not query Zilliz, create embeddings, or read
private source text.

## Goal

Future Misa retrieval should answer three questions for every hit:

1. What kind of memory is this?
2. Where did it come from?
3. Why is this hit allowed to influence, or not influence, behavior?

The current v0.19 metadata covers the first safe version of that path:

```text
original source ref
-> local bridge / work-order artifact
-> vector classifier record
-> Zilliz dry-run upsert payload
-> future retrieval hit explanation
```

## Current Public Fields

| Field | Why it exists |
| --- | --- |
| `original_source_kind` | Fast filter for source family, such as `local_distillation_sources` or `langgraph_qianxuesen_bridge`. |
| `original_source_id` | Fast filter for the earliest known upstream opaque source id. |
| `original_chunk_hash` | Future exact replay key when a Hermes/Zilliz chunk hash exists. |
| `original_source` | JSON evidence bundle with session/message/path/hash/channel fields. Unknown values stay explicit. |
| `retrieval_trace` | Replay keys and source hops for explaining how the record was made. |
| `retrieval_hints` | Filter keys, boost terms, score inputs, and false-positive guards. |

## Stronger Hit Logic

A future retriever should rank hits in layers, not by vector score alone:

1. **Vector similarity**: find likely semantic matches.
2. **Metadata filter match**: prefer matching `kind`, `authority`,
   `source_type`, and `original_source_kind`.
3. **Authority weight**: policy and promoted records may influence behavior;
   audit and candidate records can explain context but cannot change behavior.
4. **Trace continuity**: prefer hits whose `retrieval_trace.source_hops` connect
   the original source, decision trace, and vector record cleanly.
5. **Recency and source quality**: when timestamps or chunk hashes exist, prefer
   current, exact, replayable refs over vague refs.
6. **Surface guard**: demote hits whose `blocked_surfaces` conflict with the
   requested action.

Plain version: first find similar records, then ask "is this the right shelf,
from a traceable source, with authority to affect this answer?"

## Path Replay

When a hit is selected, Misa should be able to show a compact explanation:

```json
{
  "record_id": "vm-policy-boundary-...",
  "kind": "policy_boundary",
  "authority": "policy",
  "original_source_id": "misa-distilled-local-window-zilliz-boundary-005",
  "decision_trace_id": "bridge-...",
  "can_influence_behavior": true,
  "requires_owner_approval": true
}
```

If a field is `unknown`, the retriever should say so and avoid pretending it has
raw proof. Unknown provenance should not block search, but it should lower
confidence for durable behavior changes.

## Implemented v0.20 Layer

The next useful layer is now implemented as a public local dry-run scorer:
`npm run vector-memory:rank -- --eval-fixtures`.

- input: query plus requested surface, such as answer context, policy check, or
  repair planning;
- output: ranked hits with `score_parts` and `replay_summary`;
- hard rule: candidate and audit records may be cited as context, but cannot
  alter behavior.

The important change is phase order. The scorer searches the requested kind
first, then fetches same-source sibling records for explanation. Same-source
context is useful, but it cannot outrank a valid primary-kind hit.

Only after that scorer is useful should a live Zilliz writer be considered.
