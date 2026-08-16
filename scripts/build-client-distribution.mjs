import { build } from "esbuild";
import { chmod, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist", "client");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  entryPoints: {
    "agent-fabric": path.join(root, "apps", "cli", "src", "bin.ts"),
    "agent-fabric-mcp": path.join(root, "apps", "mcp-host", "src", "bin.ts"),
  },
  outdir: output,
  entryNames: "[name]",
  bundle: true,
  platform: "node",
  format: "esm",
  banner: { js: "import { createRequire as __agentFabricCreateRequire } from 'node:module'; const require = __agentFabricCreateRequire(import.meta.url);" },
  target: "node20",
  sourcemap: false,
  minify: false,
});

await Promise.all(["agent-fabric.js", "agent-fabric-mcp.js"].map((file) => chmod(path.join(output, file), 0o755)));
await cp(path.join(root, "packages", "codex-plugin", "skills"), path.join(output, "skills"), { recursive: true });
await writeFile(path.join(output, "package.json"), `${JSON.stringify({
  name: "agent-fabric-client",
  version: "0.1.0",
  description: "Agent Fabric Account CLI and local Codex MCP host",
  type: "module",
  engines: { node: ">=20.9.0" },
  dependencies: {},
  bin: { "agent-fabric": "agent-fabric.js", "agent-fabric-mcp": "agent-fabric-mcp.js" },
  files: ["agent-fabric.js", "agent-fabric-mcp.js", "skills", "README.md"],
}, null, 2)}\n`, "utf8");
await writeFile(path.join(output, "README.md"), "# Agent Fabric Client\n\nThis package provides the Account-scoped Agent Fabric CLI and local Codex MCP host. Use `agent-fabric login`, `agent-fabric agents list`, `agent-fabric ask`, `agent-fabric task get` and `agent-fabric self-test` for an existing Account session. Agent, Runtime and member management belong to Agent Fabric Desktop. Desktop owns the authenticated local Runtime Host and installs the four-tool Codex MCP automatically.\n", "utf8");
const artifactDirectory = path.join(root, "dist", "artifacts");
await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });
const npmCacheDirectory = path.join(root, "dist", ".npm-cache");
await mkdir(npmCacheDirectory, { recursive: true });
execFileSync("npm", ["pack", output, "--pack-destination", artifactDirectory], {
  cwd: root,
  env: { ...process.env, npm_config_cache: npmCacheDirectory },
  stdio: "ignore",
});
const artifact = path.join(artifactDirectory, "agent-fabric-client-0.1.0.tgz");
const serverClientDirectory = path.join(root, "apps", "server", "client");
await rm(serverClientDirectory, { recursive: true, force: true });
await mkdir(serverClientDirectory, { recursive: true });
await copyFile(artifact, path.join(serverClientDirectory, "agent-fabric-client.tgz"));
console.log("client-distribution: built");
