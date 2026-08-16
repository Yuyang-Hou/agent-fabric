import { z } from "zod";
import { canBindRuntime, type AgentAccessPrincipal } from "./authorization.js";

const identifierSchema = z.string().trim().min(1).max(191).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const isoTimestampSchema = z.iso.datetime({ offset: true });
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalBoundedText = (maximum: number) => z.string().trim().max(maximum);
const versionSchema = z.number().int().positive();

export const accountSchema = z.strictObject({
  accountId: identifierSchema,
  name: boundedText(120),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  version: versionSchema,
});

export const humanProfileSchema = z.strictObject({
  userId: identifierSchema,
  displayName: boundedText(120),
  email: z.string().trim().toLowerCase().email().max(320),
});

export const friendInvitationStatusSchema = z.enum(["pending", "accepted", "rejected", "revoked", "expired"]);

export const friendInvitationSchema = z.strictObject({
  invitationId: identifierSchema,
  inviterUserId: identifierSchema,
  recipientEmail: z.string().trim().toLowerCase().email().max(320),
  recipientUserId: identifierSchema.optional(),
  status: friendInvitationStatusSchema,
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  acceptedAt: isoTimestampSchema.optional(),
  rejectedAt: isoTimestampSchema.optional(),
  revokedAt: isoTimestampSchema.optional(),
  version: versionSchema,
}).superRefine((invitation, context) => {
  const terminalTimes = [invitation.acceptedAt, invitation.rejectedAt, invitation.revokedAt].filter(Boolean);
  if (terminalTimes.length > 1) context.addIssue({ code: "custom", message: "friend-invitation-terminal-times-conflict" });
  if (invitation.status === "accepted" && !invitation.acceptedAt) context.addIssue({ code: "custom", message: "accepted-friend-invitation-requires-accepted-at" });
  if (invitation.status === "rejected" && !invitation.rejectedAt) context.addIssue({ code: "custom", message: "rejected-friend-invitation-requires-rejected-at" });
  if (invitation.status === "revoked" && !invitation.revokedAt) context.addIssue({ code: "custom", message: "revoked-friend-invitation-requires-revoked-at" });
  if ((invitation.status === "pending" || invitation.status === "expired") && terminalTimes.length !== 0) context.addIssue({ code: "custom", message: "non-terminal-friend-invitation-forbids-terminal-time" });
});

export const createFriendInvitationRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  expiresAt: isoTimestampSchema,
});

export const friendInvitationTransitionRequestSchema = z.strictObject({
  expectedVersion: versionSchema,
});

export const friendInvitationViewSchema = z.strictObject({
  direction: z.enum(["incoming", "outgoing"]),
  invitation: friendInvitationSchema,
  otherHuman: humanProfileSchema.optional(),
});

export const friendshipStatusSchema = z.enum(["active", "revoked"]);

export const friendshipSchema = z.strictObject({
  friendshipId: identifierSchema,
  humanAUserId: identifierSchema,
  humanBUserId: identifierSchema,
  status: friendshipStatusSchema,
  relationshipVersion: versionSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  revokedAt: isoTimestampSchema.optional(),
  version: versionSchema,
}).superRefine((friendship, context) => {
  if (friendship.humanAUserId >= friendship.humanBUserId) context.addIssue({ code: "custom", message: "friendship-human-pair-must-be-normalized" });
  if ((friendship.status === "revoked") !== Boolean(friendship.revokedAt)) context.addIssue({ code: "custom", message: "friendship-revocation-fields-must-pair" });
});

export const friendSummarySchema = z.strictObject({
  friendshipId: identifierSchema,
  friend: humanProfileSchema,
  since: isoTimestampSchema,
  relationshipVersion: versionSchema,
});

export const memberRoleSchema = z.enum(["owner", "admin", "member"]);

export const accountMemberSchema = z.strictObject({
  membershipId: identifierSchema,
  accountId: identifierSchema,
  userId: identifierSchema,
  displayName: boundedText(120),
  email: z.string().trim().toLowerCase().email().max(320),
  role: memberRoleSchema,
  joinedAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  version: versionSchema,
});

export const accountSessionSchema = z.strictObject({
  sessionId: identifierSchema,
  credentialId: identifierSchema,
  accountId: identifierSchema,
  userId: identifierSchema,
  displayName: boundedText(120),
  email: z.string().trim().toLowerCase().email().max(320),
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  lastSeenAt: isoTimestampSchema,
  revokedAt: isoTimestampSchema.optional(),
});

export const memberInvitationStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);

export const memberInvitationSchema = z.strictObject({
  invitationId: identifierSchema,
  accountId: identifierSchema,
  invitedEmail: z.string().trim().toLowerCase().email().max(320),
  role: memberRoleSchema,
  invitedByUserId: identifierSchema,
  status: memberInvitationStatusSchema,
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  acceptedAt: isoTimestampSchema.optional(),
  revokedAt: isoTimestampSchema.optional(),
  version: versionSchema,
}).superRefine((invitation, context) => {
  if (invitation.status === "accepted" && !invitation.acceptedAt) {
    context.addIssue({ code: "custom", message: "accepted-invitation-requires-accepted-at" });
  }
  if (invitation.status === "revoked" && !invitation.revokedAt) {
    context.addIssue({ code: "custom", message: "revoked-invitation-requires-revoked-at" });
  }
});

