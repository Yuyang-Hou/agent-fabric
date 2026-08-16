import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(rootDir, "config", "package-boundaries.json"), "utf8"));
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (["build", "dist", "node_modules", "coverage", "release"].includes(entry.name)) return [];
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name)) ? [target] : [];
  });
}

function importsFrom(text) {
  const values = [];
  const pattern = /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) values.push(match[1]);
  return values;
}

const errors = [];
for (const layer of config.layers) {
  const layerRoot = path.join(rootDir, layer.path);
  if (!fs.existsSync(path.join(layerRoot, "package.json"))) {
    errors.push(`${layer.path} is missing its package.json boundary`);
    continue;
  }
  for (const file of walk(layerRoot)) {
    const relativeLayerFile = path.relative(layerRoot, file);
    for (const specifier of importsFrom(fs.readFileSync(file, "utf8"))) {
      const forbidden = layer.forbiddenImports.find((prefix) => specifier === prefix || specifier.startsWith(prefix));
      const exception = layer.allowedImportExceptions?.some((entry) => (
        entry.file === relativeLayerFile
        && entry.imports.some((prefix) => specifier === prefix || specifier.startsWith(prefix))
      ));
      if (forbidden && !exception) errors.push(`${path.relative(rootDir, file)} imports forbidden boundary ${specifier}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `package-boundaries: ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("package-boundaries: ok");
}
