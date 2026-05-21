# Misa Evolution Candidate Preflight v0.11

v0.11 makes the order explicit:

```text
signal adapter
-> candidate queue
-> daily rollup
-> optimization candidate
-> local preflight
-> report queue or internal ledger
-> evolution tournament for reportable candidates
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
- it passes the lightweight candidate hygiene gate;
- it has no live effects and no production authority.

Passing preflight means "ready to ask Huan whether to change something." It does
not mean the change is approved.

In v0.17, reportable candidates also feed
`npm run evolution:tournament:misa`. That second gate generates multiple local
variants, scores them, and recommends a draft winner. It still does not approve
publication.

The report queue is capped at the top `3` preflight-passed candidates per daily
rollup. Other passed candidates remain local candidates and can be surfaced in a
later rollup if they are still important.

## Candidate Hygiene Gate

The hygiene gate is a small pre-report check, not a new workflow. It borrows the
useful part of `forrestchang/andrej-karpathy-skills`: do not hide assumptions,
do not overbuild, touch only the needed scope, define success criteria, and use
the four task questions before treating a candidate as reportable. It also
borrows the useful part of `mattpocock/skills` `grill-me`: answer from local
code, docs, and rollup evidence before asking Huan, and if something is still
unresolved, carry only the next question.

For Misa, this becomes five local checks:

- `no_hidden_assumptions`: the candidate must come from a normalized adapted
  signal, not a guessed improvement idea.
- `minimal_scope`: the candidate must stay inside one known route and use only
  local preflight commands.
- `traceable_change`: the candidate must point back to an exact
  `source_event_id`.
- `success_criteria_present`: the candidate must include the local verification
  command chain before review.
- `four_question_gate`: complexity, value, doability, and error-cost boundaries
  must all pass.

The `grill-me` adaptation becomes a `clarification` block on each candidate:

- `codebase_answered`: questions already answered by the adapted signal,
  candidate queue, command chain, and safety fields.
- `open_questions`: unresolved gate or hygiene questions that should stay local
  until more evidence exists.
- `recommended_next_question`: the single next question to resolve if local
  evidence cannot answer it.
- `needs_huan_answer`: empty unless the candidate truly needs Huan instead of
  another local signal, doc, or verifier.

The same block keeps terminology aligned. Farcaster is treated as a Hermes
surface used for validation, not as the identity of the Qianxuesen layer. This
does not import `CONTEXT.md`, ADR files, issue triage, or a mandatory interview
loop.

Clarification statuses are:

- `resolved_by_evidence`: reportable candidates are already answered by local
  evidence.
- `hold_for_more_evidence`: the candidate needs more local proof or smaller
  scope.
- `suppressed`: the candidate stays in the experience ledger.

For candidates that reach `report_queue`, the packet carries
`clarification_status`, `next_unresolved_question`, and `terminology_status` so
review can see that the local decision tree was resolved before Huan is asked.

The four questions are used as a routing decision:

| Question | Failing Decision | Passing Decision |
| --- | --- | --- |
| Is the task complex enough? | `workflow_or_hold` | `candidate_preflight` |
| Is the task valuable enough? | `hold_or_suppress` | `candidate_preflight` |
| Are all parts doable? | `reduce_scope` | `candidate_preflight` |
| What is the cost of error/error discovery? | `read_only_or_human_in_the_loop` | `human_review_only` |

This gate should reduce noisy reports and over-large self-repair ideas. It does
not add a scheduler, a new approval layer, a global coding rule, or any
production authority.

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
