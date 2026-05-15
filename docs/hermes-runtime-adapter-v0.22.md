# Hermes Runtime Adapter v0.22

`hermes:adapt-runtime` is the first concrete runtime plug for the universal
Qianxuesen adapter contract.

It is observe-only by default. It does not install into Hermes, start services,
write Hermes memory, mutate Hermes skills, block runtime tools, call LLMs, or
call external APIs.

## Plain Shape

```text
Hermes hook/tool trace
-> normalize into Qianxuesen runtime event
-> create research digest or replay-required candidate
-> send candidate into replay/tournament later
```

Hermes stays the carrier runtime. Qianxuesen stays the learning controller.

## Mapped Hermes Surfaces

| Hermes surface | Qianxuesen use |
| --- | --- |
| `pre_tool_call` | observe tool intent before runtime execution |
| `post_tool_call` | observe result, failure, and evidence refs |
| `pre_llm_call` | observe model-request boundary |
| `post_llm_call` | observe output and background-review pressure |
| `on_session_end` | flush adapter events into a digest boundary |
| `skill_manage` | skill variant pressure, replay required |
| `memory` | memory or policy pressure, no durable write |
| `session_search` / web research | research digest evidence |
| Hermes curator | background skill lifecycle pressure |

## Candidate Rule

The adapter can produce:

- `research_digest`
- `skill_variant`
- `policy_boundary_variant`
- `research_followup`
- `damping_rule_candidate`

All evolution candidates are marked:

- `replay_required: true`
- `tournament_required: true`
- `can_promote_now: false`

This keeps the useful Hermes self-improvement signal without letting runtime
events directly rewrite Qianxuesen memory, skills, policy, or route state.

## Verification

```bash
npm run hermes:adapt-runtime -- --json
npm run validate:schemas
npm run smoke:current-line
npm run precheck
npm test
```

The default fixture is:

- `test/fixtures/hermes-runtime-adapter/hermes-self-improvement-events.json`

The output schema is:

- `schemas/agent_runtime_adapter.schema.json`
