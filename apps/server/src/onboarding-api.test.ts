import { describe, expect, it, vi } from "vitest";

import type { AuthenticationBroker } from "./auth-broker.js";
import type { PersistenceStore } from "./persistence-store.js";
import { loadServerConfig } from "./server-config.js";
import { createAgentFabricServer } from "./server.js";

const authenticationConfig = {
  secret: "s".repeat(32),
  google: { clientId: "client", clientSecret: "secret", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 },
  emailOtp: { smtp: { host: "smtp.example.com", port: 465, secure: true, from: "Agent Fabric <login@example.com>" }, requestLimitPerHour: 6, verifyLimitPerTenMinutes: 10 },
} as const;

function fakeBroker(overrides: Partial<AuthenticationBroker> = {}): AuthenticationBroker {
  return {
    handler: (_request, response) => response.status(404).end(),
    googleEnabled: true,
    initialize: vi.fn(),
    emailOtpAvailable: vi.fn().mockReturnValue(true),
    consumeGoogleStart: vi.fn(),
    consumeEmail: vi.fn(),
    beginGoogle: vi.fn().mockResolvedValue({ url: "https://accounts.google.com/auth", headers: new Headers({ "set-cookie": "oauth-state=opaque; HttpOnly; Secure" }) }),
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn().mockResolvedValue({ id: "auth-user:alice", email: "alice@example.com", emailVerified: true, name: "Alice" }),
    sessionUser: vi.fn().mockResolvedValue({ id: "auth-user:alice", email: "alice@example.com", emailVerified: true, name: "Alice" }),
    endSession: vi.fn().mockResolvedValue(new Headers({ "set-cookie": "better-auth.session_token=; Max-Age=0" })),
    close: vi.fn(),
    ...overrides,
  };
}

function baseConfig() {
  const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
  return { ...base, port: 0, authentication: authenticationConfig };
}

describe("unified authentication API", () => {
  it("uses the broker for Google and redeems a one-time device proof", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      createAccountLoginAttempt: vi.fn().mockResolvedValue({ attemptId: "auth-attempt:one", expiresAt: "2026-08-17T01:10:00.000Z" }),
      authenticateAccountLoginAttempt: vi.fn().mockResolvedValue({ returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state" }),
      redeemAccountLoginAttempt: vi.fn().mockResolvedValue({ token: "device-secret", humanPrincipalId: "human:alice", principalId: "device:alice", accountId: "account:alice", displayName: "Alice", expiresAt: "2026-11-15T00:00:00.000Z" }),
    } as unknown as PersistenceStore;
    const broker = fakeBroker();
    const server = createAgentFabricServer(baseConfig(), { store, authenticationBroker: broker });
    await server.start();
    try {
      const start = new URL("/v1/auth/device/google/start", server.address());
      start.search = new URLSearchParams({ codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state", deviceName: "Alice Mac" }).toString();
      const started = await fetch(start, { redirect: "manual" });
      expect(started.status).toBe(303);
      expect(started.headers.get("location")).toBe("https://accounts.google.com/auth");
      expect(store.createAccountLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ method: "google", codeChallenge: "c".repeat(43) }));

      const completed = await fetch(`${server.address()}/v1/auth/device/google/complete?attemptId=auth-attempt%3Aone`, { redirect: "manual" });
      expect(completed.status).toBe(303);
      const proof = new URL(completed.headers.get("location") as string).searchParams.get("code");
      expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(store.authenticateAccountLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ attemptId: "auth-attempt:one", expectedMethod: "google", authUserId: "auth-user:alice" }));

      const exchanged = await fetch(`${server.address()}/v1/auth/device/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exchangeCode: proof, codeVerifier: "v".repeat(43) }) });
      expect(await exchanged.json()).toMatchObject({ token: "device-secret", humanPrincipalId: "human:alice", accountId: "account:alice" });
      expect(store.redeemAccountLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ codeChallenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u) }));
    } finally { await server.stop(); }
  });

  it("requests and verifies email OTP without exposing the Better Auth session", async () => {
    const store = {
      migrate: vi.fn(), close: vi.fn(),
      createAccountLoginAttempt: vi.fn().mockResolvedValue({ attemptId: "auth-attempt:email", expiresAt: "2026-08-17T01:10:00.000Z" }),
      getAccountLoginAttempt: vi.fn().mockResolvedValue({ attemptId: "auth-attempt:email", method: "email", returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state", expiresAt: "2026-08-17T01:10:00.000Z", emailDigest: "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976" }),
      authenticateAccountLoginAttempt: vi.fn().mockResolvedValue({ returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state" }),
    } as unknown as PersistenceStore;
    const broker = fakeBroker();
    const server = createAgentFabricServer(baseConfig(), { store, authenticationBroker: broker });
    await server.start();
    try {
      const requested = await fetch(`${server.address()}/v1/auth/device/email/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "Alice@Example.com", codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state", deviceName: "Alice Mac" }) });
      expect(requested.status).toBe(202);
      expect(await requested.json()).toEqual({ attemptId: "auth-attempt:email", expiresAt: "2026-08-17T01:10:00.000Z", resendAfterSeconds: 60 });
      expect(broker.requestEmailCode).toHaveBeenCalledWith("alice@example.com");

      const verified = await fetch(`${server.address()}/v1/auth/device/email/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attemptId: "auth-attempt:email", email: "alice@example.com", otp: "123456" }) });
      expect(verified.status).toBe(200);
      expect(await verified.json()).toEqual({ exchangeCode: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u) });
      expect(store.authenticateAccountLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({ expectedMethod: "email", authUserId: "auth-user:alice" }));
    } finally { await server.stop(); }
  });

  it("removes the legacy login endpoints and rejects login when authentication is disabled", async () => {
    const store = { migrate: vi.fn(), close: vi.fn() } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      expect((await fetch(`${server.address()}/v1/auth/login/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(404);
      const start = new URL("/v1/auth/device/google/start", server.address());
      start.search = new URLSearchParams({ codeChallenge: "c".repeat(43), returnUri: "http://127.0.0.1:45678/callback", clientState: "client-state", deviceName: "Mac" }).toString();
      const disabled = await fetch(start);
      expect(disabled.status).toBe(503);
      expect(await disabled.json()).toEqual({ error: { code: "authentication-unavailable" } });
    } finally { await server.stop(); }
  });

  it("revokes the authenticated App credential on logout", async () => {
    const store = { migrate: vi.fn(), close: vi.fn(), revokeCredential: vi.fn(), authenticate: vi.fn().mockResolvedValue({ credentialId: "credential:app", principalId: "device:owner", instanceId: "instance:one", scopes: ["account:access"] }) } as unknown as PersistenceStore;
    const base = loadServerConfig({ AGENT_FABRIC_PUBLIC_BASE_URL: "http://127.0.0.1:8787", AGENT_FABRIC_DATABASE_DRIVER: "mysql", DATABASE_URL: "mysql://unused:unused@localhost/unused" });
    const server = createAgentFabricServer({ ...base, port: 0 }, { store });
    await server.start();
    try {
      const response = await fetch(`${server.address()}/v1/auth/logout`, { method: "POST", headers: { authorization: "Bearer app-credential", "content-type": "application/json" }, body: "{}" });
      expect(response.status).toBe(200);
      expect(store.revokeCredential).toHaveBeenCalledWith("credential:app");
    } finally { await server.stop(); }
  });
});
