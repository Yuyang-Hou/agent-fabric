import { Task, TaskState } from "@a2a-js/sdk";
import { describe, expect, it, vi } from "vitest";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

const capabilities = {
  supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: true, supportsSkills: true, supportsMcpConfiguration: true,
  supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true, supportsCancellation: true, maxConcurrentAgents: 4,
};

describe("Account Runtimes API", () => {
  it("exposes bounded Runtime registration, observation, refresh, list and update operations", async () => {
    const runtime = { runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-acp", name: "Local Codex", visibility: "private", health: "ready", capabilities, lastCheckedAt: "2026-08-13T00:00:00.000Z", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1 } as const;
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:owner", principalId: "device:owner", ownerPrincipalId: "human:owner", instanceId: "instance:one", scopes: ["account:access"] }),
      listAccountRuntimesForCredential: vi.fn().mockResolvedValue({ items: [runtime] }),
      getAccountRuntimeForCredential: vi.fn().mockResolvedValue(runtime),
      createAccountRuntimeForCredential: vi.fn().mockResolvedValue(runtime),
      updateAccountRuntimeForCredential: vi.fn().mockResolvedValue({ ...runtime, name: "Shared Codex", version: 2 }),
      observeAccountRuntimeForCredential: vi.fn().mockResolvedValue({ ...runtime, health: "offline", version: 2 }),
      refreshAccountRuntimeForCredential: vi.fn().mockResolvedValue({ ...runtime, health: "checking", version: 2 }),
      planAccountRuntimeDeletionForCredential: vi.fn().mockResolvedValue({ planId: "runtime-deletion:one", accountId: "account:one", runtimeId: "runtime:one", expectedRuntimeVersion: 1, boundAgentIds: ["agent:one"], activeAgentIds: [], expiresAt: "2026-08-13T00:10:00.000Z" }),
      prepareAccountRuntimeDeletionForCredential: vi.fn().mockResolvedValue({ accountId: "account:one", runtimeId: "runtime:one", activeTasks: [{ taskId: "task:active", agentId: "agent:one" }] }),
      settleAccountRuntimeDeletionTasksForCredential: vi.fn().mockResolvedValue(undefined),
      deleteAccountRuntimeForCredential: vi.fn().mockResolvedValue({ runtimeId: "runtime:one", status: "deleted", unboundAgentIds: ["agent:one"] }),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const cancel = vi.fn().mockImplementation(async ({ taskId }: { taskId: string }) => Task.fromJSON({ id: taskId, contextId: "", status: { state: TaskState.TASK_STATE_CANCELED }, artifacts: [] }));
    const server = createAgentFabricServer({ ...base, port: 0 }, { store, accountAgentExecution: { execute: vi.fn(), cancel } });
    await server.start();
    try {
      const headers = { authorization: "Bearer owner-secret", "content-type": "application/json" };
      expect(await fetch(`${server.address()}/v1/runtimes`, { headers }).then((response) => response.json())).toEqual({ runtimes: [runtime] });
      expect(await fetch(`${server.address()}/v1/runtimes/runtime:one`, { headers }).then((response) => response.json())).toEqual(runtime);
      const created = await fetch(`${server.address()}/v1/runtimes`, { method: "POST", headers, body: JSON.stringify({ provider: "codex", adapterId: "codex-acp", name: "Local Codex", visibility: "private", health: "ready", capabilities }) });
      expect(created.status).toBe(201);
      expect(store.createAccountRuntimeForCredential).toHaveBeenCalledWith("credential:owner", { provider: "codex", adapterId: "codex-acp", name: "Local Codex", visibility: "private", health: "ready", capabilities });
      const updated = await fetch(`${server.address()}/v1/runtimes/runtime:one`, { method: "PATCH", headers, body: JSON.stringify({ name: "Owner Codex", visibility: "private", expectedVersion: 1 }) });
      expect(updated.status).toBe(200);
      const observed = await fetch(`${server.address()}/v1/runtimes/runtime:one/observation`, { method: "PUT", headers, body: JSON.stringify({ health: "offline", capabilities, expectedVersion: 1 }) });
      expect(observed.status).toBe(200);
      const refreshed = await fetch(`${server.address()}/v1/runtimes/runtime:one/refresh`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(refreshed.status).toBe(200);
      expect(store.refreshAccountRuntimeForCredential).toHaveBeenCalledWith("credential:owner", "runtime:one", 1);
      const impact = await fetch(`${server.address()}/v1/runtimes/runtime:one/deletion-impact`, { headers });
      expect(await impact.json()).toMatchObject({ planId: "runtime-deletion:one", boundAgentIds: ["agent:one"], activeAgentIds: [] });
      const deleted = await fetch(`${server.address()}/v1/runtimes/runtime:one/deletion`, { method: "POST", headers, body: JSON.stringify({ planId: "runtime-deletion:one", expectedRuntimeVersion: 1 }) });
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ runtimeId: "runtime:one", status: "deleted", unboundAgentIds: ["agent:one"] });
      expect(store.prepareAccountRuntimeDeletionForCredential).toHaveBeenCalledWith("credential:owner", "runtime:one", { planId: "runtime-deletion:one", expectedRuntimeVersion: 1 });
      expect(cancel).toHaveBeenCalledWith({ accountId: "account:one", runtimeId: "runtime:one", agentId: "agent:one", taskId: "task:active" });
      expect(store.settleAccountRuntimeDeletionTasksForCredential).toHaveBeenCalledWith("credential:owner", "runtime:one", "runtime-deletion:one", ["task:active"]);
      expect(JSON.stringify(await created.json())).not.toMatch(/runtimeSession|cwd|credential|privateHandle/iu);
    } finally { await server.stop(); }
  });

  it("continues heartbeat observations after failure and retries one version race", async () => {
    let version = 2;
    let health: "ready" | "offline" = "ready";
    let failMode: "temporary" | "conflict" | undefined = "temporary";
    const runtime = { runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-acp", name: "Local Codex", visibility: "private", health, capabilities, lastCheckedAt: "2026-08-13T00:00:00.000Z", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version } as const;
    const observeAccountRuntimeForCredential = vi.fn().mockImplementation(async (_credentialId: string, _runtimeId: string, input: { health: "ready" | "offline"; expectedVersion: number }) => {
      if (failMode === "temporary") { failMode = "conflict"; throw new Error("database-temporary"); }
      if (failMode === "conflict") { failMode = undefined; version += 1; throw new Error("account-runtime-version-conflict"); }
      if (input.expectedVersion !== version) throw new Error("account-runtime-version-conflict");
      health = input.health;
      version += 1;
      return { ...runtime, health, version };
    });
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:owner", principalId: "device:owner", ownerPrincipalId: "human:owner", instanceId: "instance:one", scopes: ["account:access"] }),
      assertAccountRuntimeConnectionForCredential: vi.fn().mockResolvedValue(runtime),
      getAccountRuntimeForCredential: vi.fn().mockImplementation(async () => ({ ...runtime, health, version })),
      observeAccountRuntimeForCredential,
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    const socketUrl = new URL(server.address() as string); socketUrl.protocol = "ws:"; socketUrl.pathname = "/v1/account-runtimes/connect";
    const socket = new (await import("ws")).WebSocket(socketUrl, { headers: { authorization: "Bearer runtime-secret", "x-agent-fabric-runtime-id": runtime.runtimeId } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    const heartbeat = () => socket.send(JSON.stringify({ version: "1", type: "heartbeat", runtimeId: runtime.runtimeId, health: "ready", capabilities, runtimeSkills: [], observedAt: new Date().toISOString() }));
    try {
      heartbeat();
      await vi.waitFor(() => expect(observeAccountRuntimeForCredential).toHaveBeenCalledTimes(1));
      heartbeat();
      await vi.waitFor(() => expect(observeAccountRuntimeForCredential).toHaveBeenCalledTimes(3));
      expect(observeAccountRuntimeForCredential.mock.calls.map((call) => call[2].expectedVersion)).toEqual([2, 2, 3]);
      expect(version).toBe(4);
      expect(health).toBe("ready");
    } finally {
      socket.close();
      await server.stop();
    }
  });
});
