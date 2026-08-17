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

export interface StubRuntimeAdapterOptions {
  readonly runtimeName: string;
  readonly runtimeVersion?: string;
}

/**
 * A RuntimeAdapter that only reports the CLI as detected — every execution
 * method rejects with `runtime-adapter-missing`. Used for providers we probe on
 * the local machine but do not yet drive (Claude, Cursor, Openclaw, ...). It
 * lets the local runtime page mirror multica's list where every installed CLI
 * is a row, while making it obvious at the boundary that execution is not
 * wired up.
 */
export class StubRuntimeAdapter implements RuntimeAdapter {
  constructor(readonly options: StubRuntimeAdapterOptions) {
    if (!options.runtimeName) throw new Error("stub-runtime-name-required");
  }

  detect(): Promise<RuntimeDetection> {
    return Promise.resolve({ status: "ready", runtimeName: this.options.runtimeName, runtimeVersion: this.options.runtimeVersion ?? "unknown", authenticated: true });
  }

  inspectCapabilities(): Promise<RuntimeCapabilities> {
    return Promise.resolve({
      protocol: "acp",
      supportsResume: false,
      supportsClose: false,
      supportsCancellation: false,
      emitsProgress: false,
      inputMediaTypes: ["text/plain"],
      policy: { readOnly: true, networkDeny: true, sideEffectsDeny: true },
    });
  }

  listResumableSessions(): Promise<readonly RuntimeResumableSession[]> {
    return Promise.resolve([]);
  }

  createSession(_request: RuntimeSessionRequest): Promise<RuntimeSession> {
    return Promise.reject(new Error("runtime-adapter-missing"));
  }

  resumeSession(_handle: string, _request: RuntimeSessionRequest): Promise<RuntimeSession> {
    return Promise.reject(new Error("runtime-adapter-missing"));
  }

  execute(_request: RuntimeExecutionRequest, _signal: AbortSignal): AsyncIterable<RuntimeEvent> {
    return (async function* () { throw new Error("runtime-adapter-missing"); })();
  }

  cancel(_handle: string): Promise<void> {
    return Promise.reject(new Error("runtime-adapter-missing"));
  }

  close(_handle: string): Promise<void> {
    return Promise.resolve();
  }
}
