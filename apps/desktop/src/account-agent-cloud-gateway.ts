import { AgentFabricClient, type AccessibleAccountAgent, type AccountAgentTaskView } from "@agent-fabric/client";
import type { AccountAgentGatewayPort, AccountRuntimeRegistrationCloudPort } from "@agent-fabric/edge-host";

/**
 * Binds the local MCP loopback to one authenticated Account session. The
 * session token stays in Electron Main and is never handed to MCP or Renderer.
 */
export class AccountAgentCloudGateway implements AccountAgentGatewayPort, AccountRuntimeRegistrationCloudPort {
  readonly client: AgentFabricClient;

  constructor(serverBaseUrl: string, accountSessionToken: string, fetchImpl: typeof fetch = fetch) {
    this.client = new AgentFabricClient({ baseUrl: serverBaseUrl, token: accountSessionToken, fetchImpl });
  }

  listAgents(query?: string): Promise<readonly AccessibleAccountAgent[]> {
    return this.client.listInvokableAgents(query);
  }

  async findAgent(query: string): Promise<AccessibleAccountAgent | undefined> {
    const normalized = query.trim().toLocaleLowerCase();
    const agents = await this.client.listInvokableAgents(query);
    return agents.find((agent) => agent.agentId.toLocaleLowerCase() === normalized)
      ?? agents.find((agent) => agent.name.toLocaleLowerCase() === normalized)
      ?? (agents.length === 1 ? agents[0] : undefined);
  }

  askAgent(agentId: string, question: string, waitMs: number, idempotencyKey?: string): Promise<AccountAgentTaskView> {
    return this.client.askAccountAgent({ agentId, text: question, waitMs, ...(idempotencyKey ? { idempotencyKey } : {}) });
  }

  getTask(taskId: string): Promise<AccountAgentTaskView | undefined> {
    return this.client.getAccountAgentTask(taskId).catch((error: unknown) => {
      if (error instanceof Error && /(?:not-found|denied)/u.test(error.message)) return undefined;
      throw error;
    });
  }

  listRuntimes() { return this.client.listAccountRuntimes(); }

  registerRuntime(input: Parameters<AccountRuntimeRegistrationCloudPort["registerRuntime"]>[0]) {
    return this.client.registerAccountRuntime(input);
  }

  observeRuntime(runtimeId: string, input: Parameters<AccountRuntimeRegistrationCloudPort["observeRuntime"]>[1]) {
    return this.client.observeAccountRuntime(runtimeId, input);
  }

  refreshRuntime(runtimeId: string, expectedVersion: number) {
    return this.client.refreshAccountRuntime(runtimeId, expectedVersion);
  }
}
