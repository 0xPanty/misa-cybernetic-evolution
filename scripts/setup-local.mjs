#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function main() {
  if (nodeMajor() < 20) {
    console.error(`Node.js >=20 is required. Current: ${process.version}`);
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  const skipInstall = args.includes("--skip-install");
  const quickstartArgs = args.filter((arg) => arg !== "--skip-install");

  console.log("misa local setup");
  console.log("scope: local sidecar only; no production deploy, no provider calls");

  if (!skipInstall) {
    console.log("step 1/2 npm ci");
    await run(npmCommand(), ["ci"]);
  } else {
    console.log("step 1/2 npm ci skipped");
  }

  console.log("step 2/2 local sidecar quickstart");
  await run(process.execPath, ["scripts/local-quickstart.mjs", ...quickstartArgs]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
