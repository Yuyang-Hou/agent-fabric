import {
  exerciseRuntimeAdapterContract,
  type RuntimeExecutionPolicy,
} from "@agent-fabric/runtime-contract";
import { describe, expect, it, vi } from "vitest";

import {
  CodexAcpError,
  CodexAcpRuntimeAdapter,
  createCodexAcpProcessEnvironment,
  normalizeAcpFailure,
  selectLatestResumableSessions,
  type AcpRuntimeUpdate,
  type CodexAcpClient,
} from "./index.js";

const policy: RuntimeExecutionPolicy = {
  filesystem: "read-only",
  network: "deny",
  sideEffects: "deny",
  timeoutMs: 30_000,
  maxOutputCharacters: 10_000,
  maxOutputTokens: 2_000,
  maxConcurrency: 1,
  maxDelegationDepth: 0,
};

class FakeAcpClient implements CodexAcpClient {
  readonly sessions = new Set<string>();
  readonly turns = new Map<string, number>();
  readonly cancelWaiters = new Map<string, () => void>();
  readonly cancel = vi.fn(async (handle: string) => this.cancelWaiters.get(handle)?.());
  readonly close = vi.fn(async (handle: string) => {
    this.sessions.delete(handle);
  });
  disconnect: (() => void) | undefined;
  holdPrompts = false;
  promptError: Error | undefined;
  id = 0;

  async initialize() {
    return {
      runtimeName: "@agentclientprotocol/codex-acp",
      runtimeVersion: "1.1.14",
      supportsResume: true,
      supportsClose: true,
      supportsList: true,
    };
  }

  async listSessions() {
    return [...this.sessions].map((handle) => ({
      handle,
      title: `Session ${handle}`,
      workspaceRoot: "/private/fixture",
      updatedAt: "2026-08-10T00:00:00.000Z",
      capabilityProfile: testCapabilityProfile(),
    }));
  }

  async newSession() {
    const handle = `acp-session-${++this.id}`;
    this.sessions.add(handle);
    this.turns.set(handle, 0);
    return { handle, capabilityProfile: testCapabilityProfile() };
  }

  async resumeSession(handle: string) {
    if (!this.sessions.has(handle)) throw new CodexAcpError("session-lost");
    return testCapabilityProfile();
  }

  async prompt(
    handle: string,
    prompt: readonly [{ readonly type: "text"; readonly text: string }, ...Array<{
      readonly type: "text";
      readonly text: string;
    }>],
    onUpdate: (update: AcpRuntimeUpdate) => void,
  ) {
    if (!this.sessions.has(handle)) throw new CodexAcpError("session-lost");
    if (this.promptError) throw this.promptError;
    const turn = (this.turns.get(handle) ?? 0) + 1;
    this.turns.set(handle, turn);
    onUpdate({ type: "progress", stage: "analyzing" });
    if (this.holdPrompts) await new Promise<void>(() => undefined);
    if (prompt[0].text === "contract:cancel") {
      await new Promise<void>((resolve) => this.cancelWaiters.set(handle, resolve));
      return "cancelled" as const;
    }
    onUpdate({ type: "agent-text", text: `${handle}:turn-${turn}` });
    return "end_turn" as const;
  }

  shutdown(): void {}

  onDisconnect(listener: () => void): void {
    this.disconnect = listener;
  }
}

function testCapabilityProfile() {
  return {
    publicCapabilities: ["Codex test read-only"],
    fingerprint: "test-capability-fingerprint",
  };
}

