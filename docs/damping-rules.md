# Damping Rules

Damping rules keep the learning plane from changing itself too fast.

The goal is simple: learn from evidence, but do not let one noisy event become a
permanent rule.

## Default Thresholds

| Signal | Allowed result |
| --- | --- |
| 1 relevant event | draft only |
| 2 similar failures | case candidate |
| 3 confirmed successes | skill candidate |
| explicit user correction | memory candidate, pending verification |
| high-risk behavior change | control contract plus approval |

## Cooldown

If the same verifier fails twice inside one observation window:

1. stop publication for that candidate;
2. keep the candidate in draft or rejected state;
3. record the failure reason;
4. require owner review before another publication attempt.

The default cooldown window is 24 hours. Implementations may shorten it for
local-only tests, but must not shorten it for public output, provider routes,
timers, session mechanics, deletion, or persistent memory writes.

## Anti-Chatter

Avoid rapid state switching:

- do not repeatedly enable and disable the same skill;
- do not toggle policy from adjacent weak signals;
- do not publish and roll back the same artifact without a new diagnosis;
- do not retry a blocked provider indefinitely.

## Anti-Windup

When an actuator is blocked, stop accumulating more candidate changes for the
same target. For example:

- if replay is failing, do not keep creating skill rewrites;
- if memory publication is waiting for review, do not queue unlimited memory
  writes;
- if a provider is timing out, do not switch production routes without a
  separate control contract.

## High-Risk Actuators

These actuators require a control contract, explicit approval, rollback target,
and at least shadow or canary evidence before publication:

- public posting behavior;
- provider route changes;
- session mechanics;
- background timers or schedulers;
- persistent deletion or pruning;
- persistent memory writes from weak evidence;
- security or redaction policy changes.

## Schema

The machine-readable default ruleset is:

- [schemas/damping_rules.schema.json](../schemas/damping_rules.schema.json)
- [examples/damping_rules.example.json](../examples/damping_rules.example.json)
