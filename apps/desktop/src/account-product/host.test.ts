import { describe, expect, it, vi } from "vitest";

import { AccountProductHost, type AccountProductAuthenticatedSession, type AccountProductAuthenticationPort } from "./host.js";

const at = "2026-08-13T00:00:00.000Z";

function authenticated() {
  const friend = { friendshipId: "friendship:one", friend: { userId: "human:friend", displayName: "Friend", email: "friend@example.com" }, since: at, relationshipVersion: 1 } as const;
  const invitation = { direction: "outgoing", invitation: { invitationId: "friend-invitation:one", inviterUserId: "human:owner", recipientEmail: "friend@example.com", status: "pending", createdAt: at, expiresAt: "2026-08-20T00:00:00.000Z", version: 1 } } as const;
  const client = {
    listAgentCatalog: vi.fn().mockResolvedValue({ accountId: "account:one", scope: "mine", rows: [], counts: { mine: 0, friends: 0, archived: 0 } }),
    listAccountRuntimes: vi.fn().mockResolvedValue([]),
    listFriends: vi.fn().mockResolvedValue([friend]),
    listIncomingFriendInvitations: vi.fn().mockResolvedValue([]),
    listOutgoingFriendInvitations: vi.fn().mockResolvedValue([]),
    listAgentTemplates: vi.fn().mockResolvedValue([]),
    getLegacyAgentMigrationRecovery: vi.fn().mockResolvedValue({ state: "not_required" }),
    completeLegacyAgentMigrationRecovery: vi.fn().mockResolvedValue({ state: "completed", backupId: "backup:one", importedAgentId: "agent:legacy", acknowledgedAt: at }),
    createFriendInvitation: vi.fn().mockResolvedValue(invitation),
    acceptFriendInvitation: vi.fn().mockResolvedValue(undefined),
    rejectFriendInvitation: vi.fn().mockResolvedValue(undefined),
    revokeFriendInvitation: vi.fn().mockResolvedValue(undefined),
    removeFriend: vi.fn().mockResolvedValue(undefined),
    refreshAccountRuntime: vi.fn(),
    createAgent: vi.fn().mockResolvedValue({ agentId: "agent:one" }),
    getAgentDetail: vi.fn().mockResolvedValue(detailFixture),
    logout: vi.fn().mockResolvedValue({ status: "logged_out" }),
  } as unknown as AccountProductAuthenticatedSession["client"];
  const value: AccountProductAuthenticatedSession = {
    client,
    accountName: "Owner Account",
    localServices: { runtime: { state: "ready", runtimeId: "runtime:one" }, mcp: { state: "ready" } },
    session: {
      sessionId: "session:one", credentialId: "credential:secret", accountId: "account:one", userId: "human:owner",
      displayName: "Owner", email: "owner@example.com", createdAt: at,
      expiresAt: "2026-09-13T00:00:00.000Z", lastSeenAt: at,
    },
  };
  return { value, client, friend, invitation };
}

