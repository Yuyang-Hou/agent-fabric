import {
  PROTOCOL_VERSION,
  client,
  methods,
  ndJsonStream,
  type ClientConnection,
  type InitializeResponse,
  type SessionUpdate,
  type StopReason,
} from "@agentclientprotocol/sdk";
import type {
  RuntimeAdapter,
  RuntimeCapabilityProfile,
  RuntimeCapabilities,
  RuntimeDetection,
  RuntimeEvent,
  RuntimeExecutionRequest,
  RuntimeFailureCode,
  RuntimeResumableSession,
  RuntimeSession,
  RuntimeSessionRequest,
} from "@agent-fabric/runtime-contract";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";

export const codexAcpAdapterBoundary = "runtime-codex-acp" as const;
const maximumProjectedSessions = 100;
const maximumScannedSessions = 1_000;
const maximumSessionPages = 20;
const parentCodexExecutionVariables = [
  "CODEX_CI",
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
  "CODEX_PERMISSION_PROFILE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CODEX_THREAD_ID",
] as const;

export interface AcpRuntimeUpdate {
  readonly type: "agent-text" | "progress";
  readonly text?: string;
  readonly stage?: "analyzing" | "executing" | "finalizing";
}

export interface CodexAcpClient {
  initialize(): Promise<{
    readonly runtimeName: string;
    readonly runtimeVersion: string;
    readonly supportsResume: boolean;
    readonly supportsClose: boolean;
    readonly supportsList: boolean;
  }>;
  listSessions(): Promise<readonly RuntimeResumableSession[]>;
  newSession(request: RuntimeSessionRequest): Promise<{
    readonly handle: string;
    readonly capabilityProfile: RuntimeCapabilityProfile;
  }>;
  resumeSession(handle: string, request: RuntimeSessionRequest): Promise<RuntimeCapabilityProfile>;
  prompt(
    handle: string,
    prompt: RuntimeExecutionRequest["prompt"],
    onUpdate: (update: AcpRuntimeUpdate) => void,
  ): Promise<StopReason>;
  cancel(handle: string): Promise<void>;
  close(handle: string): Promise<void>;
  shutdown(): void;
  onDisconnect(listener: () => void): void;
}

export interface CodexAcpClientFactory {
  connect(): Promise<CodexAcpClient>;
}

interface CodexRuntimeInfo {
  readonly runtimeName: string;
  readonly runtimeVersion: string;
  readonly supportsResume: boolean;
  readonly supportsClose: boolean;
  readonly supportsList: boolean;
}

interface SessionRecord {
  readonly request: RuntimeSessionRequest;
  readonly createdAt: string;
}

interface ActiveExecution {
  readonly taskId: string;
  readonly queue: AsyncEventQueue;
  output: string;
  cancellationRequested: boolean;
  terminal: boolean;
}

export class CodexAcpRuntimeAdapter implements RuntimeAdapter {
  readonly #factory: CodexAcpClientFactory;
  readonly #now: () => string;
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #active = new Map<string, ActiveExecution>();
  #client: CodexAcpClient | undefined;
  #runtimeInfo: CodexRuntimeInfo | undefined;
  #connecting: Promise<CodexRuntimeInfo> | undefined;

  constructor(factory: CodexAcpClientFactory, now: () => string = () => new Date().toISOString()) {
    this.#factory = factory;
    this.#now = now;
  }

  async detect(): Promise<RuntimeDetection> {
    try {
      const info = await this.#connect();
      return {
        status: "ready",
        runtimeName: info.runtimeName,
        runtimeVersion: info.runtimeVersion,
        authenticated: true,
      };
    } catch (error) {
      const code = normalizeAcpFailure(error);
      return {
        status: code === "authentication-failed" ? "authentication-required" : "unavailable",
        reasonCode: code,
      };
    }
  }

  async inspectCapabilities(): Promise<RuntimeCapabilities> {
    const info = await this.#connect();
    return {
      protocol: "acp",
      supportsResume: info.supportsResume,
      supportsClose: info.supportsClose,
      supportsCancellation: true,
      emitsProgress: true,
      inputMediaTypes: ["text/plain"],
      policy: { readOnly: true, networkDeny: true, sideEffectsDeny: true },
    };
  }

