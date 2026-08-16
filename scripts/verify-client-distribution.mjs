import { execFileSync } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const distribution = path.join(root, "dist", "client");
const artifact = await readFile(path.join(root, "dist", "artifacts", "agent-fabric-client-0.1.0.tgz"));
const serverArtifact = await readFile(path.join(root, "apps", "server", "client", "agent-fabric-client.tgz"));
if (!artifact.equals(serverArtifact)) throw new Error("client-distribution-server-artifact-mismatch");
const manifest = JSON.parse(await readFile(path.join(distribution, "package.json"), "utf8"));
if (manifest.bin?.["agent-fabric"] !== "agent-fabric.js" || manifest.bin?.["agent-fabric-mcp"] !== "agent-fabric-mcp.js" || Object.keys(manifest.bin).length !== 2) throw new Error("client-distribution-bin-invalid");
const prefix = await mkdtemp(path.join(tmpdir(), "agent-fabric-client-"));
const npmCache = path.join(prefix, ".npm-cache");
const environment = { ...process.env, npm_config_cache: npmCache };
const packed = execFileSync("npm", ["pack", distribution, "--pack-destination", prefix], { cwd: root, env: environment, encoding: "utf8" }).trim().split("\n").at(-1);
if (!packed) throw new Error("client-distribution-pack-failed");
execFileSync("npm", ["install", "--global", "--prefix", prefix, path.join(prefix, packed)], { cwd: root, env: environment, stdio: "ignore" });
const help = execFileSync(path.join(prefix, "bin", "agent-fabric"), ["help"], { encoding: "utf8" });
if (!help.includes("Agent Fabric CLI") || !help.includes("agents list") || !help.includes("self-test") || /publish|join|revision|deployment/iu.test(help)) throw new Error("client-distribution-smoke-failed");
if (await access(path.join(prefix, "lib", "node_modules", "agent-fabric-client", "agent-fabric-edge.js")).then(() => true).catch(() => false)) throw new Error("client-distribution-legacy-edge-present");
for (const skill of ["ask-fabric-agent"]) {
  const skillDefinition = await readFile(path.join(prefix, "lib", "node_modules", "agent-fabric-client", "skills", skill, "SKILL.md"), "utf8");
  if (!skillDefinition.includes(`name: ${skill}`)) throw new Error(`client-distribution-skill-missing:${skill}`);
}
if (await access(path.join(prefix, "lib", "node_modules", "agent-fabric-client", "skills", "publish-agent-context")).then(() => true).catch(() => false)) {
  throw new Error("client-distribution-legacy-publication-skill-present");
}
console.log(`client-distribution: ok (${packed})`);
