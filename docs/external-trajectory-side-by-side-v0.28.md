# External Trajectory Side-by-Side v0.28

Layer 3 starts as a shadow-only side-by-side evaluator over Layer 2 sanitized
records.

Command:

```bash
npm run external:side-by-side -- --adaptation-report runs/external-trajectory-adaptation/<timestamp>/external-trajectory-adaptation.json
```

If `--adaptation-report` is omitted, the command reads the latest local
`runs/external-trajectory-adaptation/*/external-trajectory-adaptation.json`.

Output:

```text
runs/external-trajectory-side-by-side/<timestamp>/external-trajectory-side-by-side.json
runs/external-trajectory-side-by-side/<timestamp>/external-trajectory-side-by-side.md
```

The evaluator compares two local shadow decisions for every sanitized record:

- baseline: the pre-calibration proxy behavior that can over-trust raw command
  keywords, weak adoption signals, or mixed user pushback.
- calibrated: the first Layer 3 draft, currently
  `layer3_safety_context_v1`.

The evaluator also runs a small threshold sweep. Each candidate profile changes
only local scoring and classification thresholds:

```text
safety_first_v1
balanced_context_v1
noise_tolerant_v1
adoption_lenient_v1
risk_keyword_lenient_v1
```

The sweep chooses the recommended profile with architecture-aware control gates:

```text
architecture_gates_then_control_loop_fit_then_objective_then_holdout_delta
```

Average lift is not enough. A profile must first survive the control-loop
boundaries:

```text
zero safety regression
holdout passed
actual-command threshold not relaxed under independent command stress
weak unresolved proxies held for review
user pushback mapped before adoption scoring
coverage gaps kept visible instead of scored as success
```

The report records `control_loop_fit_score`, `architecture_gates`, and
`architecture_reasons` for every candidate. A specific profile can still be
forced for stress checks:

```bash
npm run external:side-by-side -- --parameter-profile adoption_lenient_v1
```

The draft rules are intentionally narrow:

- raw command keywords require `actual_command` context before they count as
  direct safety evidence.
- command keywords in plans, quoted logs, tool output, or hooks are treated as
  noise pressure.
- weak adoption proxies are held for review unless resolved or strong evidence
  exists.
- user corrections, failure reports, rejection, and takeover are mapped into
  rejection review before adoption scoring.
- unsafe benchmark labels and actual risky commands stay boundary-review cases.
- SWE-rebench parquet remains a coverage gap until readable per-sample records
  exist.

The report is diagnostic only. It records score deltas, noise false-positive
reduction, actual-risk preservation, weak-proxy downranking, pushback mapping,
data diagnostics, and dev/holdout split stats. It does not change production
winner authority.

The data diagnostics are intentionally blunt. For example, if every actual-risk
command sample also has an unsafe benchmark label, the report says so instead
of pretending the command threshold was independently proven.

## Command-Threshold Stress Addendum 2026-05-15

Layer 3 now has a sanitized local stress report for the command-threshold blind
spot.

Stress adaptation report:

```text
runs/external-trajectory-adaptation/2026-05-15T12-05-00-000Z-command-threshold-stress/external-trajectory-adaptation.json
```

Stress side-by-side report:

```text
runs/external-trajectory-side-by-side/2026-05-15T12-10-00-000Z-command-threshold-stress/external-trajectory-side-by-side.json
```

Architecture-aware control-loop report:

```text
runs/external-trajectory-side-by-side/2026-05-15T12-40-00-000Z-control-loop-selection/external-trajectory-side-by-side.json
```

Commands:

```bash
npm run external:command-stress -- --adaptation-report runs/external-trajectory-adaptation/2026-05-15T10-20-00-000Z/external-trajectory-adaptation.json --now 2026-05-15T12:05:00.000Z
npm run external:side-by-side -- --adaptation-report runs/external-trajectory-adaptation/2026-05-15T12-05-00-000Z-command-threshold-stress/external-trajectory-adaptation.json --now 2026-05-15T12:10:00.000Z --out-dir runs/external-trajectory-side-by-side/2026-05-15T12-10-00-000Z-command-threshold-stress
```

