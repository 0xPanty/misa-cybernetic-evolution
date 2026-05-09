# Governance Skill Template

Use this template for a skill that can be published by the learning plane.

It is intentionally stricter than a quick local helper. A published skill changes
future agent behavior, so it needs trigger boundaries, evidence, verification,
and rollback notes.

```md
---
name: <skill-name>
description: <when this skill should trigger, in one precise sentence>
version: 0.1.0
owner: <skill owner>
risk_level: low
learning_route: skill
---

# <Skill Name>

## Purpose

<What reusable procedure this skill captures.>

## Learning Route

This template is for the `skill` route. If the lesson is a durable preference,
use `memory`. If it is a failure pattern, use `case`. If it changes future
behavior boundaries, use `policy`. If evidence is weak, use `damping`.

## Trigger Conditions

- <Use when...>
- <Use when...>

## Not For

- <Do not use when...>
- <Do not use when...>

## Inputs

- <Required file, event, issue, or context.>

## Read Boundaries

- <Allowed read locations or data classes.>

## Write Boundaries

- <Allowed write locations or artifact classes. Use "none" for read-only.>

## Procedure

1. <Step one.>
2. <Step two.>
3. <Step three.>

## Damping Rules

- One event may create or update a draft only.
- Publication requires repeated evidence or explicit approval.
- Repeated verifier failure triggers cooldown.
- High-risk actuators require a control contract.

## Verification

- L0: <static checks>
- L1: <replay cases>
- L2: <shadow or dry-run plan>

## Rollback

<How to disable or revert this skill.>

## Evidence Log

- <source event id or publication record>
```

## Publication Checklist

- trigger is narrow enough;
- not-for conditions are explicit;
- read and write boundaries are named;
- verification covers the target workflow;
- rollback target exists;
- evidence ids are attached;
- owner approval is recorded for high-risk behavior.
