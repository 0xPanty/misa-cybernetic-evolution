# Work Order Quality Evaluation v0.24

`work-order:evaluate` checks whether the work-order variant layer improves the
final Qianxuesen work-order packet. It is not a second executor and does not
grant runtime authority.

The command compares:

- the baseline `work-order:route` packet
- the winning `work-order:variants` packet
- the same source set across multiple deterministic seeds
- the local regression split plus issue/PR-shaped `dev` and `test` samples
- the selected winner after a quality replacement rule and optional diversity
  guard

## Command

```bash
npm run work-order:evaluate -- --json --dry-run
```

For a smaller deterministic sample:

```bash
npm run work-order:evaluate -- --json --dry-run --seeds qa-01,qa-02,qa-03
```

For side-by-side checks:

```bash
npm run work-order:evaluate -- --json --dry-run --no-selection-update --no-diversity-guard
npm run work-order:evaluate -- --json --dry-run --selection-policy quality_replacement --no-diversity-guard
npm run work-order:evaluate -- --json --dry-run --selection-policy quality_replacement --diversity-policy strategy_guard --budget-policy fixed_5
npm run work-order:evaluate -- --json --dry-run --selection-policy quality_replacement --diversity-policy strategy_guard --budget-policy risk_adaptive
```

By default, v0.25 also loads local issue/PR-shaped samples from
`examples/work-order-quality/external-issue-pr/`. See
[work-order-external-samples-v0.25.md](./work-order-external-samples-v0.25.md).

## Quality Dimensions

The evaluator scores final work-order quality, not just command success:

- `source_trace`: source refs and evidence survive the optimization step
- `replayability`: reproduction, acceptance, verification focus, and stop
  condition are clear enough to replay
- `boundary_safety`: live effects, memory writes, skill installs, external
  calls, and direct execution stay off
- `handoff_clarity`: the next agent can see the executor, delivery policy,
  default next step, acceptance, and stop condition
- `control_loop_fit`: the packet still looks like a Qianxuesen control loop
  output: observe, route, propose, verify, stop
- `qianxuesen_fit`: weighted fit for this repo's control-learning shape

## Qianxuesen-Specific Adaptation

The variant scorer now includes a small control-loop alignment signal:

- high-risk work orders prefer `boundary_tightening`
- medium-risk work orders prefer `replay_extension`, `compact_handoff`, or
  evidence strengthening
- low-risk work orders prefer `conservative_patch`

This is not a hard rule. It is a bias that reflects the local architecture:
stabilize boundaries before improving wording, replay medium-risk changes before
promotion, and keep low-risk work small.

## Selection/Update and Diversity

The default evaluator now applies a small replacement rule after candidate
generation:

- a selected variant must beat the incumbent baseline work-order score;
- a selected variant must not introduce durable/public effects, memory writes,
  skill installs, external calls, or direct execution;
- if no candidate clears that gate, the incumbent baseline is retained.

The diversity guard only acts on same-quality near ties. It does not spend
tokens and does not let diversity override risk fit:

- high-risk work stays on `boundary_tightening`;
- low-risk work stays on `conservative_patch`;
- medium-risk near ties can rotate across `replay_extension`,
  `compact_handoff`, and `evidence_expansion`.

This keeps the useful EvoPrompt idea of selection/update without turning the
work-order layer into a broad genetic algorithm.

## Budget/Popsize

The default budget policy is now `risk_adaptive`. It keeps the candidate pool
small, but ties the spend to risk:

- high or critical risk: 5 candidates, with `boundary_tightening` required;
- medium risk: 4 candidates, with `replay_extension`, `compact_handoff`, and
  `evidence_expansion` required;
- low risk: 3 candidates, with `conservative_patch` required.

This is intentionally not a multi-round budget curve yet. It is just enough to
stop spending a full population on low-risk work while keeping the money spent
where the Qianxuesen control loop needs it.

## Safety

The evaluator is local and dry-run by design:

- does not execute work orders
- does not write persistent memory
- does not install skills
- does not call an LLM
- does not call external APIs
- does not change the route or winner authority

`llm_review_gate` can recommend a critique, but this evaluator only records the
recommendation. It does not spend tokens.

## Current Local Result Shape

On the committed local fixture corpus, the useful result is not only that the
command passes. The important signals are:

- variant winners lift the measured work-order quality score
- source trace and routes stay preserved
- high-risk work orders shift toward boundary tightening
- medium-risk work orders shift toward replay or compact handoff
- low-risk work orders stay conservative
- external issue/PR-shaped samples are split into `dev` and `test`
- held-out `test` lift must pass before we claim the work-order scheme improved

That last point matters. Local fixtures are good regression samples, and the
new issue/PR-shaped fixtures prove the adapter plus holdout gate. They still do
not prove broad real-world quality by themselves.

With the default 10 seeds, the current v0.25 corpus runs 140 comparisons across
700 variants. The old regression-only corpus runs 80 comparisons. The average
lift changes from `+0.165` to `+0.168`, and the held-out `test` split shows
`+0.176` with no safety regression, LLM call, or external API call.

After the replacement and diversity follow-up, the side-by-side result is:

| Mode | variants | saved vs fixed5 | avg_delta | test_avg_delta | positive_lift_rate | safety_regressions | diversity_applied | winner strategies |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v0.25 baseline | `700` | `0` | `+0.168` | `+0.176` | `1` | `0` | `0` | `4` |
| + Selection/Update | `700` | `0` | `+0.168` | `+0.176` | `1` | `0` | `0` | `3` |
| + Selection/Update + Diversity | `700` | `0` | `+0.168` | `+0.176` | `1` | `0` | `31` | `5` |
| + Risk-Adaptive Budget | `600` | `100` | `+0.168` | `+0.176` | `1` | `0` | `31` | `5` |

The final default keeps the fourth row. It does not lift the numeric score above
v0.25, but it keeps the same quality and safety numbers while preventing the
medium-risk winner set from collapsing into one strategy and avoiding 100
unneeded candidate slots.
