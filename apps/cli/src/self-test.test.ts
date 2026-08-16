import type { AccessibleAccountAgent, AccountSelfTestSession } from "@agent-fabric/client";
import { describe, expect, it, vi } from "vitest";

import { runIsolatedSelfTest, SelfTestError, type SelfTestManagementClient, type SelfTestMcpClient } from "./self-test.js";

const target = { agentId: "agent:squidward" };
const agent: AccessibleAccountAgent = { agentId: target.agentId, name: "章鱼哥", description: "", availability: "online", accessScope: "owner" };
const session: AccountSelfTestSession = {
  selfTestId: "self-test:one", accountId: "account:one", agentId: target.agentId,
  requester: { token: "temporary-private-token", principalId: "device:self-test", credentialId: "credential:self-test", expiresAt: "2026-08-12T00:10:00.000Z" },
};

function fixture(input: {
  readonly online?: boolean;
  readonly answer?: string;
  readonly failCleanup?: boolean;
  readonly revocationVisible?: boolean;
  readonly revokedAskCompletes?: boolean;
} = {}) {
  const calls: string[] = [];
  let revoked = false;
  const management: SelfTestManagementClient = {
    listInvokableAgents: vi.fn(async () => { calls.push("preflight"); return input.online === false ? [{ ...agent, availability: "offline" as const }] : [agent]; }),
    createAccountSelfTest: vi.fn(async () => { calls.push("credential"); return session; }),
    revokeAccountSelfTest: vi.fn(async () => {
      calls.push("revoke");
      if (input.failCleanup) throw new Error("cleanup-private-token");
      revoked = true;
      return { status: "revoked" };
    }),
  };
  const mcp: SelfTestMcpClient = {
    callTool: vi.fn(async (name) => {
      calls.push(name);
      if (name === "list_agents") {
        if (revoked && !input.revocationVisible) return mcpError();
        return mcpSuccess({ agents: [agent] });
      }
      if (name === "ask_agent") {
        if (revoked && !input.revokedAskCompletes) return mcpError();
        return mcpSuccess({ task: { taskId: "task:one", agentId: target.agentId, state: "completed", text: input.answer ?? "我在线，别烦我。" } });
      }
      return mcpSuccess({ task: { taskId: "task:one", agentId: target.agentId, state: "completed", text: input.answer ?? "我在线，别烦我。" } });
    }),
  };
  return { calls, management, mcp, connect: vi.fn(async () => mcp) };
}

describe("Account-scoped isolated self-test", () => {
  it("runs MCP discovery, standard A2A ask and Task read, then proves revocation", async () => {
    const test = fixture();
    const report = await runIsolatedSelfTest({
      management: test.management,
      target,
      connect: test.connect,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
      monotonicNow: (() => { let value = 100; return () => { value += 25; return value; }; })(),
    });
    expect(report).toMatchObject({ status: "passed", accountId: "account:one", agentId: target.agentId, cleanup: { selfTest: "revoked" } });
    expect(report.stages.map((stage) => stage.name)).toEqual(["preflight", "credential", "mcp-discovery", "a2a-ask", "mcp-task-read", "revocation", "revocation-enforced"]);
    expect(report.stages.map((stage) => stage.durationMs)).toEqual([25, 25, 25, 25, 25, 25, 25]);
    expect(report.stages.find((stage) => stage.name === "a2a-ask")).toMatchObject({ answerCharacters: 8 });
    expect(test.calls).toEqual(["preflight", "credential", "list_agents", "ask_agent", "get_task", "revoke", "list_agents", "ask_agent"]);
    expect(JSON.stringify(report)).not.toContain("temporary-private-token");
  });

  it("stops before issuing a credential when the target is offline", async () => {
    const test = fixture({ online: false });
    await expect(runIsolatedSelfTest({ management: test.management, target, connect: test.connect })).rejects.toMatchObject({
      code: "self-test-agent-unavailable", remediation: { stage: "preflight", failureClass: "preflight" },
    });
    expect(test.calls).toEqual(["preflight"]);
  });

  it("revokes the temporary credential when the real Agent answer is empty", async () => {
    const test = fixture({ answer: "" });
    await expect(runIsolatedSelfTest({ management: test.management, target, connect: test.connect })).rejects.toMatchObject({
      code: "self-test-answer-invalid", remediation: { selfTestId: "self-test:one", stage: "a2a-ask", failureClass: "invocation" },
    });
    expect(test.calls).toEqual(["preflight", "credential", "list_agents", "ask_agent", "revoke"]);
  });

  it("fails when discovery and invocation remain usable after revocation", async () => {
    const test = fixture({ revocationVisible: true, revokedAskCompletes: true });
    await expect(runIsolatedSelfTest({ management: test.management, target, connect: test.connect })).rejects.toMatchObject({ code: "self-test-revocation-not-enforced" });
  });

  it("requires invocation denial even if discovery hides the target", async () => {
    const test = fixture({ revokedAskCompletes: true });
    await expect(runIsolatedSelfTest({ management: test.management, target, connect: test.connect })).rejects.toMatchObject({ code: "self-test-revocation-not-enforced" });
  });

  it("returns stable remediation without leaking cleanup errors", async () => {
    const test = fixture({ answer: "", failCleanup: true });
    const error = await runIsolatedSelfTest({ management: test.management, target, connect: test.connect, cleanupDelay: async () => undefined }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SelfTestError);
    expect(error).toMatchObject({ code: "self-test-cleanup-failed", remediation: { selfTestId: "self-test:one", primaryCode: "self-test-answer-invalid", stage: "cleanup", failureClass: "cleanup" } });
    expect((error as Error).message).not.toContain("private-token");
    expect(test.calls.filter((call) => call === "revoke")).toHaveLength(3);
  });
});

function mcpSuccess(structuredContent: unknown): unknown {
  return { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent, isError: false } };
}

function mcpError(): unknown {
  return { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "denied" }], isError: true } };
}
