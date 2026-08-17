import type { AgentRuntime } from "@agent-fabric/account-agent-domain";
import type { RuntimeAdapter } from "@agent-fabric/runtime-contract";

import { discoverAccountRuntime } from "./runtime-discovery.js";
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

export interface AccountRuntimeProviderConfig {
  readonly provider: string;
  readonly adapterId: string;
  readonly adapter: RuntimeAdapter;
  readonly name: string;
  readonly visibility?: AgentRuntime["visibility"];
}

export interface AccountRuntimeRegistrationOptions {
  readonly cloud: AccountRuntimeRegistrationCloudPort;
  readonly providers: readonly AccountRuntimeProviderConfig[];
  readonly server: string;
  readonly accountSessionToken: string;
  readonly accountId: string;
  readonly userId: string;
  readonly workspaceRoot: string;
  readonly privateConfigurationStore?: AccountRuntimeTunnelClientOptions["privateConfigurationStore"];
  readonly tunnelFactory?: (options: AccountRuntimeTunnelClientOptions) => Pick<AccountRuntimeTunnelClient, "start" | "stop">;
  readonly detectionTimeoutMs?: number;
}

interface Registered {
  readonly config: AccountRuntimeProviderConfig;
  runtime: AgentRuntime;
  tunnel: Pick<AccountRuntimeTunnelClient, "start" | "stop">;
}

/**
 * Owns N authenticated Account Runtime registrations — one per detected
 * provider — and the WebSocket tunnels that back them. Each provider gets its
 * own registration + tunnel; the map is keyed by the cloud-assigned runtimeId
 * so refresh() can route to a single adapter's `discoverAccountRuntime()`
 * without pulling every other provider's health through the same pipe.
 */
export class AccountRuntimeRegistrationService {
  #registrations = new Map<string, Registered>();
  #refreshing = new Map<string, Promise<AgentRuntime>>();
  #starting: Promise<readonly AgentRuntime[]> | undefined;

  constructor(readonly options: AccountRuntimeRegistrationOptions) {
    if (!options.providers.length) throw new Error("account-runtime-registration-providers-required");
  }

  get runtimes(): readonly AgentRuntime[] {
    return [...this.#registrations.values()].map((entry) => entry.runtime);
  }

  async start(): Promise<readonly AgentRuntime[]> {
    if (this.#registrations.size > 0) throw new Error("account-runtime-registration-already-started");
    if (this.#starting) return this.#starting;
    const work = this.#start();
    this.#starting = work;
    try { return await work; }
    finally { this.#starting = undefined; }
  }

  async #start(): Promise<readonly AgentRuntime[]> {
    const existing = await this.options.cloud.listRuntimes();
    const started: Registered[] = [];
    try {
      for (const config of this.options.providers) {
        const observation = await discoverAccountRuntime(config.adapter, config.provider, config.adapterId, new Date().toISOString(), this.options.detectionTimeoutMs);
        const matching = existing
          .filter((runtime) => runtime.accountId === this.options.accountId && runtime.ownerUserId === this.options.userId && runtime.provider === config.provider && runtime.adapterId === config.adapterId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.runtimeId.localeCompare(left.runtimeId))[0];
        let runtime = matching
          ? await this.options.cloud.observeRuntime(matching.runtimeId, { health: observation.health, capabilities: observation.capabilities, expectedVersion: matching.version })
          : await this.options.cloud.registerRuntime({
              provider: config.provider,
              adapterId: config.adapterId,
              name: config.name,
              visibility: config.visibility ?? "private",
              health: observation.health,
              capabilities: observation.capabilities,
            });
        const createTunnel = this.options.tunnelFactory ?? ((options) => new AccountRuntimeTunnelClient(options));
        const tunnel = createTunnel({
          server: this.options.server,
          accountSessionToken: this.options.accountSessionToken,
          runtimeId: runtime.runtimeId,
          workspaceRoot: this.options.workspaceRoot,
          adapter: config.adapter,
          provider: config.provider,
          adapterId: config.adapterId,
          ...(this.options.privateConfigurationStore ? { privateConfigurationStore: this.options.privateConfigurationStore } : {}),
        });
        try {
          await tunnel.start();
        } catch (error) {
          runtime = await this.options.cloud.observeRuntime(runtime.runtimeId, { health: "offline", capabilities: runtime.capabilities, expectedVersion: runtime.version }).catch(() => runtime);
          throw error;
        }
        const entry: Registered = { config, runtime, tunnel };
        this.#registrations.set(runtime.runtimeId, entry);
        started.push(entry);
      }
      return started.map((entry) => entry.runtime);
    } catch (error) {
      await Promise.allSettled(started.map((entry) => entry.tunnel.stop()));
      for (const entry of started) this.#registrations.delete(entry.runtime.runtimeId);
      throw error;
    }
  }

  refresh(runtimeId: string, expectedVersion: number): Promise<AgentRuntime> {
    const entry = this.#registrations.get(runtimeId);
    if (!entry) return Promise.reject(new Error("runtime-refresh-not-local"));
    const pending = this.#refreshing.get(runtimeId);
    if (pending) return pending;
    const work = this.#refresh(entry, expectedVersion);
    this.#refreshing.set(runtimeId, work);
    void work.finally(() => { if (this.#refreshing.get(runtimeId) === work) this.#refreshing.delete(runtimeId); }).catch(() => undefined);
    return work;
  }

  async #refresh(entry: Registered, expectedVersion: number): Promise<AgentRuntime> {
    const checking = await this.options.cloud.refreshRuntime(entry.runtime.runtimeId, expectedVersion);
    entry.runtime = checking;
    const observation = await discoverAccountRuntime(entry.config.adapter, entry.config.provider, entry.config.adapterId, new Date().toISOString(), this.options.detectionTimeoutMs);
    const terminal = await this.options.cloud.observeRuntime(entry.runtime.runtimeId, {
      health: observation.health,
      capabilities: observation.capabilities,
      expectedVersion: checking.version,
    });
    entry.runtime = terminal;
    return terminal;
  }

  async stop(): Promise<void> {
    const entries = [...this.#registrations.values()];
    this.#registrations.clear();
    this.#refreshing.clear();
    await Promise.allSettled(entries.map((entry) => entry.tunnel.stop()));
  }
}
