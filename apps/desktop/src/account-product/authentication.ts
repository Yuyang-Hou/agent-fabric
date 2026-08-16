import { AgentFabricClient, FabricClientError } from "@agent-fabric/client";
import type { AccountResourceInvalidation } from "@agent-fabric/account-agent-domain";

import type { AccountProductAuthenticatedSession, AccountProductAuthenticationPort } from "./host.js";

export interface AccountProductCredentialVaultPort {
  get(kind: "app-session"): Promise<string | undefined>;
  set(kind: "app-session", value: string): Promise<void>;
  clearSession(): Promise<void>;
}

export interface AccountProductGoogleLoginPort {
  login<T>(activate: (login: { readonly token: string }) => Promise<T>): Promise<T>;
}

export interface AccountProductSessionActivation {
  readonly token: string;
  readonly session: AccountProductAuthenticatedSession["session"];
  readonly accountName: string;
}

export class DesktopAccountProductAuthentication implements AccountProductAuthenticationPort {
  constructor(readonly options: {
    readonly serverBaseUrl: string;
    readonly credentialVault: AccountProductCredentialVaultPort;
    readonly googleLogin: AccountProductGoogleLoginPort;
    readonly fetchImpl?: typeof fetch;
    readonly subscribeInvalidations?: (
      serverBaseUrl: string,
      token: string,
      onEvent: (event: AccountResourceInvalidation) => void,
      onConnection: (state: "online" | "reconnecting" | "offline") => void,
    ) => () => void;
    readonly onSessionLoaded?: (activation: AccountProductSessionActivation) => Promise<AccountProductAuthenticatedSession["localServices"] | void>;
    readonly onSessionCleared?: () => Promise<void>;
  }) {}

  async login<T>(activate: (session: AccountProductAuthenticatedSession) => Promise<T>): Promise<T> {
    return this.options.googleLogin.login(async (login) => {
      try { await this.options.credentialVault.set("app-session", login.token); }
      catch {
        await this.options.credentialVault.clearSession().catch(() => undefined);
        throw new AccountLoginActivationError("login-secure-storage-failed");
      }
      let authenticated: AccountProductAuthenticatedSession;
      try { authenticated = await this.#load(login.token); }
      catch (error) {
        await this.options.credentialVault.clearSession().catch(() => undefined);
        throw new AccountLoginActivationError(loginActivationFailureCode(error));
      }
      try { return await activate(authenticated); }
      catch {
        await this.options.credentialVault.clearSession().catch(() => undefined);
        throw new AccountLoginActivationError("login-bootstrap-failed");
      }
    });
  }

  async restore(): Promise<AccountProductAuthenticatedSession | undefined> {
    const token = await this.options.credentialVault.get("app-session");
    if (!token) return undefined;
    try { return await this.#load(token); }
    catch (error) { throw new AccountLoginActivationError(restoreFailureCode(error)); }
  }

  async clear(options: { readonly preserveCredential?: boolean } = {}): Promise<void> {
    try { await this.options.onSessionCleared?.(); }
    finally { if (!options.preserveCredential) await this.options.credentialVault.clearSession(); }
  }

  async #load(token: string): Promise<AccountProductAuthenticatedSession> {
    const client = new AgentFabricClient({ baseUrl: this.options.serverBaseUrl, token, ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}) });
    const [version, session, account] = await Promise.all([client.version(), client.getAccountSession(), client.getAccount()]);
    if (!version.features.includes("account-agents")) throw new AccountLoginActivationError("login-cloud-incompatible");
    if (session.accountId !== account.accountId) throw new Error("account-session-mismatch");
    const localServices = await this.options.onSessionLoaded?.({ token, session, accountName: account.name });
    return {
      client, session, accountName: account.name,
      ...(localServices ? { localServices } : {}),
      ...(this.options.subscribeInvalidations ? {
        subscribeInvalidations: (onEvent: (event: AccountResourceInvalidation) => void, onConnection: (state: "online" | "reconnecting" | "offline") => void) =>
          this.options.subscribeInvalidations?.(this.options.serverBaseUrl, token, onEvent, onConnection) ?? (() => undefined),
      } : {}),
    };
  }
}

class AccountLoginActivationError extends Error {
  constructor(readonly code: "login-secure-storage-failed" | "login-session-invalid" | "login-cloud-incompatible" | "login-bootstrap-failed" | "server-unreachable") {
    super(code);
    this.name = "AccountLoginActivationError";
  }
}

function loginActivationFailureCode(error: unknown): "login-session-invalid" | "login-cloud-incompatible" | "server-unreachable" {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "";
  if (code === "login-cloud-incompatible") return "login-cloud-incompatible";
  return code === "server-unreachable" ? "server-unreachable" : "login-session-invalid";
}

function restoreFailureCode(error: unknown): "login-session-invalid" | "login-cloud-incompatible" | "server-unreachable" {
  if (error instanceof AccountLoginActivationError && error.code === "login-cloud-incompatible") return error.code;
  if (error instanceof FabricClientError && (error.status === 401 || error.status === 403)) return "login-session-invalid";
  if (error instanceof Error && error.message === "account-session-mismatch") return "login-session-invalid";
  return "server-unreachable";
}
