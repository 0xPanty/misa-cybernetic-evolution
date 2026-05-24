import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderMermaidSVG } from "beautiful-mermaid";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "docs",
  "diagrams",
  "misa-cybernetic-evolution-v0.28.mmd",
);
const outputPath = path.join(
  root,
  "docs",
  "assets",
  "misa-cybernetic-evolution-v0.28.svg",
);

const source = await readFile(sourcePath, "utf8");
const svg = renderMermaidSVG(source, {
  bg: "#08111f",
  fg: "#e5edf8",
  line: "#64748b",
  accent: "#38bdf8",
  muted: "#9fb3c8",
  surface: "#101a2d",
  border: "#334155",
  font: "Inter, Arial, sans-serif",
  padding: 28,
  nodeSpacing: 24,
  layerSpacing: 56,
  componentSpacing: 44,
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${svg}\n`);

console.log(`Rendered ${path.relative(root, outputPath)}`);
