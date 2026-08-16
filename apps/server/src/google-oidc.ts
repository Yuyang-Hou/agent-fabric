import { createHash, createPublicKey, verify } from "node:crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";

import type { GoogleOidcConfig } from "./server-config.js";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";

export interface OidcIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly displayName: string;
  readonly email: string;
}

export interface OidcProvider {
  authorizationUrl(input: { readonly state: string; readonly nonce: string; readonly codeChallenge: string }): string;
  exchangeCode(code: string, expectedNonceDigest: string, codeVerifier: string): Promise<OidcIdentity>;
}

export class GoogleOidcProvider implements OidcProvider {
  readonly #keys = new Map<string, { readonly key: CryptoKeyLike; readonly expiresAt: number }>();

  constructor(readonly config: GoogleOidcConfig, readonly fetchImpl: typeof fetch = outboundFetch()) {}

  authorizationUrl(input: { readonly state: string; readonly nonce: string; readonly codeChallenge: string }): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: "code",
      scope: "openid email profile", state: input.state, nonce: input.nonce,
      code_challenge: input.codeChallenge, code_challenge_method: "S256", prompt: "select_account",
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string, expectedNonceDigest: string, codeVerifier: string): Promise<OidcIdentity> {
    const response = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ code, code_verifier: codeVerifier, client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri, grant_type: "authorization_code" }),
    });
    if (!response.ok) throw new OidcError("oidc-code-exchange-failed");
    const body = await response.json() as { id_token?: unknown };
    if (typeof body.id_token !== "string") throw new OidcError("oidc-id-token-missing");
    return this.#verifyIdToken(body.id_token, expectedNonceDigest);
  }

  async #verifyIdToken(token: string, expectedNonceDigest: string): Promise<OidcIdentity> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new OidcError("oidc-id-token-invalid");
    const header = jsonPart(parts[0] as string) as { alg?: unknown; kid?: unknown };
    const claims = jsonPart(parts[1] as string) as Record<string, unknown>;
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new OidcError("oidc-id-token-algorithm-invalid");
    const key = await this.#key(header.kid);
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2] as string, "base64url");
    if (!verify("RSA-SHA256", signed, key as never, signature)) throw new OidcError("oidc-id-token-signature-invalid");
    const issuer = stringClaim(claims, "iss");
    const subject = stringClaim(claims, "sub");
    const audience = claims.aud;
    const expiration = numberClaim(claims, "exp");
    const nonce = stringClaim(claims, "nonce");
    if (!GOOGLE_ISSUERS.has(issuer)) throw new OidcError("oidc-id-token-issuer-invalid");
    if (!(audience === this.config.clientId || Array.isArray(audience) && audience.includes(this.config.clientId))) throw new OidcError("oidc-id-token-audience-invalid");
    if (expiration * 1000 <= Date.now()) throw new OidcError("oidc-id-token-expired");
    if (digestHex(nonce) !== expectedNonceDigest) throw new OidcError("oidc-id-token-nonce-invalid");
    if (claims.email_verified !== true) throw new OidcError("oidc-email-unverified");
    const email = stringClaim(claims, "email").trim().toLowerCase();
    const displayName = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : "Google user";
    return { issuer, subject, displayName, email };
  }

  async #key(kid: string): Promise<CryptoKeyLike> {
    const cached = this.#keys.get(kid);
    if (cached && cached.expiresAt > Date.now()) return cached.key;
    const response = await this.fetchImpl(JWKS_ENDPOINT, { headers: { accept: "application/json" } });
    if (!response.ok) throw new OidcError("oidc-jwks-unavailable");
    const body = await response.json() as { keys?: unknown };
    if (!Array.isArray(body.keys)) throw new OidcError("oidc-jwks-invalid");
    const ttl = cacheSeconds(response.headers.get("cache-control"));
    for (const candidate of body.keys) {
      if (!candidate || typeof candidate !== "object" || typeof (candidate as Record<string, unknown>).kid !== "string") continue;
      try { this.#keys.set(String((candidate as Record<string, unknown>).kid), { key: createPublicKey({ key: candidate as never, format: "jwk" }), expiresAt: Date.now() + ttl * 1000 }); }
      catch { continue; }
    }
    const resolved = this.#keys.get(kid);
    if (!resolved) throw new OidcError("oidc-signing-key-not-found");
    return resolved.key;
  }
}

function outboundFetch(): typeof fetch {
  const proxy = process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim() || process.env.HTTP_PROXY?.trim() || process.env.http_proxy?.trim();
  if (!proxy) return fetch;
  const dispatcher = new ProxyAgent(proxy);
  return ((input, init) => undiciFetch(input as Parameters<typeof undiciFetch>[0], Object.assign({}, init, { dispatcher }) as Parameters<typeof undiciFetch>[1]) as unknown as ReturnType<typeof fetch>) as typeof fetch;
}

type CryptoKeyLike = ReturnType<typeof createPublicKey>;

export class OidcError extends Error {
  constructor(readonly code: string) { super(code); this.name = "OidcError"; }
}

export function digestHex(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function digestBase64Url(value: string): string { return createHash("sha256").update(value).digest("base64url"); }

function jsonPart(value: string): unknown {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new OidcError("oidc-id-token-invalid"); }
}
function stringClaim(claims: Record<string, unknown>, name: string): string {
  const value = claims[name]; if (typeof value !== "string" || !value) throw new OidcError(`oidc-claim-invalid:${name}`); return value;
}
function numberClaim(claims: Record<string, unknown>, name: string): number {
  const value = claims[name]; if (typeof value !== "number" || !Number.isFinite(value)) throw new OidcError(`oidc-claim-invalid:${name}`); return value;
}
function cacheSeconds(value: string | null): number {
  const match = /(?:^|,)\s*max-age=(\d+)/u.exec(value ?? ""); return Math.min(Math.max(Number(match?.[1] ?? 300), 60), 3600);
}
