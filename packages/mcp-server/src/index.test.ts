import { describe, expect, it, vi } from "vitest";

import { AgentFabricMcpServer, LocalAccountAgentGatewayClient, MCP_TOOLS, type AccountAgentMcpPort } from "./index.js";

function fixture() {
  const gateway: AccountAgentMcpPort = {
    listAgents: vi.fn().mockResolvedValue([{ agentId: "agent:research", name: "Research", description: "Find facts", availability: "online", accessScope: "friend" }]),
    findAgent: vi.fn().mockResolvedValue({ agentId: "agent:research", name: "Research", description: "Find facts", availability: "online", accessScope: "friend" }),
    askAgent: vi.fn().mockResolvedValue({ taskId: "task:one", agentId: "agent:research", state: "completed", text: "answer" }),
    getTask: vi.fn().mockResolvedValue({ taskId: "task:one", agentId: "agent:research", state: "completed", text: "answer" }),
  };
  return { gateway, server: new AgentFabricMcpServer({ gateway }) };
}

describe("Account Agent MCP server", () => {
  it("publishes exactly the four approved tools", async () => {
    const { server } = fixture();
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(["list_agents", "find_agent", "ask_agent", "get_task"]);
    expect(JSON.stringify(MCP_TOOLS)).not.toMatch(/friend|invitation|publish|workspace|task_board/iu);
    expect(await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).toMatchObject({ result: { serverInfo: { name: "agent-fabric-agents", version: "0.2.0" } } });
    expect(await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })).toEqual({ jsonrpc: "2.0", id: 2, result: { tools: MCP_TOOLS } });
  });

  it("lists, resolves, asks, and continues only through the shared gateway", async () => {
    const { server, gateway } = fixture();
    expect(await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_agents", arguments: { query: "research" } } })).toMatchObject({ result: { isError: false, structuredContent: { agents: [{ agentId: "agent:research" }] } } });
    expect(await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "find_agent", arguments: { query: "Research" } } })).toMatchObject({ result: { structuredContent: { agent: { agentId: "agent:research" } } } });
    expect(await server.handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ask_agent", arguments: { agent_id: "agent:research", question: "What changed?", wait_ms: 20, idempotency_key: "retry:one" } } })).toMatchObject({ result: { structuredContent: { task: { taskId: "task:one", text: "answer" } } } });
    expect(gateway.askAgent).toHaveBeenCalledWith("agent:research", "What changed?", 20, "retry:one");
    await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_task", arguments: { task_id: "task:one" } } });
    expect(gateway.getTask).toHaveBeenCalledWith("task:one");
  });

  it("hides inaccessible existence and rejects unknown or expanded arguments", async () => {
    const { server, gateway } = fixture();
    vi.mocked(gateway.findAgent).mockResolvedValueOnce(undefined);
    expect(await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "find_agent", arguments: { query: "secret" } } })).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining("agent-not-found") }] } });
    for (const [name, args] of [["list_agent_friends", {}], ["ask_agent", { agent_id: "agent:one", question: "", extra: true }], ["create_agent", {}]] as const) {
      expect(await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } })).toMatchObject({ result: { isError: true } });
    }
  });

  it("uses only a loopback gateway and never sends a Cloud credential", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer local-mcp-secret" });
      expect(JSON.stringify(init)).not.toContain("cloud-secret");
      return new Response(JSON.stringify({ agents: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const client = new LocalAccountAgentGatewayClient("http://127.0.0.1:43123", "local-mcp-secret", fetchImpl);
    await expect(client.listAgents()).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:43123/mcp/agents", expect.any(Object));
    expect(() => new LocalAccountAgentGatewayClient("https://fabric.example", "cloud-secret")).toThrow("local-host-endpoint-required");
  });

  it("blocks sensitive fields and private paths from MCP results and errors", async () => {
    const { server, gateway } = fixture();
    vi.mocked(gateway.askAgent).mockResolvedValueOnce({ taskId: "task:one", agentId: "agent:research", state: "completed", text: "/Users/alice/private/secret.txt" });
    const pathResult = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask_agent", arguments: { agent_id: "agent:research", question: "where" } } });
    expect(pathResult).toMatchObject({ result: { isError: true, content: [{ text: "Agent Fabric 调用失败：sensitive-output-blocked" }] } });
    expect(JSON.stringify(pathResult)).not.toContain("/Users/alice");
    vi.mocked(gateway.getTask).mockResolvedValueOnce({ taskId: "task:two", agentId: "agent:research", state: "completed", credential_token: "secret" } as never);
    const secretResult = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_task", arguments: { task_id: "task:two" } } });
    expect(JSON.stringify(secretResult)).not.toContain("credential_token");
    expect(secretResult).toMatchObject({ result: { isError: true } });
  });

  it("marks an HTTP-success failed standard Task as an MCP error without hiding its state", async () => {
    const { server, gateway } = fixture();
    vi.mocked(gateway.askAgent).mockResolvedValueOnce({ taskId: "task:failed", agentId: "agent:research", state: "failed", errorCode: "agent-task-failed" });
    const response = await server.handle({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "ask_agent", arguments: { agent_id: "agent:research", question: "fail" } } });
    expect(response).toMatchObject({ result: { isError: true, structuredContent: { task: { taskId: "task:failed", state: "failed", errorCode: "agent-task-failed" } } } });
  });
});
