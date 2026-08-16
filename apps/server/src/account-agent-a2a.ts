import { AgentCard, Message, Task, TaskState, type CancelTaskRequest, type DeleteTaskPushNotificationConfigRequest, type GetExtendedAgentCardRequest, type GetTaskPushNotificationConfigRequest, type GetTaskRequest, type ListTaskPushNotificationConfigsRequest, type ListTaskPushNotificationConfigsResponse, type ListTasksRequest, type ListTasksResponse, type SendMessageRequest, type StreamResponse, type SubscribeToTaskRequest, type TaskPushNotificationConfig } from "@a2a-js/sdk";
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore, type A2ARequestHandler, type AgentExecutor, type ExecutionEventBus, type RequestContext, type ServerCallContext } from "@a2a-js/sdk/server";

import { requireAccountAgentA2APersistence, type AccountAgentA2APersistencePort } from "./persistence-store.js";
import type { PersistenceStore } from "./persistence-store.js";

export interface AccountAgentExecutionPort {
  execute(input: {
    readonly accountId: string;
    readonly agentId: string;
    readonly runtimeId: string;
    readonly requesterUserId: string;
    readonly instructions: string;
    readonly model?: string;
    readonly thinkingLevel?: "minimal" | "low" | "medium" | "high" | "xhigh";
    readonly serviceTier?: "default" | "flex" | "priority";
    readonly taskId: string;
    readonly contextId: string;
    readonly message: Message;
  }): Promise<Task>;
  cancel?(input: { readonly accountId: string; readonly agentId: string; readonly runtimeId: string; readonly taskId: string }): Promise<Task>;
}

export type AccountAgentInvalidationSink = (input: { readonly accountId: string; readonly agentId: string; readonly aspects: readonly ("workload" | "activity")[]; readonly observedAt: string }) => void | Promise<void>;

interface AccountRequestUser {
  readonly isAuthenticated: boolean;
  readonly userName: string;
  readonly credentialId?: string;
}

export class AccountAgentA2ARegistry {
  readonly #handlers = new Map<string, AccountAgentRequestHandler>();
  readonly #taskStores = new Map<string, InMemoryTaskStore>();

  constructor(readonly store: PersistenceStore, readonly publicBaseUrl: string, readonly execution: AccountAgentExecutionPort, readonly invalidate: AccountAgentInvalidationSink = () => undefined) {
  }

  async handler(agentId: string, credentialId: string): Promise<AccountAgentRequestHandler> {
    const persistence = requireAccountAgentA2APersistence(this.store);
    const current = await persistence.getInvokableAccountAgentForCredential(credentialId, agentId);
    const cacheKey = `${agentId}:${current.agent.version}:${current.runtime.version}`;
    let handler = this.#handlers.get(cacheKey);
    if (!handler) {
      for (const key of this.#handlers.keys()) if (key.startsWith(`${agentId}:`)) this.#handlers.delete(key);
      const card = projectCurrentAgentCard(this.publicBaseUrl, current.agent, current.runtime.provider);
      let taskStore = this.#taskStores.get(agentId);
      if (!taskStore) {
        taskStore = new InMemoryTaskStore();
        this.#taskStores.set(agentId, taskStore);
      }
      handler = new AccountAgentRequestHandler(
        agentId,
        new DefaultRequestHandler(card, taskStore, new AccountAgentExecutor(agentId, persistence, this.execution, this.invalidate)),
        persistence,
      );
      this.#handlers.set(cacheKey, handler);
    }
    return handler;
  }

  async card(agentId: string, credentialId: string): Promise<AgentCard> {
    return (await this.handler(agentId, credentialId)).getAgentCard();
  }
}

export function projectCurrentAgentCard(publicBaseUrl: string, agent: Awaited<ReturnType<AccountAgentA2APersistencePort["getInvokableAccountAgentForCredential"]>>["agent"], provider: string): AgentCard {
  const base = publicBaseUrl.replace(/\/$/u, "");
  return AgentCard.fromJSON({
    name: agent.name,
    description: agent.description || "Agent Fabric Agent",
    supportedInterfaces: [{ url: `${base}/a2a/agents/${encodeURIComponent(agent.agentId)}`, protocolBinding: "HTTP+JSON", protocolVersion: "1.0" }],
    provider: { organization: "Agent Fabric", url: base },
    version: String(agent.version),
    capabilities: {},
    securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: "Bearer", bearerFormat: "opaque" } } },
    securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{ id: "question", name: "Question", description: `Ask this ${provider} Agent a text question`, tags: ["question", "text"] }],
  });
}

