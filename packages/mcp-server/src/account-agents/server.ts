export interface AccessibleAgentView {
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly availability: "online" | "unstable" | "offline";
  readonly accessScope: "owner" | "friend";
}

export interface AgentTaskView {
  readonly taskId: string;
  readonly agentId: string;
  readonly state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected";
  readonly text?: string;
  readonly artifactKinds?: readonly string[];
  readonly errorCode?: string;
}

export interface AccountAgentMcpPort {
  listAgents(query?: string): Promise<readonly AccessibleAgentView[]>;
  findAgent(query: string): Promise<AccessibleAgentView | undefined>;
  askAgent(agentId: string, question: string, waitMs: number, idempotencyKey?: string): Promise<AgentTaskView>;
  getTask(taskId: string): Promise<AgentTaskView | undefined>;
}

export const MCP_TOOLS = Object.freeze([
  tool("list_agents", "列出当前 Account Principal 现在有权调用的 Agents；只返回公开身份、可用性和有效访问范围。", objectSchema({
    query: { type: "string", description: "可选的名称或描述搜索词", minLength: 1, maxLength: 200 },
  })),
  tool("find_agent", "按 Agent ID 或名称查找一个当前可访问的 Agent；无权访问与不存在返回相同结果。", objectSchema({
    query: { type: "string", description: "Agent ID 或名称", minLength: 1, maxLength: 200 },
  }, ["query"])),
  tool("ask_agent", "通过标准 A2A 向一个当前可访问且在线的 Agent 提问；超时返回 Task ID，之后用 get_task 继续读取。", objectSchema({
    agent_id: identifierSchema("list_agents/find_agent 返回的 Agent ID"),
    question: { type: "string", description: "要询问的纯文本问题", minLength: 1, maxLength: 16_000 },
    wait_ms: { type: "integer", description: "等待终态的毫秒数；超过 30000 时按 30000 处理", minimum: 1, default: 30_000 },
    idempotency_key: { type: "string", description: "可选重试幂等键", minLength: 8, maxLength: 160, pattern: "^[A-Za-z0-9._:-]+$" },
  }, ["agent_id", "question"])),
  tool("get_task", "读取由当前 Principal 发起、且目标 Agent 仍可访问的一条 A2A Task 的最新标准状态与有界结果。", objectSchema({
    task_id: identifierSchema("ask_agent 返回的 Task ID"),
  }, ["task_id"])),
]);

export class AgentFabricMcpServer {
  constructor(readonly options: { readonly gateway: AccountAgentMcpPort }) {}

  async handle(message: unknown): Promise<unknown | undefined> {
    if (!message || typeof message !== "object" || Array.isArray(message)) return errorResponse(null, -32600, "invalid-request");
    const request = message as Record<string, unknown>;
    const id = request.id as string | number | null | undefined;
    if (request.method === "notifications/initialized") return undefined;
    if (request.method === "initialize") return success(id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "agent-fabric-agents", version: "0.2.0" } });
    if (request.method === "ping") return success(id, {});
    if (request.method === "tools/list") return success(id, { tools: MCP_TOOLS });
    if (request.method !== "tools/call") return errorResponse(id ?? null, -32601, "method-not-found");
    try {
      const params = toolCallParams(request.params);
      const name = requiredString(params.name, "tool-name-required", 160);
      const args = strictObject(params.arguments ?? {}, argumentsFor(name));
      const result = await this.#call(name, args);
      assertSafeMcpOutput(result);
      return success(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: failedTaskResult(result) });
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "tool-failed";
      return success(id, { content: [{ type: "text", text: `Agent Fabric 调用失败：${code}` }], isError: true });
    }
  }

  async #call(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (name === "list_agents") return { agents: await this.options.gateway.listAgents(optionalString(args.query, 200)) };
    if (name === "find_agent") {
      const agent = await this.options.gateway.findAgent(requiredString(args.query, "agent-query-required", 200));
      if (!agent) throw new Error("agent-not-found");
      return { agent };
    }
    if (name === "ask_agent") return { task: await this.options.gateway.askAgent(requiredString(args.agent_id, "agent-id-required", 160), requiredString(args.question, "question-required", 16_000), optionalInteger(args.wait_ms, 30_000, 1, 30_000), optionalString(args.idempotency_key, 160)) };
    if (name === "get_task") {
      const task = await this.options.gateway.getTask(requiredString(args.task_id, "task-id-required", 160));
      if (!task) throw new Error("task-not-found");
      return { task };
    }
    throw new Error("tool-not-found");
  }
}

