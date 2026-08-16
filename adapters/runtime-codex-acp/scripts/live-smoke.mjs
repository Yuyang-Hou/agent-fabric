import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CodexAcpRuntimeAdapter,
  NodeCodexAcpProcessFactory,
  SdkCodexAcpClientFactory,
} from "../dist/index.js";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptRoot, "../../..");
const fixtureRoot = join(repositoryRoot, "spikes/codex-acp/fixture");
const fixtureFile = join(fixtureRoot, "README.md");
const before = createHash("sha256").update(await readFile(fixtureFile)).digest("hex");
const adapter = new CodexAcpRuntimeAdapter(
  new SdkCodexAcpClientFactory(new NodeCodexAcpProcessFactory()),
);
const policy = {
  filesystem: "read-only",
  network: "deny",
  sideEffects: "deny",
  timeoutMs: 120_000,
  maxOutputCharacters: 20_000,
  maxOutputTokens: 5_000,
  maxConcurrency: 1,
  maxDelegationDepth: 0,
};

const detection = await adapter.detect();
assert.equal(detection.status, "ready");
const capabilities = await adapter.inspectCapabilities();
assert.equal(capabilities.protocol, "acp");
assert.equal(capabilities.supportsResume, true);
assert.equal(capabilities.supportsCancellation, true);

const session = await adapter.createSession({ agentId: "live-agent", workspaceRoot: fixtureRoot });
const successEvents = [];
for await (const event of adapter.execute(
  {
    sessionHandle: session.handle,
    taskId: "live-read-only",
    prompt: [
      {
        type: "text",
        text: "只读取 README.md 的第一行，并且只返回这一行。不得写文件、访问网络或请求额外权限。",
      },
    ],
    policy,
  },
  new AbortController().signal,
)) {
  successEvents.push(event);
}
assert.equal(successEvents.at(-1)?.type, "completed");
assert.match(
  successEvents.filter((event) => event.type === "output-delta").map((event) => event.text).join(""),
  /Agent Fabric ACP read-only fixture/,
);

const resumed = await adapter.resumeSession(session.handle, {
  agentId: "live-agent",
  workspaceRoot: fixtureRoot,
});
assert.equal(resumed.resumed, true);

const cancellation = new AbortController();
const cancellationEvents = [];
for await (const event of adapter.execute(
  {
    sessionHandle: session.handle,
    taskId: "live-cancel",
    prompt: [
      {
        type: "text",
        text: "请对这个目录持续做非常详细的逐文件分析，生成长篇报告，但不得写文件、访问网络或请求权限。",
      },
    ],
    policy,
  },
  cancellation.signal,
)) {
  cancellationEvents.push(event);
  if (event.type === "progress") cancellation.abort();
}
assert.equal(cancellationEvents.at(-1)?.type, "canceled");
assert.equal(cancellationEvents.some((event) => event.type === "completed"), false);

await adapter.close(session.handle);
const after = createHash("sha256").update(await readFile(fixtureFile)).digest("hex");
assert.equal(after, before);
await adapter.shutdown();

console.log(
  JSON.stringify({
    marker: "agent-fabric-production-codex-acp-passed",
    detection,
    successEvents: successEvents.length,
    cancellationEvents: cancellationEvents.length,
    fixtureUnchanged: true,
  }),
);
