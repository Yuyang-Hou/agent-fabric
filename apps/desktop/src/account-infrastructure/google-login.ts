import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";

import { AgentFabricClient } from "@agent-fabric/client";

type OwnerLoginExchangeResponse = Awaited<ReturnType<AgentFabricClient["exchangeLogin"]>>;

export type DesktopLoginFailureCode =
  | "login-cancelled"
  | "login-callback-timeout"
  | "login-callback-invalid"
  | "login-exchange-failed"
  | "login-session-invalid"
  | "login-cloud-incompatible"
  | "login-bootstrap-failed"
  | "login-secure-storage-failed"
  | "server-unreachable";

export class DesktopLoginError extends Error {
  constructor(readonly code: DesktopLoginFailureCode) {
    super(code);
    this.name = "DesktopLoginError";
  }
}

export interface DesktopGoogleLoginOptions {
  readonly serverBaseUrl: string;
  readonly deviceName: string;
  readonly openExternal: (url: string) => Promise<void>;
  readonly timeoutMs?: number;
}

export class DesktopGoogleLogin {
  constructor(readonly options: DesktopGoogleLoginOptions) {}

  async login<T>(activate: (login: OwnerLoginExchangeResponse) => Promise<T>): Promise<T> {
    const verifier = randomBytes(32).toString("base64url");
    const clientState = randomBytes(32).toString("base64url");
    const callback = await listenForCallback(clientState, this.options.timeoutMs ?? 10 * 60 * 1000);
    let submission: CallbackSubmission | undefined;
    try {
      const client = new AgentFabricClient({ baseUrl: this.options.serverBaseUrl });
      let started;
      try {
        started = await client.startLogin({ codeChallenge: createHash("sha256").update(verifier).digest("base64url"), returnUri: callback.returnUri, clientState, deviceName: this.options.deviceName });
      } catch (error) {
        throw normalizeLoginError(error, "login-exchange-failed");
      }
      try { await this.options.openExternal(started.authorizationUrl); }
      catch { throw new DesktopLoginError("login-callback-invalid"); }
      submission = await callback.result;
      if (submission.kind === "cancelled") throw new DesktopLoginError("login-cancelled");
      if (submission.kind === "invalid") throw new DesktopLoginError("login-callback-invalid");
      let exchanged: OwnerLoginExchangeResponse;
      try { exchanged = await client.exchangeLogin(submission.code, verifier); }
      catch (error) { throw normalizeLoginError(error, "login-exchange-failed"); }
      let activated: T;
      try { activated = await activate(exchanged); }
      catch (error) { throw normalizeLoginError(error, "login-session-invalid"); }
      await submission.complete("success");
      return activated;
    } catch (error) {
      const normalized = normalizeLoginError(error, "login-exchange-failed");
      await submission?.complete(normalized.code === "login-cancelled" ? "cancelled" : "failed").catch(() => undefined);
      throw normalized;
    } finally {
      await callback.close();
    }
  }

  async logout(token: string): Promise<void> {
    await new AgentFabricClient({ baseUrl: this.options.serverBaseUrl, token }).logout();
  }
}

type CallbackOutcome = "success" | "cancelled" | "failed";
type CallbackSubmission =
  | { readonly kind: "code"; readonly code: string; readonly complete: (outcome: CallbackOutcome) => Promise<void> }
  | { readonly kind: "cancelled"; readonly complete: (outcome: CallbackOutcome) => Promise<void> }
  | { readonly kind: "invalid"; readonly complete: (outcome: CallbackOutcome) => Promise<void> };

async function listenForCallback(expectedState: string, timeoutMs: number): Promise<{ readonly returnUri: string; readonly result: Promise<CallbackSubmission>; readonly close: () => Promise<void> }> {
  let resolveResult: (submission: CallbackSubmission) => void = () => undefined;
  let rejectResult: (error: Error) => void = () => undefined;
  let claimed = false;
  const result = new Promise<CallbackSubmission>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== "/callback" || url.searchParams.get("state") !== expectedState) {
      void writeCallbackResponse(response, 400, "invalid");
      return;
    }
    if (claimed) {
      void writeCallbackResponse(response, 409, "processing");
      return;
    }
    claimed = true;
    const providerError = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    let completed = false;
    const complete = async (outcome: CallbackOutcome) => {
      if (completed) return;
      completed = true;
      await writeCallbackResponse(response, outcome === "failed" ? 502 : 200, outcome);
    };
    if (providerError === "login_cancelled" || providerError === "access_denied") resolveResult({ kind: "cancelled", complete });
    else if (providerError || !code) resolveResult({ kind: "invalid", complete });
    else resolveResult({ kind: "code", code, complete });
  });
  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("login-callback-address-unavailable");
  const timer = setTimeout(() => rejectResult(new DesktopLoginError("login-callback-timeout")), timeoutMs);
  return {
    returnUri: `http://127.0.0.1:${address.port}/callback`,
    result,
    close: async () => { clearTimeout(timer); await close(server); },
  };
}

function writeCallbackResponse(response: ServerResponse, status: number, kind: CallbackOutcome | "invalid" | "processing"): Promise<void> {
  const message = kind === "success"
    ? "登录已完成，可以关闭此页面。"
    : kind === "cancelled"
      ? "登录已取消，可以关闭此页面。"
      : kind === "processing"
        ? "登录正在处理中，请保留原页面。"
        : kind === "invalid"
          ? "无效的 Agent Fabric 登录回调。"
          : "登录未完成，请返回 Agent Fabric 后重试。";
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    connection: "close",
  });
  return new Promise((resolve) => {
    response.once("close", resolve);
    response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Agent Fabric</title><p>${message}</p></html>`, resolve);
  });
}

function normalizeLoginError(error: unknown, fallback: DesktopLoginFailureCode): DesktopLoginError {
  if (error instanceof DesktopLoginError) return error;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "";
  if (code === "server-unreachable") return new DesktopLoginError("server-unreachable");
  if (new Set<DesktopLoginFailureCode>(["login-cancelled", "login-callback-timeout", "login-callback-invalid", "login-exchange-failed", "login-session-invalid", "login-cloud-incompatible", "login-bootstrap-failed", "login-secure-storage-failed"]).has(code as DesktopLoginFailureCode)) return new DesktopLoginError(code as DesktopLoginFailureCode);
  return new DesktopLoginError(fallback);
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
}
function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
    server.closeAllConnections();
  });
}
