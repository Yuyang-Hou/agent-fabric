import { agentPrivateConfigurationSchema, type AgentPrivateConfiguration, type AgentPrivateConfigurationSummary } from "@agent-fabric/account-agent-domain";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AccountAgentPrivateConfigurationStore {
  get(agentId: string): Promise<AgentPrivateConfiguration | undefined>;
  replace(agentId: string, configuration: AgentPrivateConfiguration, updatedAt?: string): Promise<AgentPrivateConfigurationSummary>;
}

export class InMemoryAccountAgentPrivateConfigurationStore implements AccountAgentPrivateConfigurationStore {
  readonly #values = new Map<string, AgentPrivateConfiguration>();

  async get(agentId: string): Promise<AgentPrivateConfiguration | undefined> { return this.#values.get(agentId); }

  async replace(agentId: string, value: AgentPrivateConfiguration, updatedAt = new Date().toISOString()): Promise<AgentPrivateConfigurationSummary> {
    const configuration = agentPrivateConfigurationSchema.parse(value);
    this.#values.set(agentId, configuration);
    return summarizePrivateConfiguration(configuration, updatedAt);
  }
}

export interface PrivateConfigurationEncryptionPort {
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export class EncryptedFileAccountAgentPrivateConfigurationStore implements AccountAgentPrivateConfigurationStore {
  constructor(readonly directory: string, readonly encryption: PrivateConfigurationEncryptionPort) {
    if (!directory) throw new Error("private-configuration-directory-required");
  }

  async get(agentId: string): Promise<AgentPrivateConfiguration | undefined> {
    try {
      const encrypted = await readFile(this.#path(agentId));
      return agentPrivateConfigurationSchema.parse(JSON.parse(this.encryption.decrypt(encrypted)));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
      throw new Error("private-configuration-read-failed");
    }
  }

  async replace(agentId: string, value: AgentPrivateConfiguration, updatedAt = new Date().toISOString()): Promise<AgentPrivateConfigurationSummary> {
    const configuration = agentPrivateConfigurationSchema.parse(value);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = this.#path(agentId);
    const temporary = join(this.directory, `.private-configuration-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, this.encryption.encrypt(JSON.stringify(configuration)), { mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch {
      throw new Error("private-configuration-write-failed");
    }
    return summarizePrivateConfiguration(configuration, updatedAt);
  }

  #path(agentId: string): string {
    return join(this.directory, `${createHash("sha256").update(agentId).digest("hex")}.enc`);
  }
}

function summarizePrivateConfiguration(configuration: AgentPrivateConfiguration, updatedAt: string): AgentPrivateConfigurationSummary {
  return {
    environmentVariableNames: Object.keys(configuration.environmentValues).sort(),
    configuredMcpConnectionIds: Object.keys(configuration.mcpCredentials).sort(),
    configuredIntegrationIds: Object.keys(configuration.integrationCredentials).sort(),
    updatedAt,
  };
}
