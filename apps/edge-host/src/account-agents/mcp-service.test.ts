import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AccountAgentMcpService } from "./mcp-service.js";

describe("AccountAgentMcpService", () => {
  it("persists only the independent local credential and revokes/removes it on stop", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-account-mcp-"));
    const service = new AccountAgentMcpService();
    const started = await service.start({
      gateway: { listAgents: async () => [], findAgent: async () => undefined, askAgent: async () => ({ taskId: "task:one", agentId: "agent:one", state: "working" }), getTask: async () => undefined },
      binding: { accountId: "account:one", userId: "human:one", credentialExpiresAt: "2099-01-01T00:00:00.000Z" },
      dataDirectory: directory,
    });
    const contents = JSON.parse(await readFile(started.configFile, "utf8")) as Record<string, unknown>;
    expect(contents).toMatchObject({ localHost: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/u), localToken: expect.any(String), localTokenExpiresAt: started.localTokenExpiresAt });
    expect(JSON.stringify(contents)).not.toMatch(/account:one|human:one|cloud|session-secret/u);
    expect((await stat(started.configFile)).mode & 0o077).toBe(0);
    await service.stop();
    await expect(stat(started.configFile)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
