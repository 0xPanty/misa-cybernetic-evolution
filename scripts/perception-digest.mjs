#!/usr/bin/env node

import { buildPerceptionDigest } from "./lib/perception-sidecar.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const asJson = process.argv.includes("--json");
const sourceDir = readArg("source-dir");
const ledgerFile = readArg("ledger-file");
const digest = await buildPerceptionDigest({ sourceDir, ledgerFile });
await writeJsonOutFile(digest, readArg("out-file"));

if (asJson) {
  console.log(JSON.stringify(digest, null, 2));
} else {
  console.log("Misa shadow perception digest");
  console.log(`mode: ${digest.mode}`);
  console.log(`ok: ${digest.violations.length === 0}`);
  console.log(`sources: ${digest.summary.source_count}`);
  console.log(`attention_items: ${digest.summary.attention_queue_count}`);
  console.log(`risk_hints: ${digest.summary.risk_hint_count}`);
  console.log(`novelty_hints: ${digest.summary.novelty_hint_count}`);
  console.log(`duplicate_clusters: ${digest.summary.duplicate_cluster_count}`);
  console.log(`signal_fingerprints: ${digest.summary.signal_fingerprint_count}`);
  console.log(`action_recommendations: ${digest.summary.action_recommendation_count}`);
  console.log(`ledger_update_proposals: ${digest.summary.ledger_update_proposal_count}`);
  console.log(`recurring_after_fix: ${digest.summary.recurring_after_fix_count}`);
  console.log(`already_processed: ${digest.summary.already_processed_count}`);
  console.log(`damping_repeated_to_case: ${digest.summary.damping_repeated_to_case_count}`);
  console.log(`high_review_value: ${digest.summary.high_review_value_count}`);
  console.log(`route_authority: ${digest.downstream_contract.route_authority}`);
  console.log(`controller_authority: ${digest.downstream_contract.controller_authority}`);
  console.log(`llm_api_calls: ${digest.summary.llm_api_calls}`);
  console.log(`external_api_calls: ${digest.summary.external_api_calls}`);

  if (digest.attention_queue.length) {
    console.log("attention_queue:");
    for (const item of digest.attention_queue) {
      console.log(`- ${item.source_id}: priority=${item.priority}; status=${item.ledger_status}; ${item.reasons.join("; ")}`);
    }
  }

  if (digest.action_recommendations.length) {
    console.log("action_recommendations:");
    for (const item of digest.action_recommendations.slice(0, 5)) {
      console.log(`- ${item.fingerprint_id}: ${item.recommended_action}; mode=${item.handoff_mode}; priority=${item.priority}`);
    }
  }

  if (digest.violations.length) {
    console.log("violations:");
    for (const violation of digest.violations) {
      console.log(`- ${violation}`);
    }
  }
}

process.exitCode = digest.violations.length === 0 ? 0 : 1;
