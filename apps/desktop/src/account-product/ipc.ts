import {
  agentBatchLifecycleRequestSchema,
  agentActivitySchema,
  agentCatalogPageSchema,
  agentCatalogQuerySchema,
  agentConfigurationSchema,
  agentCreationValidationResultSchema,
  agentEditableConfigurationSchema,
  agentDetailProjectionSchema,
  agentPrivateConfigurationUpdateSchema,
  agentSkillCatalogSchema,
  agentSkillMutationSchema,
  agentTemplateSchema,
  confirmRuntimeDeletionRequestSchema,
  completeLegacyAgentMigrationRecoverySchema,
  createFriendInvitationRequestSchema,
  friendInvitationViewSchema,
  friendSummarySchema,
  legacyAgentMigrationRecoverySchema,
  runtimeDeletionImpactSchema,
  runtimeVisibilitySchema,
  runtimeSchema,
} from "@agent-fabric/account-agent-domain";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(191);
const localServiceStateSchema = z.strictObject({
  state: z.enum(["inactive", "ready", "failed"]),
  runtimeId: identifier.optional(),
  errorCode: identifier.optional(),
});
const safeSignedInSessionSchema = z.strictObject({
  state: z.literal("signed-in"),
  accountId: identifier,
  accountName: z.string().trim().min(1).max(120),
  userId: identifier,
  displayName: z.string().trim().min(1).max(120),
  email: z.email(),
  expiresAt: z.iso.datetime({ offset: true }),
});

const routeSchema = z.discriminatedUnion("name", [
  z.strictObject({ name: z.literal("agents") }),
  z.strictObject({ name: z.literal("agent-create-choice") }),
  z.strictObject({ name: z.literal("agent-create-manual") }),
  z.strictObject({ name: z.literal("agent-create-ai") }),
  z.strictObject({ name: z.literal("agent-detail"), agentId: identifier, section: z.enum(["overview", "activity", "capabilities", "settings"]) }),
  z.strictObject({ name: z.literal("runtimes") }),
  z.strictObject({ name: z.literal("runtime-detail"), runtimeId: identifier }),
  z.strictObject({ name: z.literal("friends") }),
]);

const agentUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000),
  avatarUrl: z.url().optional(),
  runtimeId: identifier.optional(),
  permissionMode: z.enum(["private", "friends"]),
  configuration: agentEditableConfigurationSchema,
});

const creationUpdateSchema = z.strictObject({
  name: z.string().trim().max(120),
  description: z.string().trim().max(1_000),
  avatarUrl: z.url().optional(),
  runtimeId: identifier.optional(),
  permissionMode: z.enum(["private", "friends"]),
  configuration: agentConfigurationSchema,
});

const builderMessageSchema = z.strictObject({
  messageId: identifier,
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(20_000),
});

export const agentCreationSessionSchema = creationUpdateSchema.extend({
  mode: z.enum(["blank", "template", "ai"]),
  templateId: identifier.optional(),
  builder: z.strictObject({
    state: z.enum(["idle", "in_flight", "failed"]),
    conversation: z.array(builderMessageSchema).max(200),
    recoverableErrorCode: identifier.optional(),
  }).optional(),
});

export const accountProductRendererSnapshotSchema = z.strictObject({
  session: z.union([
    z.strictObject({ state: z.literal("signed-out"), reason: z.enum(["initial", "logged_out", "expired", "revoked"]).optional() }),
    z.strictObject({ state: z.literal("signing-in") }),
    safeSignedInSessionSchema,
  ]),
  route: routeSchema,
  connection: z.enum(["online", "reconnecting", "offline"]),
  localServices: z.strictObject({ runtime: localServiceStateSchema, mcp: localServiceStateSchema }),
  catalog: agentCatalogPageSchema.optional(),
  detail: agentDetailProjectionSchema.optional(),
  activities: z.array(agentActivitySchema).max(500),
  skills: agentSkillCatalogSchema.optional(),
  agentLoad: z.strictObject({
    agentId: identifier,
    detail: z.enum(["loading", "ready", "failed"]),
    activities: z.enum(["loading", "ready", "failed"]),
    skills: z.enum(["loading", "ready", "failed"]),
  }).optional(),
  templates: z.array(agentTemplateSchema).max(100),
  creationSession: agentCreationSessionSchema.optional(),
  creationValidation: agentCreationValidationResultSchema.optional(),
  runtimes: z.array(runtimeSchema).max(500),
  runtimeDetail: runtimeSchema.optional(),
  runtimeDeletionImpact: runtimeDeletionImpactSchema.optional(),
  friends: z.array(friendSummarySchema).max(10_000),
  incomingFriendInvitations: z.array(friendInvitationViewSchema).max(10_000),
  outgoingFriendInvitations: z.array(friendInvitationViewSchema).max(10_000),
  legacyRecovery: legacyAgentMigrationRecoverySchema,
  loading: z.boolean(),
  refreshing: z.boolean(),
  errorCode: identifier.optional(),
});

