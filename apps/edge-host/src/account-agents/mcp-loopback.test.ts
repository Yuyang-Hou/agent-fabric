import { describe, expect, it, vi } from "vitest";

import { AccountAgentMcpLoopback } from "./mcp-loopback.js";

describe("Account Agent MCP loopback", () => {
  const binding = { accountId: "account:one", userId: "human:owner", credentialExpiresAt: "2099-01-01T00:00:00.000Z" } as const;
  it("authenticates locally and delegates discovery/question/task continuation to the A2A gateway port", async () => {
    const gateway = {
      listAgents: vi.fn().mockResolvedValue([{ agentId: "agent:one", name: "One", availability: "online", accessScope: "owner" }]),
      findAgent: vi.fn().mockResolvedValue({ agentId: "agent:one", name: "One", availability: "online", accessScope: "owner" }),
      askAgent: vi.fn().mockResolvedValue({ taskId: "task:one", agentId: "agent:one", state: "working" }),
      getTask: vi.fn().mockResolvedValue({ taskId: "task:one", agentId: "agent:one", state: "completed", text: "answer" }),
    };
    const loopback = new AccountAgentMcpLoopback(gateway, { binding });
    const config = await loopback.start();
    const headers = { authorization: `Bearer ${config.localToken}`, "content-type": "application/json" };
    try {
      expect((await fetch(`${config.localHost}/mcp/agents`)).status).toBe(401);
      expect(await fetch(`${config.localHost}/mcp/agents?query=one`, { headers }).then((response) => response.json())).toMatchObject({ agents: [{ agentId: "agent:one" }] });
      expect(await fetch(`${config.localHost}/mcp/agents/resolve?query=One`, { headers }).then((response) => response.json())).toMatchObject({ agentId: "agent:one" });
      expect(await fetch(`${config.localHost}/mcp/agents/agent%3Aone/ask`, { method: "POST", headers, body: JSON.stringify({ question: "hello", waitMs: 1000, idempotencyKey: "retry:one" }) }).then((response) => response.json())).toMatchObject({ taskId: "task:one", state: "working" });
      expect(gateway.askAgent).toHaveBeenCalledWith("agent:one", "hello", 1000, "retry:one");
      expect(await fetch(`${config.localHost}/mcp/tasks/task%3Aone`, { headers }).then((response) => response.json())).toMatchObject({ taskId: "task:one", state: "completed", text: "answer" });
    } finally { await loopback.stop(); }
  });

  it("keeps private fields out of bounded failure responses", async () => {
    const loopback = new AccountAgentMcpLoopback({ listAgents: async () => { throw new Error("gateway-failed:/Users/alice/token=secret"); }, findAgent: async () => undefined, askAgent: async () => ({}), getTask: async () => undefined }, { binding });
    const config = await loopback.start();
    try {
      const response = await fetch(`${config.localHost}/mcp/agents`, { headers: { authorization: `Bearer ${config.localToken}` } });
      const body = await response.json();
      expect(body).toEqual({ error: "gateway-failed" });
      expect(JSON.stringify(body)).not.toMatch(/Users|token|secret/iu);
    } finally { await loopback.stop(); }
  });

  it("binds, expires and revokes the independent least-privilege local credential", async () => {
    let current = 1_000;
    const loopback = new AccountAgentMcpLoopback({ listAgents: async () => [], findAgent: async () => undefined, askAgent: async () => ({}), getTask: async () => undefined }, { binding: { accountId: "account:one", userId: "human:owner", credentialExpiresAt: new Date(10_000).toISOString() }, now: () => current, tokenTtlMs: 1_000 });
    const config = await loopback.start();
    try {
      expect(config.localTokenExpiresAt).toBe(new Date(2_000).toISOString());
      expect(loopback.binding).toEqual({ accountId: "account:one", userId: "human:owner", credentialExpiresAt: new Date(10_000).toISOString() });
      expect((await fetch(`${config.localHost}/mcp/agents`, { headers: { authorization: `Bearer ${config.localToken}` } })).status).toBe(200);
      loopback.revoke();
      expect((await fetch(`${config.localHost}/mcp/agents`, { headers: { authorization: `Bearer ${config.localToken}` } })).status).toBe(401);
      const second = new AccountAgentMcpLoopback({ listAgents: async () => [], findAgent: async () => undefined, askAgent: async () => ({}), getTask: async () => undefined }, { binding: { accountId: "account:one", userId: "human:owner", credentialExpiresAt: new Date(10_000).toISOString() }, now: () => current, tokenTtlMs: 1_000 });
      const secondConfig = await second.start();
      current = 2_000;
      expect((await fetch(`${secondConfig.localHost}/mcp/agents`, { headers: { authorization: `Bearer ${secondConfig.localToken}` } })).status).toBe(401);
      await second.stop();
    } finally { await loopback.stop(); }
  });
});