  async listResumableSessions(): Promise<readonly RuntimeResumableSession[]> {
    const info = await this.#connect();
    if (!info.supportsList) throw new CodexAcpError("capability-incompatible");
    return (await this.#requireClient()).listSessions();
  }

  async createSession(request: RuntimeSessionRequest): Promise<RuntimeSession> {
    const created = await (await this.#requireClient()).newSession(request);
    const createdAt = this.#now();
    this.#sessions.set(created.handle, { request, createdAt });
    return {
      handle: created.handle,
      createdAt,
      resumed: false,
      capabilityProfile: created.capabilityProfile,
    };
  }

  async resumeSession(handle: string, request: RuntimeSessionRequest): Promise<RuntimeSession> {
    const known = this.#sessions.get(handle);
    if (known && known.request.agentId !== request.agentId) throw new CodexAcpError("session-lost");
    const capabilityProfile = await (await this.#requireClient()).resumeSession(handle, request);
    const createdAt = known?.createdAt ?? this.#now();
    this.#sessions.set(handle, { request, createdAt });
    return { handle, createdAt, resumed: true, capabilityProfile };
  }

  async *execute(request: RuntimeExecutionRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
    if (!this.#sessions.has(request.sessionHandle)) {
      yield { type: "session-lost", taskId: request.taskId, retryable: true };
      return;
    }
    if (this.#active.has(request.sessionHandle)) {
      yield {
        type: "failed",
        taskId: request.taskId,
        code: "concurrency-limit",
        retryable: true,
      };
      return;
    }

    const execution: ActiveExecution = {
      taskId: request.taskId,
      queue: new AsyncEventQueue(),
      output: "",
      cancellationRequested: signal.aborted,
      terminal: false,
    };
    this.#active.set(request.sessionHandle, execution);
    execution.queue.push({ type: "started", taskId: request.taskId });

    const abort = () => {
      execution.cancellationRequested = true;
      void this.cancel(request.sessionHandle);
    };
    signal.addEventListener("abort", abort, { once: true });
    void this.#runPrompt(request, execution);
    if (signal.aborted) abort();

    try {
      for await (const event of execution.queue) yield event;
    } finally {
      signal.removeEventListener("abort", abort);
      this.#active.delete(request.sessionHandle);
    }
  }

  async cancel(handle: string): Promise<void> {
    const execution = this.#active.get(handle);
    if (execution) execution.cancellationRequested = true;
    await (await this.#requireClient()).cancel(handle);
  }

  async close(handle: string): Promise<void> {
    this.#sessions.delete(handle);
    await (await this.#requireClient()).close(handle);
  }

  async shutdown(): Promise<void> {
    await this.#connecting?.catch(() => undefined);
    const client = this.#client;
    if (client) {
      await Promise.allSettled([...this.#sessions.keys()].map((handle) => client.close(handle)));
      client.shutdown();
    }
    this.#client = undefined;
    this.#runtimeInfo = undefined;
    this.#sessions.clear();
  }

  async #runPrompt(request: RuntimeExecutionRequest, execution: ActiveExecution): Promise<void> {
    try {
      const client = await this.#requireClient();
      const stopReason = await client.prompt(request.sessionHandle, request.prompt, (update) => {
        if (execution.terminal) return;
        if (update.type === "agent-text" && update.text) {
          const remaining = request.policy.maxOutputCharacters - execution.output.length;
          if (remaining <= 0) return;
          const text = update.text.slice(0, remaining);
          execution.output += text;
          execution.queue.push({ type: "output-delta", taskId: request.taskId, text });
          return;
        }
        execution.queue.push({
          type: "progress",
          taskId: request.taskId,
          stage: update.stage ?? "executing",
        });
      });
      if (execution.cancellationRequested || stopReason === "cancelled") {
        this.#finish(execution, { type: "canceled", taskId: request.taskId });
      } else if (stopReason === "end_turn") {
        this.#finish(execution, {
          type: "completed",
          taskId: request.taskId,
          output: execution.output,
        });
      } else {
        this.#finish(execution, {
          type: "failed",
          taskId: request.taskId,
          code: "runtime-failed",
          retryable: false,
        });
      }
    } catch (error) {
      const code = normalizeAcpFailure(error);
      if (execution.cancellationRequested) {
        this.#finish(execution, { type: "canceled", taskId: request.taskId });
      } else if (code === "session-lost") {
        this.#finish(execution, { type: "session-lost", taskId: request.taskId, retryable: true });
      } else {
        this.#finish(execution, {
          type: "failed",
          taskId: request.taskId,
          code,
          retryable: code === "runtime-disconnected" || code === "process-exit",
        });
      }
    }
  }

