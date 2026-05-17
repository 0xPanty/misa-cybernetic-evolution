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

L2 can optionally ask one provider call to return several draft candidates for
the same sample:

```bash
npm run external:llm-work-order -- --candidate-count 3
```

The local L2 gate scores each returned candidate and selects one local
`winner_candidate_id` for the sample. This is only candidate selection inside
the L2 draft report. It is not route authority, production winner authority, or
work-order execution.

L3 reads the selected L2 winner through the normal top-level `draft` and `gate`
fields, then preserves `candidate_count`, `winner_candidate_id`, and
`winner_strategy` in the pool ledger for L4 review. Losers stay in the L2
`loser_ledger` as evidence.

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

## Boundary

Pool labels are audit tags. They do not replace L4 judgment and do not grant
runtime authority. L4 can override hard-gate outcomes, and those overrides
should be appended to `l4-review.jsonl` for later threshold tuning.