describe("AccountProductHost", () => {
  it("hydrates Account-scoped collections while keeping the credential out of Renderer state", async () => {
    const session = authenticated();
    const authentication: AccountProductAuthenticationPort = {
      login: activatingLogin(session.value),
      restore: vi.fn().mockResolvedValue(session.value),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    const host = new AccountProductHost(authentication);
    const snapshot = await host.restore();
    expect(snapshot).toMatchObject({ session: { state: "signed-in", accountId: "account:one", accountName: "Owner Account" }, route: { name: "agents" }, localServices: { runtime: { state: "ready" }, mcp: { state: "ready" } }, friends: [{ friendshipId: "friendship:one" }] });
    expect(JSON.stringify(snapshot)).not.toMatch(/credential:secret|credentialId|token/iu);
    expect(session.client.listAgentCatalog).toHaveBeenCalledWith(expect.objectContaining({ scope: "mine", limit: 100 }));
  });

  it("creates a token-free friend invitation and adds it to the outgoing inbox", async () => {
    const session = authenticated();
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    const result = await host.command({ type: "friend-invite", invitation: { email: "friend@example.com", expiresAt: "2026-08-20T00:00:00.000Z" } });
    expect(result).toMatchObject({ type: "friend-invitation-created", invitation: session.invitation });
    expect(JSON.stringify(result)).not.toMatch(/invitationToken|role/iu);
    expect(host.snapshot().outgoingFriendInvitations).toEqual([session.invitation]);
  });

  it("rebuilds friend collections and friend-opened Agent rows from Human invalidations", async () => {
    const session = authenticated();
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    await host.invalidate({ type: "human-resource-invalidated", userId: "human:owner", resourceType: "friend-invitation", resourceId: "friend-invitation:two", aspects: ["invitations"], observedAt: at });
    expect(session.client.listIncomingFriendInvitations).toHaveBeenCalledTimes(2);
    expect(session.client.listFriends).toHaveBeenCalledTimes(2);
    await host.invalidate({ type: "human-resource-invalidated", userId: "human:owner", resourceType: "friendship", resourceId: "friendship:one", aspects: ["friends", "access"], observedAt: at });
    expect(session.client.listAgentCatalog).toHaveBeenCalledTimes(2);
    await host.invalidate({ type: "human-resource-invalidated", userId: "human:owner", resourceType: "friend-agent", resourceId: "agent:friend", aspects: ["access"], observedAt: at });
    expect(session.client.listAgentCatalog).toHaveBeenCalledTimes(3);
    await host.invalidate({ type: "human-resource-invalidated", userId: "human:other", resourceType: "friend-agent", resourceId: "agent:hidden", aspects: ["access"], observedAt: at });
    expect(session.client.listAgentCatalog).toHaveBeenCalledTimes(3);
  });

  it("rejects resource commands before Account authentication", async () => {
    const host = new AccountProductHost({
      login: vi.fn(), restore: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    await expect(host.command({ type: "runtime-open", runtimeId: "runtime:one" })).rejects.toThrow("authentication-required");
  });

  it("preserves a stored credential for transient restore failure but clears an invalid session", async () => {
    const transientClear = vi.fn().mockResolvedValue(undefined);
    const transient = new AccountProductHost({
      login: vi.fn(), restore: vi.fn().mockRejectedValue(new Error("server-unreachable")), clear: transientClear,
    });
    await expect(transient.restore()).resolves.toMatchObject({ session: { state: "signed-out", reason: "initial" }, errorCode: "server-unreachable" });
    expect(transientClear).toHaveBeenCalledWith({ preserveCredential: true });

    const invalidClear = vi.fn().mockResolvedValue(undefined);
    const invalid = new AccountProductHost({
      login: vi.fn(), restore: vi.fn().mockRejectedValue(new Error("login-session-invalid")), clear: invalidClear,
    });
    await expect(invalid.restore()).resolves.toMatchObject({ session: { state: "signed-out", reason: "expired" }, errorCode: "login-session-invalid" });
    expect(invalidClear).toHaveBeenCalledWith();
  });

  it("preserves only the allowlisted login failure category in signed-out state", async () => {
    const host = new AccountProductHost({
      login: vi.fn().mockRejectedValue(Object.assign(new Error("raw /private/token"), { code: "login-secure-storage-failed" })),
      restore: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    await expect(host.command({ type: "login-google" })).rejects.toThrow("login-secure-storage-failed");
    expect(host.snapshot()).toMatchObject({ session: { state: "signed-out" }, errorCode: "login-secure-storage-failed", loading: false });
    expect(JSON.stringify(host.snapshot())).not.toMatch(/private|token/iu);
  });

  it("refreshes only same-Account resources after an invalidation event", async () => {
    const session = authenticated();
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    await host.invalidate({ type: "account-resource-invalidated", accountId: "account:other", resourceType: "agent", resourceId: "agent:hidden", aspects: ["agent"], observedAt: at });
    expect(session.client.listAgentCatalog).toHaveBeenCalledTimes(1);
    await host.invalidate({ type: "account-resource-invalidated", accountId: "account:one", resourceType: "agent", resourceId: "agent:one", aspects: ["presence"], observedAt: at });
    expect(session.client.listAgentCatalog).toHaveBeenCalledTimes(2);
    expect(host.snapshot().connection).toBe("online");
  });

  it("opens Agent detail before Cloud fragments settle and reuses completed fragments across tabs", async () => {
    const session = authenticated();
    const detailWork = deferred<typeof detailFixture>();
    const activityWork = deferred<{ activities: typeof activityFixtures }>();
    const skillsWork = deferred<typeof skillsFixture>();
    session.client.getAgentDetail = vi.fn().mockReturnValue(detailWork.promise) as never;
    session.client.listAgentActivities = vi.fn().mockReturnValue(activityWork.promise) as never;
    session.client.listAgentSkills = vi.fn().mockReturnValue(skillsWork.promise) as never;
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();

    const opened = await host.command({ type: "agent-open", agentId: "agent:one", section: "overview" });
    expect(opened).toMatchObject({ type: "snapshot", snapshot: { route: { name: "agent-detail", agentId: "agent:one" }, agentLoad: { detail: "loading", activities: "loading", skills: "loading" } } });

    detailWork.resolve(detailFixture);
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ detail: { identity: { agentId: "agent:one" } }, agentLoad: { detail: "ready", activities: "loading", skills: "loading" } }));
    activityWork.resolve({ activities: activityFixtures });
    skillsWork.resolve(skillsFixture);
    await vi.waitFor(() => expect(host.snapshot().agentLoad).toEqual({ agentId: "agent:one", detail: "ready", activities: "ready", skills: "ready" }));

    await host.command({ type: "navigate", route: { name: "agent-detail", agentId: "agent:one", section: "activity" } });
    await host.command({ type: "agent-open", agentId: "agent:one", section: "capabilities" });
    expect(session.client.getAgentDetail).toHaveBeenCalledTimes(1);
    expect(session.client.listAgentActivities).toHaveBeenCalledTimes(1);
    expect(session.client.listAgentSkills).toHaveBeenCalledTimes(1);
    expect(host.snapshot()).toMatchObject({ route: { section: "capabilities" }, activities: [{ activityId: "activity:one" }], skills: { agentId: "agent:one" } });
  });

  it("retries a failed detail fragment without waiting for other fragments", async () => {
    const session = authenticated();
    const firstDetail = deferred<typeof detailFixture>();
    const retriedDetail = deferred<typeof detailFixture>();
    const activityWork = deferred<{ activities: typeof activityFixtures }>();
    const skillsWork = deferred<typeof skillsFixture>();
    session.client.getAgentDetail = vi.fn().mockReturnValueOnce(firstDetail.promise).mockReturnValueOnce(retriedDetail.promise) as never;
    session.client.listAgentActivities = vi.fn().mockReturnValue(activityWork.promise) as never;
    session.client.listAgentSkills = vi.fn().mockReturnValue(skillsWork.promise) as never;
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    await host.command({ type: "agent-open", agentId: "agent:one", section: "overview" });
    firstDetail.reject(new Error("agent-detail-unavailable"));
    await vi.waitFor(() => expect(host.snapshot().agentLoad?.detail).toBe("failed"));

    await host.command({ type: "agent-open", agentId: "agent:one", section: "overview" });
    expect(session.client.getAgentDetail).toHaveBeenCalledTimes(2);
    retriedDetail.resolve(detailFixture);
    await vi.waitFor(() => expect(host.snapshot().agentLoad?.detail).toBe("ready"));
    expect(host.snapshot().agentLoad).toMatchObject({ activities: "loading", skills: "loading" });
    activityWork.resolve({ activities: activityFixtures });
    skillsWork.resolve(skillsFixture);
  });

  it("acknowledges migration recovery by backup and bounded field categories", async () => {
    const session = authenticated();
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    });
    await host.restore();
    const acknowledgedFields = ["environment_values", "runtime_credentials", "runtime_configuration", "agent_mcp_credentials", "integration_credentials", "private_skill_contents"] as const;
    await host.command({ type: "legacy-recovery-complete", backupId: "backup:one", acknowledgedFields: [...acknowledgedFields] });
    expect(session.client.completeLegacyAgentMigrationRecovery).toHaveBeenCalledWith({ backupId: "backup:one", acknowledgedFields });
    expect(host.snapshot().legacyRecovery).toMatchObject({ state: "completed", backupId: "backup:one" });
  });

  it("uses the local lifecycle result instead of the Cloud checking acknowledgement", async () => {
    const session = authenticated();
    const runtime = {
      runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-acp",
      name: "Owner Mac", visibility: "private", health: "ready", capabilities: {
        supportsModelSelection: false, supportsThinkingLevel: false, supportsServiceTier: false, supportsSkills: false,
        supportsMcpConfiguration: false, supportsEnvironment: false, supportsCustomArguments: false, supportsRuntimeConfiguration: false,
        supportsCancellation: true, maxConcurrentAgents: 8,
      },
      lastCheckedAt: at, createdAt: at, updatedAt: at, version: 3,
    } as const;
    session.client.listAccountRuntimes = vi.fn().mockResolvedValue([{ ...runtime, health: "checking", version: 2 }]) as never;
    const refreshLocalRuntime = vi.fn().mockResolvedValue(runtime);
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    }, { refreshLocalRuntime });
    await host.restore();
    const result = await host.command({ type: "runtime-refresh", runtimeId: runtime.runtimeId, expectedVersion: 2 });
    expect(refreshLocalRuntime).toHaveBeenCalledWith(runtime.runtimeId, 2);
    expect(result).toMatchObject({ type: "snapshot", snapshot: { runtimes: [{ health: "ready", version: 3 }] } });
    expect(session.client.refreshAccountRuntime).not.toHaveBeenCalled();
  });

  it("continues multiple Builder turns locally when Cloud creation is unavailable", async () => {
    const session = authenticated();
    session.client.listAccountRuntimes = vi.fn().mockResolvedValue([runtimeFixture]) as never;
    session.client.createAgent = vi.fn().mockRejectedValue(new Error("cloud-offline")) as never;
    const runLocalBuilderTurn = vi.fn()
      .mockResolvedValueOnce({ proposal: { name: "研究助手", description: "整理证据", instructions: "使用来源" }, assistantText: "已更新研究助手。" })
      .mockResolvedValueOnce({ proposal: { name: "研究助手", description: "整理证据并列出风险", instructions: "使用来源并区分推断" }, assistantText: "已加入风险分析。" });
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    }, { runLocalBuilderTurn });
    await host.restore();
    await host.command({ type: "creation-start", mode: "ai" });
    await host.command({ type: "builder-turn", text: "帮我研究" });
    const result = await host.command({ type: "builder-turn", text: "再列出风险" });

    expect(runLocalBuilderTurn).toHaveBeenCalledTimes(2);
    expect(session.client.createAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ type: "snapshot", snapshot: { creationSession: { name: "研究助手", description: "整理证据并列出风险", builder: { state: "idle" } } } });
  });

  it("discards the local Builder session when leaving the creation flow", async () => {
    const session = authenticated();
    session.client.listAccountRuntimes = vi.fn().mockResolvedValue([runtimeFixture]) as never;
    const runLocalBuilderTurn = vi.fn().mockResolvedValue({ proposal: { name: "临时助手", description: "仅当前页面", instructions: "保持本地" }, assistantText: "已生成。" });
    const closeLocalBuilder = vi.fn().mockResolvedValue(undefined);
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    }, { runLocalBuilderTurn, closeLocalBuilder });
    await host.restore();
    await host.command({ type: "creation-start", mode: "ai" });
    await host.command({ type: "builder-turn", text: "生成一个临时助手" });
    const closeCountBeforeLeaving = closeLocalBuilder.mock.calls.length;
    await host.command({ type: "navigate", route: { name: "agents" } });

    expect(closeLocalBuilder).toHaveBeenCalledTimes(closeCountBeforeLeaving + 1);
    expect(host.snapshot().creationSession).toBeUndefined();
  });

  it("discards the local Builder session when the Desktop window closes", async () => {
    const session = authenticated();
    session.client.listAccountRuntimes = vi.fn().mockResolvedValue([runtimeFixture]) as never;
    const closeLocalBuilder = vi.fn().mockResolvedValue(undefined);
    const host = new AccountProductHost({
      login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined),
    }, { closeLocalBuilder });
    await host.restore();
    await host.command({ type: "creation-start", mode: "ai" });
    const closeCountBeforeWindowClose = closeLocalBuilder.mock.calls.length;
    await host.discardCreationSession();

    expect(closeLocalBuilder).toHaveBeenCalledTimes(closeCountBeforeWindowClose + 1);
    expect(host.snapshot()).toMatchObject({ route: { name: "agents" } });
    expect(host.snapshot().creationSession).toBeUndefined();
  });

  it("validates locally and sends one final create request", async () => {
    const session = authenticated();
    session.client.listAccountRuntimes = vi.fn().mockResolvedValue([runtimeFixture]) as never;
    const host = new AccountProductHost({ login: activatingLogin(session.value), restore: vi.fn().mockResolvedValue(session.value), clear: vi.fn().mockResolvedValue(undefined) });
    await host.restore();
    await host.command({ type: "creation-start", mode: "blank" });
    const invalid = await host.command({ type: "creation-submit" });
    expect(invalid).toMatchObject({ snapshot: { creationValidation: { valid: false } } });
    expect(session.client.createAgent).not.toHaveBeenCalled();
    await host.command({ type: "creation-update", update: { name: "本地助手", description: "", runtimeId: "runtime:one", permissionMode: "private", configuration: runtimeConfiguration } });
    await host.command({ type: "creation-submit" });
    expect(session.client.createAgent).toHaveBeenCalledTimes(1);
  });
});

