import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import { emailOTP } from "better-auth/plugins";
import mysqlCallback, { type Pool as CallbackPool } from "mysql2";
import { createPool, type Pool as PromisePool } from "mysql2/promise";
import nodemailer, { type Transporter } from "nodemailer";
import { createHmac, randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { RateLimiterMySQL, type RateLimiterRes } from "rate-limiter-flexible";

import type { AuthenticationConfig, ServerConfig } from "./server-config.js";

export interface AuthenticationUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
}

export interface AuthenticationBroker {
  readonly handler: RequestHandler;
  readonly googleEnabled: boolean;
  initialize(): Promise<void>;
  emailOtpAvailable(): boolean;
  consumeGoogleStart(ipAddress: string): Promise<void>;
  consumeEmail(operation: "request" | "verify", ipAddress: string, email: string): Promise<void>;
  beginGoogle(input: { readonly callbackURL: string; readonly errorCallbackURL: string; readonly headers: HeadersInit }): Promise<{ readonly url: string; readonly headers: Headers }>;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, otp: string): Promise<AuthenticationUser>;
  sessionUser(headers: HeadersInit): Promise<AuthenticationUser | undefined>;
  endSession(headers: HeadersInit): Promise<Headers>;
  close(): Promise<void>;
}

export class AuthenticationBrokerError extends Error {
  constructor(readonly code: "authentication-unavailable" | "email-otp-unavailable" | "authentication-rate-limited" | "authentication-failed", readonly retryAfterMs?: number) {
    super(code);
    this.name = "AuthenticationBrokerError";
  }
}

export function createAuthenticationBroker(config: ServerConfig): AuthenticationBroker | undefined {
  if (!config.authentication) return undefined;
  return new BetterAuthBroker(config.databaseUrl, config.publicBaseUrl, config.authentication);
}

class BetterAuthBroker implements AuthenticationBroker {
  readonly #database: PromisePool;
  readonly #rateLimitDatabase: CallbackPool;
  readonly #mailTransport?: Transporter;
  readonly #authentication: AuthenticationConfig;
  readonly #auth;
  readonly #googleLimiter: RateLimiterMySQL;
  readonly #emailRequestIpLimiter: RateLimiterMySQL;
  readonly #emailRequestAddressLimiter: RateLimiterMySQL;
  readonly #emailVerifyIpLimiter: RateLimiterMySQL;
  readonly #emailVerifyAddressLimiter: RateLimiterMySQL;
  #emailHealthy = false;

