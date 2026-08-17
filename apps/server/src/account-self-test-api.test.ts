import { describe, expect, it, vi } from "vitest";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

const configuration = { instructions: "Answer clearly.", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] };
const agent = { agentId: "agent:one", accountId: "account:one", ownerUserId: "human:owner", runtimeId: "runtime:one", name: "One", description: "Answers", permissionMode: "private" as const, configuration, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1 };
const runtime = { runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-acp", name: "Codex", visibility: "private" as const, health: "ready" as const, capabilities: { supportsModelSelection: false, supportsThinkingLevel: false, supportsServiceTier: false, supportsSkills: false, supportsMcpConfiguration: false, supportsEnvironment: false, supportsCustomArguments: false, supportsRuntimeConfiguration: false, supportsCancellation: true, maxConcurrentAgents: 1 }, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1 };

describe("Account Agent isolated self-test API", () => {
  it("issues one exact-Agent credential, exposes only A2A surfaces, and revokes it", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockImplementation(async (token: string) => token === "self-test-secret"
        ? { credentialId: "credential:self-test", principalId: "device:self-test", ownerPrincipalId: "human:owner", instanceId: "instance:one", scopes: ["account:self-test"] }
        : { credentialId: "credential:owner", principalId: "device:owner", ownerPrincipalId: "human:owner", instanceId: "instance:one", scopes: ["account:access"] }),
      createAccountSelfTestForCredential: vi.fn().mockResolvedValue({ selfTestId: "self-test:one", accountId: "account:one", agentId: agent.agentId, requester: { token: "self-test-secret", principalId: "device:self-test", credentialId: "credential:self-test", expiresAt: "2026-08-13T00:10:00.000Z" } }),
      revokeAccountSelfTestForCredential: vi.fn().mockResolvedValue({ selfTestId: "self-test:one", status: "revoked" }),
      listInvokableAccountAgentsForCredential: vi.fn().mockResolvedValue([{ agent, runtime, accessScope: "owner" }]),
      getInvokableAccountAgentForCredential: vi.fn().mockResolvedValue({ agent, runtime, accessScope: "owner" }),
      getReadableAccountA2ATaskRouteForCredential: vi.fn().mockResolvedValue({ taskId: "task:one", accountId: "account:one", agentId: agent.agentId, originUserId: "human:owner", originCredentialId: "credential:self-test", state: "completed" }),
      createAccountA2ATaskForCredential: vi.fn(), updateAccountA2ATaskState: vi.fn(),
      listAccountMembersForCredential: vi.fn(), listAccountMemberInvitationsForCredential: vi.fn(), createAccountMemberInvitationForCredential: vi.fn(), revokeAccountMemberInvitationForCredential: vi.fn(), updateAccountMemberRoleForCredential: vi.fn(), planAccountMemberRemovalForCredential: vi.fn(), removeAccountMemberForCredential: vi.fn(),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const ownerHeaders = { authorization: "Bearer owner-secret", "content-type": "application/json" };
      const created = await fetch(`${server.address()}/v1/self-tests`, { method: "POST", headers: ownerHeaders, body: JSON.stringify({ agentId: agent.agentId, expiresAt: "2026-08-13T00:10:00.000Z" }) });
      expect(created.status).toBe(201);
      expect(created.headers.get("cache-control")).toBe("no-store");
      expect(await created.json()).toMatchObject({ selfTestId: "self-test:one", agentId: agent.agentId, requester: { token: "self-test-secret" } });
      expect(store.createAccountSelfTestForCredential).toHaveBeenCalledWith("credential:owner", agent.agentId, { audience: "http://127.0.0.1:8787", expiresAt: "2026-08-13T00:10:00.000Z" });

      const selfTestHeaders = { authorization: "Bearer self-test-secret" };
      const discovered = await fetch(`${server.address()}/v1/invokable-agents`, { headers: selfTestHeaders });
      expect(discovered.status).toBe(200);
      expect(await discovered.json()).toEqual({ agents: [{ agentId: agent.agentId, name: "One", description: "Answers", availability: "offline", accessScope: "owner" }] });
      server.accountRuntimeTunnels.register(runtime.accountId, runtime.runtimeId, { readyState: 1, send: () => undefined, close: () => undefined });
      expect(await fetch(`${server.address()}/v1/invokable-agents`, { headers: selfTestHeaders }).then((response) => response.json())).toEqual({ agents: [{ agentId: agent.agentId, name: "One", description: "Answers", availability: "online", accessScope: "owner" }] });
      const card = await fetch(`${server.address()}/v1/agents/agent%3Aone/card`, { headers: selfTestHeaders });
      expect(card.status).toBe(200);
      const route = await fetch(`${server.address()}/v1/a2a/tasks/task%3Aone/route`, { headers: selfTestHeaders });
      expect(route.status).toBe(200);
      expect(await route.json()).toEqual({ taskId: "task:one", agentId: agent.agentId, state: "completed" });

      const members = await fetch(`${server.address()}/v1/members`, { headers: selfTestHeaders });
      expect(members.status).toBe(410);
      expect(store.listAccountMembersForCredential).not.toHaveBeenCalled();

      const revoked = await fetch(`${server.address()}/v1/self-tests/self-test%3Aone/revoke`, { method: "POST", headers: ownerHeaders, body: "{}" });
      expect(revoked.status).toBe(200);
      expect(await revoked.json()).toEqual({ selfTestId: "self-test:one", status: "revoked" });
      expect(store.revokeAccountSelfTestForCredential).toHaveBeenCalledWith("credential:owner", "self-test:one");
    } finally { await server.stop(); }
  });
});
