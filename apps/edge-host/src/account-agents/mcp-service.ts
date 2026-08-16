import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { AccountAgentMcpLoopback, type AccountAgentGatewayPort, type AccountMcpPrincipalBinding } from "./mcp-loopback.js";

export class AccountAgentMcpService {
  #active: { readonly loopback: AccountAgentMcpLoopback; readonly configFile: string } | undefined;

  async start(input: { readonly gateway: AccountAgentGatewayPort; readonly binding: AccountMcpPrincipalBinding; readonly dataDirectory: string }): Promise<{ readonly configFile: string; readonly localTokenExpiresAt: string }> {
    await this.stop();
    const loopback = new AccountAgentMcpLoopback(input.gateway, { binding: input.binding });
    const config = await loopback.start();
    const configFile = join(input.dataDirectory, "account-agents-mcp.json");
    try {
      await writePrivateAtomic(configFile, JSON.stringify({ localHost: config.localHost, localToken: config.localToken, localTokenExpiresAt: config.localTokenExpiresAt }));
      this.#active = { loopback, configFile };
      return { configFile, localTokenExpiresAt: config.localTokenExpiresAt };
    } catch (error) {
      loopback.revoke();
      await loopback.stop().catch(() => undefined);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const active = this.#active;
    this.#active = undefined;
    if (!active) return;
    active.loopback.revoke();
    await active.loopback.stop().catch(() => undefined);
    await rm(active.configFile, { force: true }).catch(() => undefined);
  }
}

async function writePrivateAtomic(file: string, value: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, file);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
}
