import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { probeLocalRuntimes } from "./local-runtime-probe.js";

function writeFakeProbe(script: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "af-probe-"));
  const file = path.join(dir, "multica");
  writeFileSync(file, `#!/bin/sh\n${script}\n`, "utf8");
  chmodSync(file, 0o755);
  return file;
}

describe("probeLocalRuntimes", () => {
  it("parses provider summary from a successful probe", async () => {
    const binary = writeFakeProbe(`echo '{"probe_result":"success","runtime_count":3,"provider_summary":{"claude":1,"codex":1,"cursor":1}}'`);
    const outcome = await probeLocalRuntimes({ binaryPath: binary });
    expect(outcome).toEqual({ probeResult: "success", providers: ["claude", "codex", "cursor"] });
  });

  it("drops providers with malformed ids or counts", async () => {
    const binary = writeFakeProbe(`echo '{"probe_result":"success","runtime_count":2,"provider_summary":{"claude":1,"bad name":1,"cursor":-3,"openclaw":2}}'`);
    const outcome = await probeLocalRuntimes({ binaryPath: binary });
    expect(outcome).toEqual({ probeResult: "success", providers: ["claude", "openclaw"] });
  });

  it("reports probe-output-malformed for invalid JSON", async () => {
    const binary = writeFakeProbe(`echo 'not json'`);
    const outcome = await probeLocalRuntimes({ binaryPath: binary });
    expect(outcome).toEqual({ probeResult: "error", reasonCode: "probe-output-malformed" });
  });

  it("reports probe-output-malformed when probe_result is not success", async () => {
    const binary = writeFakeProbe(`echo '{"probe_result":"failed","provider_summary":{}}'`);
    const outcome = await probeLocalRuntimes({ binaryPath: binary });
    expect(outcome).toEqual({ probeResult: "error", reasonCode: "probe-output-malformed" });
  });

  it("reports probe-binary-missing when the binary is absent", async () => {
    const outcome = await probeLocalRuntimes({ binaryPath: "/nonexistent/multica" });
    expect(outcome).toEqual({ probeResult: "error", reasonCode: "probe-binary-missing" });
  });

  it("reports probe-failed when the binary exits non-zero", async () => {
    const binary = writeFakeProbe(`exit 1`);
    const outcome = await probeLocalRuntimes({ binaryPath: binary });
    expect(outcome).toEqual({ probeResult: "error", reasonCode: "probe-failed" });
  });

  it("times out slow probes", async () => {
    const binary = writeFakeProbe(`sleep 5`);
    const outcome = await probeLocalRuntimes({ binaryPath: binary, timeoutMs: 100 });
    expect(outcome).toEqual({ probeResult: "error", reasonCode: "probe-timeout" });
  });
});
