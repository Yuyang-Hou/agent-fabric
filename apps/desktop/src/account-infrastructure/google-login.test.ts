import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { DesktopGoogleLogin } from "./google-login.js";

describe("desktop Google system-browser login", () => {
  it("keeps email OTP and PKCE exchange in Main-process infrastructure", async () => {
    let challenge = "";
    let attemptId = "";
    const cloud = createServer(async (request, response) => {
      if (respondVersion(request, response)) return;
      const body = await readJson(request);
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/auth/device/email/request") {
        challenge = String(body.codeChallenge); attemptId = "auth-attempt:email";
        response.writeHead(202).end(JSON.stringify({ attemptId, expiresAt: "2026-08-17T14:00:00.000Z", resendAfterSeconds: 60 })); return;
      }
      if (request.url === "/v1/auth/device/email/verify") {
        expect(body).toEqual({ attemptId, email: "alice@example.com", otp: "123456" });
        response.end(JSON.stringify({ exchangeCode: "email-proof" })); return;
      }
      if (request.url === "/v1/auth/device/exchange") {
        expect(createHash("sha256").update(String(body.codeVerifier)).digest("base64url")).toBe(challenge);
        expect(body.exchangeCode).toBe("email-proof");
        response.end(JSON.stringify({ server: origin, token: "email-device-secret", humanPrincipalId: "human:alice", principalId: "device:alice", accountId: "account:alice", displayName: "Alice", expiresAt: "2026-11-10T00:00:00.000Z" })); return;
      }
      response.writeHead(404).end();
    });
    const origin = await listen(cloud);
    const login = new DesktopGoogleLogin({ serverBaseUrl: origin, deviceName: "Alice Mac", openExternal: vi.fn() });
    try {
      await expect(login.requestEmailCode("Alice@Example.com")).resolves.toEqual({ expiresAt: "2026-08-17T14:00:00.000Z", resendAfterSeconds: 60 });
      const activated = await login.loginEmail("alice@example.com", "123456", async (session) => ({ tokenReceived: session.token }));
      expect(activated).toEqual({ tokenReceived: "email-device-secret" });
      await expect(login.loginEmail("alice@example.com", "123456", vi.fn())).rejects.toThrow("login-session-invalid");
    } finally { await close(cloud); }
  });

  it("waits for complete Account activation before the browser reports success", async () => {
    let returnUri = "";
    let clientState = "";
    let codeChallenge = "";
    let logoutAuthorization = "";
    const cloud = createServer(async (request, response) => {
      if (respondVersion(request, response)) return;
      const body = await readJson(request);
      if (request.url === "/v1/auth/device/exchange") {
        expect(createHash("sha256").update(String(body.codeVerifier)).digest("base64url")).toBe(codeChallenge);
        expect(body.exchangeCode).toBe("one-time-code");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ server: origin, token: "app-device-secret", humanPrincipalId: "human:alice", principalId: "device:alice-mac", displayName: "Alice", expiresAt: "2026-11-10T00:00:00.000Z" }));
        return;
      }
      if (request.url === "/v1/auth/logout") {
        logoutAuthorization = String(request.headers.authorization);
        response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "logged_out" })); return;
      }
      response.writeHead(404).end();
    });
    const origin = await listen(cloud);
    let browserResponse: Promise<Response> | undefined;
    let releaseActivation: () => void = () => undefined;
    const activationGate = new Promise<void>((resolve) => { releaseActivation = resolve; });
    let markActivationStarted: () => void = () => undefined;
    const activationStarted = new Promise<void>((resolve) => { markActivationStarted = resolve; });
    const login = new DesktopGoogleLogin({
      serverBaseUrl: origin,
      deviceName: "Alice Mac",
      openExternal: async (authorizationUrl) => {
        const url = new URL(authorizationUrl);
        const callback = returnUri = required(url.searchParams.get("returnUri"));
        const state = clientState = required(url.searchParams.get("clientState"));
        codeChallenge = required(url.searchParams.get("codeChallenge"));
        browserResponse = fetch(`${callback}?code=one-time-code&state=${state}`);
      },
      timeoutMs: 10_000,
    });
    try {
      const result = login.login(async (exchanged) => {
        expect(exchanged).toMatchObject({ token: "app-device-secret", displayName: "Alice", principalId: "device:alice-mac" });
        markActivationStarted();
        await activationGate;
        return { state: "signed-in" as const };
      });
      await activationStarted;
      const duplicateStatus = (await fetch(`${returnUri}?code=duplicate-secret&state=${clientState}`)).status;
      let browserSettled = false;
      void browserResponse?.then(() => { browserSettled = true; });
      await delay(20);
      expect(browserSettled).toBe(false);
      expect(duplicateStatus).toBe(409);
      releaseActivation();
      await expect(result).resolves.toEqual({ state: "signed-in" });
      const completed = await browserResponse;
      expect(completed?.status).toBe(200);
      expect(completed?.headers.get("cache-control")).toContain("no-store");
      expect(completed?.headers.get("content-security-policy")).toContain("default-src 'none'");
      const page = await completed?.text();
      expect(page).toContain("登录已完成");
      expect(page).not.toMatch(/one-time-code|app-device-secret|clientState|codeVerifier/u);
      expect(returnUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/u);
      expect(clientState).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      await login.logout("app-device-secret");
      expect(logoutAuthorization).toBe("Bearer app-device-secret");
    } finally {
      await close(cloud);
    }
  });

  it("reports exchange failure consistently without exposing the raw server error", async () => {
    const cloud = createServer(async (request, response) => {
      if (respondVersion(request, response)) return;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "secret-/Users/alice-token" } }));
    });
    const origin = await listen(cloud);
    let browserResponse: Promise<Response> | undefined;
    const login = new DesktopGoogleLogin({
      serverBaseUrl: origin, deviceName: "Alice Mac",
      openExternal: async (authorizationUrl) => {
        const url = new URL(authorizationUrl);
        browserResponse = fetch(`${required(url.searchParams.get("returnUri"))}?code=one-time-code&state=${required(url.searchParams.get("clientState"))}`);
      },
      timeoutMs: 2_000,
    });
    try {
      await expect(login.login(vi.fn())).rejects.toThrow("login-exchange-failed");
      const response = await browserResponse;
      expect(response?.status).toBe(502);
      const page = await response?.text();
      expect(page).toContain("登录未完成");
      expect(page).not.toMatch(/secret|Users|one-time-code/u);
    } finally { await close(cloud); }
  });

  it("returns the same bounded failure when secure activation rejects", async () => {
    const { cloud, origin } = await loginCloud();
    let browserResponse: Promise<Response> | undefined;
    const login = new DesktopGoogleLogin({
      serverBaseUrl: origin, deviceName: "Alice Mac",
      openExternal: async (authorizationUrl) => {
        const url = new URL(authorizationUrl);
        browserResponse = fetch(`${required(url.searchParams.get("returnUri"))}?code=one-time-code&state=${required(url.searchParams.get("clientState"))}`);
      },
      timeoutMs: 2_000,
    });
    try {
      await expect(login.login(async () => { throw Object.assign(new Error("/private/keychain/token"), { code: "login-secure-storage-failed" }); })).rejects.toThrow("login-secure-storage-failed");
      const page = await (await browserResponse)?.text();
      expect(page).toContain("登录未完成");
      expect(page).not.toMatch(/private|keychain|token|one-time-code/u);
    } finally { await close(cloud); }
  });

  it("handles provider cancellation without activating a session", async () => {
    const { cloud, origin } = await loginCloud();
    let browserResponse: Promise<Response> | undefined;
    const activate = vi.fn();
    const login = new DesktopGoogleLogin({
      serverBaseUrl: origin, deviceName: "Alice Mac",
      openExternal: async (authorizationUrl) => {
        const url = new URL(authorizationUrl);
        browserResponse = fetch(`${required(url.searchParams.get("returnUri"))}?error=login_cancelled&state=${required(url.searchParams.get("clientState"))}`);
      },
      timeoutMs: 2_000,
    });
    try {
      await expect(login.login(activate)).rejects.toThrow("login-cancelled");
      expect(activate).not.toHaveBeenCalled();
      expect(await (await browserResponse)?.text()).toContain("登录已取消");
    } finally { await close(cloud); }
  });

  it("expires a callback attempt that never returns", async () => {
    const { cloud, origin } = await loginCloud();
    const login = new DesktopGoogleLogin({ serverBaseUrl: origin, deviceName: "Alice Mac", openExternal: async () => undefined, timeoutMs: 20 });
    try { await expect(login.login(vi.fn())).rejects.toThrow("login-callback-timeout"); }
    finally { await close(cloud); }
  });
});

async function loginCloud(): Promise<{ readonly cloud: ReturnType<typeof createServer>; readonly origin: string }> {
  const cloud = createServer(async (request, response) => {
    if (respondVersion(request, response)) return;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ server: "https://fabric.example", token: "app-device-secret", humanPrincipalId: "human:alice", principalId: "device:alice-mac", displayName: "Alice", expiresAt: "2026-11-10T00:00:00.000Z" }));
  });
  return { cloud, origin: await listen(cloud) };
}

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test-address-unavailable");
  return `http://127.0.0.1:${address.port}`;
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function required(value: string | null): string {
  if (!value) throw new Error("test-value-missing");
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function respondVersion(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.url !== "/v1/version") return false;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ product: "agent-fabric", component: "server", version: "0.1.0", protocolMajor: 1, a2aVersion: "1.0.1", runtimeAdapterVersion: "1", features: ["google-account-login", "email-otp-login"] }));
  return true;
}
