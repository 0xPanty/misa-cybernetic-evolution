# Work Order External Samples v0.25

`work-order:evaluate` now accepts a local issue/PR-shaped sample adapter. The
goal is simple: do not judge a smarter work-order generator only on the original
local regression set.

The committed sample pack lives at:

```text
examples/work-order-quality/external-issue-pr/
```

Each `*.sample.json` file validates against:

```text
schemas/external_work_order_sample.schema.json
```

## Split Policy

- `dev`: allowed for future strategy-weight tuning, mutation/crossover trials,
  and replacement-rule experiments.
- `test`: held out for final quality checks. Do not tune against it.
- `local_regression`: the existing repo fixtures, kept as the stable current
  line regression set.

The evaluator reports:

- `sample_summary.external_issue_pr_sample_count`
- `sample_summary.dev_sample_count`
- `sample_summary.test_sample_count`
- `summary.by_split`
- `summary.dev_test.holdout_passed`

## Command

Default local evaluation includes the committed external sample pack:

```bash
npm run work-order:evaluate -- --json --dry-run
```

To point at another local sample directory:

```bash
npm run work-order:evaluate -- --json --dry-run --external-sample-dir path/to/samples
```

To run only the older regression set:

```bash
npm run work-order:evaluate -- --json --dry-run --no-external-samples
```

## Boundary

This is not a benchmark downloader and not an executor.

- no network fetch
- no work-order execution
- no memory write
- no skill mutation
- no LLM call
- no external API call

The current fixtures are synthetic, public-safe, and shaped after common
issue/PR repair tasks. They prove the adapter and holdout policy. They do not
yet prove broad benchmark-scale quality across SWE-bench, BugsJS, Defects4J, or
other public corpora.

## Current Local Numbers

With the default 10 seeds:

- old regression-only corpus: 8 source sets, 80 comparisons, average lift
  `+0.165`, no safety regression
- v0.25 corpus: 14 source sets, 140 comparisons, 700 variants, average lift
  `+0.168`, no safety regression
- held-out `test` split: 30 comparisons, average lift `+0.176`,
  `holdout_passed=true`
- `llm_api_calls=0`
- `external_api_calls=0`

With the follow-up selection/update and diversity guard enabled by default:

- all 140 selected winners beat the incumbent baseline score
- incumbent retained count is `0`
- medium-risk diversity guard applies on 31 comparisons
- winner strategies cover all 5 strategy families
- risk-adaptive budget spends 600 candidates instead of the fixed 700
- high-risk samples keep population size 5, medium-risk samples use 4, and
  low-risk samples use 3
- average lift and held-out `test` lift stay unchanged at `+0.168` and
  `+0.176`
- `llm_api_calls=0`
- `external_api_calls=0`
