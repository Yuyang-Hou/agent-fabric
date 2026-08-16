import { accountRuntimeClientEnvelopeSchema, accountRuntimeServerEnvelopeSchema, type AgentPrivateConfiguration, type AgentPrivateConfigurationSummary } from "@agent-fabric/account-agent-domain";
import { Message, Task } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";

import type { AccountAgentExecutionPort } from "./account-agent-a2a.js";

export interface AccountRuntimeTunnelTransport {
  readonly readyState: number;
  send(value: string): void;
  close(code?: number, reason?: string): void;
}

interface RuntimeChannel {
  readonly accountId: string;
  readonly runtimeId: string;
  readonly generation: number;
  readonly transport: AccountRuntimeTunnelTransport;
}

interface PendingExecution {
  readonly taskId: string;
  readonly runtimeId: string;
  readonly resolve: (task: Task) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

interface PendingPrivateConfiguration {
  readonly agentId: string;
  readonly runtimeId: string;
  readonly resolve: (summary: AgentPrivateConfigurationSummary) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export class AccountRuntimeTunnelRegistry implements AccountAgentExecutionPort {
  readonly #channels = new Map<string, RuntimeChannel>();
  readonly #pending = new Map<string, PendingExecution>();
  readonly #pendingPrivateConfigurations = new Map<string, PendingPrivateConfiguration>();
  #generation = 0;

  constructor(readonly timeoutMs = 120_000, readonly onHeartbeat: (input: { readonly accountId: string; readonly runtimeId: string; readonly health: "checking" | "ready" | "auth_required" | "unavailable" | "offline"; readonly observedAt: string }) => void | Promise<void> = () => undefined) {}

  register(accountId: string, runtimeId: string, transport: AccountRuntimeTunnelTransport): () => boolean {
    const key = channelKey(accountId, runtimeId);
    const previous = this.#channels.get(key);
    const channel = { accountId, runtimeId, transport, generation: ++this.#generation };
    this.#channels.set(key, channel);
    previous?.transport.close(4001, "runtime-replaced");
    return () => {
      if (this.#channels.get(key)?.generation !== channel.generation) return false;
      this.#channels.delete(key);
      for (const [deliveryId, pending] of this.#pending) {
        if (pending.runtimeId !== runtimeId) continue;
        clearTimeout(pending.timeout);
        pending.reject(new Error("agent-runtime-offline"));
        this.#pending.delete(deliveryId);
      }
      for (const [deliveryId, pending] of this.#pendingPrivateConfigurations) {
        if (pending.runtimeId !== runtimeId) continue;
        clearTimeout(pending.timeout);
        pending.reject(new Error("agent-runtime-offline"));
        this.#pendingPrivateConfigurations.delete(deliveryId);
      }
      return true;
    };
  }

  isConnected(accountId: string, runtimeId: string): boolean {
    return this.#channels.get(channelKey(accountId, runtimeId))?.transport.readyState === 1;
  }

  async execute(input: Parameters<AccountAgentExecutionPort["execute"]>[0]): Promise<Task> {
    const channel = this.#channels.get(channelKey(input.accountId, input.runtimeId));
    if (!channel || channel.transport.readyState !== 1) throw new Error("agent-runtime-offline");
    const deliveryId = `delivery:${randomUUID()}`;
    const envelope = accountRuntimeServerEnvelopeSchema.parse({
      version: "1", type: "task-request", deliveryId, taskId: input.taskId, contextId: input.contextId,
      requesterUserId: input.requesterUserId,
      agent: { agentId: input.agentId, instructions: input.instructions, ...(input.model ? { model: input.model } : {}), ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}), ...(input.serviceTier ? { serviceTier: input.serviceTier } : {}) },
      a2aMessage: Message.toJSON(input.message),
    });
    return new Promise<Task>((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pending.delete(deliveryId); reject(new Error("agent-runtime-timeout")); }, this.timeoutMs);
      this.#pending.set(deliveryId, { taskId: input.taskId, runtimeId: input.runtimeId, resolve, reject, timeout });
      channel.transport.send(JSON.stringify(envelope));
    });
  }

