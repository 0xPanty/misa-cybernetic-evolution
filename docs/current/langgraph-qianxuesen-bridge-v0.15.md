# LangGraph Qianxuesen Bridge v0.15

This is the first local contract for borrowing LangGraph without handing over
Misa's learning direction.

Plain version: LangGraph can be the rails. Qianxuesen stays the driver.

## What We Borrow

LangGraph is useful for three engineering jobs:

- `State`: one shared packet that carries evidence, route decisions, repair
  tickets, work orders, and human decisions.
- checkpointer: durable pause/resume history for a learning cycle.
- interrupt: the exact place where a repair ticket or high-risk work order must
  stop and wait for a human decision.

These are good bones. They make the loop easier to run, pause, inspect, and
resume.

## What We Do Not Borrow

LangGraph nodes must not decide what Misa learns.

The forbidden downgrade is:

```text
evidence -> LLM agent decides route -> memory/skill/policy update
```

That turns the control-theory layer into a normal agent workflow. It loses the
main point of the repo: deterministic routing, damping, traceability, and human
boundaries.

The allowed shape is:

```text
evidence -> LangGraph State
-> Qianxuesen deterministic distill/route hook
-> repair ticket or work order
-> LangGraph interrupt when a human boundary is needed
-> resume only with recorded human decision
```

## Determinism Boundary

The word deterministic is intentionally scoped.

Inside this repo, Qianxuesen's `distill` and `route` stages are deterministic
after input ingest:

- distill uses rule extraction, symbolic signals, segmentation, and the local
  `local-token-vector-v1` index;
- route uses signal rules and the fixed route table for `memory`, `skill`,
  `case`, `policy`, `damping`, and `ignore`;
- both stages report `uses_llm=false`, `llm_api_calls=0`, and
  `external_api_calls=0`;
- LangGraph and LLM agents may carry state, explain results, draft text, or run
  bounded approved work, but they must not choose learning routes.

This does not claim every upstream artifact was born deterministically. Existing
Hermes/Zilliz distillation bundles may contain LLM-produced summaries. The
bridge treats those bundles as evidence inputs, not as authority. The local
Qianxuesen decision remains rule-bound after that input arrives.

The generated bridge artifact carries this as `determinism_contract` so future
runtime code can validate the boundary instead of relying on prose.

## AGT-Inspired Governance Contract

Microsoft's Agent Governance Toolkit has a useful production lesson: do not put
the final allow/deny decision inside an LLM loop. Put a deterministic policy
gate before the action, make it fail closed, and leave an audit trail.

This bridge now borrows that shape without adding a runtime dependency:

- `action_policy_contract` records the local rule matrix, `default_action=deny`,
  `conflict_resolution=deny_overrides`, and `llm_in_decision_loop=false`;
- durable/public effects and `human_owner` work orders resolve to
  `require_interrupt`;
- bounded local work can resolve to `allow_bounded_local_work`;
- a read-only bridge with no work orders resolves to `allow_readonly_projection`;
- the policy trace is data, not prose, so tests can catch downgrade attempts.

This is narrower than AGT. It governs the Qianxuesen bridge decision, not every
tool call in a live runtime.

## Decision BOM

The bridge also emits `decision_bom`, a small local bill of materials for the
bridge decision. It is reconstructed from fields we already collect:
`state_projection`, `governance_hooks`, `action_policy_contract`,
`interrupt_queue`, and `decision_boundary`.

The required fields are:

- `control_owner`
- `policy_rules_evaluated`
- `action_type`
- `decision_outcome`
- `evidence_source_refs`
- `human_boundary_status`

The current local bridge requires `completeness_score=1` and an integrity hash.
That gives us a cheap sanity check: if a future change still says "passed" but
cannot explain who owned the decision, what policy ran, what action was judged,
and whether a human boundary exists, the bridge verifier should fail.

## Ownership Split

| Layer | Owns |
| --- | --- |
| LangGraph | state container, graph edges, checkpointer, interrupt, resume trace |
| LangChain | model/tool adapters and optional executor interfaces |
| Qianxuesen | distillation, route decision, damping, repair tickets, work-order routing, durable/public boundaries |
| LLM agent | summarize, draft, explain, or execute bounded approved tasks |

## Human Boundary

Repair tickets naturally map to LangGraph interrupts.

For this repo, an interrupt is required when:

- a work order requires user confirmation;
- a suggested executor is `human_owner`;
- an action could affect memory, public output, provider routes, services, VPS,
  credentials, or Skill publication;
- the route decision is uncertain and needs owner choice.

The resume record must include:

- the decision;
- the approver;
- source refs;
- an approval record.

## Custom Governance Nodes

LangGraph custom nodes may call local Qianxuesen functions, but the ownership is
fixed:

- `qianxuesen_distill_node`
- `qianxuesen_route_node`
- `qianxuesen_repair_ticket_node`
- `qianxuesen_work_order_node`

Each node is deterministic from the graph's point of view. An LLM can explain
the result, but cannot override it.

Each governance stage also carries `from_node` and `to_node`. That keeps the
contract close to a future `StateGraph` edge instead of leaving it as prose.

Interrupts separate two ideas that should not be mixed:

- whether a durable or public effect is involved;
- whether execution is allowed without a human.

For this bridge, execution without a human is always false. Blocked surfaces are
listed as boundary evidence, not as permission to touch those surfaces.

The bridge accepts both the canonical `work-order:route` artifact and the
compact `work_order` shape emitted by the Hermes mapping fixtures. This keeps a
high-risk Hermes owner-review order from losing its `human_owner` interrupt when
it is projected into the LangGraph contract.

## First Local Artifact

The first version is intentionally dependency-free. It does not install
LangGraph or run a Python graph. It emits and validates the contract that a
future LangGraph runtime must obey:

```bash
npm run langgraph:bridge -- --json
```

The artifact is checked by:

```bash
npm run validate:schemas
npm run precheck
npm test
```

## Verdict

This is a natural fit if the hierarchy stays clear.

LangGraph gives durable workflow mechanics. Qianxuesen gives control logic. The
fusion is strongly positive when LangGraph serves the loop. It becomes a
downgrade when a graph agent owns learning-route decisions.
