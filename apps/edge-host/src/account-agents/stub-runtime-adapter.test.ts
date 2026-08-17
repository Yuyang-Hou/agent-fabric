import { describe, expect, it } from "vitest";

import { StubRuntimeAdapter } from "./stub-runtime-adapter.js";

describe("StubRuntimeAdapter", () => {
  it("reports detected + ready with the configured name", async () => {
    const adapter = new StubRuntimeAdapter({ runtimeName: "Claude Code", runtimeVersion: "2.1.5" });
    expect(await adapter.detect()).toEqual({ status: "ready", runtimeName: "Claude Code", runtimeVersion: "2.1.5", authenticated: true });
  });

  it("falls back to 'unknown' when runtimeVersion is omitted", async () => {
    const adapter = new StubRuntimeAdapter({ runtimeName: "Cursor" });
    const detection = await adapter.detect();
    expect(detection.status === "ready" && detection.runtimeVersion).toBe("unknown");
  });

  it("rejects execution attempts with runtime-adapter-missing", async () => {
    const adapter = new StubRuntimeAdapter({ runtimeName: "Openclaw" });
    await expect(adapter.createSession({ agentId: "agent:x", workspaceRoot: "/tmp" })).rejects.toThrow("runtime-adapter-missing");
    await expect(adapter.resumeSession("h", { agentId: "agent:x", workspaceRoot: "/tmp" })).rejects.toThrow("runtime-adapter-missing");
    await expect(adapter.cancel("h")).rejects.toThrow("runtime-adapter-missing");
  });

  it("streams a synthetic failure from execute()", async () => {
    const adapter = new StubRuntimeAdapter({ runtimeName: "Openclaw" });
    const iterable = adapter.execute({ sessionHandle: "h", taskId: "t", prompt: [{ type: "text", text: "hi" }], policy: { filesystem: "read-only", network: "deny", sideEffects: "deny", timeoutMs: 1000, maxOutputCharacters: 100, maxOutputTokens: 100, maxConcurrency: 1, maxDelegationDepth: 0 } }, new AbortController().signal);
    await expect((async () => { for await (const _ of iterable) { /* drain */ } })()).rejects.toThrow("runtime-adapter-missing");
  });

  it("throws when constructed without a runtime name", () => {
    expect(() => new StubRuntimeAdapter({ runtimeName: "" })).toThrow("stub-runtime-name-required");
  });
});
