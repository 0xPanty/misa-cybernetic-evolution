import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  runLocalBootstrap,
  runPublicRepoDoctor
} from "../scripts/lib/public-repo-readiness.mjs";

test("public repo doctor verifies clone-time readiness without writes", async () => {
  const result = await runPublicRepoDoctor({
    now: new Date("2026-05-14T10:00:00Z")
  });

  assert.equal(result.mode, "public-repo-doctor");
  assert.equal(result.ok, true);
  assert.equal(result.safety.read_only, true);
  assert.equal(result.safety.local_vector_store_written, false);
  assert.equal(result.safety.zilliz_written, false);
  assert.ok(result.checks.some((check) => check.name === "public entry scripts exist" && check.ok));
  assert.ok(result.checks.some((check) => check.name === "public docs exist" && check.ok));
  assert.ok(result.checks.some((check) => check.name === "local vector store dry-run accepts public distillation template" && check.ok));
});

test("local bootstrap initializes ignored vector store and local report", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-public-bootstrap-"));
  const vectorRoot = path.join(tempRoot, "local-vector-store");
  const reportRoot = path.join(tempRoot, "bootstrap-report");
  const result = await runLocalBootstrap({
    vectorRoot,
    reportRoot,
    now: new Date("2026-05-14T10:10:00Z")
  });

  assert.equal(result.mode, "local-bootstrap");
  assert.equal(result.ok, true);
  assert.equal(result.safety.local_vector_store_written, true);
  assert.equal(result.safety.zilliz_written, false);
  assert.equal(result.summary.vector_records, 3);
  assert.equal(result.summary.query_hits, 1);
  assert.equal(result.summary.health_status, "pass");
  assert.equal((await fs.stat(path.join(vectorRoot, "records.jsonl"))).isFile(), true);
  assert.equal((await fs.stat(path.join(reportRoot, "latest.json"))).isFile(), true);
});
