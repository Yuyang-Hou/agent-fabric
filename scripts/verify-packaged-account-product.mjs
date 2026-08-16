import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installAccountAgentMcp, isAccountAgentMcpInstalled } from "../apps/edge-host/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const application = path.join(root, "apps", "desktop", "release", "mac-arm64", "Agent Fabric.app");
const runtimeExecutable = path.join(application, "Contents", "MacOS", "Agent Fabric");
const resources = path.join(application, "Contents", "Resources");
const packagedMain = path.join(resources, "app.asar", "build", "main.mjs");
const packagedPreload = path.join(resources, "app.asar", "build", "preload.cjs");
const mcpExecutable = path.join(resources, "edge-host", "account-agent-mcp.mjs");
const forbiddenLegacyExecutable = path.join(resources, "edge-host", "personal-agent-mcp.mjs");
const unpackedOpenAiModules = path.join(resources, "app.asar.unpacked", "node_modules", "@openai");
const forbiddenCodexPlatforms = [
  "codex-darwin-x64",
  "codex-linux-arm64",
  "codex-linux-x64",
  "codex-win32-arm64",
  "codex-win32-x64",
];

await Promise.all([access(runtimeExecutable), access(mcpExecutable), access(path.join(resources, "edge-host", "codex-acp.mjs")), access(path.join(resources, "app.asar"))]);
await assert.rejects(access(forbiddenLegacyExecutable));
await access(path.join(unpackedOpenAiModules, "codex-darwin-arm64"));
await Promise.all(forbiddenCodexPlatforms.map((packageName) => assert.rejects(access(path.join(unpackedOpenAiModules, packageName)))));
assert.deepEqual((await readdir(path.join(resources, "edge-host"))).sort(), ["account-agent-mcp.mjs", "account-agent-mcp.mjs.map", "codex-acp.mjs"]);

const loginCallbackBoundary = await runElectronNodeJson(runtimeExecutable, [
  "-e",
  'const fs=require("node:fs");const source=fs.readFileSync(process.argv[1],"utf8");console.log(JSON.stringify({prematureSuccess:source.includes("登录结果已返回 Agent Fabric"),finalSuccess:source.includes("登录已完成，可以关闭此页面"),finalFailure:source.includes("登录未完成，请返回 Agent Fabric 后重试"),secureHeaders:source.includes("frame-ancestors \'none\'")&&source.includes("no-store, max-age=0")}));',
  packagedMain,
]);
assert.deepEqual(loginCallbackBoundary, { prematureSuccess: false, finalSuccess: true, finalFailure: true, secureHeaders: true });

const preloadBoundary = await runElectronNodeJson(runtimeExecutable, [
  "-e",
  'const fs=require("node:fs");const source=fs.readFileSync(process.argv[1],"utf8");console.log(JSON.stringify({bytes:source.length,externalWorkspace:source.includes("require(\\\"@agent-fabric/account-agent-domain\\\")"),externalZod:source.includes("require(\\\"zod\\\")")}));',
  packagedPreload,
]);
assert.ok(preloadBoundary.bytes > 0);
assert.equal(preloadBoundary.externalWorkspace, false);
assert.equal(preloadBoundary.externalZod, false);

const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-packaged-account-product-"));
const accountConfiguration = path.join(directory, "account-agents-mcp.json");
const codexConfiguration = path.join(directory, "config.toml");
await writeFile(accountConfiguration, JSON.stringify({ localHost: "http://127.0.0.1:9", localToken: "redacted-smoke-token" }), { mode: 0o600 });
await writeFile(codexConfiguration, '[mcp_servers.preserved]\ncommand = "preserved"\n', { mode: 0o600 });

const installation = { runtimeExecutable, mcpExecutable, agentFabricConfigFile: accountConfiguration, codexConfigFile: codexConfiguration };
await installAccountAgentMcp(installation);
assert.equal(await isAccountAgentMcpInstalled(installation), true);
assert.equal((await stat(codexConfiguration)).mode & 0o777, 0o600);
assert.match(await readFile(codexConfiguration, "utf8"), /mcp_servers\.preserved/u);

