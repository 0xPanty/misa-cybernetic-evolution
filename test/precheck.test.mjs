import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runPrecheck } from "../scripts/lib/precheck-core.mjs";
import {
  PHASES,
  normalizeChecks,
  scanControlPathProviderCalls,
  scanForSecretAssignments,
  walkFiles
} from "../scripts/lib/precheck-shared.mjs";

function assertPhaseCounts(summary, phase, total) {
  assert.equal(summary[phase].total, total);
  assert.equal(summary[phase].passed, total);
  assert.equal(summary[phase].failed, 0);
}

test("repository dry-run precheck passes", async () => {
  const result = await runPrecheck();

  assert.equal(result.mode, "dry-run");
  assert.equal(result.ok, true);
  assert.ok(result.phase_summary.static.total > 0);
  assert.ok(result.phase_summary.contracts.total > 0);
  assert.ok(result.phase_summary["current-line"].total > 0);
  assertPhaseCounts(result.phase_summary, "static", 5);
  assertPhaseCounts(result.phase_summary, "contracts", 117);
  assertPhaseCounts(result.phase_summary, "bridges", 21);
  assertPhaseCounts(result.phase_summary, "current-line", 25);
  assertPhaseCounts(result.phase_summary, "smoke", 14);
  assert.equal(result.checks.every((check) => Object.values(PHASES).includes(check.phase)), true);
  assert.ok(result.checks.some((check) => check.name === "README/package version sync"));
  assert.ok(result.checks.some((check) => check.name === "control paths avoid provider and fetch calls"));
  assert.ok(result.checks.some((check) => check.name === "Session distiller cybernetic review check"));
});

test("precheck checks must carry explicit phases", () => {
  assert.throws(
    () => normalizeChecks([{ name: "renamed check without phase", ok: true }]),
    /missing an explicit phase/
  );
});

test("secret scan stays text-only and skips ignored output directories", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-precheck-secret-scan-"));
  const key = ["OPENAI", "_API_KEY"].join("");
  const fakeSecret = ["sk", "test", "012345678901234567890123"].join("-");
  const assignment = `${key}=${fakeSecret}\n`;

  await fs.mkdir(path.join(tempRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(tempRoot, "runs", "manual-check"), { recursive: true });
  await fs.mkdir(path.join(tempRoot, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, "src", "config.mjs"), assignment, "utf8");
  await fs.writeFile(path.join(tempRoot, "runs", "manual-check", "config.mjs"), assignment, "utf8");
  await fs.writeFile(path.join(tempRoot, "node_modules", "pkg", "config.mjs"), assignment, "utf8");
  await fs.writeFile(path.join(tempRoot, "artifact.bin"), assignment, "utf8");

  const walked = (await walkFiles(tempRoot)).map((filePath) => path.relative(tempRoot, filePath).split(path.sep).join("/"));
  const hits = (await scanForSecretAssignments(tempRoot)).map((filePath) => filePath.split(path.sep).join("/"));

  assert.ok(walked.includes("src/config.mjs"));
  assert.equal(walked.some((filePath) => filePath.startsWith("runs/")), false);
  assert.equal(walked.some((filePath) => filePath.startsWith("node_modules/")), false);
  assert.deepEqual(hits, ["src/config.mjs"]);
});

test("control path provider-call scan blocks fetch and provider endpoints", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "misa-precheck-control-scan-"));
  const targetDir = path.join(tempRoot, "scripts", "lib");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(
    path.join(targetDir, "learning-loop.mjs"),
    "export async function bad() { return fetch('https://api.openai.com/v1/chat/completions'); }\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(targetDir, "stability-monitor.mjs"),
    "export async function bad() { return import('openai'); }\n",
    "utf8"
  );

  const hits = await scanControlPathProviderCalls(tempRoot);
  const rules = hits.map((hit) => hit.rule).sort();

  assert.deepEqual(rules, ["fetch_call", "provider_dynamic_import", "provider_endpoint"]);
  assert.deepEqual(
    hits.map((hit) => hit.file).sort(),
    [
      "scripts/lib/learning-loop.mjs",
      "scripts/lib/learning-loop.mjs",
      "scripts/lib/stability-monitor.mjs"
    ]
  );
});
