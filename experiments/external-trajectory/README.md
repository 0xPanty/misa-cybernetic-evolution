# External Trajectory Experiments

This directory contains the external-trajectory research line for SWE-rebench
style trajectory mining, online shadow readouts, alpha comparisons, and LLM
work-order draft experiments.

It is not part of the v0.25 current line.

Plain boundary:

- run these commands only when reviewing this experiment line;
- default CI and `npm test` do not include this directory;
- use `npm run test:experiments` when you intentionally want to replay it;
- do not expand this into a new current-line dependency without a separate
  promotion review.

Useful entrypoints:

- `npm run experiments:external:adapt`
- `npm run experiments:external:command-stress`
- `npm run experiments:external:side-by-side`
- `npm run experiments:external:alpha`
- `npm run experiments:external:compare`
- `npm run experiments:external:online-shadow`
- `npm run experiments:external:llm-work-order`
- `npm run experiments:external:llm-work-order:recheck`
- `npm run experiments:external:generic-adapter`

