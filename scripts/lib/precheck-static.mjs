import {
  CORE_REQUIRED_FILES,
  INVENTORY_FILES,
  MACHINE_CONTRACT_FILES,
  PHASES,
  REFERENCE_FILES,
  checkResult,
  fileSetCheck,
  missingFiles,
  readPackageVersion,
  readReadmeVersion,
  scanForSecretAssignments
} from "./precheck-shared.mjs";

export async function runStaticFileChecks({ repoRoot }) {
  const checks = [];

  const missingRequired = await missingFiles(repoRoot, CORE_REQUIRED_FILES);
  checks.push(fileSetCheck(
    "core active file set",
    missingRequired,
    CORE_REQUIRED_FILES.length,
    "core active file missing"
  ));

  const missingMachineContracts = await missingFiles(repoRoot, MACHINE_CONTRACT_FILES);
  checks.push(fileSetCheck(
    "required machine contract set",
    missingMachineContracts,
    MACHINE_CONTRACT_FILES.length,
    "required machine contract missing",
    PHASES.contracts
  ));

  const referenceInventoryFiles = [...new Set([...REFERENCE_FILES, ...INVENTORY_FILES])];
  const missingReferenceInventory = await missingFiles(repoRoot, referenceInventoryFiles);
  checks.push(checkResult("reference and auxiliary inventory", true, {
    phase: PHASES.static,
    checked: referenceInventoryFiles.length,
    missing: missingReferenceInventory,
    warnings: missingReferenceInventory.map((rel) => `optional reference file missing: ${rel}`)
  }));

  const packageVersion = await readPackageVersion(repoRoot);
  const readmeVersion = await readReadmeVersion(repoRoot);
  const versionSynced = Boolean(packageVersion && readmeVersion && packageVersion === readmeVersion);
  checks.push(checkResult("README/package version sync", versionSynced, {
    phase: PHASES.static,
    packageVersion,
    readmeVersion,
    violations: versionSynced
      ? []
      : [`README version ${readmeVersion ?? "missing"} does not match package.json ${packageVersion ?? "missing"}`]
  }));

  return { checks };
}

export async function runSecretScanChecks({ repoRoot }) {
  const secretHits = await scanForSecretAssignments(repoRoot);
  return {
    checks: [
      checkResult("no committed secret assignments", secretHits.length === 0, {
        phase: PHASES.static,
        hits: secretHits
      })
    ]
  };
}