export class LocalAccountAgentGatewayClient implements AccountAgentMcpPort {
  readonly endpoint: string;
  constructor(endpoint: string, readonly token: string, readonly fetchImpl: typeof fetch = fetch) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" || !["127.0.0.1", "::1", "localhost"].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error("local-host-endpoint-required");
    if (!token) throw new Error("local-host-token-required");
    this.endpoint = parsed.toString().replace(/\/$/u, "");
  }
  async listAgents(query?: string): Promise<readonly AccessibleAgentView[]> {
    const result = await this.#request<{ readonly agents: readonly AccessibleAgentView[] }>("GET", `/mcp/agents${query ? `?query=${encodeURIComponent(query)}` : ""}`);
    return result.agents;
  }
  findAgent(query: string): Promise<AccessibleAgentView | undefined> { return this.#request("GET", `/mcp/agents/resolve?query=${encodeURIComponent(query)}`); }
  askAgent(agentId: string, question: string, waitMs: number, idempotencyKey?: string): Promise<AgentTaskView> { return this.#request("POST", `/mcp/agents/${encodeURIComponent(agentId)}/ask`, { question, waitMs, ...(idempotencyKey ? { idempotencyKey } : {}) }); }
  getTask(taskId: string): Promise<AgentTaskView | undefined> { return this.#request("GET", `/mcp/tasks/${encodeURIComponent(taskId)}`); }
  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.endpoint}${path}`, { method, headers: { authorization: `Bearer ${this.token}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 404) return undefined as T;
    if (!response.ok) { const error = await response.json().catch(() => ({})) as { error?: string }; throw new Error(error.error ?? `local-host-http-${response.status}`); }
    return await response.json() as T;
  }
}

export function createMcpServerFromEnvironment(environment: NodeJS.ProcessEnv = process.env): AgentFabricMcpServer {
  const endpoint = environment.AGENT_FABRIC_LOCAL_HOST; const token = environment.AGENT_FABRIC_MCP_LOCAL_TOKEN;
  if (!endpoint || !token) throw new Error("mcp-local-configuration-required");
  return new AgentFabricMcpServer({ gateway: new LocalAccountAgentGatewayClient(endpoint, token) });
}

function argumentsFor(name: string): readonly string[] { if (name === "list_agents") return ["query"]; if (name === "find_agent") return ["query"]; if (name === "ask_agent") return ["agent_id", "question", "wait_ms", "idempotency_key"]; if (name === "get_task") return ["task_id"]; throw new Error("tool-not-found"); }
function tool(name: string, description: string, inputSchema: Record<string, unknown>) { return Object.freeze({ name, description, inputSchema }); }
function objectSchema(properties: Record<string, unknown>, required: readonly string[] = []) { return { type: "object", properties, required, additionalProperties: false }; }
function identifierSchema(description: string) { return { type: "string", description, minLength: 1, maxLength: 160, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" }; }
function strictObject(value: unknown, allowed: readonly string[]): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object-required"); const record = value as Record<string, unknown>; if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error("additional-property-forbidden"); return record; }
function toolCallParams(value: unknown): Record<string, unknown> { const params = strictObject(value, ["name", "arguments", "_meta"]); if (params._meta !== undefined && (!params._meta || typeof params._meta !== "object" || Array.isArray(params._meta))) throw new Error("protocol-meta-invalid"); return params; }
function requiredString(value: unknown, code: string, maximum: number): string { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(code); return value.trim(); }
function optionalString(value: unknown, maximum: number): string | undefined { return value === undefined ? undefined : requiredString(value, "string-invalid", maximum); }
function optionalInteger(value: unknown, fallback: number, minimum: number, maximum: number): number { if (value === undefined) return fallback; if (!Number.isInteger(value) || (value as number) < minimum) throw new Error("wait-ms-invalid"); return Math.min(value as number, maximum); }
function success(id: unknown, result: unknown) { return { jsonrpc: "2.0", id: id ?? null, result }; }
function errorResponse(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

function assertSafeMcpOutput(value: unknown): void {
  const forbiddenKeys = /(?:^|_)(?:token|credential|invitation|environment_value|private_instruction|cwd|absolute_path|runtime_session|session_handle)(?:$|_)/iu;
  const visit = (candidate: unknown, depth: number): void => {
    if (depth > 12) throw new Error("sensitive-output-blocked");
    if (typeof candidate === "string") {
      if (candidate.length > 100_000 || /(?:^|[\s"'])(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/u.test(candidate)) throw new Error("sensitive-output-blocked");
      return;
    }
    if (Array.isArray(candidate)) { if (candidate.length > 1_000) throw new Error("sensitive-output-blocked"); for (const item of candidate) visit(item, depth + 1); return; }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) {
      if (forbiddenKeys.test(key)) throw new Error("sensitive-output-blocked");
      visit(item, depth + 1);
    }
  };
  visit(value, 0);
}

function failedTaskResult(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const task = (value as Record<string, unknown>).task;
  if (!task || typeof task !== "object" || Array.isArray(task)) return false;
  const state = (task as Record<string, unknown>).state;
  return state === "failed" || state === "rejected";
}
