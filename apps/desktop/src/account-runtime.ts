import { AccountRuntimeRegistrationService, EncryptedFileAccountAgentPrivateConfigurationStore, type AccountRuntimeProviderConfig, type AccountRuntimeRegistrationOptions, type PrivateConfigurationEncryptionPort } from "@agent-fabric/edge-host";

import { AccountAgentCloudGateway } from "./account-agent-cloud-gateway.js";

export interface DesktopAccountRuntimeStartInput extends Omit<AccountRuntimeRegistrationOptions, "cloud" | "privateConfigurationStore"> {
  readonly privateConfigurationDirectory: string;
  readonly encryption: PrivateConfigurationEncryptionPort;
}

/**
 * Owns the local Account Runtime registration service for the Desktop host.
 * The service registers every provider it's given (real Codex + stub-only
 * providers) with the cloud and starts their tunnels. `refresh` routes to the
 * matching provider's adapter by runtimeId.
 */
export class DesktopAccountRuntime {
  #service: AccountRuntimeRegistrationService | undefined;

  async start(input: DesktopAccountRuntimeStartInput): Promise<ReturnType<AccountRuntimeRegistrationService["start"]>> {
    if (this.#service) throw new Error("desktop-account-runtime-already-started");
    const service = new AccountRuntimeRegistrationService({
      ...input,
      cloud: new AccountAgentCloudGateway(input.server, input.accountSessionToken),
      privateConfigurationStore: new EncryptedFileAccountAgentPrivateConfigurationStore(input.privateConfigurationDirectory, input.encryption),
    });
    this.#service = service;
    try { return await service.start(); }
    catch (error) { this.#service = undefined; throw error; }
  }

  async stop(): Promise<void> {
    const service = this.#service;
    this.#service = undefined;
    await service?.stop();
  }

  refresh(runtimeId: string, expectedVersion: number) {
    const service = this.#service;
    if (!service) return Promise.reject(new Error("runtime-refresh-not-local"));
    return service.refresh(runtimeId, expectedVersion);
  }
}

export type { AccountRuntimeProviderConfig };
