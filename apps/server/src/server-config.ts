import { componentVersionSchema, type ComponentVersion } from "@agent-fabric/fabric-contracts";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly publicBaseUrl: string;
  readonly databaseUrl: string;
  readonly databaseDriver: "mysql";
  readonly tunnelTimeoutMs: number;
  readonly googleOidc?: GoogleOidcConfig;
  readonly component: ComponentVersion;
}

export interface GoogleOidcConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly selfServiceAllowedDomains: readonly string[];
  readonly selfServiceLoginLimit: number;
}

export function loadServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const publicBaseUrl = required(environment, "AGENT_FABRIC_PUBLIC_BASE_URL");
  const parsedUrl = new URL(publicBaseUrl);
  const host = environment.AGENT_FABRIC_HOST ?? "127.0.0.1";
  const port = integer(environment.AGENT_FABRIC_PORT ?? "8787", "AGENT_FABRIC_PORT");
  const publicOrigin = !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname);
  if (publicOrigin && parsedUrl.protocol !== "https:") throw new ServerConfigError("public-tls-required");
  const databaseDriver = databaseDriverValue(environment.AGENT_FABRIC_DATABASE_DRIVER ?? "mysql");
  const databaseUrl = normalizeDatabaseUrl(databaseDriver, required(environment, "DATABASE_URL"));
  const databaseProtocol = new URL(databaseUrl).protocol;
  const expectedProtocols = ["mysql:"];
  if (!expectedProtocols.includes(databaseProtocol)) throw new ServerConfigError("database-driver-url-mismatch");
  const normalizedPublicBaseUrl = parsedUrl.toString().replace(/\/$/u, "");
  const googleOidc = optionalGoogleOidc(environment, normalizedPublicBaseUrl);
  return Object.freeze({
    host,
    port,
    publicBaseUrl: normalizedPublicBaseUrl,
    databaseUrl,
    databaseDriver,
    tunnelTimeoutMs: integer(environment.AGENT_FABRIC_TUNNEL_TIMEOUT_MS ?? "30000", "AGENT_FABRIC_TUNNEL_TIMEOUT_MS"),
    ...(googleOidc ? { googleOidc } : {}),
    component: componentVersionSchema.parse({
      product: "agent-fabric", component: "server", version: "0.1.0", protocolMajor: 1,
      a2aVersion: "1.0.1", runtimeAdapterVersion: "1", features: ["a2a-rest", "account-runtime-websocket", "account-agents", "human-friendships", databaseDriver, ...(googleOidc ? ["google-account-login", "friend-invitations"] : [])],
    }),
  });
}

function optionalGoogleOidc(environment: NodeJS.ProcessEnv, publicBaseUrl: string): GoogleOidcConfig | undefined {
  const values = [environment.AGENT_FABRIC_GOOGLE_CLIENT_ID?.trim(), environment.AGENT_FABRIC_GOOGLE_CLIENT_SECRET?.trim(), environment.AGENT_FABRIC_GOOGLE_REDIRECT_URI?.trim()];
  if (values.every((value) => !value)) return undefined;
  if (values.some((value) => !value)) throw new ServerConfigError("google-oidc-configuration-incomplete");
  const [clientId, clientSecret, redirectUri] = values as [string, string, string];
  if (redirectUri !== `${publicBaseUrl}/v1/auth/google/callback` || new URL(redirectUri).protocol !== "https:") throw new ServerConfigError("google-oidc-redirect-invalid");
  const selfServiceAllowedDomains = (environment.AGENT_FABRIC_GOOGLE_SELF_SERVICE_ALLOWED_DOMAINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const selfServiceLoginLimit = integer(environment.AGENT_FABRIC_GOOGLE_SELF_SERVICE_LOGIN_LIMIT ?? "20", "AGENT_FABRIC_GOOGLE_SELF_SERVICE_LOGIN_LIMIT");
  return Object.freeze({ clientId, clientSecret, redirectUri, selfServiceAllowedDomains: Object.freeze(selfServiceAllowedDomains), selfServiceLoginLimit });
}

function normalizeDatabaseUrl(_driver: "mysql", value: string): string {
  if (!value.startsWith("jdbc:mysql://")) return value;
  const parsed = new URL(value.slice("jdbc:".length));
  const username = parsed.searchParams.get("user");
  const password = parsed.searchParams.get("password");
  if (!username || password === null) throw new ServerConfigError("database-jdbc-credentials-missing");
  const connectTimeout = parsed.searchParams.get("connectTimeout");
  const useSsl = parsed.searchParams.get("useSSL");
  parsed.username = username;
  parsed.password = password;
  parsed.search = "";
  if (connectTimeout && /^\d+$/u.test(connectTimeout)) parsed.searchParams.set("connectTimeout", connectTimeout);
  if (useSsl === "true") parsed.searchParams.set("ssl", JSON.stringify({ rejectUnauthorized: true }));
  return parsed.toString();
}

function databaseDriverValue(value: string): "mysql" {
  if (value === "mysql") return value;
  throw new ServerConfigError("database-driver-unsupported");
}

export class ServerConfigError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ServerConfigError";
  }
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ServerConfigError(`missing:${name}`);
  return value;
}

function integer(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (name !== "AGENT_FABRIC_PORT" && parsed === 0)) throw new ServerConfigError(`invalid:${name}`);
  return parsed;
}
