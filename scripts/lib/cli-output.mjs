import fs from "node:fs/promises";
import path from "node:path";

export async function writeJsonOutFile(data, outFile, { repoRoot = process.cwd() } = {}) {
  if (!outFile) return undefined;

  const target = path.isAbsolute(outFile)
    ? outFile
    : path.join(repoRoot, outFile);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return target;
}
