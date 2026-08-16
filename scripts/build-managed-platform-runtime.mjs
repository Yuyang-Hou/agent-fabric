import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = path.join(rootDir, "apps", "server", "runtime");

fs.rmSync(runtimeDir, { recursive: true, force: true });

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["--filter", "@agent-fabric/server", "deploy", "--prod", runtimeDir],
  {
    cwd: rootDir,
    env: { ...process.env, CI: "true" },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log("managed-platform-runtime: built");

const clientArtifact = path.join(rootDir, "dist", "artifacts", "agent-fabric-client-0.1.0.tgz");
const runtimeClientDirectory = path.join(runtimeDir, "client");
fs.mkdirSync(runtimeClientDirectory, { recursive: true });
fs.copyFileSync(clientArtifact, path.join(runtimeClientDirectory, "agent-fabric-client.tgz"));
console.log("managed-platform-runtime: client artifact included");
