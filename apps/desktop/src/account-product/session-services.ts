import type { CodexMcpInstallation } from "@agent-fabric/edge-host";

import type { DesktopAccountAgentMcp } from "../account-agent-mcp.js";
import type { DesktopAccountRuntime } from "../account-runtime.js";

type RuntimeStartInput = Parameters<DesktopAccountRuntime["start"]>[0];
type McpStartInput = Parameters<DesktopAccountAgentMcp["start"]>[0];

export interface AccountProductSessionServicesStatus {
  readonly runtime: { readonly state: "ready" | "failed"; readonly runtimeId?: string; readonly errorCode?: string };
  readonly mcp: { readonly state: "ready" | "failed"; readonly errorCode?: string };
}

/** Owns local services for exactly one authenticated Account session. */
export class AccountProductSessionServices {
  #status: AccountProductSessionServicesStatus | undefined;

  constructor(readonly options: {
    readonly runtime: Pick<DesktopAccountRuntime, "start" | "stop" | "refresh">;
    readonly mcp: Pick<DesktopAccountAgentMcp, "start" | "stop">;
    readonly installMcp: (input: CodexMcpInstallation) => Promise<void>;
    readonly startupTimeoutMs?: number;
  }) {}

  get status(): AccountProductSessionServicesStatus | undefined { return this.#status; }

  async start(input: {
    readonly runtime: RuntimeStartInput;
    readonly mcp: McpStartInput;
    readonly mcpInstallation: Omit<CodexMcpInstallation, "agentFabricConfigFile">;
  }): Promise<AccountProductSessionServicesStatus> {
    await this.stop();
    const timeoutMs = this.options.startupTimeoutMs ?? 10_000;
    const [runtime, mcp] = await Promise.allSettled([
      withTimeout(this.options.runtime.start(input.runtime), timeoutMs, "runtime-start-timeout"),
      withTimeout(this.#startMcp(input.mcp, input.mcpInstallation), timeoutMs, "mcp-start-timeout"),
    ]);
    const status: AccountProductSessionServicesStatus = Object.freeze({
      runtime: runtime.status === "fulfilled" ? { state: "ready" as const, runtimeId: runtime.value.runtimeId } : { state: "failed" as const, errorCode: safeErrorCode(runtime.reason) },
      mcp: mcp.status === "fulfilled" ? { state: "ready" as const } : { state: "failed" as const, errorCode: safeErrorCode(mcp.reason) },
    });
    this.#status = status;
    return status;
  }

  async stop(): Promise<void> {
    this.#status = undefined;
    await Promise.allSettled([this.options.runtime.stop(), this.options.mcp.stop()]);
  }

  refreshRuntime(runtimeId: string, expectedVersion: number) {
    return this.options.runtime.refresh(runtimeId, expectedVersion);
  }

  async #startMcp(input: McpStartInput, installation: Omit<CodexMcpInstallation, "agentFabricConfigFile">): Promise<void> {
    const configuration = await this.options.mcp.start(input);
    await this.options.installMcp({ ...installation, agentFabricConfigFile: configuration.configFile });
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), timeoutMs);
    void work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function safeErrorCode(error: unknown): string {
  const code = error instanceof Error ? (error.message.split(":")[0] ?? "local-service-failed") : "local-service-failed";
  return /^[A-Za-z0-9._-]{1,120}$/u.test(code) ? code : "local-service-failed";
}
