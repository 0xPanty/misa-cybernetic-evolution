# Misa Evolution Candidate Preflight v0.11

v0.11 makes the order explicit:

```text
signal adapter
-> candidate queue
-> daily rollup
-> optimization candidate
-> local preflight
-> report queue or internal ledger
```

The purpose is not to judge an outside framework as a whole. The purpose is to
test each optimization candidate that the Qianxuesen loop already produced.

## What It Does

`npm run evolution:evaluate:misa` reads the v0.10 daily rollup and builds a
local preflight for every queued candidate.

A candidate can only enter the report queue when:

- it came from an adapted signal;
- it is already `ready_for_daily_rollup`;
- it has at least two evidence points;
- it is not suppressed;
- it carries the local simulation and test command chain;
- it has no live effects and no production authority.

Passing preflight means "ready to ask Huan whether to change something." It does
not mean the change is approved.

The report queue is capped at the top `3` preflight-passed candidates per daily
rollup. Other passed candidates remain local candidates and can be surfaced in a
later rollup if they are still important.

## What It Refuses

Held candidates stay in `hold_queue` until another matching signal arrives.

Suppressed candidates stay in `experience_ledger` so the system does not keep
bringing the same weak idea back to Huan.

The preflight cannot:

- write persistent memory;
- replace Zilliz;
- publish Farcaster posts;
- publish or install Skills;
- change session mechanics;
- start timers or services;
- change provider routes;
- update VPS.

## Real Chat Fixture

v0.11 includes a redacted real-ish fixture:

`examples/misa-learning/skill_real_chat_evolution_eval.fixture.json`

It represents the current user requirement: do not report conceptual
self-evolution ideas until they have been simulated against local Misa samples.

That fixture must pass preflight and enter the report queue. This proves the
new order is working:

```text
candidate first -> local simulation -> report to Huan
```

## Local Command

```bash
npm run evolution:evaluate:misa
```

Expected local shape:

- mode: `candidate-preflight-local-simulation`;
- real chat preflight: `preflight_passed`;
- report queue count greater than zero and at most `3`;
- held and suppressed candidates stay internal;
- live effects: none.