export const memberInvitationSecretSchema = z.strictObject({
  invitationId: identifierSchema,
  tokenDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

export const createMemberInvitationRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  role: z.enum(["admin", "member"]),
  expiresAt: isoTimestampSchema,
});

export const updateMemberRoleRequestSchema = z.strictObject({
  role: memberRoleSchema,
  expectedVersion: versionSchema,
});

export const memberRemovalImpactSchema = z.strictObject({
  planId: identifierSchema,
  accountId: identifierSchema,
  userId: identifierSchema,
  expectedMemberVersion: versionSchema,
  ownedAgents: z.array(z.strictObject({ agentId: identifierSchema, name: boundedText(120) })).max(500),
  ownedRuntimes: z.array(z.strictObject({ runtimeId: identifierSchema, name: boundedText(120), boundAgentIds: z.array(identifierSchema).max(500) })).max(100),
  invocationTargetAgentIds: z.array(identifierSchema).max(500),
  pendingInvitationIds: z.array(identifierSchema).max(500),
  draftCount: z.number().int().min(0),
  activeSessionCount: z.number().int().min(0),
  expiresAt: isoTimestampSchema,
});

const ownedAgentDispositionSchema = z.discriminatedUnion("action", [
  z.strictObject({ agentId: identifierSchema, action: z.literal("transfer"), transferToUserId: identifierSchema }),
  z.strictObject({ agentId: identifierSchema, action: z.literal("archive") }),
]);

const ownedRuntimeDispositionSchema = z.discriminatedUnion("action", [
  z.strictObject({ runtimeId: identifierSchema, action: z.literal("transfer"), transferToUserId: identifierSchema }),
  z.strictObject({ runtimeId: identifierSchema, action: z.literal("unbind") }),
]);

export const confirmMemberRemovalRequestSchema = z.strictObject({
  planId: identifierSchema,
  expectedMemberVersion: versionSchema,
  agentDispositions: z.array(ownedAgentDispositionSchema).max(500),
  runtimeDispositions: z.array(ownedRuntimeDispositionSchema).max(100),
});

export const runtimeDeletionImpactSchema = z.strictObject({
  planId: identifierSchema,
  accountId: identifierSchema,
  runtimeId: identifierSchema,
  expectedRuntimeVersion: versionSchema,
  boundAgentIds: z.array(identifierSchema).max(500),
  activeAgentIds: z.array(identifierSchema).max(500),
  expiresAt: isoTimestampSchema,
});

export const confirmRuntimeDeletionRequestSchema = z.strictObject({
  planId: identifierSchema,
  expectedRuntimeVersion: versionSchema,
});

export const runtimeHealthSchema = z.enum(["checking", "ready", "auth_required", "unavailable", "offline"]);
export const runtimeVisibilitySchema = z.literal("private");
export const thinkingLevelSchema = z.enum(["minimal", "low", "medium", "high", "xhigh"]);
export const serviceTierSchema = z.enum(["default", "flex", "priority"]);

export const runtimeCapabilitiesSchema = z.strictObject({
  supportsModelSelection: z.boolean(),
  supportsThinkingLevel: z.boolean(),
  supportsServiceTier: z.boolean(),
  supportsSkills: z.boolean(),
  supportsMcpConfiguration: z.boolean(),
  supportsEnvironment: z.boolean(),
  supportsCustomArguments: z.boolean(),
  supportsRuntimeConfiguration: z.boolean(),
  supportsCancellation: z.boolean(),
  maxConcurrentAgents: z.number().int().positive().max(1_000),
  modelCatalog: z.array(z.strictObject({
    model: boundedText(160),
    displayName: boundedText(160),
    thinkingLevels: z.array(thinkingLevelSchema).max(5),
    serviceTiers: z.array(serviceTierSchema).max(3),
  })).max(500).optional(),
  integrationProviders: z.array(identifierSchema).max(100).optional(),
});

export const runtimeSchema = z.strictObject({
  runtimeId: identifierSchema,
  accountId: identifierSchema,
  ownerUserId: identifierSchema,
  provider: identifierSchema,
  adapterId: identifierSchema,
  name: boundedText(120),
  visibility: runtimeVisibilitySchema,
  health: runtimeHealthSchema,
  capabilities: runtimeCapabilitiesSchema,
  lastCheckedAt: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  version: versionSchema,
});

export const invocationTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("account"), accountId: identifierSchema }),
  z.strictObject({ type: z.literal("member"), accountId: identifierSchema, userId: identifierSchema }),
]);

export const invocationTargetsSchema = z.array(invocationTargetSchema).max(500).superRefine((targets, context) => {
  const keys = new Set<string>();
  let accountTargets = 0;
  for (const [index, target] of targets.entries()) {
    const key = target.type === "account" ? `account:${target.accountId}` : `member:${target.accountId}:${target.userId}`;
    if (keys.has(key)) context.addIssue({ code: "custom", message: "invocation-target-duplicate", path: [index] });
    keys.add(key);
    if (target.type === "account") accountTargets += 1;
  }
  if (accountTargets > 1) context.addIssue({ code: "custom", message: "invocation-account-target-duplicate" });
});

