import { describe, expect, it } from "vitest";

import { MySqlAccountAgentStore } from "./account-agent-store.js";

const at = "2026-08-13T00:00:00.000Z";
const configuration = {
  instructions: "Answer safely.",
  maxConcurrentTasks: 1,
  skillIds: [],
  disabledRuntimeSkillIds: [],
  environmentVariableNames: [],
  customArguments: [],
  runtimeConfiguration: {},
  mcpConnections: [],
  integrations: [],
};

const agent = {
  agentId: "agent:one",
  accountId: "account:one",
  ownerUserId: "user:owner",
  name: "Agent One",
  description: "First independent Agent",
  permissionMode: "friends" as const,
  configuration,
  createdAt: at,
  updatedAt: at,
  version: 1,
};

describe("MySqlAccountAgentStore", () => {
  it("creates an Agent with one atomic access mode in a transaction-scoped repository", async () => {
    const statements: string[] = [];
    const executor = {
      execute: async (sql: string) => {
        statements.push(sql);
        return [{ affectedRows: 1 }, []];
      },
    };
    const store = new MySqlAccountAgentStore(executor as never);
    await expect(store.createAgent(agent)).resolves.toEqual(agent);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("INSERT INTO account_agents");
  });

  it("uses one stable scoped Agent page query", async () => {
    const statements: string[] = [];
    const executor = {
      execute: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("FROM account_agents")) return [[
          agentRow("agent:two", "2026-08-13 00:02:00.000"),
          agentRow("agent:one", "2026-08-13 00:01:00.000"),
        ], []];
        return [[], []];
      },
    };
    const store = new MySqlAccountAgentStore(executor as never);
    const page = await store.listAgents("account:one", { scope: "active", limit: 2, after: { sortValue: "2026-08-14T00:00:00.000Z", id: "agent:z" } });
    expect(page.items.map((item) => item.agentId)).toEqual(["agent:two", "agent:one"]);
    expect(page.nextCursor).toEqual({ sortValue: "2026-08-13T00:01:00.000Z", id: "agent:one" });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("account_id=?");
    expect(statements[0]).toContain("archived_at IS NULL");
    expect(statements[0]).toContain("updated_at DESC, agent_id DESC");
  });

  it("fails closed on an optimistic-version conflict", async () => {
    const statements: string[] = [];
    const executor = {
      execute: async (sql: string) => {
        statements.push(sql);
        return [{ affectedRows: 0 }, []];
      },
    };
    const store = new MySqlAccountAgentStore(executor as never);
    await expect(store.replaceAgent({ ...agent, version: 2, updatedAt: "2026-08-13T01:00:00.000Z" }, 1)).rejects.toThrow("optimistic-version-conflict");
  });

  it("rolls back a unit of work when a repository operation fails", async () => {
    const lifecycle: string[] = [];
    const connection = {
      beginTransaction: async () => lifecycle.push("begin"),
      commit: async () => lifecycle.push("commit"),
      rollback: async () => lifecycle.push("rollback"),
      release: () => lifecycle.push("release"),
      execute: async () => [[], []],
    };
    const pool = { getConnection: async () => connection };
    const store = new MySqlAccountAgentStore(pool as never);
    await expect(store.transaction(async () => { throw new Error("stop"); })).rejects.toThrow("stop");
    expect(lifecycle).toEqual(["begin", "rollback", "release"]);
  });

  it("persists invitation secrets separately and never returns the digest from list mapping", async () => {
    const valuesSeen: unknown[][] = [];
    const executor = {
      execute: async (sql: string, values?: unknown[]) => {
        valuesSeen.push(values ?? []);
        if (sql.includes("SELECT * FROM account_member_invitations")) return [[{
          invitation_id: "invitation:one",
          account_id: "account:one",
          invited_email: "member@example.com",
          invited_by_user_id: "user:owner",
          role: "member",
          status: "pending",
          token_digest: "private",
          version: 1,
          expires_at: "2026-08-14 00:00:00.000",
          created_at: "2026-08-13 00:00:00.000",
          accepted_at: null,
          revoked_at: null,
        }], []];
        return [{ affectedRows: 1 }, []];
      },
    };
    const store = new MySqlAccountAgentStore(executor as never);
    await store.createMemberInvitation({
      invitationId: "invitation:one",
      accountId: "account:one",
      invitedEmail: "member@example.com",
      role: "member",
      invitedByUserId: "user:owner",
      status: "pending",
      createdAt: at,
      expiresAt: "2026-08-14T00:00:00.000Z",
      version: 1,
    }, { invitationId: "invitation:one", tokenDigest: `sha256:${"a".repeat(64)}` });
    const listed = await store.listMemberInvitations("account:one", { limit: 20 });
    expect(listed.items[0]).not.toHaveProperty("tokenDigest");
    expect(valuesSeen[0]).toContain("a".repeat(64));
  });

  it("bounds every repository page", async () => {
    const store = new MySqlAccountAgentStore({ execute: async () => [[], []] } as never);
    await expect(store.listRuntimes("account:one", { limit: 0 })).rejects.toThrow("page-limit-invalid");
    await expect(store.listSkills("account:one", { limit: 101 })).rejects.toThrow("page-limit-invalid");
  });

  it("scopes direct repository reads by both Account and resource ID", async () => {
    let parameters: readonly unknown[] = [];
    const executor = {
      execute: async (_sql: string, values?: readonly unknown[]) => {
        parameters = values ?? [];
        return [[], []];
      },
    };
    const store = new MySqlAccountAgentStore(executor as never);
    await expect(store.getAgent("account:requester", "agent:foreign")).resolves.toBeUndefined();
    expect(parameters).toEqual(["account:requester", "agent:foreign"]);
  });

  it("rejects a secret-bearing configuration returned by persistence", async () => {
    const executor = {
      execute: async (sql: string) => {
        if (sql.includes("FROM account_agents")) return [[{
          ...agentRow("agent:one", "2026-08-13 00:01:00.000"),
          permission_mode: "private",
          configuration: JSON.stringify({ ...configuration, environmentValues: { TOKEN: "private" } }),
        }], []];
        return [[], []];
      },
    };
    const store = new MySqlAccountAgentStore(executor as never);
    await expect(store.getAgent("account:one", "agent:one")).rejects.toThrow();
  });
});

function agentRow(agentId: string, updatedAt: string) {
  return {
    agent_id: agentId,
    account_id: "account:one",
    owner_user_id: "user:owner",
    runtime_id: null,
    name: agentId,
    description: "Independent",
    avatar_url: null,
    permission_mode: agentId === "agent:one" ? "friends" : "private",
    configuration: JSON.stringify(configuration),
    version: 1,
    archived_at: null,
    archived_by_user_id: null,
    created_at: "2026-08-13 00:00:00.000",
    updated_at: updatedAt,
  };
}
