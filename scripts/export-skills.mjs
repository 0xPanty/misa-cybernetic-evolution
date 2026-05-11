import { exportMinimalPositiveSkills } from "./lib/memory-layer.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const result = await exportMinimalPositiveSkills({
  sourceDir: readArg("source-dir"),
  vpsRawDir: readArg("vps-raw-dir"),
  outDir: readArg("out-dir")
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`export-skills ok=${result.ok}`);
  console.log(`exported=${result.exported_count}`);
  console.log(`output_dir=${result.output_dir}`);
}

process.exitCode = result.ok ? 0 : 1;
