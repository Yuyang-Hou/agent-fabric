import type { AgentRuntime } from "@agent-fabric/account-agent-domain";
import type { RuntimeAdapter } from "@agent-fabric/runtime-contract";

import { discoverCodexAccountRuntime } from "./runtime-discovery.js";
import { AccountRuntimeTunnelClient, type AccountRuntimeTunnelClientOptions } from "./runtime-tunnel-client.js";

export interface AccountRuntimeRegistrationCloudPort {
  listRuntimes(): Promise<readonly AgentRuntime[]>;
  registerRuntime(input: {
    readonly provider: string;
    readonly adapterId: string;
    readonly name: string;
    readonly visibility: AgentRuntime["visibility"];
    readonly health: AgentRuntime["health"];
    readonly capabilities: AgentRuntime["capabilities"];
  }): Promise<AgentRuntime>;
  observeRuntime(runtimeId: string, input: {
    readonly health: AgentRuntime["health"];
    readonly capabilities: AgentRuntime["capabilities"];
    readonly expectedVersion: number;
  }): Promise<AgentRuntime>;
  refreshRuntime(runtimeId: string, expectedVersion: number): Promise<AgentRuntime>;
}

export interface AccountRuntimeRegistrationOptions {
  readonly cloud: AccountRuntimeRegistrationCloudPort;
  readonly adapter: RuntimeAdapter;
  readonly server: string;
  readonly accountSessionToken: string;
  readonly accountId: string;
  readonly userId: string;
  readonly workspaceRoot: string;
  readonly name: string;
  readonly visibility?: AgentRuntime["visibility"];
  readonly privateConfigurationStore?: AccountRuntimeTunnelClientOptions["privateConfigurationStore"];
  readonly tunnelFactory?: (options: AccountRuntimeTunnelClientOptions) => Pick<AccountRuntimeTunnelClient, "start" | "stop">;
  readonly detectionTimeoutMs?: number;
}

/** Owns one authenticated Account Runtime registration and its execution tunnel. */
export class AccountRuntimeRegistrationService {
  #tunnel: Pick<AccountRuntimeTunnelClient, "start" | "stop"> | undefined;
  #runtime: AgentRuntime | undefined;
  #refreshing: Promise<AgentRuntime> | undefined;

  constructor(readonly options: AccountRuntimeRegistrationOptions) {}

  get runtime(): AgentRuntime | undefined { return this.#runtime; }

  async start(): Promise<AgentRuntime> {
    if (this.#tunnel) throw new Error("account-runtime-registration-already-started");
    const observation = await discoverCodexAccountRuntime(this.options.adapter, new Date().toISOString(), this.options.detectionTimeoutMs);
    const runtimes = await this.options.cloud.listRuntimes();
    const matching = runtimes
      .filter((runtime) => runtime.accountId === this.options.accountId && runtime.ownerUserId === this.options.userId && runtime.provider === observation.provider && runtime.adapterId === observation.adapterId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.runtimeId.localeCompare(left.runtimeId))[0];
    let runtime = matching
      ? await this.options.cloud.observeRuntime(matching.runtimeId, { health: observation.health, capabilities: observation.capabilities, expectedVersion: matching.version })
      : await this.options.cloud.registerRuntime({
          provider: observation.provider,
          adapterId: observation.adapterId,
          name: this.options.name,
          visibility: this.options.visibility ?? "private",
          health: observation.health,
          capabilities: observation.capabilities,
        });
    const createTunnel = this.options.tunnelFactory ?? ((options) => new AccountRuntimeTunnelClient(options));
    const tunnel = createTunnel({
      server: this.options.server,
      accountSessionToken: this.options.accountSessionToken,
      runtimeId: runtime.runtimeId,
      workspaceRoot: this.options.workspaceRoot,
      adapter: this.options.adapter,
      ...(this.options.privateConfigurationStore ? { privateConfigurationStore: this.options.privateConfigurationStore } : {}),
    });
    try {
      await tunnel.start();
    } catch (error) {
      runtime = await this.options.cloud.observeRuntime(runtime.runtimeId, { health: "offline", capabilities: runtime.capabilities, expectedVersion: runtime.version }).catch(() => runtime);
      throw error;
    }
    this.#runtime = runtime;
    this.#tunnel = tunnel;
    return runtime;
  }

  refresh(runtimeId: string, expectedVersion: number): Promise<AgentRuntime> {
    const runtime = this.#runtime;
    if (!runtime || runtime.runtimeId !== runtimeId) return Promise.reject(new Error("runtime-refresh-not-local"));
    if (this.#refreshing) return this.#refreshing;
    const work = this.#refresh(runtimeId, expectedVersion);
    this.#refreshing = work;
    void work.finally(() => { if (this.#refreshing === work) this.#refreshing = undefined; }).catch(() => undefined);
    return work;
  }

  async #refresh(runtimeId: string, expectedVersion: number): Promise<AgentRuntime> {
    const checking = await this.options.cloud.refreshRuntime(runtimeId, expectedVersion);
    this.#runtime = checking;
    const observation = await discoverCodexAccountRuntime(this.options.adapter, new Date().toISOString(), this.options.detectionTimeoutMs);
    const terminal = await this.options.cloud.observeRuntime(runtimeId, {
      health: observation.health,
      capabilities: observation.capabilities,
      expectedVersion: checking.version,
    });
    this.#runtime = terminal;
    return terminal;
  }

  async stop(): Promise<void> {
    const tunnel = this.#tunnel;
    this.#tunnel = undefined;
    this.#runtime = undefined;
    this.#refreshing = undefined;
    await tunnel?.stop();
  }
}
