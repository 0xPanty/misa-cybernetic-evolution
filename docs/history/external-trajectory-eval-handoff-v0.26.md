# External Trajectory Eval Handoff v0.26

Date: 2026-05-15

This note records the current work-order evolution window so the next window can
continue without replaying the whole chat.

## Current Local State

- Branch: `codex/local-vector-store-adapter`
- Latest local commit before this note: `2953c94 Refine L2 inline review gate`
- Local branch was clean and ahead of origin by 8 commits before this note.
- No VPS work.
- No GitHub push.
- No production/live effect.

## What Was Fixed Before The Eval

The L2 LLM gate had a real logic issue:

- old shape: signal says "review-worthy", then the primary agent might approve
  a separate LLM call;
- fixed shape: review-worthy boundary cases go straight into the current primary
  agent's inline review context;
- no separate model pass is required;
- external or stronger-model mutation/crossover still requires explicit
  enablement.

Current fields:

```text
call_policy=primary_agent_inline_review
separate_llm_call_required=false
external_model_call_policy=requires_explicit_enable
llm_api_calls=0
```

This was a positive cleanup of the intervention path, not a numeric work-order
quality lift by itself.

## Important Clarification

No real LLM intervention was run in this window.

The external trajectory pass only measured and summarized local downloaded
datasets. It did not:

- ask an LLM to generate suggestions;
- accept or reject LLM suggestions;
- generate new work-order candidates from SWE-chat;
- change any winner;
- call external APIs;
- run production work.

## Downloaded External Data

Root:

```text
F:\misa-agent-datasets\agent-trajectories
```

Manifest:

```text
F:\misa-agent-datasets\agent-trajectories\download-manifest.json
```

Downloaded datasets:

- `atbench`: safety boundary samples.
- `atbench-codex`: Codex-oriented tool/workspace/repo safety samples.
- `agentrx-github`: public AgentRx fallback for failure-root-cause examples.
- `swe-rebench-openhands`: large coding replay trajectories.
- `swe-chat`: real human-agent coding collaboration sessions and transcripts.

SWE-chat was fully downloaded:

- 5,851 sessions.
- 5,850 transcript files.
- no missing transcript files.
- no size mismatches.

The HuggingFace token used in chat should be revoked.

## Offline Full Eval Output

Local eval output:

```text
runs/external-trajectory-eval/latest/external-trajectory-eval.json
runs/external-trajectory-eval/latest/external-trajectory-eval.md
```

The eval was local and read-only.

High-level coverage:

- safety boundary cases: 2,000.
- Codex rollout safety cases: 500.
- AgentRx annotated failures: 10.
- SWE-rebench coding replay trajectories: 67,074.
- SWE-chat real sessions: 5,851.
- SWE-chat parsed transcript events: 3,128,933.

Useful signals found:

- commit survival proxy exists in SWE-chat.
- session success exists in SWE-chat.
- prompt pushback exists in SWE-chat:
  - corrections;
  - failure reports;
  - rejections;
  - takeovers.
- resolved labels exist in SWE-rebench.
- safety/failure labels exist in ATBench and ATBench-Codex.
- failure-step categories exist in AgentRx fallback.

## Main Findings

1. Full perception is not required for the next test.

The current work can continue with offline external trajectories. Real-time
GitHub/Discord/VPS/Farcaster perception can wait.

2. SWE-chat is valuable but noisy.

Transcript formats are mixed:

- most are JSONL;
- some are whole-file JSON with `messages`;
- there are some malformed/non-object lines.

Any external adapter must normalize formats before scoring. Raw events must not
flow straight into learning.

3. Commit survival is only a weak adoption proxy.

A session having committed code does not prove every agent suggestion was useful.
It must be combined with:

- user correction;
- rejection;
- failure report;
- takeover;
- resolved/test proxy;
- deterministic work-order rescore.

4. Keyword risk scanning is only a first-pass signal.

Patterns like `git push`, `rm -rf`, `curl`, or install commands can appear in
plans, logs, failed outputs, or actual commands. The next adapter must classify
context before calling something unsafe.

5. The adoption loop is not implemented yet.

The data now supports it, but the current repo does not yet have a real
LLM-suggestion adoption ledger.

## Recommended Next Step

Build a thin external trajectory adapter, still shadow-only:

```text
external trajectories
-> normalized samples
-> adoption/rejection/safety/resolved proxies
-> work-order eval sample shape
-> side-by-side quality eval
```

The adapter should produce an adoption ledger:

```text
suggestion_count
adopted_count
rejected_count
effective_without_adoption_count
score_delta_after_adoption
safety_regression_after_adoption
rejection_reasons
external_success_proxy
user_pushback_proxy
```

The adoption ledger must not let an LLM grade itself. It should use deterministic
rescore plus external proxy labels.

## Do Not Add Yet

Do not add these before the side-by-side adapter result exists:

- live full-perception daemon;
- automatic external-model mutation/crossover;
- LLM self-grading authority;
- winner changes without deterministic rescore;
- raw transcript ingestion into persistent memory;
- committing raw external dataset content into this repo.

## Delete Or Simplify Later

Do not delete mechanisms yet based only on this scan.

After the external trajectory adapter runs side-by-side, remove or weaken any
mechanism that does not improve:

- average work-order quality;
- holdout quality;
- safety regression rate;
- rejection reason accuracy;
- adoption proxy quality;
- overdesign reduction.

Likely candidates to weaken if they do not prove value:

- standalone "LLM review-worthy" labels without adoption outcome;
- raw keyword-based danger counters as final safety evidence;
- treating commit survival as a strong adoption signal.

## Plain Verdict

This window was positive as evidence gathering and architecture calibration.

It did not prove that LLM intervention improves work-order quality, because no
LLM intervention was run.

It did prove that the downloaded external trajectories are large and rich enough
to support the next strong test: an adoption-ledger adapter with side-by-side
work-order quality scoring.

## Layer Plan

There are five layers in this validation track.

Layer 1 is data inventory and signal scouting. It is complete.

Purpose:

```text
Check what data exists, how large it is, whether it has adoption/rejection/
failure/resolved/safety signals, and how noisy the raw formats are.
```

Result:

```text
The data is useful and large enough, but noisy. It must not flow directly into
learning or work-order scoring.
```

Layer 2 is external trajectory adaptation. This is the immediate next step.

Purpose:

```text
Take one external sample at a time, normalize it into project-native records,
and record what the current baseline gets right or wrong. Do not change logic
during this run.
```

The adapter should output:

```text
work_order_sample
adoption_ledger_sample
rejection_reason_sample
safety_boundary_sample
resolved_proxy_sample
```

Layer 3 is parameter calibration.

Purpose:

```text
After Layer 2 accumulates enough records, tune weights and thresholds based on
repeated evidence, not single samples.
```

Likely calibration targets:

```text
commit_survival weight
resolved weight
session_success weight
correction/rejection/takeover negative weights
safety regression penalty
overdesign penalty
source refs / acceptance / forbidden scope / stop condition weights
LLM intervention threshold
```

Layer 4 is side-by-side rerun.

Purpose:

```text
Run the same adapted sample set with the old baseline and the calibrated version.
Keep only changes that improve quality or safety without adding waste.
```

Required comparison fields:

```text
avg_delta
holdout_delta
safety_regressions
positive_lift_rate
adoption_proxy_accuracy
rejection_reason_accuracy
overdesign_reduction
llm_api_calls
external_api_calls
```

Layer 5 is real LLM intervention validation.

Purpose:

```text
Only after the adapter and deterministic calibration are stable, compare
zero-call baseline vs controlled LLM suggestions.
```

LLM intervention is only positive if:

```text
the suggestion is adopted or usefully rejected;
deterministic rescore improves or protects safety;
no safety regression appears;
the adoption ledger shows less waste than the baseline.
```

## Layer 1 Quant Summary

Downloaded data has already been inventoried and scanned locally.

```text
ATBench: 1,500 safety samples
ATBench-Codex: 500 Codex safety rollout samples
AgentRx GitHub fallback: 18 trajectory files / 10 annotated failures
SWE-rebench OpenHands: 67,074 coding replay trajectories
SWE-chat: 5,851 sessions / 5,850 transcripts
```

SWE-chat full download status:

```text
transcripts downloaded: 5,850 / 5,850
missing files: 0
size mismatch: 0
```

Layer 1 offline eval output:

```text
runs/external-trajectory-eval/latest/external-trajectory-eval.json
runs/external-trajectory-eval/latest/external-trajectory-eval.md
```

Layer 1 parsed coverage:

```text
safety_boundary_cases: 2,000
codex_rollout_cases: 500
failure_root_cause_cases: 10
real_collaboration_sessions: 5,851
real_transcript_events: 3,128,933
coding_replay_trajectories: 67,074
resolved_proxy_count: 32,161
commit_survival_proxy_count: 5,392
```

SWE-chat useful proxy signals:

```text
commit survival exists but is weak by itself
session success exists
prompt correction exists
failure report exists
rejection exists
takeover exists
tool-call/action/research counts exist
```

SWE-chat format noise:

```text
JSONL transcript files: 5,167
whole-file JSON transcript files: 683
malformed/noisy lines still exist
non-object events exist
```

This is the main reason Layer 2 must be an adapter/normalizer before any
project-level scoring.

## Layer 2 Baseline Rule

The next run should fix the current repo version as baseline.

Do:

```text
run one external sample;
normalize it;
record work-order/adoption/safety/rejection fields;
do not change logic;
run the next sample;
repeat until the selected batch is done;
then analyze the accumulated issue clusters.
```

Do not:

```text
fix one sample immediately;
change weights mid-run;
let one odd sample drive a mechanism;
turn on real LLM calls;
connect live perception;
write raw external data into git.
```

The point is to avoid overfitting. Same version, same rules, many samples, then
one grouped calibration.

## Next Window Recovery Phrase

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution，先读 docs/history/external-trajectory-eval-handoff-v0.26.md。
当前最新本地 commit 应为 c3363ab Add external trajectory eval handoff，先用 git status/log 确认。
SWE-chat / SWE-rebench / ATBench / ATBench-Codex / AgentRx 已完成 Layer 1 离线统计。
下一步直接做 Layer 2：external trajectory adapter + adoption ledger。
固定当前版本当 baseline，一条样本一条记录，只累计问题，不边跑边改。
仍然 shadow-only：不接全量感知、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据。
跑完一批后再统一做参数校正和 side-by-side。
```

## Interview-Level Positioning

If all five layers land and the LLM intervention test proves positive, this repo
can be framed as:

```text
a control-theoretic learning and evaluation layer for autonomous coding agents
```

Its strongest claim is not "it calls LLMs". Its strongest claim is:

```text
agent improvement is treated as a measurable control loop:
observe, normalize, generate candidates, score, reject or adopt, hold out,
rescore, and only then preserve experience.
```

## Current Progress Addendum 2026-05-15

This section supersedes the old recovery phrase above for the external
trajectory lane. Keep the old section as historical context only.

Current local git shape:

```text
branch: codex/local-vector-store-adapter
current HEAD observed during this window: 1fbe746 Add Hermes work-order pipeline
external trajectory baseline used for reports: a3f6cfb Expand external trajectory eval handoff
working tree: dirty with uncommitted Layer 2 / Layer 3 external trajectory files
```

Boundary still in force:

```text
shadow-only
no VPS
no GitHub push
no real LLM
no external API
no Zilliz write
no embedding creation
no persistent memory write
no raw external data committed
no route or winner authority changes
```

Layer 2 is now implemented locally:

```text
script: npm run external:adapt
library: scripts/lib/external-trajectory-adapter.mjs
schema: schemas/external_trajectory_adaptation.schema.json
doc: docs/history/external-trajectory-adapter-v0.27.md
```

Main Layer 2 batch:

```text
report: runs/external-trajectory-adaptation/2026-05-15T10-20-00-000Z/external-trajectory-adaptation.json
baseline_commit: a3f6cfb
sample_count: 214
datasets: ATBench 60, ATBench-Codex 60, AgentRx 10, SWE-chat 84
blocked gap: SWE-rebench parquet reader not available
```

Layer 3 side-by-side is now implemented locally:

```text
script: npm run external:side-by-side
library: scripts/lib/external-trajectory-side-by-side.mjs
schema: schemas/external_trajectory_side_by_side.schema.json
doc: docs/history/external-trajectory-side-by-side-v0.28.md
```

Latest Layer 3 parameter-sweep report:

```text
report: runs/external-trajectory-side-by-side/2026-05-15T11-35-00-000Z/external-trajectory-side-by-side.json
selected_parameter_profile: noise_tolerant_v1
baseline_avg_score: 0.736
calibrated_avg_score: 0.803
avg_delta: +0.067
safety_regressions: 0
holdout_passed: true
overfit_gap: 0.001
noise_false_positive_reduced: 10
actual_risk_preserved: 84
weak_proxy_downranked: 10
pushback_mapped: 10
```

Important data diagnosis:

```text
actual_risk_keyword_record_count: 22
actual_risk_without_unsafe_label_count: 0
actual_risk_confounded_with_unsafe_label_count: 22
non_actual_keyword_only_record_count: 10
weak_unresolved_proxy_record_count: 14
pushback_record_count: 30
resolved_true_record_count: 70
blocked_coverage_issue_count: 1
```

Plain interpretation:

```text
The route is still positive, and the current calibration improves the measured
batch without safety regression. But the actual-command threshold is not proven
independently yet, because every actual-risk command record in this batch also
has an unsafe label. The next window should pressure-test that blind spot before
calling the command threshold stable.
```

## Next Window Step Granularity

The next window should stay narrow. Do not start Zilliz, SWE-rebench, commit,
push, or VPS work unless explicitly redirected.

Step 1: confirm local state.

```bash
git status --short --branch
git log -5 --oneline --decorate
```

Expected shape:

```text
current HEAD may be 1fbe746
external trajectory baseline remains a3f6cfb
working tree may contain the uncommitted Layer 2 / Layer 3 files listed above
```

Step 2: read only the current lane files.

```text
docs/history/external-trajectory-eval-handoff-v0.26.md
docs/history/external-trajectory-adapter-v0.27.md
docs/history/external-trajectory-side-by-side-v0.28.md
runs/external-trajectory-side-by-side/2026-05-15T11-35-00-000Z/external-trajectory-side-by-side.json
```

Step 3: inspect the blind spot before editing.

```text
Look at summary.data_diagnostics.
Confirm actual_risk_without_unsafe_label_count is still 0.
Confirm the current selected profile is noise_tolerant_v1.
```

Step 4: add command-threshold stress coverage.

Preferred shape:

```text
Add sanitized fixture stress samples for actual_command risk cases that do not
depend on unsafe benchmark labels.
```

The stress set should include at least:

```text
actual command + no unsafe label + publish-like keyword
actual command + no unsafe label + destructive keyword
actual command + no unsafe label + install/network keyword
plan/log/tool-output keyword that must remain noise
weak adoption proxy without resolved evidence
user pushback with adopted command
resolved true sample with no command risk
```

Do not include raw external transcripts. Use sanitized fixture-style records or
sample summaries only.

Step 5: rerun parameter sweep.

```bash
npm run external:side-by-side -- --adaptation-report runs/external-trajectory-adaptation/2026-05-15T10-20-00-000Z/external-trajectory-adaptation.json
```

If a separate stress fixture/report is added, run the side-by-side evaluator on
that artifact too.

Step 6: judge the result with these gates.

```text
safety_regressions must stay 0
holdout_passed must stay true
actual_risk_without_unsafe_label_count must become > 0 in the stress report
actual-risk samples without unsafe labels must still map to boundary_review
noise-only keyword samples must map to noise_filtered_review
weak unresolved proxy should not become direct adoption
pushback should map to rejection_mapping_review
```

Step 7: verify locally.

```bash
npm test -- --test-name-pattern "external trajectory"
npm run validate:schemas -- --json
npm test
```

Step 8: stop and summarize.

```text
Report the new selected/recommended parameter profile.
Say whether noise_tolerant_v1 survived the stress test.
Say whether the command threshold is now independently supported.
Say whether SWE-rebench parquet remains the next coverage gap.
Do not move into Zilliz or VPS in the same window unless explicitly asked.
```

## Updated Next Window Recovery Phrase

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Current Progress Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md。
用 git status/log 确认当前本地状态；注意 HEAD 可能是 1fbe746，但 external trajectory baseline 固定用 a3f6cfb。
最新 Layer 3 sweep 报告是 runs/external-trajectory-side-by-side/2026-05-15T11-35-00-000Z/external-trajectory-side-by-side.json。
当前推荐参数档是 noise_tolerant_v1，平均提升 +0.067，安全回退 0，但 actual_risk_without_unsafe_label_count=0。
下一步只做命令阈值压测：补 sanitized actual_command-without-unsafe-label stress samples，重跑 parameter sweep，确认安全回退仍为 0。
仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产规则。
跑完只输出报告、测试结果和下一步判断。
```

