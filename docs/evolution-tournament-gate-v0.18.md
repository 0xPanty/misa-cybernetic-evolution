# Evolution Tournament Gate v0.18

v0.18 keeps the v0.17 tournament gate, but hardens the decision quality around
two problems found in real-sample calibration:

- variants were sometimes too close for the old composite score to explain why
  one strategy fit the route better;
- optional LLM review could be recommended without proving what the model call
  would actually improve.

The result is still local and draft-only. It does not publish Skills, write
memory, update prompts, change routes, evolve code, call VPS, or touch live
channels.

## Route Strategy Fit

Each variant score now includes `strategy_fit`.

This is a route/source fit signal, not a new authority layer:

- `baseline` gets more credit for damping, low evidence, and low-risk hold
  decisions;
- `trace_reflective` gets more credit for policy, case, high-risk, repeated
  failure, and public-boundary pressure;
- `pareto_compact` gets more credit for memory and skill routes when evidence is
  strong enough to compress safely.

The composite score still includes route preservation, evidence fit,
train/validation/holdout checks, safety, compactness, novelty, and regression
risk. `strategy_fit` makes the winner explanation more route-sensitive instead
of merely shorter.

## LLM Review Value

`judge_escalation` now includes `llm_review_value`.

That object answers the cost question before any model call:

```text
Should an LLM review this?
If yes, what exactly should it critique?
If no, why keep the deterministic path?
```

Fields:

- `level`: `none`, `low`, `medium`, or `high`;
- `expected_value`: `none`, `diagnostic_note_only`, or `critique_only`;
- `should_change_winner`: always `false`;
- `call_policy`: `do_not_call`, `deterministic_default_review_optional`, or
  `call_when_auto_enabled`;
- `waste_risk`: `low`, `medium`, or `high`;
- `targets`: concrete review targets with evidence and sample counts.

High-value targets can justify one offline LLM call in `--judge-mode auto`.
Medium-value samples stay deterministic by default and are visible for optional
manual/model review. Low/no-value samples do not spend a call unless a human
forces `--judge-mode llm`.

## Review Targets

Current targets are intentionally narrow:

- `public_boundary`: real public-channel or VPS-sanitized samples where wording,
  redaction, and no-live-effect boundaries need critique;
- `batch_pattern_review`: large historical batches where the useful question is
  strategy bias, not one winner;
- `damping_vs_compact`: very tight damping margins where weak evidence may be
  over-held or over-compressed;
- `policy_skill_boundary`: reusable workflow pressure that may still need to
  remain policy-bound;
- `policy_memory_boundary`: policy pressure that may be over-compressed into
  memory;
- `close_tiebreak_review`: close deterministic winners where only the rationale
  needs review;
- `winner_strategy_bias`: repeated winner monoculture across enough route or
  sample pressure;
- `rejection_pattern_review`: repeated negative shapes that may need a better
  fixture.

Plain close scores in small single-route samples are not enough to justify a
model call by themselves.

## Historical Calibration

The v0.18 calibration used local ignored `runs/` artifacts only. It did not touch
VPS and did not push or publish runtime changes.

| Sample group | Tournament decisions | Escalation result |
| --- | ---: | --- |
| Default candidate preflight | 3 | deterministic only; `llm_review_value=none` |
| VPS sanitized conversation sample | 3 | high-value auto review target |
| 30 compound historical summaries | 87 | high-value batch/policy/damping review target |
| 15 atomic historical lessons | 17 | medium-value optional review; deterministic default |
| Six 5-source history chunks | 87 | separates high-value boundary/damping cases from low-value close ties |
| Five atomic route slices | 14 | keeps small single-route samples deterministic unless another high-value target exists |

Aggregate:

```text
sample_groups: 14
tournament_decisions: 211
legacy_pressure_only_recommended: 7
v0.18_auto_recommended: 6
v0.18_optional_review: 2
v0.18_deterministic_only: 6
avoided_low_value_calls: 2
recommended_without_high_value: 0
high_value_not_called: 0
violations: 0
```

The old pressure-only gate would have recommended review for two low-value
close-tie groups. v0.18 suppresses those calls because no concrete high-value
review target exists. It also catches high-value damping/boundary cases that sit
just below the old numeric threshold.

## Commands

```bash
npm run evolution:tournament:misa
npm run evolution:tournament:misa -- --source-dir runs/history-flowtest-sources
npm run evolution:tournament:misa -- --source-dir runs/history-atomic-flowtest-sources --judge-mode auto
npm run evolution:tournament:misa -- --vps-raw-dir runs/vps-real-conversation-source --judge-mode auto
npm --silent run evolution:tournament:misa -- --json
```

`--judge-mode auto` calls a reviewer only when
`judge_escalation.recommended=true` and `llm_review_value.level=high`.

## Expected Results

- every winner remains `local_draft_report_only`;
- `publication_allowed=false`;
- `production_authority=false`;
- `llm_route_decision_allowed=false`;
- `should_change_winner=false`;
- deterministic scoring remains the decision authority;
- optional LLM review can only add critique notes and suggested local
  experiments;
- all live effects remain false.

Plain version:

```text
Spend LLM review only where it can critique something specific.
Never let it own the route, winner, or production action.
```
