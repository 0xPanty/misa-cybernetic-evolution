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

Before L2 calls a provider, L1 now makes a small control decision:

- `generate_l2`: whether this source is worth an L2 provider call at all.
- `candidate_count`: normally `1`, upgraded to `2` only for recheck,
  multi-pool, high-uncertainty, or conflict cases.
- `handoff_floor`: the minimum downstream owner, such as `no_context_agent`,
  `primary_agent`, or `human_owner`.
- `risk_band` and `reasons`: the short explanation for the choice.

This is deliberately narrow. L1 does not judge draft quality and does not write
memory, Zilliz, GitHub, VPS, or public state. It only controls cost, duplicate
suppression, and the minimum safe handoff target before L2 spends a model call.

Clear low-risk samples still run as `light_single`: one sample asks for one
draft candidate. High-conflict or explicit recheck samples can request two
candidates without waiting for L3. Suppressed samples produce no L2 draft and
must show `llm_api_calls=0`.

Multi-candidate selection remains available as an explicit recheck switch:

```bash
npm run external:llm-work-order:recheck -- --source-ids <source_id>
```

The recheck switch currently requests two candidates. Direct `--candidate-count`
is still available for experiments and intentionally overrides the L1 candidate
count for that run.

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

## L3 Feedback Back To L1/L2

L3 now treats a failed draft as an engineering observation, not only as a pool
label. When a draft fails the local gate, L3 can record a repair observation
with:

- gate violations;
- actionable and weak task counts;
- task indices that passed;
- task indices that must be rewritten;
- missing anchor types such as source/evidence ref, field/boundary, signal, or
  explicit expected result.

The next L2 repair prompt receives that observation directly. This borrows the
ReAct-style feedback loop, but keeps it inside the work-order drafting boundary:

```text
L2 draft -> L3 gate observation -> next L2 repair prompt
```

The L3 actionability gate should count concrete no-effect expectations even
when the model does not use the exact words `false` or `zero`. The gate accepts
phrasing such as:

- `without triggering a memory-write request`;
- `suppression of memory-write requests and Zilliz updates`;
- `empty write-set`;
- `enforcement of candidate_count` or `l2_candidate_mode`.

This keeps the gate strict about concrete file/source/field/expected-result
anchors while avoiding false rejects caused by overly narrow wording.

The 2026-05-19 historical replay checked this change against the existing L2
corpus without model calls:

```text
runs/l2-gate-intercept-analysis/2026-05-19-after-expectation-pattern-fix/

l2_report_count=136
deduped_result_count=360
old blocked=171
new pass=205
new near_pass=81
new hard_fail=74
updated pools: green=286, yellow=4, red=70
old_blocked_salvageable_rate_pct=64.3
verdict=old_hard_gate_was_too_strict_for_near_pass_work_orders
```

The intended reading is: accept equivalent concrete no-effect wording, but do
not accept vague work orders. The gate still blocks non-whitelisted commands,
thin context anchors, weak acceptance criteria, and too few actionable tasks.

If L3 exhausts the allowed repair pass, the result may also carry an
`l1_feedback_suggestion`. This is suggestion-only feedback for the next policy
review. It can recommend a next-run candidate count, a more conservative
handoff floor, or `repair_prompt_mode=task_level_l3_observation`, but it does
not mutate L1 thresholds, global prompts, gate weights, runtime authority, or
production behavior.

## Pools

- `green`: the hard gate passed. Forward to L4.
- `yellow`: the hard gate failed, but the output is high-quality enough to
  suspect a false reject. Forward to L4.
- `red`: the output failed below the yellow threshold. Hold it for audit lookup,
  with deterministic spot checks.
- `suppressed`: L1 blocked L2 generation before any provider call. Do not
  forward to L4; inspect only if the suppression policy itself looks wrong.

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

- whether L1 suppression avoided low-value calls without hiding useful sources;
- whether L1 candidate counts were followed;
- whether L1 handoff floors match the final owner;
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

## L1 Alpha Simulation

Use the L1 alpha simulation when the question is about routing value before
spending L2 model calls:

```bash
npm run selection-audit:l1-alpha -- \
  --adaptation-report runs/l1-alpha-simulation/2026-05-19-swe-stratified500/adapt/external-trajectory-adaptation.json \
  --out-dir runs/l1-alpha-simulation/2026-05-19-swe-stratified500/l1-alpha
```

This command reads an existing external-trajectory adaptation report, builds a
local perception digest, runs the online shadow L1 contract, and writes:

- `l1-alpha-simulation.json`
- `l1-alpha-simulation.md`
- `online-shadow-report.json`
- `perception-digest.json`
- `online-shadow-report.md`

