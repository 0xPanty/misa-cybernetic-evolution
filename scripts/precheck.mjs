import { runPrecheck } from "./lib/precheck-core.mjs";

const jsonMode = process.argv.includes("--json");
const result = await runPrecheck();

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("misa-cybernetic-evolution precheck");
  console.log(`mode: ${result.mode}`);
  if (result.phase_summary) {
    const phases = Object.entries(result.phase_summary)
      .map(([phase, summary]) => `${phase} ${summary.passed}/${summary.total}`)
      .join(", ");
    console.log(`phases: ${phases}`);
  }

  for (const check of result.checks) {
    const label = check.ok ? "PASS" : "FAIL";
    console.log(`${label} [${check.phase}] ${check.name}`);

    if (check.warnings?.length) {
      for (const warning of check.warnings) {
        console.log(`  warning: ${warning}`);
      }
    }

    if (check.violations?.length) {
      for (const violation of check.violations) {
        console.log(`  violation: ${violation}`);
      }
    }

    if (check.hits?.length) {
      for (const hit of check.hits) {
        console.log(`  hit: ${hit}`);
      }
    }
  }
}

process.exitCode = result.ok ? 0 : 1;
