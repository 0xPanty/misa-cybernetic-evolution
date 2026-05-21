# Current-Line Calibration v0.21

`calibrate:current-line` is the local shadow-mode calibration report for the
v0.21 line.

It answers one practical question:

```text
Do route, repair-ticket, work-order, retrieval, curiosity, tournament, and judge-escalation
decisions still look right on redacted sample groups?
```

It is not a new governance layer. It is a replay report over existing modules.

## Command

```bash
npm run calibrate:current-line
npm run calibrate:current-line -- --json
npm run calibrate:current-line -- --out-file generated/current-line-calibration.example.json
```

The GitHub Actions workflow `.github/workflows/current-line-shadow.yml` runs this
command after `smoke:current-line` and before the full dry-run precheck/test
chain. The workflow has read-only repository permissions and no secret-backed
steps.

## Sample Groups

| Sample group | Purpose |
| --- | --- |
| `default_redacted_examples` | checks the default redacted local examples: memory, case, and policy |
| `route_sensitive_sources` | checks policy, damping, skill, case, and memory route separation |
| `judge_calibration_sources` | checks near-threshold judge escalation stays deterministic by default |
| `vps_sanitized_conversation` | checks sanitized public-channel samples without touching VPS |
| `redacted_holdout_samples` | checks small redacted holdouts where public memory risk suppresses workflow, while clean local workflow still routes to skill |

## What It Checks

- signal-layer coverage stays explicit: source signals, Qianxuesen route
  signals, shadow perception hints, curiosity/LLM value selection,
  work-order pressure, retrieval ranking inputs, and tournament quality signals;
- curiosity signal selection recognizes external framework drift, competitor
  pressure, user corrections, knowledge gaps, and repeated terminology without
  treating one-off buzzwords as LLM-worthy;
- minimal-positive L3 keeps non-skill routes out of skill export;
- repair tickets remain local and do not claim production authority;
- work-order routing mirrors repair tickets and keeps durable/public effects off;
- retrieval probes keep the requested kind in the top slot even when sibling
  records have higher vector scores;
- tournament winners preserve the Qianxuesen route and stay local draft-only;
- judge escalation matches expected value: high-value samples are surfaced,
  near-threshold samples stay deterministic by default;
- live writes, provider calls, embeddings, Zilliz writes, public posting, and
  VPS mutation all remain `false` or `0`.

## Expected Summary

On the current fixture set, the expected shadow report is:

```text
sample_sets: 5
sources: 18
atomic_lessons: 49
work_orders: 5
tournaments: 49
signal_layers: 7
observed_signals: 9
retrieval_top1_exact_recall: 1
judge_recommended: 2
judge_near_threshold: 3
curiosity_llm_variant_generation: 3
curiosity_optional_review: 4
curiosity_missed_review_worthy: 0
curiosity_noise_selected: 0
external_api_calls: 0
llm_api_calls: 0
```

Plain version: this command is the local calibration mirror for the current
line. It tells us whether the existing pieces still judge the redacted samples
correctly, without adding authority or touching production.

## Signal Layers

Current signal layers are:

| Layer | What It Means | Authority |
| --- | --- | --- |
| Source distillation signals | extracted source pressure like reusable workflow, boundary, failure, preference, and project-fact signals | observation only |
| Qianxuesen route signals | deterministic route mapping into `memory`, `skill`, `case`, `policy`, `damping`, or `ignore` | local route owner only |
| Shadow perception signals | attention/risk/novelty/review-value hints before downstream review | hint only |
| Curiosity / LLM value signals | high-value signal selection for later LLM or GEPA-style variant generation | advice only |
| Work-order signals | repair severity, bad promotion pressure, and self-review/escalation recommendation | handoff recommendation only |
| Retrieval-ranker signals | requested kind, same-source context, authority weight, trace continuity, and surface guard | read-side ranking only |
| Tournament quality signals | route preservation, safety lock, holdout, failure learning, compactness, source coverage, and judge-escalation value | draft optimizer only |

Simple version: source signals tell us what the evidence smells like, route
signals decide which lane it belongs in, perception hints decide what to look at
first, curiosity signals decide whether a candidate is worth model-assisted
research or variant generation later, work-order signals decide who should
inspect it, retrieval signals decide what comes back first, and tournament
signals compare safe local drafts. Only
the Qianxuesen route table owns the local route decision; none of these layers
can write memory, write Zilliz, publish, call providers, or touch VPS.
