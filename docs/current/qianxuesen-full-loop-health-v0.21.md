# Qianxuesen Full-Loop Health v0.21

`health:qianxuesen` writes a small manifest after the local full-loop shadow
run. It is not a daemon, notifier, memory writer, or repair system.

It answers one practical question:

```text
Did the Qianxuesen loop finish safely, and where are the detailed artifacts?
```

## Command

```bash
npm run health:qianxuesen
npm run health:qianxuesen -- --json
npm run health:qianxuesen -- --root runs/qianxuesen-full-loop
```

By default it writes:

```text
runs/qianxuesen-full-loop/
  latest.json
  latest.md
  history/
    <run-id>/
      health.json
      health.md
      artifacts/
        current-line-smoke.json
        current-line-calibration.json
```

`latest.*` is the quick entrypoint. `history/<run-id>/` is append-only for that
run. The manifest stays small: it records the verdict, key findings, safety,
coverage, component summaries, sample-set summaries, failures, and paths to the
component artifacts. It does not embed full logs.

Use `--no-history` only for a temporary local check where history is not useful.

## What It Covers

The first v0.21 manifest is built from the existing current-line smoke and
calibration reports. Together they cover:

- source distillation and signal extraction;
- deterministic Qianxuesen route ownership;
- memory layer, repair-ticket, and work-order routing checks;
- component-health pure reducers and replayable diagnostic-candidate boundary checks;
- perception as hint-only shadow input;
- retrieval ranking with requested-kind priority;
- tournament and judge boundaries;
- no live write, no Zilliz write, no embedding creation, no provider call, no
  route change, and no winner change.

## Report Shape

The top-level report includes:

- `verdict`: the plain-language pass/fail readout and recommended next step;
- `key_findings`: the short facts a reviewer should read first;
- `component_status`: pass/fail by loop stage;
- `component_summaries`: compact metrics for smoke, source distillation,
  Qianxuesen routing, repair tickets, work orders, component health,
  perception, retrieval, tournament, judge, and sample sets;
- `safety`: authority and live-effect flags;
- `coverage`: sample, source, route, retrieval, perception, and judge counts;
- `artifacts`: paths to the detailed component JSON files.

Plain version: detailed artifacts remain in their own files. The health manifest
is the front door for quickly seeing whether the run is safe and where to look
next.
