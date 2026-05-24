import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildHermesRuntimeAdapterReport,
  runHermesRuntimeAdapter
} from "../scripts/lib/hermes-runtime-adapter.mjs";
import { validateJsonData } from "../scripts/lib/schema-validation.mjs";

test("Hermes runtime adapter separates boundary observations from work-order anomalies", async () => {
  const result = await runHermesRuntimeAdapter({
    now: new Date("2026-05-15T00:00:00Z")
  });
  const candidateTypes = new Set(result.evolution_candidates.map((candidate) => candidate.candidate_type));
  const checkNames = new Set(result.checks.map((check) => check.name));

  assert.equal(result.mode, "hermes-runtime-adapter");
  assert.equal(result.ok, true);
  assert.equal(result.adapter.runtime, "hermes-agent");
  assert.equal(result.adapter.default_mode, "observe_only");
  assert.equal(result.universal_contract.control_owner, "qianxuesen");
  assert.equal(result.universal_contract.framework_role, "carrier_runtime");
  assert.equal(result.summary.event_count, 4);
  assert.equal(result.summary.normalized_event_count, 4);
  assert.equal(result.summary.skill_manage_event_count, 1);
  assert.equal(result.summary.memory_write_event_count, 1);
  assert.equal(result.summary.external_information_event_count, 2);
  assert.equal(result.summary.evolution_evidence_count, 0);
  assert.equal(result.summary.holdout_evidence_count, 0);
  assert.equal(result.summary.positive_optimization_evidence_count, 0);
  assert.equal(result.summary.official_evolution_candidate_count, 0);
  assert.equal(result.summary.qianxuesen_replay_synthesis_count, 0);
  assert.equal(result.summary.inferred_evolution_pressure_count, 4);
  assert.equal(result.summary.boundary_observation_count, 4);
  assert.equal(result.summary.observability_stream_count, 3);
  assert.equal(result.summary.work_order_stream_count, 1);
  assert.equal(result.summary.sidecar_signal_to_noise_ratio.metric_id, "sidecar_signal_to_noise_ratio");
  assert.equal(result.summary.sidecar_signal_to_noise_ratio.value, 0.25);
  assert.equal(result.summary.insufficient_evidence_summary.sample_count, 4);
  assert.equal(result.summary.insufficient_evidence_summary.source_window.kind, "time");
  assert.equal(result.summary.insufficient_evidence_summary.insufficient_count, 4);
  assert.equal(result.summary.insufficient_evidence_summary.insufficient_ratio, 1);
  assert.equal(result.summary.research_digest_count, 2);
  assert.equal(result.summary.evolution_candidate_count, 4);
  assert.equal(result.summary.replay_required_count, 1);
  assert.equal(result.summary.tournament_required_count, 0);
  assert.equal(candidateTypes.has("skill_variant"), true);
  assert.equal(candidateTypes.has("policy_boundary_variant"), true);
  assert.equal(candidateTypes.has("research_followup"), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.signal_origin === "runtime_operation_log"), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.interpretation === "adapter_inferred_evolution_pressure"), true);
  assert.equal(result.work_order_stream.length, 1);
  assert.equal(result.work_order_stream[0].anomaly_rule_ids.includes("memory_write_boundary_pressure"), true);
  assert.equal(result.observability_stream.length, 3);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.can_promote_now === false), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.evidence_quality === "insufficient_evidence"), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.advisory_only === true), true);
  assert.equal(result.safety.writes_persistent_memory, false);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(result.safety.blocks_runtime, false);
  assert.equal(result.control_plane_write_deny.default_decision, "deny");
  assert.equal(result.control_plane_write_deny.direct_writes_allowed, false);
  assert.equal(result.control_plane_write_deny.bypass_allowed, false);
  assert.equal(result.safety.llm_api_calls, 0);
  assert.equal(result.safety.external_api_calls, 0);
  assert.ok(checkNames.has("Hermes hook surface is mapped"));
  assert.ok(checkNames.has("skill_manage changes become replay-gated candidates"));
  assert.ok(checkNames.has("external information becomes research digest evidence"));
  assert.ok(checkNames.has("candidate provenance is explicit and closed"));
  assert.ok(checkNames.has("runtime log pressure reaches inbox only through deterministic anomaly rules"));
  assert.ok(checkNames.has("control-plane write-deny is explicit and closed"));
});

