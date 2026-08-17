import { z } from "zod";

const identifier = z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u);
const isoDate = z.iso.datetime({ offset: true });
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const componentVersionSchema = z.strictObject({
  product: z.literal("agent-fabric"),
  component: z.enum(["cli", "edge", "server", "mcp"]),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u),
  protocolMajor: z.literal(1),
  a2aVersion: z.literal("1.0.1"),
  runtimeAdapterVersion: z.literal("1"),
  features: z.array(identifier).max(100),
});

export const credentialScopeSchema = z.enum(["account:access", "account:self-test"]);
export const principalKindSchema = z.enum(["human", "device", "agent", "service"]);

export const joinStartRequestSchema = z.strictObject({
  invitationToken: boundedText(512),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u),
  returnUri: z.url(),
  clientState: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/u),
  deviceName: boundedText(120),
});

export const joinStartResponseSchema = z.strictObject({
  authorizationUrl: z.url(),
  expiresAt: isoDate,
});

export const joinExchangeRequestSchema = z.strictObject({
  exchangeCode: boundedText(512),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/u),
});

export const deviceLoginStartRequestSchema = joinStartRequestSchema.omit({ invitationToken: true });
export const deviceLoginExchangeRequestSchema = joinExchangeRequestSchema;
export const deviceLoginExchangeResponseSchema = z.strictObject({
  server: z.url(),
  token: boundedText(512),
  humanPrincipalId: identifier,
  principalId: identifier,
  accountId: identifier,
  displayName: boundedText(120),
  expiresAt: isoDate,
});

export const emailLoginCodeRequestSchema = deviceLoginStartRequestSchema.extend({
  email: z.email().max(320),
  attemptId: identifier.optional(),
});
export const emailLoginCodeResponseSchema = z.strictObject({ attemptId: identifier, expiresAt: isoDate, resendAfterSeconds: z.number().int().min(1).max(3600) });
export const emailLoginVerifyRequestSchema = z.strictObject({ attemptId: identifier, email: z.email().max(320), otp: z.string().regex(/^\d{6}$/u) });
export const emailLoginVerifyResponseSchema = z.strictObject({ exchangeCode: boundedText(512) });

export type ComponentVersion = z.infer<typeof componentVersionSchema>;
export type CredentialScope = z.infer<typeof credentialScopeSchema>;
export type PrincipalKind = z.infer<typeof principalKindSchema>;
export type JoinStartRequest = z.infer<typeof joinStartRequestSchema>;
export type JoinStartResponse = z.infer<typeof joinStartResponseSchema>;
export type JoinExchangeRequest = z.infer<typeof joinExchangeRequestSchema>;
export type DeviceLoginStartRequest = z.infer<typeof deviceLoginStartRequestSchema>;
export type DeviceLoginExchangeRequest = z.infer<typeof deviceLoginExchangeRequestSchema>;
export type DeviceLoginExchangeResponse = z.infer<typeof deviceLoginExchangeResponseSchema>;
export type EmailLoginCodeRequest = z.infer<typeof emailLoginCodeRequestSchema>;
export type EmailLoginCodeResponse = z.infer<typeof emailLoginCodeResponseSchema>;
export type EmailLoginVerifyRequest = z.infer<typeof emailLoginVerifyRequestSchema>;
export type EmailLoginVerifyResponse = z.infer<typeof emailLoginVerifyResponseSchema>;

export function assertCompatible(local: ComponentVersion, remote: ComponentVersion): void {
  if (local.protocolMajor !== remote.protocolMajor || local.a2aVersion !== remote.a2aVersion) {
    throw new FabricCompatibilityError(local, remote);
  }
}

export class FabricCompatibilityError extends Error {
  readonly code = "component-incompatible";

  constructor(
    readonly local: ComponentVersion,
    readonly remote: ComponentVersion,
  ) {
    super(`component-incompatible:${local.component}@${local.version}:${remote.component}@${remote.version}`);
    this.name = "FabricCompatibilityError";
  }
}
