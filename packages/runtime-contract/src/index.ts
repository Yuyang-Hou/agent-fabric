export const runtimeContractBoundary = "runtime-contract" as const;

export type RuntimeDetection =
  | {
      readonly status: "ready";
      readonly runtimeName: string;
      readonly runtimeVersion: string;
      readonly authenticated: true;
    }
  | {
      readonly status: "unavailable" | "authentication-required" | "incompatible";
      readonly reasonCode: string;
    }

export interface RuntimeCapabilities {
  readonly protocol: "acp" | "fake";
  readonly supportsResume: boolean;
  readonly supportsClose: boolean;
  readonly supportsCancellation: boolean;
  readonly emitsProgress: boolean;
  readonly inputMediaTypes: readonly ["text/plain", ...string[]];
  readonly policy: {
    readonly readOnly: boolean;
    readonly networkDeny: boolean;
    readonly sideEffectsDeny: boolean;
  };
}

export interface RuntimeSession {
  readonly handle: string;
  readonly createdAt: string;
  readonly resumed: boolean;
  readonly capabilityProfile: RuntimeCapabilityProfile;
}

export interface RuntimeCapabilityProfile {
  readonly publicCapabilities: readonly string[];
  readonly fingerprint: string;
}

export interface RuntimeResumableSession {
  readonly handle: string;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly updatedAt: string;
  readonly capabilityProfile: RuntimeCapabilityProfile;
}

export interface RuntimeSessionRequest {
  readonly agentId: string;
  readonly workspaceRoot: string;
  readonly privateConfiguration?: Readonly<Record<string, unknown>>;
}

export interface RuntimeExecutionPolicy {
  readonly filesystem: "read-only";
  readonly network: "deny";
  readonly sideEffects: "deny";
  readonly timeoutMs: number;
  readonly maxOutputCharacters: number;
  readonly maxOutputTokens: number;
  readonly maxConcurrency: number;
  readonly maxDelegationDepth: number;
}

export interface RuntimeExecutionRequest {
  readonly sessionHandle: string;
  readonly taskId: string;
  readonly prompt: readonly [{ readonly type: "text"; readonly text: string }, ...Array<{
    readonly type: "text";
    readonly text: string;
  }>];
  readonly policy: RuntimeExecutionPolicy;
}

export type RuntimeFailureCode =
  | "authentication-failed"
  | "capability-incompatible"
  | "concurrency-limit"
  | "isolation-unavailable"
  | "output-budget-exceeded"
  | "policy-rejected"
  | "process-exit"
  | "runtime-disconnected"
  | "runtime-failed"
  | "session-lost"
  | "timeout";

export type RuntimeEvent =
  | { readonly type: "started"; readonly taskId: string }
  | {
      readonly type: "progress";
      readonly taskId: string;
      readonly stage: "queued" | "analyzing" | "executing" | "finalizing";
      readonly completedUnits?: number;
      readonly totalUnits?: number;
    }
  | { readonly type: "output-delta"; readonly taskId: string; readonly text: string }
  | { readonly type: "completed"; readonly taskId: string; readonly output: string }
  | {
      readonly type: "approval-required";
      readonly taskId: string;
      readonly operation: "tool" | "file" | "network" | "command" | "credential" | "other";
    }
  | {
      readonly type: "forbidden-operation";
      readonly taskId: string;
      readonly operation: "tool" | "file" | "network" | "command" | "credential" | "other";
    }
  | { readonly type: "canceled"; readonly taskId: string }
  | { readonly type: "timed-out"; readonly taskId: string }
  | {
      readonly type: "failed";
      readonly taskId: string;
      readonly code: RuntimeFailureCode;
      readonly retryable: boolean;
    }
  | { readonly type: "disconnected"; readonly taskId: string; readonly retryable: true }
  | { readonly type: "session-lost"; readonly taskId: string; readonly retryable: boolean };

export type RuntimeTerminalEvent = Extract<
  RuntimeEvent,
  { type: "completed" | "approval-required" | "forbidden-operation" | "canceled" | "timed-out" | "failed" | "disconnected" | "session-lost" }
>;

export interface RuntimeAdapter {
  detect(): Promise<RuntimeDetection>;
  inspectCapabilities(): Promise<RuntimeCapabilities>;
  listResumableSessions(): Promise<readonly RuntimeResumableSession[]>;
  createSession(request: RuntimeSessionRequest): Promise<RuntimeSession>;
  resumeSession(handle: string, request: RuntimeSessionRequest): Promise<RuntimeSession>;
  execute(request: RuntimeExecutionRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent>;
  cancel(handle: string): Promise<void>;
  close(handle: string): Promise<void>;
}

export function isRuntimeTerminalEvent(event: RuntimeEvent): event is RuntimeTerminalEvent {
  return ["completed", "approval-required", "forbidden-operation", "canceled", "timed-out", "failed", "disconnected", "session-lost"].includes(
    event.type,
  );
}

export async function collectRuntimeEvents(
  adapter: RuntimeAdapter,
  request: RuntimeExecutionRequest,
  signal: AbortSignal,
): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of adapter.execute(request, signal)) events.push(event);
  return events;
}

