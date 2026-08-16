import { accountResourceInvalidationSchema, type AccountResourceInvalidation } from "@agent-fabric/account-agent-domain";

export interface AccountEventsSocket {
  readonly readyState: number;
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: () => void): void;
  close(code?: number, reason?: string): void;
}

export interface AccountEventsSocketFactory {
  connect(url: string, authorization: string): AccountEventsSocket;
}

export class AccountProductInvalidationClient {
  #socket: AccountEventsSocket | undefined;
  #stopped = false;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #livenessTimer: ReturnType<typeof setTimeout> | undefined;
  #attempt = 0;

  constructor(readonly options: {
    readonly serverBaseUrl: string;
    readonly token: string;
    readonly socketFactory: AccountEventsSocketFactory;
    readonly onEvent: (event: AccountResourceInvalidation) => void;
    readonly onConnection?: (state: "online" | "reconnecting" | "offline") => void;
    readonly retryDelay?: (attempt: number) => number;
    readonly livenessTimeoutMs?: number;
  }) {}

  start(): void {
    if (this.#stopped || this.#socket) return;
    this.#connect();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    this.#clearLiveness();
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close(1000, "account-events-stopped");
    this.options.onConnection?.("offline");
  }

  #connect(): void {
    const url = new URL(this.options.serverBaseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/v1/account-events";
    url.search = "";
    url.hash = "";
    const socket = this.options.socketFactory.connect(url.toString(), `Bearer ${this.options.token}`);
    this.#socket = socket;
    socket.on("open", () => {
      if (this.#socket !== socket || this.#stopped) return;
      this.#attempt = 0;
      this.#armLiveness(socket);
      this.options.onConnection?.("online");
    });
    socket.on("message", (data) => {
      if (this.#socket !== socket || this.#stopped) return;
      const text = eventText(data);
      if (!text || text.length > 64_000) return;
      this.#armLiveness(socket);
      try { this.options.onEvent(accountResourceInvalidationSchema.parse(JSON.parse(text))); }
      catch { /* Invalid or unrelated frames are ignored without logging their content. */ }
    });
    socket.on("error", () => this.#disconnect(socket));
    socket.on("close", () => this.#disconnect(socket));
  }

  #armLiveness(socket: AccountEventsSocket): void {
    this.#clearLiveness();
    this.#livenessTimer = setTimeout(() => {
      if (this.#socket !== socket || this.#stopped) return;
      this.#disconnect(socket);
      socket.close(4000, "account-events-stale");
    }, this.options.livenessTimeoutMs ?? 30_000);
  }

  #disconnect(socket: AccountEventsSocket): void {
    if (this.#socket !== socket) return;
    this.#socket = undefined;
    this.#clearLiveness();
    if (this.#stopped) return;
    this.options.onConnection?.("reconnecting");
    const delay = this.options.retryDelay?.(this.#attempt) ?? Math.min(30_000, 500 * 2 ** this.#attempt);
    this.#attempt += 1;
    if (this.#retryTimer) return;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      if (!this.#stopped) this.#connect();
    }, delay);
  }

  #clearLiveness(): void {
    if (this.#livenessTimer) clearTimeout(this.#livenessTimer);
    this.#livenessTimer = undefined;
  }
}

function eventText(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return new TextDecoder().decode(data);
  if (data && typeof data === "object" && "toString" in data && typeof data.toString === "function") return data.toString();
  return undefined;
}
