# Vector Memory Storage v0.19

`vector-memory:classify` turns work-order and decision artifacts into a storage
classification plan for a Zilliz-style vector store.

It does not write Zilliz. It only says where each record belongs and what
authority it has.

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
  "created_by": "qianxuesen_vector_memory_classifier",
  "promotion_state": "not_promoted",
  "can_influence_behavior": false,
  "requires_owner_approval": false,
  "allowed_surfaces": ["retrieval_context"],
  "blocked_surfaces": ["persistent_memory", "public_posting"],
  "decision_trace_id": "bridge-..."
}
```

The behavior rule is strict:

- `audit_only` and `candidate` records cannot influence behavior;
- `promoted` and `policy` records may influence behavior;
- persona and policy promotion stays behind owner approval;
- blocked surfaces travel with the record even when bounded local work is
  allowed.

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