  constructor(databaseUrl: string, publicBaseUrl: string, authentication: AuthenticationConfig) {
    this.#authentication = authentication;
    this.#database = createPool({ uri: databaseUrl, connectionLimit: 5, waitForConnections: true, timezone: "Z", dateStrings: true });
    this.#rateLimitDatabase = mysqlCallback.createPool({ uri: databaseUrl, connectionLimit: 3, waitForConnections: true, timezone: "Z" });
    const databaseName = requiredDatabaseName(databaseUrl);
    const limiter = (tableName: string, points: number, duration: number) => new RateLimiterMySQL({
      storeClient: this.#rateLimitDatabase,
      storeType: "pool",
      dbName: databaseName,
      tableName,
      tableCreated: true,
      clearExpiredByTimeout: true,
      keyPrefix: tableName,
      points,
      duration,
      blockDuration: duration,
      inMemoryBlockOnConsumed: points + 1,
      inMemoryBlockDuration: duration,
    });
    this.#googleLimiter = limiter("auth_rate_google_ip", authentication.google?.selfServiceLoginLimit ?? 20, 60 * 60);
    this.#emailRequestIpLimiter = limiter("auth_rate_email_request_ip", authentication.emailOtp?.requestLimitPerHour ?? 6, 60 * 60);
    this.#emailRequestAddressLimiter = limiter("auth_rate_email_request_address", authentication.emailOtp?.requestLimitPerHour ?? 6, 60 * 60);
    this.#emailVerifyIpLimiter = limiter("auth_rate_email_verify_ip", authentication.emailOtp?.verifyLimitPerTenMinutes ?? 10, 10 * 60);
    this.#emailVerifyAddressLimiter = limiter("auth_rate_email_verify_address", authentication.emailOtp?.verifyLimitPerTenMinutes ?? 10, 10 * 60);
    if (authentication.emailOtp) {
      const smtp = authentication.emailOtp.smtp;
      this.#mailTransport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: true,
        ...(smtp.username && smtp.password ? { auth: { user: smtp.username, pass: smtp.password } } : {}),
        tls: { rejectUnauthorized: true },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
    }
    this.#auth = betterAuth({
      appName: "Agent Fabric",
      baseURL: publicBaseUrl,
      basePath: "/v1/auth/broker",
      secret: authentication.secret,
      database: this.#database,
      telemetry: { enabled: false, debug: false },
      emailAndPassword: { enabled: false },
      trustedOrigins: [publicBaseUrl],
      socialProviders: authentication.google ? {
        google: {
          clientId: authentication.google.clientId,
          clientSecret: authentication.google.clientSecret,
          prompt: "select_account",
          disableIdTokenSignIn: true,
        },
      } : {},
      user: { modelName: "auth_users" },
      session: { modelName: "auth_sessions", expiresIn: 5 * 60, updateAge: 0, cookieCache: { enabled: false } },
      account: {
        modelName: "auth_accounts",
        encryptOAuthTokens: true,
        storeStateStrategy: "database",
        accountLinking: {
          enabled: true,
          disableImplicitLinking: false,
          requireLocalEmailVerified: true,
          trustedProviders: ["google"],
          allowDifferentEmails: false,
          allowUnlinkingAll: false,
          updateUserInfoOnLink: false,
        },
      },
      verification: { modelName: "auth_verifications", storeIdentifier: "hashed", storeInDatabase: true },
      rateLimit: { enabled: true, storage: "database", modelName: "auth_rate_limits", window: 60, max: 20 },
      plugins: authentication.emailOtp ? [emailOTP({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        resendStrategy: "rotate",
        disableSignUp: false,
        rateLimit: { window: 60, max: 1 },
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "sign-in" || !this.#mailTransport || !this.#authentication.emailOtp) throw new AuthenticationBrokerError("email-otp-unavailable");
          await this.#mailTransport.sendMail({
            from: this.#authentication.emailOtp.smtp.from,
            to: email,
            subject: "Agent Fabric 登录验证码",
            text: `你的 Agent Fabric 登录验证码是 ${otp}。验证码 5 分钟内有效，请勿转发。`,
            html: `<p>你的 Agent Fabric 登录验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:6px">${otp}</p><p>验证码 5 分钟内有效，请勿转发。</p>`,
          });
        },
      })] : [],
    });
  }

  get handler(): RequestHandler { return toNodeHandler(this.#auth); }
  get googleEnabled(): boolean { return Boolean(this.#authentication.google); }

  async initialize(): Promise<void> {
    const migrations = await getMigrations(this.#auth.options);
    await migrations.runMigrations();
    if (!this.#mailTransport) return;
    try {
      await this.#mailTransport.verify();
      this.#emailHealthy = true;
    } catch {
      this.#emailHealthy = false;
    }
  }

  emailOtpAvailable(): boolean { return this.#emailHealthy; }

  async consumeGoogleStart(ipAddress: string): Promise<void> {
    if (!this.googleEnabled) throw new AuthenticationBrokerError("authentication-unavailable");
    try { await consume(this.#googleLimiter, normalizedIp(ipAddress)); await this.#observe("google-start", "allowed"); }
    catch (error) { await this.#observe("google-start", error instanceof AuthenticationBrokerError && error.code === "authentication-rate-limited" ? "rate-limited" : "failed"); throw error; }
  }

  async consumeEmail(operation: "request" | "verify", ipAddress: string, email: string): Promise<void> {
    if (!this.emailOtpAvailable()) throw new AuthenticationBrokerError("email-otp-unavailable");
    const ipLimiter = operation === "request" ? this.#emailRequestIpLimiter : this.#emailVerifyIpLimiter;
    const addressLimiter = operation === "request" ? this.#emailRequestAddressLimiter : this.#emailVerifyAddressLimiter;
    const addressKey = createHmac("sha256", this.#authentication.secret).update(normalizedEmail(email)).digest("hex");
    try { await Promise.all([consume(ipLimiter, normalizedIp(ipAddress)), consume(addressLimiter, addressKey)]); await this.#observe(`email-${operation}`, "allowed"); }
    catch (error) { await this.#observe(`email-${operation}`, error instanceof AuthenticationBrokerError && error.code === "authentication-rate-limited" ? "rate-limited" : "failed"); throw error; }
  }

  async beginGoogle(input: { readonly callbackURL: string; readonly errorCallbackURL: string; readonly headers: HeadersInit }): Promise<{ readonly url: string; readonly headers: Headers }> {
    if (!this.googleEnabled) throw new AuthenticationBrokerError("authentication-unavailable");
    try {
      const result = await this.#auth.api.signInSocial({
        body: { provider: "google", callbackURL: input.callbackURL, errorCallbackURL: input.errorCallbackURL },
        headers: input.headers,
        returnHeaders: true,
      });
      if (!result.response.url) throw new AuthenticationBrokerError("authentication-failed");
      return { url: result.response.url, headers: result.headers };
    } catch (error) {
      if (error instanceof AuthenticationBrokerError) throw error;
      throw new AuthenticationBrokerError("authentication-failed");
    }
  }

  async requestEmailCode(email: string): Promise<void> {
    if (!this.emailOtpAvailable()) throw new AuthenticationBrokerError("email-otp-unavailable");
    try {
      await this.#auth.api.sendVerificationOTP({ body: { email: normalizedEmail(email), type: "sign-in" } });
      await this.#observe("email-send", "succeeded");
    } catch {
      await this.#observe("email-send", "failed");
      throw new AuthenticationBrokerError("authentication-failed");
    }
  }

  async verifyEmailCode(email: string, otp: string): Promise<AuthenticationUser> {
    if (!this.emailOtpAvailable()) throw new AuthenticationBrokerError("email-otp-unavailable");
    try {
      const result = await this.#auth.api.signInEmailOTP({ body: { email: normalizedEmail(email), otp }, returnHeaders: true });
      await this.endSession(cookieHeaders(result.headers)).catch(() => new Headers());
      await this.#observe("email-code", "succeeded");
      return authenticationUser(result.response.user);
    } catch {
      await this.#observe("email-code", "failed");
      throw new AuthenticationBrokerError("authentication-failed");
    }
  }

  async sessionUser(headers: HeadersInit): Promise<AuthenticationUser | undefined> {
    try {
      const session = await this.#auth.api.getSession({ headers });
      return session?.user ? authenticationUser(session.user) : undefined;
    } catch {
      return undefined;
    }
  }

  async endSession(headers: HeadersInit): Promise<Headers> {
    try {
      const result = await this.#auth.api.signOut({ headers, returnHeaders: true });
      return result.headers;
    } catch {
      return new Headers();
    }
  }

  async close(): Promise<void> {
    this.#emailHealthy = false;
    this.#mailTransport?.close();
    await this.#database.end();
    await new Promise<void>((resolve) => this.#rateLimitDatabase.end(() => resolve()));
  }

  async #observe(operation: "google-start" | "email-request" | "email-verify" | "email-send" | "email-code", outcome: "allowed" | "rate-limited" | "succeeded" | "failed"): Promise<void> {
    await this.#database.execute("INSERT INTO auth_security_events(event_id,operation,outcome,metadata,occurred_at) VALUES (?,?,?,?,?)", [`auth-event:${randomUUID()}`, operation, outcome, JSON.stringify({ redacted: true }), new Date()]).catch(() => undefined);
  }
}

async function consume(limiter: RateLimiterMySQL, key: string): Promise<void> {
  try {
    await limiter.consume(key);
  } catch (error) {
    const rate = error as Partial<RateLimiterRes>;
    if (typeof rate.msBeforeNext === "number") throw new AuthenticationBrokerError("authentication-rate-limited", Math.max(rate.msBeforeNext, 1000));
    throw new AuthenticationBrokerError("authentication-unavailable");
  }
}

function authenticationUser(value: { readonly id: string; readonly email: string; readonly emailVerified: boolean; readonly name: string }): AuthenticationUser {
  return Object.freeze({ id: value.id, email: normalizedEmail(value.email), emailVerified: value.emailVerified, name: value.name.trim().slice(0, 120) || "Agent Fabric user" });
}

function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }
function normalizedIp(value: string): string { return value.trim().slice(0, 191) || "unknown"; }

function requiredDatabaseName(databaseUrl: string): string {
  const name = new URL(databaseUrl).pathname.replace(/^\//u, "");
  if (!name || !/^[a-zA-Z0-9_]+$/u.test(name)) throw new AuthenticationBrokerError("authentication-unavailable");
  return name;
}

function cookieHeaders(headers: Headers): Headers {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter((value): value is string => Boolean(value));
  const cookies = values.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  return new Headers(cookies ? { cookie: cookies } : {});
}
