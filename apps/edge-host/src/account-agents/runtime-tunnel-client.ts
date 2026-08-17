import { accountRuntimeClientEnvelopeSchema, accountRuntimeServerEnvelopeSchema, type RuntimeHealth } from "@agent-fabric/account-agent-domain";
import { Task } from "@agent-fabric/a2a-task";
import type { RuntimeAdapter } from "@agent-fabric/runtime-contract";
import { WebSocket, type ClientOptions } from "ws";

import { AccountAgentRuntimeExecutor } from "./runtime-executor.js";
import { discoverAccountRuntime } from "./runtime-discovery.js";
import type { AccountAgentPrivateConfigurationStore } from "./private-configuration.js";

export interface AccountRuntimeTunnelClientOptions {
  readonly server: string;
  readonly accountSessionToken: string;
  readonly runtimeId: string;
  readonly workspaceRoot: string;
  readonly adapter: RuntimeAdapter;
  /**
   * Identity fields used to tag heartbeats for the specific provider being
   * driven by this tunnel. Defaults keep back-compat with older callers that
   * always drove Codex over ACP.
   */
  readonly provider?: string;
  readonly adapterId?: string;
  readonly privateConfigurationStore?: AccountAgentPrivateConfigurationStore;
  readonly socketFactory?: (url: URL, options: ClientOptions) => WebSocket;
  readonly heartbeatMs?: number;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
}

export class AccountRuntimeTunnelClient {
  readonly executor: AccountAgentRuntimeExecutor;
  readonly #socketFactory: NonNullable<AccountRuntimeTunnelClientOptions["socketFactory"]>;
  #socket: WebSocket | undefined;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #keepAlive = false;
  #connectedOnce = false;
  #reconnectAttempt = 0;

  constructor(readonly options: AccountRuntimeTunnelClientOptions) {
    const server = new URL(options.server);
    if (server.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(server.hostname)) throw new Error("account-runtime-insecure-server-origin");
    if (!options.accountSessionToken || !options.runtimeId) throw new Error("account-runtime-configuration-required");
    this.executor = new AccountAgentRuntimeExecutor(options.adapter, options.workspaceRoot, options.privateConfigurationStore);
    this.#socketFactory = options.socketFactory ?? ((url, socketOptions) => new WebSocket(url, socketOptions));
  }

