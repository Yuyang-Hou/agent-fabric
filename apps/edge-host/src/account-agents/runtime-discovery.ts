import { runtimeCapabilitiesSchema, runtimeHealthSchema, type RuntimeCapabilities, type RuntimeHealth, type RuntimeSkillSummary } from "@agent-fabric/account-agent-domain";
import type { RuntimeAdapter, RuntimeCapabilities as AdapterCapabilities, RuntimeDetection } from "@agent-fabric/runtime-contract";

export interface AccountRuntimeObservation {
  readonly provider: "codex";
  readonly adapterId: "codex-acp";
  readonly health: RuntimeHealth;
  readonly capabilities: RuntimeCapabilities;
  readonly runtimeSkills: readonly RuntimeSkillSummary[];
  readonly observedAt: string;
  readonly reasonCode?: string;
}

export async function discoverCodexAccountRuntime(adapter: RuntimeAdapter, observedAt = new Date().toISOString(), timeoutMs = 10_000): Promise<AccountRuntimeObservation> {
  try {
    const detection = await withTimeout(adapter.detect(), timeoutMs);
    const health = healthFromDetection(detection);
    const capabilities = detection.status === "ready" ? capabilitiesFromAdapter(await withTimeout(adapter.inspectCapabilities(), timeoutMs)) : unavailableCapabilities();
    return Object.freeze({
      provider: "codex",
      adapterId: "codex-acp",
      health,
      capabilities,
      runtimeSkills: [],
      observedAt,
      ...(detection.status === "ready" ? {} : { reasonCode: detection.reasonCode }),
    });
  } catch {
    return Object.freeze({ provider: "codex", adapterId: "codex-acp", health: "offline", capabilities: unavailableCapabilities(), runtimeSkills: [], observedAt, reasonCode: "runtime-detection-failed" });
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("runtime-detection-timeout")), timeoutMs);
    void work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function healthFromDetection(detection: RuntimeDetection): RuntimeHealth {
  return runtimeHealthSchema.parse(detection.status === "ready" ? "ready" : detection.status === "authentication-required" ? "auth_required" : "unavailable");
}

function capabilitiesFromAdapter(capabilities: AdapterCapabilities): RuntimeCapabilities {
  return runtimeCapabilitiesSchema.parse({
    supportsModelSelection: false,
    supportsThinkingLevel: false,
    supportsServiceTier: false,
    supportsSkills: false,
    supportsMcpConfiguration: false,
    supportsEnvironment: false,
    supportsCustomArguments: false,
    supportsRuntimeConfiguration: false,
    supportsCancellation: capabilities.supportsCancellation,
    maxConcurrentAgents: capabilities.supportsCancellation ? 8 : 1,
  });
}

function unavailableCapabilities(): RuntimeCapabilities {
  return runtimeCapabilitiesSchema.parse({
    supportsModelSelection: false, supportsThinkingLevel: false, supportsServiceTier: false, supportsSkills: false,
    supportsMcpConfiguration: false, supportsEnvironment: false, supportsCustomArguments: false, supportsRuntimeConfiguration: false,
    supportsCancellation: false, maxConcurrentAgents: 1,
  });
}
