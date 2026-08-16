import { describe, expect, it } from "vitest";

import { MySqlStore } from "./store.js";

const now = "2026-08-13T00:00:00.000Z";
const expiresAt = "2026-08-20T00:00:00.000Z";

describe("Human friendship persistence", () => {
  it("creates a role-free invitation for an unregistered email and rejects self-invites", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let invitationInsert: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[actor("human:alice", "alice@example.com")], []];
      if (sql.includes("WHERE m.role='owner' AND m.email=?")) return [[], []];
      if (sql.includes("SELECT invitation_id FROM human_friend_invitations")) return [[], []];
      if (sql.includes("INSERT INTO human_friend_invitations")) invitationInsert = values ?? [];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const invitation = await store.createFriendInvitationForCredential("credential:alice", { email: " NEW@example.com ", expiresAt }, now);
    expect(invitation).toMatchObject({ direction: "outgoing", invitation: { inviterUserId: "human:alice", recipientEmail: "new@example.com", status: "pending", version: 1 } });
    expect(invitation).not.toHaveProperty("invitationToken");
    expect(invitation.invitation).not.toHaveProperty("role");
    expect(invitationInsert).toEqual([expect.stringMatching(/^friend-invitation:/u), "human:alice", "new@example.com", expect.stringMatching(/^[0-9a-f]{64}$/u), null, expect.any(Date), expect.any(Date)]);
    await expect(store.createFriendInvitationForCredential("credential:alice", { email: "ALICE@example.com", expiresAt }, now)).rejects.toThrow("friend-invitation-unavailable");
  });

  it("accepts only the matching inbox record and normalizes the Human pair", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let accepted = false;
    const invitationRow = friendInvitationRow();
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor("human:bob", "bob@example.com")], []];
      if (sql.includes("SELECT * FROM human_friend_invitations")) return [[accepted ? { ...invitationRow, status: "accepted", accepted_at: now, version: 2 } : invitationRow], []];
      if (sql.includes("SELECT * FROM human_friendships")) return [[], []];
      if (sql.includes("UPDATE human_friend_invitations SET recipient_user_id")) accepted = true;
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const result = await store.acceptFriendInvitationForCredential("credential:bob", "friend-invitation:one", 1, now);
    expect(result.invitation).toMatchObject({ status: "accepted", recipientUserId: "human:bob", version: 2, acceptedAt: now });
    expect(result.friendship).toMatchObject({ humanAUserId: "human:alice", humanBUserId: "human:bob", status: "active", relationshipVersion: 1 });
    await expect(store.acceptFriendInvitationForCredential("credential:bob", "friend-invitation:one", 1, now)).rejects.toThrow("friend-invitation-unavailable");
  });

  it("rejects expiry, mismatched recipients, and reciprocal pending duplicates", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    await expect(store.createFriendInvitationForCredential("credential:alice", { email: "bob@example.com", expiresAt: now }, now)).rejects.toThrow("friend-invitation-expiry-denied");

    const mismatchedConnection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor("human:charlie", "charlie@example.com")], []];
      if (sql.includes("SELECT * FROM human_friend_invitations")) return [[], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => mismatchedConnection, end: async () => undefined }, configurable: true });
    await expect(store.acceptFriendInvitationForCredential("credential:charlie", "friend-invitation:one", 1, now)).rejects.toThrow("friend-invitation-unavailable");

    const duplicateConnection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor("human:bob", "bob@example.com")], []];
      if (sql.includes("WHERE m.role='owner' AND m.email=?")) return [[{ user_id: "human:alice", display_name: "Alice", email: "alice@example.com" }], []];
      if (sql.includes("SELECT * FROM human_friendships")) return [[], []];
      if (sql.includes("SELECT invitation_id FROM human_friend_invitations")) return [[{ invitation_id: "friend-invitation:existing" }], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => duplicateConnection, end: async () => undefined }, configurable: true });
    await expect(store.createFriendInvitationForCredential("credential:bob", { email: "alice@example.com", expiresAt }, now)).rejects.toThrow("friend-invitation-unavailable");
  });

  it("revokes an active Friendship with optimistic concurrency", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let friendship: Record<string, unknown> = friendshipRow();
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor("human:alice", "alice@example.com")], []];
      if (sql.includes("SELECT * FROM human_friendships")) return [[friendship], []];
      if (sql.includes("UPDATE human_friendships SET status='revoked'")) friendship = { ...friendship, status: "revoked", relationship_version: 2, version: 2, revoked_at: now };
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    await expect(store.removeFriendForCredential("credential:alice", "friendship:one", 1, now)).resolves.toEqual({ friendshipId: "friendship:one", status: "revoked", relationshipVersion: 2, participantUserIds: ["human:alice", "human:bob"] });
    await expect(store.removeFriendForCredential("credential:alice", "friendship:one", 1, now)).rejects.toThrow("friendship-not-found");
  });

  it("resolves active friends from a personal Account without exposing Account membership", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let query = "";
    Object.defineProperty(store, "pool", { value: { execute: async (sql: string) => {
      query = sql;
      return [[{ friend_user_id: "human:bob" }, { friend_user_id: "human:carol" }], []];
    }, end: async () => undefined } });

    await expect(store.listActiveFriendUserIdsForAccount("account:alice")).resolves.toEqual(["human:bob", "human:carol"]);
    expect(query).toContain("f.status='active'");
    expect(query).toContain("owner.role='owner'");
  });
});

function actor(user_id: string, email: string) {
  return { account_id: `account:${user_id}`, user_id, role: "owner", email, display_name: user_id, credential_scopes: JSON.stringify(["account:access"]) };
}

function friendInvitationRow() {
  return {
    invitation_id: "friend-invitation:one", inviter_user_id: "human:alice", recipient_email: "bob@example.com", recipient_email_digest: "sha256:placeholder",
    recipient_user_id: "human:bob", status: "pending", version: 1, expires_at: expiresAt, created_at: now, accepted_at: null, rejected_at: null, revoked_at: null,
  };
}

function friendshipRow() {
  return {
    friendship_id: "friendship:one", human_a_user_id: "human:alice", human_b_user_id: "human:bob", status: "active", relationship_version: 1, version: 1,
    created_at: now, updated_at: now, revoked_at: null,
  };
}

function transactionConnection(execute: (sql: string, values?: readonly unknown[]) => Promise<unknown>) {
  return { beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined, execute };
}
