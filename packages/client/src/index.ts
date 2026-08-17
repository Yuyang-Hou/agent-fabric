import {
  componentVersionSchema,
  assertCompatible,
  type ComponentVersion,
  type JoinStartResponse,
  type OwnerLoginExchangeResponse,
  type OwnerLoginStartRequest,
} from "@agent-fabric/fabric-contracts";
import { ClientFactory, DefaultAgentCardResolver, RestTransportFactory } from "@a2a-js/sdk/client";
import { Message, Role, TaskState, type Task } from "@a2a-js/sdk";
import type {
  Account,
  AccountSession,
  Agent,
  AgentActivity,
  AgentBatchLifecycleRequest,
  AgentBatchLifecycleResult,
  AgentCatalogPage,
  AgentCatalogQuery,
  AgentCreationInput,
  AgentDetailProjection,
  AgentPrivateConfigurationUpdate,
  AgentSkillCatalog,
  AgentSkillMutation,
  AgentTemplate,
  ConfirmRuntimeDeletionRequest,
  CompleteLegacyAgentMigrationRecovery,
  FriendInvitation,
  FriendInvitationView,
  FriendSummary,
  Friendship,
  LegacyAgentMigrationRecovery,
  RuntimeDeletionImpact,
} from "@agent-fabric/account-agent-domain";
import { Buffer } from "node:buffer";

export const clientBoundary = "client" as const;

export const clientComponent: ComponentVersion = componentVersionSchema.parse({
  product: "agent-fabric",
  component: "cli",
  version: "0.1.0",
  protocolMajor: 1,
  a2aVersion: "1.0.1",
  runtimeAdapterVersion: "1",
  features: ["account-agents", "a2a-rest"],
});

export interface ClientOptions {
  readonly baseUrl: string;
  readonly token?: string;
  readonly fetchImpl?: typeof fetch;
  readonly retries?: number;
}

export interface AccessibleAccountAgent {
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly availability: "online" | "unstable" | "offline";
  readonly accessScope: "owner" | "friend";
}

export interface AccountAgentTaskView {
  readonly taskId: string;
  readonly agentId: string;
  readonly state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected";
  readonly text?: string;
  readonly artifactKinds?: readonly string[];
  readonly errorCode?: string;
}

export interface AccountSelfTestSession {
  readonly selfTestId: string;
  readonly accountId: string;
  readonly agentId: string;
  readonly requester: {
    readonly token: string;
    readonly principalId: string;
    readonly credentialId: string;
    readonly expiresAt: string;
  };
}

export interface AccountRuntimeCapabilities {
  readonly supportsModelSelection: boolean;
  readonly supportsThinkingLevel: boolean;
  readonly supportsServiceTier: boolean;
  readonly supportsSkills: boolean;
  readonly supportsMcpConfiguration: boolean;
  readonly supportsEnvironment: boolean;
  readonly supportsCustomArguments: boolean;
  readonly supportsRuntimeConfiguration: boolean;
  readonly supportsCancellation: boolean;
  readonly maxConcurrentAgents: number;
}

export interface AccountRuntime {
  readonly runtimeId: string;
  readonly accountId: string;
  readonly ownerUserId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly name: string;
  readonly visibility: "private";
  readonly health: "checking" | "ready" | "auth_required" | "unavailable" | "offline";
  readonly capabilities: AccountRuntimeCapabilities;
  readonly lastCheckedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface AccountRuntimeObservationInput {
  readonly health: AccountRuntime["health"];
  readonly capabilities: AccountRuntimeCapabilities;
  readonly expectedVersion: number;
}

export class AgentFabricClient {
  readonly baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #retries: number;

  constructor(options: ClientOptions) {
    const parsed = new URL(options.baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
      throw new FabricClientError("insecure-server-origin");
    }
    this.baseUrl = parsed.toString().replace(/\/$/u, "");
    this.#token = options.token ?? "";
    this.#fetch = options.fetchImpl ?? fetch;
    this.#retries = options.retries ?? 2;
  }