test("Hermes runtime adapter output validates against the universal adapter schema", async () => {
  const result = await runHermesRuntimeAdapter();
  const validation = await validateJsonData({
    schemaRel: "schemas/agent_runtime_adapter.schema.json",
    data: result,
    name: "validate Hermes runtime adapter report"
  });

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("Hermes runtime adapter preserves evolution-grade before/after evidence", async () => {
  const result = await runHermesRuntimeAdapter({
    fixtureFile: "test/fixtures/hermes-runtime-adapter/hermes-evolution-grade-events.json",
    now: new Date("2026-05-16T00:00:00Z")
  });
  const evidence = result.evolution_candidates.map((candidate) => candidate.evolution_evidence);

  assert.equal(result.ok, true);
  assert.equal(result.summary.event_count, 3);
  assert.equal(result.summary.evolution_candidate_count, 3);
  assert.equal(result.summary.official_evolution_candidate_count, 0);
  assert.equal(result.summary.qianxuesen_replay_synthesis_count, 3);
  assert.equal(result.summary.inferred_evolution_pressure_count, 0);
  assert.equal(result.summary.work_order_stream_count, 3);
  assert.equal(result.summary.observability_stream_count, 0);
  assert.equal(result.summary.evolution_evidence_count, 3);
  assert.equal(result.summary.holdout_evidence_count, 3);
  assert.equal(result.summary.positive_optimization_evidence_count, 3);
  assert.equal(result.summary.insufficient_evidence_summary.sample_count, 3);
  assert.equal(result.summary.insufficient_evidence_summary.insufficient_count, 0);
  assert.equal(result.summary.insufficient_evidence_summary.insufficient_ratio, 0);
  assert.equal(evidence.every((item) => item?.baseline_snapshot_id), true);
  assert.equal(evidence.every((item) => item?.holdout_split_id), true);
  assert.equal(evidence.every((item) => item?.eval_dataset_ref), true);
  assert.equal(evidence.every((item) => item?.baseline_registered), true);
  assert.equal(evidence.every((item) => item?.holdout_registered), true);
  assert.equal(evidence.every((item) => item?.eval_dataset_registered), true);
  assert.equal(evidence.every((item) => item?.evidence_quality === "sufficient"), true);
  assert.equal(evidence.every((item) => item?.advisory_only === false), true);
  assert.equal(evidence.every((item) => item?.llm_inferred === false), true);
  assert.equal(evidence.every((item) => item?.redaction_status === "at_tap_point"), true);
  assert.equal(evidence.every((item) => item?.raw_private_content_exported === false), true);
  assert.equal(evidence.every((item) => item?.can_support_optimization), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.signal_origin === "qianxuesen_replay_synthesis"), true);
  assert.equal(result.evolution_candidates.every((candidate) => candidate.routing_stream === "work_order_stream"), true);
  assert.deepEqual(
    evidence.map((item) => item.delta),
    [0.16, 0.17, 0.2]
  );

  const validation = await validateJsonData({
    schemaRel: "schemas/agent_runtime_adapter.schema.json",
    data: result,
    name: "validate Hermes evolution-grade adapter report"
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test("Hermes evolution evidence tap downgrades untrusted or LLM-inferred evidence", () => {
  const result = buildHermesRuntimeAdapterReport({
    fixture: {
      source: {
        runtime: "hermes-agent",
        runtime_commit: "untrusted-evidence-local-sample",
        source_url: "local-untrusted-evidence"
      },
      events: [
        {
          event_id: "hermes-evo-untrusted-skill-001",
          hook: "pre_tool_call",
          timestamp: "2026-05-17T00:00:00Z",
          session_id: "s-hermes-untrusted-evidence",
          tool_name: "skill_manage",
          args: {
            action: "patch",
            name: "reply-skill",
            old_string: "Reply quickly.",
            new_string: "Reply with claimed improvement."
          },
          context: {
            conversation_signals: ["knowledge_gap"],
            evidence_refs: ["untrusted-skill-source"],
            evolution_evidence: {
              evidence_id: "untrusted-skill-proof-001",
              metric: "claimed_quality",
              baseline_snapshot_id: "hermes-picked-baseline",
              holdout_split_id: "hermes-picked-holdout",
              eval_dataset_ref: "hermes-picked-eval",
              before_score: 0.4,
              after_score: 0.9,
              sample_count: 9,
              metric_gaming_risk: "low",
              user_feedback_signal: "rejected",
              feedback_source: "trace_inferred",
              llm_inferred: true,
              trace_ref: "hermes-sessiondb-row-001"
            }
          }
        }
      ]
    },
    now: new Date("2026-05-17T00:00:00Z")
  });
  const candidate = result.evolution_candidates[0];
  const evidence = candidate.evolution_evidence;

  assert.equal(result.ok, true);
  assert.equal(result.summary.insufficient_evidence_summary.sample_count, 1);
  assert.equal(result.summary.insufficient_evidence_summary.source_window.kind, "time");
  assert.equal(result.summary.insufficient_evidence_summary.insufficient_count, 1);
  assert.equal(candidate.evidence_quality, "insufficient_evidence");
  assert.equal(candidate.advisory_only, true);
  assert.equal(candidate.can_promote_now, false);
  assert.equal(evidence.can_support_optimization, false);
  assert.equal(evidence.llm_inferred, true);
  assert.equal(evidence.feedback_usable_for_decision, false);
  assert.equal(evidence.raw_private_content_exported, false);
  assert.equal(evidence.trace_detail_source, "trace_identity_only");
  assert.equal(candidate.evidence_reason_codes.includes("untrusted_baseline"), true);
  assert.equal(candidate.evidence_reason_codes.includes("untrusted_holdout"), true);
  assert.equal(candidate.evidence_reason_codes.includes("unregistered_eval_dataset"), true);
  assert.equal(candidate.evidence_reason_codes.includes("llm_inferred_feedback_blocked"), true);
});

test("Hermes evolution evidence without explicit signal origin cannot become trusted evidence", () => {
  const result = buildHermesRuntimeAdapterReport({
    fixture: {
      source: {
        runtime: "hermes-agent",
        runtime_commit: "missing-signal-origin-local-sample",
        source_url: "local-missing-signal-origin"
      },
      events: [
        {
          event_id: "hermes-evo-missing-signal-origin-001",
          hook: "pre_tool_call",
          timestamp: "2026-05-18T00:00:00Z",
          session_id: "s-hermes-missing-signal-origin",
          tool_name: "skill_manage",
          args: {
            action: "patch",
            name: "reply-skill",
            old_string: "Reply from current context.",
            new_string: "Reply from current context plus held-out check."
          },
          context: {
            conversation_signals: ["knowledge_gap"],
            evidence_refs: ["missing-signal-origin-source"],
            evolution_evidence: {
              evidence_id: "missing-signal-origin-proof-001",
              metric: "heldout_public_reply_success",
              baseline_snapshot_id: "baseline-farcaster-reply-2026-05-14",
              holdout_split_id: "holdout-farcaster-public-reply-v1",
              eval_dataset_ref: "dataset-farcaster-public-reply-v1",
              before_score: 0.58,
              after_score: 0.74,
              sample_count: 12,
              metric_gaming_risk: "low",
              user_feedback_signal: "accepted",
              feedback_source: "user_explicit",
              llm_inferred: false,
              redacted_trace_digest_ref: "redacted-trace-missing-origin-001"
            }
          }
        }
      ]
    },
    now: new Date("2026-05-18T00:00:00Z")
  });
  const candidate = result.evolution_candidates[0];
  const evidence = candidate.evolution_evidence;

  assert.equal(result.ok, true);
  assert.equal(result.summary.qianxuesen_replay_synthesis_count, 0);
  assert.equal(result.summary.inferred_evolution_pressure_count, 1);
  assert.equal(result.summary.positive_optimization_evidence_count, 0);
  assert.equal(candidate.signal_origin, "runtime_operation_log");
  assert.equal(candidate.evidence_quality, "insufficient_evidence");
  assert.equal(candidate.advisory_only, true);
  assert.equal(candidate.routing_stream, "observability_stream");
  assert.equal(evidence.evidence_quality, "insufficient_evidence");
  assert.equal(evidence.can_support_optimization, false);
  assert.equal(candidate.evidence_reason_codes.includes("evolution_evidence_without_explicit_signal_origin"), true);
  assert.equal(result.warnings.some((warning) => warning.includes("evolution_evidence without explicit signal_origin")), true);
});

test("Hermes runtime adapter folds pre/post tool-call observations by action identity", () => {
  const pairedEvents = Array.from({ length: 3 }, (_, index) => ([
    {
      event_id: `skill-create-pre-${index + 1}`,
      hook: "pre_tool_call",
      timestamp: `2026-05-19T00:0${index}:00Z`,
      tool_name: "skill_manage",
      args: {
        action: "create",
        name: "reply-skill",
        fingerprint: "same-target"
      },
      context: {
        terms: ["Hermes", "skill_manage"]
      }
    },
    {
      event_id: `skill-create-post-${index + 1}`,
      hook: "post_tool_call",
      timestamp: `2026-05-19T00:0${index}:10Z`,
      tool_name: "skill_manage",
      args: {
        action: "create",
        name: "reply-skill",
        fingerprint: "same-target"
      },
      result: {
        success: true
      },
      context: {
        terms: ["Hermes", "skill_manage"]
      }
    }
  ])).flat();

  const result = buildHermesRuntimeAdapterReport({
    fixture: {
      source: {
        runtime: "hermes-agent",
        runtime_commit: "paired-tool-call-local-sample",
        source_url: "local-paired-tool-call"
      },
      events: pairedEvents
    },
    now: new Date("2026-05-19T00:00:00Z")
  });
  const workOrder = result.work_order_stream[0];

  assert.equal(result.ok, true);
  assert.equal(result.summary.boundary_observation_count, 6);
  assert.equal(result.summary.work_order_stream_count, 1);
  assert.equal(result.summary.observability_stream_count, 5);
  assert.equal(workOrder.raw_signal_count, 6);
  assert.equal(workOrder.source_event_ids.length, 6);
  assert.equal(workOrder.source_event_ids[0].startsWith("skill-create-post-"), true);
  assert.equal(workOrder.confidence_rule_id, "post_tool_call_skill_manage_create");
  assert.equal(workOrder.dedupe_cluster_key.includes("tool-call"), true);
  assert.equal(result.evolution_candidates.every((candidate) => (
    candidate.action_identity_fingerprint === workOrder.action_identity_fingerprint
  )), true);
});

test("Hermes runtime adapter can read observe-only plugin NDJSON event logs", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-hermes-runtime-events-"));
  const eventLog = path.join(tempRoot, "events.ndjson");
  const events = [
    {
      event_id: "plugin-pretool-skill-patch-001",
      hook: "pre_tool_call",
      tool_name: "skill_manage",
      args: {
        action: "patch",
        name: "farcaster-reply",
        fingerprint: "abc"
      },
      context: {
        conversation_signals: ["knowledge_gap", "user_correction"],
        terms: ["Hermes", "Farcaster"]
      }
    },
    {
      event_id: "plugin-posttool-session-search-002",
      hook: "post_tool_call",
      tool_name: "session_search",
      args: {
        query: "Farcaster protocol changes"
      },
      result: {
        success: true
      },
      context: {
        conversation_signals: ["research_needed"],
        terms: ["session_search"]
      }
    }
  ];
  await fs.writeFile(eventLog, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");

  const result = await runHermesRuntimeAdapter({
    eventLogFile: eventLog,
    runtimeCommit: "test-runtime",
    now: new Date("2026-05-15T00:00:00Z")
  });

  assert.equal(result.ok, true);
  assert.equal(result.adapter.runtime_commit, "test-runtime");
  assert.equal(result.summary.event_count, 2);
  assert.equal(result.summary.evolution_candidate_count, 2);
  assert.equal(result.summary.official_evolution_candidate_count, 0);
  assert.equal(result.summary.inferred_evolution_pressure_count, 2);
  assert.equal(result.summary.work_order_stream_count, 0);
  assert.equal(result.summary.observability_stream_count, 2);
  assert.equal(result.summary.research_digest_count, 2);
  assert.equal(result.summary.evolution_evidence_count, 0);
  assert.equal(result.safety.writes_skills, false);
  assert.equal(result.safety.llm_api_calls, 0);
});

test("empty Hermes event capture stays observe-only", () => {
  const result = buildHermesRuntimeAdapterReport({
    fixture: {
      source: {
        runtime: "hermes-agent",
        runtime_commit: "unknown",
        source_url: "https://github.com/NousResearch/hermes-agent"
      },
      events: []
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.event_count, 0);
  assert.equal(result.summary.evolution_candidate_count, 0);
  assert.equal(result.summary.official_evolution_candidate_count, 0);
  assert.equal(result.summary.inferred_evolution_pressure_count, 0);
  assert.equal(result.summary.work_order_stream_count, 0);
  assert.equal(result.summary.observability_stream_count, 0);
  assert.equal(result.summary.evolution_evidence_count, 0);
  assert.equal(result.summary.insufficient_evidence_summary.source_window.kind, "count");
  assert.equal(result.summary.insufficient_evidence_summary.sample_count, 0);
  assert.equal(result.safety.production_authority, false);
  assert.equal(result.safety.llm_api_calls, 0);
});
