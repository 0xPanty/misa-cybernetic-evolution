import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  reviewOuterLoop,
  runOuterLoopReview,
  sampleOuterLoopMetricRegistryGaps
} from "../scripts/lib/outer-loop-review.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

test("outer-loop review emits slow-loop recommendations without mutation authority", async () => {
  const review = reviewOuterLoop({
    now: new Date("2026-05-21T00:00:00.000Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/outer-loop-review.schema.json",
    data: review,
    name: "outer-loop review"
  });
  const types = new Set(review.recommendations.map((item) => item.recommendation_type));

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  assert.equal(review.ok, true);
  assert.equal(review.review_window.value, 7);
  assert.equal(review.summary.recommendation_count, 5);
  assert.equal(review.summary.actionable_recommendation_count, 4);
  assert.equal(types.has("setpoint_adjustment_candidate"), true);
  assert.equal(types.has("route_recalibration_candidate"), true);
  assert.equal(types.has("metric_registry_expansion_candidate"), true);
  assert.equal(types.has("no_change"), true);
  assert.equal(review.safety.production_authority, false);
  assert.equal(review.safety.route_predicate_mutated, false);
  assert.equal(review.safety.metric_registry_mutated, false);
  assert.equal(review.safety.setpoint_mutated, false);
  assert.equal(review.safety.llm_api_calls, 0);
  assert.equal(review.safety.external_api_calls, 0);
  assert.equal(review.recommendations.every((item) => item.authority === "human_review_required_before_mutation"), true);
  assert.equal(review.recommendations.every((item) => item.proposed_mutation.touches_production === false), true);
});

test("outer-loop registry gaps become metric expansion candidates only", () => {
  const review = reviewOuterLoop({
    metricTrends: [],
    routeOutcomes: [],
    metricRegistryGaps: sampleOuterLoopMetricRegistryGaps(),
    now: new Date("2026-05-21T00:00:00.000Z")
  });

  assert.equal(review.summary.recommendation_count, 1);
  assert.equal(review.summary.metric_registry_expansion_candidate_count, 1);
  assert.equal(review.recommendations[0].recommendation_type, "metric_registry_expansion_candidate");
  assert.equal(review.recommendations[0].target_surface, "metric_registry");
  assert.equal(review.recommendations[0].proposed_mutation.changes_metric_registry, false);
  assert.equal(review.safety.metric_registry_mutated, false);
});

test("outer-loop CLI helper writes reports only when an out-file is explicit", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-outer-loop-"));
  const reportPath = path.join(tempRoot, "outer-loop-review.json");

  await runOuterLoopReview({
    now: new Date("2026-05-21T00:00:00.000Z")
  });
  assert.deepEqual(await fs.readdir(tempRoot), []);

  const report = await runOuterLoopReview({
    now: new Date("2026-05-21T00:00:00.000Z"),
    outFile: reportPath
  });
  const payload = JSON.parse(await fs.readFile(reportPath, "utf8"));

  assert.equal(payload.schema_version, "misa.outer_loop_review.v1");
  assert.equal(payload.summary.recommendation_count, report.summary.recommendation_count);
  assert.equal(payload.safety.production_authority, false);
  assert.equal(payload.safety.route_predicate_mutated, false);
  assert.equal(payload.safety.metric_registry_mutated, false);
  assert.equal(payload.safety.setpoint_mutated, false);
  assert.equal(payload.safety.llm_api_calls, 0);
});
