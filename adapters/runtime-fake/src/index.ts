import type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeDetection,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeResumableSession,
  RuntimeSession,
  RuntimeSessionRequest,
} from "@agent-fabric/runtime-contract";

export const fakeRuntimeAdapterBoundary = "runtime-fake" as const;

export interface FakeRuntimeOptions {
  readonly now?: () => string;
  readonly nextId?: () => string;
  readonly detection?: RuntimeDetection | (() => RuntimeDetection | Promise<RuntimeDetection>);
  readonly capabilities?: RuntimeCapabilities;
  readonly existingSessions?: readonly {
    readonly handle: string;
    readonly title: string;
    readonly workspaceRoot: string;
    readonly updatedAt?: string;
    readonly publicCapabilities?: readonly string[];
  }[];
}

interface FakeSession {
  readonly session: RuntimeSession;
  readonly agentId: string;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly updatedAt: string;
  turn: number;
  active: boolean;
}

export class FakeRuntimeAdapter implements RuntimeAdapter {
  readonly #sessions = new Map<string, FakeSession>();
  readonly #now: () => string;
  readonly #nextId: () => string;
  readonly #detection: NonNullable<FakeRuntimeOptions["detection"]>;
  readonly #capabilities: RuntimeCapabilities | undefined;
  #activeExecutions = 0;
  readonly #sessionLossTasks = new Set<string>();
  #id = 0;

