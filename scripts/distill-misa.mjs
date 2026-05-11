#!/usr/bin/env node

import { distillLocalMisaSources } from "./lib/session-distiller.mjs";

const asJson = process.argv.includes("--json");
const result = await distillLocalMisaSources();

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("Misa local session distillation");
  console.log(`mode: ${result.mode}`);
  console.log(`ok: ${result.ok}`);
  console.log(`sources: ${result.summary.source_count}`);
  console.log(`learning_events: ${result.summary.learning_event_count}`);
  console.log(`zilliz_proxy_used: ${result.summary.zilliz_proxy_used}`);
  console.log(`local_vector_index_used: ${result.summary.local_vector_index_used}`);
  console.log(`vector_store_backend: ${result.summary.vector_store_backend}`);
  console.log(`segments: ${result.summary.segment_count}`);
  console.log(`llm_api_calls: ${result.summary.llm_api_calls}`);
  console.log(`external_api_calls: ${result.summary.external_api_calls}`);
  console.log(`raw_window_default: ${result.summary.raw_window_default}`);

  if (result.distillates.length > 0) {
    console.log("distillates:");
    for (const distillate of result.distillates) {
      console.log(`- ${distillate.distillate_id}: ${distillate.learning_event_id}`);
    }
  }

  if (result.violations.length) {
    console.log("violations:");
    for (const violation of result.violations) {
      console.log(`- ${violation}`);
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
