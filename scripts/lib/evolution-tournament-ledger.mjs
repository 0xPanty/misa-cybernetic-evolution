import { safeId } from "./evolution-tournament-utils.mjs";

function normalizePreflightExperience(entry) {
  return {
    ledger_id: entry.ledger_id ?? `exp-preflight-${safeId(entry.candidate_id ?? entry.source_event_id)}`,
    source: entry.source ?? "candidate_preflight",
    candidate_id: entry.candidate_id,
    source_event_id: entry.source_event_id,
    route_target: entry.route_target,
    status: entry.status ?? "suppressed",
    retained_as: entry.retained_as ?? "preflight_experience",
    lesson: entry.lesson,
    score: entry.score ?? null,
    evidence_count: entry.evidence_count ?? null,
    risk_level: entry.risk_level ?? null,
    tournament_id: null,
    variant_id: null,
    strategy: null,
    blocked_requests: [],
    violations: [],
    production_authority: false,
    publication_allowed: false
  };
}

export function buildTournamentExperienceLedger({ preflight, tournaments }) {
  const preflightLedger = (preflight.experience_ledger ?? []).map(normalizePreflightExperience);
  const variantLedger = [];

  for (const tournament of tournaments) {
    for (const loser of tournament.loser_ledger) {
      const variant = tournament.variants.find((item) => item.variant_id === loser.variant_id);
      variantLedger.push({
        ledger_id: `exp-variant-${safeId(loser.variant_id)}`,
        source: "tournament_variant",
        candidate_id: tournament.candidate_id,
        source_event_id: tournament.source_event_id,
        route_target: loser.route_target,
        status: loser.status,
        retained_as: loser.becomes,
        lesson: loser.status === "rejected"
          ? "Rejected variants stay as damping or case evidence; do not retry them without changed evidence or gates."
          : "Safe non-winning variants stay as comparison experience, not publication candidates.",
        score: variant?.scores?.composite ?? null,
        evidence_count: null,
        risk_level: null,
        tournament_id: tournament.tournament_id,
        variant_id: loser.variant_id,
        strategy: variant?.strategy ?? null,
        blocked_requests: loser.blocked_requests ?? [],
        violations: variant?.constraints?.violations ?? [],
        production_authority: false,
        publication_allowed: false
      });
    }
  }

  return [...preflightLedger, ...variantLedger];
}
