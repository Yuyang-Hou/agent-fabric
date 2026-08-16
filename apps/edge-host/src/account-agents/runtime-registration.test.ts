import { FakeRuntimeAdapter } from "@agent-fabric/runtime-fake";
import type { AgentRuntime } from "@agent-fabric/account-agent-domain";
import { describe, expect, it, vi } from "vitest";

import { AccountRuntimeRegistrationService } from "./runtime-registration.js";

const capabilities = {
  supportsModelSelection: false, supportsThinkingLevel: false, supportsServiceTier: false, supportsSkills: false,
  supportsMcpConfiguration: false, supportsEnvironment: false, supportsCustomArguments: false, supportsRuntimeConfiguration: false,
  supportsCancellation: true, maxConcurrentAgents: 8,
};

describe("AccountRuntimeRegistrationService", () => {
  it("registers one detected Codex Runtime and starts its Account execution tunnel", async () => {
    const registerRuntime = vi.fn().mockImplementation(async (input) => runtime({ ...input, version: 1 }));
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const service = new AccountRuntimeRegistrationService({
      cloud: { listRuntimes: vi.fn().mockResolvedValue([]), registerRuntime, observeRuntime: vi.fn(), refreshRuntime: vi.fn() },
      adapter: new FakeRuntimeAdapter(), server: "http://127.0.0.1:8787", accountSessionToken: "secret",
      accountId: "account:one", userId: "human:one", workspaceRoot: "/private/project", name: "My Mac Codex",
      tunnelFactory: vi.fn().mockReturnValue({ start, stop }),
    });
    await expect(service.start()).resolves.toMatchObject({ provider: "codex", adapterId: "codex-acp", health: "ready", capabilities: { supportsCancellation: true } });
    expect(registerRuntime).toHaveBeenCalledWith(expect.objectContaining({ visibility: "private", health: "ready" }));
    expect(start).toHaveBeenCalledOnce();
    await service.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("reuses only the current user's matching Runtime and records tunnel failure as offline", async () => {
    const existing = runtime({ health: "auth_required", version: 4 });
    const observeRuntime = vi.fn()
      .mockResolvedValueOnce(runtime({ health: "ready", version: 5 }))
      .mockResolvedValueOnce(runtime({ health: "offline", version: 6 }));
    const service = new AccountRuntimeRegistrationService({
      cloud: { listRuntimes: vi.fn().mockResolvedValue([runtime({ runtimeId: "runtime:other", ownerUserId: "human:other" }), existing]), registerRuntime: vi.fn(), observeRuntime, refreshRuntime: vi.fn() },
      adapter: new FakeRuntimeAdapter(), server: "http://127.0.0.1:8787", accountSessionToken: "secret",
      accountId: "account:one", userId: "human:one", workspaceRoot: "/private/project", name: "My Mac Codex",
      tunnelFactory: vi.fn().mockReturnValue({ start: vi.fn().mockRejectedValue(new Error("network-down")), stop: vi.fn() }),
    });
    await expect(service.start()).rejects.toThrow("network-down");
    expect(observeRuntime.mock.calls[0]).toEqual([existing.runtimeId, expect.objectContaining({ health: "ready", expectedVersion: 4 })]);
    expect(observeRuntime.mock.calls[1]).toEqual([existing.runtimeId, expect.objectContaining({ health: "offline", expectedVersion: 5 })]);
  });

  it("coalesces concurrent local refreshes and writes the real terminal observation", async () => {
    const existing = runtime({ version: 1 });
    const adapter = new FakeRuntimeAdapter();
    const detect = vi.spyOn(adapter, "detect");
    const observeRuntime = vi.fn()
      .mockResolvedValueOnce(runtime({ version: 2 }))
      .mockResolvedValueOnce(runtime({ version: 4, health: "ready" }));
    const refreshRuntime = vi.fn().mockResolvedValue(runtime({ version: 3, health: "checking" }));
    const service = new AccountRuntimeRegistrationService({
      cloud: { listRuntimes: vi.fn().mockResolvedValue([existing]), registerRuntime: vi.fn(), observeRuntime, refreshRuntime },
      adapter, server: "http://127.0.0.1:8787", accountSessionToken: "secret",
      accountId: "account:one", userId: "human:one", workspaceRoot: "/private/project", name: "My Mac Codex",
      tunnelFactory: vi.fn().mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() }),
    });
    await service.start();
    const first = service.refresh(existing.runtimeId, 2);
    const second = service.refresh(existing.runtimeId, 2);
    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({ health: "ready", version: 4 });
    expect(refreshRuntime).toHaveBeenCalledOnce();
    expect(observeRuntime).toHaveBeenLastCalledWith(existing.runtimeId, expect.objectContaining({ health: "ready", expectedVersion: 3 }));
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("rejects a remote Runtime before changing it to checking", async () => {
    const existing = runtime({ version: 1 });
    const refreshRuntime = vi.fn();
    const service = new AccountRuntimeRegistrationService({
      cloud: { listRuntimes: vi.fn().mockResolvedValue([existing]), registerRuntime: vi.fn(), observeRuntime: vi.fn().mockResolvedValue(runtime({ version: 2 })), refreshRuntime },
      adapter: new FakeRuntimeAdapter(), server: "http://127.0.0.1:8787", accountSessionToken: "secret",
      accountId: "account:one", userId: "human:one", workspaceRoot: "/private/project", name: "My Mac Codex",
      tunnelFactory: vi.fn().mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() }),
    });
    await service.start();
    await expect(service.refresh("runtime:remote", 1)).rejects.toThrow("runtime-refresh-not-local");
    expect(refreshRuntime).not.toHaveBeenCalled();
  });

  it("recovers a stale checking Runtime during startup", async () => {
    const existing = runtime({ health: "checking", version: 7 });
    const observeRuntime = vi.fn().mockResolvedValue(runtime({ health: "ready", version: 8 }));
    const service = new AccountRuntimeRegistrationService({
      cloud: { listRuntimes: vi.fn().mockResolvedValue([existing]), registerRuntime: vi.fn(), observeRuntime, refreshRuntime: vi.fn() },
      adapter: new FakeRuntimeAdapter(), server: "http://127.0.0.1:8787", accountSessionToken: "secret",
      accountId: "account:one", userId: "human:one", workspaceRoot: "/private/project", name: "My Mac Codex",
      tunnelFactory: vi.fn().mockReturnValue({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() }),
    });
    await expect(service.start()).resolves.toMatchObject({ health: "ready", version: 8 });
    expect(observeRuntime).toHaveBeenCalledWith(existing.runtimeId, expect.objectContaining({ health: "ready", expectedVersion: 7 }));
  });
});

function runtime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:one", provider: "codex", adapterId: "codex-acp",
    name: "My Mac Codex", visibility: "private", health: "ready", capabilities,
    lastCheckedAt: "2026-08-13T00:00:00.000Z", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1,
    ...overrides,
  };
}