It does not call an LLM, touch VPS, push GitHub, write memory, write Zilliz, or
create embeddings. Its job is to choose a cheap fixed probe set before live L2
validation.

Current 2026-05-19 SWE-rebench stratified-500 readout:

```text
sample_count=500
l2_eligible_count=500
l1_mode_counts={"recheck":244,"single":256}
candidate_count_hint_counts={"1":256,"2":244}
risk_level_counts={"high":244,"medium":256}
simulated_handoff_floor_counts={"no_context_agent":256,"primary_agent":244}
```

The decision from this readout is conservative:

- keep `candidate_count=1` as the cheap path;
- use `candidate_count=2` for L1 recheck / high-risk ambiguous samples;
- keep `no_context_agent` for lower-risk single samples;
- use `primary_agent` floor for high-risk safety-boundary samples.

The fixed 15-sample probe was then replayed through mock L2/L3:

```text
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/probe-mock-l2-selected15/external-trajectory-llm-work-order-draft.json

samples=15
requested_candidate_count_histogram={"1":9,"2":6}
l1_handoff_floor_counts={"primary_agent":6,"no_context_agent":9}
passed_gate=15
failed_gate=0
llm_api_calls=0
```

This is a local baseline only. The next live-model proof should reuse the same
15 source ids and compare real Gemini output quality plus call count against
this local baseline and the earlier 10-sample Gemini run.

The 2026-05-19 live Gemini A/B did reuse that fixed 15-sample probe:

```text
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/real-gemini-vps-ab/comparison.json

A all candidate_count=1:
passed_gate=14
failed_gate=1
avg_quality_score=0.986
llm_api_calls=19
l3_recheck_triggered_count=4
failed_source=swe-rebench-openhands:numpy__numpydoc-101

B L1-controlled mixed:
requested_candidate_count_histogram={"1":9,"2":6}
passed_gate=15
failed_gate=0
avg_quality_score=0.992
llm_api_calls=15
l3_recheck_triggered_count=0
```

For this fixed probe set, L1-controlled mixed routing beat the all-single
baseline: one fewer failed gate, slightly higher average quality, and four fewer
API calls because it avoided repair reruns. This is evidence for the alpha, not
permission to mutate L1 thresholds or handoff authority automatically.

## Next Calibration Plan 2026-05-19

The next step is calibration, not broader autonomy. The system should prove the
L1/L2/L3 loop is making better decisions on historical evidence before any
automatic production mutation is allowed.

First run more historical false-judgment mining without LLM calls:

- find cases that a human would likely accept but L3 gate kills;
- find cases that L3 gate accepts but are too vague or hollow to execute well.

Then validate the three L1 judgments that matter most:

- when `candidate_count=2` adds real value over `candidate_count=1`;
- when `handoff_floor=primary_agent` is justified instead of
  `no_context_agent`;
- which L1 signals correlate with repeated L3 repair failure.

Then compare old logic and new logic on the same historical batch:

- same source ids;
- no LLM calls;
- compare gate false-kill pressure, hollow-pass pressure, candidate-count
  marginal value, handoff-floor conservatism, and repeated-repair pressure.

Only after that local replay improves the decision surface should a small real
Gemini check be run on the same selected source ids.

The stronger production loop, when it is justified, should be staged like this:

```text
L3 finds repeated problem patterns
-> aggregate enough observations to avoid one-sample overfitting
-> produce a candidate policy change
-> replay old and new policy on historical samples
-> promote only after measurable improvement
-> keep rollback data, before/after comparison, and a human-readable reason
```

Until that gate exists, `l1_feedback_suggestion` remains advisory. It can guide
review and replay, but it must not directly mutate L1 thresholds, L2 prompts,
gate parameters, or handoff-floor authority.

## Local Calibration Replay 2026-05-19

Local-only replay after `7800679 codex: close l1-l3 feedback alpha loop`:

```text
runs/l1-l3-local-calibration/2026-05-19-alpha-misjudgment-audit/alpha-misjudgment-audit.json
new_llm_api_calls=0
new_external_api_calls=0
touches_vps=false
pushes_github=false
```

Gate false-judgment mining:

```text
scanned_l2_reports=143
deduped_result_count=420
old_blocked_count=172
old_blocked_salvageable_count=110
old_blocked_salvageable_rate_pct=64
hollow_old_pass_count=13
hollow_old_pass_rate_pct=5.2
```

Candidate-count replay on the same fixed 20 historical source ids:

```text
count1: avg_quality=0.958, green=7, yellow=9, red=4, candidates=20
count2: avg_quality=0.968, green=7, yellow=9, red=4, candidates=40, default_ready=true
count4: avg_quality=0.960, green=11, yellow=3, red=6, candidates=80, default_ready=false
```

