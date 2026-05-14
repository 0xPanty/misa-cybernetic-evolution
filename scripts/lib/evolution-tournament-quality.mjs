import {
  average,
  noLiveEffects,
  round
} from "./evolution-tournament-utils.mjs";

export function buildQualityAssessment({ tournaments, source }) {
  const winners = tournaments
    .map((tournament) => tournament.variants.find((variant) => variant.variant_id === tournament.winner.variant_id))
    .filter(Boolean);
  const variants = tournaments.flatMap((tournament) => tournament.variants);
  const rejected = variants.filter((variant) => variant.tournament_status === "rejected");
  const routePreservation = winners.length === 0
    ? 0
    : average(winners.map((winner) => winner.constraints.checks.route_preserved ? 1 : 0));
  const safetyLock = winners.length === 0
    ? 0
    : average(winners.map((winner) => (
      winner.constraints.hard_gate_passed
      && winner.safety.production_authority === false
      && winner.safety.publication_allowed === false
      && noLiveEffects(winner.safety.live_effects)
    ) ? 1 : 0));
  const holdout = average(winners.map((winner) => winner.scores.holdout));
  const compactness = average(winners.map((winner) => winner.scores.compactness));
  const failureLearning = tournaments.length === 0
    ? 0
    : Math.min(1, rejected.length / tournaments.length);
  const sampleCoverage = source.optimization_candidate_count === 0
    ? 0
    : Math.min(1, source.tournament_candidate_count / source.optimization_candidate_count);
  const overall = round(
    routePreservation * 0.22
      + safetyLock * 0.24
      + holdout * 0.2
      + failureLearning * 0.14
      + compactness * 0.1
      + sampleCoverage * 0.1
  );

  return {
    mode: "deterministic_proxy_v1",
    llm_api_calls: 0,
    overall_quality_score: overall,
    dimensions: {
      route_preservation: round(routePreservation),
      safety_lock: round(safetyLock),
      holdout_strength: round(holdout),
      failure_learning: round(failureLearning),
      compactness: round(compactness),
      source_coverage: round(sampleCoverage)
    },
    notes: [
      "Quality score is deterministic and local; no model was called.",
      "The score measures route preservation, safety lock, holdout strength, failure learning, compactness, and source coverage."
    ]
  };
}
