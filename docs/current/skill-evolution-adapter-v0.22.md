# Skill Evolution Adapter

The skill evolution adapter is the first full-perception plug-in surface. It
lets any behavior layer describe what happened, then lets Qianxuesen supervise
both safety and improvement.

## Shape

```text
skill doc or runtime notes
  -> skill control intake template
  -> skill evolution contract
  -> behavior event
  -> Qianxuesen skill evolution supervisor
  -> pass / warn / fail + replay-required evolution candidates
```

The adapter is deterministic by default. It does not require an LLM key. A model
may help extract a contract from prose, but runtime supervision uses the
contract and behavior event fields.

## What It Adds

This is not only a constraint layer. It creates a safe runway for autonomous
improvement:

- behaviors can report concrete optimization signals
- skills can declare allowed evolution space
- candidates can be generated from positive feedback
- promotion stays replay-gated
- forbidden targets are blocked before they become skill changes

## Current Command

```bash
npm run skill:evolution
```

The default command reads the Farcaster reply operator contract and the public
reply behavior fixture. It returns a replay-required `reply_scoring` candidate
while keeping:

- no writes
- no production authority
- no controller authority
- no LLM calls
- no route or winner changes

Use explicit files like this:

```bash
npm run skill:evolution -- --contract-file examples/skill-evolution/farcaster_reply_operator.contract.json --event-file examples/behavior-events/farcaster_public_reply.event.json --json
```

## Boundary

The supervisor can inspect a behavior event and propose an evolution candidate.
It cannot:

- publish content
- write persistent memory
- change a skill
- change route ownership
- call providers
- promote a candidate without replay

The event itself may describe a live or durable behavior. The supervisor still
has `no_write: true`; unsafe event effects become violations or review
requirements.

## First Contract Pair

- [schemas/skill_evolution_contract.schema.json](../../schemas/skill_evolution_contract.schema.json)
- [schemas/behavior_event.schema.json](../../schemas/behavior_event.schema.json)

The first sample pair is Farcaster-specific, but the contract is not. Discord,
email, code repair, support bots, and calendar agents should adapt through the
same behavior-event shape.
