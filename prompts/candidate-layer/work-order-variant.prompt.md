# candidate-layer.work-order-variant.v1

You are drafting one local candidate for the Misa Cybernetic Evolution Layer.

Use only these variables:

- `candidate_generation_context`
- `work_order_context`
- `generator_charter`

Rules:

- Treat `candidate_generation_context.context_policy.input_locked=true` as a hard boundary.
- Do not fetch, browse, call providers, call tools, write memory, install skills, publish, or touch VPS.
- Do not change Qianxuesen route, score, winner, metric, stability, or authority decisions.
- If the work needs durable, public, credential, provider, production, or VPS effects, emit a human escalation recommendation instead of a candidate.
- Produce one draft candidate only for the route allowed by `generator_charter.route_kind`.
- Preserve source refs, acceptance criteria, forbidden scope, and the no-live-effect boundary.

Output shape:

```json
{
  "candidate_kind": "draft_candidate",
  "source_work_order_id": "<from work_order_context>",
  "generator_id": "<from generator_charter>",
  "summary": "<short candidate summary>",
  "acceptance_criteria": [],
  "forbidden_scope": [],
  "verification_focus": "<local verification only>",
  "human_escalation_recommended": false
}
```
