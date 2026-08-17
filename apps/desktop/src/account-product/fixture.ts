import { agentDetailProjectionSchema, runtimeSchema } from "@agent-fabric/account-agent-domain";
import { accountProductRendererCommandResultSchema, accountProductRendererSnapshotSchema, agentCreationSessionSchema, type AccountProductRendererCommand, type AccountProductRendererSnapshot } from "./ipc.js";
import type { AccountProductBridge } from "./app.js";

const at = "2026-08-13T08:30:00.000Z";
const accountId = "account:agent-fabric";
const owner = { userId: "human:owner", displayName: "Nick Chen", email: "nick@example.com" } as const;
const friendHuman = { userId: "human:friend", displayName: "Ami Lin", email: "ami@example.com" } as const;
const capabilities = { supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: true, supportsSkills: true, supportsMcpConfiguration: true, supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true, supportsCancellation: true, maxConcurrentAgents: 8, modelCatalog: [{ model: "gpt-5.6-codex", displayName: "GPT-5.6 Codex", thinkingLevels: ["low", "medium", "high"], serviceTiers: ["default", "priority"] }] } as const;
const runtime = runtimeSchema.parse({ runtimeId: "runtime:macbook", accountId, ownerUserId: owner.userId, provider: "codex", adapterId: "codex-acp", name: "Nick 的 Mac", visibility: "private", health: "ready", capabilities, lastCheckedAt: at, createdAt: at, updatedAt: at, version: 3 });
const configuration = { instructions: "分析好友的问题，先确认事实，再给出简洁、可执行的回答。", model: "gpt-5.6-codex", thinkingLevel: "high", serviceTier: "priority", maxConcurrentTasks: 6, skillIds: ["skill:research"], disabledRuntimeSkillIds: [], environmentVariableNames: ["SEARCH_SCOPE"], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] } as const;
const agents = [
  { id: "agent:helper", name: "Agent Fabric Helper", description: "回答产品、架构和当前实现相关问题。", status: "online", runtime, owner, access: "owner", runs: 42, active: at, version: 5 },
  { id: "agent:reviewer", name: "Release Reviewer", description: "检查发布风险、测试证据和回滚条件。", status: "offline", runtime: { ...runtime, runtimeId: "runtime:review", name: "Review Mac", health: "offline", version: 1 }, owner, access: "owner", runs: 7, active: "2026-08-12T05:20:00.000Z", version: 2 },
  { id: "agent:unbound", name: "Knowledge Curator", description: "整理团队知识并生成来源清晰的摘要。", status: "needs_runtime", runtime: undefined, owner, access: "owner", runs: undefined, active: undefined, version: 1 },
] as const;

const catalogRows: NonNullable<AccountProductRendererSnapshot["catalog"]>["rows"] = agents.map((item) => ({
  agent: { agentId: item.id, accountId, ownerUserId: item.owner.userId, name: item.name, description: item.description, ...(item.runtime ? { runtimeId: item.runtime.runtimeId } : {}), permissionMode: item.id === "agent:helper" ? "friends" : "private", model: configuration.model, createdAt: at, updatedAt: item.active ?? at, version: item.version },
  owner: item.owner, effectiveAccess: item.access, status: item.status, ...(item.runtime ? { runtime: item.runtime } : {}), workload: { accountId, agentId: item.id, queuedTasks: 0, workingTasks: item.status === "online" ? 1 : 0, observedAt: at }, ...(item.runs === undefined ? {} : { runCount30d: item.runs }), ...(item.active ? { lastActiveAt: item.active } : {}),
}));
const friendCatalogRows: NonNullable<AccountProductRendererSnapshot["catalog"]>["rows"] = [{
  kind: "friend", agentId: "agent:ami-research", name: "Ami Research Agent", description: "整理好友开放的公开资料。",
  owner: { userId: friendHuman.userId, displayName: friendHuman.displayName }, capabilitySummary: ["网页检索", "资料总结"],
  availability: "online", effectiveAccess: "friend", updatedAt: at,
}];

const detail = agentDetailProjectionSchema.parse({
  identity: { agentId: agents[0].id, accountId, ownerUserId: owner.userId, name: agents[0].name, description: agents[0].description, runtimeId: runtime.runtimeId, createdAt: at, updatedAt: at, version: agents[0].version },
  access: { canManage: true, canInvoke: true, effectiveAccess: "owner", permissionMode: "friends" },
  configuration: { instructions: configuration.instructions, model: configuration.model, thinkingLevel: configuration.thinkingLevel, serviceTier: configuration.serviceTier, maxConcurrentTasks: configuration.maxConcurrentTasks, skillIds: configuration.skillIds, disabledRuntimeSkillIds: [], environment: { configuredCount: 1, redacted: true }, customArguments: { configuredCount: 0, redacted: true }, runtimeConfiguration: { configured: false, redacted: true }, mcpConnections: [], integrations: [] },
  runtime, sections: ["overview", "activity", "capabilities", "settings"], etag: '"agent:5"',
});

