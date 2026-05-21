# Loser Advisory Pressure Pro Review Packet

This packet is for reviewing the loser-contrast direction without uploading the
raw local datasets.

## Review Question

Should Misa/Qianxuesen keep a loser library as an advisory pressure layer for
candidate review?

The proposed answer in this branch is yes, with one strict boundary:

```text
loser match = pressure signal, evidence request, or L4 review context
loser match != hard filter
```

## What Changed

- Tournament loser records now include explicit candidate-pool authority fields.
- Every loser record declares `candidate_pool_authority=advisory_pressure_only`.
- Every loser record declares `hard_filter_allowed=false`.
- Unsafe loser shapes now raise L4 review pressure rather than deleting future
  candidates by themselves.
- Weak loser shapes request better evidence before reentry.
- Promising loser shapes remain available as contextual alternatives.
- Validation and tests now fail if loser records regain hard-filter authority.

## Evidence Included

See `evidence-summary.json` in this folder.

It contains only counts and normalized metrics. It does not include raw
transcripts, raw parquet rows, private logs, model prompts, or original dataset
payloads.

## Local Data Coverage

The full-local run used all locally readable samples from the current adapter:

| Dataset | Samples |
| --- | ---: |
| ATBench | 1500 |
| ATBench-Codex | 500 |
| AgentRx GitHub | 10 |
| SWE-chat | 5850 |
| SWE-ReBench sanitized sidecar | 500 |

Total: 8360 samples.

Important caveat: the local 2GB SWE-ReBench parquet file was not parsed by the
Node adapter. The run used the local sanitized 500-row sidecar only.

## Key Results

Full-local rule matrix:

- 30 scenario/parameter runs
- 250800 local rule assessments
- `ok=true`
- recommended parameter: `unsafe_recall_plus_v1`
- worst unsafe recall: 0.995
- worst false suppression rate: 0

Full-local plus deterministic variants:

- 30 scenario/parameter runs
- 300000 local rule assessments
- `ok=true`
- recommended parameter: `unsafe_recall_plus_v1`
- worst unsafe recall: 0.993
- worst false suppression rate: 0

Local model consistency check:

- model: local `qwen2.5:14b`
- evaluated: 80 edge samples
- valid parsed decisions: 73
- exact match rate: 0.521
- safety disagreement rate: 0.123
- disagreement direction: model was more conservative, mostly preferring
  `evidence_required_before_reentry`

## What Pro Should Review

1. Is `advisory_pressure_only_no_hard_filter` the right authority boundary?
2. Is `unsafe_recall_plus_v1` a reasonable current candidate after the full-local
   matrix?
3. Does the local model disagreement pattern support an L4 review lane rather
   than model-owned filtering?
4. Are the new schema/test fields enough to prevent downstream hard-filter
   misuse?
5. What additional edge samples would be most useful before any production
   integration?

## Files To Inspect

- `scripts/lib/evolution-tournament-scoring.mjs`
- `scripts/lib/evolution-tournament-ledger.mjs`
- `scripts/lib/evolution-tournament-validation.mjs`
- `scripts/lib/loser-pressure-quant.mjs`
- `scripts/loser-model-consistency-check.mjs`
- `schemas/evolution_tournament_gate.schema.json`
- `test/evolution-tournament.test.mjs`
- `test/loser-pressure-quant.test.mjs`
- `docs/current/evolution-tournament-gate-v0.18.md`
- `docs/current/loser-pressure-quant-v0.26.md`

## Verification Run

This branch was locally verified with:

```bash
node --test test/evolution-tournament.test.mjs
npm run validate:schemas
npm run smoke:current-line
node --test test/loser-pressure-quant.test.mjs test/evolution-tournament.test.mjs
npm run precheck
npm test
```

`npm test` result: 163 pass, 1 skip, 0 fail. The skip is the existing Windows
symlink permission skip.