export const skillOriginSchema = z.enum(["account", "runtime", "agent"]);

export const skillSchema = z.strictObject({
  skillId: identifierSchema,
  accountId: identifierSchema,
  name: boundedText(120),
  description: optionalBoundedText(1_000),
  origin: skillOriginSchema,
  runtimeId: identifierSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  version: versionSchema,
}).superRefine((skill, context) => {
  if (skill.origin === "runtime" && !skill.runtimeId) {
    context.addIssue({ code: "custom", message: "runtime-skill-requires-runtime-id" });
  }
  if (skill.origin !== "runtime" && skill.runtimeId) {
    context.addIssue({ code: "custom", message: "non-runtime-skill-forbids-runtime-id" });
  }
});

export const runtimeSkillSummarySchema = z.strictObject({
  runtimeSkillId: identifierSchema,
  name: boundedText(120),
  description: optionalBoundedText(1_000),
});

export const permissionModeSchema = z.enum(["private", "friends"]);

export const agentMcpSummarySchema = z.strictObject({
  connectionId: identifierSchema,
  name: boundedText(120),
  transport: z.enum(["stdio", "http", "sse"]),
  configured: z.boolean(),
});

export const agentIntegrationSummarySchema = z.strictObject({
  integrationId: identifierSchema,
  provider: identifierSchema,
  displayName: boundedText(120),
  state: z.enum(["configured", "action_required", "unavailable"]),
});

export const agentConfigurationSchema = z.strictObject({
  instructions: optionalBoundedText(100_000),
  model: optionalBoundedText(160).optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  serviceTier: serviceTierSchema.optional(),
  maxConcurrentTasks: z.number().int().positive().max(64),
  skillIds: z.array(identifierSchema).max(500),
  disabledRuntimeSkillIds: z.array(identifierSchema).max(500),
  environmentVariableNames: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/u)).max(500),
  customArguments: z.array(boundedText(500)).max(200),
  runtimeConfiguration: z.record(z.string().max(120), z.unknown()),
  mcpConnections: z.array(agentMcpSummarySchema).max(100),
  integrations: z.array(agentIntegrationSummarySchema).max(100),
});

// Ordinary product settings are intentionally separated from private runtime
// configuration. Nullable optional choices let a manager return to the
// Runtime default without ever round-tripping redacted secrets through a UI.
export const agentEditableConfigurationSchema = z.strictObject({
  instructions: optionalBoundedText(100_000),
  model: optionalBoundedText(160).nullable(),
  thinkingLevel: thinkingLevelSchema.nullable(),
  serviceTier: serviceTierSchema.nullable(),
  maxConcurrentTasks: z.number().int().positive().max(64),
});

export const agentSchema = z.strictObject({
  agentId: identifierSchema,
  accountId: identifierSchema,
  ownerUserId: identifierSchema,
  name: boundedText(120),
  description: optionalBoundedText(1_000),
  avatarUrl: z.url().optional(),
  runtimeId: identifierSchema.optional(),
  permissionMode: permissionModeSchema,
  configuration: agentConfigurationSchema,
  archivedAt: isoTimestampSchema.optional(),
  archivedByUserId: identifierSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  version: versionSchema,
}).superRefine((agent, context) => {
  if (Boolean(agent.archivedAt) !== Boolean(agent.archivedByUserId)) {
    context.addIssue({ code: "custom", message: "archive-fields-must-pair" });
  }
});

export const agentDetailProjectionSchema = z.strictObject({
  identity: z.strictObject({
    agentId: identifierSchema, accountId: identifierSchema, ownerUserId: identifierSchema, name: boundedText(120), description: optionalBoundedText(1_000),
    avatarUrl: z.url().optional(), runtimeId: identifierSchema.optional(), archivedAt: isoTimestampSchema.optional(), createdAt: isoTimestampSchema, updatedAt: isoTimestampSchema, version: versionSchema,
  }),
  access: z.strictObject({
    canManage: z.boolean(), canInvoke: z.boolean(), effectiveAccess: z.enum(["owner", "friend", "none"]), permissionMode: permissionModeSchema,
  }),
  configuration: z.strictObject({
    instructions: optionalBoundedText(100_000).optional(), model: optionalBoundedText(160).optional(), thinkingLevel: thinkingLevelSchema.optional(), serviceTier: serviceTierSchema.optional(),
    maxConcurrentTasks: z.number().int().positive().max(64), skillIds: z.array(identifierSchema).max(500).optional(), disabledRuntimeSkillIds: z.array(identifierSchema).max(500).optional(),
    environment: z.strictObject({ configuredCount: z.number().int().min(0), redacted: z.literal(true) }),
    customArguments: z.strictObject({ configuredCount: z.number().int().min(0), redacted: z.literal(true) }),
    runtimeConfiguration: z.strictObject({ configured: z.boolean(), redacted: z.literal(true) }),
    mcpConnections: z.array(agentMcpSummarySchema).max(100), integrations: z.array(agentIntegrationSummarySchema).max(100),
  }),
  runtime: runtimeSchema.optional(),
  sections: z.array(z.enum(["overview", "activity", "capabilities", "settings"])).min(2).max(4),
  etag: z.string().regex(/^"agent:[1-9][0-9]*"$/u),
});

