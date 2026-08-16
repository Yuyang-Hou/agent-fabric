import { describe, expect, it } from "vitest";

import { MySqlStore } from "./store.js";

const configuration = {
  instructions: "Answer clearly.", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [],
};

describe("Account multi-Agent persistence", () => {
  it("creates at least three independently identified Agents for one owner", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const inserted: (readonly unknown[])[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.includes("INSERT INTO account_agents")) inserted.push(values ?? []);
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const agents = await Promise.all(["Researcher", "Writer", "Reviewer"].map((name) => store.createAccountAgentForCredential("credential:owner", {
      name, description: `${name} Agent`, permissionMode: "private", configuration,
    }, "2026-08-13T00:00:00.000Z")));
    expect(new Set(agents.map((agent) => agent.agentId)).size).toBe(3);
    expect(agents.map((agent) => agent.ownerUserId)).toEqual(["human:owner", "human:owner", "human:owner"]);
    expect(agents.map((agent) => agent.name)).toEqual(["Researcher", "Writer", "Reviewer"]);
    expect(inserted).toHaveLength(3);
  });

  it("derives Account isolation from the session and returns generic not-found", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const queries: (readonly unknown[])[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:two", user_id: "human:other", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) { queries.push(values ?? []); return [[], []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.getAccountAgentForCredential("credential:other", "agent:account-one", "2026-08-13T00:00:00.000Z")).rejects.toThrow("account-agent-not-found");
    expect(queries[0]).toEqual(["account:two", "agent:account-one"]);
  });

  it("lists only the authenticated Human's owned Agents with friend-opened counts separated", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let listSql = "";
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT a.* FROM account_agents")) { listSql = sql; return [[agentRow("agent:owned", "human:owner", "private")], []]; }
      if (sql.includes("COUNT(*) AS count")) return [[{ count: sql.includes("archived_at IS NOT NULL") ? 1 : 2 }], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const page = await store.listAccountAgentsForCredential("credential:owner", { scope: "mine", limit: 50 }, "2026-08-13T00:00:00.000Z");
    expect(listSql).toContain("a.owner_user_id=?");
    expect(page.items.map((agent) => agent.agentId)).toEqual(["agent:owned"]);
    expect(page.counts).toEqual({ mine: 2, friends: 2, archived: 1 });
  });

  it("projects filtered catalog rows with owner, Runtime, Presence, workload and activity in bounded queries", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const statements: { sql: string; values: readonly unknown[] }[] = [];
    const online = catalogProjectionRow("agent:online", { runtime: runtimeRow(), runCount: 7, lastActiveAt: "2026-08-12T23:59:00.000Z", queued: 1, working: 2 });
    const unbound = catalogProjectionRow("agent:unbound", { queued: 0, working: 0 });
    const connection = transactionConnection(async (sql, values) => {
      statements.push({ sql, values: values ?? [] });
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.includes("AS owner_membership_id")) return [[online, unbound], []];
      if (sql.includes("COUNT(*) AS count")) return [[{ count: 2 }], []];
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const page = await store.queryAccountAgentCatalogForCredential("credential:owner", {
      scope: "mine", search: "agent_%", availability: ["online", "needs_runtime"], runtimeIds: [], ownerUserIds: ["human:owner"], models: ["gpt-5"], access: ["owner"], sort: "runs", limit: 20,
    }, "2026-08-13T00:00:00.000Z");

    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]).toMatchObject({
      agent: { agentId: "agent:online" }, owner: { userId: "human:owner" }, effectiveAccess: "owner", status: "online",
      runtime: { runtimeId: "runtime:private", name: "Private Codex" }, presence: { availability: "online", connectionFresh: true, bindingMatches: true },
      workload: { queuedTasks: 1, workingTasks: 2 }, runCount30d: 7, lastActiveAt: "2026-08-12T23:59:00.000Z",
    });
    expect(page.rows[1]).toMatchObject({ agent: { agentId: "agent:unbound" }, status: "needs_runtime", workload: { queuedTasks: 0, workingTasks: 0 } });
    expect(page.rows[1]).not.toHaveProperty("presence");
    expect(page.rows[1]).not.toHaveProperty("runCount30d");
    expect(JSON.stringify(page)).not.toMatch(/Answer clearly|"instructions":|"customArguments":|"runtimeConfiguration":|"mcpConnections":|"integrations":/iu);
    const projection = statements.find(({ sql }) => sql.includes("AS owner_membership_id"));
    expect(projection?.sql).toContain("LEFT JOIN account_runtimes");
    expect(projection?.sql).toContain("LEFT JOIN (\n          SELECT agent_id,SUM(state IN");
    expect(projection?.sql).toContain("FROM agent_activities");
    expect(projection?.sql).toContain("LOWER(a.name) LIKE ?");
    expect(projection?.sql).toContain("ORDER BY COALESCE(activity.run_count_30d,0) DESC,a.agent_id DESC");
    expect(projection?.values).toEqual(expect.arrayContaining(["%agent\\_\\%%", "human:owner", "gpt-5"]));
    expect(projection?.values).not.toContain(20);
    expect(projection?.sql).toContain("LIMIT 20");
    expect(statements.some(({ sql }) => sql.includes("agent_invocation_targets"))).toBe(false);
    expect(projection?.sql).not.toMatch(/token_digest|session_id|environment_value|credential_value/iu);
  });

  it("records the first terminal failed A2A Task once as metadata-only activity", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let state = "working";
    const activityValues: (readonly unknown[])[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.startsWith("SELECT * FROM account_agent_a2a_tasks")) return [[{ task_id: "task:failed", account_id: "account:one", agent_id: "agent:one", origin_user_id: "human:owner", origin_credential_id: "credential:owner", state, created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:01.000Z" }], []];
      if (sql.startsWith("UPDATE account_agent_a2a_tasks")) { state = String(values?.[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("INSERT IGNORE INTO agent_activities")) { activityValues.push(values ?? []); return [{ affectedRows: 1 }, []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    await store.updateAccountA2ATaskState("task:failed", "failed", "2026-08-13T00:00:03.000Z");
    await store.updateAccountA2ATaskState("task:failed", "failed", "2026-08-13T00:00:04.000Z");
    expect(activityValues).toHaveLength(1);
    expect(activityValues[0]).toEqual([expect.stringMatching(/^activity:/u), "account:one", "agent:one", "task:failed", "failed", "a2a-task-failed", "2026-08-13T00:00:00.000Z", expect.any(Date), 3_000]);
    expect(JSON.stringify(activityValues)).not.toContain("prompt");
    expect(JSON.stringify(activityValues)).not.toContain("answer");
  });

  it("fails a batch lifecycle atomically when any selected Agent is unauthorized", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let rolledBack = false;
    const updates: string[] = [];
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => { rolledBack = true; },
      release: () => undefined,
      execute: async (sql: string, values?: readonly unknown[]) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:member", role: "member" }], []];
        if (sql.startsWith("SELECT * FROM account_agents")) {
          const agentId = String(values?.[1]);
          return [[agentRow(agentId, agentId === "agent:a-owned" ? "human:member" : "human:owner", "private")], []];
        }
        if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
        if (sql.includes("COUNT(*) AS count")) return [[{ count: 0 }], []];
        if (sql.startsWith("UPDATE account_agents")) updates.push(sql);
        return [{ affectedRows: 1 }, []];
      },
    };
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    await expect(store.batchAccountAgentLifecycleForCredential("credential:member", {
      action: "archive", items: [{ agentId: "agent:a-owned", expectedVersion: 1 }, { agentId: "agent:z-foreign", expectedVersion: 1 }],
    }, "2026-08-13T00:01:00.000Z")).rejects.toThrow("account-agent-batch-denied");
    expect(rolledBack).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("derives unstable, stale-offline and archived lifecycle precedence from Runtime heartbeat truth", async () => {
    const scenarios = [
      { expected: "unstable", health: "auth_required", checkedAt: "2026-08-12T23:59:50.000Z", archivedAt: null },
      { expected: "offline", health: "ready", checkedAt: "2026-08-12T23:58:00.000Z", archivedAt: null },
      { expected: "archived", health: "ready", checkedAt: "2026-08-12T23:59:50.000Z", archivedAt: "2026-08-12T23:59:55.000Z" },
    ] as const;
    for (const scenario of scenarios) {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      const runtime = { ...runtimeRow(), health: scenario.health, last_checked_at: scenario.checkedAt };
      const projection = { ...catalogProjectionRow("agent:status", { runtime, queued: 0, working: 0 }), archived_at: scenario.archivedAt, archived_by_user_id: scenario.archivedAt ? "human:owner" : null };
      const connection = transactionConnection(async (sql) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
        if (sql.includes("AS owner_membership_id")) return [[projection], []];
        if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
        if (sql.includes("COUNT(*) AS count")) return [[{ count: 1 }], []];
        return [[], []];
      });
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      const page = await store.queryAccountAgentCatalogForCredential("credential:owner", { scope: scenario.archivedAt ? "archived" : "mine", availability: [], runtimeIds: [], ownerUserIds: [], models: [], access: [], sort: "last_active", limit: 10 }, "2026-08-13T00:00:00.000Z");
      const row = page.rows[0];
      expect(row && !("kind" in row) ? row.status : undefined).toBe(scenario.expected);
      if (scenario.expected === "archived") expect(row).not.toHaveProperty("presence");
    }
  });

  it("lists metadata-only activity with Account and Agent scoped stable pagination", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let activitySql = "";
    let activityValues: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[agentRow("agent:shared", "human:owner", "friends")], []];
      if (sql.startsWith("SELECT activity_id")) {
        activitySql = sql; activityValues = values ?? [];
        return [[{ activity_id: "activity:one", account_id: "account:one", agent_id: "agent:shared", task_id: "task:one", terminal_state: "failed", failure_category: "a2a-task-failed", started_at: "2026-08-13T00:00:00.000Z", completed_at: "2026-08-13T00:00:03.000Z", duration_ms: 3000 }], []];
      }
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const page = await store.listAccountAgentActivitiesForCredential("credential:owner", "agent:shared", { limit: 1, after: { sortValue: "2026-08-13T00:01:00.000Z", id: "activity:z" } }, "2026-08-13T00:02:00.000Z");
    expect(page).toEqual({ items: [{ activityId: "activity:one", accountId: "account:one", agentId: "agent:shared", taskId: "task:one", terminalState: "failed", failureCategory: "a2a-task-failed", startedAt: "2026-08-13T00:00:00.000Z", completedAt: "2026-08-13T00:00:03.000Z", durationMs: 3000 }], nextCursor: { sortValue: "2026-08-13T00:00:03.000Z", id: "activity:one" } });
    expect(activitySql).toContain("WHERE account_id=? AND agent_id=?");
    expect(activitySql).toContain("LIMIT 1");
    expect(activitySql).not.toMatch(/prompt|artifact|response|session_id|cwd/iu);
    expect(activityValues).toEqual(["account:one", "agent:shared", expect.any(Date), expect.any(Date), "activity:z"]);
  });

  it("hides activity and counts from a member without Agent access", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let queriedActivity = false;
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:member", role: "member" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[agentRow("agent:private", "human:owner", "private")], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.startsWith("SELECT activity_id")) queriedActivity = true;
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.listAccountAgentActivitiesForCredential("credential:member", "agent:private", { limit: 20 }, "2026-08-13T00:02:00.000Z")).rejects.toThrow("account-agent-not-found");
    expect(queriedActivity).toBe(false);
  });

  it("keeps owner-only Agent detail unavailable to friends", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const sensitiveConfiguration = { ...configuration, instructions: "private instructions", environmentVariableNames: ["PRIVATE_TOKEN"], customArguments: ["--token=secret-value"], runtimeConfiguration: { privatePath: "/private/owner/work" }, mcpConnections: [{ connectionId: "mcp:one", name: "Search", transport: "http", configured: true }], integrations: [{ integrationId: "integration:one", provider: "github", displayName: "GitHub", state: "configured" }] };
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:member", role: "member" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:shared", "human:owner", "friends"), runtime_id: "runtime:private", configuration: JSON.stringify(sensitiveConfiguration) }], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[runtimeRow()], []];
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.getAccountAgentDetailForCredential("credential:member", "agent:shared", "2026-08-13T00:00:00.000Z")).rejects.toThrow("account-agent-not-found");
  });

  it("rejects an unsupported model catalog option before changing any Agent field", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let updated = false;
    const configuredRuntime = { ...runtimeRow(), owner_user_id: "human:owner", capabilities: JSON.stringify({ ...JSON.parse(runtimeRow().capabilities), supportsModelSelection: true, modelCatalog: [{ model: "supported-model", displayName: "Supported", thinkingLevels: ["medium"], serviceTiers: ["default"] }] }) };
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), runtime_id: "runtime:private" }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[configuredRuntime], []];
      if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
      if (sql.startsWith("UPDATE account_agents")) updated = true;
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.updateAccountAgentForCredential("credential:owner", "agent:one", { name: "Agent", description: "", runtimeId: "runtime:private", permissionMode: "private", configuration: { ...configuration, model: "unsupported-model" }, expectedVersion: 1 }, "2026-08-13T00:01:00.000Z")).rejects.toThrow("runtime-model-unsupported");
    expect(updated).toBe(false);
  });

  it("merges editable settings without clearing private or Skill configuration", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const currentConfiguration = {
      ...configuration,
      skillIds: ["skill:keep"],
      disabledRuntimeSkillIds: ["skill:runtime"],
      environmentVariableNames: ["PRIVATE_TOKEN"],
      customArguments: ["--private"],
      runtimeConfiguration: { workingDirectory: "/private/path" },
      mcpConnections: [{ connectionId: "mcp:one", name: "Search", transport: "http", configured: true }],
      integrations: [{ integrationId: "integration:one", provider: "github", displayName: "GitHub", state: "configured" }],
    };
    let savedConfiguration: typeof currentConfiguration | undefined;
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), configuration: JSON.stringify(currentConfiguration) }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.includes("UPDATE account_agents SET runtime_id")) { savedConfiguration = JSON.parse(String(values?.[5])); return [{ affectedRows: 1 }, []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const result = await store.updateAccountAgentForCredential("credential:owner", "agent:one", {
      name: "Renamed", description: "Updated", permissionMode: "private", expectedVersion: 1,
      configuration: { instructions: "New public instructions", model: null, thinkingLevel: null, serviceTier: null, maxConcurrentTasks: 3 },
    }, "2026-08-13T00:01:00.000Z");

    expect(result).toMatchObject({ name: "Renamed", configuration: { instructions: "New public instructions", maxConcurrentTasks: 3, environmentVariableNames: ["PRIVATE_TOKEN"], skillIds: ["skill:keep"] } });
    expect(savedConfiguration).toEqual({ ...currentConfiguration, instructions: "New public instructions", maxConcurrentTasks: 3 });
  });

  it("lists persisted Skill metadata with truthful offline Runtime discovery and no fabricated availability", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const skillRows = [
      { skill_id: "skill:account", account_id: "account:one", runtime_id: null, name: "Account skill", description: "Shared", origin: "account", version: 1, created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z" },
      { skill_id: "skill:runtime", account_id: "account:one", runtime_id: "runtime:private", name: "Runtime skill", description: "Metadata only", origin: "runtime", version: 1, created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z" },
    ];
    const agentConfiguration = { ...configuration, skillIds: ["skill:account"], disabledRuntimeSkillIds: ["skill:runtime"] };
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), runtime_id: "runtime:private", configuration: JSON.stringify(agentConfiguration) }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[{ ...runtimeRow(), health: "offline", last_checked_at: "2026-08-12T23:50:00.000Z", capabilities: JSON.stringify({ ...JSON.parse(runtimeRow().capabilities), supportsSkills: true }) }], []];
      if (sql.startsWith("SELECT skill_id,account_id")) return [skillRows, []];
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const catalog = await store.listAccountAgentSkillsForCredential("credential:owner", "agent:one", "2026-08-13T00:00:00.000Z");
    expect(catalog).toMatchObject({ agentId: "agent:one", runtimeDiscovery: { state: "offline", retryable: true }, skills: [
      { skill: { skillId: "skill:account", origin: "account" }, attached: true, enabled: true, available: true },
      { skill: { skillId: "skill:runtime", origin: "runtime" }, attached: true, enabled: false, available: false },
    ] });
  });

  it("mutates one Skill while preserving unrelated Skill configuration", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let savedConfiguration: Record<string, unknown> | undefined;
    const currentConfiguration = { ...configuration, skillIds: ["skill:keep"], disabledRuntimeSkillIds: [] };
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), configuration: JSON.stringify(currentConfiguration) }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.startsWith("SELECT skill_id,account_id")) return [[{ skill_id: "skill:add", account_id: "account:one", runtime_id: null, name: "Add", description: "", origin: "account", version: 1, created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z" }], []];
      if (sql.startsWith("UPDATE account_agents SET configuration")) { savedConfiguration = JSON.parse(String(values?.[0])); return [{ affectedRows: 1 }, []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const result = await store.mutateAccountAgentSkillForCredential("credential:owner", "agent:one", "skill:add", { action: "attach", expectedVersion: 1 }, "2026-08-13T00:01:00.000Z");
    expect(result.configuration.skillIds).toEqual(["skill:add", "skill:keep"]);
    expect(savedConfiguration?.skillIds).toEqual(["skill:add", "skill:keep"]);
    expect(savedConfiguration?.disabledRuntimeSkillIds).toEqual([]);
  });

  it("commits only private-configuration summaries and audits counts without secret values", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const configured = { ...configuration, mcpConnections: [{ connectionId: "mcp:one", name: "Search", transport: "http", configured: false }], integrations: [{ integrationId: "integration:one", provider: "github", displayName: "GitHub", state: "action_required" }] };
    let savedConfiguration = "";
    let auditMetadata = "";
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), runtime_id: "runtime:private", configuration: JSON.stringify(configured) }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[runtimeRow()], []];
      if (sql.startsWith("UPDATE account_agents SET configuration")) { savedConfiguration = String(values?.[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("INSERT INTO audit_events")) auditMetadata = String(values?.at(-2));
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.prepareAccountAgentPrivateConfigurationForCredential("credential:owner", "agent:one", 1, "2026-08-13T00:00:00.000Z")).resolves.toEqual({ accountId: "account:one", agentId: "agent:one", runtimeId: "runtime:private", expectedVersion: 1 });
    const result = await store.commitAccountAgentPrivateConfigurationSummaryForCredential("credential:owner", "agent:one", 1, { environmentVariableNames: ["PRIVATE_TOKEN"], configuredMcpConnectionIds: ["mcp:one"], configuredIntegrationIds: ["integration:one"], updatedAt: "2026-08-13T00:00:01.000Z" }, "2026-08-13T00:00:01.000Z");
    expect(result).toMatchObject({ version: 2, configuration: { environmentVariableNames: ["PRIVATE_TOKEN"], mcpConnections: [{ connectionId: "mcp:one", configured: true }], integrations: [{ integrationId: "integration:one", state: "configured" }] } });
    expect(savedConfiguration).not.toMatch(/secret-value|mcp-secret|credential-value/iu);
    expect(auditMetadata).not.toMatch(/PRIVATE_TOKEN|secret|token/iu);
  });

  it("rejects unsupported integrations and every update to an archived Agent without mutation", async () => {
    const create = (archived: boolean) => {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      let updated = false;
      const connection = transactionConnection(async (sql) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
        if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), runtime_id: "runtime:private", archived_at: archived ? "2026-08-13T00:00:00.000Z" : null, archived_by_user_id: archived ? "human:owner" : null }], []];
        if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
        if (sql.startsWith("SELECT * FROM account_runtimes")) return [[{ ...runtimeRow(), owner_user_id: "human:owner", capabilities: JSON.stringify({ ...JSON.parse(runtimeRow().capabilities), supportsMcpConfiguration: true, integrationProviders: ["slack"] }) }], []];
        if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
        if (sql.startsWith("UPDATE account_agents")) updated = true;
        return [{ affectedRows: 1 }, []];
      });
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      return { store, wasUpdated: () => updated };
    };
    const unsupported = create(false);
    await expect(unsupported.store.updateAccountAgentForCredential("credential:owner", "agent:one", { name: "Agent", description: "", runtimeId: "runtime:private", permissionMode: "private", configuration: { ...configuration, integrations: [{ integrationId: "integration:github", provider: "github", displayName: "GitHub", state: "configured" }] }, expectedVersion: 1 }, "2026-08-13T00:01:00.000Z")).rejects.toThrow("runtime-integration-unsupported");
    expect(unsupported.wasUpdated()).toBe(false);
    const archived = create(true);
    await expect(archived.store.updateAccountAgentForCredential("credential:owner", "agent:one", { name: "Agent", description: "", runtimeId: "runtime:private", permissionMode: "private", configuration, expectedVersion: 1 }, "2026-08-13T00:01:00.000Z")).rejects.toThrow("account-agent-not-found");
    expect(archived.wasUpdated()).toBe(false);
  });

  it("rejects binding an Agent to another Human's private Runtime", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:member", role: "member" }], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[runtimeRow()], []];
      if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.createAccountAgentForCredential("credential:member", { name: "Denied", description: "", runtimeId: "runtime:private", permissionMode: "private", configuration }, "2026-08-13T00:00:00.000Z")).rejects.toThrow("runtime-owner-denied");
  });

  it("archives only idle Agents and restores without deleting history when the Runtime disappeared", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let archived = false;
    let activeTasks = 1;
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[{ ...agentRow("agent:one", "human:owner", "private"), runtime_id: "runtime:gone", version: archived ? 2 : 1, archived_at: archived ? "2026-08-13T00:01:00.000Z" : null, archived_by_user_id: archived ? "human:owner" : null }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.includes("COUNT(*) AS count FROM task_metadata")) return [[{ count: activeTasks }], []];
      if (sql.startsWith("UPDATE account_agents SET archived_at")) { archived = true; return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[], []];
      if (sql.startsWith("UPDATE account_agents SET runtime_id")) { archived = false; return [{ affectedRows: 1 }, []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.archiveAccountAgentForCredential("credential:owner", "agent:one", 1, "2026-08-13T00:01:00.000Z")).rejects.toThrow("agent-active-work-required");
    activeTasks = 0;
    await expect(store.archiveAccountAgentForCredential("credential:owner", "agent:one", 1, "2026-08-13T00:01:00.000Z")).resolves.toMatchObject({ agentId: "agent:one", archivedAt: "2026-08-13T00:01:00.000Z", version: 2 });
    const restored = await store.restoreAccountAgentForCredential("credential:owner", "agent:one", 2, "2026-08-13T00:02:00.000Z");
    expect(restored).toMatchObject({ needsRuntime: true, agent: { agentId: "agent:one", version: 3 } });
    expect(restored.agent).not.toHaveProperty("runtimeId");
    expect(restored.agent).not.toHaveProperty("archivedAt");
  });

  it("uses Human friendship authorization across Accounts and rechecks it after revocation", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let friendshipActive = true;
    let insertedTaskValues: readonly unknown[] = [];
    const executableRow = { ...agentRow("agent:shared", "human:owner", "friends"), runtime_id: "runtime:shared" };
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:member", user_id: "human:member", role: "owner" }], []];
      if (sql.includes("SELECT a.* FROM account_agents a")) return [[executableRow, agentRow("agent:private", "human:owner", "private")], []];
      if (sql.startsWith("SELECT * FROM account_agents")) return [[executableRow], []];
      if (sql.includes("FROM human_friendships")) return [friendshipActive ? [{ friend_user_id: "human:owner" }] : [], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[{ ...runtimeRow(), runtime_id: "runtime:shared", visibility: "private", owner_user_id: "human:owner" }], []];
      if (sql.includes("INSERT INTO account_agent_a2a_tasks")) { insertedTaskValues = values ?? []; return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("SELECT * FROM account_agent_a2a_tasks")) return [[{ task_id: "task:one", account_id: "account:one", agent_id: "agent:shared", origin_user_id: "human:member", origin_account_id: "account:member", origin_credential_id: "credential:member", state: "completed", created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:01.000Z" }], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, execute: connection.execute, end: async () => undefined } });

    const discovered = await store.listInvokableAccountAgentsForCredential("credential:member", undefined, "2026-08-13T00:00:00.000Z");
    expect(discovered.map((item) => item.agent.agentId)).toEqual(["agent:shared"]);
    expect(discovered[0]).toMatchObject({ accessScope: "friend", runtime: { runtimeId: "runtime:shared", health: "ready" } });
    await store.createAccountA2ATaskForCredential("credential:member", "agent:shared", "task:one", "submitted", "2026-08-13T00:00:00.000Z");
    expect(insertedTaskValues).toEqual(["task:one", "account:one", "agent:shared", "human:member", "account:member", "credential:member", "submitted", expect.any(Date), expect.any(Date)]);
    await expect(store.getReadableAccountA2ATaskRouteForCredential("credential:member", "task:one", "2026-08-13T00:00:01.000Z")).resolves.toMatchObject({ agentId: "agent:shared", originCredentialId: "credential:member" });
    friendshipActive = false;
    await expect(store.getReadableAccountA2ATaskRouteForCredential("credential:member", "task:one", "2026-08-13T00:00:02.000Z")).rejects.toThrow("account-task-not-found");
  });

  it("issues an owner-only short-lived self-test credential bounded to one exact Agent and revokes every authority row", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let issuedCredentialId = "";
    let issuedPrincipalId = "";
    let selfTestId = "";
    const revokedTables: string[] = [];
    const execute = async (sql: string, values?: readonly unknown[]) => {
      if (sql.includes("FROM account_sessions")) {
        const credentialId = String(values?.[1]);
        return credentialId === "credential:self-test"
          ? [[{ account_id: "account:one", user_id: "human:owner", role: "owner", credential_scopes: JSON.stringify(["account:self-test"]) }], []]
          : [[{ account_id: "account:one", user_id: "human:owner", role: "owner", credential_scopes: JSON.stringify(["account:access"]) }], []];
      }
      if (sql.includes("SELECT agent_id FROM account_agent_self_tests")) return [[{ agent_id: "agent:one" }], []];
      if (sql.startsWith("SELECT * FROM account_agents")) {
        const requested = String(values?.[1]);
        return [[{ ...agentRow(requested, "human:owner", "private"), runtime_id: "runtime:one" }], []];
      }
      if (sql.includes("SELECT a.* FROM account_agents a")) return [[{ ...agentRow("agent:one", "human:owner", "private"), runtime_id: "runtime:one" }, { ...agentRow("agent:other", "human:owner", "private"), runtime_id: "runtime:one" }], []];
      if (sql.startsWith("SELECT agent_id,target_type")) return [[], []];
      if (sql.startsWith("SELECT * FROM account_runtimes")) return [[{ ...runtimeRow(), runtime_id: "runtime:one", owner_user_id: "human:owner" }], []];
      if (sql.startsWith("INSERT INTO principals")) { issuedPrincipalId = String(values?.[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("INSERT INTO credentials")) { issuedCredentialId = String(values?.[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("INSERT INTO account_agent_self_tests")) { selfTestId = String(values?.[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("SELECT * FROM account_agent_self_tests")) return [[{ self_test_id: selfTestId, account_id: "account:one", agent_id: "agent:one", created_by_user_id: "human:owner", requester_principal_id: issuedPrincipalId, requester_credential_id: issuedCredentialId, created_at: "2026-08-13T00:00:00.000Z", expires_at: "2026-08-13T00:10:00.000Z", revoked_at: null }], []];
      if (sql.startsWith("UPDATE account_agent_self_tests")) revokedTables.push("self-test");
      if (sql.startsWith("UPDATE credentials")) revokedTables.push("credential");
      if (sql.startsWith("UPDATE account_sessions")) revokedTables.push("session");
      if (sql.startsWith("UPDATE principals")) revokedTables.push("principal");
      return [{ affectedRows: 1 }, []];
    };
    const connection = { beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined, execute, query: async (sql: string, values?: readonly unknown[]) => sql.startsWith("SELECT instance_id") ? [[{ instance_id: "instance:one" }], []] : execute(sql, values) };
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const created = await store.createAccountSelfTestForCredential("credential:owner", "agent:one", { audience: "https://fabric.example", expiresAt: "2026-08-13T00:10:00.000Z" }, "2026-08-13T00:00:00.000Z");
    expect(created).toMatchObject({ accountId: "account:one", agentId: "agent:one", requester: { credentialId: issuedCredentialId, principalId: issuedPrincipalId, expiresAt: "2026-08-13T00:10:00.000Z" } });
    expect(created.requester.token).toBeTruthy();
    const discovered = await store.listInvokableAccountAgentsForCredential("credential:self-test", undefined, "2026-08-13T00:01:00.000Z");
    expect(discovered.map((item) => item.agent.agentId)).toEqual(["agent:one"]);
    expect(discovered[0]?.accessScope).toBe("owner");
    await expect(store.listAccountAgentsForCredential("credential:self-test", { scope: "mine", limit: 10 }, "2026-08-13T00:01:00.000Z")).rejects.toThrow("account-session-unavailable");
    await expect(store.revokeAccountSelfTestForCredential("credential:owner", created.selfTestId, "2026-08-13T00:02:00.000Z")).resolves.toEqual({ selfTestId: created.selfTestId, status: "revoked" });
    expect(revokedTables).toEqual(["self-test", "credential", "session", "principal"]);
  });

  it("rejects unbound and archived Agents before Account A2A Runtime delivery", async () => {
    const create = (row: Record<string, unknown>) => {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      const connection = transactionConnection(async (sql) => {
        if (sql.includes("FROM account_sessions")) return [[{ account_id: "account:one", user_id: "human:owner", role: "owner" }], []];
        if (sql.startsWith("SELECT * FROM account_agents")) return [[row], []];
        if (sql.includes("FROM human_friendships")) return [[], []];
        return [{ affectedRows: 1 }, []];
      });
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      return store;
    };
    await expect(create(agentRow("agent:unbound", "human:owner", "private")).getInvokableAccountAgentForCredential("credential:owner", "agent:unbound", "2026-08-13T00:00:00.000Z")).rejects.toThrow("account-agent-not-found");
    await expect(create({ ...agentRow("agent:archived", "human:owner", "private"), runtime_id: "runtime:one", archived_at: "2026-08-13T00:00:00.000Z", archived_by_user_id: "human:owner" }).getInvokableAccountAgentForCredential("credential:owner", "agent:archived", "2026-08-13T00:00:01.000Z")).rejects.toThrow("account-agent-not-found");
  });
});

function agentRow(agent_id: string, owner_user_id: string, permission_mode: "private" | "friends") {
  return { agent_id, account_id: "account:one", owner_user_id, runtime_id: null, name: agent_id, description: "", avatar_url: null, permission_mode, configuration: JSON.stringify(configuration), version: 1, archived_at: null, archived_by_user_id: null, created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z" };
}

function runtimeRow() {
  return {
    runtime_id: "runtime:private", account_id: "account:one", owner_user_id: "human:other", provider: "codex", adapter_id: "codex-acp", name: "Private Codex", visibility: "private", health: "ready",
    capabilities: JSON.stringify({ supportsModelSelection: false, supportsThinkingLevel: false, supportsServiceTier: false, supportsSkills: false, supportsMcpConfiguration: false, supportsEnvironment: false, supportsCustomArguments: false, supportsRuntimeConfiguration: false, supportsCancellation: true, maxConcurrentAgents: 4 }),
    version: 1, last_checked_at: "2026-08-13T00:00:00.000Z", created_at: "2026-08-13T00:00:00.000Z", updated_at: "2026-08-13T00:00:00.000Z",
  };
}

function catalogProjectionRow(agentId: string, options: { runtime?: ReturnType<typeof runtimeRow>; runCount?: number; lastActiveAt?: string; queued: number; working: number }) {
  const runtime = options.runtime;
  return {
    ...agentRow(agentId, "human:owner", "private"), runtime_id: runtime?.runtime_id ?? null,
    owner_membership_id: "membership:owner", owner_email: "owner@example.com", owner_role: "owner", owner_version: 1,
    owner_joined_at: "2026-08-13T00:00:00.000Z", owner_updated_at: "2026-08-13T00:00:00.000Z", owner_display_name: "Owner",
    joined_runtime_id: runtime?.runtime_id ?? null, runtime_owner_user_id: runtime?.owner_user_id ?? null, runtime_provider: runtime?.provider ?? null,
    runtime_adapter_id: runtime?.adapter_id ?? null, runtime_name: runtime?.name ?? null, runtime_visibility: runtime?.visibility ?? null,
    runtime_health: runtime?.health ?? null, runtime_capabilities: runtime?.capabilities ?? null, runtime_version: runtime?.version ?? null,
    runtime_last_checked_at: runtime?.last_checked_at ?? null, runtime_created_at: runtime?.created_at ?? null, runtime_updated_at: runtime?.updated_at ?? null,
    queued_tasks: options.queued, working_tasks: options.working, run_count_30d: options.runCount ?? null, last_active_at: options.lastActiveAt ?? null,
  };
}

function transactionConnection(execute: (sql: string, values?: readonly unknown[]) => Promise<unknown>) {
  return { beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined, execute };
}
