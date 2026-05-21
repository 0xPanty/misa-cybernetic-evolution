# Hermes Distillation Mapping v0.15

v0.15 adds the bridge from existing Hermes/Zilliz distillation artifacts into
the Qianxuesen control-learning layer.

The split is intentional:

- Hermes/Zilliz is the memory distillation and retrieval layer.
- Qianxuesen is the control-learning layer for routing, repair tickets, work
  orders, damping, and closed-loop improvement.
- The mapper is only a translation interface between the two.

It does not make this repository a Zilliz memory system, and it does not turn
the project into a Farcaster bot.

## Input

The mapper accepts already-produced local artifacts such as:

- Hermes session summary or LLM distillation summary;
- Zilliz chunk refs or chunk manifest rows;
- journal refs or journal-plan entries;
- audit refs or audit paths;
- risk, outcome, and quality fields;
- optional Farcaster daily quality reports.

It treats these as evidence pointers. It does not reread raw private windows by
default and does not call a vector store.

## Output

The mapper emits:

- one `misa.local_distillation_source.v1` object;
- compact learning events created through the existing local distiller;
- routing metadata for memory, case, policy, damping, operator quality, repair
  tickets, or owner review;
- a repair-ticket input when the artifact is an engineering failure pattern;
- a work-order summary generated through the existing work-order router when a
  repair or operator-quality handoff is needed.

The source refs, chunk refs, journal refs, and audit refs are preserved in
`artifact_evidence.read` so a reviewer can trace the result back to the original
Hermes/Zilliz artifact.

## Safety Contract

Default behavior is pure script execution:

- `llm_api_calls: 0`
- `external_api_calls: 0`
- `ai_second_pass_enabled: false`
- `embedding_created: false`
- `zilliz_written: false`
- `production_journal_written: false`
- `writes_persistent_memory: false`
- `posts_publicly: false`
- `autonomous_execution_allowed: false`

AI second-pass is a future explicit option only. It is not enabled by the
current mapper and it must never be silently turned on.

## Routing Rules

Normal distilled summaries become local learning input, usually `memory` or
`case` depending on the signals.

Farcaster daily quality reports become `operator_quality` work orders. They go
to `persona_operator_agent` under `ask_before_execution`; the mapper never sends
a post.

Repeated engineering failures become repair-ticket and work-order input. The
default executor is `specialized_engineering_agent`, and the packet must carry
reproduction evidence plus acceptance criteria.

Missing evidence blocks execution. If source refs or audit refs are missing,
the mapper returns `routing_status: blocked` and does not create an executable
work order.

High-risk surfaces go to `human_owner`. Production, credentials, public send,
durable memory writes, provider routes, services, and timers require audit and
rollback gates and cannot be executed autonomously.

## Command

Run all mapping fixtures:

```bash
npm run hermes:map-distillation -- --json
```

Run one fixture:

```bash
npm run hermes:map-distillation -- --fixture examples/hermes-distillation-mapping/normal-summary.input.json --json --dry-run
```

The five acceptance fixtures are:

- `normal-summary.input.json`
- `farcaster-quality.input.json`
- `repeated-failure.input.json`
- `missing-evidence.input.json`
- `high-risk.input.json`

Each has a matching `*.expected.json` file that captures the expected route,
executor, work-order status, and zero-call safety assertions.
