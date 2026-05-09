import { validateSchemas } from "./lib/schema-validation.mjs";

const result = await validateSchemas();

for (const check of result.checks) {
  const label = check.ok ? "PASS" : "FAIL";
  console.log(`${label} ${check.name}`);
  if (!check.ok && check.errors?.length) {
    console.log(JSON.stringify(check.errors, null, 2));
  }
}

process.exitCode = result.ok ? 0 : 1;
