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
