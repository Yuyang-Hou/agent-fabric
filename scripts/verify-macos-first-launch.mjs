import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromDesktop = createRequire(path.join(root, "apps", "desktop", "package.json"));
const WebSocket = (await import(pathToFileURL(requireFromDesktop.resolve("ws")).href)).default;
const desktopPackage = JSON.parse(await readFile(path.join(root, "apps", "desktop", "package.json"), "utf8"));
const sourceDiskImage = path.join(root, "apps", "desktop", "release", `Agent-Fabric-${desktopPackage.version}-arm64.dmg`);
const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-quarantine-launch-"));
const downloadedDiskImage = path.join(directory, "Agent-Fabric.dmg");
const mount = path.join(directory, "mounted");
const install = path.join(directory, "Applications");
const application = path.join(install, "Agent Fabric.app");
const userData = path.join(directory, "user-data");
const quarantine = `0083;${Math.floor(Date.now() / 1000).toString(16)};AgentFabricReleaseTest;`;
let mounted = false;

try {
  await Promise.all([mkdir(mount), mkdir(install), mkdir(userData)]);
  await copyFile(sourceDiskImage, downloadedDiskImage);
  await checked("/usr/bin/xattr", ["-w", "com.apple.quarantine", quarantine, downloadedDiskImage]);
  const diskQuarantine = await checked("/usr/bin/xattr", ["-p", "com.apple.quarantine", downloadedDiskImage]);
  assert.match(diskQuarantine, /AgentFabricReleaseTest/u);

  await checked("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, downloadedDiskImage]);
  mounted = true;
  await checked("/usr/bin/ditto", [path.join(mount, "Agent Fabric.app"), application]);
  await checked("/usr/bin/xattr", ["-w", "com.apple.quarantine", quarantine, application]);
  const applicationQuarantine = await checked("/usr/bin/xattr", ["-p", "com.apple.quarantine", application]);
  assert.match(applicationQuarantine, /AgentFabricReleaseTest/u);

  const gatekeeper = await checked("/usr/sbin/spctl", ["-a", "-vv", "-t", "exec", application]);
  assert.match(gatekeeper, /accepted/iu);

  const port = await reservePort();
  await checked("/usr/bin/open", [
    "-n", application, "--args",
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
  ]);
  const renderer = await waitForRenderer(port, userData);
  assert.equal(renderer.readyState, "complete");
  assert.ok(renderer.rootChildren > 0);
  assert.match(renderer.visibleText, /登录 Agent Fabric|智能体/u);
  assert.doesNotMatch(renderer.visibleText, /我的 Agent|Agent 好友|消息动态/u);
  assert.deepEqual(renderer.errors, []);

  await stopApplication(application);
  console.log(JSON.stringify({
    status: "ok",
    version: desktopPackage.version,
    architecture: "arm64",
    quarantineOnDiskImage: true,
    quarantineOnInstalledApp: true,
    gatekeeper: "accepted",
    firstLaunch: "passed",
    renderer: "account-agents-product",
    whiteScreen: false,
  }));
} finally {
  await stopApplication(application).catch(() => {});
  if (mounted) await checked("/usr/bin/hdiutil", ["detach", mount, "-quiet"]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}

async function waitForRenderer(port, userDataPath) {
  const errors = [];
  let sawApplicationProcess = false;
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((candidate) => candidate.type === "page");
      if (target) return inspectRenderer(target, errors);
    } catch {}
    const applicationProcessRunning = await isApplicationProcessRunning(userDataPath);
    sawApplicationProcess ||= applicationProcessRunning;
    if (sawApplicationProcess && !applicationProcessRunning) {
      throw new Error("quarantined-first-launch-exited-before-renderer");
    }
    if (attempt === 100) console.log("FIRST_LAUNCH_WAITING_FOR_USER_CONFIRMATION");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("quarantined-first-launch-timeout");
}

async function isApplicationProcessRunning(userDataPath) {
  try {
    await execFileAsync("/usr/bin/pgrep", ["-f", `user-data-dir=${userDataPath}`]);
    return true;
  } catch {
    return false;
  }
}

async function inspectRenderer(target, errors) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
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
  await Promise.all([send("Runtime.enable"), send("Log.enable")]);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const evaluation = await send("Runtime.evaluate", {
    expression: '({readyState:document.readyState,rootChildren:document.querySelector("#root")?.children.length??-1,visibleText:document.body.innerText.slice(0,800)})',
    returnByValue: true,
  });
  socket.close();
  return { ...evaluation.result?.result?.value, errors };
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function stopApplication(applicationPath) {
  const executable = path.join(applicationPath, "Contents", "MacOS", "Agent Fabric");
  let result;
  try {
    result = await execFileAsync("/usr/bin/pgrep", ["-f", executable], { encoding: "utf8" });
  } catch {
    return;
  }
  for (const value of result.stdout.trim().split(/\s+/u)) {
    const pid = Number(value);
    if (Number.isInteger(pid) && pid > 1) process.kill(pid, "SIGTERM");
  }
}

async function checked(command, arguments_) {
  try {
    const result = await execFileAsync(command, arguments_, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "unknown";
    throw new Error(`first-launch-command-failed:${path.basename(command)}:${code}`);
  }
}