L1 handoff / L3 repair signal:

```text
L1 simulated handoff floors: {"no_context_agent":256,"primary_agent":244}
joined L4 rows: no_context_agent accept=205 revise=6; primary_agent accept=21 revise=0
L3 rows inspected=302
repair_pressure_count=5
repeated_failure_count=3
repeated failure cluster=single + medium-risk + damping + no_context_agent
examples=PyPSA__linopy-79, numpy__numpydoc-101, alexgolec__tda-api-37
```

Interpretation:

```text
count2 has local value, count4 should stay exploration-only, and the repeated
L3 failure alpha is not "raise every handoff floor". It is narrower: find the
medium+damping/no_context_agent rows that look cheap to L1 but later exhaust L3
repair.
```

Boundary stays unchanged:

```text
No automatic L1 threshold mutation.
No automatic L2 prompt mutation.
No automatic handoff-floor upgrade.
```

## L4 No-Context Review

L4 now uses the same no-context delegate shape as L2, but the job is review
only: decide whether the L3-forwarded work order is executable as a handoff.
It is not meant to be a second L3 quality court. In the normal flow, L4 should
answer the handoff question: is the packet self-contained enough, are the
forbidden scopes closed, and should it go to `primary_agent`, a no-context
coding agent, or `human_owner`?

```bash
npm run selection-audit:l4-review -- \
  --l2-report runs/<batch>/l2/external-trajectory-llm-work-order-draft.json \
  --l3-report runs/<batch>/l3/quality-report.json \
  --provider hermes-delegate \
  --hermes-delegate-provider novai \
  --hermes-delegate-model gemini-3-flash-preview
```

The L4 packet explicitly blocks parent chat, memory lookup, repo file reads,
tool execution, route/winner authority, memory writes, Zilliz writes, VPS,
GitHub push, and public posting. The reviewer returns one of:

- `accept`: the work order is self-contained enough for no-context execution.
- `revise`: useful, but needs a tighter handoff.
- `reject`: not actionable or unsafe as an execution handoff.
- `human_needed`: missing owner/project context.

The command appends review rows to the existing `l4-review.jsonl` ledger and
writes `l4-review-report.json` / `l4-review-report.md`. It reuses existing
feedback signals such as `policy_clean`, `low_revision_needed`,
`policy_conflict`, and `human_review_requested`; it does not introduce a new
feedback mechanism.

## Boundary

Pool labels are audit tags. They do not replace L4 judgment and do not grant
runtime authority. L4 can override hard-gate outcomes, and those overrides
should be appended to `l4-review.jsonl` for later threshold tuning.

## Local Reflection Replay 2026-05-19

The local replay library was written to:

- `runs/l1-l3-local-calibration/2026-05-19T13-44-28-927Z-reflection-replay/l3-feedback-reflection-library.jsonl`
- `runs/l1-l3-local-calibration/2026-05-19T13-44-28-927Z-reflection-replay/l3-feedback-reflection-replay.json`

The replay scanned 30 cheap-route samples from the historical `runs/` tree and
kept the policy narrow:

- `candidate_mode=single`
- `candidate_count=1`
- `risk_level=medium`
- `route_hint=damping`
- `handoff_floor=no_context_agent`
- `signal_family=keyword_risk_noise`

It found:

- `recorded_feedback_count: 2`
- `recorded_recall: 0.667`
- `recorded_missing_baseline_caught_count: 1`
- `baseline_feedback_count: 3`
- `baseline_recall: 1`
- `baseline_primary_agent_review_suggested_count: 2`
- `candidate_trigger_count: 3`
- `candidate_recall: 1`
- `candidate_primary_agent_review_suggested_count: 2`
- `candidate_good_false_positive_count: 0`
- `current_vs_candidate_gain: 0`

Plain result:

```text
This is the local proof that the reflection loop can be useful without
becoming noisy, but the old/new comparison must not confuse missing historical
fields with logic gain. The current L3 feedback rule already catches the three
failed rows when recomputed. The reflection candidate adds a more concrete
thin-work-order rule and does not start nagging the normal 27 samples.
```

## Local Reflection Stress 2026-05-20

Stress artifacts:

- `runs/l1-l3-local-calibration/2026-05-20T00-00-00-000Z-reflection-stress/l3-feedback-reflection-stress.json`
- `runs/l1-l3-local-calibration/2026-05-20T00-00-00-000Z-reflection-stress/l3-feedback-reflection-stress.md`
- `runs/l1-l3-local-calibration/2026-05-20T00-00-00-000Z-reflection-stress/l3-feedback-reflection-full-library.jsonl`

Stress readout:

