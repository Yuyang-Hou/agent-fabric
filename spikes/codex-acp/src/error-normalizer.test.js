import { describe, expect, it } from "vitest";

import { normalizeAcpFailure } from "./error-normalizer.js";

describe("normalizeAcpFailure", () => {
  it("normalizes ACP cancellation", () => {
    expect(normalizeAcpFailure(Object.assign(new Error("Request cancelled"), { code: -32800 }))).toEqual({
      code: "runtime_cancelled",
      retryable: false,
      message: "Runtime request was cancelled",
    });
  });

  it("marks a lost runtime session as retryable", () => {
    expect(normalizeAcpFailure(new Error("Session not found"))).toMatchObject({
      code: "runtime_session_lost",
      retryable: true,
    });
  });

  it("redacts credentials before the failure crosses the adapter boundary", () => {
    const normalized = normalizeAcpFailure(new Error("authorization=sk-secretvalue123 failed"));
    expect(normalized.code).toBe("runtime_auth_required");
    expect(normalized.message).not.toContain("secretvalue123");
    expect(normalized.message).toContain("[redacted]");
  });
});
