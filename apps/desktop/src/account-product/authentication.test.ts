import { describe, expect, it, vi } from "vitest";

import { DesktopAccountProductAuthentication } from "./authentication.js";

const session = {
  sessionId: "session:one", credentialId: "credential:one", accountId: "account:one", userId: "human:owner",
  displayName: "Owner", email: "owner@example.com", role: "owner", createdAt: "2026-08-13T00:00:00.000Z",
  expiresAt: "2026-09-13T00:00:00.000Z", lastSeenAt: "2026-08-13T00:00:00.000Z",
};
const account = { accountId: "account:one", name: "Research Account", createdAt: "2026-08-13T00:00:00.000Z", updatedAt: "2026-08-13T00:00:00.000Z", version: 1 };
const version = { product: "agent-fabric", component: "server", version: "0.1.0", protocolMajor: 1, a2aVersion: "1.0.1", runtimeAdapterVersion: "1", features: ["a2a-rest", "account-agents"] };

describe("DesktopAccountProductAuthentication", () => {
  it("keeps the token in Main while loading real Account and session identity", async () => {
    const values = new Map<string, string>();
    const vault = {
      get: vi.fn(async (kind: "app-session") => values.get(kind)),
      set: vi.fn(async (kind: "app-session", value: string) => { values.set(kind, value); }),
      clearSession: vi.fn(async () => { values.clear(); }),
    };
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (!url.endsWith("/v1/version")) expect(init?.headers).toMatchObject({ authorization: "Bearer account-session-secret" });
      return new Response(JSON.stringify(url.endsWith("/v1/version") ? version : url.endsWith("/v1/session") ? session : account), { status: 200 });
    });
    const onSessionLoaded = vi.fn().mockResolvedValue({ runtime: { state: "ready" }, mcp: { state: "ready" } });
    const onSessionCleared = vi.fn().mockResolvedValue(undefined);
    const authentication = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault,
      googleLogin: completingLogin(), fetchImpl, onSessionLoaded, onSessionCleared,
    });
    const restored = await authentication.login(async (authenticated) => authenticated);
    expect(restored).toMatchObject({ accountName: "Research Account", session: { accountId: "account:one", userId: "human:owner" }, localServices: { runtime: { state: "ready" }, mcp: { state: "ready" } } });
    expect(JSON.stringify({ accountName: restored.accountName, session: restored.session })).not.toContain("account-session-secret");
    expect(vault.set).toHaveBeenCalledWith("app-session", "account-session-secret");
    expect(onSessionLoaded).toHaveBeenCalledWith({ token: "account-session-secret", session, accountName: "Research Account" });
    await authentication.clear();
    expect(onSessionCleared).toHaveBeenCalledBefore(vault.clearSession);
  });

  it("rejects a mismatched Account bootstrap and clears the newly stored session", async () => {
    const vault = { get: vi.fn(), set: vi.fn(), clearSession: vi.fn().mockResolvedValue(undefined) };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/v1/version") ? version : url.endsWith("/v1/session") ? session : { ...account, accountId: "account:other" }), { status: 200 });
    });
    const authentication = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault,
      googleLogin: completingLogin(), fetchImpl,
    });
    await expect(authentication.login(async (authenticated) => authenticated)).rejects.toThrow("login-session-invalid");
    expect(vault.clearSession).toHaveBeenCalledOnce();
  });

  it("reports secure-storage failure and clears partial credential state", async () => {
    const vault = { get: vi.fn(), set: vi.fn().mockRejectedValue(new Error("/private/keychain/token")), clearSession: vi.fn().mockResolvedValue(undefined) };
    const fetchImpl = vi.fn<typeof fetch>();
    const authentication = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault, googleLogin: completingLogin(), fetchImpl,
    });
    await expect(authentication.login(async (authenticated) => authenticated)).rejects.toThrow("login-secure-storage-failed");
    expect(vault.clearSession).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves a bounded network category while clearing the exchanged session", async () => {
    const vault = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), clearSession: vi.fn().mockResolvedValue(undefined) };
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("raw-network-detail"));
    const authentication = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault, googleLogin: completingLogin(), fetchImpl,
    });
    await expect(authentication.login(async (authenticated) => authenticated)).rejects.toThrow("server-unreachable");
    expect(vault.clearSession).toHaveBeenCalledOnce();
  });

  it("rejects an older Cloud before protected bootstrap", async () => {
    const vault = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), clearSession: vi.fn().mockResolvedValue(undefined) };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/v1/version") ? { ...version, features: ["a2a-rest"] } : url.endsWith("/v1/session") ? session : account), { status: 200 });
    });
    const activate = vi.fn();
    const authentication = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault, googleLogin: completingLogin(), fetchImpl,
    });
    await expect(authentication.login(activate)).rejects.toThrow("login-cloud-incompatible");
    expect(activate).not.toHaveBeenCalled();
    expect(vault.clearSession).toHaveBeenCalledOnce();
  });

  it("keeps Google completion pending through protected Host bootstrap", async () => {
    const vault = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined), clearSession: vi.fn().mockResolvedValue(undefined) };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.endsWith("/v1/version") ? version : url.endsWith("/v1/session") ? session : account), { status: 200 });
    });
    const authentication = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault, googleLogin: completingLogin(), fetchImpl,
    });
    await expect(authentication.login(async () => { throw new Error("raw protected collection body"); })).rejects.toThrow("login-bootstrap-failed");
    expect(vault.clearSession).toHaveBeenCalledOnce();
  });

  it("classifies restored credential rejection separately from transient Cloud failure", async () => {
    const vault = { get: vi.fn().mockResolvedValue("stored-secret"), set: vi.fn(), clearSession: vi.fn() };
    const rejected = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault, googleLogin: completingLogin(),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: "authentication-required" } }), { status: 401 })),
    });
    await expect(rejected.restore()).rejects.toThrow("login-session-invalid");

    const transient = new DesktopAccountProductAuthentication({
      serverBaseUrl: "https://fabric.example", credentialVault: vault, googleLogin: completingLogin(),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("Incorrect Application", { status: 400 })),
    });
    await expect(transient.restore()).rejects.toThrow("server-unreachable");
    expect(vault.clearSession).not.toHaveBeenCalled();
  });
});

function completingLogin(token = "account-session-secret") {
  return {
    async login<T>(activate: (login: { readonly token: string }) => Promise<T>): Promise<T> {
      return activate({ token });
    },
  };
}
