# OmniAgent Footprint Bridge v0.16

This bridge borrows OmniAgent's strongest useful idea for this repo: execution
footprints are good sensor input.

It does not borrow OmniAgent's automatic write path.

## Borrowed Shape

OmniAgent's EventBus, Sentinel, Guardian, and Reflexion pieces give useful
runtime evidence:

- lifecycle events: task start, tool execution, approval, task end;
- complexity signals: long or multi-step work that deserves attention;
- risk signals: high-impact tools or automatic writes;
- failure signals: tool errors, failed attempts, repeated recovery patterns.

The bridge converts that footprint into a local Qianxuesen learning event. From
there, the existing Qianxuesen route table decides whether the event is memory,
skill, case, policy, damping, or ignore.

Complexity is reported as an observed field only in this bridge. It does not
decide the learning route by itself. If a future runtime uses it to trigger
planning, that must stay outside memory, Skill publication, and live-channel
effects unless a separate human boundary allows it.

## Boundary

The bridge treats OmniAgent output as evidence, not authority.

It must not:

- write `AGENTS.md`;
- write persistent memory;
- install or publish Skills;
- decide learning routes with an LLM;
- touch VPS, services, providers, timers, or public channels.

Automatic OmniAgent self-evolution events are still useful, but only as risk
evidence. If a footprint includes automatic `AGENTS.md`, memory, or Skill writes,
the bridge sends that pressure into Qianxuesen policy evidence instead of
importing the write.

## Why This Is Positive

This is not a second evolution engine. It is a sensor adapter.

Before this bridge, the repo could reason about local distilled windows and
Hermes/Zilliz mapping artifacts. This adds one more input type: external agent
execution footprints. The existing route rules, damping rules, minimal-positive
skill gate, repair tickets, and work-order handoff still own the result.

Plain version:

```text
OmniAgent footprint
-> Qianxuesen learning event
-> existing deterministic route table
-> local candidate / policy / damping / case
```

Not:

```text
OmniAgent footprint
-> OmniAgent writes memory, AGENTS.md, or Skill
-> Misa silently changes behavior
```

## Commands

```bash
npm run omniagent:footprint
npm --silent run omniagent:footprint -- --json
npm --silent run omniagent:footprint -- --input examples/omniagent-footprint-bridge/auto-write-risk.input.json --json
npm --silent run omniagent:footprint -- --input examples/omniagent-footprint-bridge/patch-agents-md-risk.input.json --json
```

The default command reads
`examples/omniagent-footprint-bridge/repeated-success.input.json`.

## Expected Results

- a repeated successful footprint can become a `skill` route candidate;
- a one-off successful footprint is held by damping instead of promoted;
- automatic `AGENTS.md`, memory, or Skill writes become policy evidence;
- live effects remain false;
- `llm_route_decision_allowed=false`;
- `automatic_promotion_allowed=false`.
