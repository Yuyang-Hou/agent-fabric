import { Task, TaskState } from "@a2a-js/sdk";
import { describe, expect, it, vi } from "vitest";

import { runAccountAgentBuilderTurn } from "./account-agent-builder.js";

const draft = {
  draftId: "draft:one", accountId: "account:one", ownerUserId: "human:member", mode: "ai", name: "", description: "", runtimeId: "runtime:one",
  permissionMode: "private", invocationTargets: [], pendingUserText: "", builderSession: { state: "in_flight", inFlight: { turnId: "builder-turn:one", baseDraftVersion: 2, startedAt: "2026-08-13T00:00:00.000Z" }, conversation: [] },
  configuration: { instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] },
  state: "active", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-20T00:00:00.000Z", version: 2,
} as const;

describe("Account Agent AI Builder", () => {
  it("applies one bounded JSON proposal through a hidden Runtime identity", async () => {
    const complete = vi.fn().mockResolvedValue({ ...draft, name: "Research" });
    const persistence = persistencePort(complete);
    const proposal = JSON.stringify({ name: "Research", description: "Evidence", instructions: "Use sources" });
    const execution = { execute: vi.fn().mockResolvedValue(Task.fromJSON({ id: "builder-turn:one", contextId: "builder-context:draft:one", status: { state: TaskState.TASK_STATE_COMPLETED }, artifacts: [{ artifactId: "artifact:one", name: "proposal", parts: [{ text: proposal, mediaType: "text/plain" }] }] })) };
    await runAccountAgentBuilderTurn({ persistence, execution, credentialId: "credential:member", draftId: "draft:one", text: "Build a researcher", expectedVersion: 1 });
    expect(execution.execute).toHaveBeenCalledWith(expect.objectContaining({ agentId: "builder:draft:one", runtimeId: "runtime:one", taskId: "builder-turn:one" }));
    expect(complete).toHaveBeenCalledWith("credential:member", "draft:one", expect.objectContaining({ turnId: "builder-turn:one", proposal: { name: "Research", description: "Evidence", instructions: "Use sources" } }));
  });

  it.each([
    [Task.fromJSON({ id: "builder-turn:one", contextId: "builder-context:draft:one", status: { state: TaskState.TASK_STATE_COMPLETED }, artifacts: [{ artifactId: "artifact:one", name: "proposal", parts: [{ text: "not-json", mediaType: "text/plain" }] }] }), "builder-output-malformed"],
    [Task.fromJSON({ id: "builder-turn:one", contextId: "builder-context:draft:one", status: { state: TaskState.TASK_STATE_FAILED }, artifacts: [] }), "builder-runtime-failed"],
  ] as const)("preserves the prior draft for malformed or failed output", async (task, expectedCode) => {
    const complete = vi.fn().mockResolvedValue({ ...draft, state: "failed" });
    await runAccountAgentBuilderTurn({ persistence: persistencePort(complete), execution: { execute: vi.fn().mockResolvedValue(task) }, credentialId: "credential:member", draftId: "draft:one", text: "Build", expectedVersion: 1 });
    expect(complete).toHaveBeenCalledWith("credential:member", "draft:one", expect.objectContaining({ errorCode: expectedCode }));
  });

  it("turns an offline Runtime into a recoverable Builder error", async () => {
    const complete = vi.fn().mockResolvedValue({ ...draft, state: "failed" });
    await runAccountAgentBuilderTurn({ persistence: persistencePort(complete), execution: { execute: vi.fn().mockRejectedValue(new Error("private runtime error")) }, credentialId: "credential:member", draftId: "draft:one", text: "Build", expectedVersion: 1 });
    expect(complete).toHaveBeenCalledWith("credential:member", "draft:one", { turnId: "builder-turn:one", errorCode: "builder-runtime-unavailable" });
  });
});

function persistencePort(complete: ReturnType<typeof vi.fn>) {
  return {
    startAccountAgentBuilderTurnForCredential: vi.fn().mockResolvedValue({ draft, accountId: "account:one", userId: "human:member", runtimeId: "runtime:one", turnId: "builder-turn:one" }),
    completeAccountAgentBuilderTurnForCredential: complete,
  } as never;
}
