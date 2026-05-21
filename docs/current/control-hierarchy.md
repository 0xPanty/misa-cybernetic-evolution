# Control Hierarchy

This project uses three control loops with different time scales. The split is
important because a fast guard answers "is this single action safe now?", while
a slow review answers "are our setpoints, route criteria, and metrics still the
right ones?" Those are different jobs.

The slow loop may recommend changing fast-loop criteria, but it cannot apply
those changes by itself. Any setpoint, route predicate, or metric-registry
change remains a human-reviewed contract change.

## Loop Summary

| Loop | Time scale | Primary question | Local authority |
| --- | --- | --- | --- |
| Inner | milliseconds to seconds | Is this one action or output inside the current boundary? | block/allow local dry-run action only |
| Middle | hours to days | Did a candidate beat alternatives and improve the measured setpoint after landing? | rank, gate, measure, and recommend damping/rollback |
| Outer | weeks to months | Are the setpoints, route predicates, and metric registry still fit for the plant? | recommend human review for control-contract changes |

## Inner Loop

The inner loop is the fastest guard. It should not learn broad lessons from a
single event; it checks whether the current event fits the already-declared
contract.

Representative surfaces:

| Command or surface | Role |
| --- | --- |
| control-contract actuator checks | enforce current actuator budgets |
| redaction and public-output gates | block unsafe output shape |
| `npm run simulate:misa` | replay one fixture set through current route rules |
| `npm run signals:extract` | deterministic signal extraction for a single event |

Inner-loop outputs can route an event to `memory`, `skill`, `case`, `policy`,
`damping`, or `ignore`, but they cannot redefine what those routes mean.

## Middle Loop

The middle loop compares candidates and measures whether a selected candidate
actually helped after it was deployed or merged into the local control plane.
This is where "looked good before" becomes "worked after".

Representative commands:

| Command | Role |
| --- | --- |
| `npm run evolution:evaluate:misa` | preflight candidates and build report queues |
| `npm run evolution:tournament:misa` | compare variants and select local draft winners |
| `npm run post-deploy:measure` | classify landed effect as positive, negative, null, or pending |
| `npm run stability:monitor` | detect route divergence and emit safe-mode gate output |
| `npm run work-order:evaluate` | compare baseline and winner work-order packets |

Middle-loop outputs can recommend rollback, damping, or safe-mode routing. They
do not execute rollback, mutate the live route table, change providers, write
persistent memory, or touch VPS.

## Outer Loop

The outer loop is the slow calibration layer. It reviews trends across a review
window, defaulting to seven days, and asks whether the control system is still
measuring the right thing.

Representative commands:

| Command | Role |
| --- | --- |
| `npm run outer-loop:review` | review metric trends, route outcomes, and metric-registry gaps |
| `npm run calibrate:current-line` | inspect calibration quality across current-line samples |
| `npm run health:qianxuesen` | summarize the local full-loop health state |
| `npm run precheck` | verify the local contract set before handoff |
| `npm run validate:schemas` | confirm machine-readable contracts still compile and validate |

The outer loop emits three useful recommendation families:

| Recommendation | Meaning |
| --- | --- |
| `setpoint_adjustment_candidate` | a metric stayed outside tolerance without enough progress toward the target |
| `route_recalibration_candidate` | a route shows enough rejection or post-deploy negative evidence to review its predicate |
| `metric_registry_expansion_candidate` | repeated evidence points to an unregistered plant-state component |

All three are recommendations only. The output schema hard-locks
`production_authority=false`, `route_predicate_mutated=false`,
`metric_registry_mutated=false`, `setpoint_mutated=false`, and
`llm_api_calls=0`.

## Why The Slow Loop Can Challenge The Fast Loop

A fast-loop check can pass while the measured outcome keeps getting worse. For
example, mail-triage tool calls may stay inside the actuator budget while
`mail_triage.tool_selection_failure_rate` does not improve. That does not mean
the fast loop should start inventing new rules in the moment. It means the
outer loop should raise a human-reviewed recalibration candidate.

In plain terms: the fast loop keeps each step inside the current guardrail; the
slow loop checks whether the guardrail itself still points in the right
direction.
