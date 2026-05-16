# External Trajectory Adapter v0.27

Layer 2 is now a shadow-only adapter for local external trajectory datasets.

Command:

```bash
npm run external:adapt -- --max-per-dataset 2
```

Quantitative stratified batch:

```bash
npm run external:adapt -- --sampling-profile stratified --target-samples 80
```

SWE-rebench sanitized sidecar input:

```bash
npm run external:adapt -- --datasets swe-rebench-openhands --swe-rebench-sidecar sanitized-trajectories.jsonl
```

The sidecar must live under the local dataset directory by default:

```text
F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.jsonl
```

It is JSONL and must already be sanitized. The adapter accepts compact fields
such as:

```text
instance_id
resolved / tests_passed / success
suggestion_count / action_count / tool_call_count
adopted_count / rejected_count
raw_risk_keyword_count
actual_risk_keyword_count
non_actual_risk_keyword_count
command_contexts
correction_count / failure_report_count / rejection_count / takeover_count
confidence
```

The adapter does not persist raw SWE-rebench rows. It emits only project-native
shadow records and parser notes from the sanitized sidecar.

Optional local sidecar builder:

```powershell
python -m venv runs\.venv-swe-rebench-sidecar
.\runs\.venv-swe-rebench-sidecar\Scripts\python.exe -m pip install pyarrow
.\runs\.venv-swe-rebench-sidecar\Scripts\python.exe scripts\external-trajectory-swe-rebench-sidecar.py --limit 20 --output F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.sample20.jsonl
```

The builder reads local parquet rows and writes only compact sanitized counters.
It does not persist trajectory text, tool arguments, model patches, or raw logs.
Use `--limit 0` only when a full local conversion is intentionally desired.

Stratified sample command:

```powershell
.\runs\.venv-swe-rebench-sidecar\Scripts\python.exe scripts\external-trajectory-swe-rebench-sidecar.py --sampling-profile stratified --sample-size 500 --max-rows-per-row-group 200 --batch-size 64 --output F:\misa-agent-datasets\agent-trajectories\swe-rebench-openhands\sanitized-trajectories.stratified-500.jsonl
```

This scans a bounded slice from every parquet row group, buckets rows by
actual-risk command, non-actual command noise, resolved true/false, and command
context density, then writes a deterministic sanitized sidecar.

Output:

```text
runs/external-trajectory-adaptation/<timestamp>/external-trajectory-adaptation.json
runs/external-trajectory-adaptation/<timestamp>/external-trajectory-adaptation.md
```

The adapter fixes the current repo commit as the baseline for the batch and
emits one sanitized record per readable external sample. Each record contains:

```text
work_order_sample
adoption_ledger_sample
rejection_reason_sample
safety_boundary_sample
resolved_proxy_sample
```

Boundary:

- shadow-only
- no work-order execution
- no persistent memory write
- no raw external data persisted in this repo
- no LLM calls
- no external API calls
- no VPS access
- no GitHub push
- no winner or route authority changes

The adapter deliberately accumulates issues instead of changing weights while it
runs. Parameter calibration belongs to Layer 3, after enough records exist.

Sampling profiles:

- `head`: deterministic first-N smoke sampling.
- `stratified`: deterministic bucket sampling for safety labels, failure
  categories, and SWE-chat adoption/pushback/command-risk proxies.

The quantitative report includes issue rates, resolved/adoption proxy rates,
user-pushback rates, command-keyword context rates, evidence-strength counts,
and calibration-target priority. These are Layer 2 measurements only; they do
not change weights or winner authority.

SWE-chat command context is intentionally split before safety scoring:

```text
actual_command
hook_command
tool_result_output
plan_or_instruction
quoted_or_log_output
unknown
```

Raw keywords such as `git push` or `rm -rf` are therefore treated as
classification inputs. They are not final safety evidence unless they appear in
an actual-command context.

Current coverage:

- ATBench JSON safety records
- ATBench-Codex JSON rollout safety records
- AgentRx GitHub fallback annotated failure records
- SWE-chat transcript JSONL or whole-JSON records

Known Layer 2 gap:

- SWE-rebench OpenHands currently exists locally as a large parquet file. The
  adapter can now read a public-safe JSONL sidecar, but the current local
  dataset directory has no sidecar yet. If neither a sidecar nor a local parquet
  reader exists, the adapter records `parquet_reader_not_available`.
