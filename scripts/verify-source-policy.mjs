import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_FIELDS = [
  "id",
  "project",
  "repository",
  "pinnedRef",
  "license",
  "licensePolicy",
  "adoptionStatus",
  "packageNames",
  "usage",
  "noticeRequirement",
  "replacementBoundary",
  "localModifications",
];

const PRODUCT_ROOTS = ["apps", "packages", "adapters"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".go", ".rs", ".py", ".css", ".html", ".svg"]);
const MANIFEST_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export function validateLedger(ledger, rootDir) {
  const errors = [];
  if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.entries)) {
    return ["third-party ledger must use schemaVersion 1 and contain entries"];
  }

  const ids = new Set();
  const packages = new Set();
  for (const entry of ledger.entries) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in entry) || entry[field] === "") errors.push(`${entry.id ?? "<unknown>"}: missing ${field}`);
    }
    if (ids.has(entry.id)) errors.push(`${entry.id}: duplicate id`);
    ids.add(entry.id);
    if (!/^[0-9a-f]{40}$|^v?\d+\.\d+\.\d+(?:[-+].+)?$/i.test(entry.pinnedRef ?? "")) {
      errors.push(`${entry.id}: pinnedRef must be a full commit or semantic version`);
    }
    for (const packageName of entry.packageNames ?? []) {
      if (packages.has(packageName)) errors.push(`${entry.id}: duplicate package mapping ${packageName}`);
      packages.add(packageName);
    }
    if (entry.licensePolicy === "forbidden-product-code" && entry.adoptionStatus !== "reference-only") {
      errors.push(`${entry.id}: forbidden product source must remain reference-only`);
    }
    if (entry.licensePolicy === "forbidden-product-code") {
      if (!entry.researchCheckout || !path.isAbsolute(entry.researchCheckout)) {
        errors.push(`${entry.id}: forbidden product source must declare an external absolute researchCheckout`);
      }
      if (!Array.isArray(entry.researchEvidence) || entry.researchEvidence.length === 0) {
        errors.push(`${entry.id}: forbidden product source must declare approved researchEvidence paths`);
      }
      if (!entry.researchRecord || !fs.existsSync(path.join(rootDir, entry.researchRecord))) {
        errors.push(`${entry.id}: forbidden product source must declare an existing researchRecord`);
      }
    }
    if (entry.licensePolicy === "commercial-gate" && entry.adoptionStatus !== "external-service-candidate") {
      errors.push(`${entry.id}: commercially gated source may only be an external service candidate`);
    }
    if (entry.adoptionStatus === "approved" && entry.noticeRequirement !== "none") {
      if (!entry.noticeFile) errors.push(`${entry.id}: approved source is missing noticeFile`);
      else if (!fs.existsSync(path.join(rootDir, entry.noticeFile))) errors.push(`${entry.id}: noticeFile does not exist`);
    }
  }
  return errors;
}

export function validateManifest(manifest, ledger, relativePath) {
  const registered = new Set(ledger.entries.flatMap((entry) => entry.packageNames ?? []));
  const errors = [];
  for (const field of MANIFEST_DEPENDENCY_FIELDS) {
    for (const packageName of Object.keys(manifest[field] ?? {})) {
      if (packageName.startsWith("@agent-fabric/")) continue;
      if (!registered.has(packageName)) errors.push(`${relativePath}: unregistered dependency ${packageName}`);
    }
  }
  return errors;
}

export function findForbiddenProductSource(rootDir) {
  const errors = [];
  const patterns = [
    /@multica(?:\/|["'])/i,
    /multica-main/i,
    /(?:\/Users\/[^\s"'`]+\/|file:\/\/[^\s"'`]+\/)?multica\/packages\//i,
    /Copyright \(c\) 2025-2026 Multica, Inc\./i,
    /built on Multica/i,
    /\b(?:CollectionPageHeader|CollectionPageHeaderAction|useAgentsViewStore|AGENT_DEFAULT_HIDDEN_COLUMNS|ListGridHeaderCell|AgentCreateShell)\b/,
    /--agc-[a-z0-9-]+/i,
    /["'`]\/api\/agent-builder\/sessions(?:[/?"'`]|$)/i,
    /\bMUL-\d+\b/,
    /colleague-agent-mesh/i,
    /["'`]\/api\/tasks(?:[/?"'`]|$)/i,
    /DemoTaskStore/,
  ];
  for (const relativeRoot of PRODUCT_ROOTS) {
    for (const file of walkFiles(path.join(rootDir, relativeRoot))) {
      const relativeFile = path.relative(rootDir, file);
      if (/multica(?:-main|[._-](?:logo|icon|brand))/iu.test(relativeFile)) {
        errors.push(`${relativeFile}: forbidden Multica product asset/path detected`);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(file))) continue;
      const text = fs.readFileSync(file, "utf8");
      if (patterns.some((pattern) => pattern.test(text))) {
        errors.push(`${relativeFile}: forbidden product source/import marker detected`);
      }
    }
  }
  return errors;
}

export function verifySourcePolicy(rootDir) {
  const ledgerPath = path.join(rootDir, "config", "third-party-sources.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const errors = validateLedger(ledger, rootDir);

  const manifests = walkFiles(rootDir).filter((file) => path.basename(file) === "package.json");
  for (const manifestPath of manifests) {
    const relative = path.relative(rootDir, manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    errors.push(...validateManifest(manifest, ledger, relative));
  }
  errors.push(...findForbiddenProductSource(rootDir));
  return errors;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const errors = verifySourcePolicy(rootDir);
  if (errors.length > 0) {
    console.error(errors.map((error) => `source-policy: ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("source-policy: ok");
  }
}
