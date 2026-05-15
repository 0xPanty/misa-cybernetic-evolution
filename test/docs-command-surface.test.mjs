import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

const DOCS_TO_CHECK = [
  "README.md",
  "QUICKSTART.md",
  "ARCHITECTURE.md",
  "docs/verification-matrix.md",
  "docs/skill-evolution-adapter-v0.22.md",
  "docs/skill-control-intake-template.md",
  "docs/work-order-variants-v0.23.md",
  "docs/local-vector-store-v0.21.md",
  "docs/current-line-calibration-v0.21.md",
  "docs/qianxuesen-full-loop-health-v0.21.md",
  "docs/evolution-tournament-gate-v0.18.md",
  ".github/workflows/current-line-shadow.yml"
];

const REQUIRED_CURRENT_LINE_COMMANDS = [
  "validate:schemas",
  "doctor",
  "smoke:current-line",
  "calibrate:current-line",
  "health:qianxuesen",
  "precheck"
];

function extractNpmRunScripts(text) {
  const scripts = [];
  const pattern = /\bnpm(?:\s+--silent)?\s+run\s+([a-z0-9:._-]+)/gi;
  for (const match of text.matchAll(pattern)) {
    if (match[1] === "...") continue;
    scripts.push(match[1]);
  }
  return scripts;
}

test("current docs reference package scripts that actually exist", async () => {
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  const packageScripts = new Set(Object.keys(pkg.scripts ?? {}));
  const missing = [];

  for (const filePath of DOCS_TO_CHECK) {
    const text = await fs.readFile(filePath, "utf8");
    for (const script of extractNpmRunScripts(text)) {
      if (!packageScripts.has(script)) {
        missing.push(`${filePath}: npm run ${script}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test("current-line docs keep the validation command map aligned", async () => {
  const readme = await fs.readFile("README.md", "utf8");
  const architecture = await fs.readFile("ARCHITECTURE.md", "utf8");
  const verification = await fs.readFile("docs/verification-matrix.md", "utf8");
  const workflow = await fs.readFile(".github/workflows/current-line-shadow.yml", "utf8");

  for (const command of REQUIRED_CURRENT_LINE_COMMANDS) {
    assert.match(verification, new RegExp(`npm run ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(workflow, new RegExp(`npm run ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }

  assert.doesNotMatch(verification, /--no-verify/);
  assert.match(readme, /docs\/verification-matrix\.md/);
  assert.match(architecture, /docs\/verification-matrix\.md/);
  assert.match(readme, /Current-Line Command Map/);
  assert.match(verification, /Current Local Shadow Gate/);
  assert.match(verification, /canonical command\s+surface/);
});
