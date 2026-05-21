# Vector Memory Storage v0.19

`vector-memory:classify` turns work-order and decision artifacts into a storage
classification plan for a Zilliz-style vector store.

It does not write Zilliz. It only says where each record belongs and what
authority it has. v0.19 also attaches opaque original-source refs and replay
keys, so a future retrieval hit can explain where it came from without exposing
raw private text.

## Core Rule

Storage is not promotion.

A vector can be searchable without being allowed to change behavior. The
metadata decides whether a retrieved item is only audit evidence, candidate
experience, promoted experience, persona memory, policy, or a work order.

## Collections

The public contract uses a small number of collections plus metadata:

| Collection | Kinds |
|---|---|
| `misa_audit_memory` | `audit_log` |
| `misa_decision_memory` | `decision_trace` |
| `misa_experience_memory` | `agent_experience_candidate`, `agent_experience_promoted` |
| `misa_persona_memory` | `persona_memory_candidate`, `persona_memory_promoted` |
| `misa_policy_memory` | `policy_boundary` |
| `misa_work_order_memory` | `repair_work_order` |

The matching local layout is:

```text
memory/
  audit-log/
  decision-trace/
  agent-experience/
    candidate/
    promoted/
  persona-memory/
    candidate/
    promoted/
  policy-boundary/
  repair-work-order/
```

## Metadata

Every record carries the same minimum metadata:

```json
{
  "kind": "agent_experience_candidate",
  "authority": "candidate",
  "status": "unverified",
  "risk_level": "low",
  "source_type": "work_order",
  "source_id": "wo-...",
  "original_source_kind": "local_distillation_sources",
  "original_source_id": "misa-distilled-failure-log-provider-timeout-006",
  "original_chunk_hash": "none",
  "created_by": "qianxuesen_vector_memory_classifier",
  "promotion_state": "not_promoted",
  "can_influence_behavior": false,
  "requires_owner_approval": false,
  "allowed_surfaces": ["retrieval_context"],
  "blocked_surfaces": ["persistent_memory", "public_posting"],
  "decision_trace_id": "bridge-...",
  "original_source": {
    "source_system": "qianxuesen_sidecar",
    "source_kind": "local_distillation_sources",
    "source_id": "misa-distilled-failure-log-provider-timeout-006",
    "session_id": "unknown",
    "message_id": "unknown",
    "artifact_path": "work_order_routing",
    "chunk_hash": "none",
    "channel": "local_artifact",
    "actor": "qianxuesen_router",
    "created_at": "unknown",
    "redaction_status": "opaque_ref_only",
    "source_refs": []
  },
  "retrieval_trace": {
    "trace_version": "misa.retrieval_trace.v1",
    "replayable": true,
    "replay_keys": ["vm-...", "wo-...", "bridge-..."],
    "source_hops": [
      {
        "stage": "original_source",
        "ref_type": "local_distillation_sources",
        "ref_id": "misa-distilled-failure-log-provider-timeout-006",
        "artifact_path": "work_order_routing"
      },
      {
        "stage": "vector_record",
        "ref_type": "agent_experience_candidate",
        "ref_id": "vm-...",
        "artifact_path": "zilliz_adapter_payload"
      }
    ]
  },
  "retrieval_hints": {
    "filter_keys": ["kind", "authority", "original_source_id"],
    "boost_terms": ["agent_experience_candidate", "local_distillation_sources"],
    "score_inputs": ["vector_similarity", "kind_intent_match", "trace_path_continuity", "same_source_context_match"],
    "false_positive_guards": ["query_kind_filter_runs_before_global_rerank", "same_source_context_cannot_override_requested_kind"]
  }
}
```

The behavior rule is strict:

- `audit_only` and `candidate` records cannot influence behavior;
- `promoted` and `policy` records may influence behavior;
- persona and policy promotion stays behind owner approval;
- blocked surfaces travel with the record even when bounded local work is
  allowed.

## Source Lineage

The source fields are intentionally reference-only:

| Field | Job |
| --- | --- |
| `source_type` / `source_id` | The local artifact that created this vector record, such as a work order. |
| `original_source` | The earliest known upstream source ref, such as a distilled event, session id, artifact path, or chunk hash. Unknown values stay explicit instead of being guessed. |
| `retrieval_trace` | Replay keys and source hops for explaining a hit after retrieval. |
| `retrieval_hints` | Filter keys, boost terms, score inputs, and guards used by the v0.20 kind-filter/same-source ranker. |

Plain version: Misa can later say, "this hit is a policy boundary from this
distilled event through this bridge decision," instead of just seeing a similar
sentence.

## Command

```bash
npm run vector-memory:classify -- --json
```

To write pure JSON for another tool:

```bash
npm run vector-memory:classify -- --json --out-file runs/vector-memory/classification.json
```

To turn that classification into a Zilliz-ready dry-run payload:

```bash
npm run zilliz:adapt -- --vector-memory-file runs/vector-memory/classification.json --json
```

## Boundary

The classifier does not:

- call embedding providers;
- write Zilliz;
- write persistent memory;
- post publicly;
- touch VPS or runtime services;
- read credentials.
