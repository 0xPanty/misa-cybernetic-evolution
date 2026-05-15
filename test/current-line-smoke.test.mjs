import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCurrentLineSmokeFromArtifacts,
  runCurrentLineSmoke
} from "../scripts/lib/current-line-smoke.mjs";

test("current-line smoke covers dry-run public command surface", async () => {
  const result = await runCurrentLineSmoke();
  const checkNames = new Set(result.checks.map((check) => check.name));

  assert.equal(result.mode, "current-line-smoke");
  assert.equal(result.ok, true);
  assert.equal(result.summary.dry_run, true);
  assert.equal(result.summary.production_authority, false);
  assert.equal(result.summary.zilliz_written, false);
  assert.equal(result.summary.embedding_created, false);
  assert.equal(result.summary.writes_persistent_memory, false);
  assert.equal(result.summary.live_effect_allowed, false);
  assert.equal(result.command_surface.includes("session-distiller:review"), true);
  assert.equal(result.command_surface.includes("work-order:route"), true);
  assert.equal(result.command_surface.includes("evolution:tournament:misa"), true);
  assert.equal(result.command_surface.includes("vector-memory:classify"), true);
  assert.equal(result.command_surface.includes("vector-memory:rank"), true);
  assert.equal(result.command_surface.includes("vector-store:local"), true);
  assert.equal(result.command_surface.includes("skill:evolution"), true);
  assert.equal(result.command_surface.includes("curiosity:signals"), true);
  assert.equal(result.command_surface.includes("zilliz:adapt"), true);
  assert.ok(checkNames.has("session-distiller:review dry-run"));
  assert.ok(checkNames.has("work-order:route dry-run"));
  assert.ok(checkNames.has("evolution:tournament:misa dry-run"));
  assert.ok(checkNames.has("vector-memory:classify dry-run"));
  assert.ok(checkNames.has("vector-store:local dry-run"));
  assert.ok(checkNames.has("skill:evolution dry-run"));
  assert.ok(checkNames.has("curiosity:signals dry-run"));
  assert.ok(checkNames.has("vector-memory:rank dry-run"));
  assert.ok(checkNames.has("zilliz:adapt dry-run"));
  assert.ok(checkNames.has("no live writes or provider calls"));
});

function safeArtifacts() {
  return {
    workOrderRouting: {
      ok: true,
      summary: {
        work_order_count: 1,
        auto_executable_count: 0
      },
      safety: {
        durable_or_public_effect_allowed: false
      },
      routing_policy: {
        mode: "shadow"
      }
    },
    sessionReview: {
      ok: true,
      summary: {
        verdict: "pass",
        finding_count: 0,
        repair_work_order_count: 0
      },
      safety: {
        writes_persistent_memory: false,
        live_effects: {
          writes_persistent_memory: false,
          writes_zilliz: false,
          posts_publicly: false
        }
      }
    },
    tournament: {
      ok: true,
      summary: {
        tournament_count: 1,
        winner_count: 1,
        rejected_variant_count: 1,
        production_authority: false,
        llm_api_calls: 0
      },
      safety: {
        live_effects: {
          writes_persistent_memory: false,
          posts_publicly: false,
          starts_timer: false
        }
      },
      judge: {
        llm_api_calls: 0
      }
    },
    vectorStorage: {
      ok: true,
      summary: {
        record_count: 1,
        candidate_count: 1,
        policy_count: 0
      },
      safety: {
        zilliz_written: false,
        writes_persistent_memory: false
      }
    },
    localVectorStore: {
      ok: true,
      backend: "local-jsonl-token-vector-v1",
      dry_run: true,
      summary: {
        record_count: 1,
        unique_source_count: 1
      },
      safety: {
        local_vector_store_written: false,
        zilliz_written: false,
        embedding_created: false
      }
    },
    skillEvolution: {
      ok: true,
      summary: {
        status: "pass",
        evolution_candidate_count: 1,
        replay_required_count: 1,
        human_review_required: false
      },
      safety: {
        no_write: true,
        production_authority: false,
        controller_authority: false,
        supervisor_changes_skill: false,
        llm_api_calls: 0
      }
    },
    zillizAdapter: {
      ok: true,
      summary: {
        collection_count: 1,
        record_count: 1,
        metadata_violation_count: 0
      },
      safety: {
        zilliz_written: false,
        embedding_created: false
      }
    },
    retrievalRanker: {
      ok: true,
      summary: {
        scenario_count: 1,
        top1_exact_recall: 1,
        top1_kind_precision: 1
      },
      safety: {
        zilliz_written: false,
        external_api_calls: 0
      }
    },
    curiosityGate: {
      ok: true,
      summary: {
        evaluated_source_count: 2,
        llm_variant_generation_count: 1,
        deterministic_review_optional_count: 1,
        missed_review_worthy_count: 0,
        noise_selected_count: 0
      },
      safety: {
        writes_persistent_memory: false,
        changes_route: false,
        changes_winner: false,
        llm_api_calls: 0,
        production_authority: false
      }
    }
  };
}

test("artifact smoke builder fails if artifacts show live effects", () => {
  const artifacts = safeArtifacts();
  artifacts.zillizAdapter.safety.zilliz_written = true;

  const result = buildCurrentLineSmokeFromArtifacts(artifacts);
  const noLiveEffectCheck = result.checks.find((check) => check.name === "no live writes or provider calls");

  assert.equal(result.ok, false);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.zilliz_written, true);
  assert.equal(noLiveEffectCheck.ok, false);
  assert.equal(noLiveEffectCheck.adapter_zilliz_written, true);
});
