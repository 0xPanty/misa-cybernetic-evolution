# Work-Order Variants v0.23

`work-order:variants` is the small EvoPrompt-inspired part that fits this repo.
It makes work-order output smarter by generating several local draft shapes,
scoring them, and retaining the losers as experience.

It is not a new controller and not L4 publication.

## Plain Shape

```text
work-order:route
-> seeded variants
-> deterministic scoring
-> optional LLM critique recommendation by value gate
-> one draft winner
-> existing handoff and human/Codex execution path
```

## What It Borrows

- population: several candidate work-order shapes;
- mutation: conservative, evidence-heavy, boundary-tightened, replay-focused,
  and compact handoff variants;
- fitness score: value, evidence, safety, clarity, strategy fit, novelty, and
  complexity;
- budget: one local round and bounded population size;
- seed: reproducible randomness for tests and reviews;
- loser ledger: non-winning shapes are retained as experience.

## LLM Gate

The command does not call an LLM.

It only emits `llm_review_gate`, which may recommend critique when deterministic
signals say the token cost is worth it:

- candidate value is high enough;
- uncertainty is high enough;
- winner margin is close;
- the work order category is important;
- route and winner authority stay with the deterministic verifier.

Allowed LLM outputs are critique notes, risk notes, clarity improvements,
verification gaps, or overdesign warnings. Forbidden outputs include execution,
publication, memory writes, skill installs, and replay bypass.

## LLM Mutation/Crossover Gate

LLM mutation and crossover are now formalized, but disabled by default. The
variant layer can say a high-value case is review-worthy, but it still does not
generate model candidates.

Allowed outputs if explicitly enabled later are limited to:

- mutation suggestion;
- crossover suggestion;
- verification gap;
- overdesign warning.

Forbidden outputs stay hard-blocked:

- execute work orders;
- change route;
- change winner without deterministic rescore;
- publish;
- write memory;
- install skills;
- skip holdout.

The current default is:

```text
enabled=false
call_policy=do_not_call
mutation_candidate_allowed=false
crossover_candidate_allowed=false
route_or_winner_authority=false
llm_api_calls=0
```

## Model Role Separation

The work-order layer now states the split explicitly:

- deterministic controller owns route, scoring, selection, and safety gates;
- evolution model, if enabled later, can only critique or suggest candidates;
- task model is not called by this layer and cannot self-select candidates;
- execution still belongs to the normal approved handoff path.

This keeps the Qianxuesen control loop in charge. A stronger model can become a
sensor or proposal source later, not the controller.

## Command

```bash
npm run work-order:variants -- --json --dry-run
npm run work-order:variants -- --seed stable-review --json --dry-run
```

Use a saved work-order routing artifact:

```bash
npm run work-order:variants -- --work-order-file runs/work-orders/manual-check/work-orders.json --json --dry-run
```

Write ignored local artifacts:

```bash
npm run work-order:variants -- --out-dir runs/work-order-variants/manual-check
```

## Boundary

The variant layer does not:

- execute work orders;
- write persistent memory;
- install or mutate skills;
- publish public content;
- call model providers;
- call external APIs;
- touch VPS or production services;
- change Qianxuesen route or winner authority.

It is a smarter L2 shadow search step, not a release gate.
