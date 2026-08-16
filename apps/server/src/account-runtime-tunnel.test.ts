import { Message, Role, Task, TaskState } from "@a2a-js/sdk";
import { describe, expect, it } from "vitest";

import { AccountRuntimeTunnelRegistry } from "./account-runtime-tunnel.js";

describe("AccountRuntimeTunnelRegistry", () => {
  it("routes one Account Agent Task through its bound Runtime and rejects offline delivery", async () => {
    const sent: string[] = [];
    const registry = new AccountRuntimeTunnelRegistry(1_000);
    const unregister = registry.register("account:one", "runtime:one", { readyState: 1, send: (value) => sent.push(value), close: () => undefined });
    const pending = registry.execute({ accountId: "account:one", agentId: "agent:one", runtimeId: "runtime:one", requesterUserId: "human:member", instructions: "Be concise.", taskId: "task:one", contextId: "context:one", message: Message.fromJSON({ messageId: "message:one", role: Role.ROLE_USER, parts: [{ text: "hello", mediaType: "text/plain" }] }) });
    const delivered = JSON.parse(sent[0] as string) as { deliveryId: string; taskId: string };
    registry.handle("account:one", "runtime:one", JSON.stringify({ version: "1", type: "task-result", deliveryId: delivered.deliveryId, taskId: delivered.taskId, a2aTask: Task.toJSON(Task.fromJSON({ id: "task:one", contextId: "context:one", status: { state: TaskState.TASK_STATE_COMPLETED }, artifacts: [] })) }));
    await expect(pending).resolves.toMatchObject({ id: "task:one", status: { state: TaskState.TASK_STATE_COMPLETED } });
    unregister();
    await expect(registry.execute({ accountId: "account:one", agentId: "agent:one", runtimeId: "runtime:one", requesterUserId: "human:member", instructions: "", taskId: "task:two", contextId: "context:one", message: Message.fromJSON({ messageId: "message:two", role: Role.ROLE_USER, parts: [{ text: "hello", mediaType: "text/plain" }] }) })).rejects.toThrow("agent-runtime-offline");
  });

  it("waits for an Edge cancellation acknowledgement", async () => {
    const sent: string[] = [];
    const registry = new AccountRuntimeTunnelRegistry(1_000);
    registry.register("account:one", "runtime:one", { readyState: 1, send: (value) => sent.push(value), close: () => undefined });
    const pending = registry.cancel({ accountId: "account:one", agentId: "agent:one", runtimeId: "runtime:one", taskId: "task:one" });
    const delivered = JSON.parse(sent[0] as string) as { deliveryId: string; taskId: string };
    registry.handle("account:one", "runtime:one", JSON.stringify({ version: "1", type: "task-result", deliveryId: delivered.deliveryId, taskId: delivered.taskId, a2aTask: Task.toJSON(Task.fromJSON({ id: "task:one", contextId: "", status: { state: TaskState.TASK_STATE_CANCELED }, artifacts: [] })) }));
    await expect(pending).resolves.toMatchObject({ id: "task:one", status: { state: TaskState.TASK_STATE_CANCELED } });
  });

  it("does not let a replaced socket unregister the active channel or reject its pending Task", async () => {
    const firstSent: string[] = [];
    const registry = new AccountRuntimeTunnelRegistry(1_000);
    let unregisterFirst = () => false;
    const firstTransport = { readyState: 1, send: (value: string) => firstSent.push(value), close: () => { unregisterFirst(); } };
    unregisterFirst = registry.register("account:one", "runtime:one", firstTransport);
    const pending = registry.execute({ accountId: "account:one", agentId: "agent:one", runtimeId: "runtime:one", requesterUserId: "human:member", instructions: "", taskId: "task:one", contextId: "context:one", message: Message.fromJSON({ messageId: "message:one", role: Role.ROLE_USER, parts: [{ text: "hello", mediaType: "text/plain" }] }) });
    const delivered = JSON.parse(firstSent[0] as string) as { deliveryId: string; taskId: string };

    const unregisterSecond = registry.register("account:one", "runtime:one", { readyState: 1, send: () => undefined, close: () => undefined });
    expect(unregisterFirst()).toBe(false);
    expect(registry.isConnected("account:one", "runtime:one")).toBe(true);

    registry.handle("account:one", "runtime:one", JSON.stringify({ version: "1", type: "task-result", deliveryId: delivered.deliveryId, taskId: delivered.taskId, a2aTask: Task.toJSON(Task.fromJSON({ id: "task:one", contextId: "context:one", status: { state: TaskState.TASK_STATE_COMPLETED }, artifacts: [] })) }));
    await expect(pending).resolves.toMatchObject({ id: "task:one", status: { state: TaskState.TASK_STATE_COMPLETED } });
    expect(unregisterSecond()).toBe(true);
  });

  it("relays private configuration to Edge and resolves only a matching redacted summary", async () => {
    const sent: string[] = [];
    const registry = new AccountRuntimeTunnelRegistry(1_000);
    registry.register("account:one", "runtime:one", { readyState: 1, send: (value) => sent.push(value), close: () => undefined });
    const configuration = { environmentValues: { PRIVATE_TOKEN: "secret-value" }, mcpCredentials: {}, integrationCredentials: {} };
    const pending = registry.replacePrivateConfiguration({ accountId: "account:one", runtimeId: "runtime:one", agentId: "agent:one", idempotencyKey: "private:0123456789", configuration });
    const delivered = JSON.parse(sent[0] as string) as { deliveryId: string; agentId: string };
    registry.handle("account:one", "runtime:one", JSON.stringify({ version: "1", type: "private-configuration-result", deliveryId: delivered.deliveryId, agentId: delivered.agentId, status: "updated", summary: { environmentVariableNames: ["PRIVATE_TOKEN"], configuredMcpConnectionIds: [], configuredIntegrationIds: [], updatedAt: "2026-08-13T00:00:00.000Z" } }));
    await expect(pending).resolves.toEqual({ environmentVariableNames: ["PRIVATE_TOKEN"], configuredMcpConnectionIds: [], configuredIntegrationIds: [], updatedAt: "2026-08-13T00:00:00.000Z" });
    expect(JSON.stringify(await pending)).not.toContain("secret-value");
  });
});
