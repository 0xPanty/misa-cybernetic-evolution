import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildPerceptionLogLayout,
  initializePerceptionLogLayout,
  summarizePerceptionLogLayout
} from "../scripts/lib/perception-log-layout.mjs";

test("perception log layout keeps a small fixed set of shadow-only buckets", () => {
  const layout = buildPerceptionLogLayout({
    rootDir: "runs/perception-runtime",
    now: new Date("2026-05-14T03:00:00Z")
  });
  const byKey = new Map(layout.directories.map((directory) => [directory.key, directory]));

  assert.equal(layout.mode, "shadow-perception-log-layout");
  assert.equal(layout.shadow_only, true);
  assert.equal(layout.rules.raw_logs_are_not_learning_material, true);
  assert.equal(layout.rules.redaction_required_before_perception, true);
  assert.equal(layout.rules.redacted_sources_are_perception_input, true);
  assert.equal(layout.rules.qianxuesen_keeps_route_authority, true);
  assert.equal(layout.safety.writes_persistent_memory, false);
  assert.equal(layout.safety.writes_zilliz, false);
  assert.equal(layout.safety.changes_route, false);
  assert.equal(layout.safety.llm_api_calls, 0);

  assert.equal(byKey.get("raw_logs").readable_by_perception, false);
  assert.equal(byKey.get("redacted_sources").readable_by_perception, true);
  assert.equal(byKey.get("redacted_sources").allowed_contents.includes("local_distillation_source"), true);
  assert.equal(byKey.get("digests").allowed_contents.includes("duplicate_cluster_report"), true);
  assert.equal(byKey.get("attention_queue").handoff_target, "qianxuesen");
  assert.equal(byKey.get("handoffs").readable_by_perception, false);
  assert.equal(byKey.get("handoffs").handoff_target, "mixed");
  assert.equal(byKey.get("archive").allowed_contents.includes("suppressed_signal_record"), true);
  assert.ok(layout.flow_edges.some((edge) => edge.from === "redacted_sources" && edge.to === "digests"));
  assert.ok(layout.flow_edges.every((edge) => edge.authority === "layout_contract_only"));

  const summary = summarizePerceptionLogLayout(layout);
  assert.equal(summary.directory_count, 7);
  assert.equal(summary.handoff_directory_count, 1);
  assert.equal(summary.archive_directory_count, 1);
  assert.equal(summary.production_authority, false);
});

test("perception log layout init creates only the declared directory tree", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-perception-layout-"));
  try {
    const layout = await initializePerceptionLogLayout({
      repoRoot: tempRoot,
      rootDir: "runtime",
      now: new Date("2026-05-14T03:10:00Z")
    });

    assert.equal(layout.initialized, true);
    assert.equal(layout.created_paths.length, layout.directories.length);
    assert.ok(layout.created_paths.every((createdPath) => createdPath.startsWith("runtime/")));

    for (const directory of layout.directories) {
      const stat = await fs.stat(path.join(tempRoot, directory.path));
      assert.equal(stat.isDirectory(), true);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
