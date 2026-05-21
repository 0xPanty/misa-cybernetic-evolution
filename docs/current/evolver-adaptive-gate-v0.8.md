# Evolver Adaptive Gate v0.8

v0.8 changes the self-evolution posture from narrow early rejection to wide
local candidate generation followed by strict filtering.

The rule is:

```text
generate candidates and learning signals -> filter bad candidates -> verify good candidates -> keep production locked
```

## What Was Borrowed

From `EvoMap/evolver`, Misa borrows the useful control logic:

- generate more than one possible evolution path;
- switch strategy when repeated repair does not work;
- classify failures instead of treating all failures the same;
- suppress candidates that already failed replay;
- keep blast radius small when a candidate is risky.

From `GenericAgent`, Misa keeps the v0.7 rule that candidates must be compact,
evidence-backed, and useful enough to stay in active process context.

## What Is Not Imported

Misa does not import:

- Evolver daemon loop;
- EvoMap Hub worker execution;
- marketplace or ATP auto-delivery;
- host-runtime `sessions_spawn` authority;
- automatic production Skill publication;
- automatic memory writes;
- timers, cron, or systemd creation.

## Safety Profile

The v0.8 safety profile is operator-owned:

```text
candidate_generation = wide
filter_mode = strict_safety_gate
validation_mode = local_allowlisted_commands
production_authority = false
production_gate = hard_locked_until_explicit_human_approval
```

That means Misa can produce more local candidate ideas, but those ideas cannot
publish, write permanent memory, start services, alter provider routes, post to
Farcaster, replace Zilliz, or change session mechanics.

## Candidate Decisions

`npm run adaptive:misa` classifies each simulated learning trace into one of
three decisions:

| Decision | Meaning |
| --- | --- |
| `validation_ready` | Good local candidate; it can enter the existing validation chain. |
| `held_for_more_evidence` | Interesting signal, but evidence is too thin or damping is still active. |
| `rejected` | Failed replay or bad candidate; it is suppressed before publication. |

## Verification

Validation-ready candidates only use known local commands:

```text
npm run crystallize:misa
npm run self-repair:misa -- --no-verify
npm run density:misa
npm run adaptive:misa
npm run intake:misa
npm run simulate:misa
npm run validate:schemas
npm run precheck
npm test
```

These commands are local repo checks. They are not provider calls and do not
touch live Misa services.

## Why This Is Less Conservative

Earlier versions damped weak signals early. That was safe, but it also made
self-evolution timid.

v0.8 lets the system think more broadly first. The safety gates then decide
which candidates survive. This gives Misa more candidate material without
granting any new production authority.