```text
full_sample_count=556
strict_seed_sample_count=30
strict_seed_bad_count=3
clean_good_count=247
holdout_sample_count=526
documented_strict_trigger_count=3
documented_strict_clean_good_false_positive_count=0
documented_strict_holdout_trigger_count=0
over_broad_holdout_trigger_count=91
boundary_probe_count=100
strict_boundary_probe_trigger_count=0
widening_boundary_probe_trigger_count=250
l1_promotion_recommendation=keep_shadow_collect_more_holdout_before_l1_strategy
```

Plain result:

```text
The candidate rule survived the bigger local holdout, but only as a narrow
shadow rule. The strict version caught the three known bad thin-work-order rows
and did not touch the 247 clearly accepted rows or the 526-row holdout. But
wider variants immediately became noisy: dropping route/floor boundaries caused
91 holdout triggers, and boundary probes showed 250 triggers in widened rules.

So the next safe step is not direct L1 mutation. Keep it as a shadow candidate,
collect more real bad examples, and only consider L1 strategy integration after
the seed bad count grows and the holdout stays clean.
```

## L1/L3 Sample Library Quant 2026-05-20

This pass turns the downloaded GitHub/SWE samples into a measurable local sample
library. It runs adapter -> L1 alpha simulation -> L1/L3 join, then writes a
backfill queue for rows that still need L2/L3 labels.

Artifacts:

- `runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/adapt/external-trajectory-adaptation.json`
- `runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/l1-alpha/l1-alpha-simulation.json`
- `runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/sample-library/l1-l3-sample-library.json`
- `runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/sample-library/l1-l3-sample-library.md`
- `runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/sample-library/l1-l3-backfill-queue.jsonl`

Quant readout:

```text
adaptation_sample_count=500
l1_sample_count=500
library_row_count=500
l1_missing_count=0
l1_mode_counts={"recheck":244,"single":256}
l1_candidate_count_hint_counts={"1":256,"2":244}
l1_signal_family_counts={"keyword_context_filter":256,"safety_boundary":244}
l1_risk_level_counts={"high":244,"medium":256}
l1_route_hint_counts={"damping":256,"policy":244}
l1_handoff_floor_counts={"no_context_agent":256,"primary_agent":244}

reflection_scope_count=256
reflection_scope_rate=0.512
reflection_l3_labeled_count=14
reflection_l3_labeled_rate=0.055
reflection_l3_missing_count=242
reflection_bad_seed_count=3
reflection_clean_labeled_count=11
reflection_conflict_count=3
reflection_queue_count=245
queue_bucket_counts={"background_not_reflection_scope":244,"strict_clean_holdout":11,"strict_conflict_review":3,"strict_unlabeled_l2_l3_priority":242}

l3_source_coverage_count=20
l3_source_coverage_rate=0.04
l3_pool_decision_row_count=556
l3_pool_decision_unique_source_count=36
sample_library_ready=true
l1_auto_strategy_ready=false
```

Plain result:

```text
The sample library is useful, but it is not enough for automatic L1 strategy
promotion yet. The current quantified lane is:

medium risk + damping route + single candidate + candidate_count=1 +
no_context_agent + keyword-context filtering.

That lane has 256 rows out of the 500 SWE-rebench sample ids. Only 14 currently
have historical L3 labels. The labeled rows show the expected shape: 3 bad or
conflict seeds and 11 clean holdout labels. The missing-label queue is still
large: 242 strict-priority rows, plus 3 conflict rows for review.
```

Implementation boundary:

```text
Keep this as a local sample library and label queue.
Do not auto-change L1 thresholds.
Do not auto-change L2 prompts.
Do not auto-upgrade handoff floor.
Replay any candidate rule against this same library before integration.
```

## L1/L3 Backfill Benchmark 2026-05-20

The missing strict reflection-scope rows were backfilled in two local batches.
The first batch consumed the top 80 queue rows; the second consumed the
remaining 162 missing rows. Both batches used deterministic local L2/L3 only.

Artifacts:

- `runs/l1-l3-backfill-benchmark/2026-05-20T02-00-00-000Z-top80/l1-l3-backfill-benchmark.json`
- `runs/l1-l3-backfill-benchmark/2026-05-20T02-00-00-000Z-top80/comparison/quantitative-comparison.json`
- `runs/l1-l3-backfill-benchmark/2026-05-20T02-10-00-000Z-rest162/l1-l3-backfill-benchmark.json`
- `runs/l1-l3-backfill-benchmark/2026-05-20T02-10-00-000Z-rest162/comparison/quantitative-comparison.json`
- `runs/l1-l3-backfill-benchmark/2026-05-20T02-10-00-000Z-rest162/sample-library/l1-l3-sample-library.json`

