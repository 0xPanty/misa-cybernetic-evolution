# Signal Candidate Rollup v0.10

v0.10 connects the v0.9 intake contract to the existing adaptive candidate gate.

It is still a local dry-run layer. It does not start a scheduler, call model
providers, publish Farcaster replies, write persistent memory, install Skills,
or update the VPS.

## Local Chain

```text
signal adapter -> candidate queue -> daily rollup
```

The adapter normalizes the three current signal families:

1. `session_distiller_success`
   - reads `distilled_summary` first
   - only looks up source fragments when a candidate is already valuable
2. `session_distiller_failure`
   - reads failure summaries as runtime signals
   - can enter the immediate exception queue
   - durable learning still waits for daily rollup
3. `farcaster_behavior`
   - keeps per-candidate reply defense before posting
   - pools feedback into daily learning
   - keeps extra judge API conditional

## Candidate Queue

Every adapted signal enters one queue item:

- `ready_for_daily_rollup`
- `watch_for_more_evidence`
- `rejected_suppression`

The queue is a review surface, not a worker. It does not run in the background
and does not create a timer or service.

Validation-ready items include `npm run rollup:misa` in their command chain.
Held items wait for more evidence. Rejected items stay as suppression evidence
and cannot be repackaged as publication evidence.

## Daily Rollup

The daily rollup is a 24-hour summary over the queue. It counts ready, held, and
rejected candidates by route and source contract, then reports local next
actions.

Durable outputs are still draft-only:

- memory candidates are not written to persistent memory;
- skill candidates are not published or installed;
- case and policy candidates stay behind approval;
- VPS, service, provider-route, and Farcaster changes remain blocked.

## Command

```bash
npm run rollup:misa
npm run rollup:misa -- --json
```

Expected result:

- all three signal adapters have mapped signals;
- adapted signal count equals candidate queue count;
- rollup window is `24` hours;
- validation-ready candidates include the local rollup check;
- Farcaster behavior remains daily pooled learning, not per-cast learning;
- production authority remains `false`.
