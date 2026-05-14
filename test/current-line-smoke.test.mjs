import assert from "node:assert/strict";
import { test } from "node:test";
import { runCurrentLineSmoke } from "../scripts/lib/current-line-smoke.mjs";

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
  assert.equal(result.command_surface.includes("zilliz:adapt"), true);
  assert.ok(checkNames.has("session-distiller:review dry-run"));
  assert.ok(checkNames.has("work-order:route dry-run"));
  assert.ok(checkNames.has("evolution:tournament:misa dry-run"));
  assert.ok(checkNames.has("vector-memory:classify dry-run"));
  assert.ok(checkNames.has("vector-memory:rank dry-run"));
  assert.ok(checkNames.has("zilliz:adapt dry-run"));
  assert.ok(checkNames.has("no live writes or provider calls"));
});