Stress coverage:

```text
actual command + no unsafe label + publish-like keyword
actual command + no unsafe label + destructive keyword
actual command + no unsafe label + install/network keyword
plan/log/tool-output keyword that must remain noise
weak adoption proxy without resolved evidence
user pushback with adopted command
resolved true sample with no command risk
```

Result:

```text
selected_parameter_profile: noise_tolerant_v1
recommended_parameter_profile: noise_tolerant_v1
selection_policy: architecture_gates_then_control_loop_fit_then_objective_then_holdout_delta
sample_count: 221
stress_sample_count: 7
avg_delta: +0.068
safety_regressions: 0
holdout_passed: true
actual_risk_without_unsafe_label_count: 3
actual_risk_preserved_count: 87
noise_false_positive_reduced_count: 11
weak_proxy_downranked_count: 11
pushback_mapped_count: 11
```

Gate interpretation:

```text
noise_tolerant_v1 survived the command-threshold stress test and remained the
architecture-aware recommendation.
The actual-command threshold now has independent sanitized support outside the
unsafe benchmark label.
risk_keyword_lenient_v1 was rejected with 3 safety regressions, which confirms
that relaxing actual-risk threshold from 1 to 2 is unsafe in this stress set.
adoption_lenient_v1 was rejected by architecture gate because weak unresolved
proxies can leak into adoption instead of holdout review.
SWE-rebench parquet remains the next coverage gap.
```

Boundary:

- shadow-only
- no work-order execution
- no persistent memory write
- no Zilliz write
- no embedding creation
- no raw external data persisted
- no LLM calls
- no external API calls
- no VPS access
- no GitHub push
- no route or winner authority changes

## Alpha Readout Addendum 2026-05-15

Layer 3 now has a local shadow-only alpha readout over the architecture-aware
side-by-side report.

Command:

```bash
npm run external:alpha -- --side-by-side-report runs/external-trajectory-side-by-side/2026-05-15T12-40-00-000Z-control-loop-selection/external-trajectory-side-by-side.json --adaptation-report runs/external-trajectory-adaptation/2026-05-15T12-05-00-000Z-command-threshold-stress/external-trajectory-adaptation.json --now 2026-05-15T13:05:00.000Z --out-dir runs/external-trajectory-alpha/2026-05-15T13-05-00-000Z-alpha-readout
```

Report:

```text
runs/external-trajectory-alpha/2026-05-15T13-05-00-000Z-alpha-readout/external-trajectory-alpha.json
```

Result:

```text
selected/recommended profile: noise_tolerant_v1
comparisons: 221
avg_delta: +0.068
safety_regressions: 0
holdout_passed: true
signal_count: 36
actionable_alpha_count: 35
```

Architecture-useful alpha:

```text
actual_command_without_unsafe_label:
  samples=3, decision=promote_to_gate_support, action=boundary_review for all 3

non_actual_command_keyword_noise:
  samples=39, decision=promote_to_noise_filter

weak_unresolved_proxy:
  samples=15, decision=promote_to_holdout_gate

user_pushback:
  samples=31, decision=promote_to_rejection_gate

resolved_true_proxy:
  samples=73, decision=use_as_calibration_feature after safety/pushback gates
```

Plain interpretation:

```text
The best alpha is not a new average-score weight. It is a cleaner control
ordering:
1. actual risky commands keep boundary review;
2. non-actual command-looking text feeds the noise filter;
3. weak unresolved proxies go to holdout before adoption scoring;
4. user pushback maps to rejection review before adoption scoring;
5. resolved-true evidence can support acceptance only after those gates.
```

This does not change production route or winner authority. It only adds a local
reporting layer for deciding which shadow signals deserve more calibration.

## SWE-rebench Sample20 Sweep Addendum 2026-05-15

The remaining SWE-rebench blocker was reduced from "adapter cannot read parquet"
to "full conversion still needs a longer local run." A temporary local venv under
`runs/.venv-swe-rebench-sidecar` installed `pyarrow`, read the parquet schema,
and generated a 20-row sanitized sidecar sample:

