import {
  exerciseRuntimeAdapterContract,
  type RuntimeExecutionPolicy,
} from "@agent-fabric/runtime-contract";
import { describe, expect, it } from "vitest";

import { FakeRuntimeAdapter } from "./index.js";

export const readOnlyPolicy: RuntimeExecutionPolicy = {
  filesystem: "read-only",
  network: "deny",
  sideEffects: "deny",
  timeoutMs: 30_000,
  maxOutputCharacters: 10_000,
  maxOutputTokens: 2_000,
  maxConcurrency: 1,
  maxDelegationDepth: 0,
};

describe("Fake Runtime shared Adapter contract", () => {
  it("passes success, progress, multi-turn, cancellation and session isolation/loss", async () => {
    const result = await exerciseRuntimeAdapterContract(
      new FakeRuntimeAdapter(),
      { agentId: "agent-1", workspaceRoot: "/private/fixture" },
      readOnlyPolicy,
    );

    expect(result.successEvents.at(-1)?.type).toBe("completed");
    expect(result.continuationEvents.at(-1)?.type).toBe("completed");
    expect(result.cancellationEvents.at(-1)?.type).toBe("canceled");
    expect(result.sessionLossEvents.at(-1)?.type).toBe("session-lost");
  });

  it.each([
    ["fake:timeout", "timed-out"],
    ["fake:error", "failed"],
    ["fake:disconnect", "disconnected"],
    ["fake:session-loss", "session-lost"],
    ["fake:attention", "approval-required"],
  ] as const)("normalizes %s as %s", async (prompt, expected) => {
    const adapter = new FakeRuntimeAdapter();
    const session = await adapter.createSession({ agentId: "agent-1", workspaceRoot: "/fixture" });
    const events = [];
    for await (const event of adapter.execute(
      {
        sessionHandle: session.handle,
        taskId: "task-1",
        prompt: [{ type: "text", text: prompt }],
        policy: readOnlyPolicy,
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events.at(-1)?.type).toBe(expected);
  });

  it("reports authentication-required and supports truthful offline recovery", async () => {
    let detection = { status: "authentication-required", reasonCode: "codex-login-required" } as const;
    const adapter = new FakeRuntimeAdapter({ detection: () => detection });
    await expect(adapter.detect()).resolves.toEqual({ status: "authentication-required", reasonCode: "codex-login-required" });
    detection = { status: "ready", runtimeName: "agent-fabric-fake", runtimeVersion: "1.0.0", authenticated: true } as never;
    await expect(adapter.detect()).resolves.toMatchObject({ status: "ready", authenticated: true });
  });

  it("exposes capability mismatch instead of inventing cancellation support", async () => {
    const adapter = new FakeRuntimeAdapter({
      capabilities: {
        protocol: "fake", supportsResume: true, supportsClose: true, supportsCancellation: false, emitsProgress: true,
        inputMediaTypes: ["text/plain"], policy: { readOnly: true, networkDeny: true, sideEffectsDeny: true },
      },
    });
    await expect(adapter.inspectCapabilities()).resolves.toMatchObject({ supportsCancellation: false });
    await expect(exerciseRuntimeAdapterContract(adapter, { agentId: "agent-1", workspaceRoot: "/fixture" }, readOnlyPolicy)).rejects.toThrow("runtime-contract:capabilities-incomplete");
  });

  it("isolates concurrent Agents and enforces the caller concurrency budget", async () => {
    const adapter = new FakeRuntimeAdapter();
    const first = await adapter.createSession({ agentId: "agent:first", workspaceRoot: "/fixture" });
    const second = await adapter.createSession({ agentId: "agent:second", workspaceRoot: "/fixture" });
    const firstEventsPromise = collect(adapter.execute({ sessionHandle: first.handle, taskId: "task:first", prompt: [{ type: "text", text: "fake:delay" }], policy: readOnlyPolicy }, new AbortController().signal));
    await Promise.resolve();
    const secondEvents = await collect(adapter.execute({ sessionHandle: second.handle, taskId: "task:second", prompt: [{ type: "text", text: "hello" }], policy: readOnlyPolicy }, new AbortController().signal));
    expect(secondEvents.at(-1)).toMatchObject({ type: "failed", code: "concurrency-limit" });
    expect((await firstEventsPromise).at(-1)).toMatchObject({ type: "completed", output: expect.stringContaining("agent:first") });
  });
});

async function collect(events: AsyncIterable<unknown>): Promise<unknown[]> {
  const collected = [];
  for await (const event of events) collected.push(event);
  return collected;
}