## Command-Threshold Stress Addendum 2026-05-15

This section supersedes the stress-step recovery phrase above. The command
threshold stress step has now been completed locally.

Generated sanitized stress adaptation report:

```text
runs/external-trajectory-adaptation/2026-05-15T12-05-00-000Z-command-threshold-stress/external-trajectory-adaptation.json
```

Generated stress side-by-side report:

```text
runs/external-trajectory-side-by-side/2026-05-15T12-10-00-000Z-command-threshold-stress/external-trajectory-side-by-side.json
```

Stress sample coverage:

```text
sanitized stress records added: 7
actual command + no unsafe label + publish-like keyword
actual command + no unsafe label + destructive keyword
actual command + no unsafe label + install/network keyword
plan/log/tool-output keyword that must remain noise
weak adoption proxy without resolved evidence
user pushback with adopted command
resolved true sample with no command risk
```

Stress sweep result:

```text
baseline_commit: a3f6cfb
selected_parameter_profile: noise_tolerant_v1
recommended_parameter_profile: noise_tolerant_v1
sample_count: 221
comparison_count: 221
avg_baseline_score: 0.735
avg_calibrated_score: 0.802
avg_delta: +0.068
safety_regressions: 0
holdout_passed: true
actual_risk_without_unsafe_label_count: 3
actual_risk_confounded_with_unsafe_label_count: 22
noise_false_positive_reduced_count: 11
actual_risk_preserved_count: 87
weak_proxy_downranked_count: 11
pushback_mapped_count: 11
```

Parameter readout:

```text
noise_tolerant_v1: eligible, objective 0.152, safety regressions 0
balanced_context_v1: eligible, objective 0.152, safety regressions 0
safety_first_v1: eligible, objective 0.149, safety regressions 0
adoption_lenient_v1: eligible, objective 0.147, safety regressions 0
risk_keyword_lenient_v1: rejected_safety_regression, safety regressions 3
```

Plain interpretation:

```text
noise_tolerant_v1 survived the stress test.
The actual-command threshold now has independent sanitized support outside the
unsafe benchmark label.
This is enough to keep the command threshold for the current shadow-only
calibration gate. It is not a reason to start production authority.
SWE-rebench parquet remains the next coverage gap.
```

Updated next-step boundary:

```text
Do not repeat the command-threshold stress unless the evaluator changes.
Next useful work is coverage expansion, especially SWE-rebench parquet or a
public-safe JSONL sidecar.
Still no Zilliz, embedding creation, real LLM, VPS, GitHub push, raw external
data commit, route change, or winner authority change unless explicitly
redirected.
```

## Architecture-Aware Sweep Addendum 2026-05-15

This window tightened Layer 3 from a raw parameter sweep into a control-loop
selector.

New selection policy:

```text
architecture_gates_then_control_loop_fit_then_objective_then_holdout_delta
```

What changed:

```text
average score is no longer enough;
safety regression and holdout still gate first;
actual-command threshold cannot be relaxed once independent command-stress
samples exist;
weak unresolved adoption proxies must stay in holdout review;
user pushback must map to rejection review before adoption scoring;
coverage gaps stay visible through a coverage-complete gate and fit penalty.
```

New architecture-aware report:

```text
runs/external-trajectory-side-by-side/2026-05-15T12-40-00-000Z-control-loop-selection/external-trajectory-side-by-side.json
```

Readout:

```text
noise_tolerant_v1: eligible, control_loop_fit 0.875, safety regressions 0
balanced_context_v1: eligible, control_loop_fit 0.875, safety regressions 0
safety_first_v1: eligible, control_loop_fit 0.761, safety regressions 0
adoption_lenient_v1: rejected_architecture_gate, weak proxy leak
risk_keyword_lenient_v1: rejected_safety_regression, 3 safety regressions
selected/recommended: noise_tolerant_v1
```

SWE-rebench adapter update:

```text
The adapter now supports a sanitized JSONL sidecar for SWE-rebench OpenHands:
F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.jsonl
```

Important local environment finding:

```text
The current SWE-rebench directory has trajectories.parquet only.
No sanitized sidecar exists yet.
pyarrow, fastparquet, and duckdb are not installed in the current Python
environment, so this window did not convert the 2GB parquet file.
```

Plain interpretation:

```text
The algorithm is now more aligned with the Qianxuesen/control-loop architecture:
it selects profiles by safety dominance, proxy hygiene, pushback handling, and
coverage honesty before comparing average lift.
SWE-rebench is no longer a code-shape blocker if a sanitized sidecar is present;
the remaining blocker is data conversion/runtime dependency, not the adapter
contract.
```

## Alpha Readout Addendum 2026-05-15

This window added a shadow-only alpha readout on top of the architecture-aware
side-by-side report.

New command:

```text
npm run external:alpha
```

New files:

```text
script: npm run external:alpha
library: scripts/lib/external-trajectory-alpha.mjs
schema: schemas/external_trajectory_alpha.schema.json
test: test/external-trajectory-alpha.test.mjs
```

Generated report:

```text
runs/external-trajectory-alpha/2026-05-15T13-05-00-000Z-alpha-readout/external-trajectory-alpha.json
```

Command used:

```text
npm run external:alpha -- --side-by-side-report runs/external-trajectory-side-by-side/2026-05-15T12-40-00-000Z-control-loop-selection/external-trajectory-side-by-side.json --adaptation-report runs/external-trajectory-adaptation/2026-05-15T12-05-00-000Z-command-threshold-stress/external-trajectory-adaptation.json --now 2026-05-15T13:05:00.000Z --out-dir runs/external-trajectory-alpha/2026-05-15T13-05-00-000Z-alpha-readout
```

Readout:

```text
baseline_commit: a3f6cfb
selected/recommended profile: noise_tolerant_v1
comparisons: 221
avg_delta: +0.068
safety_regressions: 0
holdout_passed: true
signal_count: 36
actionable_alpha_count: 35
```

Architecture-useful alpha signals:

```text
actual_command_without_unsafe_label:
  samples=3
  decision=promote_to_gate_support
  interpretation=actual risky command threshold should stay at 1 in shadow

non_actual_command_keyword_noise:
  samples=39
  decision=promote_to_noise_filter
  interpretation=plan/log/tool-output command-looking text is useful noise alpha

weak_unresolved_proxy:
  samples=15
  decision=promote_to_holdout_gate
  interpretation=weak adoption evidence should not become winner authority

user_pushback:
  samples=31
  decision=promote_to_rejection_gate
  interpretation=correction/failure/rejection/takeover must be mapped before adoption scoring

resolved_true_proxy:
  samples=73
  decision=use_as_calibration_feature
  interpretation=positive evidence only after safety, weak-proxy, and pushback gates
```

Plain interpretation:

```text
The main alpha is control ordering, not a single bigger coefficient.
noise_tolerant_v1 remains stable, but the useful optimization logic is:
actual risky commands protect the boundary;
non-actual command keywords reduce false positives;
weak unresolved proxies and user pushback are gates before adoption;
resolved true can support acceptance only after those gates are clean.
```

Boundary:

```text
shadow-only
no Zilliz write
no embedding creation
no real LLM call
no external API call
no VPS touch
no GitHub push
no raw external data persisted
no production route or winner-authority change
```

## SWE-rebench Sample20 Coverage Addendum 2026-05-15

This window also pushed the SWE-rebench coverage gap forward without doing a
full 2GB conversion.

Local parquet finding:

```text
path: F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\trajectories.parquet
rows: 67,074
row_groups: 17
columns: trajectory_id, instance_id, repo, trajectory, tools, model_patch, exit_status, resolved, gen_tests_correct, pred_passes_gen_tests
```

Temporary dependency boundary:

```text
created local venv: runs\.venv-swe-rebench-sidecar
installed: pyarrow
system Python was not modified
```

New sidecar builder:

```text
scripts/external-trajectory-swe-rebench-sidecar.py
```

Sample sidecar generated:

```text
F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.sample20.jsonl
```

The sidecar contains only compact counters and proxy fields. It does not persist
trajectory text, tool arguments, model patches, or raw logs.

Reports:

```text
runs/external-trajectory-adaptation/2026-05-15T13-25-00-000Z-swe-rebench-sample20-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T13-30-00-000Z-swe-rebench-sample20-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T13-35-00-000Z-swe-rebench-sample20-alpha/external-trajectory-alpha.json
```

Readout:

```text
baseline_commit: a3f6cfb
sample_count: 217
SWE-rebench sanitized records: 20
blocked_dataset_count: 0
selected/recommended profile: noise_tolerant_v1
avg_delta: +0.080
safety_regressions: 0
holdout_passed: true
actual_risk_without_unsafe_label_count: 9
non_actual_keyword_only_record_count: 22
noise_false_positive_reduced_count: 22
```

Parameter sweep:

```text
noise_tolerant_v1: eligible, control_loop_fit 0.881, objective 0.157, safety regressions 0
balanced_context_v1: eligible, control_loop_fit 0.881, objective 0.155, safety regressions 0
safety_first_v1: eligible, control_loop_fit 0.862, objective 0.153, safety regressions 0
adoption_lenient_v1: rejected_architecture_gate, weak proxy leak
risk_keyword_lenient_v1: rejected_safety_regression, 7 safety regressions
```

Alpha signal:

```text
SWE-rebench sample20 itself:
  samples=20
  avg_delta=+0.195
  expected_match_lift=+0.700

actual_command_without_unsafe_label:
  samples=9
  decision=promote_to_gate_support
  all 9 stayed boundary_review

non_actual_command_keyword_noise:
  samples=30
  decision=promote_to_noise_filter

weak_unresolved_proxy:
  samples=11
  decision=promote_to_holdout_gate

user_pushback:
  samples=24
  decision=promote_to_rejection_gate
```

Plain interpretation:

```text
SWE-rebench sample20 did not weaken the previous conclusion. It strengthened
the command-context split: real risky commands keep boundary review; non-actual
command-looking text is a noise-filter alpha; weak unresolved proxies and user
pushback remain gates before adoption scoring.

noise_tolerant_v1 remains the recommended shadow profile. The command threshold
now has more independent support, and relaxing it is more clearly unsafe.
```

Next useful step:

```text
Either run a larger sanitized SWE-rebench sidecar conversion, or add a
stratified sidecar sampler so the next run is not first-row-group biased.
Keep the same shadow-only boundary unless explicitly redirected.
```

## Stratified-500 Alpha Addendum 2026-05-15

This window followed the larger-sample path and added a stratified SWE-rebench
sidecar sampler plus a missed-alpha radar.

New/updated files:

```text
scripts/external-trajectory-swe-rebench-sidecar.py
scripts/lib/external-trajectory-alpha.mjs
scripts/lib/external-trajectory-side-by-side.mjs
schemas/external_trajectory_alpha.schema.json
test/external-trajectory-alpha.test.mjs
test/external-trajectory-side-by-side.test.mjs
```

Stratified sidecar:

```text
F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.stratified-500.jsonl
```

Sidecar generation:

```text
scanned rows: 3,400
written rows: 500
actual_risk_rows scanned: 1,000
non_actual_only_rows scanned: 2,400
resolved_true_rows scanned: 1,632
resolved_false_rows scanned: 1,768
raw_content_persisted: false
```

Key reports:

```text
runs/external-trajectory-adaptation/2026-05-15T14-06-00-000Z-combined-swe-rebench-stratified500-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T14-25-00-000Z-combined-swe-rebench-stratified500-hybrid-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T14-30-00-000Z-combined-swe-rebench-stratified500-hybrid-alpha/external-trajectory-alpha.json
```

Main result:

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

What changed:

```text
noise_tolerant_v1 remained safe, but its pushback_review_threshold=2 missed one
combined-batch pushback mapping.
balanced_context_v1 handled pushback better, but had weaker noise scoring.
The useful alpha is to decouple those knobs.
```

New candidate profile:

```text
noise_tolerant_pushback_strict_v1:
  actual_risk_keyword_threshold=1
  non_actual_noise_threshold=1
  pushback_review_threshold=1
  weak_proxy_policy=holdout_unresolved
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

Missed-alpha radar findings:

```text
resolved_false_proxy:
  samples=56
  decision=promote_to_negative_outcome_gate

success_proxy_false:
  samples=360
  decision=promote_to_negative_outcome_gate

adopted_without_resolved_proxy:
  samples=4
  decision=promote_to_holdout_gate

actual_command_context_without_risk_keyword:
  samples=70
  disposition=investigate_benign_command_context

high_tool_activity:
  samples=251
  disposition=investigate_complexity_prior

unknown command contexts:
  disposition=classifier debt before using as safety or noise evidence
```

Plain interpretation:

```text
The best alpha was not a dataset-specific weight. It was separating two
control dimensions that were accidentally coupled:
1. tolerate non-actual command-keyword noise;
2. stay strict on user pushback.

The current recommended shadow profile is now
noise_tolerant_pushback_strict_v1.
```

## Next Window Recovery Phrase 2026-05-15

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先只读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Stratified-500 Alpha Addendum 2026-05-15 和 Next Window Recovery Phrase 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Stratified-500 Alpha Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

当前最新推荐 shadow profile 已从 noise_tolerant_v1 升级为 noise_tolerant_pushback_strict_v1。
最新关键报告：
runs/external-trajectory-adaptation/2026-05-15T14-06-00-000Z-combined-swe-rebench-stratified500-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T14-25-00-000Z-combined-swe-rebench-stratified500-hybrid-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T14-30-00-000Z-combined-swe-rebench-stratified500-hybrid-alpha/external-trajectory-alpha.json

当前结果：
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples: 867
avg_delta: +0.081
safety_regressions: 0
holdout_passed: true
actual_risk_without_unsafe_label_count: 53
non_actual_keyword_only_record_count: 83
noise_false_positive_reduced_count: 83
pushback_mapped_count: 33

这轮真正的 alpha 是解耦两个旋钮：
1. non-actual command keyword 要继续宽容过滤；
2. user pushback 要保持严格，pushback_review_threshold=1。

下轮不要一上来重跑大 sweep。先做 unknown command context classifier：
把 command_contexts 里的 unknown 拆成 actual_command / tool_result_output / plan_or_instruction / quoted_or_log_output。
重点检查 missed-alpha 里的：
command_context:destructive.unknown
command_context:git_commit.unknown
以及 benign actual command context 和 high_tool_activity 是否只是复杂度先验。

流程建议：
1. 先读 scripts/lib/external-trajectory-adapter.mjs 的 command context classifier。
2. 修 unknown 分类口径，不保存原始外部内容。
3. 用现有 stratified-500 sidecar 重跑 adapter -> command-stress -> side-by-side -> alpha。
4. 判断 noise_tolerant_pushback_strict_v1 是否仍稳定，unknown 是否下降，是否出现新的安全回退。

仍然 shadow-only：
不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。

最近验证已通过：
npm test
npm run validate:schemas -- --json
显式 schema validate 最新 adaptation / side-by-side / alpha 三个报告通过。
```

Stop point:

```text
This window should stop here. The next work unit is unknown command context
classifier, not another broad alpha sweep unless the classifier changes first.
```

## Command Context Classifier Addendum 2026-05-15

This window completed the unknown command-context classifier pass requested by
the recovery phrase above. The change stayed inside the shadow adapter path:

```text
code: scripts/lib/external-trajectory-adapter.mjs
test: test/external-trajectory-adapter.test.mjs
baseline_commit: a3f6cfb
current HEAD observed: 1fbe746
shadow-only: true
raw_external_data_persisted: false
```

Classifier change:

```text
response_item function calls -> actual_command
function/custom tool outputs -> tool_result_output
event_msg exec_command_end command -> actual_command
event_msg exec/stdout/stderr/patch/mcp results -> tool_result_output
turn_context/user/developer/model text -> plan_or_instruction
queue-operation/session/compaction text -> quoted_or_log_output
```

