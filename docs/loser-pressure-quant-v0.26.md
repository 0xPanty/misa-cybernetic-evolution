# Loser Pressure Quant v0.26

This lane stress-tests the loser contrast ledger without giving a model any
decision authority.

The local model may generate pressure samples, but deterministic local scoring
owns the result. The report never writes memory, embeddings, Zilliz, Git, VPS,
public posts, or production state.

## Purpose

The loser ledger should not become a blacklist.

The pressure tests measure whether accumulated loser evidence can:

- suppress unsafe shapes when they reappear;
- require new evidence for weak shapes;
- preserve promising losers as contextual alternatives;
- avoid suppressing clean quoted/log/noise samples;
- stay stable when sample order, memory decay, and loser-family mix change.

## Commands

```bash
npm run loser:pressure -- --target-samples=1000 --use-ollama --ollama-batch-size=15
npm run loser:matrix -- --target-samples=1000
```

`loser:pressure` runs one 1000-sample batch. In the first local run, the batch
used 867 external trajectory samples and 133 local `qwen2.5:14b` generated
variants.

`loser:matrix` runs long-run scenario and parameter sweeps. The first matrix
used 6 scenarios x 5 parameter candidates x 1000 samples = 30000 local
assessments.

## First 1000-Sample Result

Report:

- `runs/loser-pressure-quant/2026-05-17T16-51-17-842Z/loser-pressure-quant.json`
- `runs/loser-pressure-quant/2026-05-17T16-51-17-842Z/loser-pressure-quant.md`

Key metrics:

| Metric | Result |
| --- | ---: |
| unsafe_recall | 0.905 |
| false_suppression_rate | 0.003 |
| promising_survival_rate | 1 |
| weak_evidence_gate_rate | 0.653 |
| winner_contamination_rate | 0.095 |
| reactivation_success_rate | 1 |

Readout: unsafe shapes were mostly suppressed, promising losers survived, and
false suppression stayed low. Weak handling needed a stricter long-run check.

## Matrix Result

Report:

- `runs/loser-pressure-matrix/2026-05-17T17-08-24-290Z/loser-pressure-matrix.json`
- `runs/loser-pressure-matrix/2026-05-17T17-08-24-290Z/loser-pressure-matrix.md`

Recommended parameter candidate:

`weak_gate_stricter_v1`

Why:

- passed all 6 long-run scenarios;
- kept worst unsafe recall at 0.905;
- kept worst false suppression at 0.077;
- kept promising survival at 1;
- kept worst winner contamination at 0.095;
- improved worst weak evidence gate from 0.885 to 0.951.

The rejected alternatives are useful controls:

- `unsafe_recall_plus_v1` improved unsafe recall, but crossed the false
  suppression threshold in adversarial drift;
- `false_positive_guard_v1` reduced aggression, but allowed too much unsafe
  contamination;
- `reactivation_friendly_v1` preserved promising losers, but weakened unsafe
  recall in balanced pressure.

## Full Local Addendum 2026-05-18

The later full-local run used every locally readable sample from the current
adapter surface:

| Dataset | Samples |
| --- | ---: |
| ATBench | 1500 |
| ATBench-Codex | 500 |
| AgentRx GitHub | 10 |
| SWE-chat | 5850 |
| SWE-ReBench sanitized sidecar | 500 |

Total local readable samples: 8360.

The raw SWE-ReBench parquet file was not uploaded or claimed as covered; the
Node adapter used the local sanitized 500-row sidecar.

Full-local matrix:

- target samples per scenario: 8360
- scenario runs: 30
- sample assessments: 250800
- ok: true
- recommended parameter: `unsafe_recall_plus_v1`
- worst unsafe recall: 0.995
- worst false suppression rate: 0
- worst weak evidence gate rate: 0.991
- worst winner contamination rate: 0.005

Full-local plus deterministic variants:

- target samples per scenario: 10000
- generated deterministic variants: 1640
- scenario runs: 30
- sample assessments: 300000
- ok: true
- recommended parameter: `unsafe_recall_plus_v1`
- worst unsafe recall: 0.993
- worst false suppression rate: 0
- worst weak evidence gate rate: 0.994
- worst winner contamination rate: 0.007

The false-suppression metric now counts only strong suppression that fails the
sample's own expected pass rule. Mixed samples with actual unsafe commands are
allowed to be strongly suppressed without being counted as false positives.

## Local Model Consistency Check

An 80-sample edge review was run against local `qwen2.5:14b`.

The model was used only as a consistency check, not as a judge with authority.
It was more conservative than the rules: most disagreements moved toward
`evidence_required_before_reentry`.

Normalized result:

- evaluated: 80
- valid parsed decisions: 73
- exact match rate: 0.521
- safety disagreement rate: 0.123
- model `strong_suppression` on non-strong rule decisions: 0
- rule `strong_suppression` downgraded by model: 9

Interpretation: the local model is useful for boundary calibration, but should
not own candidate filtering. The loser layer remains an advisory pressure
signal.

## Decision

Use `unsafe_recall_plus_v1` as the current review candidate after the full-local
run.

Do not give it production authority. It is a local calibration result for the
candidate pool and L4 comparison lane. Loser matches are advisory pressure only:
they can raise review pressure, request evidence, or provide L4 context, but
they must not hard-filter candidates by themselves. Runtime memory, route,
winner, skill, Zilliz, and production decisions remain blocked unless a later
explicit implementation step is approved.
