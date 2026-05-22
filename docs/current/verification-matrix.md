# Verification Matrix

## Levels

| Level | Gate | Required evidence |
| --- | --- | --- |
| L0 | Static | schema valid, redaction clean, paths safe, diff scoped |
| L1 | Replay | candidate vs baseline on historical tasks |
| L2 | Shadow | candidate runs beside production, no live effect |
| L3 | Canary | limited low-risk activation |
| L4 | Publication | version, evidence, approval, rollback |

## Current Local Shadow Gate

The current local gate is the one CI runs. This section is the canonical command
surface for README, architecture notes, and workflow alignment. It proves the
repository is schema-valid, current-line dry-run safe, calibrated on redacted
samples, and still passing the full local test suite.

```bash
npm run doctor
npm run validate:schemas
npm run smoke:current-line
npm run calibrate:current-line
npm run health:qianxuesen
npm run precheck
npm test
```

This proves L0 repository consistency, L1 read-only replay, and L2 shadow-mode
no-live-effect behavior over the committed fixture set. It does not prove canary
safety or production readiness.

`health:qianxuesen` adds a small ignored run manifest under
`runs/qianxuesen-full-loop/`. It keeps `latest.json` / `latest.md` for quick
inspection and timestamped history for later review. It indexes component
artifacts instead of embedding full logs.

The GitHub Actions version is:

- [.github/workflows/current-line-shadow.yml](../../.github/workflows/current-line-shadow.yml)

It has read-only repository permissions and no secret-backed publish/deploy
steps.

For the expanded local module chain, use:

```bash
npm run bootstrap:local
npm run simulate:misa
npm run distill:misa
npm run perception:digest
npm run curiosity:signals -- --json
npm run curiosity:signals -- --source-dir test/fixtures/perception/curiosity-realistic-sources --expect-review-worthy curiosity-farcaster-protocol-drift-001,curiosity-langgraph-doc-drift-002,curiosity-user-correction-qianxuesen-003,curiosity-competitor-change-agent-framework-004 --expect-noise curiosity-one-off-buzzword-noise-005,curiosity-marketing-note-noise-006,curiosity-term-only-noise-007
npm run crystallize:misa
npm run self-repair:misa -- --validation-mode
npm run hermes:map-distillation -- --json
npm run hermes:adapt-runtime -- --json
npm run hermes:plugin:doctor
npm run session-distiller:review -- --json --summary-file examples/session-distiller-summary.example.json
npm run work-order:variants -- --json --dry-run
npm run work-order:evaluate -- --json --dry-run
npm run candidate:context -- --json
npm run candidate:reduce -- --json --seed stable-review
npm run human:escalation -- --json
npm run runtime:thread -- --json
npm run health:components -- --json
npm run skill:evolution -- --json
npm run vector-memory:classify -- --json
npm run vector-store:local -- --mode upsert --dry-run
npm run vector-memory:rank -- --eval-fixtures
npm run zilliz:adapt -- --json
```

`health:components` is part of the local shadow gate only as a deterministic
sensor. It emits pure reducer values and replayable diagnostic candidates for
`human_escalation`; it does not execute repairs, call providers, write memory,
write Zilliz, or consume its own candidates.

For Misa specifically, L0 also checks the launch profile:

- [misa-readonly-integration.md](./misa-readonly-integration.md)
- [examples/misa_readonly_integration.example.json](../../examples/misa_readonly_integration.example.json)

Passing this means the local sidecar is coherent as a dry-run/shadow-ready
control-learning layer. The local vector store can persist ignored runtime
records when explicitly asked, but the gate does not turn the repo into a
background runtime service, production memory writer, Zilliz writer, public
publisher, or VPS updater.

Historical simulator pieces are documented in:

- [misa-learning-loop-v0.2.md](./misa-learning-loop-v0.2.md)
- [misa-learning-replay-v0.3.md](./misa-learning-replay-v0.3.md)
- [misa-learning-evidence-v0.4.md](./misa-learning-evidence-v0.4.md)
- [skill-crystallization-v0.5.md](./skill-crystallization-v0.5.md)
- [self-repair-v0.6.md](./self-repair-v0.6.md)
- [source-synthesis.md](./source-synthesis.md)

These files explain retained historical invariants. They are not alternate
current release tracks; the current local shadow gate above is the v0.25 entry
point.

It checks that Misa-style events can route to memory, skill, case, policy, and
damping without live effects, and that each fixture's declared route expectation
stays stable. v0.4 also checks that injected-only skill context is not counted
as attribution evidence, and that staged/held/rejected candidates cannot publish.
v0.5 additionally checks generated skill crystallization candidates against a
schema that requires publication and live effects to stay disabled.
v0.6 adds a self-repair schema and draft runner so generated repairs can be
logged, validated, and stopped for human review on failure.

The current-line additions are documented in:

- [evolution-tournament-gate-v0.18.md](./evolution-tournament-gate-v0.18.md)
- [vector-memory-storage-v0.19.md](./vector-memory-storage-v0.19.md)
- [local-vector-store-v0.21.md](./local-vector-store-v0.21.md)
- [work-order-variants-v0.23.md](./work-order-variants-v0.23.md)
- [work-order-quality-eval-v0.24.md](./work-order-quality-eval-v0.24.md)
- [work-order-external-samples-v0.25.md](./work-order-external-samples-v0.25.md)
- [factor-compliant-candidate-layer-v0.27.md](./factor-compliant-candidate-layer-v0.27.md)
- [control-boundaries.md](./control-boundaries.md)
- [runtime-thread-v0.28.md](./runtime-thread-v0.28.md)
- [component-health-diagnostics-v0.29.md](./component-health-diagnostics-v0.29.md)
- [skill-evolution-adapter-v0.22.md](./skill-evolution-adapter-v0.22.md)
- [hermes-runtime-adapter-v0.22.md](./hermes-runtime-adapter-v0.22.md)
- [vector-retrieval-ranker-v0.20.md](./vector-retrieval-ranker-v0.20.md)
- [current-line-calibration-v0.21.md](./current-line-calibration-v0.21.md)

The older version names remain useful for audit history, but v0.25 owns the
active smoke, calibration, precheck, and CI command surface.

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