describe("Codex ACP Runtime Adapter", () => {
  it("does not inherit a parent Codex task identity into the isolated Runtime", () => {
    const environment = createCodexAcpProcessEnvironment({
      CODEX_HOME: "/private/codex-home",
      CODEX_THREAD_ID: "parent-thread-secret",
      CODEX_CI: "1",
      CODEX_SANDBOX: "workspace-write",
      PATH: "/usr/bin",
    });

    expect(environment).toMatchObject({
      CODEX_HOME: "/private/codex-home",
      PATH: "/usr/bin",
      INITIAL_AGENT_MODE: "read-only",
      NO_BROWSER: "1",
    });
    expect(environment.CODEX_THREAD_ID).toBeUndefined();
    expect(environment.CODEX_CI).toBeUndefined();
    expect(environment.CODEX_SANDBOX).toBeUndefined();
  });

  it("projects the latest 100 sessions after scanning a larger bounded set", () => {
    const sessions = Array.from({ length: 120 }, (_, index) => ({
      handle: `session-${index}`,
      title: `Session ${index}`,
      workspaceRoot: "/private/fixture",
      updatedAt: new Date(Date.UTC(2026, 7, 10, 0, index)).toISOString(),
      capabilityProfile: testCapabilityProfile(),
    })).reverse();

    const selected = selectLatestResumableSessions(sessions);

    expect(selected).toHaveLength(100);
    expect(selected[0]?.handle).toBe("session-119");
    expect(selected.at(-1)?.handle).toBe("session-20");
  });

  it("passes the same Runtime contract as Fake Runtime", async () => {
    const client = new FakeAcpClient();
    const adapter = new CodexAcpRuntimeAdapter(
      { connect: vi.fn().mockResolvedValue(client) },
      () => "2026-08-10T00:00:00.000Z",
    );

    const result = await exerciseRuntimeAdapterContract(
      adapter,
      { agentId: "agent-1", workspaceRoot: "/private/fixture" },
      policy,
    );

    expect(result.successEvents.some((event) => event.type === "output-delta")).toBe(true);
    expect(result.cancellationEvents.at(-1)?.type).toBe("canceled");
    expect(client.cancel).toHaveBeenCalled();
  });

  it("normalizes process disconnect without leaking its raw diagnostics", async () => {
    const client = new FakeAcpClient();
    const adapter = new CodexAcpRuntimeAdapter({ connect: vi.fn().mockResolvedValue(client) });
    await adapter.detect();
    const session = await adapter.createSession({ agentId: "agent-1", workspaceRoot: "/secret/cwd" });
    client.holdPrompts = true;

    const eventsPromise = (async () => {
      const events = [];
      for await (const event of adapter.execute(
        {
          sessionHandle: session.handle,
          taskId: "task-1",
          prompt: [{ type: "text", text: "work" }],
          policy,
        },
        new AbortController().signal,
      )) {
        events.push(event);
      }
      return events;
    })();
    await vi.waitFor(() => expect(client.disconnect).toBeTypeOf("function"));
    client.disconnect?.();
    const events = await eventsPromise;

    expect(events.at(-1)).toEqual({ type: "disconnected", taskId: "task-1", retryable: true });
    expect(JSON.stringify(events)).not.toContain("/secret/cwd");
    expect(JSON.stringify(events)).not.toContain("private-token");
  });

  it("maps authentication, missing session and process failures to bounded codes", () => {
    expect(normalizeAcpFailure(new Error("login required"))).toBe("authentication-failed");
    expect(normalizeAcpFailure(new Error("session not found"))).toBe("session-lost");
    expect(normalizeAcpFailure(new Error("child process exited"))).toBe("process-exit");
  });

  it("does not expose ACP errors containing credentials, cwd, or private configuration", async () => {
    const client = new FakeAcpClient();
    client.promptError = new Error(
      "Bearer private-token failed in /Users/alice/private with runtime session hidden",
    );
    const adapter = new CodexAcpRuntimeAdapter({ connect: vi.fn().mockResolvedValue(client) });
    const session = await adapter.createSession({
      agentId: "agent-1",
      workspaceRoot: "/Users/alice/private",
      privateConfiguration: { credential: "private-token" },
    });
    const events = [];
    for await (const event of adapter.execute(
      {
        sessionHandle: session.handle,
        taskId: "task-1",
        prompt: [{ type: "text", text: "private prompt" }],
        policy,
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual({
      type: "failed",
      taskId: "task-1",
      code: "runtime-failed",
      retryable: false,
    });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("/Users/alice/private");
    expect(serialized).not.toContain("private prompt");
  });
});