  async start(): Promise<void> {
    if (this.#keepAlive) throw new Error("account-runtime-already-started");
    this.#keepAlive = true;
    try {
      await this.#connect();
    } catch (error) {
      this.#keepAlive = false;
      this.#clearReconnect();
      throw error;
    }
  }

  async #connect(): Promise<void> {
    if (!this.#keepAlive || this.#socket) return;
    const url = new URL(this.options.server);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/v1/account-runtimes/connect";
    const socket = this.#socketFactory(url, { headers: { authorization: `Bearer ${this.options.accountSessionToken}`, "x-agent-fabric-runtime-id": this.options.runtimeId }, maxPayload: 1_048_576 });
    this.#socket = socket;
    socket.on("message", (data) => { void this.#handle(data.toString()).catch(() => socket.close(1008, "invalid-account-runtime-envelope")); });
    socket.on("close", () => this.#clearSocket(socket));
    socket.on("error", () => this.#clearSocket(socket));
    await waitForOpen(socket);
    if (!this.#keepAlive || this.#socket !== socket) throw new Error("account-runtime-offline");
    this.#connectedOnce = true;
    this.#reconnectAttempt = 0;
    await this.#heartbeatNow();
    if (!this.#keepAlive || this.#socket !== socket) throw new Error("account-runtime-offline");
    this.#heartbeat = setInterval(() => {
      void this.#heartbeatNow().catch(() => {
        if (this.#socket === socket) socket.close(1011, "account-runtime-heartbeat-failed");
        this.#clearSocket(socket);
      });
    }, this.options.heartbeatMs ?? 20_000);
  }

  async stop(): Promise<void> {
    this.#keepAlive = false;
    this.#connectedOnce = false;
    this.#reconnectAttempt = 0;
    this.#clearReconnect();
    this.#clearHeartbeat();
    const socket = this.#socket;
    this.#socket = undefined;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close(1000, "account-runtime-stopped");
    await this.executor.shutdown();
  }

  async #handle(raw: string): Promise<void> {
    const envelope = accountRuntimeServerEnvelopeSchema.parse(JSON.parse(raw));
    if (envelope.type === "task-cancel") {
      this.executor.cancel(envelope.taskId);
      const task = Task.fromJSON({ id: envelope.taskId, contextId: "", status: { state: "TASK_STATE_CANCELED", timestamp: new Date().toISOString() }, artifacts: [] });
      this.#send(accountRuntimeClientEnvelopeSchema.parse({ version: "1", type: "task-result", deliveryId: envelope.deliveryId, taskId: envelope.taskId, a2aTask: Task.toJSON(task) }));
      return;
    }
    if (envelope.type === "private-configuration-update") {
      try {
        const summary = await this.executor.replacePrivateConfiguration(envelope.agentId, envelope.configuration);
        this.#send(accountRuntimeClientEnvelopeSchema.parse({ version: "1", type: "private-configuration-result", deliveryId: envelope.deliveryId, agentId: envelope.agentId, status: "updated", summary }));
      } catch {
        this.#send(accountRuntimeClientEnvelopeSchema.parse({ version: "1", type: "private-configuration-result", deliveryId: envelope.deliveryId, agentId: envelope.agentId, status: "failed", errorCode: "private-configuration-write-failed" }));
      }
      return;
    }
    const task = await this.executor.execute(envelope);
    this.#send(accountRuntimeClientEnvelopeSchema.parse({ version: "1", type: "task-result", deliveryId: envelope.deliveryId, taskId: envelope.taskId, a2aTask: Task.toJSON(task) }));
  }

  async #heartbeatNow(): Promise<void> {
    const observation = await discoverAccountRuntime(this.options.adapter, this.options.provider ?? "codex", this.options.adapterId ?? "codex-acp");
    const health: RuntimeHealth = observation.health;
    this.#send(accountRuntimeClientEnvelopeSchema.parse({ version: "1", type: "heartbeat", runtimeId: this.options.runtimeId, health, capabilities: observation.capabilities, runtimeSkills: observation.runtimeSkills, observedAt: observation.observedAt }));
  }

  #send(value: unknown): void {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN) throw new Error("account-runtime-offline");
    this.#socket.send(JSON.stringify(value));
  }

  #clearSocket(socket: WebSocket): void {
    if (this.#socket !== socket) return;
    this.#socket = undefined;
    this.#clearHeartbeat();
    if (this.#keepAlive && this.#connectedOnce) this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (!this.#keepAlive || this.#socket || this.#reconnectTimer) return;
    const base = Math.max(1, this.options.reconnectBaseMs ?? 500);
    const maximum = Math.max(base, this.options.reconnectMaxMs ?? 10_000);
    const delay = Math.min(maximum, base * 2 ** Math.min(this.#reconnectAttempt, 8));
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      if (!this.#keepAlive || this.#socket) return;
      void this.#connect().catch(() => this.#scheduleReconnect());
    }, delay);
  }

  #clearHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = undefined;
  }

  #clearReconnect(): void {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  }
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off("open", handleOpen);
      socket.off("error", handleError);
      socket.off("close", handleClose);
    };
    const handleOpen = () => { cleanup(); resolve(); };
    const handleError = () => { cleanup(); reject(new Error("account-runtime-connection-failed")); };
    const handleClose = () => { cleanup(); reject(new Error("account-runtime-connection-closed")); };
    socket.once("open", handleOpen);
    socket.once("error", handleError);
    socket.once("close", handleClose);
  });
}
