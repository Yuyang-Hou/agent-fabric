import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

describe("Account resource invalidation WebSocket", () => {
  it("authenticates the current session and receives only its Account events", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:member", principalId: "device:member", ownerPrincipalId: "human:member", instanceId: "instance:one", scopes: ["account:access"] }),
      getAccountSessionByCredential: vi.fn().mockResolvedValue({ sessionId: "session:one", credentialId: "credential:member", accountId: "account:one", userId: "human:member", displayName: "Member", email: "member@example.com", role: "member", createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-09-13T00:00:00.000Z", lastSeenAt: "2026-08-13T00:00:00.000Z" }),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    const url = new URL(server.address() as string); url.protocol = "ws:"; url.pathname = "/v1/account-events";
    const socket = new WebSocket(url, { headers: { authorization: "Bearer member-secret" } });
    try {
      await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
      const received = new Promise<string>((resolve) => socket.once("message", (raw) => resolve(raw.toString())));
      server.accountInvalidations.publish({ type: "account-resource-invalidated", accountId: "account:two", resourceType: "agent", resourceId: "agent:hidden", aspects: ["access"], observedAt: "2026-08-13T00:00:00.000Z" });
      const event = { type: "account-resource-invalidated", accountId: "account:one", resourceType: "agent", resourceId: "agent:one", aspects: ["workload", "activity"], observedAt: "2026-08-13T00:00:01.000Z" } as const;
      server.accountInvalidations.publish({ ...event, aspects: [...event.aspects] });
      await expect(received).resolves.toBe(JSON.stringify(event));
      expect(store.authenticate).toHaveBeenCalledWith("member-secret", base.publicBaseUrl, "account:access");
      expect(store.getAccountSessionByCredential).toHaveBeenCalledWith("credential:member");
    } finally {
      socket.close();
      await server.stop();
    }
  });
});
