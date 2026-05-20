import assert from "node:assert/strict";
import { test } from "node:test";
import {
  measurePostDeployTicket,
  reviewPostDeployTickets,
  samplePostDeployTickets
} from "../scripts/lib/post-deploy-measurement.mjs";
import {
  evaluateEvolutionTournamentGate,
  reviewEvolutionTournamentGate
} from "../scripts/lib/evolution-tournament-gate.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

test("post-deploy measurement classifies positive negative and null effects without live authority", () => {
  const review = reviewPostDeployTickets({
    tickets: samplePostDeployTickets(),
    now: new Date("2026-05-20T00:00:00.000Z")
  });

  assert.equal(review.ok, true);
  assert.equal(review.summary.result_count, 3);
  assert.equal(review.summary.decision_counts.confirmed_positive, 1);
  assert.equal(review.summary.decision_counts.confirmed_negative, 1);
  assert.equal(review.summary.decision_counts.null_effect, 1);
  assert.equal(review.safety.production_authority, false);
  assert.equal(review.safety.rollback_executed, false);
  assert.equal(review.safety.llm_api_calls, 0);
  assert.equal(review.safety.external_api_calls, 0);

  const negative = review.post_deploy_results.find((result) => result.decision_at_window_end === "confirmed_negative");
  assert.ok(negative);
  assert.equal(negative.rollback.recommended, true);
  assert.equal(negative.rollback.executed, false);
  assert.equal(negative.damping.recommended, true);
  assert.equal(negative.damping.case_candidate, true);
  assert.equal(negative.review_route, "post_deploy_review");
});

test("measured deployment tickets validate the machine contract", async () => {
  const measured = measurePostDeployTicket(samplePostDeployTickets()[0], {
    now: new Date("2026-05-20T00:00:00.000Z")
  });
  const validation = await validateJsonData({
    schemaRel: "schemas/deployment-ticket.schema.json",
    data: measured,
    name: "measured deployment ticket"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("evolution tournament consumes historical post-deploy results as advisory pressure only", async () => {
  const result = await reviewEvolutionTournamentGate({
    historicalPostDeployResults: samplePostDeployTickets(),
    now: new Date("2026-05-20T00:00:00.000Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.source.historical_post_deploy_result_count, 3);
  assert.equal(result.summary.historical_post_deploy_result_count, 3);
  assert.equal(result.summary.post_deploy_decision_counts.confirmed_negative, 1);
  assert.equal(result.historical_post_deploy_results.summary.confirmed_negative_count, 1);
  assert.equal(result.historical_post_deploy_results.safety.production_authority, false);
  assert.equal(result.historical_post_deploy_results.safety.rollback_executed, false);
  assert.equal(result.historical_post_deploy_results.safety.llm_api_calls, 0);
  assert.equal(result.control_boundary.route_owner, "qianxuesen");
  assert.equal(result.control_boundary.automatic_promotion_allowed, false);
  assert.equal(result.safety.production_authority, false);
  assert.deepEqual(evaluateEvolutionTournamentGate(result), []);
});
