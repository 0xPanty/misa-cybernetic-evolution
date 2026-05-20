# Selection Audit Experiments

This directory contains the L1/L3, L1-L4, L3 pressure, and L4 review audit
experiments that were used to calibrate external work-order handoff behavior.

It is not part of the v0.25 current line.

Plain boundary:

- run these commands only when reviewing this experiment line;
- default CI and `npm test` do not include this directory;
- use `npm run test:experiments` when you intentionally want to replay it;
- keep the line stable unless a separate promotion review moves a small piece
  back into the current line.

Useful entrypoints:

- `npm run experiments:selection-audit:work-order:l1-l4`
- `npm run experiments:selection-audit:review`
- `npm run experiments:selection-audit:l4-review`
- `npm run experiments:selection-audit:compare`
- `npm run experiments:selection-audit:gate-intercepts`
- `npm run experiments:selection-audit:l1-alpha`
- `npm run experiments:selection-audit:l3-feedback:reflection-replay`
- `npm run experiments:selection-audit:l3-feedback:stress`
- `npm run experiments:selection-audit:l3:synthetic-bad`
- `npm run experiments:selection-audit:l3:real-l2-semantic-pressure`
- `npm run experiments:selection-audit:l1-l3:sample-library`
- `npm run experiments:selection-audit:l1-l3:backfill-benchmark`
- `npm run experiments:selection-audit:l1-l3:local-exhaust`

