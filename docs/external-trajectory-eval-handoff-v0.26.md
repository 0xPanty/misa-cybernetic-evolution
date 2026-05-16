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
继续 misa-cybernetic-evolution，先读 docs/external-trajectory-eval-handoff-v0.26.md。
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
doc: docs/external-trajectory-adapter-v0.27.md
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
doc: docs/external-trajectory-side-by-side-v0.28.md
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
docs/external-trajectory-eval-handoff-v0.26.md
docs/external-trajectory-adapter-v0.27.md
docs/external-trajectory-side-by-side-v0.28.md
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Current Progress Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md。
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
先只读 docs/external-trajectory-eval-handoff-v0.26.md 的 Stratified-500 Alpha Addendum 2026-05-15 和 Next Window Recovery Phrase 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Stratified-500 Alpha Addendum 2026-05-15。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Command Context Classifier Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Command Context Classifier Addendum 2026-05-15。
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
  commit=d4b8f577918721618307261efaa729a2366f45da
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Final Full-Batch Comparison Addendum 2026-05-16，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Final Full-Batch Comparison Addendum 2026-05-16。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Benign/Complexity Alpha Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Benign/Complexity Alpha Addendum 2026-05-15。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Guarded Alpha Ablation Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Guarded Alpha Ablation Addendum 2026-05-15。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Shadow Policy Surface Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Shadow Policy Surface Addendum 2026-05-15。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Side-by-Side Shadow Policy Readout Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Side-by-Side Shadow Policy Readout Addendum 2026-05-15。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Window Closeout 2026-05-16 和 Qianxuesen Second-Order Alpha Fit Addendum 2026-05-15，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Window Closeout 2026-05-16。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Qianxuesen Second-Order Shadow Ablation/Readout Addendum 2026-05-16，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Qianxuesen Second-Order Shadow Readout Addendum 2026-05-16。
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
先读 docs/external-trajectory-eval-handoff-v0.26.md 的 Qianxuesen Generalization Guard Addendum 2026-05-16，再读 docs/external-trajectory-side-by-side-v0.28.md 的 Qianxuesen Generalization Guard Readout Addendum 2026-05-16。
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