  async version(): Promise<ComponentVersion> {
    const remote = componentVersionSchema.parse(await this.#request("GET", "/v1/version", undefined, false));
    assertCompatible(clientComponent, remote);
    return remote;
  }

  async listAgentCatalog(query: AgentCatalogQuery): Promise<AgentCatalogPage> {
    const parameters = new URLSearchParams({ scope: query.scope, sort: query.sort, limit: String(query.limit) });
    if (query.search) parameters.set("q", query.search);
    for (const value of query.availability) parameters.append("availability", value);
    for (const value of query.runtimeIds) parameters.append("runtimeId", value);
    for (const value of query.ownerUserIds) parameters.append("ownerUserId", value);
    for (const value of query.models) parameters.append("model", value);
    for (const value of query.access) parameters.append("access", value);
    if (query.after) parameters.set("cursor", encodeCursor(query.after));
    return this.#request("GET", `/v1/agents?${parameters.toString()}`);
  }

  async createAgent(input: AgentCreationInput): Promise<Agent> {
    return this.#request("POST", "/v1/agents", input, true, [], {}, 0);
  }

  async batchAgentLifecycle(request: AgentBatchLifecycleRequest): Promise<AgentBatchLifecycleResult> {
    return this.#request("POST", "/v1/agents/batch-lifecycle", request);
  }

  async updateAgent(agentId: string, expectedVersion: number, patch: Readonly<Record<string, unknown>>): Promise<AgentDetailProjection> {
    return this.#request("PATCH", `/v1/agents/${encodeURIComponent(agentId)}`, { ...patch, expectedVersion }, true, [], {
      "if-match": `"agent:${expectedVersion}"`,
    });
  }

  async archiveAgent(agentId: string, expectedVersion: number): Promise<Agent> {
    return this.#request("POST", `/v1/agents/${encodeURIComponent(agentId)}/archive`, { expectedVersion });
  }

  async restoreAgent(agentId: string, expectedVersion: number): Promise<{ readonly agent: Agent; readonly status: "restored" | "needs_runtime" }> {
    return this.#request("POST", `/v1/agents/${encodeURIComponent(agentId)}/restore`, { expectedVersion });
  }

