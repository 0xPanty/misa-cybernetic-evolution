# Verification Matrix

## Levels

| Level | Gate | Required evidence |
| --- | --- | --- |
| L0 | Static | schema valid, redaction clean, paths safe, diff scoped |
| L1 | Replay | candidate vs baseline on historical tasks |
| L2 | Shadow | candidate runs beside production, no live effect |
| L3 | Canary | limited low-risk activation |
| L4 | Publication | version, evidence, approval, rollback |

## Local v0.5 Gate

Run:

```bash
npm run simulate:misa
npm run crystallize:misa
npm run validate:schemas
npm run precheck
npm test
```

This proves L0 repository consistency and L1 read-only replay over the local
Misa fixture suite. It does not prove shadow safety, canary safety, or
production readiness.

For Misa specifically, L0 also checks the launch profile:

- [misa-readonly-integration.md](./misa-readonly-integration.md)
- [../examples/misa_readonly_integration.example.json](../examples/misa_readonly_integration.example.json)

Passing this means the v0.5 reference/precheck/simulation/replay/crystallization shape is
coherent. It does not turn the repo into a background runtime service.

The simulator is documented in:

- [misa-learning-loop-v0.2.md](./misa-learning-loop-v0.2.md)
- [misa-learning-replay-v0.3.md](./misa-learning-replay-v0.3.md)
- [misa-learning-evidence-v0.4.md](./misa-learning-evidence-v0.4.md)
- [skill-crystallization-v0.5.md](./skill-crystallization-v0.5.md)
- [source-synthesis.md](./source-synthesis.md)

It checks that Misa-style events can route to memory, skill, case, policy, and
damping without live effects, and that each fixture's declared route expectation
stays stable. v0.4 also checks that injected-only skill context is not counted
as attribution evidence, and that staged/held/rejected candidates cannot publish.
v0.5 additionally checks generated skill crystallization candidates against a
schema that requires publication and live effects to stay disabled.

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
