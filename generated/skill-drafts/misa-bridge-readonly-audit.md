# Misa Bridge Read-only Audit

## Status

- state: validated_draft
- publication_allowed: false
- human_publish_approval_required: true

## Trigger

- reusable_workflow
- read_only_verification
- setpoint:make bridge checks useful without polluting live conversations

## Procedure

1. Identify the bridge or service under inspection and keep live-message tests disabled by default.
2. Check systemd state first with service-specific is-active/status evidence.
3. Review recent journal lines for startup, provider, rate-limit, timeout, and permission errors.
4. Check the process list for duplicate, stale, or stuck bridge processes.
5. Review artifact, temp-file, and secret-scan cleanliness before any live user-visible test.
6. If a live Discord, AgentMail, or Farcaster message is still needed, stop and ask Huan for explicit approval first.

## Evidence

- source_event_id: misa-skill-readonly-audit-002
- source_cycle_id: cycle-misa-skill-readonly-audit-002
- evidence_basis: no existing skill was explicitly used; create a new candidate only
- quality_score: 0.86

## Boundaries

- Do not write persistent memory.
- Do not replace Zilliz.
- Do not publish Farcaster posts.
- Do not publish this Skill automatically.
- Do not change session mechanics.
- Do not start timers or services.

## Missing Before Publication

- needs the concrete service name at run time
- needs human approval before any live message