  #finish(execution: ActiveExecution, event: RuntimeEvent): void {
    if (execution.terminal) return;
    execution.terminal = true;
    execution.queue.push(event);
    execution.queue.close();
  }

  async #connect() {
    if (this.#runtimeInfo) return this.#runtimeInfo;
    if (this.#connecting) return this.#connecting;
    const connecting = (async () => {
      const client = await this.#factory.connect();
      client.onDisconnect(() => {
        for (const execution of this.#active.values()) {
          this.#finish(execution, {
            type: "disconnected",
            taskId: execution.taskId,
            retryable: true,
          });
        }
        if (this.#client === client) {
          this.#client = undefined;
          this.#runtimeInfo = undefined;
        }
      });
      try {
        const info = await client.initialize();
        this.#runtimeInfo = info;
        this.#client = client;
        return info;
      } catch (error) {
        client.shutdown();
        throw error;
      }
    })();
    this.#connecting = connecting;
    try {
      return await connecting;
    } finally {
      if (this.#connecting === connecting) this.#connecting = undefined;
    }
  }

  async #requireClient(): Promise<CodexAcpClient> {
    await this.#connect();
    if (!this.#client) throw new CodexAcpError("runtime-disconnected");
    return this.#client;
  }
}

export interface CodexAcpProcess {
  readonly stdin: WritableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
  readonly exited: Promise<number | null>;
  terminate(): void;
}

export interface CodexAcpProcessFactory {
  start(): Promise<CodexAcpProcess>;
}

export class SdkCodexAcpClientFactory implements CodexAcpClientFactory {
  readonly #processes: CodexAcpProcessFactory;

  constructor(processes: CodexAcpProcessFactory) {
    this.#processes = processes;
  }

  async connect(): Promise<CodexAcpClient> {
    const process = await this.#processes.start();
    return new SdkCodexAcpClient(process);
  }
}

class SdkCodexAcpClient implements CodexAcpClient {
  readonly #process: CodexAcpProcess;
  readonly #connection: ClientConnection;
  readonly #updates = new Map<string, (update: AcpRuntimeUpdate) => void>();
  readonly #disconnectListeners = new Set<() => void>();
  readonly #capabilityProfiles = new Map<string, RuntimeCapabilityProfile>();
  readonly #capabilityWaiters = new Map<
    string,
    Set<(profile: RuntimeCapabilityProfile) => void>
  >();
  #disconnected = false;

  constructor(process: CodexAcpProcess) {
    this.#process = process;
    const app = client({ name: "agent-fabric" })
      .onRequest(methods.client.session.requestPermission, () => ({
        outcome: { outcome: "cancelled" },
      }))
      .onRequest(methods.client.fs.writeTextFile, () => {
        throw new CodexAcpError("runtime-failed");
      })
      .onNotification(methods.client.session.update, ({ params }) => {
        this.#captureCapabilityProfile(params.sessionId, params.update);
        this.#handleUpdate(params.sessionId, params.update);
      });
    this.#connection = app.connect(ndJsonStream(process.stdin, process.stdout));
    void process.exited.then(() => this.#disconnect());
    void this.#connection.closed.then(
      () => this.#disconnect(),
      () => this.#disconnect(),
    );
  }