export const agentSkillCatalogSchema = z.strictObject({
  agentId: identifierSchema,
  agentVersion: versionSchema,
  runtimeDiscovery: z.strictObject({ state: z.enum(["ready", "unsupported", "offline", "unbound"]), retryable: z.boolean() }),
  skills: z.array(z.strictObject({ skill: skillSchema, attached: z.boolean(), enabled: z.boolean(), available: z.boolean() })).max(500),
});

export const agentSkillMutationSchema = z.strictObject({
  action: z.enum(["attach", "detach", "enable", "disable"]),
  expectedVersion: versionSchema,
});

const secretMapSchema = z.record(identifierSchema, z.string().min(1).max(16_000));
export const agentPrivateConfigurationSchema = z.strictObject({
  environmentValues: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/u), z.string().max(64_000)),
  mcpCredentials: z.record(identifierSchema, secretMapSchema),
  integrationCredentials: z.record(identifierSchema, secretMapSchema),
}).superRefine((configuration, context) => {
  if (Object.keys(configuration.environmentValues).length > 500) context.addIssue({ code: "custom", message: "environment-values-limit" });
  if (Object.keys(configuration.mcpCredentials).length > 100) context.addIssue({ code: "custom", message: "mcp-credentials-limit" });
  if (Object.keys(configuration.integrationCredentials).length > 100) context.addIssue({ code: "custom", message: "integration-credentials-limit" });
});

export const agentPrivateConfigurationUpdateSchema = z.strictObject({
  expectedVersion: versionSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{16,191}$/u),
  configuration: agentPrivateConfigurationSchema,
});

export const agentPrivateConfigurationSummarySchema = z.strictObject({
  environmentVariableNames: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/u)).max(500),
  configuredMcpConnectionIds: z.array(identifierSchema).max(100),
  configuredIntegrationIds: z.array(identifierSchema).max(100),
  updatedAt: isoTimestampSchema,
});

export const agentPresenceSchema = z.strictObject({
  accountId: identifierSchema,
  agentId: identifierSchema,
  runtimeId: identifierSchema.optional(),
  availability: z.enum(["online", "unstable", "offline"]),
  connectionFresh: z.boolean(),
  runtimeHealthy: z.boolean(),
  bindingMatches: z.boolean(),
  observedAt: isoTimestampSchema,
});

export const agentWorkloadSchema = z.strictObject({
  accountId: identifierSchema,
  agentId: identifierSchema,
  queuedTasks: z.number().int().min(0),
  workingTasks: z.number().int().min(0),
  observedAt: isoTimestampSchema,
});

export const agentActivitySchema = z.strictObject({
  activityId: identifierSchema,
  accountId: identifierSchema,
  agentId: identifierSchema,
  taskId: identifierSchema,
  terminalState: z.enum(["completed", "failed", "canceled"]),
  failureCategory: identifierSchema.optional(),
  startedAt: isoTimestampSchema,
  completedAt: isoTimestampSchema,
  durationMs: z.number().int().min(0),
});

export const agentDraftSchema = z.strictObject({
  draftId: identifierSchema,
  accountId: identifierSchema,
  ownerUserId: identifierSchema,
  mode: z.enum(["blank", "template", "ai"]),
  templateId: identifierSchema.optional(),
  name: optionalBoundedText(120),
  description: optionalBoundedText(1_000),
  avatarUrl: z.url().optional(),
  runtimeId: identifierSchema.optional(),
  permissionMode: permissionModeSchema,
  configuration: agentConfigurationSchema,
  pendingUserText: optionalBoundedText(20_000),
  builderSession: z.strictObject({
    state: z.enum(["idle", "in_flight", "failed"]),
    inFlight: z.strictObject({ turnId: identifierSchema, baseDraftVersion: versionSchema, startedAt: isoTimestampSchema }).optional(),
    conversation: z.array(z.strictObject({
      messageId: identifierSchema,
      role: z.enum(["user", "assistant"]),
      text: boundedText(20_000),
      createdAt: isoTimestampSchema,
    })).max(200),
    lastAppliedProposal: z.strictObject({ proposalId: identifierSchema, draftVersion: versionSchema, appliedAt: isoTimestampSchema }).optional(),
    recoverableErrorCode: identifierSchema.optional(),
  }).optional(),
  state: z.enum(["active", "creating", "failed", "created"]),
  createdAgentId: identifierSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  version: versionSchema,
}).superRefine((draft, context) => {
  if (draft.mode === "template" && !draft.templateId) context.addIssue({ code: "custom", message: "template-draft-requires-template-id" });
  if (draft.mode === "ai" && !draft.builderSession) context.addIssue({ code: "custom", message: "ai-draft-requires-builder-session" });
  if (draft.mode !== "ai" && draft.builderSession) context.addIssue({ code: "custom", message: "non-ai-draft-forbids-builder-session" });
  if (draft.builderSession && (draft.builderSession.state === "in_flight") !== Boolean(draft.builderSession.inFlight)) context.addIssue({ code: "custom", message: "builder-in-flight-fields-must-pair" });
  if (draft.state === "created" && !draft.createdAgentId) context.addIssue({ code: "custom", message: "created-draft-requires-agent-id" });
});

