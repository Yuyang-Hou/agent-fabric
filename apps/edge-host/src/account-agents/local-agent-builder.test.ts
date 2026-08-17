import { describe, expect, it, vi } from "vitest";

import type { RuntimeAdapter } from "@agent-fabric/runtime-contract";

import { LocalAgentBuilder } from "./local-agent-builder.js";

const configuration = { instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [] };

describe("LocalAgentBuilder", () => {
  it("reuses one local Runtime session for multiple turns and returns a bounded proposal", async () => {
    const adapter = fakeAdapter([
      '{"name":"研究助手","description":"整理证据","instructions":"使用来源"}',
      '{"name":"研究助手","description":"整理证据并列出风险","instructions":"使用来源并区分事实和推断"}',
    ]);
    const builder = new LocalAgentBuilder(adapter, "/private/workspace");

    await expect(builder.turn({ text: "帮我研究", configuration })).resolves.toMatchObject({ proposal: { name: "研究助手" } });
    await expect(builder.turn({ text: "再列出风险", configuration })).resolves.toMatchObject({ proposal: { description: "整理证据并列出风险" } });

    expect(adapter.createSession).toHaveBeenCalledTimes(1);
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    await builder.close();
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed Runtime output without exposing a partial proposal", async () => {
    const builder = new LocalAgentBuilder(fakeAdapter(["not-json"]), "/private/workspace");
    await expect(builder.turn({ text: "hello", configuration })).rejects.toThrow("builder-output-malformed");
  });
});

function fakeAdapter(outputs: string[]): RuntimeAdapter {
  return {
    detect: vi.fn().mockResolvedValue({ status: "ready", runtimeName: "Codex", runtimeVersion: "1", authenticated: true }),
    inspectCapabilities: vi.fn(),
    listResumableSessions: vi.fn(),
    createSession: vi.fn().mockResolvedValue({ handle: "private-session", createdAt: new Date().toISOString(), resumed: false, capabilityProfile: { publicCapabilities: ["text"], fingerprint: "test" } }),
    resumeSession: vi.fn(),
    execute: vi.fn(async function* () { const output = outputs.shift() ?? "{}"; yield { type: "completed" as const, taskId: "turn", output }; }),
    cancel: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}
