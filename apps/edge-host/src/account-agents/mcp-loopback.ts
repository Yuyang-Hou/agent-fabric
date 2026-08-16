import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface AccountAgentGatewayPort {
  listAgents(query?: string): Promise<readonly unknown[]>;
  findAgent(query: string): Promise<unknown | undefined>;
  askAgent(agentId: string, question: string, waitMs: number, idempotencyKey?: string): Promise<unknown>;
  getTask(taskId: string): Promise<unknown | undefined>;
}

export interface AccountMcpPrincipalBinding {
  readonly accountId: string;
  readonly userId: string;
  readonly credentialExpiresAt: string;
}

export interface AccountAgentMcpLoopbackOptions {
  readonly binding: AccountMcpPrincipalBinding;
  readonly maxBodyBytes?: number;
  readonly now?: () => number;
  readonly tokenTtlMs?: number;
}

export class AccountAgentMcpLoopback {
  readonly token = randomBytes(32).toString("base64url");
  readonly tokenExpiresAt: string;
  readonly binding: AccountMcpPrincipalBinding;
  readonly maxBodyBytes: number;
  readonly now: () => number;
  #revoked = false;
  readonly #server: Server;
  endpoint: string | undefined;

  constructor(readonly gateway: AccountAgentGatewayPort, options: AccountAgentMcpLoopbackOptions) {
    this.binding = options.binding;
    this.maxBodyBytes = options.maxBodyBytes ?? 32_768;
    this.now = options.now ?? Date.now;
    const credentialExpiry = Date.parse(options.binding.credentialExpiresAt);
    if (!options.binding.accountId || !options.binding.userId || !Number.isFinite(credentialExpiry) || credentialExpiry <= this.now()) throw new Error("mcp-principal-binding-invalid");
    this.tokenExpiresAt = new Date(Math.min(this.now() + (options.tokenTtlMs ?? 30 * 24 * 60 * 60 * 1000), credentialExpiry)).toISOString();
    this.#server = createServer((request, response) => void this.#handle(request, response));
  }

  async start(): Promise<{ readonly localHost: string; readonly localToken: string; readonly localTokenExpiresAt: string }> {
    if (this.endpoint) return { localHost: this.endpoint, localToken: this.token, localTokenExpiresAt: this.tokenExpiresAt };
    await new Promise<void>((resolve, reject) => { this.#server.once("error", reject); this.#server.listen(0, "127.0.0.1", () => { this.#server.off("error", reject); resolve(); }); });
    const address = this.#server.address();
    if (!address || typeof address === "string") throw new Error("mcp-loopback-address-unavailable");
    this.endpoint = `http://127.0.0.1:${address.port}`;
    return { localHost: this.endpoint, localToken: this.token, localTokenExpiresAt: this.tokenExpiresAt };
  }

  async stop(): Promise<void> {
    if (!this.#server.listening) return;
    await new Promise<void>((resolve, reject) => this.#server.close((error) => error ? reject(error) : resolve()));
    this.endpoint = undefined;
  }

  revoke(): void { this.#revoked = true; }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (this.#revoked || this.now() >= Date.parse(this.tokenExpiresAt) || !secureToken(this.token, bearer(request.headers.authorization))) throw new Error("local-authentication-required");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/mcp/agents") return json(response, 200, { agents: await this.gateway.listAgents(optionalQuery(url, "query")) });
      if (request.method === "GET" && url.pathname === "/mcp/agents/resolve") {
        const agent = await this.gateway.findAgent(requiredQuery(url, "query"));
        return agent === undefined ? json(response, 404, { error: "agent-not-found" }) : json(response, 200, agent);
      }
      const askMatch = /^\/mcp\/agents\/([^/]+)\/ask$/u.exec(url.pathname);
      if (request.method === "POST" && askMatch) {
        const body = await readBody(request, this.maxBodyBytes);
        const allowed = new Set(["question", "waitMs", "idempotencyKey"]);
        if (Object.keys(body).some((key) => !allowed.has(key))) throw new Error("request-invalid");
        return json(response, 200, await this.gateway.askAgent(decodeURIComponent(requiredCapture(askMatch[1])), requiredText(body.question, 16_000), boundedInteger(body.waitMs, 1, 30_000), optionalText(body.idempotencyKey, 160)));
      }
      const taskMatch = /^\/mcp\/tasks\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && taskMatch) {
        const task = await this.gateway.getTask(decodeURIComponent(requiredCapture(taskMatch[1])));
        return task === undefined ? json(response, 404, { error: "task-not-found" }) : json(response, 200, task);
      }
      json(response, 404, { error: "route-not-found" });
    } catch (error) {
      const code = error instanceof Error ? (error.message.split(":")[0] ?? "request-failed") : "request-failed";
      json(response, code.includes("authentication") ? 401 : 400, { error: code });
    }
  }
}

function bearer(value: string | undefined): string { return value?.startsWith("Bearer ") ? value.slice(7) : ""; }
function secureToken(expected: string, value: string): boolean { const left = createHash("sha256").update(expected).digest(); const right = createHash("sha256").update(value).digest(); return timingSafeEqual(left, right); }
function optionalQuery(url: URL, key: string): string | undefined { const value = url.searchParams.get(key)?.trim(); return value || undefined; }
function requiredQuery(url: URL, key: string): string { const value = optionalQuery(url, key); if (!value || value.length > 200) throw new Error("query-invalid"); return value; }
function requiredCapture(value: string | undefined): string { if (!value) throw new Error("identifier-invalid"); return value; }
function requiredText(value: unknown, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("request-invalid"); return value.trim(); }
function optionalText(value: unknown, max: number): string | undefined { return value === undefined ? undefined : requiredText(value, max); }
function boundedInteger(value: unknown, min: number, max: number): number { if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error("request-invalid"); return Number(value); }
async function readBody(request: IncomingMessage, max: number): Promise<Record<string, unknown>> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const data = Buffer.from(chunk); size += data.length; if (size > max) throw new Error("request-too-large"); chunks.push(data); } const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request-invalid"); return parsed as Record<string, unknown>; }
function json(response: ServerResponse, status: number, body: unknown): void { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(body)); }
