import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(rootDir, "config", "default-product.json"), "utf8"));
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const expectedChange = "replace-account-members-with-friends";
const expectedNavigation = ["agents", "runtimes", "friends"];
const expectedMcpTools = ["list_agents", "find_agent", "ask_agent", "get_task"];
const expectedWorkspacePackages = [
  "apps/cli",
  "apps/desktop",
  "apps/edge-host",
  "apps/mcp-host",
  "apps/server",
  "packages/a2a-task",
  "packages/account-agent-domain",
  "packages/client",
  "packages/codex-plugin",
  "packages/fabric-contracts",
  "packages/mcp-server",
  "packages/persistence-mysql",
  "packages/runtime-contract",
  "adapters/runtime-codex-acp",
  "adapters/runtime-fake",
];
const expectedSourceRoots = [
  "packages/account-agent-domain/src",
  "apps/server/src/server.ts",
  "apps/server/src/account-agent-a2a.ts",
  "apps/server/src/account-invalidation.ts",
  "apps/server/src/account-runtime-tunnel.ts",
  "apps/edge-host/src/account-agents",
  "apps/edge-host/src/account-infrastructure",
  "packages/mcp-server/src/account-agents",
  "apps/cli/src/index.ts",
  "apps/desktop/src/account-product",
  "apps/desktop/src/account-infrastructure",
  "apps/desktop/src/account-agent-cloud-gateway.ts",
  "apps/desktop/src/account-agent-mcp.ts",
  "apps/desktop/src/account-runtime.ts",
];
const supersededChanges = [
  "agent-fabric-v1-foundation",
  "trusted-agent-messenger-mvp",
  "headless-agent-fabric-cli-mcp",
  "minimal-agent-friend-messaging",
  "multica-aligned-agents-product",
];
const requiredForbiddenHistoricalRoots = [
  "apps/control-plane",
  "apps/desktop/src/personal-agent",
  "apps/edge-host/src/personal-agent",
  "apps/server/src/personal-agent",
  "deploy/compose",
  "docs/acceptance",
  "docs/adr",
  "docs/spike-gates",
  "packages/context-capsule",
  "packages/matrix-transport",
  "packages/messenger-domain",
  "packages/persistence-postgres",
  "packages/personal-agent-domain",
  "packages/test-kit",
  "packages/ui",
  "skills/publish-to-atlas",
  "spikes/assistant-ui",
  "spikes/matrix-e2ee",
  "spikes/paperclip-adapters",
];

function walk(root) {
  if (!fs.existsSync(root)) return [];
  if (fs.statSync(root).isFile()) return sourceExtensions.has(path.extname(root)) ? [root] : [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (["build", "dist", "node_modules", "coverage"].includes(entry.name)) return [];
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(target);
    return entry.isFile() && sourceExtensions.has(path.extname(entry.name)) ? [target] : [];
  });
}