  async initialize() {
    const initialized: InitializeResponse = await this.#connection.agent.request(
      methods.agent.initialize,
      {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "agent-fabric", version: "0.0.0" },
      },
    );
    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new CodexAcpError("capability-incompatible");
    }
    return {
      runtimeName: initialized.agentInfo?.name ?? "@agentclientprotocol/codex-acp",
      runtimeVersion: initialized.agentInfo?.version ?? "unknown",
      supportsResume: Boolean(initialized.agentCapabilities?.sessionCapabilities?.resume),
      supportsClose: Boolean(initialized.agentCapabilities?.sessionCapabilities?.close),
      supportsList: Boolean(initialized.agentCapabilities?.sessionCapabilities?.list),
    };
  }

  async listSessions(): Promise<readonly RuntimeResumableSession[]> {
    const sessions: RuntimeResumableSession[] = [];
    let cursor: string | null | undefined;
    for (let page = 0; page < maximumSessionPages; page += 1) {
      const result = await this.#connection.agent.request(methods.agent.session.list, {
        ...(cursor ? { cursor } : {}),
      });
      for (const session of result.sessions.slice(
        0,
        Math.max(0, maximumScannedSessions - sessions.length),
      )) {
        sessions.push({
          handle: session.sessionId,
          title: boundedSessionTitle(session.title),
          workspaceRoot: session.cwd,
          updatedAt: session.updatedAt ?? new Date(0).toISOString(),
          capabilityProfile: pendingCapabilityProfile(),
        });
      }
      cursor = result.nextCursor;
      if (!cursor || sessions.length >= maximumScannedSessions) break;
    }
    return selectLatestResumableSessions(sessions);
  }

  async newSession(request: RuntimeSessionRequest) {
    const result = await this.#connection.agent.request(methods.agent.session.new, {
      cwd: request.workspaceRoot,
      mcpServers: [],
    });
    if (result.modes?.currentModeId !== "read-only") {
      await this.close(result.sessionId);
      throw new CodexAcpError("capability-incompatible");
    }
    return {
      handle: result.sessionId,
      capabilityProfile: await this.#waitForCapabilityProfile(result.sessionId),
    };
  }

  async resumeSession(handle: string, request: RuntimeSessionRequest): Promise<RuntimeCapabilityProfile> {
    this.#capabilityProfiles.delete(handle);
    const result = await this.#connection.agent.request(methods.agent.session.resume, {
      sessionId: handle,
      cwd: request.workspaceRoot,
      mcpServers: [],
    });
    if (result.modes?.currentModeId !== "read-only") {
      throw new CodexAcpError("capability-incompatible");
    }
    return this.#waitForCapabilityProfile(handle);
  }

  async prompt(
    handle: string,
    prompt: RuntimeExecutionRequest["prompt"],
    onUpdate: (update: AcpRuntimeUpdate) => void,
  ): Promise<StopReason> {
    this.#updates.set(handle, onUpdate);
    try {
      const result = (await this.#connection.agent.request(methods.agent.session.prompt, {
        sessionId: handle,
        prompt: prompt.map((part) => ({ type: "text" as const, text: part.text })),
      })) as { stopReason: StopReason };
      return result.stopReason;
    } finally {
      this.#updates.delete(handle);
    }
  }

  async cancel(handle: string): Promise<void> {
    await this.#connection.agent.notify(methods.agent.session.cancel, { sessionId: handle });
  }

  async close(handle: string): Promise<void> {
    await this.#connection.agent.request(methods.agent.session.close, { sessionId: handle });
    this.#capabilityProfiles.delete(handle);
    this.#capabilityWaiters.delete(handle);
  }

  shutdown(): void {
    this.#connection.close();
    this.#process.terminate();
  }

  onDisconnect(listener: () => void): void {
    this.#disconnectListeners.add(listener);
  }

  #handleUpdate(handle: string, update: SessionUpdate): void {
    const listener = this.#updates.get(handle);
    if (!listener) return;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          listener({ type: "agent-text", text: update.content.text });
        }
        return;
      case "agent_thought_chunk":
        listener({ type: "progress", stage: "analyzing" });
        return;
      case "tool_call":
      case "tool_call_update":
        listener({ type: "progress", stage: "executing" });
        return;
      case "plan":
      case "plan_update":
      case "plan_removed":
        listener({ type: "progress", stage: "analyzing" });
        return;
      default:
        return;
    }
  }

  #captureCapabilityProfile(handle: string, update: SessionUpdate): void {
    if (update.sessionUpdate !== "available_commands_update") return;
    const profile = capabilityProfileFromCommands(
      update.availableCommands.map((command) => command.name),
    );
    this.#capabilityProfiles.set(handle, profile);
    for (const waiter of this.#capabilityWaiters.get(handle) ?? []) waiter(profile);
    this.#capabilityWaiters.delete(handle);
  }

  async #waitForCapabilityProfile(handle: string): Promise<RuntimeCapabilityProfile> {
    const existing = this.#capabilityProfiles.get(handle);
    if (existing) return existing;
    return new Promise((resolve) => {
      const waiters = this.#capabilityWaiters.get(handle) ?? new Set();
      const finish = (profile: RuntimeCapabilityProfile) => {
        clearTimeout(timeout);
        resolve(profile);
      };
      waiters.add(finish);
      this.#capabilityWaiters.set(handle, waiters);
      const timeout = setTimeout(() => {
        waiters.delete(finish);
        if (waiters.size === 0) this.#capabilityWaiters.delete(handle);
        resolve(pendingCapabilityProfile());
      }, 1_500);
    });
  }

  #disconnect(): void {
    if (this.#disconnected) return;
    this.#disconnected = true;
    for (const listener of this.#disconnectListeners) listener();
  }
}

