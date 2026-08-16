import { describe, expect, it, vi } from "vitest";

import { FileBackedAccountAgentGateway } from "./configured-gateway.js";

const expiresAt = "2026-08-16T00:00:00.000Z";

describe("FileBackedAccountAgentGateway", () => {
  it("uses a replacement Desktop loopback configuration without restarting", async () => {
    let configuration = config("http://127.0.0.1:41001", "token-one");
    const requests: Array<{ readonly url: string; readonly authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify({ agents: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const gateway = new FileBackedAccountAgentGateway("/private/account-agents-mcp.json", {
      readFile: async () => configuration,
      fetchImpl,
      now: () => Date.parse("2026-08-15T00:00:00.000Z"),
    });

    await gateway.listAgents();
    configuration = config("http://127.0.0.1:42002", "token-two");
    await gateway.listAgents();

    expect(requests).toEqual([
      { url: "http://127.0.0.1:41001/mcp/agents", authorization: "Bearer token-one" },
      { url: "http://127.0.0.1:42002/mcp/agents", authorization: "Bearer token-two" },
    ]);
  });

  it("recovers on a later operation after the private configuration is temporarily unavailable", async () => {
    const readFile = vi.fn()
      .mockRejectedValueOnce(new Error("ENOENT:/private/account-agents-mcp.json"))
      .mockResolvedValueOnce("not-json")
      .mockResolvedValueOnce(config("http://127.0.0.1:43003", "token-three"));
    const gateway = new FileBackedAccountAgentGateway("/private/account-agents-mcp.json", {
      readFile,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ agents: [] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
      now: () => Date.parse("2026-08-15T00:00:00.000Z"),
    });

    await expect(gateway.listAgents()).rejects.toThrow("mcp-local-configuration-unavailable");
    await expect(gateway.listAgents()).rejects.toThrow("mcp-local-configuration-unavailable");
    await expect(gateway.listAgents()).resolves.toEqual([]);
  });

  it("rejects expired configuration without exposing its values", async () => {
    const gateway = new FileBackedAccountAgentGateway("/private/secret-config.json", {
      readFile: async () => JSON.stringify({ localHost: "http://127.0.0.1:44004", localToken: "do-not-expose", localTokenExpiresAt: "2026-08-14T00:00:00.000Z" }),
      now: () => Date.parse("2026-08-15T00:00:00.000Z"),
    });

    await expect(gateway.listAgents()).rejects.toThrow("mcp-local-configuration-unavailable");
  });
});

function config(localHost: string, localToken: string): string {
  return JSON.stringify({ localHost, localToken, localTokenExpiresAt: expiresAt });
}