function importedSpecifiers(text) {
  const values = [];
  const pattern = /(?:from\s+|import\s*(?:\(|)|require\s*\()\s*["']([^"']+)["']/gu;
  for (const match of text.matchAll(pattern)) values.push(match[1]);
  return values;
}

function readWorkspacePackages(candidateRoot) {
  const workspacePath = path.join(candidateRoot, "pnpm-workspace.yaml");
  if (!fs.existsSync(workspacePath)) return undefined;
  const packages = [];
  let inPackages = false;
  for (const line of fs.readFileSync(workspacePath, "utf8").split(/\r?\n/u)) {
    if (line === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/u.test(line)) break;
    const match = inPackages ? line.match(/^\s+-\s+([^#]+?)\s*$/u) : undefined;
    if (match) packages.push(match[1].replace(/^["']|["']$/gu, ""));
  }
  return packages;
}

export function verifyDefaultProduct(candidateRoot = rootDir, candidateConfig = config) {
  const errors = [];
  if (candidateConfig.schemaVersion !== 3) errors.push("default product config must use schemaVersion 3");
  if (candidateConfig.change !== expectedChange) errors.push(`default product change must be ${expectedChange}`);
  if (candidateConfig.tenantBoundary !== "account") errors.push("default product tenant boundary must be account");
  if (candidateConfig.multipleAgents !== true) errors.push("default product must allow multiple Agents per Account");
  if (JSON.stringify(candidateConfig.navigation) !== JSON.stringify(expectedNavigation)) {
    errors.push("default product navigation must be exactly agents, runtimes, friends");
  }
  if (candidateConfig.cloudDatabase !== "mysql") errors.push("default product Cloud database must be mysql");
  try {
    const server = new URL(candidateConfig.desktopServerBaseUrl);
    if (server.protocol !== "https:" || server.pathname !== "/" || server.search || server.hash || server.username || server.password) errors.push("default product Desktop server must be a clean https origin");
  } catch {
    errors.push("default product Desktop server must be a clean https origin");
  }
  if (JSON.stringify(candidateConfig.mcpTools) !== JSON.stringify(expectedMcpTools)) {
    errors.push("default product MCP tools must be exactly list_agents, find_agent, ask_agent, get_task");
  }
  if (JSON.stringify(candidateConfig.sourceRoots) !== JSON.stringify(expectedSourceRoots)) {
    errors.push("default product implementation roots must use the Account-scoped multi-Agent vertical slice");
  }
  if (JSON.stringify(candidateConfig.workspacePackages) !== JSON.stringify(expectedWorkspacePackages)) {
    errors.push("default product workspace packages must be the exact current Account Agents graph");
  }
  const workspacePackages = readWorkspacePackages(candidateRoot);
  if (!workspacePackages) errors.push("default product pnpm workspace is missing");
  else if (JSON.stringify(workspacePackages) !== JSON.stringify(candidateConfig.workspacePackages)) {
    errors.push("pnpm workspace packages must match the exact default product graph");
  }
  for (const root of requiredForbiddenHistoricalRoots) {
    if (!candidateConfig.forbiddenHistoricalRoots?.includes(root)) {
      errors.push(`default product must forbid historical product path: ${root}`);
    }
  }
  for (const root of candidateConfig.forbiddenHistoricalRoots ?? []) {
    if (fs.existsSync(path.join(candidateRoot, root))) {
      errors.push(`forbidden historical product path remains: ${root}`);
    }
  }
  if (JSON.stringify(candidateConfig.clientBins) !== JSON.stringify(["agent-fabric", "agent-fabric-mcp"])) {
    errors.push("default client bins must be exactly agent-fabric and agent-fabric-mcp");
  }
  for (const relativeManifest of candidateConfig.packageManifests ?? []) {
    const absoluteManifest = path.join(candidateRoot, relativeManifest);
    if (!fs.existsSync(absoluteManifest)) {
      errors.push(`default product package manifest missing: ${relativeManifest}`);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
    const dependencies = { ...(manifest.dependencies ?? {}), ...(manifest.optionalDependencies ?? {}) };
    for (const dependency of Object.keys(dependencies)) {
      if (candidateConfig.forbiddenImports.some((prefix) => dependency === prefix || dependency.startsWith(prefix))) {
        errors.push(`${relativeManifest} depends on forbidden default-product package ${dependency}`);
      }
    }
  }
  for (const relativeEntry of candidateConfig.buildEntryFiles ?? []) {
    const absoluteEntry = path.join(candidateRoot, relativeEntry);
    if (!fs.existsSync(absoluteEntry)) {
      errors.push(`default product build entry missing: ${relativeEntry}`);
      continue;
    }
    const text = fs.readFileSync(absoluteEntry, "utf8");
    for (const marker of ["agent-fabric-edge", "atlas-cli", "personal-agent-mcp", "crypto-worker-entry"]) {
      if (text.includes(marker)) errors.push(`${relativeEntry} contains forbidden shipped entry ${marker}`);
    }
  }
  for (const change of supersededChanges) {
    if (!candidateConfig.supersededChanges?.includes(change)) errors.push(`default product must supersede historical change ${change}`);
  }
  for (const relativeFile of candidateConfig.authorityFiles ?? []) {
    const absoluteFile = path.join(candidateRoot, relativeFile);
    if (!fs.existsSync(absoluteFile)) {
      errors.push(`default product authority file missing: ${relativeFile}`);
      continue;
    }
    const text = fs.readFileSync(absoluteFile, "utf8");
    if (!text.includes(expectedChange)) errors.push(`${relativeFile} does not name the current product authority ${expectedChange}`);
  }
  for (const relativeRoot of candidateConfig.requiredRoots ?? []) {
    if (!fs.existsSync(path.join(candidateRoot, relativeRoot))) errors.push(`required default product root missing: ${relativeRoot}`);
  }
  for (const relativeRoot of candidateConfig.sourceRoots ?? []) {
    for (const file of walk(path.join(candidateRoot, relativeRoot))) {
      const text = fs.readFileSync(file, "utf8");
      for (const specifier of importedSpecifiers(text)) {
        if (candidateConfig.forbiddenImports.some((prefix) => specifier === prefix || specifier.startsWith(prefix))) {
          errors.push(`${path.relative(candidateRoot, file)} imports forbidden default-product dependency ${specifier}`);
        }
      }
      for (const marker of candidateConfig.forbiddenSourceMarkers) {
        if (text.includes(marker)) errors.push(`${path.relative(candidateRoot, file)} contains forbidden default-product marker ${marker}`);
      }
    }
  }
  return errors;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const errors = verifyDefaultProduct();
  if (errors.length > 0) {
    console.error(errors.map((error) => `default-product: ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("default-product: ok");
  }
}
