import { describe, expect, it } from "vitest";

import { MySqlStore } from "./store.js";

const now = "2026-08-13T00:00:00.000Z";
const configuration = { instructions: "Review carefully.", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] };
const capabilities = { supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: true, supportsSkills: true, supportsMcpConfiguration: true, supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true, supportsCancellation: true, maxConcurrentAgents: 4 };

describe("Account Agent creation persistence", () => {
  it("creates a private recoverable draft for any active Account member", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let inserted: readonly unknown[] = [];
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.includes("INSERT INTO agent_builder_drafts")) inserted = values ?? [];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const draft = await store.createAccountAgentDraftForCredential("credential:member", { mode: "blank" }, now);
    expect(draft).toMatchObject({ accountId: "account:one", ownerUserId: "human:member", mode: "blank", name: "", permissionMode: "private", pendingUserText: "", state: "active", version: 1 });
    expect(inserted).not.toEqual(expect.arrayContaining(["credential:member"]));
  });

  it("returns a recoverable validation result when the selected Runtime disappeared", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const draft = draftValue("blank");
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.includes("FROM agent_builder_drafts")) return [[draftRow(draft)], []];
      if (sql.includes("FROM account_runtimes")) return [[], []];
      if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.validateAccountAgentDraftForCredential("credential:member", draft.draftId, now)).resolves.toEqual({ valid: false, fieldErrors: [{ field: "runtimeId", code: "runtime-required" }] });
  });

  it("imports template Skills and resolves a retried idempotency key to exactly one Agent", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const draft = draftValue("template");
    let createdDraftRow: ReturnType<typeof draftRow> | undefined;
    let createdAgentRow: Record<string, unknown> | undefined;
    let agentInsertCount = 0;
    let skillInsertCount = 0;
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.startsWith("SELECT * FROM agent_builder_drafts WHERE account_id=? AND create_idempotency_key=?")) return [createdDraftRow ? [createdDraftRow] : [], []];
      if (sql.includes("FROM agent_builder_drafts") && sql.includes("draft_id=?")) return [[createdDraftRow ?? draftRow(draft)], []];
      if (sql.includes("SELECT * FROM account_runtimes")) return [[runtimeRow()], []];
      if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
      if (sql.includes("INSERT INTO account_skills")) { skillInsertCount += 1; return [{ affectedRows: 1 }, []]; }
      if (sql.includes("SELECT skill_id AS instance_id")) return [[{ instance_id: "skill:template-code-review" }], []];
      if (sql.includes("SELECT skill_id,origin,runtime_id")) return [[{ skill_id: "skill:template-code-review", origin: "account", runtime_id: null }], []];
      if (sql.includes("INSERT INTO account_agents")) {
        agentInsertCount += 1;
        createdAgentRow = {
          agent_id: values?.[0], account_id: values?.[1], owner_user_id: values?.[2], runtime_id: values?.[3], name: values?.[4], description: values?.[5], avatar_url: values?.[6], permission_mode: values?.[7], configuration: values?.[8], version: 1,
          archived_at: null, archived_by_user_id: null, created_at: now, updated_at: now,
        };
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("UPDATE agent_builder_drafts SET state='created'")) {
        const createdDraft = JSON.parse(String(values?.[0]));
        createdDraftRow = draftRow(createdDraft, { created_agent_id: String(values?.[1]), create_idempotency_key: String(values?.[2]), state: "created", version: 2 });
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("SELECT * FROM account_agents")) return [[createdAgentRow], []];
      if (sql.includes("SELECT agent_id,target_type,target_user_id")) return [[], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const command = { draftId: draft.draftId, expectedVersion: 1, idempotencyKey: "create:0123456789abcdef" };
    const first = await store.createAccountAgentFromDraftForCredential("credential:member", command, now);
    const retry = await store.createAccountAgentFromDraftForCredential("credential:member", command, now);
    expect(first).toMatchObject({ status: "created", agent: { name: "Code reviewer", configuration: { skillIds: ["skill:template-code-review"] } } });
    expect(retry).toMatchObject({ status: "created", agent: { agentId: (first as { agent: { agentId: string } }).agent.agentId } });
    expect(agentInsertCount).toBe(1);
    expect(skillInsertCount).toBe(1);
  });

  it("rolls back the whole template transaction when a referenced Skill cannot resolve", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const draft = draftValue("template");
    let rolledBack = false;
    let insertedAgent = false;
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => { rolledBack = true; },
      release: () => undefined,
      execute: async (sql: string) => {
        if (sql.includes("FROM account_sessions")) return [[actor()], []];
        if (sql.includes("FROM agent_builder_drafts") && sql.includes("draft_id=?")) return [[draftRow(draft)], []];
        if (sql.includes("create_idempotency_key=?")) return [[], []];
        if (sql.includes("SELECT * FROM account_runtimes")) return [[runtimeRow()], []];
        if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
        if (sql.includes("SELECT skill_id AS instance_id")) return [[], []];
        if (sql.includes("INSERT INTO account_agents")) insertedAgent = true;
        return [{ affectedRows: 1 }, []];
      },
    };
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.createAccountAgentFromDraftForCredential("credential:member", { draftId: draft.draftId, expectedVersion: 1, idempotencyKey: "create:fedcba9876543210" }, now)).rejects.toThrow("agent-template-skill-import-failed");
    expect(rolledBack).toBe(true);
    expect(insertedAgent).toBe(false);
  });

  it("records a stale Builder proposal without overwriting newer user edits", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const aiDraft = {
      ...draftValue("blank"), mode: "ai", name: "Newer user name", version: 3,
      builderSession: { state: "in_flight", inFlight: { turnId: "builder-turn:one", baseDraftVersion: 2, startedAt: now }, conversation: [{ messageId: "builder-message:user", role: "user", text: "make it better", createdAt: now }] },
    } as const;
    let saved: Record<string, unknown> | undefined;
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.includes("FROM agent_builder_drafts")) return [[draftRow(aiDraft)], []];
      if (sql.includes("UPDATE agent_builder_drafts SET state=?")) { saved = JSON.parse(String(values?.[1])); return [{ affectedRows: 1 }, []]; }
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const result = await store.completeAccountAgentBuilderTurnForCredential("credential:member", aiDraft.draftId, {
      turnId: "builder-turn:one", assistantText: "old proposal", proposal: { name: "Old assistant name", description: "old", instructions: "old" },
    }, "2026-08-13T00:01:00.000Z");
    expect(result.name).toBe("Newer user name");
    expect(result.builderSession).toMatchObject({ state: "idle", recoverableErrorCode: "builder-proposal-stale" });
    expect(result.builderSession?.conversation.at(-1)).toMatchObject({ role: "assistant", text: "old proposal" });
    expect(saved?.name).toBe("Newer user name");
  });

  it("applies a current Builder proposal and records the exact applied draft version", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const aiDraft = {
      ...draftValue("blank"), mode: "ai", version: 2,
      builderSession: { state: "in_flight", inFlight: { turnId: "builder-turn:one", baseDraftVersion: 2, startedAt: now }, conversation: [] },
    } as const;
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.includes("FROM agent_builder_drafts")) return [[draftRow(aiDraft)], []];
      if (sql.includes("FROM account_runtimes")) return [[runtimeRow()], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const result = await store.completeAccountAgentBuilderTurnForCredential("credential:member", aiDraft.draftId, {
      turnId: "builder-turn:one", assistantText: "proposal", proposal: { name: "Applied Agent", description: "new", instructions: "new instructions" },
    }, "2026-08-13T00:01:00.000Z");
    expect(result).toMatchObject({ name: "Applied Agent", version: 3, configuration: { instructions: "new instructions" }, builderSession: { state: "idle", lastAppliedProposal: { draftVersion: 3 } } });
    expect(result.builderSession).not.toHaveProperty("recoverableErrorCode");
  });

  it("runs the shared bind gate on Builder Runtime switch and resets incompatible model options", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const aiDraft = { ...draftValue("blank"), mode: "ai", runtimeId: "runtime:one", configuration: { ...configuration, model: "old-model", thinkingLevel: "high" }, builderSession: { state: "idle", conversation: [] } } as const;
    let saved: Record<string, unknown> | undefined;
    const targetRuntime = { ...runtimeRow(), runtime_id: "runtime:two", owner_user_id: "human:member", visibility: "private", capabilities: JSON.stringify({ ...capabilities, supportsModelSelection: false, supportsThinkingLevel: false }) };
    const connection = transactionConnection(async (sql, values) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.includes("FROM agent_builder_drafts")) return [[draftRow(aiDraft)], []];
      if (sql.includes("FROM account_runtimes")) return [[targetRuntime], []];
      if (sql.includes("COUNT(*) AS count FROM account_agents")) return [[{ count: 0 }], []];
      if (sql.includes("UPDATE agent_builder_drafts SET state=?")) { saved = JSON.parse(String(values?.[1])); return [{ affectedRows: 1 }, []]; }
      return [[], []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    const result = await store.saveAccountAgentDraftForCredential("credential:member", aiDraft.draftId, {
      name: aiDraft.name, description: aiDraft.description, runtimeId: "runtime:two", permissionMode: "private", configuration: aiDraft.configuration, pendingUserText: "unsent", expectedVersion: 1,
    }, "2026-08-13T00:01:00.000Z");
    expect(result.runtimeId).toBe("runtime:two");
    expect(result.configuration).not.toHaveProperty("model");
    expect(result.configuration).not.toHaveProperty("thinkingLevel");
    expect(saved?.pendingUserText).toBe("unsent");
  });

  it("rejects a Builder Runtime switch while a turn is in flight", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const aiDraft = { ...draftValue("blank"), mode: "ai", builderSession: { state: "in_flight", inFlight: { turnId: "builder-turn:one", baseDraftVersion: 1, startedAt: now }, conversation: [] } } as const;
    const connection = transactionConnection(async (sql) => {
      if (sql.includes("FROM account_sessions")) return [[actor()], []];
      if (sql.includes("FROM agent_builder_drafts")) return [[draftRow(aiDraft)], []];
      return [{ affectedRows: 1 }, []];
    });
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.saveAccountAgentDraftForCredential("credential:member", aiDraft.draftId, {
      name: aiDraft.name, description: aiDraft.description, runtimeId: "runtime:two", permissionMode: "private", configuration: aiDraft.configuration, pendingUserText: "new edit", expectedVersion: 1,
    }, now)).rejects.toThrow("agent-builder-turn-in-flight");
  });
});