export const agentDraftFieldErrorSchema = z.strictObject({
  field: z.enum(["name", "runtimeId", "model", "thinkingLevel", "serviceTier", "environment", "customArguments", "runtimeConfiguration", "access", "templateId", "draft"]),
  code: identifierSchema,
});

export const agentDraftValidationResultSchema = z.strictObject({
  valid: z.boolean(),
  fieldErrors: z.array(agentDraftFieldErrorSchema).max(50),
});

export const createAgentFromDraftCommandSchema = z.strictObject({
  draftId: identifierSchema,
  expectedVersion: versionSchema,
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{16,191}$/u),
});

export const agentTemplateSchema = z.strictObject({
  templateId: identifierSchema,
  name: boundedText(120),
  description: optionalBoundedText(1_000),
  instructions: optionalBoundedText(100_000),
  skillReferences: z.array(z.strictObject({ key: identifierSchema, name: boundedText(120), description: optionalBoundedText(1_000) })).max(20),
});

export const agentBuilderProposalSchema = z.strictObject({
  name: optionalBoundedText(120),
  description: optionalBoundedText(1_000),
  instructions: optionalBoundedText(100_000),
  model: optionalBoundedText(160).optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  serviceTier: serviceTierSchema.optional(),
});

export const agentCatalogIdentitySchema = z.strictObject({
  agentId: identifierSchema,
  accountId: identifierSchema,
  ownerUserId: identifierSchema,
  name: boundedText(120),
  description: optionalBoundedText(1_000),
  avatarUrl: z.url().optional(),
  runtimeId: identifierSchema.optional(),
  permissionMode: permissionModeSchema,
  model: optionalBoundedText(160).optional(),
  archivedAt: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  version: versionSchema,
});

export const agentCatalogRowSchema = z.strictObject({
  agent: agentCatalogIdentitySchema,
  owner: humanProfileSchema,
  effectiveAccess: z.literal("owner"),
  status: z.enum(["archived", "needs_runtime", "online", "unstable", "offline"]),
  runtime: runtimeSchema.optional(),
  presence: agentPresenceSchema.optional(),
  workload: agentWorkloadSchema.optional(),
  runCount30d: z.number().int().min(0).optional(),
  lastActiveAt: isoTimestampSchema.optional(),
});

export const friendAgentSummarySchema = z.strictObject({
  kind: z.literal("friend"),
  agentId: identifierSchema,
  name: boundedText(120),
  description: optionalBoundedText(1_000),
  avatarUrl: z.url().optional(),
  owner: humanProfileSchema.pick({ userId: true, displayName: true }),
  capabilitySummary: z.array(boundedText(120)).max(20),
  availability: z.enum(["online", "unstable", "offline"]),
  effectiveAccess: z.literal("friend"),
  updatedAt: isoTimestampSchema,
});

export const agentCatalogQuerySchema = z.strictObject({
  scope: z.enum(["mine", "friends", "archived"]),
  search: z.string().trim().max(200).optional(),
  availability: z.array(z.enum(["needs_runtime", "online", "unstable", "offline"])).max(4),
  runtimeIds: z.array(identifierSchema).max(100),
  ownerUserIds: z.array(identifierSchema).max(100),
  models: z.array(boundedText(160)).max(100),
  access: z.array(z.enum(["owner", "friend", "none"])).max(3),
  sort: z.enum(["last_active", "name", "runs", "created"]),
  limit: z.number().int().min(1).max(100),
  after: z.strictObject({ sortValue: z.string().max(512), id: identifierSchema }).optional(),
});

export const agentCatalogPageSchema = z.strictObject({
  accountId: identifierSchema,
  scope: z.enum(["mine", "friends", "archived"]),
  rows: z.array(z.union([agentCatalogRowSchema, friendAgentSummarySchema])).max(500),
  counts: z.strictObject({ mine: z.number().int().min(0), friends: z.number().int().min(0), archived: z.number().int().min(0) }),
  nextCursor: boundedText(512).optional(),
}).superRefine((page, context) => {
  const ids = new Set<string>();
  for (const [index, row] of page.rows.entries()) {
    if ("kind" in row) continue;
    const scopedValues = [row.agent.accountId, row.runtime?.accountId, row.presence?.accountId, row.workload?.accountId].filter(Boolean);
    if (scopedValues.some((accountId) => accountId !== page.accountId)) {
      context.addIssue({ code: "custom", message: "catalog-row-cross-account", path: ["rows", index] });
    }
    if (row.owner.userId !== row.agent.ownerUserId) context.addIssue({ code: "custom", message: "catalog-owner-mismatch", path: ["rows", index, "owner"] });
    if (row.runtime && row.runtime.runtimeId !== row.agent.runtimeId) context.addIssue({ code: "custom", message: "catalog-runtime-mismatch", path: ["rows", index, "runtime"] });
    if (ids.has(row.agent.agentId)) context.addIssue({ code: "custom", message: "catalog-agent-duplicate", path: ["rows", index] });
    ids.add(row.agent.agentId);
  }
});

