# Evolution Tournament Gate v0.17

v0.17 adds the active self-evolution piece that was still missing from the
Qianxuesen loop: candidates can now compete before they reach human review.

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
- regression risk.

This is not a final LLM judge. A future GEPA-style optimizer can be added only
as an offline optional scorer behind the same contract.

## Commands

```bash
npm run evolution:tournament:misa
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