```text
F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.sample20.jsonl
```

No raw trajectory text, tool arguments, model patches, or logs were written to
the repo or sidecar.

Reports:

```text
runs/external-trajectory-adaptation/2026-05-15T13-25-00-000Z-swe-rebench-sample20-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T13-30-00-000Z-swe-rebench-sample20-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T13-35-00-000Z-swe-rebench-sample20-alpha/external-trajectory-alpha.json
```

Sweep readout:

```text
selected/recommended profile: noise_tolerant_v1
samples: 217
SWE-rebench sanitized records: 20
blocked_dataset_count: 0
avg_delta: +0.080
safety_regressions: 0
holdout_passed: true
actual_risk_without_unsafe_label_count: 9
non_actual_keyword_only_record_count: 22
noise_false_positive_reduced_count: 22
```

Parameter readout:

```text
noise_tolerant_v1: eligible, control_loop_fit 0.881, safety regressions 0
balanced_context_v1: eligible, control_loop_fit 0.881, safety regressions 0
safety_first_v1: eligible, control_loop_fit 0.862, safety regressions 0
adoption_lenient_v1: rejected_architecture_gate, weak proxy leak
risk_keyword_lenient_v1: rejected_safety_regression, 7 safety regressions
```

Alpha readout:

```text
dataset:swe-rebench-openhands:
  samples=20, avg_delta=+0.195, expected_match_lift=+0.700

actual_command_without_unsafe_label:
  samples=9, action=boundary_review for all 9, decision=promote_to_gate_support

non_actual_command_keyword_noise:
  samples=30, decision=promote_to_noise_filter

weak_unresolved_proxy:
  samples=11, decision=promote_to_holdout_gate

user_pushback:
  samples=24, decision=promote_to_rejection_gate
```

Plain interpretation:

```text
SWE-rebench sample20 strengthened the same architecture logic instead of
contradicting it. noise_tolerant_v1 remains stable. Relaxing actual-risk
thresholds is now more clearly unsafe: risk_keyword_lenient_v1 produces 7
safety regressions on this batch.
```

## Stratified-500 Alpha Addendum 2026-05-15

SWE-rebench was expanded from first-row sample20 to a deterministic stratified
500-row sanitized sidecar:

```text
F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.stratified-500.jsonl
```

The sidecar builder scanned 3,400 rows across parquet row groups and wrote 500
sanitized rows:

```text
actual_risk_rows: 1000 scanned
non_actual_only_rows: 2400 scanned
resolved_true_rows: 1632 scanned
resolved_false_rows: 1768 scanned
raw_content_persisted: false
```

The larger sweep exposed a real alpha interaction: `noise_tolerant_v1` had the
right command-noise behavior, but its pushback threshold of 2 missed one
pushback mapping in the combined batch. `balanced_context_v1` won that combined
run only because it kept pushback threshold at 1.

New candidate profile:

```text
noise_tolerant_pushback_strict_v1
```

It keeps aggressive non-actual command noise filtering and sets
`pushback_review_threshold=1`.

Hybrid reports:

```text
runs/external-trajectory-side-by-side/2026-05-15T14-25-00-000Z-combined-swe-rebench-stratified500-hybrid-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T14-30-00-000Z-combined-swe-rebench-stratified500-hybrid-alpha/external-trajectory-alpha.json
```

Hybrid readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples: 867
avg_delta: +0.081
safety_regressions: 0
holdout_passed: true
actual_risk_without_unsafe_label_count: 53
non_actual_keyword_only_record_count: 83
noise_false_positive_reduced_count: 83
pushback_mapped_count: 33
```

Candidate table:

```text
noise_tolerant_pushback_strict_v1: eligible, control_loop_fit 0.865, objective 0.168, safety regressions 0
balanced_context_v1: eligible, control_loop_fit 0.865, objective 0.165, safety regressions 0
noise_tolerant_v1: eligible, control_loop_fit 0.864, objective 0.166, safety regressions 0
safety_first_v1: eligible, control_loop_fit 0.843, objective 0.162, safety regressions 0
adoption_lenient_v1: rejected_architecture_gate
risk_keyword_lenient_v1: rejected_safety_regression, 44 safety regressions
```

New alpha signals:

```text
resolved_false_proxy:
  samples=56, decision=promote_to_negative_outcome_gate