export const agentBatchLifecycleRequestSchema = z.strictObject({
  action: z.enum(["archive", "restore"]),
  items: z.array(z.strictObject({ agentId: identifierSchema, expectedVersion: versionSchema })).min(1).max(100),
}).superRefine((request, context) => {
  const ids = new Set<string>();
  for (const [index, item] of request.items.entries()) {
    if (ids.has(item.agentId)) context.addIssue({ code: "custom", message: "batch-agent-duplicate", path: ["items", index, "agentId"] });
    ids.add(item.agentId);
  }
});

export const agentBatchLifecycleResultSchema = z.strictObject({
  accountId: identifierSchema,
  action: z.enum(["archive", "restore"]),
  semantics: z.literal("atomic"),
  results: z.array(z.strictObject({ agent: agentSchema, needsRuntime: z.boolean().optional() })).min(1).max(100),
  appliedAt: isoTimestampSchema,
});

export const accountResourceInvalidationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("account-resource-invalidated"),
    accountId: identifierSchema,
    resourceType: z.enum(["agent", "runtime"]),
    resourceId: identifierSchema,
    aspects: z.array(z.enum(["agent", "runtime", "presence", "workload", "access", "activity"])).min(1).max(6),
    observedAt: isoTimestampSchema,
  }),
  z.strictObject({
    type: z.literal("human-resource-invalidated"),
    userId: identifierSchema,
    resourceType: z.enum(["friend-invitation", "friendship", "friend-agent"]),
    resourceId: identifierSchema,
    aspects: z.array(z.enum(["invitations", "friends", "access", "presence"])).min(1).max(4),
    observedAt: isoTimestampSchema,
  }),
]);

const accountRuntimeTaskAgentSchema = z.strictObject({
  agentId: identifierSchema,
  instructions: optionalBoundedText(100_000),
  model: optionalBoundedText(160).optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  serviceTier: serviceTierSchema.optional(),
});

export const accountRuntimeServerEnvelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    version: z.literal("1"), type: z.literal("task-request"), deliveryId: identifierSchema,
    taskId: identifierSchema, contextId: identifierSchema, requesterUserId: identifierSchema,
    agent: accountRuntimeTaskAgentSchema,
    a2aMessage: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ version: z.literal("1"), type: z.literal("task-cancel"), deliveryId: identifierSchema, taskId: identifierSchema }),
  z.strictObject({ version: z.literal("1"), type: z.literal("private-configuration-update"), deliveryId: identifierSchema, agentId: identifierSchema, idempotencyKey: identifierSchema, configuration: agentPrivateConfigurationSchema }),
]);

export const accountRuntimeClientEnvelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ version: z.literal("1"), type: z.literal("heartbeat"), runtimeId: identifierSchema, health: runtimeHealthSchema, capabilities: runtimeCapabilitiesSchema, runtimeSkills: z.array(runtimeSkillSummarySchema).max(500), observedAt: isoTimestampSchema }),
  z.strictObject({ version: z.literal("1"), type: z.literal("task-result"), deliveryId: identifierSchema, taskId: identifierSchema, a2aTask: z.record(z.string(), z.unknown()) }),
  z.strictObject({ version: z.literal("1"), type: z.literal("private-configuration-result"), deliveryId: identifierSchema, agentId: identifierSchema, status: z.enum(["updated", "failed"]), errorCode: identifierSchema.optional(), summary: agentPrivateConfigurationSummarySchema.optional() }),
]);

export const legacyMigrationPrivateFieldSchema = z.enum([
  "environment_values",
  "runtime_credentials",
  "runtime_configuration",
  "agent_mcp_credentials",
  "integration_credentials",
  "private_skill_contents",
]);

export const legacyAgentMigrationRecoverySchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("not_required") }),
  z.strictObject({
    state: z.literal("needs_attention"),
    backupId: identifierSchema,
    importedAgentId: identifierSchema,
    unmappedPrivateFields: z.array(legacyMigrationPrivateFieldSchema).min(1).max(6),
  }),
  z.strictObject({
    state: z.literal("completed"),
    backupId: identifierSchema,
    importedAgentId: identifierSchema,
    acknowledgedAt: isoTimestampSchema,
  }),
]);

export const completeLegacyAgentMigrationRecoverySchema = z.strictObject({
  backupId: identifierSchema,
  acknowledgedFields: z.array(legacyMigrationPrivateFieldSchema).min(1).max(6),
}).superRefine((value, context) => {
  if (new Set(value.acknowledgedFields).size !== value.acknowledgedFields.length) context.addIssue({ code: "custom", message: "legacy-recovery-field-duplicate" });
});