Final quantified state:

```text
reflection_scope_count=256
reflection_l3_labeled_count=256
reflection_l3_missing_count=0
reflection_bad_seed_count=3
reflection_clean_labeled_count=253
reflection_conflict_count=3
reflection_queue_count=3
l3_source_coverage_count=262
l3_pool_decision_row_count=798
l3_pool_decision_unique_source_count=278
l1_auto_strategy_ready=false
```

Old-template vs new local comparison:

```text
top80:
- old_template avg_quality=0.407, green=0, red=80
- new_l1_control avg_quality=1, green=80, red=0

rest162:
- old_template avg_quality=0.407, green=0, red=162
- new_l1_control avg_quality=1, green=162, red=0
```

Plain result:

```text
The current local L2/L3 path is much better than the old thin-template shape on
the same source ids. It turns all 242 previously missing reflection-scope rows
into clean local labels, with zero local regressions and zero provider cost.

This is not enough to promote automatic L1 mutation. The durable bad/conflict
seed count is still only 3. The old-template failures are comparison-only and
were intentionally not written as pool-decisions, because they should not count
as real bad L3 history.
```

Next calibration boundary:

```text
Clean holdout is now enough.
Missing labels are closed.
Bad/conflict seeds are still short.

Next work should mine or create real bad labels, not local mock clean labels:
look for more real Gemini/L3 failures in the same medium+damping/no_context
lane, or run a very small controlled real Gemini probe only after local review
chooses the exact source ids.
```

## L1/L3 Local Exhaust Report 2026-05-20

This pass checks how far local-only evidence can go before a real model pass is
needed. It scans historical L3 pool decisions, the completed L1/L3 sample
library, and the SWE-rebench OpenHands parquet metadata. It does not call an
LLM, touch VPS, push GitHub, write memory, write Zilliz, or change runtime
policy.

Artifacts:

- `runs/l1-l3-local-exhaust/2026-05-20T03-00-00-000Z-local-exhaust/l1-l3-local-exhaust-report.json`
- `runs/l1-l3-local-exhaust/2026-05-20T03-00-00-000Z-local-exhaust/l1-l3-local-exhaust-report.md`
- `runs/l1-l3-local-exhaust/2026-05-20T03-00-00-000Z-local-exhaust/future-real-probe-candidates.jsonl`

Quant readout:

```text
historical_pool_decision_files=44
historical_pool_decision_rows=798
historical_unique_sources=278
historical_known_bad_unique_sources=3
historical_strict_scope_unique_sources=256
historical_strict_scope_known_bad_rows=3

sample_library_rows=500
reflection_scope_count=256
reflection_l3_labeled_count=256
reflection_l3_missing_count=0
reflection_bad_seed_count=3
reflection_clean_labeled_count=253
reflection_conflict_count=3

parquet_row_count=67074
parquet_resolved_false_count=34913
parquet_non_submit_count=6335
parquet_high_priority_unique_candidates_excluding_sampled=4820
future_probe_candidate_written_count=500
partial_full_jsonl_line_count=9199
partial_full_jsonl_excluded_from_evidence=true

l1_auto_strategy_ready=false
can_create_more_real_l3_labels_without_llm=false
```

Plain result:

```text
Local-only work is now at the boundary.

The strict lane has enough clean holdout and no missing labels. That says the
new local route is much steadier than the old thin-template path.

But product-level automatic L1 mutation still needs more real bad/conflict
evidence. The local parquet has plenty of high-risk candidates, but unresolved
or non-submit rows are only hints. They are useful for choosing the next probe;
they are not L3 failure labels.
```

Next calibration boundary:

```text
Use future-real-probe-candidates.jsonl as the next source-id shortlist.
Do a tiny real L2/L3 probe only after manual review picks exact ids.
Keep L1 threshold/prompt/handoff changes blocked until those real labels exist.
```

## Synthetic Bad L3 Pressure Report 2026-05-20

This pass pressure-tests the current L3 gate with artificial bad L2 work orders
on top of real SWE-rebench failed-task metadata. The synthetic rows are kept
outside historical L3 bad labels: no `pool-decisions.jsonl` is written, and the
run does not update durable bad seed counts.

Artifacts:

- `runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json`
- `runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md`
- `runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/selected-real-failure-tasks.jsonl`
- `runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/synthetic-bad-samples.jsonl`

Quant readout:

