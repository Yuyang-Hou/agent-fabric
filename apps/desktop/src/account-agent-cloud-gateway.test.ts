import { describe, expect, it, vi } from "vitest";

import { AccountAgentCloudGateway } from "./account-agent-cloud-gateway.js";

describe("AccountAgentCloudGateway", () => {
  it("binds discovery and standard A2A calls to the Main-process Account session token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/v1/invokable-agents?query=Research")) return new Response(JSON.stringify({ agents: [{ agentId: "agent:research", name: "Research", description: "", availability: "online", accessScope: "friend" }] }), { status: 200, headers: { "content-type": "application/json" } });
      throw new Error(`unexpected:${url}`);
    });
    const gateway = new AccountAgentCloudGateway("https://fabric.example", "account-session-secret", fetchImpl);
    await expect(gateway.findAgent("Research")).resolves.toMatchObject({ agentId: "agent:research" });
    expect(fetchImpl).toHaveBeenCalledWith("https://fabric.example/v1/invokable-agents?query=Research", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer account-session-secret" }) }));
  });
});