function actor() { return { account_id: "account:one", user_id: "human:member", role: "member" }; }
function draftValue(mode: "blank" | "template") {
  return {
    draftId: "draft:one", accountId: "account:one", ownerUserId: "human:member", mode, ...(mode === "template" ? { templateId: "template:code-reviewer", name: "Code reviewer" } : { name: "Manual Agent" }),
    description: "", runtimeId: "runtime:one", permissionMode: "private", configuration, pendingUserText: "",
    state: "active", createdAt: now, updatedAt: now, expiresAt: "2026-08-20T00:00:00.000Z", version: 1,
  } as const;
}
function draftRow(draft: ReturnType<typeof draftValue> | Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return { draft_id: "draft:one", account_id: "account:one", owner_user_id: "human:member", mode: draft.mode, template_id: "templateId" in draft ? draft.templateId : null, state: draft.state, draft: JSON.stringify(draft), created_agent_id: null, create_idempotency_key: null, version: draft.version, expires_at: draft.expiresAt, created_at: now, updated_at: now, ...overrides };
}
function runtimeRow() { return { runtime_id: "runtime:one", account_id: "account:one", owner_user_id: "human:member", provider: "codex", adapter_id: "codex-acp", name: "Codex", visibility: "private", health: "ready", capabilities: JSON.stringify(capabilities), version: 1, last_checked_at: now, created_at: now, updated_at: now }; }
function transactionConnection(execute: (sql: string, values?: readonly unknown[]) => Promise<unknown>) { return { beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined, execute }; }
