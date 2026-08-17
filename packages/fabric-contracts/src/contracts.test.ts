import { describe, expect, it } from "vitest";

import {
  assertCompatible,
  componentVersionSchema,
  joinExchangeRequestSchema,
  joinStartRequestSchema,
  deviceLoginExchangeResponseSchema,
  deviceLoginStartRequestSchema,
  emailLoginCodeRequestSchema,
} from "./index.js";

const component = componentVersionSchema.parse({
  product: "agent-fabric",
  component: "server",
  version: "0.1.0",
  protocolMajor: 1,
  a2aVersion: "1.0.1",
  runtimeAdapterVersion: "1",
  features: ["account-agents", "a2a-rest"],
});

describe("Account Agents shared contracts", () => {
  it("keeps member invitation authority server-side", () => {
    expect(() => joinStartRequestSchema.parse({
      invitationToken: "secret",
      codeChallenge: "a".repeat(43),
      returnUri: "http://127.0.0.1:4567/callback",
      clientState: "b".repeat(32),
      deviceName: "Member Mac",
      accountId: "account:injected",
    })).toThrow();
    expect(joinExchangeRequestSchema.parse({ exchangeCode: "code", codeVerifier: "v".repeat(43) })).not.toHaveProperty("role");
  });

  it("keeps self-service Account login bounded", () => {
    expect(deviceLoginStartRequestSchema.parse({
      codeChallenge: "a".repeat(43),
      returnUri: "http://127.0.0.1:4567/callback",
      clientState: "b".repeat(32),
      deviceName: "Owner Mac",
    })).not.toHaveProperty("scopes");
    expect(deviceLoginExchangeResponseSchema.parse({
      server: "https://fabric.example",
      token: "owner-secret",
      humanPrincipalId: "human:alice",
      principalId: "device:owner",
      accountId: "account:alice",
      displayName: "Alice",
      expiresAt: "2026-09-11T00:00:00.000Z",
    })).not.toHaveProperty("serverAdmin");
    expect(emailLoginCodeRequestSchema.parse({ email: "alice@example.com", codeChallenge: "a".repeat(43), returnUri: "http://127.0.0.1:4567/callback", clientState: "b".repeat(32), deviceName: "Owner Mac" })).toMatchObject({ email: "alice@example.com" });
  });

  it("fails closed on protocol mismatch", () => {
    expect(() => assertCompatible(component, { ...component, a2aVersion: "2.0.0" } as never)).toThrow("component-incompatible");
  });
});