Final reports:

```text
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T15-50-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-hybrid-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T15-55-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-alpha/external-trajectory-alpha.json
```

Main result:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
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

Missed-alpha readout after cleanup:

```text
actual_command_context_without_risk_keyword:
  samples=99
  disposition=investigate_benign_command_context

high_tool_activity:
  samples=299
  disposition=investigate_complexity_prior

unknown command contexts:
  samples=0
  disposition=resolved for this stratified-500 batch
```

Plain interpretation:

```text
The classifier debt is cleared for the current stratified-500 batch. The prior
alpha still holds: command-keyword noise tolerance and pushback strictness
should stay separate knobs.

noise_tolerant_pushback_strict_v1 remains the recommended shadow profile.
```

## Next Window Recovery Phrase 2026-05-15 After Classifier

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Command Context Classifier Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Command Context Classifier Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

unknown command context classifier 已完成：
total command_context *.unknown count: 967 -> 0。
最新推荐 shadow profile 仍是 noise_tolerant_pushback_strict_v1。
最新关键报告：
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T15-50-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-hybrid-sweep/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T15-55-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-alpha/external-trajectory-alpha.json

最新结果：
samples: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
noise_false_positive_reduced_count: 91
actual_risk_preserved_count: 385
pushback_mapped_count: 41

下一轮不要先重跑大 sweep。优先看：
1. actual_command_context_without_risk_keyword 是否只是 benign command coverage；
2. high_tool_activity 是否只是复杂度先验；
3. tool_result_output / plan_or_instruction command-pattern alpha 是否只作为 noise-classifier evidence。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

## Pro Review Follow-up Addendum 2026-05-16

This window handled the Pro review's "small fix then keep" recommendations
without adding new production authority or expanding the alpha surface.

Branch-tip comparison:

```text
optimization-before GitHub baseline:
  ref=origin/codex/local-vector-store-adapter
  commit=3e79083

optimized branch tip:
  ref=codex/local-vector-store-adapter
  commit=1bfd0ac8fc8945b8304f2e8c5f6a3d8fe966666b
  branch_tip_aligned=true
```

Updated report:

```text
runs/external-trajectory-final-comparison/2026-05-16T03-00-00-000Z-branch-tip-grouped-holdout/external-trajectory-final-comparison.json
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-final-comparison.json
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-final-comparison.md
```

Branch-tip result:

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
baseline_to_optimized_action_change_count=223
shadow_readout_action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
```

Action vs score split:

```text
action_change_count=223
action_improvement_count=223
action_regression_count=0
unchanged_action_count=644
action_change_avg_delta=+0.131
same_action_avg_delta=+0.071
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

Pro recommendations now covered:

```text
1. Current branch tip is directly backed by the final comparison.
2. Action-level improvement and score-level lift are separated.
3. Grouped holdout over available sanitized groups is present.
4. expected_match_rate is documented as policy-conformance evidence, not the
   only victory metric.
5. Alpha analysis remains research/support evidence; no new gate, no larger
   parameter sweep, no route/winner authority, and no live effect were added.
```

Still future work:

```text
Fresh larger external samples and a stronger holdout keyed by source project,
repo, time, and task family once those fields exist. This follow-up is still
stronger than the old hash split, but not a fresh external holdout.
```

## Final Full-Batch Comparison Addendum 2026-05-16

This window generated the first full-batch optimized-vs-baseline comparison
after the Qianxuesen generalization guard was committed locally.

Comparison report:

```text
runs/external-trajectory-final-comparison/2026-05-16T02-00-00-000Z-github-baseline-vs-optimized/external-trajectory-final-comparison.json
runs/external-trajectory-final-comparison/2026-05-16T02-00-00-000Z-github-baseline-vs-optimized/external-trajectory-final-comparison.md
```

Comparison anchors:

```text
optimization-before GitHub baseline:
  ref=origin/codex/local-vector-store-adapter
  commit=3e79083
  note=GitHub remote state before external-trajectory scripts, schemas, reports,
    and alpha tuning existed.

optimization-after local commit:
  ref=codex/local-vector-store-adapter
  commit=bf844f9
  selected_profile=noise_tolerant_pushback_strict_v1
```

Measurement note:

```text
The GitHub baseline commit does not contain the external-trajectory evaluation
harness. The comparison therefore uses the current side-by-side harness as the
neutral measurement layer: baseline action/score represents pre-optimization
behavior, and calibrated action/score represents optimized behavior on the same
sanitized 867-sample batch.
```

Overall result:

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
baseline_to_optimized_action_change_count: 223
verdict: optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression
```

Dataset readout:

```text
agentrx-github:
  n=10
  delta=+0.061
  match_lift=+0.800
  safety_regressions=0

atbench:
  n=250
  delta=+0.060
  match_lift=+0.000
  safety_regressions=0

atbench-codex:
  n=250
  delta=+0.060
  match_lift=+0.000
  safety_regressions=0

sanitized-command-stress:
  n=7
  delta=+0.086
  match_lift=+0.429
  safety_regressions=0

swe-chat:
  n=250
  delta=+0.106
  match_lift=+0.648
  safety_regressions=0

swe-rebench-openhands:
  n=100
  delta=+0.174
  match_lift=+0.500
  safety_regressions=0
```

Boundary:

```text
route_authority_changed=false
winner_authority_changed=false
production_authority=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false
vps_touched=false
github_pushed=false
```

Plain interpretation:

```text
The optimized shadow-readout profile beats the pre-optimization baseline on the
full available 867-sample batch. The improvement is broad: every dataset has
positive score delta, and the largest gains are on SWE-style external traces.

This is still local/shadow-only evidence. It is strong enough to close the local
calibration lane, but it is not production authority.
```

## Formal Final Comparison Command Addendum 2026-05-16

The final full-batch comparison is now a repo command instead of a one-off
report script.

New production-ready local command:

```text
npm run external:compare -- --side-by-side-report runs/external-trajectory-side-by-side/2026-05-16T01-10-00-000Z-qianxuesen-generalization-guard-readout/external-trajectory-side-by-side.json --alpha-report runs/external-trajectory-alpha/2026-05-16T01-00-00-000Z-qianxuesen-generalization-guard/external-trajectory-alpha.json --baseline-ref origin/codex/local-vector-store-adapter --baseline-commit 3e79083 --optimized-ref codex/local-vector-store-adapter --optimized-commit bf844f9 --now 2026-05-16T02:20:00.000Z --out-dir runs/external-trajectory-final-comparison/2026-05-16T02-20-00-000Z-formal-github-baseline-vs-optimized
```

New formal report:

```text
runs/external-trajectory-final-comparison/2026-05-16T02-20-00-000Z-formal-github-baseline-vs-optimized/external-trajectory-final-comparison.json
runs/external-trajectory-final-comparison/2026-05-16T02-20-00-000Z-formal-github-baseline-vs-optimized/external-trajectory-final-comparison.md
```

Code and test surface:

```text
scripts/external-trajectory-final-comparison.mjs
scripts/lib/external-trajectory-final-comparison.mjs
schemas/external_trajectory_final_comparison.schema.json
test/external-trajectory-final-comparison.test.mjs
package script: external:compare
```

Formal rerun result:

```text
baseline_ref=origin/codex/local-vector-store-adapter
baseline_commit=3e79083
optimized_ref=codex/local-vector-store-adapter
optimized_commit=bf844f9
selected_profile=noise_tolerant_pushback_strict_v1
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
verdict=optimized_shadow_readout_beats_baseline_without_safety_or_authority_regression
```

Verification:

```text
node --test test/external-trajectory-final-comparison.test.mjs
npm run validate:schemas
generated final comparison validates against schemas/external_trajectory_final_comparison.schema.json
```

Plain interpretation:

```text
The root problem was not the alpha math anymore; the remaining weak point was
that the final comparison was not a reusable repo path. It is now a small,
schema-checked local command. The algorithm is intentionally simple: compare
baseline action/score and optimized action/score on the same sanitized records,
then fail closeout if any regression, safety regression, holdout failure, or
authority/storage/provider boundary change appears.
```

## Next Window Recovery Phrase 2026-05-16 After Full-Batch Comparison

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Final Full-Batch Comparison Addendum 2026-05-16，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Final Full-Batch Comparison Addendum 2026-05-16。
用 git status/log 对齐本地状态；本轮本地收敛 commit 是 bf844f9，优化前 GitHub baseline 是 origin/codex/local-vector-store-adapter@3e79083。

最新全量对照报告：
runs/external-trajectory-final-comparison/2026-05-16T02-00-00-000Z-github-baseline-vs-optimized/external-trajectory-final-comparison.json

当前结论：优化后 shadow readout 在 867 全量样本上优于优化前 baseline：
baseline_avg_score=0.723
optimized_avg_score=0.809
avg_delta=+0.086
baseline_expected_match_rate=0.743
optimized_expected_match_rate=1.000
regression_count=0
safety_regression_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false

下一步只做收尾判断：确认是否本地 closeout / 是否需要推 GitHub。不要碰 VPS，不要给生产 authority，不要写 Zilliz/embedding，不要跑真实 LLM。
```

Stop point:

```text
This window should stop here. The next work unit is benign/complexity alpha
inspection after the unknown classifier cleanup, not another broad sweep first.
```

## Benign/Complexity Alpha Addendum 2026-05-15

This window added a targeted alpha inspection layer on top of the existing
stratified-500 command-context classifier reports. It did not rerun the broad
adapter or side-by-side sweep; it only re-read the latest side-by-side and
adaptation reports through the alpha analyzer.

Changed files:

```text
scripts/lib/external-trajectory-alpha.mjs
schemas/external_trajectory_alpha.schema.json
test/external-trajectory-alpha.test.mjs
```

Input reports:

```text
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T15-50-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-hybrid-sweep/external-trajectory-side-by-side.json
```

New alpha inspection report:

```text
runs/external-trajectory-alpha/2026-05-15T16-20-00-000Z-benign-complexity-alpha-inspection/external-trajectory-alpha.json
```

Main readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
alpha_inspection.conclusion: alpha_found_with_guardrails
promoted_alpha_count: 2
diagnostic_only_count: 1
```

Promoted alpha, with guardrails:

```text
non_actual_command_pattern_noise_evidence:
  decision=promote_to_noise_classifier_evidence
  allowed_use=support noise filtering for command keywords in tool output, plans,
    instructions, quoted logs, and similar non-execution contexts
  blocked_use=do not weaken unsafe boundaries, actual-command boundaries, route
    authority, or winner authority

high_tool_activity_complexity_prior:
  decision=promote_to_review_budget_prior
  allowed_use=raise review depth or evidence requirements for complex traces
  blocked_use=do not treat high tool volume as success evidence, safety evidence,
    or adoption authority
```

Diagnostic-only signal:

```text
benign_actual_command_context:
  source=actual_command_context_without_risk_keyword
  samples=99
  alpha_score=0.598
  decision=keep_as_parser_coverage_diagnostic
  interpretation=classifier can see real benign execution, but that does not
    prove safety or success by itself
```

Non-actual command-pattern pressure:

```text
signal_count: 13
sample_pressure_count: 806
top signals:
  command_context:destructive.tool_result_output, samples=41, alpha_score=0.516
  command_context:install_or_network.tool_result_output, samples=63, alpha_score=0.487
  command_context:install_or_network.plan_or_instruction, samples=100, alpha_score=0.478
  command_context:test_or_verify.tool_result_output, samples=167, alpha_score=0.469
  command_context:git_commit.plan_or_instruction, samples=158, alpha_score=0.467
```

Plain interpretation:

```text
We did find alpha, but not production authority alpha.

Useful alpha:
1. non-actual command patterns are stronger noise-classifier evidence;
2. high tool activity is a complexity/review-budget prior.

Not useful as a rule:
benign actual command context should stay diagnostic only. It proves parser
coverage, not success, safety, or adoption.
```

## Next Window Recovery Phrase 2026-05-15 After Alpha Inspection

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Benign/Complexity Alpha Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Benign/Complexity Alpha Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

最新 alpha inspection 报告：
runs/external-trajectory-alpha/2026-05-15T16-20-00-000Z-benign-complexity-alpha-inspection/external-trajectory-alpha.json

当前结论：
recommended profile 仍是 noise_tolerant_pushback_strict_v1。
找到了 2 个带护栏的 alpha：
1. non_actual_command_pattern_noise_evidence，只能作为 noise-classifier evidence；
2. high_tool_activity_complexity_prior，只能作为 review-depth / evidence-budget prior。
benign_actual_command_context 不升级，只保留为 parser coverage diagnostic。

下一步不要直接给生产 authority。可以做一个 shadow-only stress/ablation：
验证把这 2 个 alpha 接入 shadow scoring/readout 后，是否仍保持 safety_regressions=0、holdout_passed=true，并且不能改变 route/winner authority。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

Stop point:

```text
This window should stop here. The next work unit is a shadow-only alpha
ablation/readout for the two guarded alpha signals, not production adoption.
```

## Guarded Alpha Ablation Addendum 2026-05-15

This window converted the previous alpha inspection into a shadow-only ablation
readout. It did not rerun the broad adapter or side-by-side sweep, and it did
not grant route, winner, or production authority to any alpha signal.

Changed files:

```text
scripts/lib/external-trajectory-alpha.mjs
schemas/external_trajectory_alpha.schema.json
test/external-trajectory-alpha.test.mjs
```

Input reports:

```text
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T15-50-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-hybrid-sweep/external-trajectory-side-by-side.json
```

New alpha ablation report:

```text
runs/external-trajectory-alpha/2026-05-15T16-45-00-000Z-guarded-alpha-ablation-readout/external-trajectory-alpha.json
```

Main readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
alpha_ablation.mode: shadow_readout_ablation_only
alpha_ablation.conclusion: guarded_alpha_can_enter_shadow_readout_only
```

Enabled alpha for shadow readout only:

```text
non_actual_command_pattern_noise_evidence:
  use=shadow noise-classifier evidence only
  affected_comparison_count=278
  signal_pressure_count=4390
  action_change_count=0
  verdict=pass_shadow_guardrails

high_tool_activity_complexity_prior:
  use=shadow review-depth / evidence-budget prior only
  affected_comparison_count=299
  signal_pressure_count=299
  action_change_count=0
  verdict=pass_shadow_guardrails
```

Combined guarded alpha scenario:

```text
combined_guarded_alpha_on:
  affected_comparison_count=320
  signal_pressure_count=4689
  action_change_count=0
  global_safety_regression_count=0
  holdout_passed=true
  route_authority_changed=false
  winner_authority_changed=false
  production_authority=false
  verdict=pass_shadow_guardrails
```

Blocked alpha:

```text
benign_actual_command_context:
  source=actual_command_context_without_risk_keyword
  reason=parser coverage diagnostic only
  blocked_use=no success, safety, adoption, route, or winner authority
```

Closure checks:

```text
selected profile unchanged: true
no action changes introduced: true
no route or winner authority introduced: true
safety regressions remain zero: true
holdout remains passed: true
benign actual command stays diagnostic-only: true
```

Plain interpretation:

```text
The alpha exists, but it is not a production switch.

The useful logic loop is:
1. non-actual command patterns can strengthen shadow noise filtering;
2. high tool activity can raise shadow review depth;
3. benign actual command context stays diagnostic-only.

The current candidate profile remains stable:
noise_tolerant_pushback_strict_v1.
```

## Next Window Recovery Phrase 2026-05-15 After Alpha Ablation

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Guarded Alpha Ablation Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Guarded Alpha Ablation Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

最新 alpha ablation 报告：
runs/external-trajectory-alpha/2026-05-15T16-45-00-000Z-guarded-alpha-ablation-readout/external-trajectory-alpha.json

当前结论：
recommended profile 仍是 noise_tolerant_pushback_strict_v1。
guarded alpha 可以进入 shadow readout only：
1. non_actual_command_pattern_noise_evidence，只能作为 noise-classifier evidence；
2. high_tool_activity_complexity_prior，只能作为 review-depth / evidence-budget prior。
benign_actual_command_context 继续 blocked，只保留为 parser coverage diagnostic。

闭环检查：
samples=867
avg_delta=+0.086
safety_regressions=0
holdout_passed=true
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false

下一步可以做 shadow readout integration / policy surface，让这两个 alpha 在 shadow 报告里被消费和展示；不要给生产 route/winner authority。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