export function selectLatestResumableSessions(
  sessions: readonly RuntimeResumableSession[],
): readonly RuntimeResumableSession[] {
  return [...sessions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, maximumProjectedSessions);
}

function capabilityProfileFromCommands(commandNames: readonly string[]): RuntimeCapabilityProfile {
  const normalized = [...new Set(commandNames)].sort();
  const skills = normalized
    .filter((name) => name.startsWith("$") && name.length > 1)
    .slice(0, 24)
    .map((name) => `Skill: ${name.slice(1, 81)}`);
  const publicCapabilities = [
    "Codex 本机会话 · 只读执行",
    ...skills,
    ...(normalized.includes("mcp") ? ["MCP: 使用本机 Codex 当前配置"] : []),
  ];
  return Object.freeze({
    publicCapabilities: Object.freeze(publicCapabilities),
    fingerprint: createHash("sha256").update(normalized.join("\n")).digest("hex"),
  });
}

function pendingCapabilityProfile(): RuntimeCapabilityProfile {
  return Object.freeze({
    publicCapabilities: Object.freeze([
      "Codex 本机会话 · 只读执行",
      "Skills/MCP: 发布时由本机 Codex 重新检查",
    ]),
    fingerprint: "pending-runtime-capability-discovery",
  });
}

function boundedSessionTitle(title: string | null | undefined): string {
  const normalized = title?.replace(/\s+/gu, " ").trim();
  return (normalized || "未命名 Codex 会话").slice(0, 120);
}

export class NodeCodexAcpProcessFactory implements CodexAcpProcessFactory {
  readonly #adapterPath: string;
  readonly #nodeExecutablePath: string;
  readonly #environment: NodeJS.ProcessEnv;

  constructor(options: {
    readonly adapterPath?: string;
    readonly nodeExecutablePath?: string;
    readonly environment?: NodeJS.ProcessEnv;
  } = {}) {
    const require = createRequire(import.meta.url);
    this.#adapterPath = options.adapterPath ?? require.resolve("@agentclientprotocol/codex-acp");
    this.#nodeExecutablePath = options.nodeExecutablePath ?? process.execPath;
    this.#environment = createCodexAcpProcessEnvironment(
      process.env,
      options.environment,
    );
  }

  async start(): Promise<CodexAcpProcess> {
    const child: ChildProcessWithoutNullStreams = spawn(this.#nodeExecutablePath, [this.#adapterPath], {
      env: this.#environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.on("data", () => {
      // Intentionally discard raw stderr: it may contain cwd, credentials, or prompt fragments.
    });
    return {
      stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      exited: new Promise((resolve) => child.once("exit", (code) => resolve(code))),
      terminate: () => child.kill("SIGTERM"),
    };
  }
}

export function createCodexAcpProcessEnvironment(
  inherited: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const environment = { ...inherited };
  for (const variable of parentCodexExecutionVariables) delete environment[variable];
  return {
    ...environment,
    ...overrides,
    INITIAL_AGENT_MODE: "read-only",
    NO_BROWSER: "1",
  };
}

export class CodexAcpError extends Error {
  constructor(readonly code: RuntimeFailureCode) {
    super(code);
    this.name = "CodexAcpError";
  }
}

export function normalizeAcpFailure(error: unknown): RuntimeFailureCode {
  if (error instanceof CodexAcpError) return error.code;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/auth|login|unauthorized|credential/u.test(message)) return "authentication-failed";
  if (/session.+(?:missing|not found|unknown|invalid)/u.test(message)) return "session-lost";
  if (/closed|disconnect|broken pipe/u.test(message)) return "runtime-disconnected";
  if (/exit|terminated|killed/u.test(message)) return "process-exit";
  return "runtime-failed";
}

class AsyncEventQueue implements AsyncIterable<RuntimeEvent> {
  readonly #values: RuntimeEvent[] = [];
  readonly #waiters: Array<(value: IteratorResult<RuntimeEvent>) => void> = [];
  #closed = false;

  push(value: RuntimeEvent): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.#values.push(value);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<RuntimeEvent> {
    return {
      next: () => {
        const value = this.#values.shift();
        if (value) return Promise.resolve({ value, done: false });
        if (this.#closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}
