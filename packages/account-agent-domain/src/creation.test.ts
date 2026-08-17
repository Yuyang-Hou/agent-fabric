import { describe, expect, it } from "vitest";

import { approvedAgentTemplates, validateLocalAgentCreation } from "./index.js";

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

  it("returns field-level Runtime capability errors for a local creation session", () => {
    const creation = {
      name: "Analyst", description: "", runtimeId: "runtime:one", permissionMode: "private" as const,
      configuration: { instructions: "Answer", model: "codex", thinkingLevel: "high" as const, maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: ["TOKEN"], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] },
    };
    const result = validateLocalAgentCreation({
      creation,
      runtime: { runtimeId: "runtime:one", accountId: "account:one", ownerUserId: "human:one", provider: "codex", adapterId: "codex-acp", name: "Codex", visibility: "private", health: "ready", capabilities, createdAt: now, updatedAt: now, version: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.map((error) => error.field)).toEqual(["model", "thinkingLevel", "environment"]);
    expect(creation.name).toBe("Analyst");
  });
});