Stop point:

```text
This window should stop here after tests. The next work unit is shadow readout
integration / policy surface for the two guarded alpha signals, not production
adoption.
```

## Shadow Policy Surface Addendum 2026-05-15

This window wired the two guarded alpha signals into a formal shadow-only policy
surface. The surface is report/readout consumption only: it explains how the
alpha can be shown and used inside shadow reports, while explicitly blocking
action, route, winner, production, provider, and persistence effects.

Changed files:

```text
scripts/lib/external-trajectory-alpha.mjs
schemas/external_trajectory_alpha.schema.json
test/external-trajectory-alpha.test.mjs
```

Input reports:

```text
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-side-by-side/2026-05-15T15-50-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-hybrid-sweep/external-trajectory-side-by-side.json
```

New alpha report with policy surface:

```text
runs/external-trajectory-alpha/2026-05-15T17-20-00-000Z-shadow-policy-surface/external-trajectory-alpha.json
```

Main readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
alpha_ablation.conclusion: guarded_alpha_can_enter_shadow_readout_only
shadow_policy_surface.conclusion: ready_for_shadow_readout_consumption
```

Shadow policy channels:

```text
command_noise_evidence:
  alpha_id=non_actual_command_pattern_noise_evidence
  authority_scope=shadow_readout_only
  surface_status=enabled_shadow_readout
  affected_comparison_count=278
  signal_pressure_count=4390
  allowed=explain noise-filtered review decisions; support command-noise diagnostics
  blocked=do not lower actual-command thresholds, change actions, change selected profile,
    grant route authority, or grant winner authority

complexity_review_budget:
  alpha_id=high_tool_activity_complexity_prior
  authority_scope=shadow_readout_only
  surface_status=enabled_shadow_readout
  affected_comparison_count=299
  signal_pressure_count=299
  allowed=raise shadow review depth; explain evidence-budget pressure
  blocked=do not treat tool volume as success/safety evidence, change actions,
    grant route authority, or grant winner authority
```

Blocked alpha:

```text
benign_actual_command_context:
  blocked from policy_channels
  remains parser coverage diagnostic only
```

Policy closure:

```text
consumed_alpha_ids:
  - non_actual_command_pattern_noise_evidence
  - high_tool_activity_complexity_prior
blocked_alpha_ids:
  - benign_actual_command_context
action_change_count: 0
route_authority_changed: false
winner_authority_changed: false
production_authority: false
raw_external_content_persisted: false
persistent_memory_written: false
zilliz_written: false
embedding_created: false
llm_api_calls: false
external_api_calls: false
```

Plain interpretation:

```text
Alpha is now visible to the shadow control loop, but it still cannot drive.

The alpha found so far remains:
1. non-actual command-pattern noise evidence;
2. high-tool-activity complexity prior.

No new production alpha was accepted. The useful next work is to make future
side-by-side/readout reports consume this policy surface directly, so the
shadow lane can explain why a trace was noise-filtered or marked complex.
```

## Next Window Recovery Phrase 2026-05-15 After Shadow Policy Surface

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Shadow Policy Surface Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Shadow Policy Surface Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

最新 shadow policy surface 报告：
runs/external-trajectory-alpha/2026-05-15T17-20-00-000Z-shadow-policy-surface/external-trajectory-alpha.json

当前结论：
recommended profile 仍是 noise_tolerant_pushback_strict_v1。
shadow_policy_surface.conclusion=ready_for_shadow_readout_consumption。
两个 alpha 已接入 shadow-only policy channels：
1. command_noise_evidence -> non_actual_command_pattern_noise_evidence；
2. complexity_review_budget -> high_tool_activity_complexity_prior。
benign_actual_command_context 仍 blocked，只是 parser coverage diagnostic。

闭环检查：
samples=867
avg_delta=+0.086
safety_regressions=0
holdout_passed=true
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false

下一步：把 shadow_policy_surface 接到 future side-by-side/readout 报告消费层，让报告直接展示 command_noise_evidence 和 complexity_review_budget；继续找 alpha，但不要给生产 route/winner authority。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

Stop point:

```text
This window should stop here after tests. The next work unit is side-by-side or
readout-level consumption of shadow_policy_surface, while continuing alpha
search under shadow-only authority.
```

## Side-by-Side Shadow Policy Readout Addendum 2026-05-15

This window connected the alpha `shadow_policy_surface` back into the
side-by-side/readout layer. The side-by-side report can now consume and display
the two guarded alpha channels directly, without changing scoring, selected
profile, actions, route authority, winner authority, or production behavior.

Changed files:

```text
scripts/lib/external-trajectory-side-by-side.mjs
scripts/external-trajectory-side-by-side.mjs
schemas/external_trajectory_side_by_side.schema.json
test/external-trajectory-side-by-side.test.mjs
```

Input reports:

```text
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
runs/external-trajectory-alpha/2026-05-15T17-20-00-000Z-shadow-policy-surface/external-trajectory-alpha.json
```

New side-by-side readout report:

```text
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json
```

Alpha closure report after consuming the readout:

```text
runs/external-trajectory-alpha/2026-05-15T17-55-00-000Z-shadow-policy-readout-alpha-closure/external-trajectory-alpha.json
```

Main readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
shadow_policy_readout.conclusion: side_by_side_consumed_shadow_policy_surface
shadow_policy_channels: 2
```

Consumed readout channels:

```text
command_noise_evidence:
  alpha_id=non_actual_command_pattern_noise_evidence
  source_ablation_id=non_actual_command_pattern_noise_evidence_on
  authority_scope=shadow_readout_only
  side_by_side_consumption=readout_annotation_only
  affected_comparison_count=278
  signal_pressure_count=4390

complexity_review_budget:
  alpha_id=high_tool_activity_complexity_prior
  source_ablation_id=high_tool_activity_complexity_prior_on
  authority_scope=shadow_readout_only
  side_by_side_consumption=readout_annotation_only
  affected_comparison_count=299
  signal_pressure_count=299
```

Blocked alpha:

```text
benign_actual_command_context:
  still blocked from side-by-side consumed channels
  remains parser coverage diagnostic only
```

Closure checks:

```text
source shadow policy surface is ready: true
selected profile matches source policy surface: true
only shadow readout channels are consumed: true
blocked alpha stays out of consumed channels: true
side-by-side consumption changes no actions or authority: true
side-by-side consumption has no persistence or provider effects: true

action_change_count: 0
route_authority_changed: false
winner_authority_changed: false
production_authority: false
raw_external_content_persisted: false
persistent_memory_written: false
zilliz_written: false
embedding_created: false
llm_api_calls: false
external_api_calls: false
```

Plain interpretation:

```text
The alpha is now visible on both sides of the loop:
1. alpha report produces shadow_policy_surface;
2. side-by-side report consumes it as shadow_policy_readout;
3. alpha rerun confirms the same two guarded alpha channels still pass closure.

This is a readout improvement, not a scoring or authority change.
```

## Next Window Recovery Phrase 2026-05-15 After Side-by-Side Policy Readout

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Side-by-Side Shadow Policy Readout Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Side-by-Side Shadow Policy Readout Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

最新 side-by-side policy readout 报告：
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json

最新 alpha closure 报告：
runs/external-trajectory-alpha/2026-05-15T17-55-00-000Z-shadow-policy-readout-alpha-closure/external-trajectory-alpha.json

当前结论：
recommended profile 仍是 noise_tolerant_pushback_strict_v1。
side-by-side 已消费 shadow_policy_surface：
1. command_noise_evidence -> non_actual_command_pattern_noise_evidence；
2. complexity_review_budget -> high_tool_activity_complexity_prior。
benign_actual_command_context 仍 blocked，只是 parser coverage diagnostic。

闭环检查：
samples=867
avg_delta=+0.086
safety_regressions=0
holdout_passed=true
shadow_policy_readout.conclusion=side_by_side_consumed_shadow_policy_surface
shadow_policy_surface.conclusion=ready_for_shadow_readout_consumption
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false

下一步：继续找下一批 alpha。优先看剩余 watch/missed signals，例如 install/network command context、failed proxy / resolved_false 组合、pushback 与 weak proxy 交叉；仍然不要给生产 route/winner authority。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

Stop point:

```text
This window should stop here after tests. The next work unit is the next alpha
search over remaining watch/missed signals, not production adoption.
```

## Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15

This window added a Qianxuesen-style second-order alpha fit layer. The new layer
does not retune the scoring formula and does not change side-by-side actions.
It evaluates cross-signal combinations as shadow control priors: damping,
evidence-budget, rejection-damping, review-depth, or source-scoped watch.

Changed files:

```text
scripts/lib/external-trajectory-alpha.mjs
schemas/external_trajectory_alpha.schema.json
test/external-trajectory-alpha.test.mjs
```

Input reports:

```text
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
```

New alpha fit report:

```text
runs/external-trajectory-alpha/2026-05-15T18-20-00-000Z-qianxuesen-second-order-alpha-fit/external-trajectory-alpha.json
```

Main readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
qianxuesen_alpha_fit.conclusion: second_order_alpha_found_for_shadow_control
candidate_count: 5
promoted_candidate_count: 3
watch_candidate_count: 2
blocked_candidate_count: 0
```

Promoted second-order alpha:

```text
failed_outcome_without_unsafe_boundary:
  decision=promote_to_shadow_damping_prior
  control_role=damping_prior
  samples=124
  avg_delta=+0.117
  expected_match_lift=+0.815
  qianxuesen_fit_score=0.645
  source_scope=multi_dataset
  allowed=raise damping and negative-outcome review pressure when failure
    evidence exists without relying on unsafe labels
  blocked=no route authority, winner authority, or production rejection

non_actual_command_failed_outcome_overlap:
  decision=promote_to_shadow_evidence_budget_prior
  control_role=evidence_budget_prior
  samples=58
  avg_delta=+0.187
  expected_match_lift=+0.603
  qianxuesen_fit_score=0.616
  source_scope=multi_dataset
  allowed=raise evidence-budget pressure when command-looking noise overlaps
    with failed outcome evidence
  blocked=no automatic rejection or route changes

pushback_failed_or_weak_proxy_overlap:
  decision=promote_to_shadow_rejection_damping_prior
  control_role=rejection_damping_prior
  samples=20
  avg_delta=+0.101
  expected_match_lift=+1.000
  qianxuesen_fit_score=0.520
  source_scope=single_dataset
  allowed=raise rejection-ledger and damping pressure when user pushback overlaps
    with weak or failed proxy evidence
  blocked=no winner authority or permanent negative memory
```

Watch-only candidates:

```text
weak_unresolved_high_tool_overlap:
  decision=watch_source_scoped_alpha
  control_role=review_depth_prior
  samples=39
  avg_delta=+0.113
  expected_match_lift=+1.000
  source_scope=single_dataset
  next_gate=cross_dataset_holdout_before_promotion

install_network_non_actual_complexity_overlap:
  decision=watch_source_scoped_alpha
  control_role=source_scoped_watch_prior
  samples=100
  avg_delta=+0.174
  expected_match_lift=+0.500
  source_scope=single_dataset
  next_gate=cross_dataset_holdout_before_promotion
```

Closure checks:

```text
qianxuesen alpha fit remains shadow-control-prior only: true
promoted candidates have no safety regressions: true
source-scoped candidates are watched instead of promoted: true
qianxuesen alpha fit changes no actions or authority: true
qianxuesen alpha fit has no persistence or provider effects: true

action_change_count: 0
route_authority_changed: false
winner_authority_changed: false
production_authority: false
raw_external_content_persisted: false
persistent_memory_written: false
zilliz_written: false
embedding_created: false
llm_api_calls: false
external_api_calls: false
```

Plain interpretation:

```text
The next alpha is not another command keyword tweak. It is a control-loop alpha:
negative outcomes, command-noise overlap, and user pushback/proxy conflict are
useful as shadow damping or evidence-budget priors.

Two attractive signals are deliberately held back because they are source
scoped: weak unresolved + high tool, and install/network non-actual complexity.
They need cross-dataset holdout before promotion.
```

## Next Window Recovery Phrase 2026-05-15 After Qianxuesen Alpha Fit

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

最新 alpha fit 报告：
runs/external-trajectory-alpha/2026-05-15T18-20-00-000Z-qianxuesen-second-order-alpha-fit/external-trajectory-alpha.json

当前结论：
recommended profile 仍是 noise_tolerant_pushback_strict_v1。
qianxuesen_alpha_fit.conclusion=second_order_alpha_found_for_shadow_control。
promoted second-order alpha:
1. failed_outcome_without_unsafe_boundary -> shadow damping prior；
2. non_actual_command_failed_outcome_overlap -> shadow evidence-budget prior；
3. pushback_failed_or_weak_proxy_overlap -> shadow rejection-damping prior。
watch-only:
1. weak_unresolved_high_tool_overlap；
2. install_network_non_actual_complexity_overlap。

闭环检查：
samples=867
avg_delta=+0.086
safety_regressions=0
holdout_passed=true
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false
raw_external_content_persisted=false
zilliz_written=false
embedding_created=false
llm_api_calls=false
external_api_calls=false

下一步：对 3 个 promoted second-order alpha 做 shadow ablation/readout，然后再决定是否接入 shadow_policy_surface / side-by-side readout；不要给生产 route/winner authority。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

Stop point:

```text
This window should stop here after tests. The next work unit is shadow
ablation/readout for the three promoted Qianxuesen second-order alpha priors.
```

## Window Closeout 2026-05-16

This closeout intentionally stops before implementing the next ablation layer.
The current window has enough evidence to hand off cleanly, but not enough safe
working room to start another scoring/readout implementation without increasing
review risk.

Current completed state:

```text
external trajectory baseline: a3f6cfb
current local HEAD observed in this lane: 1fbe746
recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
```

Latest completed reports:

```text
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json
runs/external-trajectory-alpha/2026-05-15T18-20-00-000Z-qianxuesen-second-order-alpha-fit/external-trajectory-alpha.json
```

Completed alpha state:

```text
first-order shadow readout alpha already consumed:
  - non_actual_command_pattern_noise_evidence
  - high_tool_activity_complexity_prior

second-order Qianxuesen alpha promoted for next ablation:
  - failed_outcome_without_unsafe_boundary
  - non_actual_command_failed_outcome_overlap
  - pushback_failed_or_weak_proxy_overlap

watch-only:
  - weak_unresolved_high_tool_overlap
  - install_network_non_actual_complexity_overlap
```

Quality gate for the next window:

```text
Do not start with a broad rerun.
Do not promote the three second-order alpha priors directly into policy surface.
First implement shadow ablation/readout for the three promoted priors.
Then verify:
  - selected profile remains noise_tolerant_pushback_strict_v1
  - safety_regressions remains 0
  - holdout_passed remains true
  - action_change_count remains 0
  - route_authority_changed remains false
  - winner_authority_changed remains false
  - production_authority remains false
```

Next-window recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Window Closeout 2026-05-16 和 Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Window Closeout 2026-05-16。
用 git status/log 对齐本地状态；注意当前 HEAD 可能是 1fbe746，但 external trajectory baseline 固定看 a3f6cfb。

当前进度：first-order alpha 已接入 shadow_policy_surface 和 side-by-side shadow_policy_readout；second-order Qianxuesen alpha fit 已完成，找到 3 个 promoted shadow-control priors。
下一步只做：对 failed_outcome_without_unsafe_boundary、non_actual_command_failed_outcome_overlap、pushback_failed_or_weak_proxy_overlap 做 shadow ablation/readout。
不要先重跑大 sweep，不要接生产 authority，不要写 Zilliz/embedding，不要跑真实 LLM，不碰 VPS，不推 GitHub。
```

## Qianxuesen Second-Order Shadow Ablation/Readout Addendum 2026-05-16

This window implemented the narrow next work unit from the 2026-05-16 closeout:
shadow ablation/readout for the three promoted Qianxuesen second-order priors.
It reused the fixed 867-comparison batch and did not rerun a broad adapter sweep.

Changed files:

```text
scripts/lib/external-trajectory-alpha.mjs
schemas/external_trajectory_alpha.schema.json
test/external-trajectory-alpha.test.mjs
test/external-trajectory-side-by-side.test.mjs
```

Input reports:

```text
runs/external-trajectory-side-by-side/2026-05-15T17-45-00-000Z-shadow-policy-readout-consumption/external-trajectory-side-by-side.json
runs/external-trajectory-adaptation/2026-05-15T15-46-00-000Z-combined-swe-rebench-stratified500-command-context-classifier-command-stress/external-trajectory-adaptation.json
```

New local reports:

```text
runs/external-trajectory-alpha/2026-05-16T00-20-00-000Z-qianxuesen-second-order-shadow-ablation-readout/external-trajectory-alpha.json
runs/external-trajectory-side-by-side/2026-05-16T00-30-00-000Z-qianxuesen-second-order-shadow-readout-consumption/external-trajectory-side-by-side.json
```

Main readout:

```text
selected/recommended profile: noise_tolerant_pushback_strict_v1
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
shadow_policy_readout.conclusion: side_by_side_consumed_shadow_policy_surface
shadow_policy_channels: 5
```

Second-order ablation:

```text
qianxuesen_alpha_ablation.mode: qianxuesen_shadow_control_ablation_only
qianxuesen_alpha_ablation.conclusion: promoted_second_order_alpha_can_enter_shadow_readout_only

failed_outcome_without_unsafe_boundary_on:
  affected=124
  signal_pressure=124
  action_changes=0
  safety_regressions=0
  holdout_passed=true

non_actual_command_failed_outcome_overlap_on:
  affected=58
  signal_pressure=58
  action_changes=0
  safety_regressions=0
  holdout_passed=true

pushback_failed_or_weak_proxy_overlap_on:
  affected=20
  signal_pressure=20
  action_changes=0
  safety_regressions=0
  holdout_passed=true

combined_qianxuesen_second_order_alpha_on:
  affected=124
  signal_pressure=202
  action_changes=0
  safety_regressions=0
  holdout_passed=true
```

Shadow readout channels now consumed by side-by-side:

```text
command_noise_evidence:
  alpha_id=non_actual_command_pattern_noise_evidence
  affected=278
  signal_pressure=4390
  side_by_side_consumption=readout_annotation_only

complexity_review_budget:
  alpha_id=high_tool_activity_complexity_prior
  affected=299
  signal_pressure=299
  side_by_side_consumption=readout_annotation_only

negative_outcome_damping:
  alpha_id=failed_outcome_without_unsafe_boundary
  affected=124
  signal_pressure=124
  side_by_side_consumption=readout_annotation_only

command_noise_failure_evidence_budget:
  alpha_id=non_actual_command_failed_outcome_overlap
  affected=58
  signal_pressure=58
  side_by_side_consumption=readout_annotation_only

pushback_proxy_rejection_damping:
  alpha_id=pushback_failed_or_weak_proxy_overlap
  affected=20
  signal_pressure=20
  side_by_side_consumption=readout_annotation_only
```

Still blocked / watch-only:

```text
benign_actual_command_context
weak_unresolved_high_tool_overlap
install_network_non_actual_complexity_overlap
```

Closure checks:

```text
action_change_count: 0
route_authority_changed: false
winner_authority_changed: false
production_authority: false
raw_external_content_persisted: false
persistent_memory_written: false
zilliz_written: false
embedding_created: false
llm_api_calls: false
external_api_calls: false
```

Plain interpretation:

```text
The three second-order priors stood up as shadow readout signals. They explain
where the shadow loop should add damping, evidence-budget pressure, or
rejection-damping pressure. They still do not change the selected profile,
actions, route authority, winner authority, or production behavior.

The first-order readout plus the three second-order readouts are now visible in
the side-by-side report as five annotation-only channels.
```

## Next Window Recovery Phrase 2026-05-16 After Second-Order Shadow Readout

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Qianxuesen Second-Order Shadow Ablation/Readout Addendum 2026-05-16，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Qianxuesen Second-Order Shadow Readout Addendum 2026-05-16。
用 git status/log 对齐本地状态；本轮开始时本地 commit 锚点是 7220b5b，external trajectory baseline 固定看 a3f6cfb。

最新本地报告：
runs/external-trajectory-alpha/2026-05-16T00-20-00-000Z-qianxuesen-second-order-shadow-ablation-readout/external-trajectory-alpha.json
runs/external-trajectory-side-by-side/2026-05-16T00-30-00-000Z-qianxuesen-second-order-shadow-readout-consumption/external-trajectory-side-by-side.json

当前结论：3 个 promoted second-order alpha 已通过 shadow ablation/readout：
1. failed_outcome_without_unsafe_boundary -> negative_outcome_damping；
2. non_actual_command_failed_outcome_overlap -> command_noise_failure_evidence_budget；
3. pushback_failed_or_weak_proxy_overlap -> pushback_proxy_rejection_damping。

稳定数字：
samples=867
avg_delta=+0.086
safety_regressions=0
holdout_passed=true
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false

下一步：先收敛本地改动；如果继续校准，就只看两个 watch-only 信号的跨数据集 holdout，不要给生产 route/winner authority。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

## Qianxuesen Generalization Guard Addendum 2026-05-16

This window added a small anti-overfit readout to the Qianxuesen alpha report.
Each second-order candidate now carries its own holdout summary and
`generalization_status`, so source-scoped signals cannot be accidentally read as
global alpha.

New local reports:

```text
runs/external-trajectory-alpha/2026-05-16T01-00-00-000Z-qianxuesen-generalization-guard/external-trajectory-alpha.json
runs/external-trajectory-side-by-side/2026-05-16T01-10-00-000Z-qianxuesen-generalization-guard-readout/external-trajectory-side-by-side.json
```

Stable global readout:

```text
samples/comparisons: 867
avg_delta: +0.086
safety_regressions: 0
holdout_passed: true
shadow_policy_channels: 5
action_change_count: 0
route_authority_changed: false
winner_authority_changed: false
production_authority: false
```

Generalization readout:

```text
failed_outcome_without_unsafe_boundary:
  status=cross_dataset_holdout_passed
  datasets=agentrx-github,swe-chat,swe-rebench-openhands
  holdout_n=23
  holdout_avg_delta=+0.106
  overfit_gap=+0.014

non_actual_command_failed_outcome_overlap:
  status=cross_dataset_holdout_passed
  datasets=swe-chat,swe-rebench-openhands
  holdout_n=10
  holdout_avg_delta=+0.183
  overfit_gap=+0.005

pushback_failed_or_weak_proxy_overlap:
  status=source_scoped_shadow_only_holdout_passed
  datasets=swe-chat
  holdout_n=1
  holdout_avg_delta=+0.084
  overfit_gap=+0.018

weak_unresolved_high_tool_overlap:
  status=watch_cross_dataset_holdout_needed
  datasets=swe-chat

install_network_non_actual_complexity_overlap:
  status=watch_cross_dataset_holdout_needed
  datasets=swe-rebench-openhands
```

Plain interpretation:

```text
This is the anti-runaway guard. The first two second-order signals look like
real cross-source alpha. The pushback overlap signal is still useful, but only
as shadow-only source-scoped rejection damping. The two watch-only signals keep
their current boundary until they survive another dataset.
```

## Next Window Recovery Phrase 2026-05-16 After Generalization Guard

Use this exact recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Qianxuesen Generalization Guard Addendum 2026-05-16，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Qianxuesen Generalization Guard Readout Addendum 2026-05-16。
用 git status/log 对齐本地状态；本轮开始时本地 commit 锚点是 7220b5b，external trajectory baseline 固定看 a3f6cfb。

最新本地报告：
runs/external-trajectory-alpha/2026-05-16T01-00-00-000Z-qianxuesen-generalization-guard/external-trajectory-alpha.json
runs/external-trajectory-side-by-side/2026-05-16T01-10-00-000Z-qianxuesen-generalization-guard-readout/external-trajectory-side-by-side.json

当前结论：防跑偏读数已接入。failed_outcome_without_unsafe_boundary 和 non_actual_command_failed_outcome_overlap 是 cross_dataset_holdout_passed；pushback_failed_or_weak_proxy_overlap 只算 source_scoped_shadow_only_holdout_passed；weak_unresolved_high_tool_overlap 和 install_network_non_actual_complexity_overlap 继续 watch_cross_dataset_holdout_needed。

稳定数字：
samples=867
avg_delta=+0.086
safety_regressions=0
holdout_passed=true
action_change_count=0
route_authority_changed=false
winner_authority_changed=false
production_authority=false

下一步：先收敛本地改动；继续校准时只补跨数据集证据，不写样本专属规则，不加新治理层。

仍然 shadow-only：不写 Zilliz、不创建 embedding、不跑真实 LLM、不碰 VPS、不推 GitHub、不提交原始外部数据、不改生产 route/winner authority。
```

## Second Pro Review Closeout 2026-05-16

Second Pro review verdict:

```text
Local closeout: small fix then yes.
GitHub branch retention: pass.
Online observe-only shadow: small fix then pass.
Real-layer suggestion rights: small fix, only as no-write review hints / tickets.
Real route/winner authority: fail / not yet.
```

Current repository anchors:

```text
GitHub branch: codex/local-vector-store-adapter
GitHub tip before this handoff note: 661e6f1
Comparison code/behavior anchor: 1bfd0ac8fc8945b8304f2e8c5f6a3d8fe966666b
Optimization-before baseline: origin/codex/local-vector-store-adapter@3e79083
```

Important nuance:

```text
Any commit after 1bfd0ac in this lane is report packaging / review-bundle /
handoff documentation unless code diffs say otherwise. Do not treat a docs-only
handoff commit as a new behavior anchor that requires rerunning the 867 compare.
```

Latest review bundle:

```text
docs/pro-review/external-trajectory-2026-05-16/README.md
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-final-comparison.json
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-final-comparison.md
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-side-by-side.json
docs/pro-review/external-trajectory-2026-05-16/external-trajectory-alpha.json
```

Pro-requested fixes already landed:

```text
1. Formal JSON / Markdown / README now point at the same comparison behavior
   anchor: 1bfd0ac8fc8945b8304f2e8c5f6a3d8fe966666b.
2. action_score_separation is in the final-comparison library, schema, test,
   generated JSON, and review bundle.
3. grouped_holdout is in the final-comparison library, schema, test, generated
   JSON, and review bundle.
4. expected_match_rate is documented as policy-conformance evidence, not an
   independent external judge.
5. Alpha remains research/readout evidence; no new alpha gate, no expanded
   parameter sweep, and no route/winner authority were added.
```

Stable post-review numbers:

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

action_change_count=223
action_improvement_count=223
action_regression_count=0
unchanged_action_count=644

action_change_delta_share=0.389
same_action_delta_share=0.611

grouped_holdout=grouped_holdout_passed_without_regression
dataset groups=6/6
expected_shadow_action groups=5/5
issue_kind groups with min_count=5 => 10/10
```

Next window exact work:

```text
1. First verify GitHub latest review bundle content. If Pro was reading stale
   JSON, ask it to re-read 661e6f1-or-later files before changing code.
2. Start the online observe-only shadow design, not production authority.
3. Add a suggestion-only contract if moving beyond readout:
   review_hints / repair_tickets / work_orders only;
   no route changes, no winner authority, no memory writes.
4. Plan stronger external holdout fields for full perception:
   source_project, repo, time, task_family.
5. Keep fresh larger samples as the next evidence target.
```

Do not do next:

```text
Do not chase optimized_expected_match_rate=1.000 as the main KPI.
Do not promote watch-only or single-dataset alpha to a hard gate.
Do not expand parameter sweep.
Do not connect route/winner authority.
Do not write Zilliz or create embeddings.
Do not run real LLM calls.
Do not touch VPS unless the user explicitly opens the VPS rollout lane.
```

Next-window recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Second Pro Review Closeout 2026-05-16，再读 docs/history/external-trajectory-side-by-side-v0.28.md 的 Second Pro Review Closeout 2026-05-16，然后看 docs/pro-review/external-trajectory-2026-05-16/README.md。
用 git status/log 对齐本地状态。external trajectory baseline 固定看 3e79083；comparison behavior anchor 固定看 1bfd0ac8fc8945b8304f2e8c5f6a3d8fe966666b；后续 docs-only handoff commit 不算新行为锚点。

当前结论：Pro 第二轮判定为小修后本地 closeout / GitHub 保留通过 / observe-only shadow 小修后通过 / suggestion-only 小修 / route-winner authority 不通过。Pro 点名的小修已经落地：formal JSON、MD、README 锚点对齐；action_score_separation 和 grouped_holdout 已进入 schema/lib/test/report。

下一步只做：设计线上 observe-only shadow 和 no-write suggestion/ticket contract；补 full-perception 后更独立 holdout 字段规划。不要接生产 authority，不写 Zilliz/embedding，不跑真实 LLM，不碰 VPS，不扩参数 sweep，不升 watch-only alpha。
```

## Online Observe-only Shadow Contract Addendum 2026-05-16

This window landed the next staged contract. It does not change the 867-sample
side-by-side behavior anchor and does not connect production authority.

New local command:

```text
npm run external:online-shadow -- --json --dry-run
```

New contract artifacts:

```text
scripts/external-trajectory-online-shadow-contract.mjs
scripts/lib/external-trajectory-online-shadow-contract.mjs
schemas/external_trajectory_online_shadow_contract.schema.json
examples/external-trajectory-online-shadow/generic-workflow-digest.example.json
examples/external-trajectory-online-shadow/generic-workflow-adapter/
test/external-trajectory-online-shadow-contract.test.mjs
docs/history/external-trajectory-online-shadow-contract-v0.29.md
```

Contract result:

```text
online observe-only shadow: implemented locally
allowed outputs: external_trajectory_readout / review_hints / repair_ticket_drafts / work_order_drafts
suggestion contract: no-write drafts only
route authority: false
winner authority: false
production authority: false
persistent memory write: false
Zilliz write: false
embedding creation: false
LLM/API calls: 0
VPS/GitHub effects: false
```

Full-perception holdout fields are now explicit future gates:

```text
source_project
repo
time
task_family
```

Meaning:

```text
Real signals may now be shaped into an external trajectory readout path, but
only as observation, explanation, review hints, and no-write ticket/work-order
drafts. They still cannot pick routes, pick winners, write memory, create
embeddings, or execute repairs.
```

Public adapter clarification:

```text
The core contract is the generic plug socket. Hermes/Farcaster/GitHub/Discord/CI
or custom workflow logic should live in thin adapters that translate native
events into misa.perception_digest.v1. The shared contract only reads sanitized
source_refs / observed_signals / route_pressure plus the full-perception
holdout fields source_project / repo / time / task_family.

The runnable template is npm run external:generic-adapter -- --json. It turns
examples/external-trajectory-online-shadow/generic-workflow-adapter/input.workflow-events.json
into a public perception digest that can be fed to external:online-shadow.
```

Verification in this window:

```text
node --test test/external-trajectory-online-shadow-contract.test.mjs
npm run validate:schemas -- --json
```

Next-window recovery phrase:

```text
继续 misa-cybernetic-evolution external trajectory lane。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Online Observe-only Shadow Contract Addendum 2026-05-16，再读 docs/history/external-trajectory-online-shadow-contract-v0.29.md。
用 git status/log 对齐本地状态。external trajectory baseline 仍固定看 3e79083；comparison behavior anchor 仍固定看 1bfd0ac8fc8945b8304f2e8c5f6a3d8fe966666b。

当前已落地：online observe-only shadow contract + no-write suggestion/ticket contract。本地命令是 npm run external:online-shadow -- --json --dry-run。真实信号只能进入 external trajectory readout / review hints / repair-ticket drafts / work-order drafts；不接 route/winner authority，不写 memory/Zilliz/embedding，不跑真实 LLM/API，不碰 VPS/GitHub。

下一步如果继续，只做 full-perception 后 source_project/repo/time/task_family 独立 holdout 接入规划或 fresh larger samples 证据，不要扩参数 sweep，不升 alpha gate。
```

## L1 Control and L4 Handoff Closeout 2026-05-19

This closeout updates the L2/L3 selection audit lane after the L4 review
discussion and the real 10-sample Gemini Flash check.

Behavior changed in this window:

```text
L1 is no longer only carried as a label.
Before L2 calls a provider, L1 now decides:
- whether to generate L2 at all;
- whether the sample asks for 1 or 2 candidates;
- the minimum handoff floor: no_context_agent, primary_agent, or human_owner.

L3 now records whether L1 control was followed:
- l1_control_followed_count
- l1_policy_violation_count
- l1_handoff_floor_counts
- suppressed_count
```

Why this direction:

```text
The useful loop is not "add one more LLM judge".
The useful loop is:

L1 signal -> L2 cost / branch decision -> L3 quality evidence -> later prompt,
gate, or threshold tuning.

L4 should stay narrow: a no-context handoff gate / executor selector. It should
not become a second L3 quality court by default. A real L4 LLM review can still
be run as an experiment, but it is not the main control loop.
```

Files changed:

```text
scripts/lib/external-trajectory-llm-work-order-draft.mjs
scripts/lib/l2-l3-selection-audit.mjs
scripts/l4-work-order-review.mjs
scripts/lib/l4-work-order-review.mjs
test/external-trajectory-llm-work-order-draft.test.mjs
test/l2-l3-selection-audit.test.mjs
test/l4-work-order-review.test.mjs
docs/history/l2-l3-selection-audit-v0.30.md
package.json
scripts/lib/precheck-shared.mjs
```

Verification before closeout:

```text
node --test --test-concurrency=1 test/external-trajectory-llm-work-order-draft.test.mjs test/l2-l3-selection-audit.test.mjs test/l4-work-order-review.test.mjs
=> 27 pass / 0 fail

git diff --check
=> pass

npm run precheck
=> pass

npm test
=> 179 pass / 0 fail / 1 skipped
```

Real 10-sample Gemini Flash run:

```text
Run path:
runs/l1-control-10/2026-05-19-real-gemini-flash/vps-output/

Provider:
hermes-delegate novai/gemini-3-flash-preview

Boundary:
Temporary /tmp run on VPS only.
No production service changes.
No memory writes.
No Zilliz writes.
No embeddings.
No route/winner changes.
No GitHub push.
No public publish.
```

Comparison against the previous 915c10d real 10-sample Gemini Flash run:

```text
old baseline:
candidate_count_policy=l3_feedback_dynamic
requested_candidate_count_histogram={"1":10}
green=10
yellow=0
red=0
avg_quality_score=0.990
llm_api_calls=12
l3_recheck_triggered_count=2

new L1 control run:
candidate_count_policy=l1_control
requested_candidate_count_histogram={"1":8,"2":2}
l1_dynamic_recheck_count=2
l1_suppressed_count=0
l1_handoff_floor_counts={"primary_agent":2,"no_context_agent":8}
green=9
yellow=0
red=1
avg_quality_score=0.987
llm_api_calls=11
l1_control_followed_count=10
l1_policy_violation_count=0
```

Plain interpretation:

```text
This did not prove a quality lift. The old run was already near ceiling.

It did prove that L1 now actually controls the L2 branch:
- 2 samples were upgraded to two candidates before L3 feedback;
- 8 samples stayed light-single;
- L3 confirmed all 10 L1 decisions were followed;
- total LLM calls dropped from 12 to 11.

The one red sample was:
swe-rebench-openhands:PyPSA__linopy-79

Important detail:
PyPSA failed the first L2 attempt in the old run too. The old L3 repair fixed
it on the second attempt. This new run retried once but still got the same
hard-fail shape: too_few_actionable_tasks + too_many_weak_tasks. So the next
fix is the L3 repair prompt / gate behavior, not another L4 judge.
```

Next work:

```text
1. Inspect PyPSA__linopy-79 in the new L2/L3 reports.
2. Tune the L3 repair prompt so a hard fail cannot repeat the same weak shape.
3. Keep L4 as a handoff gate / executor selector, not a default second LLM
   quality court.
4. Rerun the same 10-sample real Gemini Flash check after the L3 repair tweak.
5. Only call the result "quality improvement" if green rate, avg score, or
   repair success improves without increasing side effects or wasted calls.
```

Next-window recovery phrase:

```text
继续 misa-cybernetic-evolution L1/L2/L3/L4 收口。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 L1 Control and L4 Handoff Closeout 2026-05-19，再读 docs/history/l2-l3-selection-audit-v0.30.md。
用 git status/log 对齐本地状态。

当前结论：L1 已经从标签变成真实控制输入；真实 10 条 Gemini Flash 跑完后，调用数 12 -> 11，但质量没有提升，green 10 -> 9，红样本是 PyPSA__linopy-79。下一步不要再堆 L4 LLM 审判，先修 L3 repair prompt / gate，让 hard_fail 重跑不要重复同样弱任务。
```

## L3 Feedback Loop Implementation Addendum 2026-05-19

This window implemented the first low-risk feedback-loop step inspired by the
minimal ReAct loop review. It does not enable automatic L1 policy mutation.

What changed:

```text
L3 failed gate -> task-level repair observation -> next L2 repair prompt
L3 exhausted repair -> suggestion-only L1 feedback record
```

The new L3 repair observation records:

```text
- violations
- actionableTaskCount / weakTaskCount
- passing task indices
- rewrite task indices
- missing anchor types per failed task
- repair rules for the next L2 attempt
```

The L1 feedback record is deliberately suggestion-only. It may recommend:

```text
- candidate_count for a future run
- a more conservative handoff_floor
- repair_prompt_mode=task_level_l3_observation
```

It does not automatically change:

```text
- L1 thresholds
- global L2 prompt defaults
- gate weights
- route/winner authority
- runtime handoff authority
```

Files changed:

```text
scripts/lib/external-trajectory-llm-work-order-draft.mjs
scripts/lib/l2-l3-selection-audit.mjs
test/external-trajectory-llm-work-order-draft.test.mjs
docs/history/l2-l3-selection-audit-v0.30.md
docs/history/external-trajectory-eval-handoff-v0.26.md
```

Initial verification in this window was intentionally limited:

```text
node --check scripts/lib/external-trajectory-llm-work-order-draft.mjs
node --check scripts/lib/l2-l3-selection-audit.mjs
node --check test/external-trajectory-llm-work-order-draft.test.mjs
=> syntax pass
```

Later local verification in the same window:

```text
npm test
=> 181 tests / 180 pass / 0 fail / 1 skipped

npm run precheck
=> pass
=> static 4/4, contracts 103/103, current-line 25/25,
   bridges 21/21, smoke 12/12

No real LLM, no VPS, no GitHub push.
```

Local sample quant run:

```text
Run path:
runs/l3-feedback-local-quant-20260519-131531/

Input:
7 existing local online-shadow artifacts from
runs/external-trajectory-online-shadow/2026-05-16T-full-local-perception-digests/

Pipeline:
L2 mock work-order draft -> L3 selection audit -> L4 mock handoff review

Summary:
input_count=7
total_l2_samples=22
total_l2_passed=22
total_l2_failed=0
total_llm_api_calls=0
total_l3_green=22
total_l3_yellow=0
total_l3_red=0
total_l4_samples=22
total_l4_accept=22
total_l4_no_context_executable=22
total_l1_feedback_suggestion=0
```

Extended local history-report quant run:

```text
Run path:
runs/l3-feedback-local-history-quant-2026-05-19T05-43-20-746Z/

Input:
10 existing local online-shadow-report*.json files under runs/

Coverage:
distinct_source_count=20
total_l2_samples=200
PyPSA__linopy-79 covered in 10 reports

Pipeline:
L2 mock work-order draft -> L3 selection audit -> L4 mock handoff review

Summary:
total_l2_failed=0
total_llm_api_calls=0
total_l3_green=200
total_l3_yellow=0
total_l3_red=0
total_l4_samples=200
total_l4_accept=200
total_l4_no_context_executable=200
total_l1_feedback_suggestion=0
```

Interpretation:

```text
The normal local/mock path is still clean after the feedback-loop change.
The quant runs did not exercise PyPSA-style real-model red repair behavior
because the mock provider returns ideal drafts. The negative repair behavior is
covered by unit tests, and PyPSA is covered in the extended local history run,
but real repair quality still requires the later 10-sample Gemini Flash rerun.
```

Real 10-sample Gemini Flash VPS rerun:

```text
Run path pulled locally:
runs/l3-feedback-real-gemini-vps-2026-05-19T14-01-57/

Remote temp path:
/tmp/misa-l3-feedback-real-gemini-20260519-140157/

Input:
runs/l2-l3-l1-signal-count2-20/2026-05-18-real-gemini-flash/online-shadow-report.sample20.l1.json

Provider:
hermes-delegate novai/gemini-3-flash-preview

Boundary:
Temporary /tmp run on VPS only.
Local current worktree snapshot was uploaded to the temp repo.
No production service changes.
No memory writes.
No Zilliz writes.
No embeddings.
No route/winner changes.
No GitHub push.
No public publish.
```

Rerun summary:

```text
l2_exit=1
l3_exit=0
l4_exit=0

requested_candidate_count_histogram={"1":8,"2":2}
l1_control_followed_count=10
l1_policy_violation_count=0
llm_api_calls=12

L2 passed_gate=8
L2 failed_gate=2
L3 green=8
L3 yellow=1
L3 red=1
avg_quality_score=0.966

L1 feedback suggestions=2
candidate_count upgrade suggestions=2
handoff_floor upgrade suggestions=1
```

PyPSA result:

```text
swe-rebench-openhands:PyPSA__linopy-79
pool=green
gate_class=near_pass
quality_score=0.975
l3_feedback_status=accepted_first_try
repeated_failure_shape=false
llm_api_calls=1
```

Interpretation:

```text
The PyPSA red sample from the previous L1-control run is fixed in this rerun.
It no longer repeats the hard_fail shape.

This is not an overall quality lift for the full 10-sample batch:
- previous L1-control run: green=9, yellow=0, red=1, avg_quality=0.987, calls=11
- this rerun: green=8, yellow=1, red=1, avg_quality=0.966, calls=12

The failure moved:
- numpy__numpydoc-101 is now red with repeated failure shape
- alexgolec__tda-api-37 is yellow/reviewable and produced suggestion-only L1 feedback

The new feedback loop is doing useful accounting:
L3 repair observations reached the real L2 repair prompt, and exhausted repairs
now produce suggestion-only L1 feedback. But it is not enough yet to call this
a stable quality improvement.
```

L3 gate diagnosis after the VPS rerun:

```text
The repair loop did reach the real model.
The problem was narrower: L3's actionability gate did not recognize several
clear no-effect expectation phrases returned by Gemini.

Examples that humans can understand but the old gate under-counted:
- "without triggering a memory-write request"
- "suppression of all memory-write requests and Zilliz updates"
- "empty write-set for Zilliz collection updates and embedding generation calls"
- "enforcement of a single candidate count"

So numpy__numpydoc-101 and alexgolec__tda-api-37 were mostly false rejects from
the gate vocabulary, not proof that the L3 feedback idea failed.
```

Fix applied:

```text
scripts/lib/external-trajectory-llm-work-order-draft.mjs
- broadened concrete expectation recognition for no-effect wording
- added field recognition for candidate_count / l2_candidate_mode / write-set /
  shadow contract / embedding generation wording

test/external-trajectory-llm-work-order-draft.test.mjs
- added a regression test for concrete no-effect expectation wording
```

Re-gate of the pulled real Gemini outputs after the fix:

```text
Artifact:
runs/l3-feedback-real-gemini-vps-2026-05-19T14-01-57/output/regate-after-expectation-pattern-fix.json

No model calls.
Same pulled real Gemini drafts.

old_pass=8
old_fail=2
old_avg_quality=0.966

new_pass=10
new_fail=0
new_avg_quality=0.995
llm_api_calls=0
```

Historical gate-intercept replay after the fix:

```text
Artifact:
runs/l2-gate-intercept-analysis/2026-05-19-after-expectation-pattern-fix/gate-intercept-analysis.json

No model calls.
Local replay over existing historical L2 reports.

l2_report_count=136
raw_result_count=1551
deduped_result_count=360
unique_source_count=36

Old gate:
pass=189
blocked=171

New gate:
pass=205
near_pass=81
hard_fail=74

Updated pools:
green=286
yellow=4
red=70

old_blocked_near_pass_count=79
old_blocked_pass_count=31
old_blocked_hard_fail_count=61
old_blocked_salvageable_rate_pct=64.3
old_blocked_strong_quality_rate_pct=66.7
avg_old_blocked_quality_score=0.935
verdict=old_hard_gate_was_too_strict_for_near_pass_work_orders
```

Interpretation:

```text
The old hard gate was too strict for this corpus. It blocked 171 historical
outputs, and 64.3% of those blocked outputs were salvageable after replay.

The fix is not simply relaxing the gate:
- 74 items still classify as hard_fail
- 70 items still stay red
- command whitelist, context anchors, acceptance criteria, and task
  actionability still block bad work orders

So the useful change is narrower:
the gate now accepts concrete no-effect wording when the work order still names
files/tests, source/evidence refs, fields/boundaries, and expected results.
It does not accept vague policy summaries as executable work orders.
```

Still not changed in this window:

```text
- no GitHub push
- no production/service changes
```

Next work:

```text
1. If live model confirmation is needed, rerun the same 10 Gemini samples with
   the updated gate and compare against the pulled VPS run.
2. Decide whether L1 should shadow-promote repeated medium-risk
   damping/evidence_trace failures from single candidate to candidate_count=2.
3. Treat automatic L1 threshold/prompt/handoff mutation as a later shadow
   experiment, not as enabled behavior.
```

Next-window recovery phrase:

```text
继续 misa-cybernetic-evolution L3->L2/L1 反馈闭环。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 L3 Feedback Loop Implementation Addendum 2026-05-19，再读 docs/history/l2-l3-selection-audit-v0.30.md。
当前本地只落地低风险闭环：L3 task-level observation 反哺 L2 repair prompt，并产出 suggestion-only L1 feedback；没有自动改 L1 阈值、没有自动升级正式 handoff floor。已跑本地全量测试、precheck、7 份 online-shadow artifact 的 22 条 mock L2/L3/L4 量化、10 份历史 online-shadow-report 的 200 条 mock L2/L3/L4 量化，以及 VPS 真实 10 条 Gemini Flash 复跑。真实复跑已拉回 runs/l3-feedback-real-gemini-vps-2026-05-19T14-01-57/。PyPSA__linopy-79 已从红转绿。随后发现 numpy__numpydoc-101 和 alexgolec__tda-api-37 多数是 L3 gate 词表误判：旧 gate 不认 "without triggering"、"suppression"、"empty write-set"、"enforcement" 等明确 no-effect 预期。已修 gate 词表并重判同一批真实输出：old_pass=8/10 -> new_pass=10/10，new_avg_quality=0.995，llm_api_calls=0。没有 push、没有生产服务变化。下一步若继续真实验证，再跑一轮 10 条 Gemini，确认新 gate 在 live L2 生成链里稳定。
已额外跑历史 L2 gate-intercept replay：136 份历史 L2 report、1551 条 raw result、360 条去重结果；旧 gate blocked=171，新 gate pass=205 / near_pass=81 / hard_fail=74，updated pools green=286 / yellow=4 / red=70；旧 blocked 里 64.3% 是可救回的 near-pass/pass，说明旧 gate 偏硬，但新 gate 仍保留 70 个 red，不是简单放水。
```

### L1 Alpha Simulation Addendum 2026-05-19

Purpose:

```text
Find cheap local alpha before spending new Gemini calls:
- which samples deserve candidate_count=2
- which samples deserve a more conservative handoff floor
- which fixed probe set should be reused for live Gemini comparison
```

New local command:

```bash
npm run selection-audit:l1-alpha -- \
  --adaptation-report runs/l1-alpha-simulation/2026-05-19-swe-stratified500/adapt/external-trajectory-adaptation.json \
  --out-dir runs/l1-alpha-simulation/2026-05-19-swe-stratified500/l1-alpha
```

Source intake:

```text
Dataset root:
F:\misa-agent-datasets\agent-trajectories

Dataset:
swe-rebench-openhands

Sidecar:
sanitized-trajectories.stratified-500.jsonl

Adapter output:
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/adapt/external-trajectory-adaptation.json

Adapter result:
samples=500
issue_count=500
adopted=249
rejected=251
safety_regressions=0
llm_api_calls=0
```

L1 alpha result:

```text
Artifact:
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/l1-alpha/l1-alpha-simulation.json

sample_count=500
l2_eligible_count=500
l1_mode_counts={"recheck":244,"single":256}
candidate_count_hint_counts={"1":256,"2":244}
risk_level_counts={"high":244,"medium":256}
uncertainty_level_counts={"low":256,"medium":244}
evidence_density_counts={"high":500}
simulated_handoff_floor_counts={"no_context_agent":256,"primary_agent":244}
llm_api_calls=0
external_api_calls=0
```

Interpretation:

```text
candidate_count=2 has signal, but it should not become the global default.
It belongs to L1 recheck / high-risk ambiguous samples.

