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
    loser_class: entry.loser_class ?? null,
    failure_type: entry.failure_type ?? null,
    candidate_pool_effect: entry.candidate_pool_effect ?? null,
    candidate_pool_authority: entry.candidate_pool_authority ?? null,
    candidate_pool_action: entry.candidate_pool_action ?? null,
    hard_filter_allowed: entry.hard_filter_allowed ?? false,
    agent_review_required: entry.agent_review_required ?? false,
    l4_review_required: entry.l4_review_required ?? false,
    review_path: entry.review_path ?? null,
    review_trigger: entry.review_trigger ?? null,
    selection_hint: entry.selection_hint ?? null,
    reactivation_conditions: entry.reactivation_conditions ?? [],
    rehabilitation_record: entry.rehabilitation_record ?? null,
    observed_at: entry.observed_at ?? null,
    last_triggered_at: entry.last_triggered_at ?? null,
    source_count: entry.source_count ?? null,
    decay_weight: entry.decay_weight ?? null,
    confidence: entry.confidence ?? null,
    contrast: entry.contrast ?? null,
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
        evidence_count: loser.evidence_count ?? null,
        risk_level: null,
        tournament_id: tournament.tournament_id,
        variant_id: loser.variant_id,
        strategy: variant?.strategy ?? null,
        blocked_requests: loser.blocked_requests ?? [],
        violations: variant?.constraints?.violations ?? [],
        loser_class: loser.loser_class ?? null,
        failure_type: loser.failure_type ?? null,
        candidate_pool_effect: loser.candidate_pool_effect ?? null,
        candidate_pool_authority: loser.candidate_pool_authority ?? null,
        candidate_pool_action: loser.candidate_pool_action ?? null,
        hard_filter_allowed: loser.hard_filter_allowed ?? false,
        agent_review_required: loser.agent_review_required ?? false,
        l4_review_required: loser.l4_review_required ?? false,
        review_path: loser.review_path ?? null,
        review_trigger: loser.review_trigger ?? null,
        selection_hint: loser.selection_hint ?? null,
        reactivation_conditions: loser.reactivation_conditions ?? [],
        rehabilitation_record: loser.rehabilitation_record ?? null,
        observed_at: loser.observed_at ?? null,
        last_triggered_at: loser.last_triggered_at ?? null,
        source_count: loser.source_count ?? null,
        decay_weight: loser.decay_weight ?? null,
        confidence: loser.confidence ?? null,
        contrast: loser.contrast ?? null,
        production_authority: false,
        publication_allowed: false
      });
    }
  }

  return [...preflightLedger, ...variantLedger];
}
