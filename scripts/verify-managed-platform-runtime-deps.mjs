import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = path.join(rootDir, "apps", "server", "runtime");
const dockerIgnore = fs.readFileSync(path.join(rootDir, ".dockerignore"), "utf8");
const requiredPaths = [
  "package.json",
  "dist/bin.js",
  "dist/server.js",
  "node_modules/.pnpm",
  "node_modules/@a2a-js/sdk",
  "node_modules/@agent-fabric/persistence-mysql",
  "node_modules/express",
  "node_modules/ws",
];

const missing = requiredPaths.filter((relativePath) => !fs.existsSync(path.join(runtimeDir, relativePath)));
for (const requiredRule of ["!apps/server/runtime", "!apps/server/runtime/**"]) {
  if (!dockerIgnore.split(/\r?\n/u).includes(requiredRule)) missing.push(`.dockerignore rule ${requiredRule}`);
}
if (missing.length > 0) {
  console.error(missing.map((entry) => `managed-platform-runtime-deps: missing ${entry}`).join("\n"));
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--input-type=module", "--eval", 'await import("./dist/server.js")'],
  { cwd: runtimeDir, encoding: "utf8" },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

console.log("managed-platform-runtime-deps: ok (self-contained server import)");
