import { execFile } from "node:child_process";

export interface LocalRuntimeProbeResult {
  readonly probeResult: "success";
  readonly providers: readonly string[];
}

export interface LocalRuntimeProbeError {
  readonly probeResult: "error";
  readonly reasonCode: string;
}

export type LocalRuntimeProbeOutcome = LocalRuntimeProbeResult | LocalRuntimeProbeError;

export interface ProbeLocalRuntimesOptions {
  readonly binaryPath: string;
  readonly timeoutMs?: number;
}

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Runs `<binary> daemon probe-runtimes` once and returns the set of agent CLI
 * providers the multica probe found on this host. The command is a standalone
 * one-shot detection call — no server, daemon, or login required — that walks
 * PATH plus the user's login shell to catch nvm/fnm/native-installer prefixes.
 */
export function probeLocalRuntimes(options: ProbeLocalRuntimesOptions): Promise<LocalRuntimeProbeOutcome> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  return new Promise((resolve) => {
    execFile(options.binaryPath, ["daemon", "probe-runtimes"], { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (rawError, stdout) => {
      if (rawError) {
        resolve({ probeResult: "error", reasonCode: normalizeProbeError(rawError) });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { probe_result?: unknown; provider_summary?: unknown };
        if (parsed.probe_result !== "success" || !parsed.provider_summary || typeof parsed.provider_summary !== "object" || Array.isArray(parsed.provider_summary)) {
          resolve({ probeResult: "error", reasonCode: "probe-output-malformed" });
          return;
        }
        const providers: string[] = [];
        for (const [rawProvider, rawCount] of Object.entries(parsed.provider_summary as Record<string, unknown>)) {
          const provider = rawProvider.trim().toLowerCase();
          if (!PROVIDER_ID_PATTERN.test(provider)) continue;
          if (!Number.isInteger(rawCount) || (rawCount as number) < 1 || (rawCount as number) > 1000) continue;
          providers.push(provider);
        }
        resolve({ probeResult: "success", providers: Object.freeze(providers) });
      } catch {
        resolve({ probeResult: "error", reasonCode: "probe-output-malformed" });
      }
    });
  });
}

function normalizeProbeError(error: unknown): string {
  const record = error as { killed?: boolean; code?: string | number | null };
  if (record?.killed) return "probe-timeout";
  if (record?.code === "ENOENT") return "probe-binary-missing";
  if (record?.code === "EACCES") return "probe-binary-not-executable";
  return "probe-failed";
}
