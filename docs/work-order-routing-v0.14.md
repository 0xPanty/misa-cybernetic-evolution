# Work Order Routing v0.14

`work-order:route` turns repair tickets and operator-quality reports into
traceable work orders. It is a routing layer, not an executor.

The generic pattern is:

```text
evidence
-> ticket or quality report
-> work order
-> primary agent explains it to the user
-> user chooses execute / hold / escalate
-> selected executor acts under the work order scope
```

## Why This Exists

Open-source users will not all share the same Misa + Codex operating model.
Some people want their main agent to self-review. Some want engineering work to
go to a stronger coding model. Some want every change held for manual approval.

The router keeps those choices explicit:

- the `primary_agent` receives every work order first;
- the work order names a `suggested_executor`;
- the user can decline, hold, or escalate to a stronger model;
- source refs, evidence, acceptance criteria, and forbidden scope stay attached.
- `routing_policy` records the chosen operating mode, so later reviewers can see
  whether the agent was only reporting, asking first, or allowed to handle
  bounded work by itself.

## Receiver Slots

The default slots are deliberately generic:

| Slot | Use |
|---|---|
| `primary_agent` | Explains the work order and asks the user what to do |
| `persona_operator_agent` | Reviews voice, content quality, topic choice, and operator behavior |
| `specialized_engineering_agent` | Handles code, tests, schemas, deployment, rollback, and tooling |
| `stronger_model` | Handles hard repair or design work after user escalation |
| `human_owner` | Approves public, durable, credential, memory, or production-impacting changes |

For the Misa/Hermes setup, this maps naturally to:

- operations/persona quality -> Misa self-review first;
- engineering repair -> Codex-style repair pass;
- broad or risky design -> stronger model by user choice;
- live publish, memory write, credential, or VPS changes -> Huan approval.

Other projects can rename the slot labels without changing the safety contract.

## Routing Policy Switches

The default mode is conservative:

```json
{
  "mode": "ask_before_execution",
  "auto_execute_allowed": false,
  "max_auto_severity": "P3",
  "auto_execute_categories": []
}
```

Supported modes:

| Mode | Behavior |
|---|---|
| `report_only` | The primary agent only reports the work order and waits |
| `ask_before_execution` | The primary agent asks the user to execute, hold, or escalate |
| `agent_autonomous_low_risk` | The agent may execute only categories and severities allowed by policy |
| `agent_autonomous_within_scope` | The agent may execute allowed in-scope work orders, still blocking durable/public effects |

The important switches are:

- `auto_execute_allowed`: global permission for bounded autonomous execution;
- `max_auto_severity`: the highest severity that can run without another user
  decision, for example `P3` means only low-risk work;
- `auto_execute_categories`: allowed categories, such as `operator_quality`, or
  `*` for every category still permitted by the safety gates;
- `stronger_model_policy`: keeps the recommendation rule visible when the work
  order is too broad, high-risk, or complex for the current model;
- `durable_or_public_effect_policy`: fixed to `human_owner_required`.

Even in autonomous modes, work orders with public output, persistent memory,
credentials, provider routes, production services, or other durable effects stay
blocked for owner approval.

## Commands

Route the current local repair-ticket review without writing files:

```bash
npm run work-order:route -- --json --dry-run
```

Write ignored local artifacts under `runs/work-orders/<timestamp>/`:

```bash
npm run work-order:route
```

Route a saved repair-ticket review:

```bash
npm run work-order:route -- --repair-ticket-file runs/repair-tickets/manual-check/repair-ticket.json --json --dry-run
```

Route an operator-quality report:

```bash
npm run work-order:route -- --operator-report-file state/farcaster/daily-reports-latest.json --json --dry-run
```

Choose an output directory:

```bash
npm run work-order:route -- --out-dir runs/work-orders/manual-check
```

Run in report-only mode:

```bash
npm run work-order:route -- --routing-mode report_only --json --dry-run
```

Allow low-risk operator-quality work orders to run within scope:

```bash
npm run work-order:route -- --routing-mode agent_autonomous_low_risk --auto-execute --max-auto-severity P3 --auto-categories operator_quality --json --dry-run
```

## Work Order Contents

Each work order includes:

- `source_refs`: the ticket, report, source event, or quality record that caused
  the work order;
- `delivery`: always the primary agent first;
- `suggested_executor`: the best default executor slot;
- `task_gate`: complexity, value, doability, and error-discovery cost;
- `traceability`: evidence, reproduction commands, acceptance criteria, editable
  scope, forbidden scope, audit requirement, and rollback need;
- `execution_policy`: user confirmation, no auto execution, and no durable or
  public effect by default, unless routing policy allows bounded low-risk
  execution;
- `escalation`: when stronger-model handoff is reasonable;
- `model_handoff`: whether the current model is enough for a first pass or
  should recommend a stronger model before execution;
- `user_prompt`: a plain-language prompt the primary agent can show to the user.

## Safety

The router does not:

- execute repairs;
- call model providers;
- publish public content;
- write persistent memory;
- install skills;
- update VPS or production services;
- load credentials.

It only writes local ignored artifacts when `--dry-run` is not used.

## Closed Loop Shape

This creates the practical self-evolution loop without silent mutation:

```text
agent observes
-> control layer detects error or opportunity
-> work order is created with evidence
-> primary agent reports it to the user
-> user chooses self-review, engineering repair, stronger-model escalation, or hold
-> result is auditable and can feed the next cycle
```

That is the conservative layer: the system can notice and propose its own
improvement, but execution remains scoped, traceable, and user-directed.
