import { describe, expect, it, vi } from "vitest";

import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

describe("onboarding API", () => {
  it("creates an isolated self-service owner login without server admin scope", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(), createOwnerLoginSession: vi.fn().mockResolvedValue({ joinSessionId: "login:one" }),
      getAuthSessionByState: vi.fn().mockResolvedValue({ joinSessionId: "login:one", nonceDigest: "nonce-digest", expiresAt: "2026-08-12T01:00:00.000Z", purpose: "owner", returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state" }),
      authenticateJoinSession: vi.fn().mockResolvedValue({ returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state" }),
      redeemOwnerLoginSession: vi.fn()
        .mockResolvedValueOnce({ token: "owner-device-secret", humanPrincipalId: "human:alice", principalId: "device:owner", displayName: "Alice", expiresAt: "2026-11-10T00:00:00.000Z" })
        .mockRejectedValueOnce(new Error("login-exchange-denied")),
    } as unknown as PersistenceStore;
    const oidcProvider = { authorizationUrl: vi.fn(({ state }: { state: string }) => `https://accounts.google.com/auth?state=${state}`), exchangeCode: vi.fn().mockResolvedValue({ issuer: "https://accounts.google.com", subject: "subject", displayName: "Alice", email: "alice@example.com" }) };
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0, googleOidc: { clientId: "client", clientSecret: "secret", redirectUri: "https://fabric.example/v1/auth/google/callback", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 } }, { store, oidcProvider });
    await server.start();
    try {
      const started = await fetch(`${server.address()}/v1/auth/login/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "s".repeat(32), deviceName: "Alice Mac" }) });
      expect(started.status).toBe(201);
      const oauthState = new URL((await started.json() as { authorizationUrl: string }).authorizationUrl).searchParams.get("state");
      expect(store.createOwnerLoginSession).toHaveBeenCalledWith(expect.not.objectContaining({ scopes: expect.anything() }));
      const callback = await fetch(`${server.address()}/v1/auth/google/callback?state=${oauthState}&code=google-code`, { redirect: "manual" });
      expect(callback.status).toBe(303);
      expect(oidcProvider.exchangeCode).toHaveBeenCalledWith("google-code", "nonce-digest", expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u));
      const replayedCallback = await fetch(`${server.address()}/v1/auth/google/callback?state=${oauthState}&code=google-code`, { redirect: "manual" });
      expect(replayedCallback.status).toBe(503);
      expect(oidcProvider.exchangeCode).toHaveBeenCalledTimes(1);
      const injectedIdentity = await fetch(`${server.address()}/v1/auth/login/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchangeCode: "exchange", codeVerifier: "v".repeat(43), humanPrincipalId: "human:mallory" }) });
      expect(injectedIdentity.status).toBe(400);
      const exchanged = await fetch(`${server.address()}/v1/auth/login/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchangeCode: "exchange", codeVerifier: "v".repeat(43) }) });
      expect(await exchanged.json()).toMatchObject({ token: "owner-device-secret", humanPrincipalId: "human:alice" });
      const replayedExchange = await fetch(`${server.address()}/v1/auth/login/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchangeCode: "exchange", codeVerifier: "v".repeat(43) }) });
      expect(replayedExchange.status).toBe(403);
    } finally { await server.stop(); }
  });

  it("retires invited Account join because friend invitations never change Account ownership", async () => {
    const store = { migrate: vi.fn(), close: vi.fn() } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const started = await fetch(`${server.address()}/v1/auth/member-join/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invitationToken: "member-invite-secret", codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "s".repeat(32), deviceName: "Bob Mac" }) });
      expect(started.status).toBe(410);
      expect(await started.json()).toEqual({ error: { code: "account-membership-model-retired" } });
      const exchange = await fetch(`${server.address()}/v1/auth/member-join/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchangeCode: "exchange", codeVerifier: "v".repeat(43) }) });
      expect(exchange.status).toBe(410);
      expect(await exchange.json()).toEqual({ error: { code: "account-membership-model-retired" } });
    } finally { await server.stop(); }
  });

  it("converts Google cancellation into a bound loopback result and consumes the session", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(), createOwnerLoginSession: vi.fn(), cancelAuthSession: vi.fn(),
      getAuthSessionByState: vi.fn().mockResolvedValue({ joinSessionId: "login:cancel", nonceDigest: "nonce", expiresAt: "2026-08-12T01:00:00.000Z", purpose: "owner", returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state" }),
    } as unknown as PersistenceStore;
    const oidcProvider = { authorizationUrl: vi.fn(({ state }: { state: string }) => `https://accounts.google.com/auth?state=${state}`), exchangeCode: vi.fn() };
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0, googleOidc: { clientId: "client", clientSecret: "secret", redirectUri: "https://fabric.example/v1/auth/google/callback", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 } }, { store, oidcProvider });
    await server.start();
    try {
      const started = await fetch(`${server.address()}/v1/auth/login/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "s".repeat(32), deviceName: "Alice Mac" }) });
      const oauthState = new URL((await started.json() as { authorizationUrl: string }).authorizationUrl).searchParams.get("state");
      const callback = await fetch(`${server.address()}/v1/auth/google/callback?state=${oauthState}&error=access_denied`, { redirect: "manual" });
      expect(callback.status).toBe(303);
      expect(callback.headers.get("location")).toBe("http://127.0.0.1:45678/callback?error=login_cancelled&state=client-state");
      expect(store.cancelAuthSession).toHaveBeenCalledWith("login:cancel");
      expect(oidcProvider.exchangeCode).not.toHaveBeenCalled();
    } finally { await server.stop(); }
  });

  it("rejects an expired OAuth callback before exchanging the Google code", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const store = {
      migrate: vi.fn(), close: vi.fn(), createOwnerLoginSession: vi.fn(),
      getAuthSessionByState: vi.fn().mockResolvedValue({ joinSessionId: "login:expired", nonceDigest: "nonce", expiresAt: new Date(1_600_000).toISOString(), purpose: "owner", returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state" }),
    } as unknown as PersistenceStore;
    const oidcProvider = { authorizationUrl: vi.fn(({ state }: { state: string }) => `https://accounts.google.com/auth?state=${state}`), exchangeCode: vi.fn() };
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0, googleOidc: { clientId: "client", clientSecret: "secret", redirectUri: "https://fabric.example/v1/auth/google/callback", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 } }, { store, oidcProvider });
    await server.start();
    try {
      const started = await fetch(`${server.address()}/v1/auth/login/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "s".repeat(32), deviceName: "Alice Mac" }) });
      const oauthState = new URL((await started.json() as { authorizationUrl: string }).authorizationUrl).searchParams.get("state");
      now.mockReturnValue(1_000_000 + 11 * 60 * 1_000);
      const callback = await fetch(`${server.address()}/v1/auth/google/callback?state=${oauthState}&code=google-code`, { redirect: "manual" });
      expect(callback.status).toBe(503);
      expect(oidcProvider.exchangeCode).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      await server.stop();
    }
  });

  it("revokes the authenticated App credential on logout", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(), revokeCredential: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:app", principalId: "device:owner", instanceId: "instance:one", scopes: ["account:access"] }),
    } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const response = await fetch(`${server.address()}/v1/auth/logout`, { method: "POST", headers: { authorization: "Bearer app-credential", "content-type": "application/json" }, body: "{}" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "logged_out" });
      expect(store.revokeCredential).toHaveBeenCalledWith("credential:app");
    } finally { await server.stop(); }
  });

  it("rejects login when OIDC is disabled", async () => {
    const store = { migrate: vi.fn(), close: vi.fn() } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const response = await fetch(`${server.address()}/v1/auth/login/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "s".repeat(32), deviceName: "Mac" }) });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: { code: "oidc-unavailable" } });
    } finally { await server.stop(); }
  });
});
