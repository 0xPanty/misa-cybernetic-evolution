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

