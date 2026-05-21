# Evolution Tournament Gate v0.17

v0.17 adds the active self-evolution piece that was still missing from the
Qianxuesen loop: candidates can now compete before they reach human review.

v0.18 keeps this contract and adds `strategy_fit` plus `llm_review_value` so
optional model review has to name concrete critique value before auto mode can
spend a call. See
[evolution-tournament-gate-v0.18.md](../current/evolution-tournament-gate-v0.18.md) for
the calibrated v0.18 results.

The borrowed idea from `NousResearch/hermes-agent-self-evolution` is not
automatic self-modification. The borrowed idea is the optimization shape:

```text
baseline candidate
-> multiple variants
-> train / validation / holdout checks
-> Pareto-style scoring
-> winner draft + loser ledger
```

## Why This Fits

Qianxuesen still owns the controller.

The existing route table decides whether an event is memory, skill, case,
policy, damping, or ignore. The tournament gate starts only after
`evolution:evaluate:misa` has produced reportable local candidates. It does not
decide routes, write memory, install Skills, rewrite prompts, evolve code, or
touch production behavior.

That gives Misa a more active inner loop without weakening the outer boundary:

```text
evidence
-> deterministic Qianxuesen route
-> candidate preflight
-> tournament variants
-> holdout and safety scoring
-> winner draft recommendation
-> human approval boundary
```

## What It Borrows

From the Hermes self-evolution repo, this gate borrows:

- multi-variant candidate search;
- train / validation / holdout split;
- trace-aware failure reflection;
- Pareto-style winner selection;
- before/after metric reporting;
- rejected variants as useful learning evidence.

## What It Rejects

The gate refuses:

- automatic Skill writes or installation;
- automatic memory writes;
- LLM-owned learning route decisions;
- automatic prompt evolution;
- automatic code evolution;
- continuous production self-improvement loops.

An intentionally unsafe `aggressive_auto_publish` variant is included as a
negative sample in every tournament. It should always be rejected before any
effect happens. That makes the boundary testable instead of just described.

## Scoring

The first implementation uses `deterministic_proxy_v1`. It is deliberately local
and zero-call. It scores:

- route preservation;
- evidence fit;
- train / validation / holdout pass rate;
- safety;
- compactness;
- novelty;
- route/source strategy fit;
- regression risk.

`strategy_fit` is reported in each variant's `scores` object so reviewers can
see whether a winner was selected because it fit the route/source pressure, not
only because it was shorter.

This is not a final LLM judge. A future GEPA-style optimizer can be added only
as an offline optional scorer behind the same contract.

## Real-Sample Input

The tournament can now run over source-backed local artifacts instead of only
the default candidate preflight queue:

```text
local source dir or VPS sanitized copy
-> local distillation
-> Qianxuesen route
-> source-backed shadow candidates
-> tournament
```

This path still reads local files only. It does not connect to VPS. It is meant
to compare real route pressure such as `skill`, `case`, and `policy` candidates
inside the same tournament contract.

## Judge Escalation Gate

The default judge mode is now `advise`, so `llm_api_calls=0`.

Before any model call, the local gate scores whether LLM review is worth it:

- uncertainty: close winners or one winner strategy dominating too much;
- value: real source-backed/VPS samples or larger batches;
- conflict: mixed routes such as skill + policy;
- novelty: new source pressure or high-novelty winners;
- anomaly: high score with narrow strategy, repeated rejection shape, or low
  source coverage.

The gate now also reports `llm_review_value`. This is the anti-waste layer:
it explains what an LLM could actually improve before any call is made.

High-value targets can justify `--judge-mode auto` spending one offline call.
Medium-value targets stay deterministic by default and are only optional review.
Low/no-value samples should not spend a model call unless a human overrides the
gate.

Current review targets include:

- `public_boundary`: real VPS/public-channel samples where wording, redaction,
  and no-live-effect boundaries need critique;
- `batch_pattern_review`: larger batches where the useful question is pattern
  bias, not one winner;
- `damping_vs_compact`: tiny margins where weak evidence might be over-held or
  over-compressed;
- `policy_skill_boundary` and `policy_memory_boundary`: route-boundary pressure
  that can look reusable but should not be blindly promoted;
- `close_tiebreak_review`: close deterministic winners where only the rationale
  needs review;
- `winner_strategy_bias` and `rejection_pattern_review`: repeated shapes that
  may need better local fixtures.

Scores just below the threshold are reported as `near_threshold=true`.
Near-threshold samples keep the default deterministic path and do not call an
LLM, but they are visible to reviewers as optional human/model-review cases if
the decision is important.

Modes:

- `--judge-mode off`: never ask for review;
- default `--judge-mode advise`: recommend or skip LLM review, but never call a
  model;
- `--judge-mode auto`: call the optional reviewer only when the local escalation
  gate recommends it and `llm_review_value.level=high`;
- `--judge-mode llm`: force the optional reviewer.

The reviewer can score draft quality and write reflection notes. It cannot
choose routes, approve winners, publish Skills, write memory, change prompts,
evolve code, or touch VPS. The deterministic Qianxuesen gate remains the only
decision authority.

## Commands

```bash
npm run evolution:tournament:misa
npm run evolution:tournament:misa -- --vps-raw-dir runs/vps-real-conversation-source
npm run evolution:tournament:misa -- --vps-raw-dir runs/vps-real-conversation-source --judge-mode auto
npm run evolution:tournament:misa -- --vps-raw-dir runs/vps-real-conversation-source --judge-mode llm
npm --silent run evolution:tournament:misa -- --json
```

## Expected Results

- reportable candidates generate multiple local variants;
- a safe winner enters `winner_queue`;
- unsafe automatic-publish variants enter `rejected_variant_ledger`;
- winners stay `local_draft_report_only`;
- `production_authority=false`;
- `publication_allowed=false`;
- `llm_route_decision_allowed=false`;
- all live effects remain false.

Plain version:

```text
Be aggressive inside the candidate sandbox.
Do not let the sandbox publish.
```
