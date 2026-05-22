# Evolution Tournament Gate v0.18

This is a versioned feature-origin document. The tournament gate still feeds the
v0.21 current line, but current validation should run the v0.21 smoke,
calibration, precheck, and test chain.

v0.18 keeps the v0.17 tournament gate, but hardens the decision quality around
two problems found in real-sample calibration:

- variants were sometimes too close for the old composite score to explain why
  one strategy fit the route better;
- optional LLM review could be recommended without proving what the model call
  would actually improve.

The result is still local and draft-only. It does not publish Skills, write
memory, update prompts, change routes, evolve code, call VPS, or touch live
channels.

The stable output contract now lives in
`scripts/lib/evolution-tournament-contract.mjs`. It freezes the report shape,
score-field names, and authority boundary for review. It does not freeze the
scoring formula or give the tournament any new power.

The tournament now also emits `experience_ledger`. This is not a memory write.
It is a local shadow ledger for source-backed preflight entries, safe
non-winning variants, and rejected unsafe variants.

## Deterministic Ranking

Tournament ranking is explicit:

```text
tournament_ranking.rule = deterministic_reducer
tournament_ranking.scorer = deterministic_proxy_v1
tournament_ranking.llm_judge_allowed = false
tournament_ranking.decision_authority = deterministic_qianxuesen_gate_only
```

An optional LLM reviewer may add critique notes only when the deterministic
escalation gate allows it. It cannot rank winners, change routes, or promote a
candidate.

## Skill Evolution Bridge

The tournament can optionally include replay-required candidates from
`skill:evolution`:

```bash
npm run evolution:tournament:misa -- --include-skill-evolution
```

The bridge is deliberately narrow:

- it accepts only supervisor candidates that are already `replay_required`;
- it maps them onto an existing Qianxuesen route, usually `skill`;
- it exposes `agentskills.io-compatible-draft` metadata only;
- it sets `tournament_required=true` and `can_promote_now=false`;
- it does not create `skills/`, install skills, publish skills, write memory, or
  call providers.

Plain version: skill evolution can now hand tournament a better draft candidate,
but tournament still only picks a local draft recommendation.

## Honest Ledger Fields

The flat ledger fields are now present on each `experience_ledger` entry:

```text
iteration_id
change_diff_hash
plant_model_version
metric_registry_version
metric_id
metric_value
decision
reason_ref
timestamp
last_sample_ts
```

`plant_model_version` and `metric_registry_version` keep the old score
replayable after the plant model or metric registry grows. `last_sample_ts` is
reserved for future liveness checks and does not create a new memory system.

## Loser Contrast Ledger

Losers are not treated as a blacklist or hard filter.

Each non-winning variant now carries a small contrast record:

- `unsafe`: failed a hard gate or requested a blocked operation. Keep it as a
  strong pressure signal, require L4 review before any similar shape re-enters,
  and do not let the loser record delete candidates by itself.
- `weak`: safe, but materially weaker than the winner. Do not retry without new
  evidence, a better trace, or changed route pressure; hold it for agent
  evidence checking rather than throwing it away.
- `promising`: safe and close, or useful in a narrower context. Keep it for L4
  comparison and future matching.

This keeps the useful learning signal from losers without letting the ledger
own route, winner, memory, skill, or production authority.

The ledger now separates two things that used to be mixed together:

- `failure_type`: why the variant lost, such as `safety_boundary`,
  `quality_inferior`, `evidence_deficit`, `context_mismatch`,
  `overfit_or_holdout_regression`, or `cost_or_operational_risk`;
- `candidate_pool_effect`: what the system should do with that evidence,
  such as strong review pressure, evidence-before-reentry, or contextual
  alternative.

This means a similar future candidate can be reviewed against the actual failure
reason instead of being treated as "loser-looking" in one big bucket.

Each loser also carries a `rehabilitation_record`. It does not pardon the loser
automatically. It records what new evidence must exist before pressure can be
lowered or the candidate can re-enter review. Time fields (`observed_at`,
`last_triggered_at`, `source_count`, `decay_weight`, and `confidence`) make the
pressure replayable and decay-aware without giving it hard-filter authority.

Every loser entry now states this boundary directly:

```text
candidate_pool_authority = advisory_pressure_only
hard_filter_allowed = false
agent_review_required = true
rehabilitation_record.authority = advisory_reentry_only
```

Plain version: a loser match raises pressure and asks the agent to check the
candidate. It does not become a one-vote veto.

## Loser Review Context

The gate now emits `loser_review_context` as the place where the later review
loop consumes loser evidence. It lands the remaining Pro-review items without
giving them decision authority:

- local token prototype recall for winner, loser, and rehabilitation examples;
- route-specific loser indexes so one route does not poison another route;
- top-k diversified counterexample packs for L4 instead of repeated loser spam;
- joint winner/loser/rehabilitation recall so "how it was rehabilitated" stays
  visible beside "why it failed";
- prototype reservoir compression so the loser ledger can keep representatives
  instead of turning into an endless list;
- deterministic weak-perturbation checks with zero model calls;
- high-dispute strong-review sampling targets with zero model calls by default;
- an L3/L4 consumption plan that turns pressure into review requirements, not
  candidate filtering.

Plain version: this is the "how to use the loser evidence" packet. It can tell
L3 to ask for proof and L4 to compare counterexamples. It still cannot change
the winner, route, memory, production state, Zilliz, or public channels.

The deployable profile is `shadow_advisory`. That profile is intentionally
boring:

- `top_k` is capped at 12 and each counterexample pack is capped at 5;
- the reservoir is capped at 24 prototype representatives;
- API, LLM, embedding, Zilliz, VPS, and public-write budgets are all zero;
- unsupported runtime profiles fail closed and make the gate non-releaseable;
- the kill switch is `MISA_LOSER_REVIEW_CONTEXT=0`;
- rollback does not need data migration because winners, tournaments, and the
  experience ledger do not depend on the loser context.

Plain version: this can be shipped as a shadow advisory feature. If someone
tries to turn it into live hard filtering, the gate blocks that configuration.

## Loser Pressure Quant

`npm run loser:pressure` and `npm run loser:matrix` stress-test whether loser
contrast stays useful after many related samples accumulate.

The pressure lane treats any local model as a sample generator only. It does not
let a model judge winners or write memory. The first matrix report recommends
`weak_gate_stricter_v1` as the long-run calibration candidate because it improves
weak-loser evidence gating without increasing unsafe leakage, false suppression,
or promising-loser loss.

See `docs/current/loser-pressure-quant-v0.26.md` for the current report pointers and
decision.

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
- `experience_ledger` is populated with local comparison evidence;
- every loser records a separate `failure_type` and advisory
  `candidate_pool_effect`;
- every loser records a `rehabilitation_record` and time/decay metadata before
  any future pressure change;
- `loser_review_context` includes route indexes, prototype recall, diversified
  counterexamples, weak perturbation checks, strong-review sampling targets, and
  L3/L4 consumption plans;
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