const base = accountProductRendererSnapshotSchema.parse({
  session: { state: "signed-in", accountId, accountName: "Agent Fabric", userId: owner.userId, displayName: owner.displayName, email: owner.email, expiresAt: "2026-09-13T08:30:00.000Z" },
  route: { name: "agents" }, connection: "online", localServices: { runtime: { state: "ready", runtimeId: runtime.runtimeId }, mcp: { state: "ready" } },
  catalog: { accountId, scope: "mine", rows: catalogRows, counts: { mine: 3, friends: 1, archived: 1 } },
  activities: [{ activityId: "activity:one", accountId, agentId: agents[0].id, taskId: "task:customer-question", terminalState: "completed", startedAt: "2026-08-13T08:28:50.000Z", completedAt: at, durationMs: 70_000 }],
  skills: { agentId: agents[0].id, agentVersion: 5, runtimeDiscovery: { state: "ready", retryable: false }, skills: [{ skill: { skillId: "skill:research", accountId, name: "Evidence research", description: "收集并区分事实与推断。", origin: "account", createdAt: at, updatedAt: at, version: 1 }, attached: true, enabled: true, available: true }] },
  templates: [{ templateId: "template:research-assistant", name: "研究助手", description: "把来源整理成简洁结论。", instructions: "研究问题并区分证据与推断。", skillReferences: [{ key: "web-research", name: "Web research", description: "收集公开来源。" }] }, { templateId: "template:code-reviewer", name: "代码审查", description: "检查正确性、安全性和可维护性。", instructions: "先给出可执行问题。", skillReferences: [] }],
  runtimes: [runtime, agents[1].runtime], runtimeDetail: undefined,
  friends: [{ friendshipId: "friendship:ami", friend: friendHuman, since: at, relationshipVersion: 1 }],
  incomingFriendInvitations: [{ direction: "incoming", invitation: { invitationId: "friend-invitation:incoming", inviterUserId: friendHuman.userId, recipientEmail: owner.email, recipientUserId: owner.userId, status: "pending", createdAt: at, expiresAt: "2026-08-20T08:30:00.000Z", version: 1 }, otherHuman: friendHuman }],
  outgoingFriendInvitations: [{ direction: "outgoing", invitation: { invitationId: "friend-invitation:outgoing", inviterUserId: owner.userId, recipientEmail: "new.friend@example.com", status: "pending", createdAt: at, expiresAt: "2026-08-20T08:30:00.000Z", version: 1 } }],
  legacyRecovery: { state: "not_required" }, loading: false, refreshing: false,
});

const runtimeDeletionImpact: NonNullable<AccountProductRendererSnapshot["runtimeDeletionImpact"]> = {
  planId: "plan:runtime-delete", accountId, runtimeId: runtime.runtimeId, expectedRuntimeVersion: runtime.version,
  boundAgentIds: [agents[0].id], activeAgentIds: [agents[0].id], expiresAt: "2026-08-13T08:45:00.000Z",
};

export function createAccountProductFixtureBridge(initialRoute = "agents", onCommand?: (command: AccountProductRendererCommand) => void): AccountProductBridge {
  let snapshot = withRoute(base, initialRoute);
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async command(command) {
      onCommand?.(command);
      snapshot = fixtureCommand(snapshot, command);
      accountProductRendererCommandResultSchema.parse({ type: "snapshot", snapshot });
      emit();
    },
  };
}

function fixtureCommand(current: AccountProductRendererSnapshot, command: AccountProductRendererCommand): AccountProductRendererSnapshot {
  switch (command.type) {
    case "navigate": return {
      ...current, route: command.route, detail: command.route.name === "agent-detail" ? detail : current.detail,
      ...(command.route.name === "runtimes" ? { runtimeDetail: undefined, runtimeDeletionImpact: undefined } : {}),
    };
    case "catalog-query": return { ...current, route: { name: "agents" }, catalog: current.catalog ? { ...current.catalog, scope: command.query.scope, rows: command.query.scope === "friends" ? [...friendCatalogRows] : catalogRows } : current.catalog };
    case "agent-open": return { ...current, route: { name: "agent-detail", agentId: command.agentId, section: command.section }, detail };
    case "runtime-open": return { ...current, route: { name: "runtime-detail", runtimeId: command.runtimeId }, runtimeDetail: current.runtimes.find((item) => item.runtimeId === command.runtimeId) };
    case "runtime-delete-plan": return { ...current, runtimeDeletionImpact: { ...runtimeDeletionImpact, runtimeId: command.runtimeId } };
    case "creation-start": { const creationSession = creationFixture(command.mode, command.templateId); return { ...current, route: command.mode === "ai" ? { name: "agent-create-ai" } : { name: "agent-create-manual" }, creationSession, creationValidation: undefined }; }
    case "creation-update": return current.creationSession ? { ...current, creationSession: agentCreationSessionSchema.parse({ ...current.creationSession, ...command.update }) } : current;
    case "builder-turn": {
      if (!current.creationSession?.builder) return current;
      const creationSession = agentCreationSessionSchema.parse({
        ...current.creationSession,
        builder: { state: "idle", conversation: [...current.creationSession.builder.conversation, { messageId: `message:${current.creationSession.builder.conversation.length + 1}`, role: "user", text: command.text }, { messageId: `message:${current.creationSession.builder.conversation.length + 2}`, role: "assistant", text: "已更新本地配置预览。" }] },
      });
      return { ...current, creationSession };
    }
    case "creation-submit": return { ...current, route: { name: "agent-detail", agentId: agents[0].id, section: "overview" }, creationSession: undefined, detail };
    case "logout": return { ...current, session: { state: "signed-out", reason: "logged_out" }, route: { name: "agents" } };
    default: return current;
  }
}

