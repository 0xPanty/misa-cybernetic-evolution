# Factor-Compliant Candidate Layer v0.27

v0.27 does not move this repository into a 12-factor framework. It adds the
micro-level agent discipline that fits under the existing Qianxuesen macro
control layer.

Plain rule:

```text
Qianxuesen decides whether evolution stays controlled.
The factor-compliant candidate layer decides how candidate generation stays
small, locked, reviewable, and reproducible.
```

## Scope

The v0.27 layer covers candidate generation and handoff only.

It may:

- curate the exact context a candidate generator may see;
- reference versioned prompt templates;
- emit unified human escalation packets;
- produce deterministic draft candidate surfaces from locked input;
- split generator responsibilities by route.

It must not:

- execute work orders;
- write persistent memory;
- install or publish skills;
- call model providers or external APIs;
- fetch runtime context after the candidate context is built;
- change Qianxuesen route, metric, stability, winner, or authority decisions;
- touch VPS or production services.

## Current Shape

```text
work-order routing
-> candidate-generation-context
-> human escalation packet when authority is needed
-> factor candidate reducer
-> route-focused generator discipline
-> existing deterministic validation
```

The first implementation is intentionally local and zero-call. It creates
machine-readable context and reducer outputs so future LLM-backed candidate
generation can be reviewed against the same contracts before it is enabled.

## Implementation Order

1. `context-curator`: build `misa.candidate_generation_context.v1`.
2. `unified human escalation`: build `misa.human_escalation.v1`.
3. `prompt templates versioning`: keep prompts under `prompts/` with a manifest.
4. `pure candidate reducer`: same context plus same seed gives the same draft
   candidate fingerprints.
5. `route-specific focused generators`: memory, skill, case, policy, damping,
   and work-order generators each get a single-responsibility charter.
6. `control-boundaries.md`: document the dumb zone and authority matrix.

## Commands

```bash
npm run candidate:context -- --json --dry-run
npm run human:escalation -- --json
npm run candidate:reduce -- --json --seed stable-review
```

Use strict JSON handoff files when chaining commands:

```bash
npm run work-order:route -- --json --dry-run --out-file runs/manual/work-orders.json
npm run candidate:context -- --work-order-file runs/manual/work-orders.json --out-file runs/manual/candidate-context.json
npm run candidate:reduce -- --context-file runs/manual/candidate-context.json --seed stable-review --json
```

## 12-Factor Mapping

| 12-factor idea | v0.27 local expression |
| --- | --- |
| Own your context window | `candidate-generation-context` locks what the generator sees |
| Own your prompts | prompt manifest and versioned prompt files |
| Tools are structured outputs | candidate and escalation packets are schemas, not execution |
| Contact humans with tools | `human_escalation` is the single review packet |
| Stateless reducer | `factor-candidate-reducer` is deterministic by context and seed |
| Small focused agents | route-specific generator charters |
| Compact errors into context | deferred to runtime thread work; current layer only preserves bounded evidence |

## Boundary

This layer is not v0.28 runtime autonomy. Launch/pause/resume, unified thread
state, event triggers, and runtime-control adapters stay future work.