export const approvedAgentTemplates = Object.freeze([
  agentTemplateSchema.parse({
    templateId: "template:research-assistant", name: "Research assistant", description: "Synthesizes evidence into concise, source-aware answers.",
    instructions: "Investigate the request, distinguish evidence from inference, and answer concisely.",
    skillReferences: [{ key: "web-research", name: "Web research", description: "Find and synthesize public evidence." }],
  }),
  agentTemplateSchema.parse({
    templateId: "template:code-reviewer", name: "Code reviewer", description: "Reviews changes for correctness, security, and maintainability.",
    instructions: "Review the supplied code and lead with concrete, actionable findings.",
    skillReferences: [{ key: "code-review", name: "Code review", description: "Analyze code changes and identify defects." }],
  }),
  agentTemplateSchema.parse({
    templateId: "template:operations-helper", name: "Operations helper", description: "Turns operational questions into safe, verifiable actions.",
    instructions: "Diagnose operational issues with read-only evidence before proposing side effects.",
    skillReferences: [{ key: "incident-triage", name: "Incident triage", description: "Structure symptoms, evidence, and next actions." }],
  }),
]);

export function findApprovedAgentTemplate(templateId: string | undefined): AgentTemplate | undefined {
  return approvedAgentTemplates.find((template) => template.templateId === templateId);
}

export function validateConfigurationForRuntime(configuration: AgentConfiguration, runtime: AgentRuntime): readonly AgentDraftValidationResult["fieldErrors"][number][] {
  const errors: Array<AgentDraftValidationResult["fieldErrors"][number]> = [];
  const model = configuration.model ? runtime.capabilities.modelCatalog?.find((item) => item.model === configuration.model) : undefined;
  if (configuration.model && !runtime.capabilities.supportsModelSelection) errors.push({ field: "model", code: "runtime-model-selection-unsupported" });
  else if (configuration.model && runtime.capabilities.modelCatalog && !model) errors.push({ field: "model", code: "runtime-model-unsupported" });
  if (configuration.thinkingLevel && !runtime.capabilities.supportsThinkingLevel) errors.push({ field: "thinkingLevel", code: "runtime-thinking-level-unsupported" });
  else if (configuration.thinkingLevel && model && !model.thinkingLevels.includes(configuration.thinkingLevel)) errors.push({ field: "thinkingLevel", code: "runtime-thinking-level-unsupported" });
  if (configuration.serviceTier && !runtime.capabilities.supportsServiceTier) errors.push({ field: "serviceTier", code: "runtime-service-tier-unsupported" });
  else if (configuration.serviceTier && model && !model.serviceTiers.includes(configuration.serviceTier)) errors.push({ field: "serviceTier", code: "runtime-service-tier-unsupported" });
  if (configuration.environmentVariableNames.length && !runtime.capabilities.supportsEnvironment) errors.push({ field: "environment", code: "runtime-environment-unsupported" });
  if (configuration.customArguments.length && !runtime.capabilities.supportsCustomArguments) errors.push({ field: "customArguments", code: "runtime-custom-arguments-unsupported" });
  if (Object.keys(configuration.runtimeConfiguration).length && !runtime.capabilities.supportsRuntimeConfiguration) errors.push({ field: "runtimeConfiguration", code: "runtime-configuration-unsupported" });
  if (configuration.mcpConnections.length && !runtime.capabilities.supportsMcpConfiguration) errors.push({ field: "draft", code: "runtime-mcp-unsupported" });
  if (configuration.integrations.some((integration) => !runtime.capabilities.integrationProviders?.includes(integration.provider))) errors.push({ field: "draft", code: "runtime-integration-unsupported" });
  if ((configuration.skillIds.length || configuration.disabledRuntimeSkillIds.length) && !runtime.capabilities.supportsSkills) errors.push({ field: "draft", code: "runtime-skills-unsupported" });
  return errors;
}

export function validateAgentDraftForCreate(input: {
  readonly principal: AgentAccessPrincipal;
  readonly draft: AgentDraft;
  readonly runtime?: AgentRuntime;
  readonly currentBoundAgentCount: number;
}): AgentDraftValidationResult {
  const errors: Array<AgentDraftValidationResult["fieldErrors"][number]> = [];
  if (!input.draft.name.trim()) errors.push({ field: "name", code: "agent-name-required" });
  if (!input.draft.runtimeId || !input.runtime || input.runtime.runtimeId !== input.draft.runtimeId) {
    errors.push({ field: "runtimeId", code: "runtime-required" });
  } else {
    const binding = canBindRuntime(input.principal, input.runtime, input.currentBoundAgentCount);
    if (!binding.allowed) errors.push({ field: "runtimeId", code: binding.code });
    errors.push(...validateConfigurationForRuntime(input.draft.configuration, input.runtime));
  }
  if (input.draft.mode === "template" && !findApprovedAgentTemplate(input.draft.templateId)) errors.push({ field: "templateId", code: "agent-template-not-found" });
  return agentDraftValidationResultSchema.parse({ valid: errors.length === 0, fieldErrors: errors });
}

