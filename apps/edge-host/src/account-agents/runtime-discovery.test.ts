import { FakeRuntimeAdapter } from "@agent-fabric/runtime-fake";
import type { RuntimeAdapter } from "@agent-fabric/runtime-contract";
import { describe, expect, it } from "vitest";

import { discoverCodexAccountRuntime } from "./runtime-discovery.js";

describe("Account Runtime discovery", () => {
  it("projects a ready Codex adapter into a bounded Account observation", async () => {
    const observation = await discoverCodexAccountRuntime(new FakeRuntimeAdapter(), "2026-08-13T00:00:00.000Z");
    expect(observation).toMatchObject({ provider: "codex", adapterId: "codex-acp", health: "ready", observedAt: "2026-08-13T00:00:00.000Z", capabilities: { supportsCancellation: true, maxConcurrentAgents: 8 } });
    expect(JSON.stringify(observation)).not.toMatch(/handle|session|workspaceRoot|cwd|credential|absolutePath/iu);
  });

  it.each([
    ["authentication-required", "auth_required"],
    ["unavailable", "unavailable"],
    ["incompatible", "unavailable"],
  ] as const)("maps %s without inventing readiness", async (status, expected) => {
    const adapter = detectionAdapter({ status, reasonCode: `codex-${status}` });
    await expect(discoverCodexAccountRuntime(adapter, "2026-08-13T00:00:00.000Z")).resolves.toMatchObject({ health: expected, reasonCode: `codex-${status}`, capabilities: { supportsCancellation: false } });
  });

  it("reports unexpected detection failures as offline with a bounded reason", async () => {
    const adapter = detectionAdapter(new Error("/Users/alice/private/token=secret"));
    const observation = await discoverCodexAccountRuntime(adapter, "2026-08-13T00:00:00.000Z");
    expect(observation).toMatchObject({ health: "offline", reasonCode: "runtime-detection-failed" });
    expect(JSON.stringify(observation)).not.toContain("/Users/alice/private");
    expect(JSON.stringify(observation)).not.toContain("secret");
  });

  it("bounds a hung detection and returns a terminal offline projection", async () => {
    const adapter = detectionAdapter(new Error("unused"));
    adapter.detect = () => new Promise<never>(() => undefined);
    const observation = await discoverCodexAccountRuntime(adapter, "2026-08-13T00:00:00.000Z", 5);
    expect(observation).toMatchObject({ health: "offline", reasonCode: "runtime-detection-failed" });
    expect(JSON.stringify(observation)).not.toContain("runtime-detection-timeout");
  });
});

function detectionAdapter(detection: Awaited<ReturnType<RuntimeAdapter["detect"]>> | Error): RuntimeAdapter {
  const base = new FakeRuntimeAdapter();
  return {
    ...base,
    detect: async () => { if (detection instanceof Error) throw detection; return detection; },
    inspectCapabilities: () => base.inspectCapabilities(),
    listResumableSessions: () => base.listResumableSessions(),
    createSession: (request) => base.createSession(request),
    resumeSession: (handle, request) => base.resumeSession(handle, request),
    execute: (request, signal) => base.execute(request, signal),
    cancel: (handle) => base.cancel(handle),
    close: (handle) => base.close(handle),
  };
}