const responses = await runMcp(runtimeExecutable, mcpExecutable, accountConfiguration);
assert.equal(responses[0]?.result?.serverInfo?.name, "agent-fabric-agents");
const toolNames = responses[1]?.result?.tools?.map((tool) => tool.name);
assert.deepEqual(toolNames, ["list_agents", "find_agent", "ask_agent", "get_task"]);
const renderer = await runPackagedRendererSmoke(runtimeExecutable, path.join(directory, "renderer-user-data"));
assert.equal(renderer.readyState, "complete");
assert.ok(renderer.rootChildren > 0);
assert.equal(renderer.accountApi, "object");
assert.match(renderer.visibleText, /登录 Agent Fabric|智能体/u);
assert.deepEqual(renderer.errors, []);

const desktopPackage = JSON.parse(await readFile(path.join(root, "apps", "desktop", "package.json"), "utf8"));
console.log(JSON.stringify({
  status: "ok",
  product: "Agent Fabric",
  version: desktopPackage.version,
  architecture: "arm64",
  packagedMcp: "Contents/Resources/edge-host/account-agent-mcp.mjs",
  packagedRuntime: "Contents/Resources/edge-host/codex-acp.mjs",
  codexConfigReadback: true,
  preservedExistingMcp: true,
  standaloneSandboxedPreload: true,
  transactionalLoginCallback: true,
  packagedCodexPlatform: "darwin-arm64",
  packagedRendererLive: true,
  tools: toolNames,
}));

async function runPackagedRendererSmoke(runtime, userDataDirectory) {
  const port = await reservePort();
  const child = spawn(runtime, [`--user-data-dir=${userDataDirectory}`, `--remote-debugging-port=${port}`], {
    env: { ...process.env, AGENT_FABRIC_MODE: "account-ui-acceptance", AGENT_FABRIC_CAPTURE_STATE: "login" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
  try {
    const target = await waitForRendererTarget(port, child, () => stderr);
    const desktopRequire = createRequire(path.join(root, "apps", "desktop", "package.json"));
    const WebSocket = (await import(pathToFileURL(desktopRequire.resolve("ws")).href)).default;
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    const errors = [];
    let requestId = 0;
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      } else if (message.method === "Runtime.exceptionThrown") errors.push(message.params?.exceptionDetails?.text ?? "renderer-exception");
      else if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") errors.push(message.params.entry.text);
    });
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = ++requestId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
    await Promise.all([send("Runtime.enable"), send("Log.enable"), send("Page.enable")]);
    await send("Page.reload", { ignoreCache: true });
    let evaluation;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      evaluation = await send("Runtime.evaluate", {
        expression: '({readyState:document.readyState,rootChildren:document.querySelector("#root")?.children.length??-1,accountApi:typeof window.agentFabricAccount,visibleText:document.body.innerText.slice(0,500)})',
        returnByValue: true,
      });
      const state = evaluation.result?.result?.value;
      if (state?.readyState === "complete" && state.rootChildren > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    socket.close();
    return { ...evaluation.result?.result?.value, errors };
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForRendererTarget(port, child, stderr) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`packaged-renderer-exit-${child.exitCode}:${stderr().slice(-400)}`);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((candidate) => candidate.type === "page");
      if (target) return target;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`packaged-renderer-timeout:${stderr().slice(-400)}`);
}

function runElectronNodeJson(runtime, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, arguments_, { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) return reject(new Error(`packaged-node-exit-${code}:${stderr.slice(-400)}`));
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); }
    });
  });
}

function runMcp(runtime, mcp, config) {
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, [mcp, "--config", config], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) return reject(new Error(`packaged-mcp-exit-${code}:${stderr.slice(0, 200)}`));
      try { resolve(stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))); }
      catch (error) { reject(error); }
    });
    child.stdin.end([
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      "",
    ].join("\n"));
  });
}