export interface RuntimeAdapterContractResult {
  readonly successEvents: readonly RuntimeEvent[];
  readonly continuationEvents: readonly RuntimeEvent[];
  readonly cancellationEvents: readonly RuntimeEvent[];
  readonly sessionLossEvents: readonly RuntimeEvent[];
}

export async function exerciseRuntimeAdapterContract(
  adapter: RuntimeAdapter,
  baseRequest: RuntimeSessionRequest,
  policy: RuntimeExecutionPolicy,
): Promise<RuntimeAdapterContractResult> {
  const detection = await adapter.detect();
  if (detection.status !== "ready") throw new Error("runtime-contract:detection-not-ready");
  const capabilities = await adapter.inspectCapabilities();
  if (!capabilities.supportsCancellation || !capabilities.supportsResume) {
    throw new Error("runtime-contract:capabilities-incomplete");
  }

  const discovered = await adapter.listResumableSessions();
  if (!Array.isArray(discovered)) {
    throw new Error("runtime-contract:session-discovery-invalid");
  }

  const firstSession = await adapter.createSession(baseRequest);
  const isolatedSession = await adapter.createSession({ ...baseRequest, agentId: `${baseRequest.agentId}-2` });
  if (firstSession.handle === isolatedSession.handle) {
    throw new Error("runtime-contract:session-isolation-failed");
  }
  const createdCandidates = await adapter.listResumableSessions();
  if (!createdCandidates.some((candidate) => candidate.handle === firstSession.handle)) {
    throw new Error("runtime-contract:created-session-not-discoverable");
  }
  if (firstSession.capabilityProfile.publicCapabilities.length === 0) {
    throw new Error("runtime-contract:missing-public-capabilities");
  }

  const successEvents = await collectRuntimeEvents(
    adapter,
    runtimeRequest(firstSession.handle, "contract-success", "contract:success", policy),
    new AbortController().signal,
  );
  assertExactlyOneTerminal(successEvents, "completed");
  if (!successEvents.some((event) => event.type === "progress")) {
    throw new Error("runtime-contract:missing-progress");
  }

  const resumed = await adapter.resumeSession(firstSession.handle, baseRequest);
  if (!resumed.resumed || resumed.handle !== firstSession.handle) {
    throw new Error("runtime-contract:resume-failed");
  }
  const continuationEvents = await collectRuntimeEvents(
    adapter,
    runtimeRequest(firstSession.handle, "contract-continuation", "contract:multi-turn", policy),
    new AbortController().signal,
  );
  assertExactlyOneTerminal(continuationEvents, "completed");

  const cancellation = new AbortController();
  const cancellationEvents: RuntimeEvent[] = [];
  for await (const event of adapter.execute(
    runtimeRequest(firstSession.handle, "contract-cancel", "contract:cancel", policy),
    cancellation.signal,
  )) {
    cancellationEvents.push(event);
    if (event.type === "progress") cancellation.abort();
  }
  assertExactlyOneTerminal(cancellationEvents, "canceled");
  if (cancellationEvents.some((event) => event.type === "completed")) {
    throw new Error("runtime-contract:success-after-cancel");
  }

  await adapter.close(isolatedSession.handle);
  const sessionLossEvents = await collectRuntimeEvents(
    adapter,
    runtimeRequest(isolatedSession.handle, "contract-session-loss", "contract:success", policy),
    new AbortController().signal,
  );
  assertExactlyOneTerminal(sessionLossEvents, "session-lost");
  await adapter.close(firstSession.handle);

  return Object.freeze({
    successEvents: Object.freeze(successEvents),
    continuationEvents: Object.freeze(continuationEvents),
    cancellationEvents: Object.freeze(cancellationEvents),
    sessionLossEvents: Object.freeze(sessionLossEvents),
  });
}

function runtimeRequest(
  sessionHandle: string,
  taskId: string,
  text: string,
  policy: RuntimeExecutionPolicy,
): RuntimeExecutionRequest {
  return { sessionHandle, taskId, prompt: [{ type: "text", text }], policy };
}

function assertExactlyOneTerminal(events: readonly RuntimeEvent[], expected: RuntimeTerminalEvent["type"]): void {
  const terminal = events.filter(isRuntimeTerminalEvent);
  if (terminal.length !== 1 || terminal[0]?.type !== expected) {
    throw new Error(`runtime-contract:expected-${expected}`);
  }
}