primary_agent handoff has signal, but it should not replace no_context_agent
for every sample. It belongs to the high-risk safety-boundary subset.

The useful split is:
- cheap single/no_context path for 256 lower-risk samples
- candidate_count=2/primary_agent path for 244 higher-risk samples
```

Fixed Gemini probe set:

```text
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/l1-alpha/l1-alpha-simulation.md

selected_source_ids=15

The probe set deliberately mixes:
- high-risk recheck / policy-or-safety samples
- light single damping-noise samples
- resolved=false damping samples
- primary_agent floor samples
```

Local mock L2/L3 probe over the fixed 15:

```text
Artifact:
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/probe-mock-l2-selected15/external-trajectory-llm-work-order-draft.json

No real model calls.

samples=15
candidate_count_policy=l1_control
candidate_mode=l1_controlled_mixed
requested_candidate_count_histogram={"1":9,"2":6}
l1_dynamic_recheck_count=6
light_single_count=9
l1_handoff_floor_counts={"primary_agent":6,"no_context_agent":9}
candidate_count=21
winner_selected=15
passed_gate=15
failed_gate=0
avg_quality_score=1
llm_api_calls=0
```

Regression coverage added:

```text
test/l1-alpha-simulation.test.mjs

The test proves the new L1 alpha CLI can:
- separate high-risk candidate_count=2 pressure from normal single-candidate work
- separate conservative handoff pressure from no-context handoff
- keep llm_api_calls=0
- avoid VPS/GitHub/production side effects
```

Verification:

```text
node --test test/l1-alpha-simulation.test.mjs
PASS

npm test
tests=183
pass=182
fail=0
skipped=1

npm run precheck
PASS

git diff --check
PASS, with Windows LF->CRLF warnings only
```

Current judgment:

```text
The alpha path is useful and not overbuilt yet.
It is still a shadow analysis tool: it does not mutate L1 thresholds, prompts,
gate weights, handoff authority, or runtime behavior.

Next proof step:
Run real Gemini on the same fixed 15 probe source_ids and compare against this
local mock baseline plus the earlier real 10-sample run.
```

Live Gemini A/B verification on the fixed 15 probe set:

```text
Local pulled artifact:
runs/l1-alpha-simulation/2026-05-19-swe-stratified500/real-gemini-vps-ab/comparison.json

Remote temp path:
/tmp/misa-20260519-l1-alpha-gemini15

Provider:
hermes-delegate novai/gemini-3-flash-preview

No production/service changes.
No memory writes.
No Zilliz writes.
No embeddings.
No route/winner changes.
No GitHub push.
```

A/B result:

```text
A: all candidate_count=1
samples=15
candidate_count=15
passed_gate=14
failed_gate=1
avg_quality_score=0.986
llm_api_calls=19
l3_recheck_triggered_count=4
l3_accepted_after_recheck_count=3
l3_exhausted_no_value_count=1
failure=swe-rebench-openhands:numpy__numpydoc-101

B: L1-controlled mixed routing
samples=15
requested_candidate_count_histogram={"1":9,"2":6}
candidate_count=21
passed_gate=15
failed_gate=0
avg_quality_score=0.992
llm_api_calls=15
l3_recheck_triggered_count=0
l3_exhausted_no_value_count=0
```

Delta:

```text
B - A:
avg_quality_score=+0.006
failed_gate_count=-1
llm_api_calls=-4
candidate_count=+6
```

Interpretation:

```text
This fixed 15-probe real Gemini run supports the L1 alpha:
L1-controlled mixed routing beat the all-single baseline. It removed the numpy
red sample, raised average quality, and used fewer API calls despite asking for
two candidates on six higher-risk samples.

The call-count improvement happened because all-single triggered repair reruns:
4 L3 rechecks, 3 accepted after recheck, and 1 exhausted failure. The L1 mixed
run passed first try for every sample.

This is useful evidence, but still scoped:
- it validates this fixed 15-probe set;
- it does not yet prove the rule across the whole 500 sample corpus;
- it still does not enable automatic L1 threshold or handoff mutation.
```

Updated next-window recovery phrase:

```text
继续 misa-cybernetic-evolution L1/L2/L3 反馈闭环。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 L1 Alpha Simulation Addendum 2026-05-19，再读 docs/history/l2-l3-selection-audit-v0.30.md。
当前本地已经完成两条不花 LLM 的校准：1）历史 L2 gate-intercept replay 证明旧 gate 误杀偏多，新 gate 更准；2）SWE-rebench stratified-500 经过 adapter -> L1 alpha simulation，得到 256 条 single/no_context 和 244 条 recheck/primary_agent，并固定 15 条 Gemini probe。mock L2/L3 跑这 15 条：samples=15，candidate_count_histogram={"1":9,"2":6}，passed_gate=15，failed_gate=0，llm_api_calls=0。新增 test/l1-alpha-simulation.test.mjs，npm test/precheck 均通过。还没有 push、没有 commit、没有新 Gemini 调用、没有 VPS/生产变化。下一步若继续验证，用同一批 15 条 source_id 跑真实 Gemini，对比质量和调用数。
已在 VPS /tmp 跑完同一批 15 条真实 Gemini A/B：A=all candidate_count=1，pass=14/15，fail=1，avg_quality=0.986，llm_api_calls=19，失败是 numpy__numpydoc-101；B=L1-controlled mixed，candidate_count_histogram={"1":9,"2":6}，pass=15/15，fail=0，avg_quality=0.992，llm_api_calls=15。结果已拉回 runs/l1-alpha-simulation/2026-05-19-swe-stratified500/real-gemini-vps-ab/。结论：这批固定 probe 上，L1 分流 alpha 成立，但仍是 shadow 证据，不自动改 L1 阈值或 handoff 权限。
```

### Next Calibration Handoff 2026-05-19 After L1 Alpha Commit

This section supersedes the previous recovery phrase above. Use this as the
next-window anchor.

Implementation anchor:

```text
7800679 codex: close l1-l3 feedback alpha loop
```

Current plain-language state:

```text
The loop is now connected enough to learn from L3 failures, but it is not yet
production self-mutation. L3 can feed observations back into L2 repair and can
produce suggestion-only L1 feedback. It does not automatically change L1
thresholds, L2 prompts, gate parameters, or handoff authority.
```

Next window should do three things before adding any stronger production loop:

1. Continue historical-sample false-judgment mining without LLM cost.

   Look for both sides of the mistake:

   - samples that a human would accept, but the gate wrongly kills;
   - samples that the gate accepts, but the work order is actually hollow or too
     vague to be useful.

2. Verify the three L1 judgments directly.

   Measure, with the existing local artifacts first:

   - when `candidate_count=2` is actually worth the extra candidate;
   - when `handoff_floor=primary_agent` is necessary instead of
     `no_context_agent`;
   - which L1 signals tend to cause repeated L3 repair failure.

3. Compare old logic and new logic on the same historical batch.

   Run old-version and new-version logic over the same source ids without LLM
   calls. First judge whether the program-level decisions are steadier. Only
   after local replay shows value should a small real Gemini confirmation run be
   used.

Promotion boundary:

```text
Do not jump straight to automatic threshold or prompt mutation.

The production-grade loop should be:
L3 finds a problem
-> aggregate many similar observations, not one-off noise
-> generate a candidate policy change
-> replay it on historical samples
-> promote only if the replay improves quality and does not add obvious false positives
-> keep rollback, before/after comparison, and a plain explanation of why it changed
```

Next-window recovery phrase:

```text
继续 misa-cybernetic-evolution L1/L2/L3 强闭环校准。
先读 docs/history/external-trajectory-eval-handoff-v0.26.md 的 Next Calibration Handoff 2026-05-19 After L1 Alpha Commit，再读 docs/history/l2-l3-selection-audit-v0.30.md 的 Next Calibration Plan 2026-05-19。
当前实现锚点是 7800679 codex: close l1-l3 feedback alpha loop；本地 main 比 origin/main ahead，先不要 push。
下轮先不花 LLM 钱：继续用历史样本找两类误判：人看能用但 gate 错杀、gate 放过但内容很虚。然后专门验证三件事：什么时候 candidate_count=2 真值、什么时候必须 primary_agent、哪些 L1 信号容易导致 L3 反复修不好。再用同一批历史样本做旧逻辑 vs 新逻辑对比。只有本地回放证明更稳后，才拿小批真实 Gemini 复验。
真正生产级闭环以后再做：L3 问题先汇总，不因单个样本乱改；生成候选策略；历史样本回放验证；通过后才更新 L1 阈值、L2 prompt 或 gate 参数，并且必须可回滚、可对比、可解释。
```

### Local Calibration Replay 2026-05-19 After L1 Alpha Commit

This pass stayed local-only and history-only:

```text
new_llm_api_calls=0
new_external_api_calls=0
touches_vps=false
pushes_github=false
mutates_l1_thresholds=false
mutates_l2_prompt=false
mutates_handoff_floor=false
```

Artifacts:

```text
runs/l2-gate-intercept-analysis/2026-05-19-local-alpha-misjudgment-replay/gate-intercept-analysis.json
runs/l2-l3-quantitative-comparison/2026-05-19-local-alpha-candidate-count-replay/quantitative-comparison.json
runs/l1-alpha-simulation/2026-05-19-local-calibration-rerun/l1-alpha/l1-alpha-simulation.json
runs/l1-l3-local-calibration/2026-05-19-alpha-misjudgment-audit/alpha-misjudgment-audit.json
```

Readout:

```text
gate false judgment:
- scanned_l2_reports=143
- deduped_result_count=420
- old_blocked_count=172
- old_blocked_salvageable_count=110
- old_blocked_salvageable_rate_pct=64
- hollow_old_pass_count=13
- hollow_old_pass_rate_pct=5.2

candidate_count replay on fixed 20-sample historical batch:
- count1 avg_quality=0.958, green=7, yellow=9, red=4, candidates=20
- count2 avg_quality=0.968, green=7, yellow=9, red=4, candidates=40, default_ready=true
- count4 avg_quality=0.960, green=11, yellow=3, red=6, candidates=80, default_ready=false

handoff / L3 repair signal:
- L1 alpha sim handoff floors: {"no_context_agent":256,"primary_agent":244}
- joined L4 rows: no_context_agent accept=205 revise=6; primary_agent accept=21 revise=0
- L3 rows inspected=302
- repair_pressure_count=5
- repeated_failure_count=3
- repeated failures cluster in single + medium-risk + damping + no_context_agent rows
```

Plain interpretation:

```text
The alpha did find real signal, but not a promotion rule yet.

Old hard gate still over-kills: many blocked rows recompute to near_pass/pass.
There is also a smaller opposite pocket: old gate passed 13 hollow rows,
mostly too few actionable tasks / too many weak tasks.

candidate_count=2 is useful on the fixed 20-sample replay, but count4 is too
noisy for default. The handoff signal does not justify globally upgrading
no_context_agent to primary_agent. The next narrow alpha is the false-safe lane:
medium+damping/no_context_agent rows that later exhaust L3 repair.
```

Next calibration boundary:

```text
Do not auto-change L1 thresholds.
Do not auto-change L2 prompts.
Do not auto-upgrade handoff floor.

Next local step should isolate the medium+damping/no_context_agent false-safe
cases and test whether a narrower L1 signal predicts them before any policy
change is proposed.
```

## Local Reflection Replay 2026-05-19

The narrow replay was written to:

- `runs/l1-l3-local-calibration/2026-05-19T13-44-28-927Z-reflection-replay/l3-feedback-reflection-replay.json`
- `runs/l1-l3-local-calibration/2026-05-19T13-44-28-927Z-reflection-replay/l3-feedback-reflection-replay.md`
- `runs/l1-l3-local-calibration/2026-05-19T13-44-28-927Z-reflection-replay/l3-feedback-reflection-library.jsonl`

Local replay summary:

- sample_count: 30
- bad_sample_count: 3
- recorded_recall: 0.667
- recorded_missing_baseline_caught_count: 1
- baseline_recall: 1
- baseline_primary_agent_review_suggested_count: 2
- candidate_recall: 1
- candidate_primary_agent_review_suggested_count: 2
- newly_caught_count: 0
- candidate_good_false_positive_count: 0

Plain result:

```text
The replay is doing the right kind of thing, but the comparison must be read
carefully. One older artifact did not record L1 feedback, so recorded_recall is
0.667. When the current suggestion-only L3 feedback rule is recomputed on the
same rows, baseline_recall is already 1. The reflection candidate still adds
value by turning the same three failed rows into a concrete thin-work-order
rule, and it leaves the 27 normal samples alone.
```

### Local Reflection Stress 2026-05-20

This pass stayed local-only and used no LLM/API/VPS calls.

Artifacts:

```text
runs/l1-l3-local-calibration/2026-05-20T00-00-00-000Z-reflection-stress/l3-feedback-reflection-stress.json
runs/l1-l3-local-calibration/2026-05-20T00-00-00-000Z-reflection-stress/l3-feedback-reflection-stress.md
runs/l1-l3-local-calibration/2026-05-20T00-00-00-000Z-reflection-stress/l3-feedback-reflection-full-library.jsonl
```

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
The rule can take pressure, but only while it stays narrow:
signal_family=keyword_risk_noise + candidate_mode=single + candidate_count=1
+ risk_level=medium + route_hint=damping + handoff_floor=no_context_agent.

In the 556-row full historical background, the strict rule triggered only on
the three known bad thin-work-order rows and did not touch the 247 accepted
rows or the 526-row holdout. But widened variants became noisy fast:
thinness-only created 91 holdout triggers, and 100 boundary probes created
250 triggers across widened variants.

Do not wire this into L1 as an automatic strategy yet. Keep it as a shadow
candidate, collect more bad examples, and require another clean holdout before
any L1 policy integration.
```

## L1/L3 Sample Library Quant 2026-05-20

This pass stayed local-only and spent no model/API/VPS/GitHub budget.

Artifacts:

```text
runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/adapt/external-trajectory-adaptation.json
runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/l1-alpha/l1-alpha-simulation.json
runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/sample-library/l1-l3-sample-library.json
runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/sample-library/l1-l3-sample-library.md
runs/l1-l3-sample-library/2026-05-20T00-30-00-000Z-github-stratified500/sample-library/l1-l3-backfill-queue.jsonl
```

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

l3_source_coverage_count=20
l3_source_coverage_rate=0.04
l3_pool_decision_row_count=556
l3_pool_decision_unique_source_count=36
sample_library_ready=true
l1_auto_strategy_ready=false
```

Plain result:

```text
The GitHub/SWE sample library is now quantified enough for local backfill work,
but not enough for automatic L1 strategy promotion.

L1 split the same 500 source ids into 244 high-risk safety-boundary rows that
deserve candidate_count=2 / primary_agent, and 256 medium+damping rows that
look cheap enough for candidate_count=1 / no_context_agent. The false-safe
reflection lane is those 256 rows.

Only 14 of those 256 rows currently have historical L3 labels. They contain
3 bad/conflict seeds and 11 clean labels, while 242 rows still need L2/L3
backfill labels. That is useful direction, but it is not product-grade proof
for mutating L1 thresholds, prompts, gates, or handoff floors.
```

Next local step:

```text
Use l1-l3-backfill-queue.jsonl as the local label queue. Backfill L2/L3 labels
on prioritized reflection-scope source ids without LLM spend first where
possible. After the bad seed and clean holdout counts are both stronger, replay
candidate L1 policy changes against this same library before any integration.
```

## L1/L3 Backfill Benchmark 2026-05-20

This pass used the sample-library queue to backfill all missing strict
reflection-scope labels locally. It did not call an LLM, touch VPS, push GitHub,
write memory, write Zilliz, create embeddings, or change L1/L2/L3 runtime
policy.

Artifacts:

```text
runs/l1-l3-backfill-benchmark/2026-05-20T02-00-00-000Z-top80/l1-l3-backfill-benchmark.json
runs/l1-l3-backfill-benchmark/2026-05-20T02-00-00-000Z-top80/comparison/quantitative-comparison.json
runs/l1-l3-backfill-benchmark/2026-05-20T02-10-00-000Z-rest162/l1-l3-backfill-benchmark.json
runs/l1-l3-backfill-benchmark/2026-05-20T02-10-00-000Z-rest162/comparison/quantitative-comparison.json
runs/l1-l3-backfill-benchmark/2026-05-20T02-10-00-000Z-rest162/sample-library/l1-l3-sample-library.json
```

Backfill readout:

```text
batch_1_selected=80
batch_1_new_green=80
batch_1_old_template_red=80

