import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

const WORKFLOW_PATH = ".github/workflows/current-line-shadow.yml";

test("current-line GitHub Actions workflow stays shadow-only", async () => {
  const workflow = await fs.readFile(WORKFLOW_PATH, "utf8");

  assert.match(workflow, /name:\s+Current Line Shadow/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
  assert.match(workflow, /MISA_SHADOW_MODE:\s+"true"/);
  assert.match(workflow, /MISA_NO_LIVE_EFFECTS:\s+"true"/);

  for (const command of [
    "npm ci",
    "npm run validate:schemas",
    "npm run smoke:current-line",
    "npm run calibrate:current-line",
    "npm run health:qianxuesen",
    "npm run precheck",
    "npm test"
  ]) {
    assert.match(workflow, new RegExp(`run: ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }

  assert.doesNotMatch(workflow, /\bsecrets\./i);
  assert.doesNotMatch(workflow, /\bnpm publish\b/i);
  assert.doesNotMatch(workflow, /\bgh\s+release\b/i);
  assert.doesNotMatch(workflow, /\bssh\b|\bscp\b|\brsync\b/i);
  assert.doesNotMatch(workflow, /\bdocker\s+push\b|\bkubectl\b|\bflyctl\b|\bvercel\b/i);
  assert.doesNotMatch(workflow, /judge-mode\s+(auto|llm)/i);
});
