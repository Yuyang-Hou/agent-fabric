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

const multicaBinary = path.join(desktop, "vendor", `multica-${process.platform}-${process.arch}`, "multica");

await Promise.all([
  fs.copyFile(codexAcpPath, path.join(edgeOutput, "codex-acp.mjs")),
  fs.copyFile(path.join(root, "docs", "supply-chain", "THIRD_PARTY_NOTICES.md"), path.join(output, "THIRD_PARTY_NOTICES.md")),
  fs.copyFile(path.join(root, "docs", "supply-chain", "sbom.cdx.json"), path.join(output, "sbom.cdx.json")),
  copyMulticaBinary(multicaBinary, path.join(edgeOutput, "multica")),
]);

console.log(`desktop-build: ${output}`);

async function copyMulticaBinary(source, destination) {
  try {
    await fs.copyFile(source, destination);
    await fs.chmod(destination, 0o755);
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.warn(`desktop-build: multica binary missing for ${process.platform}-${process.arch}; local runtime probe will be unavailable`);
      return;
    }
    throw error;
  }
}
