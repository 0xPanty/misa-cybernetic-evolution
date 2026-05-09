# Misa Launch Profile

## Verdict

This v0.2 repository can be used as Misa's official structure reference, local
precheck layer, and dry-run learning-loop simulator.

That is enough for a first real launch: it gives Misa a shared control contract,
schema set, Skill template, damping rules, and a command that checks whether the
repo still runs cleanly. It also provides a small Misa fixture simulation that
shows how lessons route to memory, skill, case, policy, or damping.

It is not a background runtime service yet.

## Included Now

- keep this repository as a sidecar reference;
- run the Misa learning-loop fixture simulation;
- run local schema validation;
- run local dry-run precheck;
- draft Misa-specific control contracts;
- use the governance Skill template for future draft skills;
- review proposed learning/memory/skill changes before publication.

## Not In This v0.2

- session-distiller backlog processing;
- starting `misa-session-distiller.timer`;
- Discord session mechanism changes;
- Farcaster session mechanism changes;
- automatic memory or skill publication;
- any service that changes Misa behavior without a separate implementation step.

## Launch Levels

| Level | Meaning | Current status |
| --- | --- | --- |
| L0 Reference | Docs, schemas, and local checks only | allowed |
| L1 Read-only adapter | Redacted event fixtures, no live effect | next step |
| L2 Shadow | Runs beside production, no user-visible output | not started |
| L3 Canary | Limited activation on low-risk traffic | later |
| L4 Live runtime | Can write or affect production behavior | later |

## Misa v0.2 Gate

The current gate is encoded in:

- [schemas/integration_profile.schema.json](../schemas/integration_profile.schema.json)
- [examples/misa_readonly_integration.example.json](../examples/misa_readonly_integration.example.json)
- [examples/misa_readonly_control_contract.example.json](../examples/misa_readonly_control_contract.example.json)

Run:

```bash
npm run simulate:misa
npm run validate:schemas
npm run precheck
npm test
```

The precheck must pass before treating this repository as Misa's current
reference/precheck/simulation layer.

## Next Safe Step

The next safe step is L1 replay or read-only adapter design:

1. map redacted real events into the v0.2 fixture shape;
2. produce draft `LearningCycleTrace` objects;
3. validate schemas and run simulation;
4. reject any live-effect request;
5. keep all writes inside the local repository until a new control contract is
   approved.
