import { describe, expect, it } from "vitest";

import { MySqlStore } from "./store.js";

const capabilities = {
  supportsModelSelection: true,
  supportsThinkingLevel: true,
  supportsServiceTier: true,
  supportsSkills: true,
  supportsMcpConfiguration: true,
  supportsEnvironment: true,
  supportsCustomArguments: true,
  supportsRuntimeConfiguration: true,
  supportsCancellation: true,
  maxConcurrentAgents: 4,
} as const;

describe("Account Runtime persistence", () => {
  it("lists only Runtimes owned by the signed-in Human", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let listSql = "";
    let listValues: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:member", role: "member" }], []];
      if (sql.startsWith("SELECT * FROM account_runtimes WHERE account_id")) { listSql = sql; listValues = values ?? []; return [[], []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await store.listAccountRuntimesForCredential("credential:member", { limit: 50 }, "2026-08-13T00:00:00.000Z");
    expect(listSql).toContain("owner_user_id=?");
    expect(listSql).not.toContain("visibility='account'");
    expect(listValues.slice(0, 2)).toEqual(["account:one", "human:member"]);
  });

  it("registers a bounded private Runtime and rejects legacy shared visibility", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let insertedValues: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:member", role: "member" }], []];
      if (sql.includes("INSERT INTO account_runtimes")) insertedValues = values ?? [];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const runtime = await store.createAccountRuntimeForCredential("credential:member", { provider: "codex", adapterId: "codex-acp", name: "Bob Codex", visibility: "private", health: "ready", capabilities }, "2026-08-13T00:00:00.000Z");
    expect(runtime).toMatchObject({ accountId: "account:one", ownerUserId: "human:member", visibility: "private", health: "ready", capabilities });
    expect(runtime).not.toHaveProperty("runtimeSessionId");
    expect(runtime).not.toHaveProperty("cwd");
    expect(JSON.stringify(insertedValues)).not.toContain("credential");
    await expect(store.createAccountRuntimeForCredential("credential:member", { provider: "codex", adapterId: "codex-acp", name: "Shared Codex", visibility: "account" as never, health: "ready", capabilities }, "2026-08-13T00:00:00.000Z")).rejects.toThrow();
  });

  it("accepts truthful health observations with optimistic versions and supports refresh-to-checking", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let runtimeRow = row({ health: "auth_required", version: 2 });
    const runtimeSkillWrites: { sql: string; values: readonly unknown[] }[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.includes("SELECT * FROM account_runtimes") && sql.includes("FOR UPDATE")) return [[runtimeRow], []];
      if (sql.startsWith("UPDATE account_runtimes SET health=?")) runtimeRow = row({ health: "ready", version: 3 });
      if (sql.startsWith("UPDATE account_runtimes SET health='checking'")) runtimeRow = row({ health: "checking", version: 4 });
      if (sql.includes("account_skills")) runtimeSkillWrites.push({ sql, values: values ?? [] });
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.observeAccountRuntimeForCredential("credential:owner", "runtime:one", { health: "ready", capabilities, runtimeSkills: [{ runtimeSkillId: "local-review", name: "Local review", description: "Metadata only" }], expectedVersion: 2 }, "2026-08-13T00:01:00.000Z")).resolves.toMatchObject({ health: "ready", version: 3 });
    expect(runtimeSkillWrites).toHaveLength(2);
    expect(runtimeSkillWrites[0]?.sql).toContain("origin='runtime'");
    expect(runtimeSkillWrites[1]?.sql).toContain("ON DUPLICATE KEY UPDATE");
    expect(runtimeSkillWrites[1]?.values).toEqual([expect.stringMatching(/^runtime-skill:/u), "account:one", "runtime:one", "Local review", "Metadata only", expect.any(Date), expect.any(Date)]);
    await expect(store.refreshAccountRuntimeForCredential("credential:owner", "runtime:one", 3, "2026-08-13T00:02:00.000Z")).resolves.toMatchObject({ health: "checking", version: 4 });
    await expect(store.refreshAccountRuntimeForCredential("credential:owner", "runtime:one", 2, "2026-08-13T00:03:00.000Z")).rejects.toThrow("account-runtime-version-conflict");
  });

  it("uses a concurrency plan, settles active work, and unbinds without deleting Agents", async () => {
    const createStore = (activeAgentIds: readonly string[]) => {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      let planValues: readonly unknown[] = [];
      let activeTasks = activeAgentIds.map((agent_id, index) => ({ task_id: `task:${index + 1}`, agent_id }));
      const mutations: string[] = [];
      const connection = transactionConnection(async (sql, values) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
        if (sql.includes("SELECT * FROM account_runtimes") && sql.includes("FOR UPDATE")) return [[row({ health: "ready", version: 1 })], []];
        if (sql.startsWith("SELECT agent_id FROM account_agents")) return [[{ agent_id: "agent:one" }, { agent_id: "agent:two" }], []];
        if (sql.includes("SELECT task_id,agent_id FROM (")) return [activeTasks, []];
        if (sql.includes("INSERT INTO account_runtime_deletion_plans")) { planValues = values ?? []; return [{ affectedRows: 1 }, []]; }
        if (sql.includes("FROM account_runtime_deletion_plans")) return [[{
          plan_id: planValues[0], account_id: "account:one", runtime_id: "runtime:one", actor_user_id: "human:owner",
          expected_runtime_version: 1, impact_digest: planValues[5], impact_snapshot: planValues[6], expires_at: planValues[7], consumed_at: null,
        }], []];
        if (sql.includes("UPDATE account_agent_a2a_tasks SET state='canceled'")) activeTasks = [];
        if (/^(UPDATE|DELETE)/u.test(sql.trim())) mutations.push(sql);
        return [{ affectedRows: 1 }, []];
      });
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      return { store, mutations };
    };

    const active = createStore(["agent:one"]);
    const activeImpact = await active.store.planAccountRuntimeDeletionForCredential("credential:owner", "runtime:one", "2026-08-13T00:00:00.000Z");
    expect(activeImpact).toMatchObject({ boundAgentIds: ["agent:one", "agent:two"], activeAgentIds: ["agent:one"], expectedRuntimeVersion: 1 });
    await expect(active.store.prepareAccountRuntimeDeletionForCredential("credential:owner", "runtime:one", { planId: activeImpact.planId, expectedRuntimeVersion: 1 }, "2026-08-13T00:01:00.000Z")).resolves.toMatchObject({ activeTasks: [{ taskId: "task:1", agentId: "agent:one" }] });
    await active.store.settleAccountRuntimeDeletionTasksForCredential("credential:owner", "runtime:one", activeImpact.planId, ["task:1"], "2026-08-13T00:01:01.000Z");
    await expect(active.store.deleteAccountRuntimeForCredential("credential:owner", "runtime:one", { planId: activeImpact.planId, expectedRuntimeVersion: 1 }, "2026-08-13T00:01:02.000Z")).resolves.toMatchObject({ status: "deleted", unboundAgentIds: ["agent:one", "agent:two"] });

    const idle = createStore([]);
    const impact = await idle.store.planAccountRuntimeDeletionForCredential("credential:owner", "runtime:one", "2026-08-13T00:00:00.000Z");
    await expect(idle.store.deleteAccountRuntimeForCredential("credential:owner", "runtime:one", { planId: impact.planId, expectedRuntimeVersion: 1 }, "2026-08-13T00:01:00.000Z")).resolves.toEqual({ runtimeId: "runtime:one", status: "deleted", unboundAgentIds: ["agent:one", "agent:two"] });
    expect(idle.mutations.join("\n")).toContain("UPDATE account_agents SET runtime_id=NULL");
    expect(idle.mutations.join("\n")).toContain("DELETE FROM account_runtimes");
    expect(idle.mutations.join("\n")).not.toContain("DELETE FROM account_agents");
  });
});

function row(overrides: { health: "checking" | "ready" | "auth_required" | "unavailable" | "offline"; version: number }) {
  return {
    runtime_id: "runtime:one", account_id: "account:one", owner_user_id: "human:owner", provider: "codex", adapter_id: "codex-acp", name: "Codex",
    visibility: "private", capabilities: JSON.stringify(capabilities), last_checked_at: "2026-08-13T00:00:00.000Z", created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function transactionConnection(execute: (sql: string, values?: readonly unknown[]) => Promise<unknown>) {
  return { beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined, execute };
}