  async listAgentActivities(agentId: string, limit = 50, cursor?: string): Promise<{ readonly activities: readonly AgentActivity[]; readonly nextCursor?: string }> {
    return this.#request("GET", `/v1/agents/${encodeURIComponent(agentId)}/activities?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  }

  async getAgentDetail(agentId: string): Promise<AgentDetailProjection> {
    return this.#request("GET", `/v1/agents/${encodeURIComponent(agentId)}`);
  }

  async listAgentSkills(agentId: string): Promise<AgentSkillCatalog> {
    return this.#request("GET", `/v1/agents/${encodeURIComponent(agentId)}/skills`);
  }

  async mutateAgentSkill(agentId: string, skillId: string, input: AgentSkillMutation): Promise<AgentDetailProjection> {
    return this.#request("POST", `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`, input);
  }

  async getAgentPrivateConfigurationSummary(agentId: string): Promise<{ readonly environment: { readonly configuredCount: number; readonly redacted: true }; readonly mcpConnections: readonly { readonly connectionId: string; readonly configured: boolean; readonly redacted: true }[]; readonly integrations: readonly { readonly integrationId: string; readonly configured: boolean; readonly redacted: true }[]; readonly etag: string }> {
    return this.#request("GET", `/v1/agents/${encodeURIComponent(agentId)}/private-configuration`);
  }

  async updateAgentPrivateConfiguration(agentId: string, input: AgentPrivateConfigurationUpdate): Promise<{ readonly status: "updated"; readonly summary: { readonly environment: { readonly configuredCount: number; readonly redacted: true }; readonly configuredMcpCount: number; readonly configuredIntegrationCount: number }; readonly etag: string }> {
    return this.#request("PUT", `/v1/agents/${encodeURIComponent(agentId)}/private-configuration`, input);
  }

  async listInvokableAgents(query?: string): Promise<readonly AccessibleAccountAgent[]> {
    const result = await this.#request<{ readonly agents: readonly AccessibleAccountAgent[] }>("GET", `/v1/invokable-agents${query ? `?query=${encodeURIComponent(query)}` : ""}`);
    return result.agents;
  }

  async createAccountSelfTest(agentId: string, expiresAt: string): Promise<AccountSelfTestSession> {
    return this.#request("POST", "/v1/self-tests", { agentId, expiresAt });
  }

  async revokeAccountSelfTest(selfTestId: string): Promise<{ readonly selfTestId: string; readonly status: "revoked" }> {
    return this.#request("POST", `/v1/self-tests/${encodeURIComponent(selfTestId)}/revoke`, {});
  }

  async askAccountAgent(input: { readonly agentId: string; readonly text: string; readonly waitMs: number; readonly idempotencyKey?: string }): Promise<AccountAgentTaskView> {
    try {
      await this.version();
      const client = await this.#accountA2AClient(input.agentId);
      const sent = await client.sendMessage({
        tenant: "",
        message: Message.fromJSON({
          messageId: input.idempotencyKey ?? crypto.randomUUID(),
          role: Role.ROLE_USER,
          parts: [{ text: input.text, mediaType: "text/plain" }],
        }),
        configuration: { acceptedOutputModes: ["text/plain"], taskPushNotificationConfig: undefined, historyLength: 0, returnImmediately: true },
        metadata: undefined,
      }, { serviceParameters: this.#a2aHeaders(), signal: AbortSignal.timeout(Math.max(1_000, input.waitMs)) });
      if (!("id" in sent) || !sent.id) throw new FabricClientError("a2a-task-required");
      let task = sent;
      const deadline = Date.now() + input.waitMs;
      while (!terminalTaskState(task.status?.state) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
        task = await client.getTask({ tenant: "", id: task.id, historyLength: 0 }, { serviceParameters: this.#a2aHeaders(), signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      }
      return projectAccountTask(input.agentId, task);
    } catch (error) {
      if (error instanceof FabricClientError) throw error;
      throw new FabricClientError("agent-unavailable", undefined, error);
    }
  }

  async getAccountAgentTask(taskId: string): Promise<AccountAgentTaskView> {
    try {
      const route = await this.#request<{ readonly agentId: string }>("GET", `/v1/a2a/tasks/${encodeURIComponent(taskId)}/route`);
      const agentId = route.agentId;
      const client = await this.#accountA2AClient(agentId);
      const task = await client.getTask({ tenant: "", id: taskId, historyLength: 0 }, { serviceParameters: this.#a2aHeaders(), signal: AbortSignal.timeout(30_000) });
      return projectAccountTask(agentId, task);
    } catch (error) {
      if (error instanceof FabricClientError) throw error;
      throw new FabricClientError("task-unavailable", undefined, error);
    }
  }

  async listAccountRuntimes(limit = 100): Promise<readonly AccountRuntime[]> {
    const pageSize = Math.min(100, Math.max(1, limit));
    const runtimes: AccountRuntime[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.#request<{ readonly runtimes: readonly AccountRuntime[]; readonly nextCursor?: string }>("GET", `/v1/runtimes?limit=${pageSize}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      runtimes.push(...result.runtimes);
      cursor = result.nextCursor;
      if (runtimes.length > 1_000) throw new FabricClientError("runtime-catalog-too-large");
    } while (cursor);
    return runtimes;
  }

  async getAccountRuntime(runtimeId: string): Promise<AccountRuntime> {
    return this.#request("GET", `/v1/runtimes/${encodeURIComponent(runtimeId)}`);
  }

  async registerAccountRuntime(input: {
    readonly provider: string;
    readonly adapterId: string;
    readonly name: string;
    readonly visibility: AccountRuntime["visibility"];
    readonly health: AccountRuntime["health"];
    readonly capabilities: AccountRuntimeCapabilities;
  }): Promise<AccountRuntime> {
    return this.#request("POST", "/v1/runtimes", input);
  }

  async observeAccountRuntime(runtimeId: string, input: AccountRuntimeObservationInput): Promise<AccountRuntime> {
    return this.#request("PUT", `/v1/runtimes/${encodeURIComponent(runtimeId)}/observation`, input);
  }

  async updateAccountRuntime(runtimeId: string, input: { readonly name: string; readonly visibility: AccountRuntime["visibility"]; readonly expectedVersion: number }): Promise<AccountRuntime> {
    return this.#request("PATCH", `/v1/runtimes/${encodeURIComponent(runtimeId)}`, input);
  }

  async refreshAccountRuntime(runtimeId: string, expectedVersion: number): Promise<AccountRuntime> {
    return this.#request("POST", `/v1/runtimes/${encodeURIComponent(runtimeId)}/refresh`, { expectedVersion });
  }

  async planAccountRuntimeDeletion(runtimeId: string): Promise<RuntimeDeletionImpact> {
    return this.#request("GET", `/v1/runtimes/${encodeURIComponent(runtimeId)}/deletion-impact`);
  }

  async deleteAccountRuntime(runtimeId: string, confirmation: ConfirmRuntimeDeletionRequest): Promise<{ readonly runtimeId: string; readonly status: "deleted"; readonly unboundAgentIds: readonly string[] }> {
    return this.#request("POST", `/v1/runtimes/${encodeURIComponent(runtimeId)}/deletion`, confirmation);
  }

  async getAccountSession(): Promise<AccountSession> {
    return this.#request("GET", "/v1/session");
  }

  async getAccount(): Promise<Account> {
    return this.#request("GET", "/v1/account");
  }

  async getLegacyAgentMigrationRecovery(): Promise<LegacyAgentMigrationRecovery> {
    return this.#request("GET", "/v1/migration-recovery");
  }

  async completeLegacyAgentMigrationRecovery(input: CompleteLegacyAgentMigrationRecovery): Promise<LegacyAgentMigrationRecovery> {
    return this.#request("POST", "/v1/migration-recovery/complete", input);
  }

  async listFriends(limit = 100): Promise<readonly FriendSummary[]> {
    return this.#listHumanPages<FriendSummary>("friends", "/v1/friends", limit);
  }

  async listIncomingFriendInvitations(limit = 100): Promise<readonly FriendInvitationView[]> {
    return this.#listHumanPages<FriendInvitationView>("invitations", "/v1/friend-invitations/incoming", limit);
  }

  async listOutgoingFriendInvitations(limit = 100): Promise<readonly FriendInvitationView[]> {
    return this.#listHumanPages<FriendInvitationView>("invitations", "/v1/friend-invitations/outgoing", limit);
  }

  async createFriendInvitation(input: { readonly email: string; readonly expiresAt: string }): Promise<FriendInvitationView> {
    return this.#request("POST", "/v1/friend-invitations", input);
  }

  async acceptFriendInvitation(invitationId: string, expectedVersion: number): Promise<{ readonly invitation: FriendInvitation; readonly friendship: Friendship }> {
    return this.#request("POST", `/v1/friend-invitations/${encodeURIComponent(invitationId)}/accept`, { expectedVersion });
  }

  async rejectFriendInvitation(invitationId: string, expectedVersion: number): Promise<FriendInvitation> {
    return this.#request("POST", `/v1/friend-invitations/${encodeURIComponent(invitationId)}/reject`, { expectedVersion });
  }

  async revokeFriendInvitation(invitationId: string, expectedVersion: number): Promise<FriendInvitation> {
    return this.#request("POST", `/v1/friend-invitations/${encodeURIComponent(invitationId)}/revoke`, { expectedVersion });
  }

  async removeFriend(friendshipId: string, expectedVersion: number): Promise<{ readonly friendshipId: string; readonly status: "revoked"; readonly relationshipVersion: number }> {
    return this.#request("POST", `/v1/friends/${encodeURIComponent(friendshipId)}/remove`, { expectedVersion });
  }

  async listAgentTemplates(): Promise<readonly AgentTemplate[]> {
    return (await this.#request<{ readonly templates: readonly AgentTemplate[] }>("GET", "/v1/agent-templates")).templates;
  }

  async startLogin(input: OwnerLoginStartRequest): Promise<JoinStartResponse> {
    return this.#request("POST", "/v1/auth/login/start", input, false);
  }

  async exchangeLogin(exchangeCode: string, codeVerifier: string): Promise<OwnerLoginExchangeResponse> {
    return this.#request("POST", "/v1/auth/login/exchange", { exchangeCode, codeVerifier }, false);
  }

  async logout(): Promise<{ readonly status: "logged_out" }> {
    return this.#request("POST", "/v1/auth/logout", {});
  }

  async #accountA2AClient(agentId: string) {
    const authenticatedFetch: typeof fetch = (request, init) => this.#fetch(request, {
      ...init, headers: { ...headersObject(init?.headers), authorization: `Bearer ${this.#token}` },
    });
    return new ClientFactory({
      transports: [new RestTransportFactory({ fetchImpl: authenticatedFetch })],
      preferredTransports: ["HTTP+JSON"],
      cardResolver: new DefaultAgentCardResolver({ fetchImpl: authenticatedFetch }),
    }).createFromUrl(this.baseUrl, `/v1/agents/${encodeURIComponent(agentId)}/card`);
  }

  #a2aHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.#token}` };
  }

  async #listHumanPages<T>(key: "friends" | "invitations", path: string, limit: number): Promise<readonly T[]> {
    const pageSize = Math.min(100, Math.max(1, limit));
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.#request<Record<typeof key, readonly T[]> & { readonly nextCursor?: string }>(
        "GET",
        `${path}?limit=${pageSize}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      items.push(...result[key]);
      cursor = result.nextCursor;
      if (items.length > 10_000) throw new FabricClientError(`${key}-catalog-too-large`);
    } while (cursor);
    return items;
  }

  async #request<T>(method: string, path: string, body?: unknown, authenticated = true, acceptedStatuses: readonly number[] = [], requestHeaders: Readonly<Record<string, string>> = {}, retries = this.#retries): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.#fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...(authenticated ? { authorization: `Bearer ${this.#token}` } : {}),
            ...requestHeaders,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const value = await response.json().catch(() => ({})) as unknown;
        if (!response.ok && !acceptedStatuses.includes(response.status)) {
          const code = errorCode(value) ?? `http-${response.status}`;
          if (response.status >= 500 && attempt < retries) continue;
          throw new FabricClientError(code, response.status);
        }
        return value as T;
      } catch (error) {
        lastError = error;
        if (error instanceof FabricClientError || attempt >= retries) break;
      }
    }
    if (lastError instanceof FabricClientError) throw lastError;
    throw new FabricClientError("server-unreachable", undefined, lastError);
  }
}

export class FabricClientError extends Error {
  constructor(readonly code: string, readonly status?: number, override readonly cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "FabricClientError";
  }
}

function headersObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => { result[key] = value; });
  return result;
}

function encodeCursor(cursor: AgentCatalogQuery["after"]): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
}

