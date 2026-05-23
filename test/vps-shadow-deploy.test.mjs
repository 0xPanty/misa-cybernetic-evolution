import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("VPS hook installer refreshes the wrapper expected-commit pin", async () => {
  const installer = await fs.readFile(
    path.join(repoRoot, "scripts", "deploy", "install-vps-full-shadow.sh"),
    "utf8"
  );

  assert.match(installer, /MISA_CYBERNETIC_EXPECT_COMMIT/);
  assert.match(installer, /git -C "\$REPO_ROOT" rev-parse HEAD/);
  assert.match(installer, /refresh_expected_commit_pin/);
  assert.match(installer, /install -m 0600 "\$tmp" "\$ENV_FILE"/);
});

test("VPS updater runs full-shadow proof before refreshing the hook", async () => {
  const updater = await fs.readFile(
    path.join(repoRoot, "scripts", "deploy", "update-vps-shadow.sh"),
    "utf8"
  );

  assert.ok(updater.indexOf("npm run deploy:full-shadow") > -1);
  assert.ok(updater.indexOf("npm run deploy:vps-shadow") > -1);
  assert.ok(
    updater.indexOf("npm run deploy:full-shadow") < updater.indexOf("npm run deploy:vps-shadow")
  );
});