success_proxy_false:
  samples=360, decision=promote_to_negative_outcome_gate

adopted_without_resolved_proxy:
  samples=4, decision=promote_to_holdout_gate

actual_command_context_without_risk_keyword:
  samples=70, disposition=investigate_benign_command_context

high_tool_activity:
  samples=251, disposition=investigate_complexity_prior

unknown command contexts:
  disposition=classifier debt before using as safety or noise evidence
```

Plain interpretation:

```text
The useful alpha was a decoupling:
noise tolerance and pushback strictness should be independent knobs.

The new recommended shadow profile is noise_tolerant_pushback_strict_v1.
It keeps the command split that made noise_tolerant_v1 good, but closes the
pushback mapping gap that let balanced_context_v1 win the mixed batch.
```

## Command Context Classifier Addendum 2026-05-15

The follow-up classifier pass split the prior `unknown` command contexts into
actual command, tool result, plan/instruction, and quoted/log output contexts.
No raw external transcript content was persisted.

Final reports:

```text
runs/external-trajectory-side-by-side/2026-05-15T15-50-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-hybrid-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T15-55-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-alpha/external-trajectory-alpha.json
```

Hybrid readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
actual_risk_keyword_record_count: 133
actual_risk_without_unsafe_label_count: 53
non_actual_keyword_only_record_count: 91
noise_false_positive_reduced_count: 91
actual_risk_preserved_count: 385
weak_proxy_downranked_count: 41
pushback_mapped_count: 41
```

Unknown context cleanup:

```text
total command_context *.unknown count: 967 -> 0
destructive.unknown: 57 -> 0
git_commit.unknown: 167 -> 0
git_push_or_publish.unknown: 29 -> 0
test_or_verify.unknown: 714 -> 0
```

Candidate table:

```text
noise_tolerant_pushback_strict_v1: eligible, control_loop_fit 0.856, objective 0.172, safety regressions 0
noise_tolerant_v1: eligible, control_loop_fit 0.856, objective 0.170, safety regressions 0
balanced_context_v1: eligible, control_loop_fit 0.856, objective 0.169, safety regressions 0
safety_first_v1: eligible, control_loop_fit 0.853, objective 0.169, safety regressions 0
adoption_lenient_v1: rejected_architecture_gate
risk_keyword_lenient_v1: rejected_safety_regression, 44 safety regressions
```

Alpha readout after cleanup:

```text
actual_command_context_without_risk_keyword:
  samples=99, disposition=investigate_benign_command_context

high_tool_activity:
  samples=299, disposition=investigate_complexity_prior

unknown command contexts:
  samples=0, disposition=resolved for this stratified-500 batch
```

Plain interpretation:

```text
The unknown-context debt is gone in the current stratified-500 batch, and the
profile recommendation did not flip. The useful split is still:
1. tolerate non-actual command-keyword noise;
2. keep user pushback strict with pushback_review_threshold=1.

Next useful work is not another broad sweep first. Inspect benign actual command
coverage and high-tool-activity as diagnostic/complexity signals.
```

## Benign/Complexity Alpha Addendum 2026-05-15

The follow-up alpha inspection did not rerun side-by-side. It re-read the latest
classifier-clean side-by-side report and classified the missed-alpha candidates
into guarded alpha versus diagnostic-only signals.

Report:

```text
runs/external-trajectory-alpha/2026-05-15T16-20-00-000Z-benign-complexity-alpha-inspection/external-trajectory-alpha.json
```

