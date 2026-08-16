import { describe, expect, it, vi } from "vitest";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

const now = "2026-08-13T00:00:00.000Z";
const configuration = { instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] };
const draft = { draftId: "draft:one", accountId: "account:one", ownerUserId: "human:member", mode: "blank", name: "", description: "", permissionMode: "private", invocationTargets: [], configuration, pendingUserText: "", state: "active", createdAt: now, updatedAt: now, expiresAt: "2026-08-20T00:00:00.000Z", version: 1 } as const;

describe("Account Agent creation API", () => {
  it("exposes templates, recoverable drafts, validation and idempotent create results", async () => {
    const createdAgent = { agentId: "agent:one", accountId: "account:one", ownerUserId: "human:member", runtimeId: "runtime:one", name: "Research", description: "", permissionMode: "private", invocationTargets: [], configuration, createdAt: now, updatedAt: now, version: 1 } as const;
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:member", principalId: "device:member", ownerPrincipalId: "human:member", instanceId: "instance:one", scopes: ["account:access"] }),
      createAccountAgentDraftForCredential: vi.fn().mockResolvedValue(draft),
      getAccountAgentDraftForCredential: vi.fn().mockResolvedValue(draft),
      listAccountAgentDraftsForCredential: vi.fn().mockResolvedValue({ items: [draft] }),
      saveAccountAgentDraftForCredential: vi.fn().mockResolvedValue({ ...draft, name: "Research", version: 2 }),
      startAccountAgentBuilderTurnForCredential: vi.fn(),
      completeAccountAgentBuilderTurnForCredential: vi.fn(),
      validateAccountAgentDraftForCredential: vi.fn().mockResolvedValue({ valid: false, fieldErrors: [{ field: "runtimeId", code: "runtime-required" }] }),
      createAccountAgentFromDraftForCredential: vi.fn()
        .mockResolvedValueOnce({ status: "validation_failed", draft, validation: { valid: false, fieldErrors: [{ field: "runtimeId", code: "runtime-required" }] } })
        .mockResolvedValueOnce({ status: "created", draft: { ...draft, state: "created", createdAgentId: "agent:one", version: 2 }, agent: createdAgent }),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const headers = { authorization: "Bearer member-secret", "content-type": "application/json" };
      const templates = await fetch(`${server.address()}/v1/agent-templates`, { headers }).then((response) => response.json()) as { templates: unknown[] };
      expect(templates.templates).toHaveLength(3);
      expect((await fetch(`${server.address()}/v1/agent-drafts`, { method: "POST", headers, body: JSON.stringify({ mode: "blank" }) })).status).toBe(201);
      expect(await fetch(`${server.address()}/v1/agent-drafts`, { headers }).then((response) => response.json())).toEqual({ drafts: [draft] });
      expect((await fetch(`${server.address()}/v1/agent-drafts/draft%3Aone`, { headers })).status).toBe(200);
      expect((await fetch(`${server.address()}/v1/agent-drafts/draft%3Aone`, { method: "PUT", headers, body: JSON.stringify({ name: "Research", description: "", permissionMode: "private", invocationTargets: [], configuration, pendingUserText: "", expectedVersion: 1 }) })).status).toBe(200);
      const validation = await fetch(`${server.address()}/v1/agent-drafts/draft%3Aone/validate`, { method: "POST", headers, body: "{}" });
      expect(await validation.json()).toEqual({ valid: false, fieldErrors: [{ field: "runtimeId", code: "runtime-required" }] });
      const first = await fetch(`${server.address()}/v1/agent-drafts/draft%3Aone/create`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "create:0123456789abcdef" }) });
      expect(first.status).toBe(422);
      const retry = await fetch(`${server.address()}/v1/agent-drafts/draft%3Aone/create`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "create:0123456789abcdef" }) });
      expect(retry.status).toBe(201);
      expect(await retry.json()).toMatchObject({ status: "created", agent: { agentId: "agent:one" } });
    } finally { await server.stop(); }
  });
});