  constructor(options: FakeRuntimeOptions = {}) {
    this.#now = options.now ?? (() => "2026-08-10T00:00:00.000Z");
    this.#nextId = options.nextId ?? (() => `fake-session-${++this.#id}`);
    this.#detection = options.detection ?? { status: "ready", runtimeName: "agent-fabric-fake", runtimeVersion: "1.0.0", authenticated: true };
    this.#capabilities = options.capabilities;
    for (const existing of options.existingSessions ?? []) {
      const capabilityProfile = fakeCapabilityProfile(existing.publicCapabilities);
      this.#sessions.set(existing.handle, {
        session: {
          handle: existing.handle,
          createdAt: existing.updatedAt ?? this.#now(),
          resumed: false,
          capabilityProfile,
        },
        agentId: "unbound",
        title: existing.title,
        workspaceRoot: existing.workspaceRoot,
        updatedAt: existing.updatedAt ?? this.#now(),
        turn: 0,
        active: true,
      });
    }
  }

  async detect(): Promise<RuntimeDetection> {
    return typeof this.#detection === "function" ? this.#detection() : this.#detection;
  }

  async inspectCapabilities(): Promise<RuntimeCapabilities> {
    return this.#capabilities ?? {
      protocol: "fake",
      supportsResume: true,
      supportsClose: true,
      supportsCancellation: true,
      emitsProgress: true,
      inputMediaTypes: ["text/plain"],
      policy: { readOnly: true, networkDeny: true, sideEffectsDeny: true },
    };
  }

  async listResumableSessions(): Promise<readonly RuntimeResumableSession[]> {
    return [...this.#sessions.values()]
      .filter((entry) => entry.active)
      .map((entry) => ({
        handle: entry.session.handle,
        title: entry.title,
        workspaceRoot: entry.workspaceRoot,
        updatedAt: entry.updatedAt,
        capabilityProfile: entry.session.capabilityProfile,
      }));
  }

  async createSession(request: RuntimeSessionRequest): Promise<RuntimeSession> {
    const session: RuntimeSession = {
      handle: this.#nextId(),
      createdAt: this.#now(),
      resumed: false,
      capabilityProfile: fakeCapabilityProfile(),
    };
    this.#sessions.set(session.handle, {
      session,
      agentId: request.agentId,
      title: `Fake session ${session.handle}`,
      workspaceRoot: request.workspaceRoot,
      updatedAt: this.#now(),
      turn: 0,
      active: true,
    });
    return session;
  }

  async resumeSession(handle: string, request: RuntimeSessionRequest): Promise<RuntimeSession> {
    const current = this.#sessions.get(handle);
    if (!current || !current.active || (current.agentId !== "unbound" && current.agentId !== request.agentId)) {
      throw new FakeRuntimeError("session-lost");
    }
    if (current.agentId === "unbound") {
      this.#sessions.set(handle, { ...current, agentId: request.agentId });
    }
    return { ...current.session, resumed: true };
  }

  async *execute(request: RuntimeExecutionRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
    const session = this.#sessions.get(request.sessionHandle);
    if (!session?.active) {
      yield { type: "session-lost", taskId: request.taskId, retryable: true };
      return;
    }
    if (this.#activeExecutions >= request.policy.maxConcurrency) {
      yield {
        type: "failed",
        taskId: request.taskId,
        code: "concurrency-limit",
        retryable: true,
      };
      return;
    }

    this.#activeExecutions += 1;
    session.turn += 1;
    try {
      yield { type: "started", taskId: request.taskId };
      if (signal.aborted) {
        yield { type: "canceled", taskId: request.taskId };
        return;
      }
      yield {
        type: "progress",
        taskId: request.taskId,
        stage: "analyzing",
        completedUnits: 1,
        totalUnits: 2,
      };
      if (signal.aborted || request.prompt[0].text === "contract:cancel") {
        if (!signal.aborted) await waitForAbort(signal);
        yield { type: "canceled", taskId: request.taskId };
        return;
      }

      const prompt = request.prompt.map((part) => part.text).join("\n");
      if (prompt.includes("fake:timeout")) {
        yield { type: "timed-out", taskId: request.taskId };
        return;
      }
      if (prompt.includes("fake:disconnect")) {
        yield { type: "disconnected", taskId: request.taskId, retryable: true };
        return;
      }
      if (prompt.includes("fake:session-loss")) {
        if (!this.#sessionLossTasks.has(request.taskId)) {
          this.#sessionLossTasks.add(request.taskId);
          session.active = false;
          yield { type: "session-lost", taskId: request.taskId, retryable: true };
          return;
        }
      }
      if (prompt.includes("fake:error")) {
        yield {
          type: "failed",
          taskId: request.taskId,
          code: "runtime-failed",
          retryable: false,
        };
        return;
      }
      if (prompt.includes("fake:attention")) {
        yield { type: "approval-required", taskId: request.taskId, operation: "tool" };
        return;
      }
      const forbidden = /fake:forbidden:(tool|file|network|command|credential|other)/u.exec(prompt)?.[1] as "tool" | "file" | "network" | "command" | "credential" | "other" | undefined;
      if (forbidden) {
        yield { type: "forbidden-operation", taskId: request.taskId, operation: forbidden };
        return;
      }
      if (prompt.includes("fake:delay")) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      const output = `fake:${session.agentId}:turn-${session.turn}:${prompt}`.slice(
        0,
        request.policy.maxOutputCharacters,
      );
      yield { type: "progress", taskId: request.taskId, stage: "finalizing" };
      yield { type: "output-delta", taskId: request.taskId, text: output };
      yield { type: "completed", taskId: request.taskId, output };
    } finally {
      this.#activeExecutions -= 1;
    }
  }

  async cancel(handle: string): Promise<void> {
    if (!this.#sessions.has(handle)) throw new FakeRuntimeError("session-lost");
  }

  async close(handle: string): Promise<void> {
    const session = this.#sessions.get(handle);
    if (session) session.active = false;
  }
}

export class FakeRuntimeError extends Error {
  constructor(readonly code: "session-lost") {
    super(code);
    this.name = "FakeRuntimeError";
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

function fakeCapabilityProfile(
  publicCapabilities: readonly string[] = ["Fake read-only analysis", "Fake Skill: context"],
) {
  const normalized = [...publicCapabilities].sort();
  return {
    publicCapabilities: normalized,
    fingerprint: `fake:${normalized.join("|")}`,
  };
}
