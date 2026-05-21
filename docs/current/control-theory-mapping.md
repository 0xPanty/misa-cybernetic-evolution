# Control Theory Mapping

This document maps engineering cybernetics concepts to agent learning systems.

| Control concept | Agent-system equivalent |
| --- | --- |
| Plant | live runtime, tools, providers, memory, channels |
| Controller | learning plane and governance logic |
| Sensor | logs, traces, replay results, feedback, metrics |
| Actuator | skill publication, memory write, policy update, rollback |
| Reference input | user goal, acceptance criteria, project constraint |
| Output | actual task behavior and channel-visible result |
| Error | difference between goal and observed behavior |
| Disturbance | provider failure, tool drift, stale memory, noisy feedback |
| Delay | queues, review, cache, vector index, scheduled jobs |
| Stability | bounded behavior under repeated feedback |
| Optimal control | selecting the lowest-cost safe action |
| Fault tolerance | detection, isolation, rollback, recovery |
| Simulation | replay, shadow mode, canary |

## Cost Function

A practical learning controller can rank actions with a cost function:

```text
J = task_error
  + risk_penalty
  + memory_pollution_penalty
  + persona_drift_penalty
  + latency_cost
  + token_cost
  + rollback_cost
```

The preferred action is the one with the lowest cost that also satisfies
guardrails.

## Anti-Chatter

Prevent rapid switching between states:

- do not repeatedly enable and disable the same skill
- do not toggle policy from adjacent weak signals
- use hysteresis for thresholds
- apply cooldown after failed validation

## Anti-Windup

Prevent the controller from accumulating pressure when the actuator is saturated:

- do not keep generating candidates after verifier failure
- do not keep retrying a blocked provider
- do not queue unlimited memory writes during review backlog
- pause and escalate after repeated same-mode failure

## Controller Conflict

Multiple controllers changing the same knob can amplify instability. Assign one
primary writer per artifact namespace and make all other systems advisory.
