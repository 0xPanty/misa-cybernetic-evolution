import fs from "node:fs/promises";
import path from "node:path";

export async function loadPromptTemplateManifest({
  repoRoot = process.cwd(),
  manifestRel = "prompts/candidate-layer/manifest.json"
} = {}) {
  const raw = await fs.readFile(path.join(repoRoot, manifestRel), "utf8");
  const manifest = JSON.parse(raw);
  return {
    ...manifest,
    templates: manifest.templates.map((template) => ({
      ...template,
      path: template.path.replaceAll("\\", "/")
    }))
  };
}

export async function assertPromptTemplateFilesExist({
  repoRoot = process.cwd(),
  manifest
} = {}) {
  const missing = [];
  for (const template of manifest.templates ?? []) {
    const templatePath = path.join(repoRoot, template.path);
    const exists = await fs.stat(templatePath).then((stat) => stat.isFile()).catch(() => false);
    if (!exists) missing.push(template.path);
  }
  return {
    ok: missing.length === 0,
    missing
  };
}

export function promptRefsFromManifest(manifest) {
  return (manifest.templates ?? []).map((template) => ({
    template_id: template.template_id,
    version: template.version,
    path: template.path,
    variables: template.variables,
    purpose: template.purpose
  }));
}
