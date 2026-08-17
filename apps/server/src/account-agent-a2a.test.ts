import { Task, TaskState } from "@a2a-js/sdk";
import { AgentFabricClient, FabricClientError } from "@agent-fabric/client";
import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

const configuration = { instructions: "Answer clearly.", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] };
const agent = { agentId: "agent:research", accountId: "account:one", ownerUserId: "human:owner", runtimeId: "runtime:codex", name: "Research", description: "Research answers", permissionMode: "friends" as const, configuration, createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 3 };
const runtime = { runtimeId: "runtime:codex", accountId: "account:one", ownerUserId: "human:owner", provider: "codex", adapterId: "codex-acp", name: "Local Codex", visibility: "private" as const, health: "ready" as const, capabilities: { supportsModelSelection: true, supportsThinkingLevel: true, supportsServiceTier: true, supportsSkills: true, supportsMcpConfiguration: false, supportsEnvironment: true, supportsCustomArguments: true, supportsRuntimeConfiguration: true, supportsCancellation: true, maxConcurrentAgents: 10 }, lastCheckedAt: "2026-08-13T00:00:00.000Z", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 2 };

describe("Account Agent standard A2A", () => {
  it("runs online text and input-required Tasks through the production Account Runtime tunnel, then denies offline preflight", async () => {
    let runtimeHealth: "ready" | "offline" = "ready";
    let runtimeVersion = runtime.version;
    const routes = new Map<string, { taskId: string; accountId: string; agentId: string; originUserId: string; originCredentialId: string; state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected" }>();
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockImplementation(async (token: string) => ({ credentialId: token === "runtime-secret" ? "credential:owner" : "credential:friend", principalId: token === "runtime-secret" ? "device:owner" : "device:friend", ownerPrincipalId: token === "runtime-secret" ? "human:owner" : "human:friend", instanceId: "instance:one", scopes: ["account:access"] })),
      assertAccountRuntimeConnectionForCredential: vi.fn().mockResolvedValue(runtime),
      getAccountRuntimeForCredential: vi.fn().mockImplementation(async () => ({ ...runtime, health: runtimeHealth, version: runtimeVersion })),
      observeAccountRuntimeForCredential: vi.fn().mockImplementation(async (_credentialId: string, _runtimeId: string, input: { health: "ready" | "offline"; expectedVersion: number }) => { runtimeHealth = input.health; runtimeVersion = input.expectedVersion + 1; return { ...runtime, health: input.health, version: runtimeVersion }; }),
      getInvokableAccountAgentForCredential: vi.fn().mockImplementation(async () => { if (runtimeHealth !== "ready") throw new Error("agent-runtime-unavailable"); return { agent, runtime: { ...runtime, health: runtimeHealth, version: runtimeVersion }, accessScope: "friend" }; }),
      listInvokableAccountAgentsForCredential: vi.fn().mockImplementation(async () => runtimeHealth === "ready" ? [{ agent, runtime, accessScope: "friend" }] : [{ agent, runtime: { ...runtime, health: "offline" }, accessScope: "friend" }]),
      createAccountA2ATaskForCredential: vi.fn().mockImplementation(async (credentialId: string, agentId: string, taskId: string, state: "submitted") => { const route = { taskId, accountId: "account:one", agentId, originUserId: "human:friend", originCredentialId: credentialId, state }; routes.set(taskId, route); return route; }),
      updateAccountA2ATaskState: vi.fn().mockImplementation(async (taskId: string, state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected") => { const route = routes.get(taskId); if (route) routes.set(taskId, { ...route, state }); }),
      getReadableAccountA2ATaskRouteForCredential: vi.fn().mockImplementation(async (_credentialId: string, taskId: string) => { const route = routes.get(taskId); if (!route) throw new Error("account-task-not-found"); return route; }),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    const socketUrl = new URL(server.address() as string); socketUrl.protocol = "ws:"; socketUrl.pathname = "/v1/account-runtimes/connect";
    const socket = new WebSocket(socketUrl, { headers: { authorization: "Bearer runtime-secret", "x-agent-fabric-runtime-id": runtime.runtimeId } });
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.on("message", (raw) => {
      const delivered = JSON.parse(raw.toString()) as { type: string; deliveryId: string; taskId: string; contextId: string; a2aMessage: { parts?: Array<{ text?: string }> } };
      if (delivered.type !== "task-request") return;
      const question = delivered.a2aMessage.parts?.[0]?.text ?? "";
      const state = question.includes("attention") ? TaskState.TASK_STATE_INPUT_REQUIRED : TaskState.TASK_STATE_COMPLETED;
      const result = Task.fromJSON({ id: delivered.taskId, contextId: delivered.contextId, status: { state }, artifacts: state === TaskState.TASK_STATE_COMPLETED ? [{ artifactId: `artifact:${delivered.taskId}`, name: "answer", parts: [{ text: "runtime answer", mediaType: "text/plain" }] }] : [] });
      const sendResult = () => socket.send(JSON.stringify({ version: "1", type: "task-result", deliveryId: delivered.deliveryId, taskId: delivered.taskId, a2aTask: Task.toJSON(result) }));
      if (question.includes("heartbeat")) {
        socket.send(JSON.stringify({ version: "1", type: "heartbeat", runtimeId: runtime.runtimeId, health: "ready", capabilities: runtime.capabilities, runtimeSkills: [], observedAt: new Date().toISOString() }));
        setTimeout(sendResult, 150);
      } else sendResult();
    });
    try {
      const fetchImpl: typeof fetch = (input, init) => fetch(String(input).replace("http://127.0.0.1:8787", server.address() as string), init);
      const client = new AgentFabricClient({ baseUrl: server.address() as string, token: "friend-secret", retries: 0, fetchImpl });
      await expect(client.askAccountAgent({ agentId: agent.agentId, text: "hello", waitMs: 1_000 })).resolves.toMatchObject({ state: "completed", text: "runtime answer" });
      const acrossHeartbeat = await client.askAccountAgent({ agentId: agent.agentId, text: "heartbeat during task", waitMs: 1_000 });
      expect(acrossHeartbeat).toMatchObject({ state: "completed", text: "runtime answer" });
      await expect(client.getAccountAgentTask(acrossHeartbeat.taskId)).resolves.toMatchObject({ taskId: acrossHeartbeat.taskId, state: "completed", text: "runtime answer" });
      await expect(client.askAccountAgent({ agentId: agent.agentId, text: "attention", waitMs: 1_000 })).resolves.toMatchObject({ state: "input-required" });
      socket.close();
      await vi.waitUntil(() => runtimeHealth === "offline");
      await expect(client.askAccountAgent({ agentId: agent.agentId, text: "after offline", waitMs: 10 })).rejects.toBeInstanceOf(FabricClientError);
    } finally {
      socket.close();
      await server.stop();
    }
  });

  it("projects the current Agent Card and preserves failed/non-text Task truth over HTTP 200", async () => {
    let terminal: "completed" | "failed" = "completed";
    let revoked = false;
    const routes = new Map<string, { taskId: string; accountId: string; agentId: string; originUserId: string; originCredentialId: string; state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected" }>();
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:friend", principalId: "device:friend", ownerPrincipalId: "human:friend", instanceId: "instance:one", scopes: ["account:access"] }),
      listInvokableAccountAgentsForCredential: vi.fn().mockImplementation(async () => revoked ? [] : [{ agent, runtime, accessScope: "friend" }]),
      getInvokableAccountAgentForCredential: vi.fn().mockImplementation(async () => { if (revoked) throw new Error("account-agent-not-found"); return { agent, runtime, accessScope: "friend" }; }),
      createAccountA2ATaskForCredential: vi.fn().mockImplementation(async (credentialId: string, agentId: string, taskId: string, state: "submitted") => { const route = { taskId, accountId: "account:one", agentId, originUserId: "human:friend", originCredentialId: credentialId, state }; routes.set(taskId, route); return route; }),
      updateAccountA2ATaskState: vi.fn().mockImplementation(async (taskId: string, state: typeof terminal) => { const route = routes.get(taskId); if (route) routes.set(taskId, { ...route, state }); }),
      getReadableAccountA2ATaskRouteForCredential: vi.fn().mockImplementation(async (_credentialId: string, taskId: string) => { if (revoked || !routes.has(taskId)) throw new Error("account-task-not-found"); return routes.get(taskId); }),
    } as unknown as PersistenceStore;
    const execution = { execute: vi.fn().mockImplementation(async ({ taskId, contextId }: { taskId: string; contextId: string }) => terminal === "completed"
      ? Task.fromJSON({ id: taskId, contextId, status: { state: TaskState.TASK_STATE_COMPLETED }, artifacts: [{ artifactId: "artifact:binary", name: "binary", parts: [{ raw: "AQID", mediaType: "application/octet-stream" }] }] })
      : Task.fromJSON({ id: taskId, contextId, status: { state: TaskState.TASK_STATE_FAILED }, artifacts: [] })) };
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store, accountAgentExecution: execution });
    const invalidations: string[] = [];
    server.accountInvalidations.register("account:one", { readyState: 1, send: (value) => invalidations.push(value) });
    await server.start();
    try {
      const fetchImpl: typeof fetch = (input, init) => fetch(String(input).replace("http://127.0.0.1:8787", server.address() as string), init);
      const client = new AgentFabricClient({ baseUrl: server.address() as string, token: "friend-secret", retries: 0, fetchImpl });
      const cardResponse = await fetch(`${server.address()}/v1/agents/agent%3Aresearch/card`, { headers: { authorization: "Bearer friend-secret" } });
      expect(cardResponse.status).toBe(200);
      expect(await cardResponse.json()).toMatchObject({ name: "Research", description: "Research answers", version: "3", supportedInterfaces: [{ url: expect.stringContaining("/a2a/agents/agent%3Aresearch"), protocolBinding: "HTTP+JSON" }] });

      const nonText = await client.askAccountAgent({ agentId: agent.agentId, text: "return binary", waitMs: 1_000 });
      expect(nonText).toMatchObject({ agentId: agent.agentId, state: "completed", artifactKinds: ["application/octet-stream"] });
      expect(nonText).not.toHaveProperty("text");

      terminal = "failed";
      const failed = await client.askAccountAgent({ agentId: agent.agentId, text: "fail", waitMs: 1_000 });
      expect(failed).toMatchObject({ state: "failed", errorCode: "agent-task-failed" });
      execution.execute.mockRejectedValueOnce(new Error("agent-runtime-offline"));
      const unavailable = await client.askAccountAgent({ agentId: agent.agentId, text: "runtime unavailable after task creation", waitMs: 1_000 });
      expect(unavailable).toMatchObject({ taskId: expect.any(String), state: "failed", errorCode: "agent-task-failed" });
      await expect(client.getAccountAgentTask(unavailable.taskId)).resolves.toMatchObject({ taskId: unavailable.taskId, state: "failed" });
      await vi.waitUntil(() => invalidations.some((value) => value.includes('"activity"')));
      expect(invalidations.map((value) => JSON.parse(value))).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: "account:one", resourceId: "agent:research", aspects: expect.arrayContaining(["workload", "activity"]) })]));

      revoked = true;
      await expect(client.getAccountAgentTask(failed.taskId)).rejects.toBeInstanceOf(FabricClientError);
      expect(store.getReadableAccountA2ATaskRouteForCredential).toHaveBeenCalled();
    } finally { await server.stop(); }
  });
});
