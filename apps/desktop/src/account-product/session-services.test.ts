import { describe, expect, it, vi } from "vitest";

import { AccountProductSessionServices } from "./session-services.js";

const input = {
  runtime: {
    server: "https://fabric.example", accountSessionToken: "session-secret", accountId: "account:one", userId: "human:one",
    workspaceRoot: "/workspace", providers: [] as never, privateConfigurationDirectory: "/private", encryption: {} as never,
  },
  mcp: {
    serverBaseUrl: "https://fabric.example", accountSessionToken: "session-secret", accountId: "account:one", userId: "human:one",
    sessionExpiresAt: "2026-09-13T00:00:00.000Z", dataDirectory: "/mcp",
  },
  mcpInstallation: { runtimeExecutable: "/app/electron", mcpExecutable: "/app/account-agent-mcp.mjs" },
};

const codexRuntime = { runtimeId: "runtime:one", provider: "codex" };

describe("AccountProductSessionServices", () => {
  it("starts Runtime and installs the Account MCP with the private loopback config", async () => {
    const runtime = { start: vi.fn().mockResolvedValue([codexRuntime]), refresh: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) };
    const mcp = { start: vi.fn().mockResolvedValue({ configFile: "/private/account-agents-mcp.json", localTokenExpiresAt: "2026-09-01T00:00:00.000Z" }), stop: vi.fn().mockResolvedValue(undefined) };
    const installMcp = vi.fn().mockResolvedValue(undefined);
    const services = new AccountProductSessionServices({ runtime, mcp, installMcp });
    await expect(services.start(input)).resolves.toEqual({ runtimes: [{ runtimeId: "runtime:one", provider: "codex" }], runtime: { state: "ready", runtimeId: "runtime:one" }, mcp: { state: "ready" } });
    expect(installMcp).toHaveBeenCalledWith({ ...input.mcpInstallation, agentFabricConfigFile: "/private/account-agents-mcp.json" });
    expect(JSON.stringify(services.status)).not.toContain("session-secret");
  });

  it("keeps MCP available when the local Runtime is unavailable and revokes both on stop", async () => {
    const runtime = { start: vi.fn().mockRejectedValue(new Error("runtime-detection-failed:/private/path")), refresh: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) };
    const mcp = { start: vi.fn().mockResolvedValue({ configFile: "/private/account-agents-mcp.json", localTokenExpiresAt: "2026-09-01T00:00:00.000Z" }), stop: vi.fn().mockResolvedValue(undefined) };
    const services = new AccountProductSessionServices({ runtime, mcp, installMcp: vi.fn().mockResolvedValue(undefined) });
    await expect(services.start(input)).resolves.toEqual({ runtimes: [], runtime: { state: "failed", errorCode: "runtime-detection-failed" }, mcp: { state: "ready" } });
    await services.stop();
    expect(runtime.stop).toHaveBeenCalled();
    expect(mcp.stop).toHaveBeenCalled();
    expect(services.status).toBeUndefined();
  });

  it("bounds a hung local service without blocking Account entry", async () => {
    const runtime = { start: vi.fn(() => new Promise<never>(() => undefined)), refresh: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) };
    const mcp = { start: vi.fn().mockResolvedValue({ configFile: "/private/account-agents-mcp.json", localTokenExpiresAt: "2026-09-01T00:00:00.000Z" }), stop: vi.fn().mockResolvedValue(undefined) };
    const services = new AccountProductSessionServices({ runtime, mcp, installMcp: vi.fn().mockResolvedValue(undefined), startupTimeoutMs: 5 });
    await expect(services.start(input)).resolves.toEqual({ runtimes: [], runtime: { state: "failed", errorCode: "runtime-start-timeout" }, mcp: { state: "ready" } });
  });

  it("registers every provider from the multica probe alongside Codex", async () => {
    const runtime = {
      start: vi.fn().mockResolvedValue([codexRuntime, { runtimeId: "runtime:two", provider: "claude" }, { runtimeId: "runtime:three", provider: "cursor" }]),
      refresh: vi.fn(), stop: vi.fn().mockResolvedValue(undefined),
    };
    const mcp = { start: vi.fn().mockResolvedValue({ configFile: "/private/account-agents-mcp.json", localTokenExpiresAt: "2026-09-01T00:00:00.000Z" }), stop: vi.fn().mockResolvedValue(undefined) };
    const services = new AccountProductSessionServices({ runtime, mcp, installMcp: vi.fn().mockResolvedValue(undefined) });
    await expect(services.start(input)).resolves.toEqual({
      runtimes: [{ runtimeId: "runtime:one", provider: "codex" }, { runtimeId: "runtime:two", provider: "claude" }, { runtimeId: "runtime:three", provider: "cursor" }],
      runtime: { state: "ready", runtimeId: "runtime:one" }, mcp: { state: "ready" },
    });
  });

  it("delegates Runtime refresh only to the active local service", async () => {
    const refreshed = { runtimeId: "runtime:one", health: "ready", version: 3 };
    const runtime = { start: vi.fn().mockResolvedValue([codexRuntime]), refresh: vi.fn().mockResolvedValue(refreshed), stop: vi.fn().mockResolvedValue(undefined) };
    const mcp = { start: vi.fn().mockResolvedValue({ configFile: "/private/account-agents-mcp.json" }), stop: vi.fn().mockResolvedValue(undefined) };
    const services = new AccountProductSessionServices({ runtime, mcp, installMcp: vi.fn().mockResolvedValue(undefined) });
    await services.start(input);
    await expect(services.refreshRuntime("runtime:one", 2)).resolves.toBe(refreshed);
    expect(runtime.refresh).toHaveBeenCalledWith("runtime:one", 2);
  });
});
