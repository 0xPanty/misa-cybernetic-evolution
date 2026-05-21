# Runtime Thread v0.28

v0.28 starts the runtime execution-orchestration layer without granting runtime
authority.

Plain rule:

```text
The runtime thread records how an agent task launches, pauses, resumes, and
chooses its next local step.
It does not execute the work order.
```

## Scope

The first v0.28 layer covers local thread state and next-step decisions only.

It may:

- create an `agent_thread` event log;
- unify execution state and business state in one thread packet;
- determine `next_step` from the event log;
- pause on `human_escalation`;
- resume after a recorded human decision;
- replay the same thread state locally.

It must not:

- execute work orders;
- call tools, model providers, or external APIs;
- write persistent memory;
- install or publish skills;
- start services, timers, webhooks, or workers;
- touch VPS or production;
- change route, metric, stability, winner, or authority decisions.

## Shape

```text
work-order routing
-> candidate-generation-context
-> factor candidate reducer
-> human escalation packets
-> agent_thread event log
-> determineNextStep(thread)
-> next_step
```

The default local fixture currently pauses because the example work order needs
a human owner decision. Passing a human decision records a resume event and moves
the next step to the local gate.

Second-stage local wiring connects the v0.27 candidate reducer into the runtime
thread event log. The reducer output is recorded as candidate result refs, then
the runtime thread can:

- replay the thread state from the event log;
- run a deterministic local gate after a resume decision;
- record `local_gate_passed` when the candidate-layer handoff is still locked
  and no-effect;
- compact runtime failures into `runtime_error_compacted`;
- fail closed to `next_step.step_type = error` when an error signal is present.

The local gate checks structure and authority only. It does not execute the
candidate, call a tool, call a provider, write memory, or touch production.

## Commands

```bash
npm run runtime:thread -- --json
npm run runtime:thread -- --json --decision choose_executor
npm run runtime:thread -- --json --decision choose_executor --run-local-gate
npm run runtime:thread -- --json --error-signal candidate_replay_failed
```

For strict machine handoff:

```bash
npm run runtime:thread -- --out-file runs/manual/runtime-thread.json
```

## 12-Factor Mapping

| 12-factor idea | v0.28 local expression |
| --- | --- |
| Unify execution state and business state | `agent_thread.business_state` plus `event_log` |
| Launch/pause/resume | `thread_launched`, `human_escalation_requested`, `human_decision_recorded` |
| Contact humans with tools | `human_escalation` becomes a pause reason |
| Own your control flow | `determineNextStep(thread)` is deterministic code |
| Stateless reducer | `same thread event log -> same next_step` |
| Trigger from anywhere | deferred; current allowed triggers are local packets and human decision events only |

## Boundary

This is still not production autonomy. It is a local runtime-control skeleton
that makes future long-running agent work auditable before any live trigger or
tool execution is enabled.