function terminalTaskState(state: TaskState | undefined): boolean {
  return state === TaskState.TASK_STATE_INPUT_REQUIRED || state === TaskState.TASK_STATE_AUTH_REQUIRED || state === TaskState.TASK_STATE_COMPLETED || state === TaskState.TASK_STATE_FAILED || state === TaskState.TASK_STATE_CANCELED || state === TaskState.TASK_STATE_REJECTED;
}

function projectAccountTask(agentId: string, task: Task): AccountAgentTaskView {
  const state = taskStateView(task.status?.state);
  const artifactKinds = task.artifacts.flatMap((artifact) => artifact.parts.map((part) => part.mediaType || "application/octet-stream"));
  const text = task.artifacts.flatMap((artifact) => artifact.parts.flatMap((part) => part.mediaType === "text/plain" && part.content?.$case === "text" ? [part.content.value] : [])).join("\n").trim();
  return {
    taskId: task.id,
    agentId,
    state,
    ...(text ? { text } : {}),
    ...(artifactKinds.length ? { artifactKinds } : {}),
    ...((state === "failed" || state === "rejected") ? { errorCode: "agent-task-failed" } : {}),
  };
}

function taskStateView(state: TaskState | undefined): AccountAgentTaskView["state"] {
  if (state === TaskState.TASK_STATE_SUBMITTED) return "submitted";
  if (state === TaskState.TASK_STATE_WORKING) return "working";
  if (state === TaskState.TASK_STATE_INPUT_REQUIRED || state === TaskState.TASK_STATE_AUTH_REQUIRED) return "input-required";
  if (state === TaskState.TASK_STATE_COMPLETED) return "completed";
  if (state === TaskState.TASK_STATE_CANCELED) return "canceled";
  if (state === TaskState.TASK_STATE_REJECTED) return "rejected";
  return "failed";
}
