import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROTOCOL_VERSION, client, methods, ndJsonStream } from "@agentclientprotocol/sdk";

import { normalizeAcpFailure } from "./src/error-normalizer.js";

const spikeRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(spikeRoot, "fixture");
const fixturePath = join(fixtureRoot, "README.md");
const adapterPath = join(spikeRoot, "node_modules", ".bin", "codex-acp");
const codexAcpRequire = createRequire(
  realpathSync(join(spikeRoot, "node_modules", "@agentclientprotocol", "codex-acp", "dist", "index.js")),
);
const bundledCodexScript = codexAcpRequire.resolve("@openai/codex/bin/codex.js");
const explicitCodexPath = process.env.CODEX_PATH;

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function delay(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

async function fixtureDigest() {
  return createHash("sha256").update(await readFile(fixturePath)).digest("hex");
}

function textFromUpdates(updates, sessionId) {
  return updates
    .filter(({ params }) => params.sessionId === sessionId)
    .map(({ params }) => params.update)
    .filter((update) => update.sessionUpdate === "agent_message_chunk" && update.content.type === "text")
    .map((update) => update.content.text)
    .join("");
}

const adapterVersion = spawnSync(adapterPath, ["--version"], { encoding: "utf8" });
assert.equal(adapterVersion.status, 0, adapterVersion.stderr);

const codexVersion = explicitCodexPath
  ? spawnSync(explicitCodexPath, ["--version"], { encoding: "utf8" })
  : spawnSync(process.execPath, [bundledCodexScript, "--version"], { encoding: "utf8" });
assert.equal(codexVersion.status, 0, codexVersion.stderr);

const beforeDigest = await fixtureDigest();
const stderrChunks = [];
const childEnvironment = {
  ...process.env,
  INITIAL_AGENT_MODE: "read-only",
  NO_BROWSER: "1",
};
if (!explicitCodexPath) delete childEnvironment.CODEX_PATH;

const child = spawn(adapterPath, [], {
  cwd: fixtureRoot,
  env: childEnvironment,
  stdio: ["pipe", "pipe", "pipe"],
});
child.stderr.on("data", (chunk) => {
  stderrChunks.push(String(chunk));
  if (stderrChunks.length > 20) stderrChunks.shift();
});

const updates = [];
const permissionRequests = [];
const writeRequests = [];
const cancellationPromptText = "请对这个目录进行非常详细的逐文件分析，持续推理并给出长篇报告。";
const app = client({ name: "agent-fabric-acp-spike", version: "0.0.0" })
  .onRequest(methods.client.session.requestPermission, ({ params }) => {
    permissionRequests.push(params);
    return { outcome: { outcome: "cancelled" } };
  })
  .onRequest(methods.client.fs.writeTextFile, ({ params }) => {
    writeRequests.push(params);
    throw new Error("Client file writes are disabled by Agent Fabric");
  })
  .onNotification(methods.client.session.update, (notification) => {
    updates.push(notification);
  });

const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));

let completedSessionId;
let normalizedFailure;
let stage = "connect";
try {
  await withTimeout(
    app.connectWith(stream, async (agent) => {
      stage = "initialize";
      const initialized = await agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "agent-fabric-acp-spike", version: "0.0.0" },
      });

      assert.equal(initialized.protocolVersion, PROTOCOL_VERSION);
      assert.equal(initialized.agentInfo?.name, "@agentclientprotocol/codex-acp");
      assert.ok(initialized.agentCapabilities?.sessionCapabilities?.resume);
      assert.ok(initialized.agentCapabilities?.sessionCapabilities?.close);

      stage = "session-new";
      const created = await agent.request(methods.agent.session.new, {
        cwd: fixtureRoot,
        mcpServers: [],
      });
      completedSessionId = created.sessionId;
      assert.equal(created.modes?.currentModeId, "read-only");

      stage = "first-prompt";
      const firstPrompt = await agent.request(methods.agent.session.prompt, {
        sessionId: created.sessionId,
        prompt: [
          {
            type: "text",
            text: "只读取 README.md 的第一行，并且只返回这一行。不得写文件、访问网络或请求额外权限。",
          },
        ],
      });
      assert.equal(firstPrompt.stopReason, "end_turn");
      assert.match(textFromUpdates(updates, created.sessionId), /Agent Fabric ACP read-only fixture/);

      stage = "session-close-before-resume";
      await agent.request(methods.agent.session.close, { sessionId: created.sessionId });
      stage = "session-resume";
      const resumed = await agent.request(methods.agent.session.resume, {
        sessionId: created.sessionId,
        cwd: fixtureRoot,
        mcpServers: [],
      });
      assert.equal(resumed.modes?.currentModeId, "read-only");

      stage = "cancelled-prompt";
      const cancelledPrompt = agent.request(methods.agent.session.prompt, {
        sessionId: created.sessionId,
        prompt: [
          {
            type: "text",
            text: cancellationPromptText,
          },
        ],
      });
      const stillRunning = Symbol("still-running");
      const earlyResult = await Promise.race([
        cancelledPrompt,
        delay(5_000).then(() => stillRunning),
      ]);
      assert.equal(earlyResult, stillRunning, "cancel prompt completed before cancellation could be tested");
      await agent.notify(methods.agent.session.cancel, { sessionId: created.sessionId });
      const cancelled = await withTimeout(cancelledPrompt, 30_000, "cancel prompt response");
      assert.equal(cancelled.stopReason, "cancelled");

      stage = "missing-session-failure";
      try {
        await agent.request(methods.agent.session.prompt, {
          sessionId: "missing-agent-fabric-session",
          prompt: [{ type: "text", text: "health check" }],
        });
        assert.fail("A missing ACP session must fail");
      } catch (error) {
        normalizedFailure = normalizeAcpFailure(error);
      }

      stage = "final-session-close";
      await agent.request(methods.agent.session.close, { sessionId: created.sessionId });
      stage = "complete";
    }),
    180_000,
    "codex-acp verification",
  );
} catch (error) {
  const diagnostics = stderrChunks.join("").slice(-4_000);
  throw new Error(`codex-acp verification failed at ${stage}: ${error instanceof Error ? error.message : String(error)}\n${diagnostics}`);
} finally {
  child.kill("SIGTERM");
}

assert.equal(await fixtureDigest(), beforeDigest, "read-only ACP run changed the fixture");
assert.equal(writeRequests.length, 0, "codex-acp attempted a client-mediated write");
assert.equal(permissionRequests.length, 0, "read-only prompt requested elevated permission");
assert.ok(updates.length > 0, "codex-acp emitted no progress updates");
assert.ok(normalizedFailure);
assert.ok(["runtime_session_lost", "runtime_failed"].includes(normalizedFailure.code));

console.log(
  JSON.stringify(
    {
      marker: "codex-acp-spike-passed",
      adapterVersion: adapterVersion.stdout.trim(),
      codexVersion: codexVersion.stdout.trim(),
      sessionId: completedSessionId,
      progressUpdates: updates.length,
      permissionRequests: permissionRequests.length,
      writeRequests: writeRequests.length,
      normalizedFailure,
    },
    null,
    2,
  ),
);
