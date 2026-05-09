# Misa Learning Evidence v0.4

v0.4 adds a small evidence-attribution gate to the read-only replay layer.

The change borrows one useful idea from SkillClaw without adopting its proxy,
server, cloud store, dashboard, PRM scoring, or automatic publication path:
prompt-time skill injection is not proof that a skill helped. Only explicit
read or modified artifacts count as attribution evidence.

## What Changed

- Every Misa fixture now includes `artifact_evidence`.
- Generated traces now include normalized `artifact_evidence`:
  - `injected`: artifacts merely listed or available;
  - `read`: artifacts explicitly read during the task;
  - `modified`: artifacts explicitly changed during the task;
  - `referenced`: the union of `read` and `modified`;
  - `tool_errors`: redacted error categories relevant to the route.
- Every fixture declares `expected_candidate_state`.
- Generated traces now include `candidate_review`.
- `npm run simulate:misa` checks candidate state and blocks publication.

## Attribution Rule

`injected` is useful context, but it is not evidence of use.

For skill routes:

- if a skill was read or modified, the simulator can stage an improvement for
  that existing skill;
- if no skill was read or modified, a reusable workflow can only create a new
  candidate;
- an injected-only skill must not be credited as the affected artifact.

## Candidate States

The local replay layer uses these states:

| State | Meaning |
| --- | --- |
| `staged` | Candidate exists only as a local replay result |
| `held` | Evidence is too thin; collect more signal |
| `rejected` | Candidate or signal failed validation |
| `validated` | Reserved for a future gate, not used for publication in v0.4 |
| `none` | No candidate was produced |

v0.4 never publishes. `candidate_review.publication_allowed` must stay `false`
for every generated trace.

## Boundary

This is still local dry-run replay only. Passing v0.4 does not approve:

- live runtime attachment;
- Discord or Farcaster session-mechanic changes;
- Zilliz or persistent-memory writes;
- background timers;
- automatic Skill publication;
- gbrain/cbrain adapter work.