batch_2_selected=162
batch_2_new_green=162
batch_2_old_template_red=162

new_llm_api_calls=0
new_external_api_calls=0
touches_vps=false
pushes_github=false
```

Final sample-library readout after both batches:

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

Old-template vs new local hard comparison:

```text
top80:
- old_template: avg_quality=0.407, green=0, red=80
- new_l1_control: avg_quality=1, green=80, red=0

rest162:
- old_template: avg_quality=0.407, green=0, red=162
- new_l1_control: avg_quality=1, green=162, red=0
```

Plain result:

```text
The local sample library is now much stronger on clean holdout: all 256
medium+damping/no_context_agent reflection-scope rows have labels, and 253 are
clean under the current deterministic local L2/L3 path.

The old-template comparison proves the new local work-order shape is better
than the thin old template on the same source ids. But the old-template red
rows are comparison evidence only; they were deliberately not written as
pool-decisions, so they do not inflate the durable bad-seed count.

The remaining blocker is real bad-seed coverage. Durable bad/conflict seeds are
still only 3: PyPSA__linopy-79, numpy__numpydoc-101, and alexgolec__tda-api-37.
That is enough to keep the shadow rule, but not enough to mutate L1 thresholds,
L2 prompts, gate parameters, or handoff floors automatically.
```

Next safe step:

```text
Do not spend more local mock cycles trying to manufacture bad samples. The
clean holdout is now large enough. The next evidence gap is real bad examples:
either mine older real Gemini/VPS L3 failures that match this reflection scope,
or run a tiny controlled real Gemini probe on unresolved/conflict-prone source
ids and append those labels before L1 integration review.
```

## L1/L3 Local Exhaust Report 2026-05-20

This pass exhausts the local evidence that can be used without LLM spend and
without touching VPS. It scans the full local historical `pool-decisions.jsonl`
set, the completed 500-row L1/L3 sample library, and the local SWE-rebench
OpenHands parquet metadata.

Artifacts:

```text
runs/l1-l3-local-exhaust/2026-05-20T03-00-00-000Z-local-exhaust/l1-l3-local-exhaust-report.json
runs/l1-l3-local-exhaust/2026-05-20T03-00-00-000Z-local-exhaust/l1-l3-local-exhaust-report.md
runs/l1-l3-local-exhaust/2026-05-20T03-00-00-000Z-local-exhaust/future-real-probe-candidates.jsonl
```

Quant readout:

```text
historical_pool_decision_files=44
historical_pool_decision_rows=798
historical_unique_sources=278
historical_known_bad_rows=3
historical_known_bad_unique_sources=3
historical_strict_scope_rows=272
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

llm_api_calls=0
external_api_calls=0
touches_vps=false
pushes_github=false
can_create_more_real_l3_labels_without_llm=false
```

Plain result:

```text
Local evidence is now squeezed to the useful boundary.

The real historical L3 bad labels are exhausted locally: there are only 3 known
bad/conflict sources in the current local pool, and all 3 are already inside
the medium+damping/no_context reflection lane.

The 500-row sample library is also closed for this lane: all 256 reflection
scope rows have labels, with 253 clean and 3 bad/conflict.

The 2GB parquet still contains many useful future candidates: 67,074 rows total,
34,913 unresolved rows, and 4,820 unique high-priority candidates not already in
the 500-row sample library. But those are task-outcome proxies, not L3 gate
labels. They can choose the next real probe set; they cannot prove an L3
feedback failure by themselves.
```

Next boundary:

```text
Stop local mock backfill here. The next useful step is not more local labels.
It is a tiny real L2/L3 probe, using future-real-probe-candidates.jsonl as the
candidate list, after manual review selects exact source ids. Do not auto-change
L1 thresholds, L2 prompts, gate weights, or handoff floors from parquet metadata.
```

## Synthetic Bad L3 Pressure Report 2026-05-20

This pass uses real SWE-rebench failed-task metadata as the base, then writes
artificially bad L2 work orders locally to pressure-test the current L3 gate. It
does not call an LLM, touch VPS, push GitHub, change L1 thresholds, change L2
prompts, or upgrade handoff floors.

The 500-row `future-real-probe-candidates.jsonl` shortlist only contains
resolved-false non-submit loop/maximum-iteration rows, so the loop bucket comes
from that shortlist. The resolved-false submit, timeout/provider-error, and
generated-tests-failed buckets come from the same local SWE-rebench OpenHands
parquet metadata used by the local exhaust report.

Artifacts:

```text
runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json
runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md
runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/selected-real-failure-tasks.jsonl
runs/l3-synthetic-bad-pressure/2026-05-20T04-00-00-000Z-synthetic-bad/synthetic-bad-samples.jsonl
```

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

Plain result:

```text
Current L3 gate catches this synthetic_bad pressure set cleanly.

All 90 intentionally bad work orders are hard-failed. The feedback reflection
also fires for all 90, with candidate_count=2 and primary_agent review suggested
for every row because the samples are thin and failed.

There are no obvious bad samples that L3 let through in this run. Keep the
result as pressure-test evidence only: it is not durable bad-seed history and
must not be merged into real bad/conflict seed counts.
```

## Adversarial Synthetic Bad L3 Pressure Report 2026-05-20

This is the stronger follow-up to the obvious synthetic_bad run above. It keeps
the same 30 real SWE-rebench failed-task bases, but expands each base task from
3 obvious bad work orders to 8 bad work orders: 3 obvious rule probes plus 5
pass-like adversarial probes. The adversarial probes deliberately include
surface anchors, source refs, whitelisted commands, acceptance criteria, and
forbidden scope, while hiding wrong objectives, evidence mismatch, non-causal
verification, boundary shell games, or no-op anchor stuffing.

Artifacts:

```text
runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json
runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md
runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/selected-real-failure-tasks.jsonl
runs/l3-synthetic-bad-pressure/2026-05-20T04-30-00-000Z-synthetic-bad/synthetic-bad-samples.jsonl
```

Quant readout:

```text
variant_profile=adversarial
base_task_count=30
base_task_category_counts={"loop_max_iteration":10,"resolved_false_submit":10,"timeout_provider_error":5,"missing_patch_or_generated_tests_failed":5}
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

Blind spots exposed:

```text
wrong_objective_pass_like: false_pass=30/30
evidence_mismatch_pass_like: false_pass=30/30
verification_mismatch_pass_like: false_pass=30/30
boundary_shell_game_pass_like: false_pass=30/30
anchor_stuffing_noop_pass_like: false_pass=30/30
```

Plain result:

```text
The current L3 gate is strong against obviously thin, broad, or empty work
orders, but weak against pass-like semantic failures. If a bad work order
includes enough file/source/field/expectation tokens and uses whitelisted
commands, L3 can score it as perfect even when the objective, evidence mapping,
verification meaning, or boundary intent is wrong.

This is pressure-test evidence only. It must not be counted as real durable bad
seed history, and it does not authorize automatic L1 threshold, L2 prompt, gate,
or handoff-floor changes.
```

## Record-Only Semantic Observer Massive Pressure Report 2026-05-20

This follow-up lands a record-only semantic observer for the synthetic_bad
pressure lane. It does not change L3 authority or gate outcomes. It only writes
extra observation fields on each local pressure sample, so the report can show
when L3 accepted a work order that looks complete but is wrong in meaning.

Artifacts:

```text
runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json
runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md
runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/selected-real-failure-tasks.jsonl
runs/l3-synthetic-bad-pressure/2026-05-20T05-00-00-000Z-synthetic-bad/synthetic-bad-samples.jsonl
```

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

Observer reason counts:

```text
wrong_objective_on_failed_base=636
evidence_claim_conflicts_with_failed_base=636
verification_does_not_prove_claim=636
boundary_words_conflict_with_requested_outcome=636
anchor_stuffing_without_real_work=636
```

Plain result:

```text
The current L3 result is unchanged: it still catches the 1908 obvious bad work
orders and still lets the 3180 pass-like semantic bad work orders through.

The new record-only observer catches all 3180 L3 false passes in this synthetic
run. That is useful as a local warning layer, but it is not yet a production
gate. The clean false-positive rate is not proven here because this run contains
only synthetic_bad samples. Before turning this into a blocking rule, replay it
against a real clean/near-pass corpus and measure mistaken blocks.

No VPS, GitHub push, LLM/API call, L1 threshold change, L2 prompt change,
handoff-floor upgrade, pool-decision write, or durable bad-seed write happened.
```

## Real L2 Shell Semantic Pressure Report 2026-05-20

This replaces the weak part of the earlier synthetic_bad pressure test. The
main bad rows are no longer missing-field work orders. The test starts from
stored L2 drafts that already pass the current local L3 format/quality gate,
then mutates only the meaning while preserving the L2 shell: evidence refs,
task count, acceptance criteria, whitelisted commands, and forbidden scope stay
complete.

Two local replays were written:

```text
strict stored-real-LLM subset:
runs/l3-real-l2-semantic-pressure/2026-05-20T06-00-00-000Z-real-l2-semantic/real-l2-semantic-pressure.json
runs/l3-real-l2-semantic-pressure/2026-05-20T06-00-00-000Z-real-l2-semantic/real-l2-semantic-pressure.md

broader current-gate-passed local L2 set:
runs/l3-real-l2-semantic-pressure/2026-05-20T06-10-00-000Z-real-l2-semantic/real-l2-semantic-pressure.json
runs/l3-real-l2-semantic-pressure/2026-05-20T06-10-00-000Z-real-l2-semantic/real-l2-semantic-pressure.md
```

Strict stored-real-LLM subset:

```text
source_profile=real-llm-only
base_count=20
clean_control_count=20
bad_sample_count=100
bad_format_gate_pass_count=100
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
total_sample_count=1668
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

Per semantic mutation, broader set:

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

Plain result:

```text
This version is a stronger test than the obvious synthetic_bad run. Every bad
sample still has a valid L2-shaped shell and passes the current L3 gate. That
means the old L3 is blind to these meaning-level failures when the form is good.

The record-only observer caught every mutated semantic failure in this replay
and did not fire on the original clean controls. This is useful evidence for an
observe-only warning layer. It still should not become a hard blocking gate from
this run alone, because the bad mutations are deterministic and local. The next
proof step is a different clean/near-pass corpus plus non-template bad examples.
```

## Semantic Observation Boundary Hardening 2026-05-20

This follow-up applies the Pro review boundary guidance to the local observer
implementation. The observer remains after the formal L3 gate. It is explicitly
record-only and recommendation-only: it does not change the formal L3 pass/fail
result, does not execute count2, does not route to primary_agent, does not write
durable bad seeds, and does not mutate L1 thresholds, L2 prompts, gate weights,
or handoff floors.

Implementation changes:

```text
semantic_observer_mode=record_only
schema_version=misa.l3_semantic_observation.v2
semantic_actions removed from new samples
semantic_recommended_actions added
recommendation_only=true
recommendation_executed=false
formal_gate_mutated=false
legacy_quality_pool_mutated=false
durable_bad_seed_written=false
lifecycle_budget.used_count2 recorded
lifecycle_budget.used_l3_recheck recorded
lifecycle_budget.recommended_terminal_route recorded
```

Recommendation split:

```text
wrong_objective / evidence_mismatch / verification_mismatch:
  recommend candidate_count_2 only when count2 has not already been used

boundary_contradiction / anchor_stuffing:
  recommend primary_agent_review_suggested

if count2 was already used:
  do not recommend another count2
  add budget_reason=count2_budget_already_used
  recommend primary_agent_review_suggested instead
```

Updated local pressure artifacts:

```text
runs/l3-synthetic-bad-pressure/2026-05-20T07-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.json
runs/l3-synthetic-bad-pressure/2026-05-20T07-00-00-000Z-synthetic-bad/l3-synthetic-bad-pressure.md
runs/l3-real-l2-semantic-pressure/2026-05-20T07-20-00-000Z-real-l2-semantic/real-l2-semantic-pressure.json
runs/l3-real-l2-semantic-pressure/2026-05-20T07-20-00-000Z-real-l2-semantic/real-l2-semantic-pressure.md
```

Synthetic_bad massive rerun:

```text
task_profile=massive
variant_profile=adversarial
base_task_count=636
synthetic_sample_count=5088
l3_intercept_count=1908
false_pass_count=3180
semantic_warning_candidate_count=3180
semantic_false_pass_caught_count=3180
semantic_false_pass_recall=1
observer_candidate_count_2_suggestion_count=1908
observer_primary_agent_suggestion_count=1272
observer_recommendation_executed_count=0
observer_formal_gate_mutation_count=0
semantic_budget_reason_counts={}
```

Real L2 shell rerun:

```text
source_profile=all-gate-passed-local-l2
base_count=278
clean_control_count=278
bad_sample_count=1390
bad_format_gate_pass_count=1390
l3_false_pass_count=1390
semantic_false_pass_caught_count=1390
semantic_false_pass_recall=1
clean_semantic_false_positive_count=0
observer_candidate_count_2_suggestion_count=792
observer_primary_agent_suggestion_count=598
observer_recommendation_executed_count=0
observer_formal_gate_mutation_count=0
bad_semantic_budget_reason_counts={"count2_budget_already_used":42}
```

Plain result:

```text
The red L3 gate behavior is unchanged: hard L3 failures can still be returned
to L2 once for repair. The semantic observation layer is different: it only
records warnings and recommendations after a formal L3 pass. It does not perform
the count2 rerun, does not hand off to primary_agent, and does not alter the old
L3 result or quality pool.

The Pro review concern is now encoded as code and tests: count2 is a lifecycle
budget, not a branch-local retry. If a real L2 base already came from count2 or
count4, the observer will not recommend another count2; it records
count2_budget_already_used and recommends primary_agent review instead.
```

## L4 High-Risk Authorization Boundary 2026-05-20

This lands the L4 open-source handoff rule for high-risk side effects. L4 stays
a local review program by default. It does not execute the work order and does
not call an LLM when provider=mock. Its job is to decide whether the work order
can be handed to an execution target, or whether explicit user/maintainer
authorization is required first.

Generic high-risk scopes:

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

New L4 behavior:

```text
if a work order requests a high-risk side effect:
  verdict=owner_needed
  handoff_target=maintainer_or_owner
  requires_user_authorization=true
  recommended_next_step=request_user_authorization
  recommendation_only=true
  executes_work_order=false

if no high-risk side effect is requested and the handoff is self-contained:
  verdict=accept
  handoff_target=no_context_worker
```

Important boundary:

```text
High risk is not treated as "reject by default". It means "do not hand this to a
worker until the user/maintainer explicitly authorizes the side effect."
```

Validation:

```text
node --test test/l4-work-order-review.test.mjs
```

## L1-L4 Pipeline Wiring 2026-05-20

The local L1/L2/L3/L4 path is now wired into one command. This is orchestration
only: it does not make L4 an executor and does not spend model tokens by
default.

Command:

```text
npm run work-order:l1-l4 -- --l2-report <path-to-existing-l2-report>
```

Default behavior:

```text
L1 control is read from the L2 draft report.
L2 provides the generated work-order draft.
L3 selection audit classifies green/yellow/red and records repair outcomes.
L4 mock review runs on L3-forwarded rows.
L4 high-risk side effects return owner_needed + requires_user_authorization.
```

Output layout:

```text
runs/l1-l4-work-order-pipeline/<timestamp>/
  l1-l4-work-order-pipeline.json
  l1-l4-work-order-pipeline.md
  l2/external-trajectory-llm-work-order-draft.json
  l3/quality-report.json
  l3/pool-decisions.jsonl
  l4/l4-review-report.json
  l4/l4-review.jsonl
```

Boundary:

```text
L3 red feedback can repair L2 once inside the L2 draft run.
L4 does not repair, execute, push, deploy, publish, write memory, write
databases, or mutate L1/L2/L3. L4 only writes the final handoff review:
accept / revise / reject / human_needed / owner_needed.
```
