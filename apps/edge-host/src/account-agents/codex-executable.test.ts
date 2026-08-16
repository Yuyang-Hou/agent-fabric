import { describe, expect, it, vi } from "vitest";

import { resolveCodexExecutablePath } from "./codex-executable.js";

describe("Account Codex executable resolution", () => {
  it("prefers an explicit Edge-only executable path", () => {
    const isExecutable = vi.fn((candidate: string) => candidate === "/opt/codex/bin/codex");
    expect(resolveCodexExecutablePath({
      explicitPath: "/opt/codex/bin/codex",
      pathValue: "/usr/bin:/bin",
      platform: "darwin",
      isExecutable,
    })).toBe("/opt/codex/bin/codex");
  });

  it("finds the supported ChatGPT application after PATH candidates", () => {
    const chatGptCodex = "/Applications/ChatGPT.app/Contents/Resources/codex";
    expect(resolveCodexExecutablePath({
      pathValue: "/usr/bin:/bin",
      homeDirectory: "/Users/alice",
      platform: "darwin",
      isExecutable: (candidate) => candidate === chatGptCodex,
    })).toBe(chatGptCodex);
  });

  it("returns undefined without leaking a rejected candidate", () => {
    const privateCandidate = "/Users/alice/private/codex";
    const resolved = resolveCodexExecutablePath({
      explicitPath: privateCandidate,
      pathValue: "",
      homeDirectory: "/Users/alice",
      platform: "darwin",
      isExecutable: () => false,
    });
    expect(resolved).toBeUndefined();
    expect(JSON.stringify({ resolved })).not.toContain(privateCandidate);
  });
});