function creationFixture(mode: "blank" | "template" | "ai", templateId?: string) {
  return agentCreationSessionSchema.parse({
    mode, ...(templateId ? { templateId } : {}), name: mode === "template" ? "研究助手" : mode === "ai" ? "需求分析助手" : "", description: mode === "template" ? "把来源整理成简洁结论。" : mode === "ai" ? "澄清需求并生成风险清单。" : "", runtimeId: runtime.runtimeId, permissionMode: "private", configuration: { ...configuration, instructions: mode === "blank" ? "" : configuration.instructions }, ...(mode === "ai" ? { builder: { state: "idle", conversation: [{ messageId: "message:builder", role: "assistant", text: "我已经准备好本地会话。这个智能体主要解决什么问题？" }] } } : {}),
  });
}

function unboundBuilderFixture() {
  const { runtimeId: _runtimeId, ...session } = creationFixture("ai");
  void _runtimeId;
  return agentCreationSessionSchema.parse({
    ...session, name: "", description: "",
    configuration: { instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] },
    builder: { state: "idle", conversation: [] },
  });
}

function withRoute(snapshot: AccountProductRendererSnapshot, route: string): AccountProductRendererSnapshot {
  if (route === "login") return { ...snapshot, session: { state: "signed-out", reason: "initial" }, route: { name: "agents" } };
  if (route === "login-incompatible") return { ...snapshot, session: { state: "signed-out", reason: "initial" }, route: { name: "agents" }, errorCode: "http-404" };
  if (route === "login-storage-failed") return { ...snapshot, session: { state: "signed-out", reason: "initial" }, route: { name: "agents" }, errorCode: "login-secure-storage-failed" };
  if (route === "login-pending") return { ...snapshot, session: { state: "signing-in" }, route: { name: "agents" }, loading: true };
  if (route === "create") return fixtureCommand(snapshot, { type: "navigate", route: { name: "agent-create-choice" } });
  if (route === "manual") return fixtureCommand(snapshot, { type: "creation-start", mode: "blank" });
  if (route === "builder") return fixtureCommand(snapshot, { type: "creation-start", mode: "ai" });
  if (route === "builder-unbound") { const creationSession = unboundBuilderFixture(); return { ...snapshot, route: { name: "agent-create-ai" }, creationSession }; }
  if (route === "detail") return { ...snapshot, route: { name: "agent-detail", agentId: agents[0].id, section: "overview" }, detail };
  if (route === "detail-loading") return { ...snapshot, route: { name: "agent-detail", agentId: agents[0].id, section: "overview" }, detail: undefined, activities: [], skills: undefined, agentLoad: { agentId: agents[0].id, detail: "loading", activities: "loading", skills: "loading" } };
  if (route === "detail-capabilities") return { ...snapshot, route: { name: "agent-detail", agentId: agents[0].id, section: "capabilities" }, detail };
  if (route === "detail-settings") return { ...snapshot, route: { name: "agent-detail", agentId: agents[0].id, section: "settings" }, detail };
  if (route === "runtimes") return { ...snapshot, route: { name: "runtimes" } };
  if (route === "runtime-detail") return { ...snapshot, route: { name: "runtime-detail", runtimeId: runtime.runtimeId }, runtimeDetail: runtime };
  if (route === "runtime-auth") {
    const authenticationRequired = runtimeSchema.parse({ ...runtime, health: "auth_required" });
    return { ...snapshot, route: { name: "runtime-detail", runtimeId: runtime.runtimeId }, runtimes: [authenticationRequired, agents[1].runtime], runtimeDetail: authenticationRequired };
  }
  if (route === "runtime-impact") return { ...snapshot, route: { name: "runtime-detail", runtimeId: runtime.runtimeId }, runtimeDetail: runtime, runtimeDeletionImpact };
  if (route === "friends") return { ...snapshot, route: { name: "friends" } };
  if (route === "agents-friends") return { ...snapshot, route: { name: "agents" }, catalog: { accountId, scope: "friends", rows: [...friendCatalogRows], counts: { mine: 3, friends: 1, archived: 1 } } };
  if (route === "agents-loading") return { ...snapshot, route: { name: "agents" }, catalog: undefined, errorCode: undefined };
  if (route === "agents-empty") return { ...snapshot, route: { name: "agents" }, catalog: { accountId, scope: "mine", rows: [], counts: { mine: 0, friends: 0, archived: 0 } } };
  if (route === "agents-error") return { ...snapshot, route: { name: "agents" }, catalog: undefined, errorCode: "account-agent-catalog-unavailable" };
  return snapshot;
}
