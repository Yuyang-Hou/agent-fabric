import { describe, expect, it } from "vitest";

import {
  agentCatalogPageSchema,
  agentConfigurationSchema,
  agentSchema,
  friendAgentSummarySchema,
  friendInvitationSchema,
  friendshipSchema,
  runtimeSchema,
  skillSchema,
} from "./index.js";

const at = "2026-08-13T00:00:00.000Z";
const accountId = "account:alpha";
const ownerUserId = "user:owner";

const capabilities = {
  supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: false, supportsSkills: true,
  supportsMcpConfiguration: true, supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true,
  supportsCancellation: true, maxConcurrentAgents: 8,
};

const configuration = {
  instructions: "Answer only from the configured context.", model: "gpt-5", thinkingLevel: "medium" as const,
  maxConcurrentTasks: 2, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: ["PROJECT_TOKEN"],
  customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [],
};

const owner = { userId: ownerUserId, displayName: "Owner", email: "owner@example.com" };

function agent(agentId: string, input: Partial<Record<string, unknown>> = {}) {
  return {
    agentId, accountId, ownerUserId, name: agentId, description: "Independent Agent", permissionMode: "private" as const,
    configuration, createdAt: at, updatedAt: at, version: 1, ...input,
  };
}

function runtime(runtimeId: string, health: "ready" | "offline") {
  return runtimeSchema.parse({
    runtimeId, accountId, ownerUserId, provider: "codex", adapterId: "codex-acp", name: runtimeId,
    visibility: "private", health, capabilities, lastCheckedAt: at, createdAt: at, updatedAt: at, version: 1,
  });
}

describe("personal Account and Human friendship contracts", () => {
  it("accepts multiple independently configured owned Agents with private or friends access", () => {
    const runtimeOne = runtime("runtime:one", "ready");
    const agents = [
      agentSchema.parse(agent("agent:one", { runtimeId: runtimeOne.runtimeId })),
      agentSchema.parse(agent("agent:two", { permissionMode: "friends", configuration: { ...configuration, model: "gpt-5.1" } })),
    ];
    const page = agentCatalogPageSchema.parse({
      accountId, scope: "mine",
      rows: agents.map((value, index) => ({
        agent: catalogIdentity(value), owner, effectiveAccess: "owner", status: index === 0 ? "online" : "needs_runtime",
        ...(index === 0 ? { runtime: runtimeOne } : {}),
      })),
      counts: { mine: 2, friends: 0, archived: 0 },
    });
    expect(page.rows).toHaveLength(2);
    expect(agents.map((value) => value.permissionMode)).toEqual(["private", "friends"]);
  });

  it("uses a distinct bounded friend Agent projection and rejects private fields", () => {
    const summary = friendAgentSummarySchema.parse({
      kind: "friend", agentId: "agent:friend", name: "Research helper", description: "Finds public evidence",
      owner: { userId: "user:friend", displayName: "Friend" }, capabilitySummary: ["text"], availability: "online",
      effectiveAccess: "friend", updatedAt: at,
    });
    expect(summary).not.toHaveProperty("accountId");
    for (const privateField of ["runtimeId", "model", "configuration", "instructions", "skills", "activity", "workload", "secrets"]) {
      expect(() => friendAgentSummarySchema.parse({ ...summary, [privateField]: "private" })).toThrow();
    }
  });

  it("models role-free invitations and normalized symmetric Friendships", () => {
    const invitation = friendInvitationSchema.parse({
      invitationId: "friend-invitation:one", inviterUserId: ownerUserId, recipientEmail: "new@example.com",
      status: "pending", createdAt: at, expiresAt: "2026-08-14T00:00:00.000Z", version: 1,
    });
    expect(invitation).not.toHaveProperty("role");
    expect(() => friendInvitationSchema.parse({ ...invitation, role: "member" })).toThrow();
    expect(friendshipSchema.parse({
      friendshipId: "friendship:one", humanAUserId: "user:a", humanBUserId: "user:b", status: "active",
      relationshipVersion: 1, createdAt: at, updatedAt: at, version: 1,
    }).status).toBe("active");
    expect(() => friendshipSchema.parse({
      friendshipId: "friendship:bad", humanAUserId: "user:z", humanBUserId: "user:a", status: "active",
      relationshipVersion: 1, createdAt: at, updatedAt: at, version: 1,
    })).toThrow("friendship-human-pair-must-be-normalized");
  });

  it("rejects secret values and non-private Runtime visibility", () => {
    expect(() => agentConfigurationSchema.parse({ ...configuration, environmentVariables: { PROJECT_TOKEN: "secret" } })).toThrow();
    const parsedRuntime = runtime("runtime:one", "ready");
    expect(() => runtimeSchema.parse({ ...parsedRuntime, visibility: "account" })).toThrow();
    expect(() => runtimeSchema.parse({ ...parsedRuntime, runtimeSessionId: "private-session", cwd: "/private/project" })).toThrow();
  });

  it("validates Runtime Skills without defining a durable Builder resource", () => {
    expect(skillSchema.parse({
      skillId: "skill:runtime", accountId, name: "Runtime skill", description: "Discovered on the bound Runtime",
      origin: "runtime", runtimeId: "runtime:one", createdAt: at, updatedAt: at, version: 1,
    }).origin).toBe("runtime");
  });
});

function catalogIdentity(value: ReturnType<typeof agentSchema.parse>) {
  return {
    agentId: value.agentId, accountId: value.accountId, ownerUserId: value.ownerUserId, name: value.name, description: value.description,
    ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}), ...(value.runtimeId ? { runtimeId: value.runtimeId } : {}), permissionMode: value.permissionMode,
    ...(value.configuration.model ? { model: value.configuration.model } : {}), ...(value.archivedAt ? { archivedAt: value.archivedAt } : {}),
    createdAt: value.createdAt, updatedAt: value.updatedAt, version: value.version,
  };
}
