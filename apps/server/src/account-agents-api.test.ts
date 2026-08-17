import { describe, expect, it, vi } from "vitest";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

const configuration = { instructions: "Answer clearly.", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] };

describe("Account Agents API", () => {
  it("makes /v1/agents the Account-scoped multi-Agent collection and detail contract", async () => {
    const agents = ["one", "two", "three"].map((id, index) => ({ agentId: `agent:${id}`, accountId: "account:one", ownerUserId: "human:owner", name: `Agent ${index + 1}`, description: "", permissionMode: "private", configuration, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1 }));
    const rows = agents.map((agent) => ({
      agent: { agentId: agent.agentId, accountId: agent.accountId, ownerUserId: agent.ownerUserId, name: agent.name, description: agent.description, permissionMode: agent.permissionMode, createdAt: agent.createdAt, updatedAt: agent.updatedAt, version: agent.version },
      owner: { userId: "human:owner", displayName: "Owner", email: "owner@example.com" },
      effectiveAccess: "owner", status: "needs_runtime",
      workload: { accountId: "account:one", agentId: agent.agentId, queuedTasks: 0, workingTasks: 0, observedAt: "2026-08-13T00:00:00.000Z" },
    }));
    let detailAgent = agents[0]!;
    let detailConfiguration = { instructions: "Answer clearly.", maxConcurrentTasks: 1, skillIds: [] as string[], disabledRuntimeSkillIds: [] as string[], environment: { configuredCount: 0, redacted: true as const }, customArguments: { configuredCount: 0, redacted: true as const }, runtimeConfiguration: { configured: false, redacted: true as const }, mcpConnections: [{ connectionId: "mcp:one", name: "Search", transport: "http" as const, configured: false }], integrations: [] as const };
    const detail = () => ({
      identity: { agentId: detailAgent.agentId, accountId: detailAgent.accountId, ownerUserId: detailAgent.ownerUserId, name: detailAgent.name, description: detailAgent.description, runtimeId: "runtime:one", createdAt: detailAgent.createdAt, updatedAt: detailAgent.updatedAt, version: detailAgent.version },
      access: { canManage: true, canInvoke: true, effectiveAccess: "owner", permissionMode: "private" },
      configuration: detailConfiguration,
      sections: ["overview", "activity", "capabilities", "settings"], etag: `"agent:${detailAgent.version}"`,
    });
    let created = 0;
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:owner", principalId: "device:owner", ownerPrincipalId: "human:owner", instanceId: "instance:one", scopes: ["account:access"] }),
      createAccountAgentForCredential: vi.fn().mockImplementation(async () => agents[created++]),
      getAccountAgentForCredential: vi.fn().mockResolvedValue(agents[0]),
      getAccountAgentDetailForCredential: vi.fn().mockImplementation(async () => detail()),
      listAccountAgentsForCredential: vi.fn().mockResolvedValue({ items: agents, counts: { mine: 3, friends: 0, archived: 0 } }),
      queryAccountAgentCatalogForCredential: vi.fn()
        .mockResolvedValueOnce({ accountId: "account:one", scope: "mine", rows, counts: { mine: 3, friends: 0, archived: 0 }, nextCursor: { sortValue: "7", id: "agent:three" } })
        .mockResolvedValueOnce({ accountId: "account:one", scope: "friends", rows: [], counts: { mine: 3, friends: 0, archived: 0 } }),
      updateAccountAgentForCredential: vi.fn().mockImplementation(async () => { detailAgent = { ...agents[0]!, name: "Renamed", version: 2 }; return detailAgent; }),
      archiveAccountAgentForCredential: vi.fn().mockResolvedValue({ ...agents[0], archivedAt: "2026-08-13T00:01:00.000Z", archivedByUserId: "human:owner", version: 2 }),
      restoreAccountAgentForCredential: vi.fn().mockResolvedValue({ agent: { ...agents[0], version: 3 }, needsRuntime: true }),
      batchAccountAgentLifecycleForCredential: vi.fn().mockResolvedValue({ accountId: "account:one", action: "archive", semantics: "atomic", results: [{ agent: { ...agents[0], archivedAt: "2026-08-13T00:01:00.000Z", archivedByUserId: "human:owner", version: 2 } }], appliedAt: "2026-08-13T00:01:00.000Z" }),
      listAccountAgentActivitiesForCredential: vi.fn().mockResolvedValue({ items: [{ activityId: "activity:one", accountId: "account:one", agentId: "agent:one", taskId: "task:one", terminalState: "failed", failureCategory: "a2a-task-failed", startedAt: "2026-08-13T00:00:00.000Z", completedAt: "2026-08-13T00:00:03.000Z", durationMs: 3000 }] }),
      listAccountAgentSkillsForCredential: vi.fn().mockResolvedValue({ agentId: "agent:one", agentVersion: 2, runtimeDiscovery: { state: "unbound", retryable: false }, skills: [] }),
      mutateAccountAgentSkillForCredential: vi.fn().mockResolvedValue({ ...agents[0], version: 2, updatedAt: "2026-08-13T00:01:00.000Z" }),
      prepareAccountAgentPrivateConfigurationForCredential: vi.fn().mockResolvedValue({ accountId: "account:one", agentId: "agent:one", runtimeId: "runtime:one", expectedVersion: 2 }),
      commitAccountAgentPrivateConfigurationSummaryForCredential: vi.fn().mockImplementation(async (_credentialId: string, _agentId: string, _expectedVersion: number, summary: { environmentVariableNames: string[]; configuredMcpConnectionIds: string[] }) => {
        detailAgent = { ...detailAgent, version: 3, updatedAt: "2026-08-13T00:02:00.000Z" };
        detailConfiguration = { ...detailConfiguration, environment: { configuredCount: summary.environmentVariableNames.length, redacted: true }, mcpConnections: detailConfiguration.mcpConnections.map((connection) => ({ ...connection, configured: summary.configuredMcpConnectionIds.includes(connection.connectionId) })) };
        return { ...agents[0], runtimeId: "runtime:one", version: 3, updatedAt: "2026-08-13T00:02:00.000Z", configuration };
      }),
      recordAccountAgentPrivateConfigurationAuditForCredential: vi.fn().mockResolvedValue(undefined),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const headers = { authorization: "Bearer owner-secret", "content-type": "application/json" };
      const createdAgentIds: string[] = [];
      for (const name of ["Agent 1", "Agent 2", "Agent 3"]) {
        const response = await fetch(`${server.address()}/v1/agents`, { method: "POST", headers, body: JSON.stringify({ name, description: "", permissionMode: "private", configuration }) });
        expect(response.status).toBe(201);
        createdAgentIds.push((await response.json() as { agentId: string }).agentId);
      }
      expect(store.createAccountAgentForCredential).toHaveBeenCalledTimes(3);
      expect(new Set(createdAgentIds)).toEqual(new Set(["agent:one", "agent:two", "agent:three"]));
      expect((await fetch(`${server.address()}/v1/agent-drafts`, { headers })).status).toBe(404);

      const cursor = Buffer.from(JSON.stringify({ sortValue: "9", id: "agent:cursor" }), "utf8").toString("base64url");
      const list = await fetch(`${server.address()}/v1/agents?scope=mine&q=agent&availability=online,unstable&runtimeId=runtime:one&ownerUserId=human:owner&model=gpt-5&access=owner&sort=runs&limit=25&cursor=${cursor}`, { headers });
      const listBody = await list.json();
      expect(listBody).toEqual({ accountId: "account:one", scope: "mine", rows, counts: { mine: 3, friends: 0, archived: 0 }, nextCursor: Buffer.from(JSON.stringify({ sortValue: "7", id: "agent:three" }), "utf8").toString("base64url") });
      expect(JSON.stringify(listBody)).not.toMatch(/"instructions":|"customArguments":|"runtimeConfiguration":|"mcpConnections":|"integrations":/iu);
      expect(store.queryAccountAgentCatalogForCredential).toHaveBeenCalledWith("credential:owner", {
        scope: "mine", search: "agent", availability: ["online", "unstable"], runtimeIds: ["runtime:one"], ownerUserIds: ["human:owner"], models: ["gpt-5"], access: ["owner"], sort: "runs", limit: 25, after: { sortValue: "9", id: "agent:cursor" },
      });
      const friendList = await fetch(`${server.address()}/v1/agents?scope=friends&access=friend&sort=last_active&limit=100`, { headers });
      expect(friendList.status).toBe(200);
      expect(await friendList.json()).toEqual({ accountId: "account:one", scope: "friends", rows: [], counts: { mine: 3, friends: 0, archived: 0 } });
      expect(store.queryAccountAgentCatalogForCredential).toHaveBeenLastCalledWith("credential:owner", {
        scope: "friends", availability: [], runtimeIds: [], ownerUserIds: [], models: [], access: ["friend"], sort: "last_active", limit: 100,
      });
      const detailResponse = await fetch(`${server.address()}/v1/agents/agent:one`, { headers });
      expect(detailResponse.headers.get("etag")).toBe('"agent:1"');
      expect(await detailResponse.json()).toMatchObject({ identity: { agentId: "agent:one", version: 1 }, access: { canManage: true }, configuration: { environment: { redacted: true } } });
      const updated = await fetch(`${server.address()}/v1/agents/agent:one`, { method: "PATCH", headers: { ...headers, "if-match": '"agent:1"' }, body: JSON.stringify({ name: "Renamed", description: "", permissionMode: "private", configuration, expectedVersion: 1 }) });
      expect(updated.status).toBe(200);
      expect(updated.headers.get("etag")).toBe('"agent:2"');
      expect(await updated.json()).toMatchObject({ identity: { agentId: "agent:one", accountId: "account:one", name: "Renamed", version: 2 } });
      const stale = await fetch(`${server.address()}/v1/agents/agent:one`, { method: "PATCH", headers: { ...headers, "if-match": '"agent:1"' }, body: JSON.stringify({ name: "Stale", description: "", permissionMode: "private", configuration, expectedVersion: 1 }) });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toEqual({ error: { code: "account-agent-version-conflict", currentVersion: 2, currentEtag: '"agent:2"' } });
      const archived = await fetch(`${server.address()}/v1/agents/agent:one/archive`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(archived.status).toBe(200);
      const restored = await fetch(`${server.address()}/v1/agents/agent:one/restore`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 2 }) });
      expect(await restored.json()).toMatchObject({ agent: { agentId: "agent:one", version: 3 }, needsRuntime: true });
      const batch = await fetch(`${server.address()}/v1/agents/batch-lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "archive", items: [{ agentId: "agent:one", expectedVersion: 1 }] }) });
      expect(await batch.json()).toMatchObject({ accountId: "account:one", action: "archive", semantics: "atomic", results: [{ agent: { agentId: "agent:one", version: 2 } }] });
      expect(store.batchAccountAgentLifecycleForCredential).toHaveBeenCalledWith("credential:owner", { action: "archive", items: [{ agentId: "agent:one", expectedVersion: 1 }] });
      const activities = await fetch(`${server.address()}/v1/agents/agent:one/activities?limit=20`, { headers });
      expect(await activities.json()).toEqual({ activities: [{ activityId: "activity:one", accountId: "account:one", agentId: "agent:one", taskId: "task:one", terminalState: "failed", failureCategory: "a2a-task-failed", startedAt: "2026-08-13T00:00:00.000Z", completedAt: "2026-08-13T00:00:03.000Z", durationMs: 3000 }] });
      expect(store.listAccountAgentActivitiesForCredential).toHaveBeenCalledWith("credential:owner", "agent:one", { limit: 20 });
      expect(await fetch(`${server.address()}/v1/agents/agent:one/skills`, { headers }).then((response) => response.json())).toEqual({ agentId: "agent:one", agentVersion: 2, runtimeDiscovery: { state: "unbound", retryable: false }, skills: [] });
      const skillMutation = await fetch(`${server.address()}/v1/agents/agent:one/skills/skill:add`, { method: "POST", headers, body: JSON.stringify({ action: "attach", expectedVersion: 1 }) });
      expect(skillMutation.status).toBe(200);
      expect(store.mutateAccountAgentSkillForCredential).toHaveBeenCalledWith("credential:owner", "agent:one", "skill:add", { action: "attach", expectedVersion: 1 });
      let relayedPrivateConfiguration = "";
      server.accountRuntimeTunnels.register("account:one", "runtime:one", { readyState: 1, close: () => undefined, send: (value) => {
        relayedPrivateConfiguration = value;
        const envelope = JSON.parse(value) as { deliveryId: string; agentId: string };
        server.accountRuntimeTunnels.handle("account:one", "runtime:one", JSON.stringify({ version: "1", type: "private-configuration-result", deliveryId: envelope.deliveryId, agentId: envelope.agentId, status: "updated", summary: { environmentVariableNames: ["PRIVATE_TOKEN"], configuredMcpConnectionIds: ["mcp:one"], configuredIntegrationIds: [], updatedAt: "2026-08-13T00:02:00.000Z" } }));
      } });
      const privateUpdate = await fetch(`${server.address()}/v1/agents/agent:one/private-configuration`, { method: "PUT", headers, body: JSON.stringify({ expectedVersion: 2, idempotencyKey: "private:0123456789", configuration: { environmentValues: { PRIVATE_TOKEN: "secret-value" }, mcpCredentials: { "mcp:one": { token: "mcp-secret" } }, integrationCredentials: {} } }) });
      expect(privateUpdate.status).toBe(200);
      expect(await privateUpdate.json()).toEqual({ status: "updated", summary: { environment: { configuredCount: 1, redacted: true }, configuredMcpCount: 1, configuredIntegrationCount: 0 }, etag: '"agent:3"' });
      expect(relayedPrivateConfiguration).toContain("secret-value");
      expect(JSON.stringify(await fetch(`${server.address()}/v1/agents/agent:one/private-configuration`, { headers }).then((response) => response.json()))).not.toMatch(/secret-value|mcp-secret/iu);
    } finally { await server.stop(); }
  });
});
