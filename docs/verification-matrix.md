# Verification Matrix

## Levels

| Level | Gate | Required evidence |
| --- | --- | --- |
| L0 | Static | schema valid, redaction clean, paths safe, diff scoped |
| L1 | Replay | candidate vs baseline on historical tasks |
| L2 | Shadow | candidate runs beside production, no live effect |
| L3 | Canary | limited low-risk activation |
| L4 | Publication | version, evidence, approval, rollback |

## Gate Boundaries

Offline success is not production success. Each gate must state what it proves
and what it does not prove.

Examples:

- schema validation proves structure, not usefulness
- replay proves behavior on known tasks, not unseen traffic
- shadow proves observation safety, not user-visible impact
- canary proves limited activation safety, not global safety

## Required Failure Behavior

If a gate fails:

- record the failure
- keep the candidate in draft or rejected state
- do not publish
- trigger cooldown after repeated same-mode failure
- preserve replay evidence for analysis
