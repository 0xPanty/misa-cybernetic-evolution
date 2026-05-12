# Self-repair v0.6

v0.6 turns skill crystallization from a note-taking layer into a draft repair
loop. It is still not a production publisher.

## Command

```bash
npm run self-repair:misa
npm run self-repair:misa -- --candidate-id skill-candidate-misa-skill-recovery-workflow-001
npm run self-repair:misa -- --no-verify
npm run self-repair:misa -- --no-verify --run-root runs/self-repair-check --generated-root runs/self-repair-check/skill-drafts --repair-plan-root runs/self-repair-check/repair-plans
```

The command reads staged skill crystallization candidates, writes draft repair
artifacts, and optionally verifies them.

Use the custom output-root flags during full validation or CI when you want to
inspect self-repair behavior without rewriting tracked `generated/` artifacts.

## Write Scope

The command may write only:

- `generated/skill-drafts/`
- `generated/repair-plans/`
- `runs/self-repair/`

Those defaults can be redirected with `--run-root`, `--generated-root`, and
`--repair-plan-root`.

It must not write Hermes memory, Zilliz, production skill directories, Discord,
AgentMail, Farcaster runtime files, systemd units, cron entries, or provider
configuration.

## Run Log

Each candidate gets its own run directory:

```text
runs/self-repair/<timestamp>-<candidate-id>/
  run-manifest.json
  candidate-before.json
  repair-plan.json
  patch.diff
  command-log.jsonl
  test-output/
  final-report.json
  failure-report.json
```

`failure-report.json` exists only when verification fails or times out.

## Failure Behavior

The first v0.6 implementation is intentionally bounded:

- every verification command has a timeout;
- commands are allowlisted;
- failure stops the run;
- no publication occurs;
- `--no-verify` output is marked `draft_generated` and still needs review;
- a failed run is marked `needs_human_review`;
- logs are redacted for common secret patterns.

This lets Misa produce a concrete repair draft and evidence for Codex/Huan to
review without letting the learning plane alter production behavior.

## Publication Boundary

`validated_draft` means the draft files and repo checks passed. It does not mean
the skill is published or installed into Misa's production runtime.
