import { describe, expect, it } from "vitest";

import { canBindRuntime, canInvokeAgent, canManageAgent, effectiveAccessScope, type Agent, type AgentAccessPrincipal, type AgentRuntime } from "./index.js";

describe("Human friendship Agent authorization", () => {
  const owner = principal("human:owner", "account:owner");
  const friend = principal("human:friend", "account:friend", ["human:owner"]);
  const unrelated = principal("human:other", "account:other");

  it("keeps management owner-only while active friends can invoke only opened Agents", () => {
    expect(canManageAgent(owner, agent("private"))).toBe(true);
    expect(canManageAgent(friend, agent("friends"))).toBe(false);
    expect(canInvokeAgent(owner, agent("private"))).toEqual({ allowed: true, scope: "owner" });
    expect(canInvokeAgent(friend, agent("friends"))).toEqual({ allowed: true, scope: "friend" });
    expect(effectiveAccessScope(friend, agent("private"))).toBe("none");
    expect(canInvokeAgent(friend, agent("private"))).toMatchObject({ allowed: false, code: "agent-access-denied" });
  });

  it("denies unrelated, removed, inactive and archived callers", () => {
    expect(canInvokeAgent(unrelated, agent("friends"))).toMatchObject({ allowed: false, code: "agent-access-denied" });
    expect(canInvokeAgent({ ...friend, activeFriendUserIds: [] }, agent("friends"))).toMatchObject({ allowed: false, code: "agent-access-denied" });
    expect(canInvokeAgent({ ...friend, active: false }, agent("friends"))).toMatchObject({ allowed: false, code: "principal-access-denied" });
    expect(canInvokeAgent(friend, { ...agent("friends"), archivedAt: "2026-08-13T00:00:00.000Z", archivedByUserId: "human:owner" })).toMatchObject({ allowed: false, code: "agent-archived" });
  });

  it("allows only the personal Account owner to bind a ready Runtime", () => {
    const runtime = readyRuntime();
    expect(canBindRuntime(owner, runtime, 0)).toEqual({ allowed: true });
    expect(canBindRuntime(friend, runtime, 0)).toEqual({ allowed: false, code: "runtime-owner-denied" });
    expect(canBindRuntime(owner, { ...runtime, health: "auth_required" }, 0)).toEqual({ allowed: false, code: "runtime-not-ready" });
    expect(canBindRuntime(owner, runtime, 4)).toEqual({ allowed: false, code: "runtime-capacity-reached" });
  });

  it("restricts a bounded self-test Principal to its exact owned Agent", () => {
    const bounded = { ...owner, boundedAgentIds: ["agent:one"] };
    expect(canInvokeAgent(bounded, agent("private"))).toEqual({ allowed: true, scope: "owner" });
    expect(canInvokeAgent(bounded, { ...agent("private"), agentId: "agent:other" })).toEqual({ allowed: false, scope: "none", code: "agent-access-denied" });
  });
});

function principal(userId: string, accountId: string, activeFriendUserIds: readonly string[] = []): AgentAccessPrincipal {
  return { accountId, userId, active: true, activeFriendUserIds };
}

function agent(permissionMode: Agent["permissionMode"]): Agent {
  return {
    agentId: "agent:one", accountId: "account:owner", ownerUserId: "human:owner", name: "Helper", description: "",
    permissionMode, configuration: { instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] },
    createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1,
  };
}

function readyRuntime(): AgentRuntime {
  return {
    runtimeId: "runtime:one", accountId: "account:owner", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-local", name: "Local Codex",
    visibility: "private", health: "ready", capabilities: { supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: true, supportsSkills: true, supportsMcpConfiguration: true, supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true, supportsCancellation: true, maxConcurrentAgents: 4 },
    createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1,
  };
}