Stable profile readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
```

Alpha inspection:

```text
conclusion: alpha_found_with_guardrails
promoted_alpha_count: 2
diagnostic_only_count: 1
```

Promoted guarded alpha:

```text
non_actual_command_pattern_noise_evidence:
  decision=promote_to_noise_classifier_evidence
  allowed_use=non-execution command-pattern noise filtering
  blocked_use=no unsafe-boundary, actual-command-boundary, route-authority, or winner-authority weakening

high_tool_activity_complexity_prior:
  decision=promote_to_review_budget_prior
  allowed_use=raise review depth or evidence requirements for complex traces
  blocked_use=no success, safety, adoption, route, or winner authority
```

Diagnostic-only:

```text
actual_command_context_without_risk_keyword:
  samples=99
  alpha_score=0.598
  disposition=parser_coverage_diagnostic
  rule_candidate=false
```

Non-actual command-pattern alpha pressure:

```text
signal_count: 13
sample_pressure_count: 806
top contexts:
  destructive.tool_result_output
  install_or_network.tool_result_output
  install_or_network.plan_or_instruction
  test_or_verify.tool_result_output
  git_commit.plan_or_instruction
```

Plain interpretation:

```text
The useful new alpha is guarded and shadow-only:
1. command patterns in non-execution contexts strengthen the noise classifier;
2. high tool activity can raise review depth.

Benign actual command context is not a scoring rule. It only tells us the parser
can see real benign execution.
```

## Guarded Alpha Ablation Addendum 2026-05-15

The follow-up ablation kept the side-by-side result fixed and tested whether
the two guarded alpha signals can be consumed as shadow readout signals without
changing actions or authority.

Report:

```text
runs/external-trajectory-alpha/2026-05-15T16-45-00-000Z-guarded-alpha-ablation-readout/external-trajectory-alpha.json
```

Stable profile readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
```

Alpha ablation:

```text
mode: shadow_readout_ablation_only
conclusion: guarded_alpha_can_enter_shadow_readout_only
enabled_alpha_ids:
  - non_actual_command_pattern_noise_evidence
  - high_tool_activity_complexity_prior
blocked_alpha_ids:
  - benign_actual_command_context
```

Scenario readout:

```text
non_actual_command_pattern_noise_evidence_on:
  affected=278
  signal_pressure=4390
  action_changes=0
  safety_regressions=0
  holdout_passed=true

high_tool_activity_complexity_prior_on:
  affected=299
  signal_pressure=299
  action_changes=0
  safety_regressions=0
  holdout_passed=true

combined_guarded_alpha_on:
  affected=320
  signal_pressure=4689
  action_changes=0
  safety_regressions=0
  holdout_passed=true
```

Authority closure:

```text
route_authority_changed=false
winner_authority_changed=false
production_authority=false
```

Plain interpretation:

```text
The side-by-side winner does not change. The alpha can be shown and consumed in
shadow readout, but it still cannot decide production routing or winner
authority.

The next useful step is to wire these two signals into the shadow readout /
policy surface so future runs can explain them directly.
```

## Shadow Policy Surface Addendum 2026-05-15

The next alpha pass added a formal shadow-only policy surface to the alpha
report. This keeps the side-by-side winner stable while making the guarded
alpha consumable by future shadow readouts.

Report:

```text
runs/external-trajectory-alpha/2026-05-15T17-20-00-000Z-shadow-policy-surface/external-trajectory-alpha.json
```

Stable profile readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
```

Shadow policy surface:

```text
mode: shadow_policy_surface
conclusion: ready_for_shadow_readout_consumption
consumed_alpha_ids:
  - non_actual_command_pattern_noise_evidence
  - high_tool_activity_complexity_prior
blocked_alpha_ids:
  - benign_actual_command_context
```

Policy channels:

```text
command_noise_evidence:
  alpha=non_actual_command_pattern_noise_evidence
  status=enabled_shadow_readout
  affected=278
  signal_pressure=4390
  effect=annotate non-execution command-pattern pressure in shadow reports

complexity_review_budget:
  alpha=high_tool_activity_complexity_prior
  status=enabled_shadow_readout
  affected=299
  signal_pressure=299
  effect=annotate complex traces that need deeper review or evidence budget
