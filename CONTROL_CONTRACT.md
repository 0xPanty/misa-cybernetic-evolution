# Control Contract

A control contract is the minimum engineering frame for a risky learning or
runtime change.

It prevents vague goals from becoming uncontrolled system modifications.

## Template

```md
## Control Contract

- Primary Setpoint:
- Setpoint Narrative:
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

Machine-readable form:

- [schemas/control_contract.schema.json](./schemas/control_contract.schema.json)
- [examples/control_contract.example.json](./examples/control_contract.example.json)

Local validation:

```bash
npm run simulate:misa
npm run validate:schemas
npm run precheck
```

## Field Guide

### Primary Setpoint

The main variable the change should improve. This is now a measurable object,
not free text.

Required shape:

```json
{
  "metric_id": "skill.replay_pass_rate",
  "target_value": 0.85,
  "tolerance": 0.02,
  "direction": "maximize"
}
```

`metric_id` must exist in
[examples/metric_registry.example.json](./examples/metric_registry.example.json).
The metric must also map to a plant state component from
[examples/plant_model.example.json](./examples/plant_model.example.json).

`setpoint_narrative` is the human explanation of the same goal.

Good examples:

- `skill.replay_pass_rate` target `0.85`, direction `maximize`
- `memory.pollution_rate` target `0`, direction `minimize`
- `public_channel.safety_incident_count` target `0`, direction `minimize`

Weak examples:

- make the agent smarter
- improve memory
- optimize prompts

For local learning-loop work, a good narrative is narrower:

- route repeated recovery behavior into a draft skill, not generic memory
- hold a single transient failure as damping, not a provider-route change
- keep public posting boundaries as policy candidates requiring approval

### Acceptance

The evidence that proves the setpoint was reached:

- replay result
- test result
- audit report
- metric threshold
- manual review
- canary outcome

### Guardrail Metrics

Metrics that must not regress. These must also be registered metric ids.

- public-channel safety incidents
- `memory.pollution_rate`
- `public_channel.safety_incident_count`
- `provider.timeout_rate`
- `runtime.live_effect_count`
- `controller.precheck_failure_count`

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
