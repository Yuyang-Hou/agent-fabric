import { describe, expect, it, vi } from "vitest";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

describe("Human friendships API", () => {
  it("lists the inbox and friends, transitions invitations, and never accepts Account role input", async () => {
    const invitation = { invitationId: "friend-invitation:one", inviterUserId: "human:alice", recipientEmail: "bob@example.com", recipientUserId: "human:bob", status: "pending", createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-20T00:00:00.000Z", version: 1 } as const;
    const invitationView = { direction: "incoming", invitation, otherHuman: { userId: "human:alice", displayName: "Alice", email: "alice@example.com" } } as const;
    const friend = { friendshipId: "friendship:one", friend: { userId: "human:alice", displayName: "Alice", email: "alice@example.com" }, since: "2026-08-13T01:00:00.000Z", relationshipVersion: 1 } as const;
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:bob", principalId: "device:bob", ownerPrincipalId: "human:bob", instanceId: "instance:one", scopes: ["account:access"] }),
      listIncomingFriendInvitationsForCredential: vi.fn().mockResolvedValue({ items: [invitationView] }),
      listOutgoingFriendInvitationsForCredential: vi.fn().mockResolvedValue({ items: [] }),
      createFriendInvitationForCredential: vi.fn().mockImplementation(async (_credentialId: string, input: { email: string; expiresAt: string }) => ({
        direction: "outgoing",
        invitation: {
          invitationId: input.email === "alice@example.com" ? "friend-invitation:registered" : "friend-invitation:unregistered",
          inviterUserId: "human:bob", recipientEmail: input.email, ...(input.email === "alice@example.com" ? { recipientUserId: "human:alice" } : {}),
          status: "pending", createdAt: "2026-08-13T00:00:00.000Z", expiresAt: input.expiresAt, version: 1,
        },
        ...(input.email === "alice@example.com" ? { otherHuman: { userId: "human:alice", displayName: "Alice", email: "alice@example.com" } } : {}),
      })),
      acceptFriendInvitationForCredential: vi.fn().mockResolvedValue({ invitation: { ...invitation, status: "accepted", acceptedAt: "2026-08-13T01:00:00.000Z", version: 2 }, friendship: { friendshipId: "friendship:one", humanAUserId: "human:alice", humanBUserId: "human:bob", status: "active", relationshipVersion: 1, createdAt: "2026-08-13T01:00:00.000Z", updatedAt: "2026-08-13T01:00:00.000Z", version: 1 } }),
      rejectFriendInvitationForCredential: vi.fn().mockResolvedValue({ ...invitation, status: "rejected", rejectedAt: "2026-08-13T01:00:00.000Z", version: 2 }),
      revokeFriendInvitationForCredential: vi.fn().mockResolvedValue({ ...invitation, status: "revoked", revokedAt: "2026-08-13T01:00:00.000Z", version: 2 }),
      listFriendsForCredential: vi.fn().mockResolvedValue({ items: [friend] }),
      removeFriendForCredential: vi.fn().mockResolvedValue({ friendshipId: "friendship:one", status: "revoked", relationshipVersion: 2, participantUserIds: ["human:alice", "human:bob"] }),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const headers = { authorization: "Bearer bob-secret", "content-type": "application/json" };
      const incoming = await fetch(`${server.address()}/v1/friend-invitations/incoming`, { headers });
      expect(await incoming.json()).toEqual({ invitations: [invitationView] });
      const friends = await fetch(`${server.address()}/v1/friends`, { headers });
      expect(await friends.json()).toEqual({ friends: [friend] });

      const invalid = await fetch(`${server.address()}/v1/friend-invitations`, { method: "POST", headers, body: JSON.stringify({ email: "alice@example.com", role: "admin", expiresAt: "2026-08-20T00:00:00.000Z" }) });
      expect(invalid.status).toBe(400);
      const created = await fetch(`${server.address()}/v1/friend-invitations`, { method: "POST", headers, body: JSON.stringify({ email: "ALICE@example.com", expiresAt: "2026-08-20T00:00:00.000Z" }) });
      expect(created.status).toBe(201);
      expect(store.createFriendInvitationForCredential).toHaveBeenCalledWith("credential:bob", { email: "alice@example.com", expiresAt: "2026-08-20T00:00:00.000Z" });
      const unregistered = await fetch(`${server.address()}/v1/friend-invitations`, { method: "POST", headers, body: JSON.stringify({ email: "new@example.com", expiresAt: "2026-08-20T00:00:00.000Z" }) });
      const unregisteredBody = await unregistered.json();
      expect(unregisteredBody).toMatchObject({ invitation: { recipientEmail: "new@example.com" } });
      expect(JSON.stringify(unregisteredBody)).not.toMatch(/recipientUserId/iu);

      const accepted = await fetch(`${server.address()}/v1/friend-invitations/friend-invitation%3Aone/accept`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(accepted.status).toBe(200);
      expect(store.acceptFriendInvitationForCredential).toHaveBeenCalledWith("credential:bob", "friend-invitation:one", 1);
      const rejected = await fetch(`${server.address()}/v1/friend-invitations/friend-invitation%3Aone/reject`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(rejected.status).toBe(200);
      const revoked = await fetch(`${server.address()}/v1/friend-invitations/friend-invitation%3Aone/revoke`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(revoked.status).toBe(200);
      const removed = await fetch(`${server.address()}/v1/friends/friendship%3Aone/remove`, { method: "POST", headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(await removed.json()).toEqual({ friendshipId: "friendship:one", status: "revoked", relationshipVersion: 2 });
    } finally { await server.stop(); }
  });

  it("retires every legacy Account membership endpoint with a bounded 410 response", async () => {
    const store = { migrate: vi.fn(), close: vi.fn() } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      for (const path of ["/v1/members", "/v1/member-invitations", "/v1/auth/member-join/start", "/v1/auth/member-join/exchange"]) {
        const response = await fetch(`${server.address()}${path}`, { method: path.includes("auth") ? "POST" : "GET", headers: { "content-type": "application/json" }, ...(path.includes("auth") ? { body: "{}" } : {}) });
        expect(response.status).toBe(410);
        expect(await response.json()).toEqual({ error: { code: "account-membership-model-retired" } });
      }
    } finally { await server.stop(); }
  });
});