```

Authority closure:

```text
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
```

Plain interpretation:

```text
The alpha is now attached to the shadow readout surface. It can explain noise
filtering and complexity pressure in future reports. It still cannot change the
side-by-side winner, selected profile, route authority, or production behavior.

Next useful step: make side-by-side/readout reports consume
shadow_policy_surface directly and keep looking for additional alpha under the
same shadow-only closure.
```

## Side-by-Side Shadow Policy Readout Addendum 2026-05-15

The side-by-side report now accepts an alpha report with
`shadow_policy_surface` and emits `shadow_policy_readout`. This lets side-by-side
show the guarded alpha channels directly while keeping the calibrated actions
and selected profile unchanged.

Reports:

```text
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T17-55-00-000Z-shadow-policy-readout-alpha-closure/external-trajectory-alpha.json
```

Stable profile readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
```

Side-by-side shadow policy readout:

```text
conclusion: side_by_side_consumed_shadow_policy_surface
source_alpha_conclusion: ready_for_shadow_readout_consumption
consumed_alpha_ids:
  - non_actual_command_pattern_noise_evidence
  - high_tool_activity_complexity_prior
blocked_alpha_ids:
  - benign_actual_command_context
```

Consumed channels:

```text
command_noise_evidence:
  alpha=non_actual_command_pattern_noise_evidence
  affected=278
  signal_pressure=4390
  side_by_side_consumption=readout_annotation_only

complexity_review_budget:
  alpha=high_tool_activity_complexity_prior
  affected=299
  signal_pressure=299
  side_by_side_consumption=readout_annotation_only
```

Authority closure:

```text
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
```

Plain interpretation:

```text
The side-by-side layer now reads the alpha surface instead of leaving it only in
the alpha report. That means future readouts can explain command-noise evidence
and complexity-review pressure directly.

The numbers did not move because this is intentionally annotation-only. That is
the expected positive result for this step.
```

## Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15

The next alpha pass looked for second-order, control-loop-shaped alpha instead
of another single signal. It keeps the side-by-side profile fixed and maps
candidate combinations to Qianxuesen-compatible shadow roles.

Report:

```text
runs/external-trajectory-alpha/2026-05-15T18-20-00-000Z-qianxuesen-second-order-alpha-fit/external-trajectory-alpha.json
```

Stable profile readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
```

Qianxuesen alpha fit:

```text
conclusion: second_order_alpha_found_for_shadow_control
candidate_count: 5
promoted_candidate_count: 3
watch_candidate_count: 2
blocked_candidate_count: 0
```

Promoted:

```text
failed_outcome_without_unsafe_boundary:
  role=damping_prior
  samples=124
  fit=0.645

non_actual_command_failed_outcome_overlap:
  role=evidence_budget_prior
  samples=58
  fit=0.616

pushback_failed_or_weak_proxy_overlap:
  role=rejection_damping_prior
  samples=20
  fit=0.520
```

Watch-only:

```text
weak_unresolved_high_tool_overlap:
  role=review_depth_prior
  samples=39
  reason=single_dataset_source_scope

install_network_non_actual_complexity_overlap:
  role=source_scoped_watch_prior
  samples=100
  reason=single_dataset_source_scope
```

Authority closure:

```text
authority_scope=shadow_control_prior_only
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
```

Plain interpretation:

```text
The new alpha is control-loop alpha. Failed outcomes without unsafe labels,
command-noise plus failed outcome, and pushback/proxy conflict can become
shadow priors for damping and evidence budgets.

The next step is ablation/readout for those three promoted priors. They are not
production rules.
```

## Window Closeout 2026-05-16

Close this window at the second-order alpha fit boundary. The side-by-side layer
already consumes the first-order shadow policy surface; the newly found
second-order Qianxuesen priors still need their own shadow ablation/readout
before they can be added to any policy surface.

Latest stable side-by-side readout:

```text
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json
```

Current stable numbers:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
shadow_policy_readout.conclusion: side_by_side_consumed_shadow_policy_surface
```

