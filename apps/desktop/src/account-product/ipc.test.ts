import { describe, expect, it } from "vitest";

import { accountProductRendererCommandResultSchema, accountProductRendererCommandSchema, accountProductRendererSnapshotSchema } from "./ipc.js";

const at = "2026-08-13T00:00:00.000Z";

describe("Account product Renderer IPC", () => {
  it("keeps Account collection snapshots free of private Agent and credential fields", () => {
    const snapshot = accountProductRendererSnapshotSchema.parse({
      session: { state: "signed-in", accountId: "account:one", accountName: "My Account", userId: "human:owner", displayName: "Owner", email: "owner@example.com", expiresAt: "2026-09-13T00:00:00.000Z" },
      route: { name: "agents" }, connection: "online", localServices: { runtimes: [], runtime: { state: "ready" }, mcp: { state: "ready" } }, loading: false, refreshing: false,
      runtimes: [], activities: [], templates: [], friends: [], incomingFriendInvitations: [], outgoingFriendInvitations: [], legacyRecovery: { state: "not_required" },
      catalog: { accountId: "account:one", scope: "mine", rows: [{ agent: { agentId: "agent:one", accountId: "account:one", ownerUserId: "human:owner", name: "Research", description: "", permissionMode: "private", createdAt: at, updatedAt: at, version: 1 }, owner: { userId: "human:owner", displayName: "Owner", email: "owner@example.com" }, effectiveAccess: "owner", status: "needs_runtime" }], counts: { mine: 1, friends: 0, archived: 0 } },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/credentialId|token|instructions|customArguments|runtimeConfiguration|sessionHandle|cwd|environmentValue/iu);
    expect(() => accountProductRendererSnapshotSchema.parse({ ...snapshot, credentialToken: "secret" })).toThrow();
    expect(() => accountProductRendererSnapshotSchema.parse({ ...snapshot, catalog: { ...snapshot.catalog, rows: [{ ...(snapshot.catalog?.rows[0]), privateInstructions: "secret" }] } })).toThrow();
  });

  it("requires an explicit resource ID on every resource mutation", () => {
    expect(accountProductRendererCommandSchema.parse({ type: "agent-skill-mutate", agentId: "agent:one", skillId: "skill:one", mutation: { action: "attach", expectedVersion: 1 } })).toMatchObject({ agentId: "agent:one", skillId: "skill:one" });
    expect(() => accountProductRendererCommandSchema.parse({ type: "agent-skill-mutate", skillId: "skill:one", mutation: { action: "attach", expectedVersion: 1 } })).toThrow();
    expect(() => accountProductRendererCommandSchema.parse({ type: "agent-update", expectedVersion: 1, update: {} })).toThrow();
  });

  it("models Builder as local commands without IDs or server versions", () => {
    expect(accountProductRendererCommandSchema.parse({ type: "creation-start", mode: "ai" })).toEqual({ type: "creation-start", mode: "ai" });
    expect(accountProductRendererCommandSchema.parse({ type: "builder-turn", text: "你好？" })).toEqual({ type: "builder-turn", text: "你好？" });
    expect(accountProductRendererCommandSchema.parse({ type: "creation-submit" })).toEqual({ type: "creation-submit" });
    expect(() => accountProductRendererCommandSchema.parse({ type: "builder-turn", text: "你好？", serverVersion: 1 })).toThrow();
  });

  it("keeps sensitive recovery output bounded to field categories and backup identity", () => {
    const base = {
      session: { state: "signed-out" as const }, route: { name: "agents" as const }, connection: "offline" as const,
      localServices: { runtimes: [], runtime: { state: "inactive" as const }, mcp: { state: "inactive" as const } },
      loading: false, refreshing: false, activities: [], templates: [], runtimes: [], friends: [], incomingFriendInvitations: [], outgoingFriendInvitations: [],
    };
    expect(accountProductRendererSnapshotSchema.parse({
      ...base,
      legacyRecovery: { state: "needs_attention", backupId: "backup:one", importedAgentId: "agent:legacy", unmappedPrivateFields: ["environment_values", "runtime_credentials"] },
    }).legacyRecovery).toEqual({ state: "needs_attention", backupId: "backup:one", importedAgentId: "agent:legacy", unmappedPrivateFields: ["environment_values", "runtime_credentials"] });
    expect(() => accountProductRendererSnapshotSchema.parse({
      ...base,
      legacyRecovery: { state: "needs_attention", backupId: "backup:one", importedAgentId: "agent:legacy", unmappedPrivateFields: ["environment_values"], environmentValue: "secret" },
    })).toThrow();
  });

  it("keeps friend invitations token-free in both snapshots and command results", () => {
    const snapshot = accountProductRendererSnapshotSchema.parse({
      session: { state: "signed-out" }, route: { name: "friends" }, connection: "offline", loading: false, refreshing: false,
      localServices: { runtimes: [], runtime: { state: "inactive" }, mcp: { state: "inactive" } },
      activities: [], templates: [], runtimes: [], friends: [], incomingFriendInvitations: [], outgoingFriendInvitations: [], legacyRecovery: { state: "not_required" },
    });
    const invitation = { direction: "outgoing", invitation: { invitationId: "friend-invitation:one", inviterUserId: "human:owner", recipientEmail: "friend@example.com", status: "pending", createdAt: at, expiresAt: "2026-08-20T00:00:00.000Z", version: 1 } } as const;
    expect(accountProductRendererCommandResultSchema.parse({ type: "friend-invitation-created", invitation, snapshot })).toEqual({ type: "friend-invitation-created", invitation, snapshot });
    expect(() => accountProductRendererCommandResultSchema.parse({ type: "friend-invitation-created", invitation, invitationToken: "x".repeat(43), snapshot })).toThrow();
    expect(() => accountProductRendererSnapshotSchema.parse({ ...snapshot, invitationToken: "x".repeat(43) })).toThrow();
  });
});