export type Account = z.infer<typeof accountSchema>;
export type HumanProfile = z.infer<typeof humanProfileSchema>;
export type FriendInvitationStatus = z.infer<typeof friendInvitationStatusSchema>;
export type FriendInvitation = z.infer<typeof friendInvitationSchema>;
export type FriendInvitationView = z.infer<typeof friendInvitationViewSchema>;
export type Friendship = z.infer<typeof friendshipSchema>;
export type FriendSummary = z.infer<typeof friendSummarySchema>;
export type MemberRole = z.infer<typeof memberRoleSchema>;
export type AccountMember = z.infer<typeof accountMemberSchema>;
export type AccountSession = z.infer<typeof accountSessionSchema>;
export type MemberInvitation = z.infer<typeof memberInvitationSchema>;
export type MemberInvitationSecret = z.infer<typeof memberInvitationSecretSchema>;
export type MemberRemovalImpact = z.infer<typeof memberRemovalImpactSchema>;
export type ConfirmMemberRemovalRequest = z.infer<typeof confirmMemberRemovalRequestSchema>;
export type RuntimeDeletionImpact = z.infer<typeof runtimeDeletionImpactSchema>;
export type ConfirmRuntimeDeletionRequest = z.infer<typeof confirmRuntimeDeletionRequestSchema>;
export type RuntimeHealth = z.infer<typeof runtimeHealthSchema>;
export type RuntimeCapabilities = z.infer<typeof runtimeCapabilitiesSchema>;
export type AgentRuntime = z.infer<typeof runtimeSchema>;
export type InvocationTarget = z.infer<typeof invocationTargetSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type RuntimeSkillSummary = z.infer<typeof runtimeSkillSummarySchema>;
export type AgentConfiguration = z.infer<typeof agentConfigurationSchema>;
export type AgentEditableConfiguration = z.infer<typeof agentEditableConfigurationSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type AgentDetailProjection = z.infer<typeof agentDetailProjectionSchema>;
export type AgentSkillCatalog = z.infer<typeof agentSkillCatalogSchema>;
export type AgentSkillMutation = z.infer<typeof agentSkillMutationSchema>;
export type AgentPrivateConfiguration = z.infer<typeof agentPrivateConfigurationSchema>;
export type AgentPrivateConfigurationUpdate = z.infer<typeof agentPrivateConfigurationUpdateSchema>;
export type AgentPrivateConfigurationSummary = z.infer<typeof agentPrivateConfigurationSummarySchema>;
export type AgentPresence = z.infer<typeof agentPresenceSchema>;
export type AgentWorkload = z.infer<typeof agentWorkloadSchema>;
export type AgentActivity = z.infer<typeof agentActivitySchema>;
export type AgentDraft = z.infer<typeof agentDraftSchema>;
export type AgentDraftValidationResult = z.infer<typeof agentDraftValidationResultSchema>;
export type CreateAgentFromDraftCommand = z.infer<typeof createAgentFromDraftCommandSchema>;
export type AgentTemplate = z.infer<typeof agentTemplateSchema>;
export type AgentBuilderProposal = z.infer<typeof agentBuilderProposalSchema>;
export type AgentCatalogRow = z.infer<typeof agentCatalogRowSchema>;
export type FriendAgentSummary = z.infer<typeof friendAgentSummarySchema>;
export type AgentCatalogPage = z.infer<typeof agentCatalogPageSchema>;
export type AgentCatalogQuery = z.infer<typeof agentCatalogQuerySchema>;
export type AgentBatchLifecycleRequest = z.infer<typeof agentBatchLifecycleRequestSchema>;
export type AgentBatchLifecycleResult = z.infer<typeof agentBatchLifecycleResultSchema>;
export type AccountResourceInvalidation = z.infer<typeof accountResourceInvalidationSchema>;
export type AccountRuntimeServerEnvelope = z.infer<typeof accountRuntimeServerEnvelopeSchema>;
export type AccountRuntimeClientEnvelope = z.infer<typeof accountRuntimeClientEnvelopeSchema>;
export type LegacyMigrationPrivateField = z.infer<typeof legacyMigrationPrivateFieldSchema>;
export type LegacyAgentMigrationRecovery = z.infer<typeof legacyAgentMigrationRecoverySchema>;
export type CompleteLegacyAgentMigrationRecovery = z.infer<typeof completeLegacyAgentMigrationRecoverySchema>;

export type {
  AccountAgentRepositories,
  AccountAgentUnitOfWork,
  AccountRepository,
  ActivityRepository,
  AgentListRequest,
  AgentRepository,
  DraftRepository,
  FriendshipRepository,
  MemberRepository,
  PageRequest,
  RepositoryPage,
  RuntimeRepository,
  SkillRepository,
  StableCursor,
} from "./repositories.js";

export {
  canBindRuntime,
  canInvokeAgent,
  canManageAgent,
  effectiveAccessScope,
  type AgentAccessPrincipal,
  type AgentAuthorizationDecision,
  type EffectiveAgentAccessScope,
  type RuntimeBindingDecision,
} from "./authorization.js";
