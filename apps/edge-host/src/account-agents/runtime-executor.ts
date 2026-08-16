import { accountRuntimeServerEnvelopeSchema, type AccountRuntimeServerEnvelope } from "@agent-fabric/account-agent-domain";
import { Message, Role, Task, TaskState } from "@agent-fabric/a2a-task";
import type { RuntimeAdapter, RuntimeExecutionPolicy, RuntimeSession } from "@agent-fabric/runtime-contract";

import { InMemoryAccountAgentPrivateConfigurationStore, type AccountAgentPrivateConfigurationStore } from "./private-configuration.js";

const policy: RuntimeExecutionPolicy = {
  filesystem: "read-only", network: "deny", sideEffects: "deny", timeoutMs: 120_000,
  maxOutputCharacters: 32_000, maxOutputTokens: 8_000, maxConcurrency: 1, maxDelegationDepth: 0,
};

export class AccountAgentRuntimeExecutor {
  readonly #sessions = new Map<string, RuntimeSession>();
  readonly #controllers = new Map<string, AbortController>();

  constructor(readonly adapter: RuntimeAdapter, readonly workspaceRoot: string, readonly privateConfigurations: AccountAgentPrivateConfigurationStore = new InMemoryAccountAgentPrivateConfigurationStore()) {
    if (!workspaceRoot) throw new Error("runtime-workspace-root-required");
  }

  async execute(value: unknown): Promise<Task> {
    const envelope = accountRuntimeServerEnvelopeSchema.parse(value);
    if (envelope.type !== "task-request") throw new Error("runtime-task-request-required");
    const message = Message.fromJSON(envelope.a2aMessage);
    const question = message.parts.flatMap((part) => part.mediaType === "text/plain" && part.content?.$case === "text" ? [part.content.value] : []).join("\n").trim();
    if (!question) return failedTask(envelope, "text-input-required");
    const controller = new AbortController();
    this.#controllers.set(envelope.taskId, controller);
    let output = "";
    try {
      const session = await this.#session(envelope);
      const prompt = envelope.agent.instructions ? `${envelope.agent.instructions}\n\nUser question:\n${question}` : question;
      for await (const event of this.adapter.execute({ sessionHandle: session.handle, taskId: envelope.taskId, prompt: [{ type: "text", text: prompt }], policy }, controller.signal)) {
        if (event.type === "output-delta") output += event.text;
        if (event.type === "completed") {
          output = (event.output || output).trim();
          return Task.fromJSON({ id: envelope.taskId, contextId: envelope.contextId, status: { state: TaskState.TASK_STATE_COMPLETED, timestamp: new Date().toISOString() }, artifacts: output ? [{ artifactId: `artifact:${envelope.taskId}`, name: "answer", parts: [{ text: output, mediaType: "text/plain" }] }] : [] });
        }
        if (event.type === "approval-required" || event.type === "forbidden-operation") {
          return Task.fromJSON({ id: envelope.taskId, contextId: envelope.contextId, status: { state: TaskState.TASK_STATE_INPUT_REQUIRED, timestamp: new Date().toISOString(), message: Message.fromJSON({ messageId: `status:${envelope.taskId}`, role: Role.ROLE_AGENT, parts: [{ text: "Additional approval is required.", mediaType: "text/plain" }] }) }, artifacts: [] });
        }
        if (event.type === "canceled") return canceledTask(envelope);
        if (["timed-out", "failed", "disconnected", "session-lost"].includes(event.type)) return failedTask(envelope, "runtime-failed");
      }
      return failedTask(envelope, "runtime-ended-without-result");
    } catch {
      return failedTask(envelope, "runtime-failed");
    } finally {
      this.#controllers.delete(envelope.taskId);
    }
  }

  cancel(taskId: string): void { this.#controllers.get(taskId)?.abort(); }

  async replacePrivateConfiguration(agentId: string, configuration: Parameters<AccountAgentPrivateConfigurationStore["replace"]>[1]) {
    const summary = await this.privateConfigurations.replace(agentId, configuration);
    const sessions = [...this.#sessions.entries()].filter(([key]) => key.startsWith(`${agentId}\u0000`));
    for (const [key, session] of sessions) {
      this.#sessions.delete(key);
      await this.adapter.close(session.handle).catch(() => undefined);
    }
    return summary;
  }

  async shutdown(): Promise<void> {
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.all(sessions.map((session) => this.adapter.close(session.handle).catch(() => undefined)));
  }

  async #session(envelope: Extract<AccountRuntimeServerEnvelope, { type: "task-request" }>): Promise<RuntimeSession> {
    const key = `${envelope.agent.agentId}\u0000${envelope.requesterUserId}\u0000${envelope.contextId}`;
    const existing = this.#sessions.get(key);
    if (existing) return existing;
    const privateConfiguration = await this.privateConfigurations.get(envelope.agent.agentId);
    const session = await this.adapter.createSession({
      agentId: envelope.agent.agentId,
      workspaceRoot: this.workspaceRoot,
      privateConfiguration: {
        ...(envelope.agent.model ? { model: envelope.agent.model } : {}),
        ...(envelope.agent.thinkingLevel ? { thinkingLevel: envelope.agent.thinkingLevel } : {}),
        ...(envelope.agent.serviceTier ? { serviceTier: envelope.agent.serviceTier } : {}),
        ...(privateConfiguration ? { environmentValues: privateConfiguration.environmentValues, mcpCredentials: privateConfiguration.mcpCredentials, integrationCredentials: privateConfiguration.integrationCredentials } : {}),
      },
    });
    this.#sessions.set(key, session);
    return session;
  }
}

function failedTask(envelope: Extract<AccountRuntimeServerEnvelope, { type: "task-request" }>, code: string): Task {
  return Task.fromJSON({ id: envelope.taskId, contextId: envelope.contextId, status: { state: TaskState.TASK_STATE_FAILED, timestamp: new Date().toISOString(), message: Message.fromJSON({ messageId: `status:${envelope.taskId}`, role: Role.ROLE_AGENT, parts: [{ text: code, mediaType: "text/plain" }] }) }, artifacts: [] });
}

function canceledTask(envelope: Extract<AccountRuntimeServerEnvelope, { type: "task-request" }>): Task {
  return Task.fromJSON({ id: envelope.taskId, contextId: envelope.contextId, status: { state: TaskState.TASK_STATE_CANCELED, timestamp: new Date().toISOString() }, artifacts: [] });
}
