import { componentVersionSchema, type ComponentVersion } from "@agent-fabric/fabric-contracts";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly publicBaseUrl: string;
  readonly databaseUrl: string;
  readonly databaseDriver: "mysql";
  readonly tunnelTimeoutMs: number;
  readonly authentication?: AuthenticationConfig;
  readonly component: ComponentVersion;
}

export interface AuthenticationConfig {
  readonly secret: string;
  readonly google?: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly selfServiceAllowedDomains: readonly string[];
    readonly selfServiceLoginLimit: number;
  };
  readonly emailOtp?: {
    readonly smtp: {
      readonly host: string;
      readonly port: number;
      readonly secure: boolean;
      readonly username?: string;
      readonly password?: string;
      readonly from: string;
    };
    readonly requestLimitPerHour: number;
    readonly verifyLimitPerTenMinutes: number;
  };
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
  const authentication = optionalAuthentication(environment);
  return Object.freeze({
    host,
    port,
    publicBaseUrl: normalizedPublicBaseUrl,
    databaseUrl,
    databaseDriver,
    tunnelTimeoutMs: integer(environment.AGENT_FABRIC_TUNNEL_TIMEOUT_MS ?? "30000", "AGENT_FABRIC_TUNNEL_TIMEOUT_MS"),
    ...(authentication ? { authentication } : {}),
    component: componentVersionSchema.parse({
      product: "agent-fabric", component: "server", version: "0.1.0", protocolMajor: 1,
      a2aVersion: "1.0.1", runtimeAdapterVersion: "1", features: [
        "a2a-rest", "account-runtime-websocket", "account-agents", "human-friendships", databaseDriver,
        ...(authentication ? ["friend-invitations"] : []),
        ...(authentication?.google ? ["google-account-login"] : []),
        ...(authentication?.emailOtp ? ["email-otp-login"] : []),
      ],
    }),
  });
}

function optionalAuthentication(environment: NodeJS.ProcessEnv): AuthenticationConfig | undefined {
  const googleValues = [environment.AGENT_FABRIC_GOOGLE_CLIENT_ID?.trim(), environment.AGENT_FABRIC_GOOGLE_CLIENT_SECRET?.trim()];
  const smtpValues = [environment.AGENT_FABRIC_SMTP_HOST?.trim(), environment.AGENT_FABRIC_SMTP_PORT?.trim(), environment.AGENT_FABRIC_SMTP_FROM?.trim()];
  const hasGoogle = googleValues.some(Boolean);
  const hasEmailOtp = smtpValues.some(Boolean) || Boolean(environment.AGENT_FABRIC_SMTP_USERNAME?.trim() || environment.AGENT_FABRIC_SMTP_PASSWORD?.trim());
  if (!hasGoogle && !hasEmailOtp) return undefined;
  const secret = environment.AGENT_FABRIC_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new ServerConfigError("authentication-secret-invalid");
  if (hasGoogle && googleValues.some((value) => !value)) throw new ServerConfigError("google-auth-configuration-incomplete");
  if (hasEmailOtp && smtpValues.some((value) => !value)) throw new ServerConfigError("email-otp-configuration-incomplete");
  const smtpUsername = environment.AGENT_FABRIC_SMTP_USERNAME?.trim();
  const smtpPassword = environment.AGENT_FABRIC_SMTP_PASSWORD?.trim();
  if (Boolean(smtpUsername) !== Boolean(smtpPassword)) throw new ServerConfigError("smtp-auth-configuration-incomplete");
  const selfServiceAllowedDomains = (environment.AGENT_FABRIC_GOOGLE_SELF_SERVICE_ALLOWED_DOMAINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const selfServiceLoginLimit = integer(environment.AGENT_FABRIC_GOOGLE_SELF_SERVICE_LOGIN_LIMIT ?? "20", "AGENT_FABRIC_GOOGLE_SELF_SERVICE_LOGIN_LIMIT");
  return Object.freeze({
    secret,
    ...(hasGoogle ? { google: Object.freeze({
      clientId: googleValues[0] as string,
      clientSecret: googleValues[1] as string,
      selfServiceAllowedDomains: Object.freeze(selfServiceAllowedDomains),
      selfServiceLoginLimit,
    }) } : {}),
    ...(hasEmailOtp ? { emailOtp: Object.freeze({
      smtp: Object.freeze({
        host: smtpValues[0] as string,
        port: integer(smtpValues[1] as string, "AGENT_FABRIC_SMTP_PORT"),
        secure: boolean(environment.AGENT_FABRIC_SMTP_SECURE ?? "true", "AGENT_FABRIC_SMTP_SECURE"),
        ...(smtpUsername && smtpPassword ? { username: smtpUsername, password: smtpPassword } : {}),
        from: smtpValues[2] as string,
      }),
      requestLimitPerHour: integer(environment.AGENT_FABRIC_EMAIL_OTP_REQUEST_LIMIT_PER_HOUR ?? "6", "AGENT_FABRIC_EMAIL_OTP_REQUEST_LIMIT_PER_HOUR"),
      verifyLimitPerTenMinutes: integer(environment.AGENT_FABRIC_EMAIL_OTP_VERIFY_LIMIT_PER_TEN_MINUTES ?? "10", "AGENT_FABRIC_EMAIL_OTP_VERIFY_LIMIT_PER_TEN_MINUTES"),
    }) } : {}),
  });
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

function boolean(value: string, name: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ServerConfigError(`invalid:${name}`);
}
