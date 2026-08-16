import { AccountAgentMcpService } from "@agent-fabric/edge-host";

import { AccountAgentCloudGateway } from "./account-agent-cloud-gateway.js";

export class DesktopAccountAgentMcp {
  readonly #service = new AccountAgentMcpService();

  async start(input: { readonly serverBaseUrl: string; readonly accountSessionToken: string; readonly accountId: string; readonly userId: string; readonly sessionExpiresAt: string; readonly dataDirectory: string }): Promise<{ readonly configFile: string; readonly localTokenExpiresAt: string }> {
    const gateway = new AccountAgentCloudGateway(input.serverBaseUrl, input.accountSessionToken);
    return this.#service.start({
      gateway,
      binding: { accountId: input.accountId, userId: input.userId, credentialExpiresAt: input.sessionExpiresAt },
      dataDirectory: input.dataDirectory,
    });
  }

  stop(): Promise<void> { return this.#service.stop(); }
}
