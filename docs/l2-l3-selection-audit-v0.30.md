# L2/L3 Selection Audit v0.30

This note defines the lightweight ledger between L2 Hermes delegate output and
later L4 owner-style review. It is not a new authority layer. It labels existing
L2 results so the selection logic can be replayed and periodically checked.

## Command

```bash
npm run selection-audit:review -- \
  --l2-report runs/<batch>/external-trajectory-llm-work-order-draft.json \
  --batch-size 50
```

The command reads an existing L2 report. It does not call an LLM, execute work
orders, write memory, write Zilliz, create embeddings, change route/winner, or
touch VPS.

## L2 Candidate Winners

The default L2 path is `light_single`: one sample asks for one draft candidate.
This stays the normal local review mode because the 20-sample and 10-sample
comparisons did not show a reliable gain from making two candidates the default.

Multi-candidate selection remains available as an explicit recheck switch:

```bash
npm run external:llm-work-order:recheck -- --source-ids <source_id>
```

The recheck switch currently requests two candidates. Direct `--candidate-count`
is still available for experiments, but it is not the default path.

The local L2 gate scores returned candidates and selects one local
`winner_candidate_id` for the sample. This is only candidate selection inside the
L2 draft report. It is not route authority, production winner authority, or
work-order execution.

L3 reads the selected L2 winner through the normal top-level `draft` and `gate`
fields, then preserves `candidate_count`, `winner_candidate_id`, and
`winner_strategy` in the pool ledger for L4 review. Losers stay in the L2
`loser_ledger` as evidence.

L3 also writes `candidate_recheck` hints. Recheck is recommended for yellow
items, deterministic red spot checks, and red items close to the yellow quality
threshold. The hint is a review aid, not an automatic rerun.

## Pools

- `green`: the hard gate passed. Forward to L4.
- `yellow`: the hard gate failed, but the output is high-quality enough to
  suspect a false reject. Forward to L4.
- `red`: the output failed below the yellow threshold. Hold it for audit lookup,
  with deterministic spot checks.

Default yellow threshold:

- `quality_score >= 0.9`
- `actionableTaskCount >= 4`
- no provider error

## Artifacts

Each run writes local evidence under `runs/l2-l3-selection-audit/<timestamp>/`
unless an explicit `--out-dir` is supplied:

- `input-manifest.json`: batch source, thresholds, and source ids.
- `l2-raw-results.json`: copied L2 report for replay.
- `pool-decisions.jsonl`: one decision record per sample.
- `quality-report.json`: full summary and decisions.
- `quality-report.md`: human review summary.
- `l4-review.jsonl`: empty append-only file for later L4 decisions.

These run artifacts stay local and are not meant for GitHub.

## 50-Sample Self-Check

The default batch size is 50. Before 50 samples, the report status is
`accumulating`. At 50 or more samples, it becomes
`ready_for_periodic_review`.

L4 should read the summary first, not all raw samples. The default preview is
limited to 5 items. Full sample text remains available through `source_id` and
the raw result copy.

The periodic review checks:

- green pool L4 acceptance rate;
- yellow pool false-reject rate;
- red spot-check misses;
- most common gate violation;
- L4 overrides that should tune the next threshold.

## Quantitative Comparison

Use the comparison command when several L2/L3 runs share the same sample set:

```bash
npm run selection-audit:compare -- \
  --bundle-dir runs/pro-review-bundles/2026-05-17-l2-l3-full-five-run-review
```

The comparison reads existing `l2.json` and `l3-quality-report.json` files. It
does not call an LLM and does not execute work orders. The report makes the
default-version decision explicit:

- `single_candidate_default_run`, the best stable single-candidate default;
- `candidate_count_default_run`, the multi-candidate mode that is safe enough
  for default review, if one exists;
- prompt-version deltas against the baseline;
- green/yellow/red calibration proxies;
- candidate-count marginal lift;
- whether multi-candidate mode is ready as default or should stay explicit
  recheck/exploration mode. Current evidence keeps `light_single` as default and
  `candidate-count=2` as explicit recheck only.

Until L4 labels exist, the calibration is proxy-only. Real L4 rates require
later labels such as green acceptance, yellow overturn, and red false-negative
results.

## Boundary

Pool labels are audit tags. They do not replace L4 judgment and do not grant
runtime authority. L4 can override hard-gate outcomes, and those overrides
should be appended to `l4-review.jsonl` for later threshold tuning.
