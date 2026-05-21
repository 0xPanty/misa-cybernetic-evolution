# Metric Registry

The metric registry is the measured side of the control loop.

Plain version: a setpoint is not allowed to be just a sentence like "make the
agent better." A setpoint must name a registered metric, a target value, a
tolerance, and a direction.

Machine-readable files:

- [schemas/metric_registry.schema.json](../../schemas/metric_registry.schema.json)
- [examples/metric_registry.example.json](../../examples/metric_registry.example.json)

## Contract

Each metric must declare:

- `metric_id`: stable name used by control contracts;
- `plant_state_component`: the plant state variable being measured;
- `measurement_kind`: plant state, sensor quality, guardrail, or dry-run health;
- `unit`: ratio, count, milliseconds, or another explicit unit;
- `direction`: minimize, maximize, or hold within a band;
- `sampling_method`: where the number comes from;
- `sampling_window`: the time or fixture window used;
- `owner`: the local plane responsible for producing or reviewing it.

If a metric does not map to a plant state component, it is not allowed as a
control setpoint. That prevents floating numbers that look useful but do not
belong to the controlled system.

## Current Core Metrics

| Metric | Direction | Measures |
| --- | --- | --- |
| `skill.replay_pass_rate` | maximize | whether skill candidates beat or match baseline replay |
| `memory.pollution_rate` | minimize | unsupported memory promotion or weak-evidence memory candidates |
| `public_channel.safety_incident_count` | minimize | public-memory or public-channel safety incidents |
| `provider.timeout_rate` | minimize | provider timeout pressure |
| `learning.route_coverage_count` | maximize | local coverage of memory, skill, case, policy, damping, and ignore |
| `signal_extractor.recall` | maximize | signal extractor recall against hand-labeled fixtures |
| `signal_extractor.precision` | maximize | signal extractor precision against hand-labeled fixtures |
| `runtime.live_effect_count` | minimize | live effects allowed by dry-run or shadow checks |
| `controller.precheck_failure_count` | minimize | failing local precheck items |

## Measurable Setpoints

A control contract now uses this shape:

```json
{
  "metric_id": "skill.replay_pass_rate",
  "target_value": 0.85,
  "tolerance": 0.02,
  "direction": "maximize"
}
```

`setpoint_narrative` is still kept for humans, but the controller uses the
measurable object.

## Signal Extractor Note

`signal_extractor.recall` and `signal_extractor.precision` are sensor-quality
metrics. They measure the deterministic extractor against hand-labeled fixture
signals.

`evidence_count` from the extractor is an inferred count when raw input does not
already provide one. It is useful for routing real session-like data, but it is
not the same thing as a human-observed evidence count. Reports should label it
as inferred when it comes from the extractor.

## Adding A Metric

Add a metric only when all three are true:

1. It maps to a plant state variable in `examples/plant_model.example.json`.
2. It has a deterministic sampling method.
3. A local test or precheck can prove the metric is registered and usable.

Do not add metrics just because a report wants another number. If the metric
cannot move a control decision, it should stay out of the registry.
