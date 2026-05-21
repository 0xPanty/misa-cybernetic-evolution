# Control Boundaries

This document makes the implicit control boundaries explicit. It is the
12-factor "own your control flow" view of the Qianxuesen layer.

## Dumb Zone

A dumb zone is a place where the decision must be deterministic. If the same
input must always produce the same control answer, an LLM must not own that
decision.

LLMs must not decide:

- learning route: memory, skill, case, policy, damping, or ignore;
- metric measurement;
- setpoint mutation;
- metric registry mutation;
- stability safe-mode entry or release;
- post-deploy verdict;
- work-order execution authority;
- route or winner authority;
- provider route changes;
- public posting approval;
- persistent memory writes;
- skill installation or publication;
- VPS or production updates.

LLMs may be used only as proposal or translation surfaces when the surrounding
schema says so:

- candidate drafting;
- critique notes;
- verification-gap notes;
- plain-language summaries for a human owner.

The local guard for the deterministic control path is the provider-call scan in
`npm run precheck`. It blocks provider/client imports, provider endpoints, and
dynamic provider imports inside the registered control files.

## Authority Matrix

| Decision point | Default owner | Automatic? | Human decision required when |
| --- | --- | --- | --- |
| Route classification | deterministic Qianxuesen route table | yes | route rule itself needs mutation |
| Metric measurement | deterministic metric module | yes | metric registry or sampling rule changes |
| Candidate context selection | `context-curator` | yes | source set expands beyond allowed context sections |
| Prompt template selection | deterministic manifest lookup | yes | template content or variables change |
| Candidate draft generation | route-focused generator | yes, as draft only | durable/public/credential/provider/VPS effect appears |
| Work-order variant scoring | deterministic scorer | yes | scoring formula or winner authority changes |
| LLM critique recommendation | deterministic value gate | yes, recommendation only | separate model call is enabled |
| Human escalation packet | deterministic escalation builder | yes | human owner must approve, reject, modify, or choose executor |
| Post-deploy negative verdict | post-deploy measurement | recommendation only | rollback execution is requested |
| Safe mode entry | stability monitor | yes | safe-mode release is requested |
| Safe mode release | human owner | no | always |
| Outer-loop setpoint adjustment | outer-loop review | recommendation only | setpoint is changed |
| Metric registry expansion | outer-loop review | recommendation only | registry is changed |
| Production or VPS rollout | human owner | no | always |

## v0.27 Rule

The factor-compliant candidate layer can make candidate generation cleaner, but
it cannot widen authority. Any new prompt, context packet, reducer, or generator
must keep these defaults:

```text
production_authority=false
runtime_fetch_allowed=false
llm_tool_calls_allowed=false
route_authority=false
winner_authority=false
```