function activatingLogin(value: AccountProductAuthenticatedSession): AccountProductAuthenticationPort["login"] {
  return async <T>(activate: (session: AccountProductAuthenticatedSession) => Promise<T>) => activate(value);
}

const runtimeFixture = {
  runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-acp",
  name: "Owner Mac", visibility: "private", health: "ready", capabilities: {
    supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: true, supportsSkills: true,
    supportsMcpConfiguration: true, supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true,
    supportsCancellation: true, maxConcurrentAgents: 8,
  }, lastCheckedAt: at, createdAt: at, updatedAt: at, version: 1,
} as const;

const runtimeConfiguration = { instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] } as const;

const detailFixture = {
  identity: { agentId: "agent:one", accountId: "account:one", ownerUserId: "human:owner", name: "Agent One", description: "Test Agent", runtimeId: "runtime:one", createdAt: at, updatedAt: at, version: 1 },
  access: { canManage: true, canInvoke: true, effectiveAccess: "owner", permissionMode: "friends" },
  configuration: { instructions: "Be useful.", model: "gpt-5", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environment: { configuredCount: 0, redacted: true }, customArguments: { configuredCount: 0, redacted: true }, runtimeConfiguration: { configured: false, redacted: true }, mcpConnections: [], integrations: [] },
  runtime: runtimeFixture, sections: ["overview", "activity", "capabilities", "settings"], etag: '"agent:1"',
} as const;

const activityFixtures = [{ activityId: "activity:one", accountId: "account:one", agentId: "agent:one", taskId: "task:one", terminalState: "completed", startedAt: at, completedAt: at, durationMs: 1 }] as const;
const skillsFixture = { agentId: "agent:one", agentVersion: 1, runtimeDiscovery: { state: "ready", retryable: false }, skills: [] } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}
