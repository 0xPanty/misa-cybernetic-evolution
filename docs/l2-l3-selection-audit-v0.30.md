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
