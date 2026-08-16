import { describe, expect, it } from "vitest";

import { agentDraftSchema, approvedAgentTemplates, validateAgentDraftForCreate } from "./index.js";

const now = "2026-08-13T00:00:00.000Z";
const capabilities = {
  supportsModelSelection: false, supportsThinkingLevel: false, supportsServiceTier: false, supportsSkills: true,
  supportsMcpConfiguration: false, supportsEnvironment: false, supportsCustomArguments: false, supportsRuntimeConfiguration: false,
  supportsCancellation: true, maxConcurrentAgents: 4,
};

describe("Account Agent creation contract", () => {
  it("exposes bounded server-owned templates", () => {
    expect(approvedAgentTemplates).toHaveLength(3);
    expect(new Set(approvedAgentTemplates.map((template) => template.templateId)).size).toBe(3);
    expect(approvedAgentTemplates.every((template) => template.skillReferences.length > 0)).toBe(true);
  });

  it("returns field-level Runtime capability errors without mutating the draft", () => {
    const draft = agentDraftSchema.parse({
      draftId: "draft:one", accountId: "account:one", ownerUserId: "human:one", mode: "blank", name: "Analyst", description: "",
      runtimeId: "runtime:one", permissionMode: "private", pendingUserText: "unsent edit",
      configuration: { instructions: "Answer", model: "codex", thinkingLevel: "high", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: ["TOKEN"], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] },
      state: "active", createdAt: now, updatedAt: now, expiresAt: "2026-08-20T00:00:00.000Z", version: 2,
    });
    const result = validateAgentDraftForCreate({
      principal: { accountId: "account:one", userId: "human:one", active: true }, draft, currentBoundAgentCount: 0,
      runtime: { runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:one", provider: "codex", adapterId: "codex-acp", name: "Codex", visibility: "private", health: "ready", capabilities, createdAt: now, updatedAt: now, version: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.map((error) => error.field)).toEqual(["model", "thinkingLevel", "environment"]);
    expect(draft.pendingUserText).toBe("unsent edit");
  });
});