class AccountAgentRequestHandler implements A2ARequestHandler {
  constructor(readonly agentId: string, readonly delegate: DefaultRequestHandler, readonly persistence: AccountAgentA2APersistencePort) {}

  getAgentCard(): Promise<AgentCard> { return this.delegate.getAgentCard(); }
  getAuthenticatedExtendedAgentCard(params: GetExtendedAgentCardRequest, context: ServerCallContext): Promise<AgentCard> { return this.delegate.getAuthenticatedExtendedAgentCard(params, context); }
  sendMessage(params: SendMessageRequest, context: ServerCallContext): Promise<Message | Task> { return this.delegate.sendMessage(params, context); }
  sendMessageStream(params: SendMessageRequest, context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> { return this.delegate.sendMessageStream(params, context); }
  async getTask(params: GetTaskRequest, context: ServerCallContext): Promise<Task> {
    await this.persistence.getReadableAccountA2ATaskRouteForCredential(requireCredentialId(context), params.id);
    return this.delegate.getTask(params, context);
  }
  async cancelTask(params: CancelTaskRequest, context: ServerCallContext): Promise<Task> {
    await this.persistence.getReadableAccountA2ATaskRouteForCredential(requireCredentialId(context), params.id);
    return this.delegate.cancelTask(params, context);
  }
  createTaskPushNotificationConfig(params: TaskPushNotificationConfig, context: ServerCallContext): Promise<TaskPushNotificationConfig> { return this.delegate.createTaskPushNotificationConfig(params, context); }
  getTaskPushNotificationConfig(params: GetTaskPushNotificationConfigRequest, context: ServerCallContext): Promise<TaskPushNotificationConfig> { return this.delegate.getTaskPushNotificationConfig(params, context); }
  listTaskPushNotificationConfigs(params: ListTaskPushNotificationConfigsRequest, context: ServerCallContext): Promise<ListTaskPushNotificationConfigsResponse> { return this.delegate.listTaskPushNotificationConfigs(params, context); }
  deleteTaskPushNotificationConfig(params: DeleteTaskPushNotificationConfigRequest, context: ServerCallContext): Promise<void> { return this.delegate.deleteTaskPushNotificationConfig(params, context); }
  resubscribe(params: SubscribeToTaskRequest, context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> { return this.delegate.resubscribe(params, context); }
  listTasks(params: ListTasksRequest, context: ServerCallContext): Promise<ListTasksResponse> { return this.delegate.listTasks(params, context); }
}

class AccountAgentExecutor implements AgentExecutor {
  readonly #active = new Map<string, { readonly accountId: string; readonly runtimeId: string }>();

  constructor(readonly agentId: string, readonly persistence: AccountAgentA2APersistencePort, readonly execution: AccountAgentExecutionPort, readonly invalidate: AccountAgentInvalidationSink) {}

  async execute(request: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const credentialId = requireCredentialId(request.context);
    const target = await this.persistence.getInvokableAccountAgentForCredential(credentialId, this.agentId);
    const submittedAt = new Date().toISOString();
    const route = await this.persistence.createAccountA2ATaskForCredential(credentialId, this.agentId, request.taskId, "submitted", submittedAt);
    this.#invalidate(route.accountId, ["workload"], submittedAt);
    const submitted = Task.fromJSON({
      id: request.taskId,
      contextId: request.contextId,
      status: { state: TaskState.TASK_STATE_SUBMITTED, timestamp: submittedAt },
      artifacts: [],
      history: [Message.toJSON(request.userMessage)],
    });
    bus.publish(AgentEvent.task(submitted));
    this.#active.set(request.taskId, { accountId: target.agent.accountId, runtimeId: target.runtime.runtimeId });
    try {
      await this.persistence.updateAccountA2ATaskState(request.taskId, "working");
      this.#invalidate(route.accountId, ["workload"], new Date().toISOString());
      const result = await this.execution.execute({
        accountId: target.agent.accountId,
        agentId: target.agent.agentId,
        runtimeId: target.runtime.runtimeId,
        requesterUserId: route.originUserId,
        instructions: target.agent.configuration.instructions,
        ...(target.agent.configuration.model ? { model: target.agent.configuration.model } : {}),
        ...(target.agent.configuration.thinkingLevel ? { thinkingLevel: target.agent.configuration.thinkingLevel } : {}),
        ...(target.agent.configuration.serviceTier ? { serviceTier: target.agent.configuration.serviceTier } : {}),
        taskId: request.taskId,
        contextId: request.contextId,
        message: request.userMessage,
      });
      if (result.id !== request.taskId || result.contextId !== request.contextId) throw new Error("edge-task-identity-mismatch");
      const state = accountTaskState(result.status?.state);
      await this.persistence.updateAccountA2ATaskState(request.taskId, state);
      this.#invalidate(route.accountId, ["workload", ...(terminalAccountTaskState(state) ? ["activity" as const] : [])], new Date().toISOString());
      bus.publish(AgentEvent.task(result));
    } catch (error) {
      await this.persistence.updateAccountA2ATaskState(request.taskId, "failed").catch(() => undefined);
      this.#invalidate(route.accountId, ["workload", "activity"], new Date().toISOString());
      throw error;
    } finally {
      this.#active.delete(request.taskId);
      bus.finished();
    }
  }

  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    const active = this.#active.get(taskId);
    if (!active || !this.execution.cancel) throw new Error("task-not-active");
    const task = await this.execution.cancel({ accountId: active.accountId, agentId: this.agentId, runtimeId: active.runtimeId, taskId });
    await this.persistence.updateAccountA2ATaskState(taskId, "canceled");
    this.#invalidate(active.accountId, ["workload", "activity"], new Date().toISOString());
    bus.publish(AgentEvent.task(task));
    bus.finished();
  }

  #invalidate(accountId: string, aspects: readonly ("workload" | "activity")[], observedAt: string): void {
    void Promise.resolve(this.invalidate({ accountId, agentId: this.agentId, aspects, observedAt })).catch(() => undefined);
  }
}

function requireCredentialId(context: ServerCallContext): string {
  const user = context.user as AccountRequestUser | undefined;
  if (!user?.isAuthenticated || !user.credentialId) throw new Error("a2a-authentication-required");
  return user.credentialId;
}

function accountTaskState(state: TaskState | undefined): "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected" {
  if (state === TaskState.TASK_STATE_SUBMITTED) return "submitted";
  if (state === TaskState.TASK_STATE_WORKING) return "working";
  if (state === TaskState.TASK_STATE_INPUT_REQUIRED || state === TaskState.TASK_STATE_AUTH_REQUIRED) return "input-required";
  if (state === TaskState.TASK_STATE_COMPLETED) return "completed";
  if (state === TaskState.TASK_STATE_CANCELED) return "canceled";
  if (state === TaskState.TASK_STATE_REJECTED) return "rejected";
  return "failed";
}

function terminalAccountTaskState(state: ReturnType<typeof accountTaskState>): boolean {
  return state === "completed" || state === "failed" || state === "canceled" || state === "rejected";
}
