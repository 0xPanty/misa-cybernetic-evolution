# Misa Learning Loop v0.2

v0.2 adds the first runnable Misa learning-loop simulation.

It answers one practical question:

> When Misa learns something from work, what should that lesson become?

The answer is not always memory. The lesson may become a memory candidate, a
skill draft, a case record, a policy candidate, a damping hold, or ignored noise.

## Command

```bash
npm run simulate:misa
```

The command reads fixtures from `examples/misa-learning/`, routes each event,
and prints a dry-run report. It does not call model providers, write memory,
publish skills, start timers, change session mechanics, or post publicly.

Use JSON output when another tool needs the trace:

```bash
node scripts/simulate-learning.mjs --json
```

## Loop

```text
Misa event
  -> observe signal
  -> identify control category and error class
  -> route to memory / skill / case / policy / damping / ignore
  -> draft proposed change
  -> verify at L0
  -> keep dry-run result
```

## Current Fixtures

| Fixture | Expected route | Why |
| --- | --- | --- |
| `memory_user_style.fixture.json` | `memory` | stable user preference |
| `skill_recovery_workflow.fixture.json` | `skill` | repeatable project workflow |
| `case_provider_timeout.fixture.json` | `case` | repeated failure pattern |
| `policy_public_posting.fixture.json` | `policy` | public-channel side-effect boundary |
| `damping_single_failure.fixture.json` | `damping` | one failure should not trigger a system rewrite |

## What v0.2 Proves

- the route model is runnable;
- each fixture gets a deterministic route;
- policy routes require approval;
- damping routes hold instead of publishing;
- all live effects stay off;
- local precheck includes the simulation.

## What v0.2 Does Not Prove

- production memory quality;
- replay win rate;
- live-channel safety;
- Zilliz write correctness;
- automatic Skill publication readiness.

Those belong to later L1/L2 work.

## Why This Is Not Just Memory Management

Memory is only for stable bottom logic. If every lesson goes into memory, memory
gets noisy and Misa becomes harder to steer.

The learning loop keeps memory as one route among several:

- memory stores durable facts and preferences;
- skills store repeatable procedures;
- cases store failures and recoveries;
- policies store behavior boundaries;
- damping prevents overreaction.

That is closer to engineering cybernetics: observe the system, identify the
error, apply the smallest useful control action, then verify.