export const accountProductRendererCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("login-google") }),
  z.strictObject({ type: z.literal("login-email-request"), email: z.email().max(320) }),
  z.strictObject({ type: z.literal("login-email-verify"), email: z.email().max(320), otp: z.string().regex(/^\d{6}$/u) }),
  z.strictObject({ type: z.literal("catalog-query"), query: agentCatalogQuerySchema }),
  z.strictObject({ type: z.literal("agent-open"), agentId: identifier, section: z.enum(["overview", "activity", "capabilities", "settings"]) }),
  z.strictObject({ type: z.literal("agent-update"), agentId: identifier, expectedVersion: z.number().int().positive(), update: agentUpdateSchema }),
  z.strictObject({ type: z.literal("agent-archive"), agentId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("agent-restore"), agentId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("agent-batch-lifecycle"), request: agentBatchLifecycleRequestSchema }),
  z.strictObject({ type: z.literal("agent-skill-mutate"), agentId: identifier, skillId: identifier, mutation: agentSkillMutationSchema }),
  z.strictObject({ type: z.literal("agent-private-configuration-update"), agentId: identifier, update: agentPrivateConfigurationUpdateSchema }),
  z.strictObject({ type: z.literal("creation-start"), mode: z.enum(["blank", "template", "ai"]), templateId: identifier.optional() }),
  z.strictObject({ type: z.literal("creation-update"), update: creationUpdateSchema }),
  z.strictObject({ type: z.literal("builder-turn"), text: z.string().trim().min(1).max(16_000) }),
  z.strictObject({ type: z.literal("creation-submit") }),
  z.strictObject({ type: z.literal("runtime-open"), runtimeId: identifier }),
  z.strictObject({ type: z.literal("runtime-update"), runtimeId: identifier, name: z.string().trim().min(1).max(120), visibility: runtimeVisibilitySchema, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("runtime-refresh"), runtimeId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("runtime-delete-plan"), runtimeId: identifier }),
  z.strictObject({ type: z.literal("runtime-delete-confirm"), runtimeId: identifier, confirmation: confirmRuntimeDeletionRequestSchema }),
  z.strictObject({ type: z.literal("friend-invite"), invitation: createFriendInvitationRequestSchema }),
  z.strictObject({ type: z.literal("friend-invitation-accept"), invitationId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("friend-invitation-reject"), invitationId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("friend-invitation-revoke"), invitationId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("friend-remove"), friendshipId: identifier, expectedVersion: z.number().int().positive() }),
  z.strictObject({ type: z.literal("legacy-recovery-complete") }).extend(completeLegacyAgentMigrationRecoverySchema.shape),
  z.strictObject({ type: z.literal("navigate"), route: routeSchema }),
  z.strictObject({ type: z.literal("logout") }),
]);

export const ACCOUNT_PRODUCT_SNAPSHOT_CHANNEL = "account-product:snapshot";
export const ACCOUNT_PRODUCT_COMMAND_CHANNEL = "account-product:command";
export const ACCOUNT_PRODUCT_CHANGED_CHANNEL = "account-product:changed";

export const accountProductRendererCommandResultSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("snapshot"), snapshot: accountProductRendererSnapshotSchema }),
  z.strictObject({ type: z.literal("email-code-requested"), expiresAt: z.iso.datetime({ offset: true }), resendAfterSeconds: z.number().int().min(1).max(3600), snapshot: accountProductRendererSnapshotSchema }),
  z.strictObject({ type: z.literal("friend-invitation-created"), invitation: friendInvitationViewSchema, snapshot: accountProductRendererSnapshotSchema }),
]);

export type AccountProductRendererSnapshot = z.infer<typeof accountProductRendererSnapshotSchema>;
export type AccountProductRendererCommand = z.infer<typeof accountProductRendererCommandSchema>;
export type AccountProductRendererCommandResult = z.infer<typeof accountProductRendererCommandResultSchema>;
export type AgentCreationSession = z.infer<typeof agentCreationSessionSchema>;

export interface ElectronAccountProductApi {
  snapshot(): Promise<AccountProductRendererSnapshot>;
  command(command: AccountProductRendererCommand): Promise<AccountProductRendererCommandResult>;
  subscribe(listener: (snapshot: AccountProductRendererSnapshot) => void): () => void;
}
