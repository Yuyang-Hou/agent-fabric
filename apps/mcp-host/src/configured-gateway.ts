import type { AccountAgentMcpPort, AccessibleAgentView, AgentTaskView } from "@agent-fabric/mcp-server";
import { LocalAccountAgentGatewayClient } from "@agent-fabric/mcp-server";
import { readFile } from "node:fs/promises";

export interface FileBackedAccountAgentGatewayOptions {
  readonly readFile?: (file: string, encoding: "utf8") => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

/** Reloads the private loopback fact for every operation so Desktop can rotate it safely. */
export class FileBackedAccountAgentGateway implements AccountAgentMcpPort {
  readonly #readFile: NonNullable<FileBackedAccountAgentGatewayOptions["readFile"]>;
  readonly #fetchImpl: typeof fetch;
  readonly #now: () => number;

  constructor(readonly configFile: string, options: FileBackedAccountAgentGatewayOptions = {}) {
    if (!configFile) throw new Error("mcp-config-file-required");
    this.#readFile = options.readFile ?? readFile;
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  async listAgents(query?: string): Promise<readonly AccessibleAgentView[]> {
    return (await this.#client()).listAgents(query);
  }

  async findAgent(query: string): Promise<AccessibleAgentView | undefined> {
    return (await this.#client()).findAgent(query);
  }

  async askAgent(agentId: string, question: string, waitMs: number, idempotencyKey?: string): Promise<AgentTaskView> {
    return (await this.#client()).askAgent(agentId, question, waitMs, idempotencyKey);
  }

  async getTask(taskId: string): Promise<AgentTaskView | undefined> {
    return (await this.#client()).getTask(taskId);
  }

  async #client(): Promise<LocalAccountAgentGatewayClient> {
    try {
      const value: unknown = JSON.parse(await this.#readFile(this.configFile, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
      const config = value as Record<string, unknown>;
      if (typeof config.localHost !== "string" || typeof config.localToken !== "string" || typeof config.localTokenExpiresAt !== "string") throw new Error("invalid");
      const expiresAt = Date.parse(config.localTokenExpiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) throw new Error("expired");
      return new LocalAccountAgentGatewayClient(config.localHost, config.localToken, this.#fetchImpl);
    } catch {
      throw new Error("mcp-local-configuration-unavailable");
    }
  }
}
