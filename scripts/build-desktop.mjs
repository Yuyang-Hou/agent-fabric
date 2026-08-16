import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "apps", "desktop");
const output = path.join(desktop, "build");
const edgeHost = path.join(root, "apps", "edge-host");
const edgeOutput = path.join(edgeHost, "build");
const require = createRequire(import.meta.url);
const codexAcpPath = require.resolve("@agentclientprotocol/codex-acp", {
  paths: [path.join(root, "adapters", "runtime-codex-acp")],
});
await fs.mkdir(output, { recursive: true });
await fs.rm(edgeOutput, { recursive: true, force: true });
await fs.mkdir(edgeOutput, { recursive: true });

await Promise.all([
  build({
    entryPoints: [path.join(root, "apps", "mcp-host", "src", "bin.ts")],
    outfile: path.join(edgeOutput, "account-agent-mcp.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: true,
  }),
]);

await Promise.all([
  fs.copyFile(codexAcpPath, path.join(edgeOutput, "codex-acp.mjs")),
  fs.copyFile(path.join(root, "docs", "supply-chain", "THIRD_PARTY_NOTICES.md"), path.join(output, "THIRD_PARTY_NOTICES.md")),
  fs.copyFile(path.join(root, "docs", "supply-chain", "sbom.cdx.json"), path.join(output, "sbom.cdx.json")),
]);

console.log(`desktop-build: ${output}`);
