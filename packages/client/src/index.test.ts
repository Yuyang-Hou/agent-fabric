import { describe, expect, it, vi } from "vitest";

import { AgentFabricClient, type FabricClientError } from "./index.js";

describe("AgentFabricClient", () => {
  it("rejects an insecure public origin", () => {
    expect(() => new AgentFabricClient({ baseUrl: "http://example.com", token: "x" })).toThrowError("insecure-server-origin");
  });

  it("keeps the bearer credential out of public version discovery", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      product: "agent-fabric", component: "server", version: "0.1.0", protocolMajor: 1,
      a2aVersion: "1.0.1", runtimeAdapterVersion: "1", features: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl });
    await client.version();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty("authorization");
  });

  it("returns a stable error code and does not leak the credential", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: "credential-scope-denied" } }), { status: 403 }));
    const client = new AgentFabricClient({ baseUrl: "http://localhost:8787", token: "super-secret", fetchImpl, retries: 0 });
    await expect(client.listInvokableAgents()).rejects.toMatchObject({ code: "credential-scope-denied", status: 403 } satisfies Partial<FabricClientError>);
    await expect(client.listInvokableAgents()).rejects.not.toThrow("super-secret");
  });

  it("starts and exchanges an Account login without an authorization header", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: "https://accounts.google.com/auth", expiresAt: "2026-08-12T01:00:00.000Z" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ server: "https://fabric.example", token: "device-secret", humanPrincipalId: "human:one", principalId: "device:one", accountId: "account:one", displayName: "Owner", expiresAt: "2026-09-11T00:00:00.000Z" }), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "https://fabric.example", fetchImpl, retries: 0 });
    await client.startLogin({ codeChallenge: "a".repeat(43), returnUri: "http://127.0.0.1:54321/callback", clientState: "b".repeat(32), deviceName: "Mac" });
    await client.exchangeLogin("exchange-secret", "v".repeat(43));
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]?.headers).not.toHaveProperty("authorization");
      expect(JSON.stringify(call[1]?.headers)).not.toContain("device-secret");
    }
  });

  it("reads the complete bounded Account Runtime catalog", async () => {
    const runtime = { runtimeId: "runtime:one" };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ runtimes: [runtime], nextCursor: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ runtimes: [{ runtimeId: "runtime:two" }] }), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl, retries: 0 });
    await expect(client.listAccountRuntimes()).resolves.toEqual([{ runtimeId: "runtime:one" }, { runtimeId: "runtime:two" }]);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("cursor=next");
  });

  it("reads paginated friends without exposing or changing Account scope", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ friends: [{ friend: { userId: "human:one" } }], nextCursor: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ friends: [{ friend: { userId: "human:two" } }] }), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl, retries: 0 });
    await expect(client.listFriends()).resolves.toEqual([{ friend: { userId: "human:one" } }, { friend: { userId: "human:two" } }]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain("accountId=");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("cursor=next");
  });

  it("loads the current Account identity from the authenticated bootstrap endpoint", async () => {
    const account = { accountId: "account:one", name: "Research Account", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1 };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(account), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl, retries: 0 });
    await expect(client.getAccount()).resolves.toEqual(account);
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8787/v1/account", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer secret" }) }));
  });

  it("creates and revokes a bounded Account self-test session through management endpoints", async () => {
    const created = { selfTestId: "self-test:one", accountId: "account:one", agentId: "agent:one", requester: { token: "temporary-secret", principalId: "device:self-test", credentialId: "credential:self-test", expiresAt: "2026-08-13T00:10:00.000Z" } };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ selfTestId: "self-test:one", status: "revoked" }), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "owner-secret", fetchImpl, retries: 0 });
    await expect(client.createAccountSelfTest("agent:one", "2026-08-13T00:10:00.000Z")).resolves.toEqual(created);
    await expect(client.revokeAccountSelfTest("self-test:one")).resolves.toEqual({ selfTestId: "self-test:one", status: "revoked" });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ agentId: "agent:one", expiresAt: "2026-08-13T00:10:00.000Z" }) });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/v1/self-tests/self-test%3Aone/revoke");
  });

  it("reads and acknowledges bounded legacy migration recovery state", async () => {
    const pending = { state: "needs_attention", backupId: "backup:legacy", importedAgentId: "agent:legacy", unmappedPrivateFields: ["environment_values"] };
    const completed = { state: "completed", backupId: "backup:legacy", importedAgentId: "agent:legacy", acknowledgedAt: "2026-08-13T01:00:00.000Z" };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(pending), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completed), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl, retries: 0 });
    await expect(client.getLegacyAgentMigrationRecovery()).resolves.toEqual(pending);
    await expect(client.completeLegacyAgentMigrationRecovery({ backupId: "backup:legacy", acknowledgedFields: ["environment_values"] })).resolves.toEqual(completed);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ backupId: "backup:legacy", acknowledgedFields: ["environment_values"] }) });
  });

  it("sends both ETag and expected version for resource-targeted Agent updates", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ identity: { agentId: "agent:one" } }), { status: 200 }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl, retries: 0 });
    await client.updateAgent("agent:one", 7, { name: "Updated" });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8787/v1/agents/agent%3Aone", expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ "if-match": '"agent:7"', authorization: "Bearer secret" }),
      body: JSON.stringify({ name: "Updated", expectedVersion: 7 }),
    }));
  });

  it("sends the final Agent create request exactly once even when the server fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: "temporary" } }), { status: 503, headers: { "content-type": "application/json" } }));
    const client = new AgentFabricClient({ baseUrl: "http://127.0.0.1:8787", token: "secret", fetchImpl, retries: 2 });
    await expect(client.createAgent({ name: "Local Builder", description: "", runtimeId: "runtime:one", permissionMode: "private", configuration: { instructions: "Answer", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] } })).rejects.toThrow("temporary");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
