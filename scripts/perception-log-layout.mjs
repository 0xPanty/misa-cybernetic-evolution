#!/usr/bin/env node

import {
  buildPerceptionLogLayout,
  initializePerceptionLogLayout
} from "./lib/perception-log-layout.mjs";
import { writeJsonOutFile } from "./lib/cli-output.mjs";

function readArg(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

const asJson = process.argv.includes("--json");
const shouldInit = process.argv.includes("--init");
const rootDir = readArg("root");
const options = { rootDir };
const layout = shouldInit
  ? await initializePerceptionLogLayout(options)
  : buildPerceptionLogLayout(options);

await writeJsonOutFile(layout, readArg("out-file"));

if (asJson) {
  console.log(JSON.stringify(layout, null, 2));
} else {
  console.log("Misa perception log layout");
  console.log(`mode: ${layout.mode}`);
  console.log(`root: ${layout.root_dir}`);
  console.log(`initialized: ${Boolean(layout.initialized)}`);
  console.log(`directories: ${layout.summary.directory_count}`);
  console.log(`perception_readable: ${layout.summary.perception_readable_count}`);
  console.log(`handoff_directories: ${layout.summary.handoff_directory_count}`);
  console.log(`archive_directories: ${layout.summary.archive_directory_count}`);
  console.log(`production_authority: ${layout.safety.production_authority}`);
  console.log(`llm_api_calls: ${layout.safety.llm_api_calls}`);
  console.log("directories:");
  for (const directory of layout.directories) {
    console.log(`- ${directory.path}: ${directory.purpose}`);
  }
}