```text
base_task_count=30
base_task_category_counts={"loop_max_iteration":10,"resolved_false_submit":10,"timeout_provider_error":5,"missing_patch_or_generated_tests_failed":5}
synthetic_sample_count=90
bad_work_order_variants={"too_vague":30,"too_broad":30,"empty_acceptance":30}

l3_intercept_count=90
l3_intercept_rate=1.000
feedback_trigger_count=90
feedback_trigger_rate=1.000
candidate_count_2_suggestion_count=90
primary_agent_suggestion_count=90
false_pass_count=0

llm_api_calls=0
external_api_calls=0
touches_vps=false
pushes_github=false
modifies_l1_thresholds=false
modifies_l2_prompt=false
upgrades_handoff_floor=false
writes_durable_bad_seed=false
writes_pool_decisions_jsonl=false
```

Hit shape:

```text
too_vague: samples=30, intercepted=30, feedback=30, false_pass=0
too_broad: samples=30, intercepted=30, feedback=30, false_pass=0
empty_acceptance: samples=30, intercepted=30, feedback=30, false_pass=0
```

Result:

```text
L3 caught every deliberately bad sample in this synthetic pressure set.
The feedback advice is aligned for this shape: rewrite the work order, try
candidate_count=2, and escalate to primary_agent review. Do not auto-change L1
thresholds, prompts, gate weights, or handoff floors from this synthetic run.
```

## Adversarial Synthetic Bad L3 Pressure Report 2026-05-20

The first synthetic_bad run only proved that L3 catches obvious bad work orders.
This follow-up uses the same 30 real SWE-rebench failed-task bases, but adds
pass-like adversarial work orders that satisfy the current surface checks while
being wrong in meaning.

Artifacts:

- `runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json`
- `runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md`
- `runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/selected-real-failure-tasks.jsonl`
- `runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/synthetic-bad-samples.jsonl`

Quant readout:

```text
variant_profile=adversarial
base_task_count=30
synthetic_sample_count=240
obvious_sample_count=90
adversarial_sample_count=150

l3_intercept_count=90
l3_intercept_rate=0.375
feedback_trigger_count=90
feedback_trigger_rate=0.375
candidate_count_2_suggestion_count=90
primary_agent_suggestion_count=90
false_pass_count=150
false_pass_rate=0.625
obvious_false_pass_count=0
adversarial_false_pass_count=150

llm_api_calls=0
external_api_calls=0
touches_vps=false
pushes_github=false
modifies_l1_thresholds=false
modifies_l2_prompt=false
upgrades_handoff_floor=false
writes_durable_bad_seed=false
writes_pool_decisions_jsonl=false
```

Blind spots:

```text
wrong_objective: false_pass=30/30
evidence_mismatch/source_trace_misalignment: false_pass=30/30
verification_mismatch/acceptance_not_causal: false_pass=30/30
boundary_contradiction/handoff_pressure_hidden: false_pass=30/30
anchor_stuffing/no_real_task: false_pass=30/30
```

Result:

```text
Current L3 catches bad work orders that are visibly thin, broad, or missing
acceptance. It does not catch pass-like semantic failures when the draft has
enough surface anchors. This is a real local blind-spot signal, but it remains
synthetic pressure evidence only. Do not merge it into durable bad seeds and do
not auto-change L1 thresholds, prompts, gate weights, or handoff floors.
```

## Record-Only Semantic Observer Massive Pressure Report 2026-05-20

This adds a record-only observer beside the current L3 gate for synthetic_bad
pressure testing. It does not block, approve, change prompts, change L1, or
upgrade handoff floors. It only marks work orders that look structurally valid
but contradict the failed-task evidence, use irrelevant verification, hide
boundary pressure, or do no real work.

Artifacts:

- `runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json`
- `runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md`
- `runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/selected-real-failure-tasks.jsonl`
- `runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/synthetic-bad-samples.jsonl`

Quant readout:

```text
task_profile=massive
variant_profile=adversarial
base_task_count=636
base_task_category_counts={"loop_max_iteration":200,"resolved_false_submit":200,"timeout_provider_error":36,"missing_patch_or_generated_tests_failed":200}
synthetic_sample_count=5088
obvious_sample_count=1908
adversarial_sample_count=3180

l3_intercept_count=1908
l3_intercept_rate=0.375
feedback_trigger_count=1908
feedback_trigger_rate=0.375
candidate_count_2_suggestion_count=1908
primary_agent_suggestion_count=1908
false_pass_count=3180
false_pass_rate=0.625
obvious_false_pass_count=0
adversarial_false_pass_count=3180

semantic_observer_enabled=true
semantic_observer_mode=observe_only
semantic_trigger_count=3180
semantic_trigger_rate=0.625
semantic_false_pass_caught_count=3180
semantic_false_pass_recall=1
semantic_obvious_trigger_count=0
semantic_adversarial_trigger_count=3180
observer_candidate_count_2_suggestion_count=1908
observer_primary_agent_suggestion_count=3180
semantic_clean_false_positive_count=not_measured_in_synthetic_bad_only_run

llm_api_calls=0
external_api_calls=0
touches_vps=false
pushes_github=false
modifies_l1_thresholds=false
modifies_l2_prompt=false
upgrades_handoff_floor=false
writes_durable_bad_seed=false
writes_pool_decisions_jsonl=false
```