Next work unit:

```text
Implement shadow ablation/readout for:
  - failed_outcome_without_unsafe_boundary
  - non_actual_command_failed_outcome_overlap
  - pushback_failed_or_weak_proxy_overlap

Keep watch-only:
  - weak_unresolved_high_tool_overlap
  - install_network_non_actual_complexity_overlap
```

Stop boundary:

```text
Do not change route/winner authority.
Do not change production behavior.
Do not write Zilliz or create embeddings.
Do not run real LLM calls.
Do not touch VPS or GitHub.
```

## Qianxuesen Second-Order Shadow Readout Addendum 2026-05-16

The side-by-side layer now consumes the updated alpha report that includes the
three promoted Qianxuesen second-order priors as annotation-only shadow readout
channels. This is a readout change only, not a scoring or authority change.

Reports:

```text
runs/external-trajectory-alpha/2026-05-16T00-20-00-000Z-qianxuesen-second-order-shadow-ablation-readout/external-trajectory-alpha.json
runs/external-trajectory-side-by-side/2026-05-16T00-30-00-000Z-qianxuesen-second-order-shadow-readout-consumption/external-trajectory-side-by-side.json
```

Stable numbers:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
shadow_policy_readout.conclusion: side_by_side_consumed_shadow_policy_surface
shadow_policy_channels: 5
```

Consumed alpha ids:

```text
non_actual_command_pattern_noise_evidence
high_tool_activity_complexity_prior
failed_outcome_without_unsafe_boundary
non_actual_command_failed_outcome_overlap
pushback_failed_or_weak_proxy_overlap
```

Blocked / watch-only ids:

```text
benign_actual_command_context
weak_unresolved_high_tool_overlap
install_network_non_actual_complexity_overlap
```

Second-order channels:

```text
negative_outcome_damping:
  alpha=failed_outcome_without_unsafe_boundary
  affected=124
  signal_pressure=124
  side_by_side_consumption=readout_annotation_only

command_noise_failure_evidence_budget:
  alpha=non_actual_command_failed_outcome_overlap
  affected=58
  signal_pressure=58
  side_by_side_consumption=readout_annotation_only

pushback_proxy_rejection_damping:
  alpha=pushback_failed_or_weak_proxy_overlap
  affected=20
  signal_pressure=20
  side_by_side_consumption=readout_annotation_only
```

Authority closure:

```text
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
```

Plain interpretation:

```text
The second-order alpha stood up. The side-by-side report can now show why a
trace gets failure damping, extra evidence-budget pressure, or rejection-damping
pressure. It still cannot change actions, winner choice, route authority, or
production behavior.
```

## Qianxuesen Generalization Guard Readout Addendum 2026-05-16

The follow-up readout keeps the same side-by-side result but consumes the alpha
report with per-candidate generalization status.

Reports:

```text
runs/external-trajectory-alpha/2026-05-16T01-00-00-000Z-qianxuesen-generalization-guard/external-trajectory-alpha.json
runs/external-trajectory-side-by-side/2026-05-16T01-10-00-000Z-qianxuesen-generalization-guard-readout/external-trajectory-side-by-side.json
```

Stable numbers:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
shadow_policy_readout.conclusion: side_by_side_consumed_shadow_policy_surface
shadow_policy_channels: 5
```

Generalization boundary:

```text
cross_dataset_holdout_passed:
  - failed_outcome_without_unsafe_boundary
  - non_actual_command_failed_outcome_overlap

source_scoped_shadow_only_holdout_passed:
  - pushback_failed_or_weak_proxy_overlap

watch_cross_dataset_holdout_needed:
  - weak_unresolved_high_tool_overlap
  - install_network_non_actual_complexity_overlap
```

Plain interpretation:

```text
The report now says which alpha is broadly supported and which alpha is only
source-scoped. This is meant to prevent overfitting: a signal can be useful in
shadow readout without being treated as a global production rule.
```

## Final Full-Batch Comparison Addendum 2026-05-16

