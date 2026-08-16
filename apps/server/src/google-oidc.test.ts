import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { digestHex, GoogleOidcProvider } from "./google-oidc.js";

describe("Google OIDC provider", () => {
  it("verifies signed claims and rejects a nonce mismatch", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = publicKey.export({ format: "jwk" });
    const nonce = "nonce-secret";
    const token = jwt(privateKey, { iss: "https://accounts.google.com", sub: "subject", aud: "client", exp: Math.floor(Date.now() / 1000) + 60, nonce, email_verified: true, email: "alice@example.com", name: "Alice" });
    const tokenBodies: string[] = [];
    const fakeFetch: typeof fetch = async (input, init) => String(input).includes("token")
      ? (tokenBodies.push(String(init?.body)), new Response(JSON.stringify({ id_token: token }), { status: 200, headers: { "content-type": "application/json" } }))
      : new Response(JSON.stringify({ keys: [{ ...key, kid: "key-1", alg: "RS256", use: "sig" }] }), { status: 200, headers: { "content-type": "application/json" } });
    const provider = new GoogleOidcProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://fabric.example/v1/auth/google/callback", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 }, fakeFetch);
    const authorizationUrl = new URL(provider.authorizationUrl({ state: "state", nonce, codeChallenge: "challenge" }));
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe("challenge");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("prompt")).toBe("select_account");
    await expect(provider.exchangeCode("code", digestHex(nonce), "google-pkce-verifier")).resolves.toEqual({ issuer: "https://accounts.google.com", subject: "subject", displayName: "Alice", email: "alice@example.com" });
    expect(new URLSearchParams(tokenBodies[0]).get("code_verifier")).toBe("google-pkce-verifier");
    await expect(provider.exchangeCode("code", digestHex("wrong"), "google-pkce-verifier")).rejects.toThrow("oidc-id-token-nonce-invalid");
  });

  it("keeps injected transports isolated from process proxy configuration", async () => {
    const fakeFetch: typeof fetch = async () => new Response("{}", { status: 400 });
    const provider = new GoogleOidcProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://fabric.example/v1/auth/google/callback", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 }, fakeFetch);
    await expect(provider.exchangeCode("code", digestHex("nonce"), "google-pkce-verifier")).rejects.toThrow("oidc-code-exchange-failed");
  });

  it.each([
    ["issuer", { iss: "https://evil.example", aud: "client", exp: Math.floor(Date.now() / 1000) + 60 }, "oidc-id-token-issuer-invalid"],
    ["audience", { iss: "https://accounts.google.com", aud: "other-client", exp: Math.floor(Date.now() / 1000) + 60 }, "oidc-id-token-audience-invalid"],
    ["expiry", { iss: "https://accounts.google.com", aud: "client", exp: Math.floor(Date.now() / 1000) - 1 }, "oidc-id-token-expired"],
  ])("rejects an invalid %s claim", async (_name, overrides, expectedCode) => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const key = publicKey.export({ format: "jwk" });
    const nonce = "nonce-secret";
    const token = jwt(privateKey, Object.assign({
      iss: "https://accounts.google.com", sub: "subject", aud: "client", exp: Math.floor(Date.now() / 1000) + 60,
      nonce, email_verified: true, email: "alice@example.com", name: "Alice",
    }, overrides));
    const fakeFetch: typeof fetch = async (input) => String(input).includes("token")
      ? new Response(JSON.stringify({ id_token: token }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ keys: [{ ...key, kid: "key-1", alg: "RS256", use: "sig" }] }), { status: 200, headers: { "content-type": "application/json" } });
    const provider = new GoogleOidcProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://fabric.example/v1/auth/google/callback", selfServiceAllowedDomains: [], selfServiceLoginLimit: 20 }, fakeFetch);
    await expect(provider.exchangeCode("code", digestHex(nonce), "google-pkce-verifier")).rejects.toThrow(expectedCode);
  });
});

function jwt(privateKey: Parameters<typeof sign>[2], claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "key-1", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")}`;
}