  async cancel(input: Parameters<NonNullable<AccountAgentExecutionPort["cancel"]>>[0]): Promise<Task> {
    const channel = this.#channels.get(channelKey(input.accountId, input.runtimeId));
    if (!channel || channel.transport.readyState !== 1) throw new Error("agent-runtime-offline");
    const deliveryId = `delivery:${randomUUID()}`;
    return new Promise<Task>((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pending.delete(deliveryId); reject(new Error("agent-runtime-cancel-timeout")); }, this.timeoutMs);
      this.#pending.set(deliveryId, { taskId: input.taskId, runtimeId: input.runtimeId, resolve, reject, timeout });
      channel.transport.send(JSON.stringify(accountRuntimeServerEnvelopeSchema.parse({ version: "1", type: "task-cancel", deliveryId, taskId: input.taskId })));
    });
  }

  async replacePrivateConfiguration(input: { readonly accountId: string; readonly runtimeId: string; readonly agentId: string; readonly idempotencyKey: string; readonly configuration: AgentPrivateConfiguration }): Promise<AgentPrivateConfigurationSummary> {
    const channel = this.#channels.get(channelKey(input.accountId, input.runtimeId));
    if (!channel || channel.transport.readyState !== 1) throw new Error("agent-runtime-offline");
    const deliveryId = `delivery:${randomUUID()}`;
    return new Promise<AgentPrivateConfigurationSummary>((resolve, reject) => {
      const timeout = setTimeout(() => { this.#pendingPrivateConfigurations.delete(deliveryId); reject(new Error("private-configuration-timeout")); }, this.timeoutMs);
      this.#pendingPrivateConfigurations.set(deliveryId, { agentId: input.agentId, runtimeId: input.runtimeId, resolve, reject, timeout });
      channel.transport.send(JSON.stringify(accountRuntimeServerEnvelopeSchema.parse({ version: "1", type: "private-configuration-update", deliveryId, agentId: input.agentId, idempotencyKey: input.idempotencyKey, configuration: input.configuration })));
    });
  }

  disconnect(accountId: string, runtimeId: string): void {
    this.#channels.get(channelKey(accountId, runtimeId))?.transport.close(1000, "account-runtime-deleted");
  }

  handle(accountId: string, runtimeId: string, raw: string): void {
    const envelope = accountRuntimeClientEnvelopeSchema.parse(JSON.parse(raw));
    if (envelope.type === "heartbeat") {
      if (envelope.runtimeId !== runtimeId) throw new Error("runtime-binding-denied");
      void this.onHeartbeat({ accountId, runtimeId, health: envelope.health, observedAt: envelope.observedAt });
      return;
    }
    if (envelope.type === "private-configuration-result") {
      const pending = this.#pendingPrivateConfigurations.get(envelope.deliveryId);
      if (!pending || pending.runtimeId !== runtimeId || pending.agentId !== envelope.agentId || !this.#channels.has(channelKey(accountId, runtimeId))) throw new Error("private-configuration-delivery-denied");
      clearTimeout(pending.timeout);
      this.#pendingPrivateConfigurations.delete(envelope.deliveryId);
      if (envelope.status !== "updated" || !envelope.summary) pending.reject(new Error(envelope.errorCode ?? "private-configuration-write-failed"));
      else pending.resolve(envelope.summary);
      return;
    }
    const pending = this.#pending.get(envelope.deliveryId);
    if (!pending || pending.runtimeId !== runtimeId || pending.taskId !== envelope.taskId || !this.#channels.has(channelKey(accountId, runtimeId))) throw new Error("task-delivery-denied");
    const task = Task.fromJSON(envelope.a2aTask);
    if (task.id !== pending.taskId) throw new Error("task-delivery-denied");
    clearTimeout(pending.timeout);
    this.#pending.delete(envelope.deliveryId);
    pending.resolve(task);
  }
}

function channelKey(accountId: string, runtimeId: string): string { return `${accountId}\u0000${runtimeId}`; }
