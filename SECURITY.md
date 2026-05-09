# Security and Safety

## Supported Reports

This repository is a design scaffold. If you find a security issue in an
implementation derived from it, report it to that implementation owner.

## Design Security Rules

### Redaction First

Learning events should avoid raw secrets and private content. Prefer:

- hashes
- structured metadata
- redacted snippets
- short summaries
- allowlisted fields

### No Silent Production Writes

The learning plane must not silently:

- post publicly
- delete persistent data
- change provider routes
- start timers
- mutate session mechanics
- publish memory or skills

### Least Privilege

Use staged permissions:

- L1 read only
- L2 run local checks
- L3 write drafts and test artifacts
- L4 publish or alter production behavior

### Auditability

Every publication should be traceable to:

- evidence
- validation
- approval
- version
- rollback target

### Controller Isolation

Only one controller should publish to a given artifact namespace. Other
controllers may propose or validate but should not write concurrently.
