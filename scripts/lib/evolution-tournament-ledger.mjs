import { safeId, stableHash } from "./evolution-tournament-utils.mjs";
import {
  METRIC_REGISTRY_VERSION,
  PLANT_MODEL_VERSION,
  TOURNAMENT_LEDGER_METRIC_ID
} from "./evolution-tournament-contract.mjs";

function decisionForStatus(status) {
  if (["shadow_reportable", "winner", "kept"].includes(status)) return "keep";
  if (["rejected", "blocked", "reverted"].includes(status)) return "revert";
  return "skip";
}

function ledgerHash(fields) {
  return `diff-${stableHash(JSON.stringify(fields))}`;
}

function normalizePreflightExperience(entry, { timestamp }) {
  const status = entry.status ?? "suppressed";
  const ledgerId = entry.ledger_id ?? `exp-preflight-${safeId(entry.candidate_id ?? entry.source_event_id)}`;
  return {
    ledger_id: ledgerId,
    iteration_id: entry.iteration_id ?? ledgerId,
    source: entry.source ?? "candidate_preflight",
    candidate_id: entry.candidate_id,
    source_event_id: entry.source_event_id,
    route_target: entry.route_target,
    status,
    retained_as: entry.retained_as ?? "preflight_experience",
    lesson: entry.lesson,
    change_diff_hash: entry.change_diff_hash ?? ledgerHash({
      source: entry.source ?? "candidate_preflight",
      candidate_id: entry.candidate_id,
      source_event_id: entry.source_event_id,
      status,
      retained_as: entry.retained_as ?? "preflight_experience"
    }),
    plant_model_version: PLANT_MODEL_VERSION,
    metric_registry_version: METRIC_REGISTRY_VERSION,
    metric_id: TOURNAMENT_LEDGER_METRIC_ID,
    metric_value: entry.metric_value ?? entry.score ?? null,
    decision: entry.decision ?? decisionForStatus(status),
    reason_ref: entry.reason_ref ?? ledgerId,
    timestamp: entry.timestamp ?? entry.observed_at ?? timestamp,
    last_sample_ts: entry.last_sample_ts ?? entry.last_triggered_at ?? entry.observed_at ?? timestamp,
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
    consecutive_no_change_count: entry.consecutive_no_change_count ?? 0,
    convergence_status: entry.convergence_status ?? "running",
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

function convergenceStatusFor({ noChangeCount, scopeDriftLevel }) {
  if (scopeDriftLevel === "high") return "scope_drift_suspected";
  if (noChangeCount >= 2) return "incumbent_retained_x2";
  if (noChangeCount === 1) return "incumbent_retained_x1";
  return "running";
}

function previousNoChangeCount({ preflightLedger, tournament }) {
  const matching = preflightLedger.filter((entry) => (
    entry.source === "tournament_variant"
    && entry.status === "winner"
    && entry.candidate_id === tournament.candidate_id
    && entry.route_target === tournament.route_target
    && entry.retained_as === "incumbent_unchanged_retained"
  ));
  return Math.max(0, ...matching.map((entry) => entry.consecutive_no_change_count ?? 0));
}

export function buildTournamentExperienceLedger({ preflight, tournaments, now = new Date() }) {
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const preflightLedger = (preflight.experience_ledger ?? [])
    .map((entry) => normalizePreflightExperience(entry, { timestamp }));
  const variantLedger = [];

  for (const tournament of tournaments) {
    const winnerVariant = tournament.variants.find((item) => item.variant_id === tournament.winner.variant_id);
    const winnerLedgerId = `exp-variant-${safeId(tournament.winner.variant_id)}`;
    const noChangeRetained = tournament.restraint?.incumbent_retained === true;
    const noChangeCount = noChangeRetained
      ? previousNoChangeCount({ preflightLedger, tournament }) + 1
      : 0;
    const convergenceStatus = convergenceStatusFor({
      noChangeCount,
      scopeDriftLevel: tournament.restraint?.scope_drift_risk?.level
    });
    variantLedger.push({
      ledger_id: winnerLedgerId,
      iteration_id: tournament.tournament_id,
      source: "tournament_variant",
      candidate_id: tournament.candidate_id,
      source_event_id: tournament.source_event_id,
      route_target: tournament.route_target,
      status: "winner",
      retained_as: noChangeRetained ? "incumbent_unchanged_retained" : "selected_draft_experience",
      lesson: noChangeRetained
        ? "The unchanged incumbent won this tournament; wait for new evidence before adding pressure."
        : "The selected draft beat the incumbent locally but remains a human-review-only recommendation.",
      change_diff_hash: winnerVariant?.control_footprint?.change_diff_hash ?? ledgerHash({
        tournament_id: tournament.tournament_id,
        candidate_id: tournament.candidate_id,
        variant_id: tournament.winner.variant_id,
        status: "winner",
        strategy: tournament.winner.strategy
      }),
      plant_model_version: PLANT_MODEL_VERSION,
      metric_registry_version: METRIC_REGISTRY_VERSION,
      metric_id: TOURNAMENT_LEDGER_METRIC_ID,
      metric_value: winnerVariant?.scores?.composite ?? tournament.winner.composite_score ?? null,
      decision: "keep",
      reason_ref: tournament.winner.variant_id,
      timestamp,
      last_sample_ts: timestamp,
      score: winnerVariant?.scores?.composite ?? tournament.winner.composite_score ?? null,
      evidence_count: null,
      risk_level: null,
      tournament_id: tournament.tournament_id,
      variant_id: tournament.winner.variant_id,
      strategy: tournament.winner.strategy,
      blocked_requests: [],
      violations: [],
      loser_class: null,
      failure_type: null,
      candidate_pool_effect: null,
      candidate_pool_authority: null,
      candidate_pool_action: null,
      consecutive_no_change_count: noChangeCount,
      convergence_status: convergenceStatus,
      hard_filter_allowed: false,
      agent_review_required: false,
      l4_review_required: false,
      review_path: null,
      review_trigger: null,
      selection_hint: noChangeRetained ? "hold_until_new_evidence" : "human_review_before_any_promotion",
      reactivation_conditions: [],
      rehabilitation_record: null,
      observed_at: timestamp,
      last_triggered_at: timestamp,
      source_count: null,
      decay_weight: null,
      confidence: null,
      contrast: null,
      production_authority: false,
      publication_allowed: false
    });

    for (const loser of tournament.loser_ledger) {
      const variant = tournament.variants.find((item) => item.variant_id === loser.variant_id);
      const ledgerId = `exp-variant-${safeId(loser.variant_id)}`;
      variantLedger.push({
        ledger_id: ledgerId,
        iteration_id: tournament.tournament_id,
        source: "tournament_variant",
        candidate_id: tournament.candidate_id,
        source_event_id: tournament.source_event_id,
        route_target: loser.route_target,
        status: loser.status,
        retained_as: loser.becomes,
        lesson: loser.status === "rejected"
          ? "Rejected variants stay as damping or case evidence; do not retry them without changed evidence or gates."
          : "Safe non-winning variants stay as comparison experience, not publication candidates.",
        change_diff_hash: ledgerHash({
          tournament_id: tournament.tournament_id,
          candidate_id: tournament.candidate_id,
          variant_id: loser.variant_id,
          status: loser.status,
          strategy: variant?.strategy ?? null,
          violations: variant?.constraints?.violations ?? []
        }),
        plant_model_version: PLANT_MODEL_VERSION,
        metric_registry_version: METRIC_REGISTRY_VERSION,
        metric_id: TOURNAMENT_LEDGER_METRIC_ID,
        metric_value: variant?.scores?.composite ?? null,
        decision: decisionForStatus(loser.status),
        reason_ref: loser.variant_id,
        timestamp: loser.observed_at ?? timestamp,
        last_sample_ts: loser.last_triggered_at ?? loser.observed_at ?? timestamp,
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
        consecutive_no_change_count: 0,
        convergence_status: "running",
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
