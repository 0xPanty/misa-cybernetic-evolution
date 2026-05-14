import { runBridgePrecheck } from "./precheck-bridges.mjs";
import { runContractPrecheck } from "./precheck-contracts.mjs";
import { runCurrentLinePrecheck } from "./precheck-current-line.mjs";
import { runSmokePrecheck } from "./precheck-smoke.mjs";
import {
  runSecretScanChecks,
  runStaticFileChecks
} from "./precheck-static.mjs";
import { normalizeChecks, phaseSummary } from "./precheck-shared.mjs";

export async function runPrecheck({ repoRoot = process.cwd() } = {}) {
  const checks = [];

  const staticFiles = await runStaticFileChecks({ repoRoot });
  checks.push(...staticFiles.checks);

  const contracts = await runContractPrecheck({ repoRoot });
  checks.push(...contracts.checks);

  const smoke = await runSmokePrecheck({ repoRoot });
  checks.push(...smoke.checks);

  const bridges = await runBridgePrecheck({
    repoRoot,
    repairTickets: smoke.artifacts.repairTickets,
    workOrderRouting: smoke.artifacts.workOrderRouting
  });
  checks.push(...bridges.checks);

  const currentLine = await runCurrentLinePrecheck({
    repoRoot,
    workOrderRouting: smoke.artifacts.workOrderRouting,
    langGraphBridge: bridges.artifacts.langGraphBridge
  });
  checks.push(...currentLine.checks);

  const secretScan = await runSecretScanChecks({ repoRoot });
  checks.push(...secretScan.checks);

  const phasedChecks = normalizeChecks(checks);

  return {
    mode: "dry-run",
    ok: phasedChecks.every((check) => check.ok),
    phase_summary: phaseSummary(phasedChecks),
    checks: phasedChecks
  };
}
