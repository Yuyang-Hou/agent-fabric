import { describe, expect, it, vi } from "vitest";

import { MySqlStore } from "./store.js";

describe("Account member management persistence", () => {
  it("loads Account identity only through the active credential session", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const execute = vi.fn().mockResolvedValue([[{
      account_id: "account:allowed", name: "Research Account", version: 2,
      created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-12T00:00:00.000Z",
    }], []]);
    Object.defineProperty(store, "pool", { value: { execute, end: async () => undefined } });
    await expect(store.getAccountForCredential("credential:alice", "2026-08-13T01:00:00.000Z")).resolves.toEqual({
      accountId: "account:allowed", name: "Research Account", version: 2,
      createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("JOIN account_sessions"), ["credential:alice", expect.any(Date)]);
  });

  it("reports and acknowledges migration recovery using field categories only", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let acknowledgementValues: readonly unknown[] = [];
    let auditValues: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions s") && sql.includes("JOIN account_memberships m")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.includes("FROM personal_agent_account_migrations")) return [[{ account_agent_id: "agent:legacy", backup_id: "backup:legacy", acknowledged_at: null }], []];
      if (sql.includes("INSERT INTO personal_agent_migration_recovery_acknowledgements")) acknowledgementValues = values ?? [];
      if (sql.includes("INSERT INTO audit_events")) auditValues = values ?? [];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.getLegacyAgentMigrationRecoveryForCredential("credential:owner", "2026-08-13T00:00:00.000Z")).resolves.toMatchObject({
      state: "needs_attention", backupId: "backup:legacy", importedAgentId: "agent:legacy",
      unmappedPrivateFields: ["environment_values", "runtime_credentials", "runtime_configuration", "agent_mcp_credentials", "integration_credentials", "private_skill_contents"],
    });
    const acknowledgedFields = ["environment_values", "runtime_credentials", "runtime_configuration", "agent_mcp_credentials", "integration_credentials", "private_skill_contents"] as const;
    await expect(store.completeLegacyAgentMigrationRecoveryForCredential("credential:owner", { backupId: "backup:legacy", acknowledgedFields }, "2026-08-13T01:00:00.000Z")).resolves.toMatchObject({
      state: "completed", backupId: "backup:legacy", importedAgentId: "agent:legacy", acknowledgedAt: "2026-08-13T01:00:00.000Z",
    });
    expect(acknowledgementValues.slice(0, 5)).toEqual(["backup:legacy", "account:one", "agent:legacy", "human:owner", JSON.stringify(acknowledgedFields)]);
    expect(JSON.stringify([acknowledgementValues, auditValues])).not.toMatch(/credential:owner|secret|environmentValue/iu);
    await expect(store.completeLegacyAgentMigrationRecoveryForCredential("credential:owner", { backupId: "backup:legacy", acknowledgedFields: ["environment_values"] }, "2026-08-13T01:00:00.000Z")).rejects.toThrow("legacy-recovery-acknowledgement-incomplete");
  });

  it("derives member-list scope only from the persisted credential session", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const queries: { sql: string; values?: readonly unknown[] }[] = [];
    const connection = transactionConnection(async (sql, values) => {
      queries.push({ sql, ...(values ? { values } : {}) });
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:allowed", user_id: "human:alice", role: "member" }], []];
      if (sql.includes("FROM account_memberships m")) return [[{
        membership_id: "membership:alice", account_id: "account:allowed", user_id: "human:alice", display_name: "Alice",
        email: "alice@example.com", role: "member", version: 1, joined_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z",
      }], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    await expect(store.listAccountMembersForCredential("credential:alice", { limit: 50 }, "2026-08-13T01:00:00.000Z")).resolves.toMatchObject({ items: [{ accountId: "account:allowed", userId: "human:alice" }] });
    const listQuery = queries.find(({ sql }) => sql.includes("FROM account_memberships m"));
    expect(listQuery?.values?.[0]).toBe("account:allowed");
  });

  it("returns an invitation secret only once while persisting and auditing only its digest", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let invitationValues: readonly unknown[] = [];
    let auditValues: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.includes("SELECT user_id AS instance_id")) return [[], []];
      if (sql.includes("INSERT INTO account_member_invitations")) invitationValues = values ?? [];
      if (sql.includes("INSERT INTO audit_events")) auditValues = values ?? [];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const result = await store.createAccountMemberInvitationForCredential("credential:owner", { email: "BOB@Example.com", role: "member", expiresAt: "2026-08-20T00:00:00.000Z" }, "2026-08-13T00:00:00.000Z");
    expect(result.invitation).toMatchObject({ accountId: "account:one", invitedEmail: "bob@example.com", status: "pending" });
    expect(result.invitationToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(invitationValues).not.toContain(result.invitationToken);
    expect(invitationValues[6]).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(auditValues)).not.toContain(result.invitationToken);
    expect(JSON.stringify(auditValues)).not.toContain("bob@example.com");
    await expect(store.createAccountMemberInvitationForCredential("credential:owner", { email: "later@example.com", role: "member", expiresAt: "2026-09-20T00:00:00.000Z" }, "2026-08-13T00:00:00.000Z")).rejects.toThrow("account-invitation-expiry-denied");
  });

  it("expires pending invitations before listing and returns no invitation secret", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const updates: string[] = [];
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("UPDATE account_member_invitations SET status='expired'")) { updates.push(sql); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("FROM account_member_invitations WHERE account_id")) return [[{
        invitation_id: "account-invitation:old", account_id: "account:one", invited_email: "old@example.com", invited_by_user_id: "human:owner",
        role: "member", status: "expired", version: 2, expires_at: "2026-08-12T00:00:00.000Z", created_at: "2026-08-01T00:00:00.000Z", accepted_at: null, revoked_at: null,
      }], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const page = await store.listAccountMemberInvitationsForCredential("credential:owner", { limit: 50 }, "2026-08-13T00:00:00.000Z");
    expect(page.items).toEqual([expect.objectContaining({ invitationId: "account-invitation:old", status: "expired" })]);
    expect(page.items[0]).not.toHaveProperty("invitationToken");
    expect(updates).toHaveLength(1);
  });

  it("enforces owner/admin/member invitation authority", async () => {
    const createStore = (role: "owner" | "admin" | "member") => {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      const inserted = vi.fn();
      const connection = transactionConnection(async (sql, values) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: `human:${role}`, role }], []];
        if (sql.includes("SELECT user_id AS instance_id")) return [[], []];
        if (sql.includes("INSERT INTO account_member_invitations")) inserted(values);
        return [{ affectedRows: 1 }, []];
      });
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      return { store, inserted };
    };
    const owner = createStore("owner");
    await expect(owner.store.createAccountMemberInvitationForCredential("credential:owner", { email: "admin@example.com", role: "admin", expiresAt: "2026-08-20T00:00:00.000Z" }, "2026-08-13T00:00:00.000Z")).resolves.toBeTruthy();
    const admin = createStore("admin");
    await expect(admin.store.createAccountMemberInvitationForCredential("credential:admin", { email: "member@example.com", role: "member", expiresAt: "2026-08-20T00:00:00.000Z" }, "2026-08-13T00:00:00.000Z")).resolves.toBeTruthy();
    await expect(admin.store.createAccountMemberInvitationForCredential("credential:admin", { email: "admin2@example.com", role: "admin", expiresAt: "2026-08-20T00:00:00.000Z" }, "2026-08-13T00:00:00.000Z")).rejects.toThrow("account-member-authority-denied");
    const member = createStore("member");
    await expect(member.store.createAccountMemberInvitationForCredential("credential:member", { email: "other@example.com", role: "member", expiresAt: "2026-08-20T00:00:00.000Z" }, "2026-08-13T00:00:00.000Z")).rejects.toThrow("account-member-authority-denied");
  });

  it("protects the last owner and hides nonmembers behind the generic not-found result", async () => {
    const createStore = (target: Record<string, unknown> | undefined, ownerCount = 1) => {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      const connection = transactionConnection(async (sql) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
        if (sql.includes("FROM account_memberships m")) return [[...(target ? [target] : [])], []];
        if (sql.includes("COUNT(*) AS count")) return [[{ count: ownerCount }], []];
        return [{ affectedRows: 1 }, []];
      });
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      return store;
    };
    const ownerRow = { membership_id: "membership:owner", account_id: "account:one", user_id: "human:owner", display_name: "Owner", email: "owner@example.com", role: "owner", version: 4, joined_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z" };
    await expect(createStore(ownerRow).updateAccountMemberRoleForCredential("credential:owner", "human:owner", { role: "admin", expectedVersion: 4 }, "2026-08-13T01:00:00.000Z")).rejects.toThrow("account-last-owner-required");
    await expect(createStore(undefined).updateAccountMemberRoleForCredential("credential:owner", "human:other-account", { role: "member", expectedVersion: 1 }, "2026-08-13T01:00:00.000Z")).rejects.toThrow("account-member-not-found");
  });

  it("plans every owned resource, requires explicit dispositions, removes atomically, and denies the revoked member immediately", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let planValues: readonly unknown[] = [];
    let removed = false;
    const mutations: string[] = [];
    const auditValues: (readonly unknown[])[] = [];
    const targetMember = {
      membership_id: "membership:bob", account_id: "account:one", user_id: "human:bob", display_name: "Bob", email: "bob@example.com",
      role: "member", version: 3, joined_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-12T00:00:00.000Z",
    };
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions s") && sql.includes("JOIN account_memberships m")) return [removed ? [] : [{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.includes("FROM account_member_removal_plans")) return [[{
        plan_id: planValues[0], account_id: "account:one", target_user_id: "human:bob", actor_user_id: "human:owner",
        expected_member_version: 3, impact_digest: planValues[5], expires_at: planValues[6], consumed_at: null,
      }], []];
      if (sql.includes("FROM account_memberships m") && sql.includes("m.user_id=?")) return [[targetMember], []];
      if (sql.startsWith("SELECT agent_id,name FROM account_agents")) return [[{ agent_id: "agent:bob", name: "Bob Helper" }], []];
      if (sql.includes("FROM account_runtimes r LEFT JOIN account_agents")) return [[{ runtime_id: "runtime:bob", name: "Bob Codex", agent_id: "agent:bob" }], []];
      if (sql.startsWith("SELECT agent_id FROM agent_invocation_targets")) return [[{ agent_id: "agent:shared" }], []];
      if (sql.startsWith("SELECT invitation_id FROM account_member_invitations")) return [[{ invitation_id: "account-invitation:bob-created" }], []];
      if (sql.includes("COUNT(*) AS count FROM agent_builder_drafts")) return [[{ count: 2 }], []];
      if (sql.includes("COUNT(*) AS count FROM account_sessions")) return [[{ count: 1 }], []];
      if (sql.includes("INSERT INTO account_member_removal_plans")) { planValues = values ?? []; return [{ affectedRows: 1 }, []]; }
      if (sql.includes("INSERT INTO audit_events")) { auditValues.push(values ?? []); return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("DELETE FROM account_memberships")) { mutations.push(sql); removed = true; return [{ affectedRows: 1 }, []]; }
      if (/^(UPDATE|DELETE)/u.test(sql.trim())) mutations.push(sql);
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const impact = await store.planAccountMemberRemovalForCredential("credential:owner", "human:bob", "2026-08-13T00:00:00.000Z");
    expect(impact).toMatchObject({
      accountId: "account:one", userId: "human:bob", expectedMemberVersion: 3,
      ownedAgents: [{ agentId: "agent:bob", name: "Bob Helper" }],
      ownedRuntimes: [{ runtimeId: "runtime:bob", name: "Bob Codex", boundAgentIds: ["agent:bob"] }],
      invocationTargetAgentIds: ["agent:shared"], pendingInvitationIds: ["account-invitation:bob-created"], draftCount: 2, activeSessionCount: 1,
    });
    await expect(store.removeAccountMemberForCredential("credential:owner", "human:bob", { planId: impact.planId, expectedMemberVersion: 3, agentDispositions: [], runtimeDispositions: [] }, "2026-08-13T00:01:00.000Z")).rejects.toThrow("member-removal-agent-disposition-required");

    await expect(store.removeAccountMemberForCredential("credential:owner", "human:bob", {
      planId: impact.planId,
      expectedMemberVersion: 3,
      agentDispositions: [{ agentId: "agent:bob", action: "archive" }],
      runtimeDispositions: [{ runtimeId: "runtime:bob", action: "unbind" }],
    }, "2026-08-13T00:01:00.000Z")).resolves.toEqual({ userId: "human:bob", status: "removed" });
    expect(mutations.join("\n")).toContain("UPDATE account_agents SET owner_user_id=?");
    expect(mutations.join("\n")).toContain("UPDATE account_agents SET runtime_id=NULL");
    expect(mutations.join("\n")).toContain("DELETE FROM agent_invocation_targets");
    expect(mutations.join("\n")).toContain("UPDATE account_sessions s JOIN credentials");
    expect(mutations.join("\n")).toContain("UPDATE credentials c JOIN principals");
    expect(mutations.join("\n")).toContain("DELETE FROM account_memberships");
    expect(JSON.stringify(auditValues)).not.toContain("Bob Helper");
    expect(JSON.stringify(auditValues)).not.toContain("bob@example.com");
    expect(JSON.stringify(auditValues)).toContain("ownedAgents");
    await expect(store.listAccountMembersForCredential("credential:bob", { limit: 50 }, "2026-08-13T00:02:00.000Z")).rejects.toThrow("account-session-unavailable");
  });
});

function transactionConnection(execute: (sql: string, values?: readonly unknown[]) => Promise<unknown>) {
  return {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    execute,
  };
}
