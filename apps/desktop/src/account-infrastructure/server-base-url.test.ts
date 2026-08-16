import { describe, expect, it } from "vitest";

import { resolveServerBaseUrl } from "./server-base-url.js";

describe("resolveServerBaseUrl", () => {
  it("prefers a runtime override over the packaged public URL", () => {
    expect(resolveServerBaseUrl(" http://127.0.0.1:8787 ", "https://alpha.example.com")).toBe("http://127.0.0.1:8787");
  });

  it("uses the packaged public URL when Finder provides no environment", () => {
    expect(resolveServerBaseUrl(undefined, "https://alpha.example.com/")).toBe("https://alpha.example.com");
  });

  it("returns undefined when neither deployment source is configured", () => {
    expect(resolveServerBaseUrl()).toBeUndefined();
  });

  it("rejects insecure public origins and URLs containing embedded data", () => {
    expect(() => resolveServerBaseUrl(undefined, "http://alpha.example.com")).toThrow("agent-fabric-server-url-insecure");
    expect(() => resolveServerBaseUrl(undefined, "https://user:secret@alpha.example.com")).toThrow("agent-fabric-server-url-invalid");
    expect(() => resolveServerBaseUrl(undefined, "https://alpha.example.com/path")).toThrow("agent-fabric-server-url-invalid");
  });
});
