# Post-Deploy Measurement

Post-deploy measurement closes the loop after a candidate has been approved and
landed.

Plain version: tournament scoring says a candidate looks good before release.
Post-deploy measurement asks the harder question afterward: did the measured
setpoint actually move in the right direction?

Machine-readable files:

- [schemas/deployment-ticket.schema.json](../../schemas/deployment-ticket.schema.json)
- [examples/deployment_ticket.example.json](../../examples/deployment_ticket.example.json)
- [scripts/lib/post-deploy-measurement.mjs](../../scripts/lib/post-deploy-measurement.mjs)

## Deployment Ticket

Every landed candidate gets a deployment ticket with:

- `deployment_id` and `candidate_id`
- `candidate_kind`: `skill`, `memory`, `case`, or `policy`
- `setpoint_metric_id`: a metric registered in the metric registry
- `pre_deploy_value`
- `post_deploy_value`
- `target_value`, `tolerance`, and `direction`
- `measurement_window`: days, sessions, or samples
- `decision_at_window_end`

The review route is always `post_deploy_review`. It is not a new evolution
direction. It is the path for judging what happened after a candidate landed.

## Classifier

The classifier is deterministic and uses distance to the setpoint:

- `confirmed_positive`: the metric moved closer to the setpoint by more than the tolerance
- `confirmed_negative`: the metric moved farther from the setpoint by more than the tolerance
- `null_effect`: the movement is inside the tolerance band
- `pending`: the measurement window has not produced a post-deploy value yet

No LLM is allowed in this measurement path.

## Negative Results

A negative result creates two recommendations:

- rollback recommended
- damping recommended as failed-outcome evidence

This local plane does not execute rollback. The ticket always keeps:

- `production_authority: false`
- `rollback.executed: false`
- `safety.rollback_executed: false`
- `llm_api_calls: 0`
- `external_api_calls: 0`

That is the important boundary: the controller can say "this landed candidate
looks harmful," but it cannot mutate production by itself.

## Tournament Input

`reviewEvolutionTournamentGate` now accepts historical post-deploy results as
input. The tournament output exposes them under
`historical_post_deploy_results`.

Those records are advisory pressure only. They can inform future review, but
they cannot change the route owner, hard-filter candidates, execute rollback,
write memory, or call an LLM.
