import { FakeRuntimeAdapter } from "@agent-fabric/runtime-fake";
import { TaskState } from "@agent-fabric/a2a-task";
import { describe, expect, it } from "vitest";

import { AccountAgentRuntimeExecutor } from "./runtime-executor.js";
import { InMemoryAccountAgentPrivateConfigurationStore } from "./private-configuration.js";

function request(taskId: string, requesterUserId: string, question: string) {
  return { version: "1", type: "task-request", deliveryId: `delivery:${taskId}`, taskId, contextId: "context:one", requesterUserId, agent: { agentId: "agent:one", instructions: "Be concise." }, a2aMessage: { messageId: `message:${taskId}`, role: "ROLE_USER", parts: [{ text: question, mediaType: "text/plain" }] } } as const;
}

describe("AccountAgentRuntimeExecutor", () => {
  it("isolates Runtime sessions by Agent, requester and A2A context without exposing handles", async () => {
    const adapter = new FakeRuntimeAdapter();
    const executor = new AccountAgentRuntimeExecutor(adapter, "/private/workspace");
    const first = await executor.execute(request("task:one", "human:alice", "first"));
    const continuation = await executor.execute(request("task:two", "human:alice", "second"));
    const isolated = await executor.execute(request("task:three", "human:bob", "third"));
    expect(first.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(first.artifacts[0]?.parts[0]?.content).toMatchObject({ $case: "text", value: expect.stringContaining("turn-1") });
    expect(continuation.artifacts[0]?.parts[0]?.content).toMatchObject({ $case: "text", value: expect.stringContaining("turn-2") });
    expect(isolated.artifacts[0]?.parts[0]?.content).toMatchObject({ $case: "text", value: expect.stringContaining("turn-1") });
    expect(JSON.stringify([first, continuation, isolated])).not.toMatch(/private\/workspace|fake-session/u);
    await executor.shutdown();
  });

  it("maps approval and Runtime failure to truthful standard Task states", async () => {
    const executor = new AccountAgentRuntimeExecutor(new FakeRuntimeAdapter(), "/private/workspace");
    expect((await executor.execute(request("task:attention", "human:alice", "fake:attention"))).status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
    expect((await executor.execute(request("task:failed", "human:alice", "fake:error"))).status?.state).toBe(TaskState.TASK_STATE_FAILED);
    await executor.shutdown();
  });

  it("loads Edge-local private configuration into a new Runtime session and rotates existing sessions after replacement", async () => {
    const adapter = new FakeRuntimeAdapter();
    const originalCreate = adapter.createSession.bind(adapter);
    const requests: Parameters<typeof adapter.createSession>[0][] = [];
    adapter.createSession = async (input) => { requests.push(input); return originalCreate(input); };
    const privateConfigurations = new InMemoryAccountAgentPrivateConfigurationStore();
    const executor = new AccountAgentRuntimeExecutor(adapter, "/private/workspace", privateConfigurations);
    await executor.execute(request("task:before", "human:alice", "before"));
    await executor.replacePrivateConfiguration("agent:one", { environmentValues: { PRIVATE_TOKEN: "secret-value" }, mcpCredentials: {}, integrationCredentials: {} });
    await executor.execute(request("task:after", "human:alice", "after"));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.privateConfiguration).toEqual({ environmentValues: { PRIVATE_TOKEN: "secret-value" }, mcpCredentials: {}, integrationCredentials: {} });
    await executor.shutdown();
  });
});
