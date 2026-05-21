# Signal Intake Cadence v0.9

v0.9 locks the cadence contract between session distillation, Farcaster public
behavior, and the Qianxuesen learning layer.

It is intentionally small. It does not create a scheduler, call providers,
publish Farcaster replies, write memory, or update VPS. It only makes the intake
rules testable.

## Rule

```text
30 minutes: collect signals
24 hours: decide durable learning
public replies: defend before posting
durable changes: ask Huan first
```

## Chat Windows

`session-distiller` remains the first filter for chat windows.

The Qianxuesen layer should read the distilled summary first. It should only
look up original chat fragments when the summary already contains a valuable
candidate and has source references such as `session_id`, `conversation_hash`,
or source offsets.

This avoids full-window rereads by default.

## Failure Logs

Distiller failures are system signals, not normal chat lessons.

Examples:

- content too long
- malformed session payload
- provider timeout
- embedding quota or rate limit

Single failures should usually route to `damping`. Repeated failures can route
to `case`. Repairable process problems can route to `skill`. Policy, provider,
VPS, service, or secret changes still require Huan approval.

## Farcaster

Farcaster uses fast defense and slow learning.

Every candidate reply must pass through local safety and quality checks before
posting. The local gate should check reply need, relevance, public-memory
safety, Misa voice, frequency, and thread risk.

An extra judge API is not the default. It is reserved for risky or uncertain
cases such as public-memory risk, identity/policy boundaries, argument risk,
high-frequency replies, or uncertainty about whether Misa should answer.

Post feedback is sampled later, not instantly promoted:

```text
first feedback: about 2 hours later
final feedback: about 24 hours later
Qianxuesen learning rollup: daily
```

Likes or replies alone do not define quality. The signal should combine
relevance, Misa voice, safety, thread result, negative feedback, manual
correction, and repeated patterns.

## Command

```bash
npm run intake:misa
npm run intake:misa -- --json
```

Expected result:

- signal scan interval is `30` minutes;
- durable learning rollup interval is `24` hours;
- chat success path is summary-first and source-fragment lookup only;
- distiller failures enter the exception queue;
- Farcaster defense is per candidate reply;
- Farcaster learning is daily, not per cast;
- extra Farcaster judge API is conditional, not default;
- production authority remains false.
