import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runLoserPressureMatrix,
  runLoserPressureQuant
} from "../scripts/lib/loser-pressure-quant.mjs";

test("loser pressure quant simulates accumulated loser memory without model authority", async () => {
  const result = await runLoserPressureQuant({
    targetSamples: 80,
    useOllama: false,
    now: new Date("2026-05-18T00:00:00+08:00")
  });

  assert.equal(result.mode, "loser-pressure-quant");
  assert.equal(result.metrics.sample_count, 80);
  assert.equal(result.safety.local_model_used_for_sample_generation_only, true);
  assert.equal(result.safety.model_decides_winner, false);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.safety.embedding_created, false);
  assert.equal(result.safety.git_touched, false);
  assert.ok(result.metrics.unsafe_recall >= 0);
  assert.ok(result.rolling_windows.length > 0);
});

test("loser pressure matrix compares parameter candidates across long-run scenarios", async () => {
  const result = await runLoserPressureMatrix({
    targetSamples: 60,
    useOllama: false,
    now: new Date("2026-05-18T00:00:00+08:00")
  });

  assert.equal(result.mode, "loser-pressure-matrix");
  assert.ok(result.total_scenario_runs > 1);
  assert.ok(result.parameter_summaries.length > 1);
  assert.equal(result.safety.model_decides_winner, false);
  assert.equal(result.safety.git_touched, false);
  assert.equal(result.safety.vps_touched, false);
  assert.ok(result.parameter_summaries.every((item) => item.scenario_count > 0));
});