Result:

```text
Current L3 still does the same thing: it blocks obvious bad work orders and
passes the pass-like semantic traps. The observer caught all 3180 L3 false
passes in this run, without changing the gate result.

This is a good warning signal, not enough proof for a blocking rule. The missing
measurement is clean-sample false positives. Before making the observer a real
gate, replay it against true clean/near-pass work orders and quantify how often
it would wrongly stop useful work.
```

## Real L2 Shell Semantic Pressure Report 2026-05-20

This is the stricter version of the synthetic_bad test. It does not use missing
fields as the main target. It starts from stored L2 drafts that pass the current
local gate, then changes only the meaning while keeping the L2 shell complete.

Artifacts:

- `runs/l3-real-l2-semantic-pressure/2026-05-20T06-00-00-000Z-real-l2-semantic/real-l2-semantic-pressure.json`
- `runs/l3-real-l2-semantic-pressure/2026-05-20T06-00-00-000Z-real-l2-semantic/real-l2-semantic-pressure.md`
- `runs/l3-real-l2-semantic-pressure/2026-05-20T06-10-00-000Z-real-l2-semantic/real-l2-semantic-pressure.json`
- `runs/l3-real-l2-semantic-pressure/2026-05-20T06-10-00-000Z-real-l2-semantic/real-l2-semantic-pressure.md`

Strict stored-real-LLM subset:

```text
source_profile=real-llm-only
base_count=20
clean_control_count=20
bad_sample_count=100
bad_format_gate_pass_rate=1
l3_false_pass_count=100
l3_false_pass_rate=1
semantic_false_pass_caught_count=100
semantic_false_pass_recall=1
clean_semantic_false_positive_count=0
clean_semantic_false_positive_rate=0
```

Broader current-gate-passed local L2 set:

```text
source_profile=all-gate-passed-local-l2
base_count=278
stored_real_llm_base_count=20
local_replay_base_count=258
clean_control_count=278
bad_sample_count=1390
bad_format_gate_pass_count=1390
bad_format_gate_pass_rate=1
l3_false_pass_count=1390
l3_false_pass_rate=1
semantic_false_pass_caught_count=1390
semantic_false_pass_recall=1
clean_semantic_false_positive_count=0
clean_semantic_false_positive_rate=0
observer_candidate_count_2_suggestion_count=834
observer_primary_agent_suggestion_count=1390
```

Variant readout on the broader set:

```text
wrong_objective_same_l2_shell: format_pass=278/278, l3_false_pass=278/278, semantic_caught=278/278
evidence_mismatch_same_l2_shell: format_pass=278/278, l3_false_pass=278/278, semantic_caught=278/278
verification_mismatch_same_l2_shell: format_pass=278/278, l3_false_pass=278/278, semantic_caught=278/278
boundary_contradiction_same_l2_shell: format_pass=278/278, l3_false_pass=278/278, semantic_caught=278/278
anchor_stuffing_same_l2_shell: format_pass=278/278, l3_false_pass=278/278, semantic_caught=278/278
```

Boundary:

```text
llm_api_calls=0
external_api_calls=0
touches_vps=false
pushes_github=false
modifies_l1_thresholds=false
modifies_l2_prompt=false
upgrades_handoff_floor=false
writes_durable_bad_seed=false
writes_pool_decisions_jsonl=false
executes_work_orders=false
```

Result:

```text
This one stands better than the earlier obvious-bad test. The bad rows keep a
valid L2 shape and still pass the current L3 gate, so the old L3 is not enough
for meaning-level mistakes.

The observer catches all tested semantic failures and has 0 false positives on
the original clean controls in this replay. Keep it observe-only for now. It is
good enough to warn and suggest primary_agent review, but not enough yet to
become a hard blocker without another clean/near-pass corpus and less templated
bad examples.
```

## Semantic Observation Boundary Hardening 2026-05-20

Pro review's main recommendation is now reflected in the local observer shape:
the semantic layer is a record-only warning sensor, not a second formal gate.
It runs after L3 passes, records warnings, and writes recommendation-only fields.
It does not execute count2, does not route to primary_agent, and does not mutate
the old L3 result or the existing green/yellow/red quality audit pools.

Current local observer fields:

```text
semantic_observer_mode=record_only
schema_version=misa.l3_semantic_observation.v2
semantic_recommended_actions=[...]
recommendation_only=true
recommendation_executed=false
formal_gate_mutated=false
legacy_quality_pool_mutated=false
lifecycle_budget.used_count2=true|false
lifecycle_budget.used_l3_recheck=true|false
lifecycle_budget.recommended_terminal_route=primary_agent_review_suggested|null
```

Recommendation split:

```text
count2 recommendation:
  wrong_objective_on_failed_base
  evidence_claim_conflicts_with_failed_base
  verification_does_not_prove_claim
  only if lifecycle_budget.used_count2=false

primary_agent recommendation:
  boundary_words_conflict_with_requested_outcome
  anchor_stuffing_without_real_work
  any count2-shaped warning after count2 was already used
```

Updated report paths:

```text
runs/l3-synthetic-bad-pressure/2026-05-20T07-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json
runs/l3-real-l2-semantic-pressure/2026-05-20T07-20-00-000Z-real-l2-semantic/real-l2-semantic-pressure.json
```

Updated quant readout:

```text
synthetic_bad_massive:
  semantic_warning_candidate_count=3180
  observer_candidate_count_2_suggestion_count=1908
  observer_primary_agent_suggestion_count=1272
  observer_recommendation_executed_count=0
  observer_formal_gate_mutation_count=0

real_l2_shell_all_gate_passed:
  clean_control_count=278
  bad_sample_count=1390
  l3_false_pass_count=1390
  semantic_false_pass_caught_count=1390
  clean_semantic_false_positive_count=0
  observer_candidate_count_2_suggestion_count=792
  observer_primary_agent_suggestion_count=598
  observer_recommendation_executed_count=0
  observer_formal_gate_mutation_count=0
  bad_semantic_budget_reason_counts={"count2_budget_already_used":42}
```

Test coverage added:

```text
node --test test/l3-synthetic-bad-pressure.test.mjs test/l3-real-l2-semantic-pressure.test.mjs

covered:
- semantic warning does not change formal gate pass/fail
- semantic recommendation is not executed
- count2 already used prevents another count2 recommendation
- primary_agent recommendation is terminal recommendation-only metadata
- synthetic_bad still avoids durable bad seed and pool-decisions.jsonl
```

Plain result:

```text
The old L3 red path still repairs L2 once. The new semantic layer does not repair
or reroute anything by itself. It only writes a warning plus a recommended next
review shape. This keeps Pro's sensor-vs-actuator boundary intact while still
making the old L3 semantic blind spot measurable.
```

## L4 High-Risk Authorization Boundary 2026-05-20

L4 now has a generic open-source authorization rule for work orders that request
external, persistent, public, credential, permission, or destructive side
effects. This is not Misa-specific and should be reusable in a public agent
handoff flow.

When L4 mock sees a requested high-risk action, it does not forward the work
order to a no-context worker. It returns:

```text
verdict=owner_needed
handoff_target=maintainer_or_owner
requires_user_authorization=true
recommended_next_step=request_user_authorization
recommendation_only=true
executes_work_order=false
```

The high-risk scopes are:

```text
repository_push_or_publish
release_or_deployment
production_or_remote_runtime
persistent_memory_or_database
public_publish
secrets_or_credentials
permission_or_access_change
destructive_delete
```

This keeps the rule simple:

```text
L3 decides whether the work order is structurally acceptable.
L4 decides whether the acceptable work order can be handed to a worker.
If the work order asks for risky external effects, L4 asks for user/maintainer
authorization first instead of silently executing or forwarding it.
```

## L1-L4 Pipeline Wiring 2026-05-20

The L1/L2/L3/L4 handoff path now has a single local pipeline command:

```text
npm run work-order:l1-l4 -- --l2-report <path-to-existing-l2-report>
```

It can also generate L2 with the existing mock provider when no `--l2-report`
is supplied, but the safer review workflow is to pass an already inspected L2
report path. The default path stays local and zero-call:

```text
L1: candidate count and handoff floor are read from the L2 report.
L2: work-order draft is the handoff artifact.
L3: formal gate and selection audit decide which rows are forwardable.
L4: mock handoff review decides target and authorization needs.
```

The compact pipeline report points to the detailed subreports:

```text
l1-l4-work-order-pipeline.json
l1-l4-work-order-pipeline.md
l2/external-trajectory-llm-work-order-draft.json
l3/quality-report.json
l3/pool-decisions.jsonl
l4/l4-review-report.json
l4/l4-review.jsonl
```

Important behavior:

```text
L3 red can still feed back to L2 once during the L2 draft run.
L4 revise/reject/human_needed/owner_needed does not auto-rerun L2.
L4 owner_needed means request explicit user/maintainer authorization before any
high-risk side effect.
```
