# Control Contract

A control contract is the minimum engineering frame for a risky learning or
runtime change.

It prevents vague goals from becoming uncontrolled system modifications.

## Template

```md
## Control Contract

- Primary Setpoint:
- Acceptance:
- Guardrail Metrics:
- Sampling Plan:
- Known Delays / Delay Budget:
- Recovery Target:
- Rollback Trigger:
- Constraints:
- Boundary:
- Coupling Notes:
- Approximation Validity:
- Actuator Budget:
- Risks:
```

## Field Guide

### Primary Setpoint

The main variable the change should improve.

Good examples:

- reduce repeated tool-selection failures for mail triage
- increase replay pass rate for a skill from 60% to 85%
- reduce memory pollution from unsupported preference inference

Weak examples:

- make the agent smarter
- improve memory
- optimize prompts

### Acceptance

The evidence that proves the setpoint was reached:

- replay result
- test result
- audit report
- metric threshold
- manual review
- canary outcome

### Guardrail Metrics

Metrics that must not regress:

- public-channel safety incidents
- persona drift score
- memory pollution rate
- tool error rate
- latency
- cost
- rollback MTTR

### Sampling Plan

Where observations come from and how freshness is verified:

- event log
- replay suite
- validation store
- channel audit
- dashboard

Always record the observation window.

### Known Delays / Delay Budget

Examples:

- async queue delay
- vector index update delay
- review delay
- scheduled batch delay
- cache propagation delay

Delay matters because stale observations can cause overcorrection.

### Recovery Target

How fast the system must return to safety after failure.

Examples:

- revert published skill within 5 minutes
- disable candidate policy immediately
- restore previous registry version within one command

### Rollback Trigger

Signals that stop the rollout:

- replay win rate below threshold
- public-channel incident
- redaction failure
- repeated verifier failure
- unexpected state-plane write

### Boundary

What the change may touch.

Examples:

- draft skill only
- case library only
- observation schema only
- shadow verifier only

### Actuator Budget

Allowed control inputs:

- write draft
- run replay
- publish skill
- update memory
- start timer
- change provider route

High-risk actuators require explicit approval.

## Default Policy

If a change touches live channels, persistent memory, provider routes, timers,
deletion, or session mechanics, it requires:

- control contract
- version snapshot
- rollback trigger
- replay or shadow validation
- approval record
