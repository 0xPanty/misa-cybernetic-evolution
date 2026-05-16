# External Trajectory Final Comparison

## Summary

- ok: true
- created_at: 2026-05-16T03:00:00.000Z
- baseline: origin/codex/local-vector-store-adapter@3e79083
- optimized: codex/local-vector-store-adapter@d4b8f577918721618307261efaa729a2366f45da
- branch_tip_commit: d4b8f577918721618307261efaa729a2366f45da
- branch_tip_aligned: true
- selected_profile: noise_tolerant_pushback_strict_v1
- samples: 867
- baseline_avg_score: 0.723
- optimized_avg_score: 0.809
- avg_delta: 0.086
- baseline_expected_match_rate: 0.743
- optimized_expected_match_rate: 1
- expected_match_lift: 0.257
- improved_count: 867
- regression_count: 0
- safety_regression_count: 0
- baseline_to_optimized_action_change_count: 223
- verdict: optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression

## Dataset Result

- agentrx-github: n=10, delta=0.061, match_lift=0.8, safety_regressions=0
- atbench: n=250, delta=0.06, match_lift=0, safety_regressions=0
- atbench-codex: n=250, delta=0.06, match_lift=0, safety_regressions=0
- sanitized-command-stress: n=7, delta=0.086, match_lift=0.429, safety_regressions=0
- swe-chat: n=250, delta=0.106, match_lift=0.648, safety_regressions=0
- swe-rebench-openhands: n=100, delta=0.174, match_lift=0.5, safety_regressions=0

## Expected Action Result

- accept_shadow_evidence: n=301, delta=0.047, match_lift=0.14, action_changes=42
- boundary_review: n=393, delta=0.085, match_lift=0.02, action_changes=8
- noise_filtered_review: n=91, delta=0.238, match_lift=1, action_changes=91
- rejection_mapping_review: n=41, delta=0.092, match_lift=1, action_changes=41
- weak_proxy_holdout: n=41, delta=0.042, match_lift=1, action_changes=41

## Action And Score Separation

- action_change_count: 223
- action_improvement_count: 223
- action_regression_count: 0
- unchanged_action_count: 644
- same_action_avg_delta: 0.071
- action_change_avg_delta: 0.131
- same_action_delta_share: 0.611
- action_change_delta_share: 0.389

## Grouped Holdout

- mode: grouped_holdout_over_sanitized_batch
- independence_level: stronger_than_hash_split_but_not_external_holdout
- conclusion: grouped_holdout_passed_without_regression
- dataset: groups=6, passed=6, failed=0, min_count=1
- expected_shadow_action: groups=5, passed=5, failed=0, min_count=1
- issue_kind: groups=10, passed=10, failed=0, min_count=5

## Qianxuesen Generalization

- failed_outcome_without_unsafe_boundary: decision=promote_to_shadow_damping_prior, generalization=cross_dataset_holdout_passed, samples=124, holdout_passed=true, action_changes=0
- non_actual_command_failed_outcome_overlap: decision=promote_to_shadow_evidence_budget_prior, generalization=cross_dataset_holdout_passed, samples=58, holdout_passed=true, action_changes=0
- weak_unresolved_high_tool_overlap: decision=watch_source_scoped_alpha, generalization=watch_cross_dataset_holdout_needed, samples=39, holdout_passed=true, action_changes=0
- pushback_failed_or_weak_proxy_overlap: decision=promote_to_shadow_rejection_damping_prior, generalization=source_scoped_shadow_only_holdout_passed, samples=20, holdout_passed=true, action_changes=0
- install_network_non_actual_complexity_overlap: decision=watch_source_scoped_alpha, generalization=watch_cross_dataset_holdout_needed, samples=100, holdout_passed=true, action_changes=0

## Boundary

- shadow_only: true
- route_authority_changed: false
- winner_authority_changed: false
- production_authority: false
- raw_external_content_persisted: false
- zilliz_written: false
- embedding_created: false
- llm_api_calls: false
- external_api_calls: false
- vps_touched: false
- github_pushed: false

## Checks

- PASS same sanitized batch is used for baseline and optimized readout
- PASS optimized readout improves average score
- PASS optimized readout has no comparison regressions
- PASS optimized readout has no safety regressions
- PASS side-by-side holdout passed
- PASS grouped holdout passed on available sanitized groups
- PASS optimized commit is aligned with current branch tip
- PASS shadow readout changed no authority
- PASS comparison has no live storage or provider effects

## Measurement Note

The GitHub baseline commit does not contain the external-trajectory evaluation harness, so the current harness is used as a neutral measurement layer: baseline action/score represents pre-optimization behavior, and calibrated action/score represents optimized behavior on the same sanitized sample batch.