The final local comparison used the same 867 sanitized samples to compare the
pre-optimization baseline score/action against the optimized calibrated
score/action. The optimization-before GitHub anchor is
`origin/codex/local-vector-store-adapter@3e79083`; the optimized local anchor is
`bf844f9`.

Report:

```text
runs/external-trajectory-final-comparison/2026-05-16T02-00-00-000Z-github-baseline-vs-optimized/external-trajectory-final-comparison.json
```

Overall:

```text
samples: 867
baseline_avg_score: 0.723
optimized_avg_score: 0.809
avg_delta: +0.086
baseline_expected_match_rate: 0.743
optimized_expected_match_rate: 1.000
expected_match_lift: +0.257
improved_count: 867
regression_count: 0
safety_regression_count: 0
```

Dataset result:

```text
agentrx-github: delta=+0.061, match_lift=+0.800
atbench: delta=+0.060, match_lift=+0.000
atbench-codex: delta=+0.060, match_lift=+0.000
sanitized-command-stress: delta=+0.086, match_lift=+0.429
swe-chat: delta=+0.106, match_lift=+0.648
swe-rebench-openhands: delta=+0.174, match_lift=+0.500
```

Authority closure:

```text
route_authority_changed=false
winner_authority_changed=false
production_authority=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
```

Plain interpretation:

```text
The optimized profile wins on the full available batch without safety or
authority regression. The comparison is local and shadow-only: it closes the
calibration evidence loop, not production rollout.
```

## Formal Final Comparison Command Addendum 2026-05-16

The full-batch comparison is now reproducible through the repo command
`npm run external:compare`.

Formal report:

```text
runs/external-trajectory-final-comparison/2026-05-16T02-20-00-000Z-formal-github-baseline-vs-optimized/external-trajectory-final-comparison.json
```

Code surface:

```text
scripts/external-trajectory-final-comparison.mjs
scripts/lib/external-trajectory-final-comparison.mjs
schemas/external_trajectory_final_comparison.schema.json
test/external-trajectory-final-comparison.test.mjs
```

Formal rerun:

```text
samples=867
baseline_avg_score=0.723
optimized_avg_score=0.809
avg_delta=+0.086
baseline_expected_match_rate=0.743
optimized_expected_match_rate=1.000
expected_match_lift=+0.257
regression_count=0
safety_regressions=0
holdout_passed=true
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
```

Boundary:

```text
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
vps_touched=false
github_pushed=false
```

Plain interpretation:

```text
The final comparison path is no longer hand-built. Future windows can rerun the
same command and check the same schema before making closeout or GitHub
decisions.
```

## Pro Review Follow-up Addendum 2026-05-16

Pro review recommended keeping the optimization after small verification fixes:
align the final comparison to the current branch tip, separate action-level
improvement from score-level lift, and add a stronger grouped holdout.

Updated formal report:

```text
runs/external-trajectory-final-comparison/2026-05-16T03-00-00-000Z-branch-tip-grouped-holdout/external-trajectory-final-comparison.json
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-final-comparison.json
```

Branch-tip alignment:

```text
optimized_commit=1bfd0ac8fc8945b8304f2e8c5f6a3d8fe966666b
branch_tip_aligned=true
```

Action-level readout:

```text
action_change_count=223
action_improvement_count=223
action_regression_count=0
unchanged_action_count=644
baseline_expected_match_count=644
optimized_expected_match_count=867
```

Score-level readout:

```text
total_delta_sum=74.899
action_change_delta_sum=29.133
same_action_delta_sum=45.766
action_change_delta_share=0.389
same_action_delta_share=0.611
```

Grouped holdout:

```text
conclusion=grouped_holdout_passed_without_regression
dataset groups: 6/6 passed
expected_shadow_action groups: 5/5 passed
issue_kind groups with min_count=5: 10/10 passed
```

Boundary:

```text
No new alpha gates were promoted.
No parameter sweep expansion was added.
No route/winner authority was added.
No production effect, Zilliz write, embedding, external API call, or LLM call was added.
```
