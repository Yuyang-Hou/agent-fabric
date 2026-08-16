import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "docs", "supply-chain");
const sbomPath = path.join(outputDirectory, "sbom.cdx.json");
const noticesPath = path.join(outputDirectory, "THIRD_PARTY_NOTICES.md");
const ledger = JSON.parse(fs.readFileSync(path.join(root, "config", "third-party-sources.json"), "utf8"));
const currentProduct = JSON.parse(fs.readFileSync(path.join(root, "config", "default-product.json"), "utf8"));
const productPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const filters = currentProduct.supplyChainPackages.flatMap((packageName) => ["--filter", packageName]);
const listed = JSON.parse(execFileSync("pnpm", [...filters, "list", "--depth", "Infinity", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}));

const components = collectComponents(listed, ledger);
const sbom = `${JSON.stringify({
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: { component: { type: "application", name: "agent-fabric", version: productPackage.version } },
  components: components.map((component) => ({
    type: "library",
    name: component.name,
    version: component.version,
    "bom-ref": component.purl,
    purl: component.purl,
    licenses: [{ license: { name: component.license } }],
    properties: [{
      name: "agent-fabric:replacement-boundary",
      value: component.replacementBoundary ?? "Transitive dependency behind a registered direct package boundary",
    }],
  })),
}, null, 2)}\n`;

const notices = renderNotices(components, ledger.asOf);
if (process.argv.includes("--check")) {
  const errors = [];
  if (!fs.existsSync(sbomPath) || fs.readFileSync(sbomPath, "utf8") !== sbom) errors.push("SBOM is stale");
  if (!fs.existsSync(noticesPath) || fs.readFileSync(noticesPath, "utf8") !== notices) errors.push("third-party notices are stale");
  if (errors.length > 0) {
    console.error(errors.map((error) => `supply-chain: ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`supply-chain: ok (${components.length} components)`);
  }
} else {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(sbomPath, sbom);
  fs.writeFileSync(noticesPath, notices);
  console.log(`supply-chain: generated ${components.length} components`);
}

function collectComponents(workspaces, sourceLedger) {
  const values = new Map();
  const ledgerByPackage = new Map(
    sourceLedger.entries.flatMap((entry) => (entry.packageNames ?? []).map((name) => [name, entry])),
  );
  const visit = (node, nameHint) => {
    if (!node || typeof node !== "object") return;
    const packageName = typeof node.name === "string" ? node.name : nameHint;
    if (typeof packageName === "string" && typeof node.version === "string" && !packageName.startsWith("@agent-fabric/") && packageName !== "agent-fabric") {
      const key = `${packageName}@${node.version}`;
      if (!values.has(key)) {
        const manifest = readPackageManifest(node.path);
        if (manifest) {
          const ledgerEntry = ledgerByPackage.get(packageName);
          values.set(key, {
            name: packageName,
            version: node.version,
            purl: packageUrl(packageName, node.version),
            license: normalizeLicense(manifest.license),
            licenseText: readLicenseText(node.path),
            repository: normalizeRepository(manifest.repository),
            replacementBoundary: ledgerEntry?.replacementBoundary,
          });
        }
      }
    }
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [dependencyName, dependency] of Object.entries(node[field] ?? {})) {
        visit(dependency, dependencyName);
      }
    }
  };
  for (const workspace of workspaces) visit(workspace, workspace.name);
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
}

function readPackageManifest(packagePath) {
  if (!packagePath) return undefined;
  const manifestPath = path.join(packagePath, "package.json");
  return fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : undefined;
}

function readLicenseText(packagePath) {
  if (!packagePath || !fs.existsSync(packagePath)) return "License text was not present in the installed package.";
  const candidates = fs.readdirSync(packagePath).filter((name) => /^(?:licen[cs]e|copying)(?:\..+)?$/iu.test(name)).sort();
  if (candidates.length === 0) return "License text was not present in the installed package.";
  return candidates.map((name) => fs.readFileSync(path.join(packagePath, name), "utf8").trim()).join("\n\n");
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value.type === "string") return value.type;
  return "UNKNOWN";
}

function normalizeRepository(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.url === "string") return value.url;
  return "not-declared";
}

function packageUrl(name, version) {
  const encodedName = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encodedName}@${version}`;
}

function renderNotices(values, asOf) {
  const sections = values.map((component) => {
    const escapedLicense = component.licenseText
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return `## ${component.name}@${component.version}\n\n- License: ${component.license}\n- Repository: ${component.repository}\n- Replacement boundary: ${component.replacementBoundary ?? "transitive dependency"}\n\n<details><summary>License text</summary><pre>${escapedLicense}</pre></details>`;
  });
  return `# Agent Fabric Third-Party Notices\n\nGenerated from the exact installed dependency graph as of ${asOf}. This file must ship with every distributable.\n\n${sections.join("\n\n")}\n`;
}
