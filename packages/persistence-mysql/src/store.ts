import {
  accountSchema,
  accountMemberSchema,
  agentBatchLifecycleRequestSchema,
  agentBatchLifecycleResultSchema,
  agentCatalogQuerySchema,
  agentCatalogRowSchema,
  agentConfigurationSchema,
  agentDetailProjectionSchema,
  agentEditableConfigurationSchema,
  agentSkillCatalogSchema,
  agentSkillMutationSchema,
  agentPrivateConfigurationSummarySchema,
  agentSchema,
  accountSessionSchema,
  canBindRuntime,
  canInvokeAgent,
  canManageAgent,
  effectiveAccessScope,
  confirmRuntimeDeletionRequestSchema,
  confirmMemberRemovalRequestSchema,
  completeLegacyAgentMigrationRecoverySchema,
  friendInvitationSchema,
  friendInvitationViewSchema,
  friendAgentSummarySchema,
  friendSummarySchema,
  friendshipSchema,
  legacyAgentMigrationRecoverySchema,
  memberRemovalImpactSchema,
  memberInvitationSchema,
  memberRoleSchema,
  runtimeCapabilitiesSchema,
  runtimeHealthSchema,
  runtimeSkillSummarySchema,
  runtimeSchema,
  runtimeDeletionImpactSchema,
  validateConfigurationForRuntime,
  type Account,
  type AccountMember,
  type Agent,
  type AgentActivity,
  type AgentBatchLifecycleRequest,
  type AgentBatchLifecycleResult,
  type AgentCatalogQuery,
  type AgentCatalogRow,
  type AgentDetailProjection,
  type AgentSkillCatalog,
  type AgentSkillMutation,
  type AgentPrivateConfigurationSummary,
  type Skill,
  type AgentConfiguration,
  type AgentEditableConfiguration,
  type AccountSession,
  type ConfirmMemberRemovalRequest,
  type ConfirmRuntimeDeletionRequest,
  type MemberInvitation,
  type MemberRemovalImpact,
  type MemberRole,
  type AgentRuntime,
  type RuntimeCapabilities,
  type RuntimeHealth,
  type RuntimeSkillSummary,
  type RuntimeDeletionImpact,
  type CompleteLegacyAgentMigrationRecovery,
  type FriendInvitation,
  type FriendInvitationView,
  type FriendAgentSummary,
  type FriendSummary,
  type Friendship,
  type HumanProfile,
  type LegacyAgentMigrationRecovery,
  type RepositoryPage,
  type StableCursor,
} from "@agent-fabric/account-agent-domain";
import { credentialScopeSchema, principalKindSchema, type CredentialScope, type PrincipalKind } from "@agent-fabric/fabric-contracts";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader as ResultHeader, type RowDataPacket } from "mysql2/promise";

import { accountAgentA2AMySqlMigrationStatements, accountAgentCreationV8MySqlMigrationStatements, accountAgentMySqlMigrationStatements, accountRuntimeDeletionV7MySqlMigrationStatements, accountSelfTestV10MySqlMigrationStatements, applyHumanFriendshipV11Migration, initialMySqlMigrationStatements, legacyCreationStateRetirementV12MySqlMigrationStatements, legacyMigrationRecoveryV9MySqlMigrationStatements, onboardingMySqlMigrationStatements, personalAgentMySqlMigrationStatements, selfServiceMySqlMigrationStatements } from "./migration.js";

const migrationLockName = "agent_fabric_schema_migration";
const legacyMigrationPrivateFields = ["environment_values", "runtime_credentials", "runtime_configuration", "agent_mcp_credentials", "integration_credentials", "private_skill_contents"] as const;

export interface MySqlCredentialRecord {
  readonly credentialId: string;
  readonly principalId: string;
  readonly instanceId: string;
  readonly scopes: readonly CredentialScope[];
  readonly audience: string;
  readonly expiresAt: string;
  readonly resourceAgentId?: string;
}

export interface MySqlAuthenticatedPrincipal extends MySqlCredentialRecord {
  readonly kind: PrincipalKind;
  readonly ownerPrincipalId?: string;
}

export interface AccountInvokableAgentProjection {
  readonly agent: Agent;
  readonly runtime?: AgentRuntime;
  readonly accessScope: "owner" | "friend";
}

export type AccountA2ATaskState = "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled" | "rejected";

export interface AccountA2ATaskRoute {
  readonly taskId: string;
  readonly accountId: string;
  readonly originAccountId: string;
  readonly agentId: string;
  readonly originUserId: string;
  readonly originCredentialId: string;
  readonly state: AccountA2ATaskState;
}

export interface AccountSelfTest {
  readonly selfTestId: string;
  readonly accountId: string;
  readonly agentId: string;
  readonly requester: {
    readonly token: string;
    readonly principalId: string;
    readonly credentialId: string;
    readonly expiresAt: string;
  };
}

export interface AccountRuntimeDeletionExecutionPlan {
  readonly accountId: string;
  readonly runtimeId: string;
  readonly activeTasks: readonly { readonly taskId: string; readonly agentId: string }[];
}

export interface HumanFriendshipMigrationAudit {
  readonly nonOwnerMemberships: number;
  readonly nonOwnerAgents: number;
  readonly nonOwnerRuntimes: number;
  readonly nonOwnerSessions: number;
  readonly pendingMemberInvitations: number;
  readonly legacySharedAgents: number;
  readonly requiresHumanReview: boolean;
}

export class MySqlStore {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = mysql.createPool({ uri: connectionString, connectionLimit: 10, waitForConnections: true, timezone: "Z", dateStrings: true });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(): Promise<void> {
    const connection = await this.pool.getConnection();
    let locked = false;
    try {
      const [lockRows] = await connection.query<LockRow[]>("SELECT GET_LOCK(?, 30) AS acquired", [migrationLockName]);
      locked = Number(lockRows[0]?.acquired) === 1;
      if (!locked) throw new MySqlPersistenceError("migration-lock-timeout");
      await connection.query(initialMySqlMigrationStatements[0]);
      const [versionRows] = await connection.query<VersionRow[]>("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
      const current = Number(versionRows[0]?.version ?? 0);
      if (current > 12) throw new MySqlPersistenceError("schema-newer-than-server");
      if (current < 1) {
        for (const statement of initialMySqlMigrationStatements.slice(1)) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (1)");
      }
      if (current < 2) {
        for (const statement of onboardingMySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (2)");
      }
      if (current < 3) {
        for (const statement of selfServiceMySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (3)");
      }
      if (current < 4) {
        for (const statement of personalAgentMySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (4)");
      }
      if (current < 5) {
        for (const statement of accountAgentMySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (5)");
      }
      if (current < 6) {
        for (const statement of accountAgentA2AMySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (6)");
      }
      if (current < 7) {
        for (const statement of accountRuntimeDeletionV7MySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (7)");
      }
      if (current < 8) {
        for (const statement of accountAgentCreationV8MySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (8)");
      }
      if (current < 9) {
        for (const statement of legacyMigrationRecoveryV9MySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (9)");
      }
      if (current < 10) {
        for (const statement of accountSelfTestV10MySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (10)");
      }
      if (current < 11) {
        const audit = await this.#auditHumanFriendshipMigration(connection);
        if (audit.requiresHumanReview) throw new MySqlPersistenceError("human-friendship-migration-review-required");
        await applyHumanFriendshipV11Migration(connection);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (11)");
      }
      if (current < 12) {
        for (const statement of legacyCreationStateRetirementV12MySqlMigrationStatements) await connection.query(statement);
        await connection.query("INSERT IGNORE INTO schema_migrations(version) VALUES (12)");
      }
      await connection.execute("INSERT IGNORE INTO fabric_instances(instance_id,public_base_url,created_at,bootstrap_consumed_at) VALUES ('instance:account-product','internal',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
    } finally {
      if (locked) await connection.query("SELECT RELEASE_LOCK(?)", [migrationLockName]).catch(() => undefined);
      connection.release();
    }
  }

  async health(): Promise<{ readonly database: "ready"; readonly schemaVersion: number }> {
    const [rows] = await this.pool.query<VersionRow[]>("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations");
    const schemaVersion = Number(rows[0]?.version ?? 0);
    if (schemaVersion !== 12) throw new MySqlPersistenceError("schema-incompatible");
    return { database: "ready", schemaVersion };
  }

  async auditHumanFriendshipMigration(): Promise<HumanFriendshipMigrationAudit> {
    const connection = await this.pool.getConnection();
    try {
      return await this.#auditHumanFriendshipMigration(connection);
    } finally {
      connection.release();
    }
  }

  async #auditHumanFriendshipMigration(connection: PoolConnection): Promise<HumanFriendshipMigrationAudit> {
    const [rows] = await connection.query<HumanFriendshipMigrationAuditRow[]>(String.raw`
      SELECT
        (SELECT COUNT(*) FROM account_memberships WHERE role<>'owner') AS non_owner_memberships,
        (SELECT COUNT(*) FROM account_agents a JOIN account_memberships m ON m.account_id=a.account_id AND m.user_id=a.owner_user_id WHERE m.role<>'owner') AS non_owner_agents,
        (SELECT COUNT(*) FROM account_runtimes r JOIN account_memberships m ON m.account_id=r.account_id AND m.user_id=r.owner_user_id WHERE m.role<>'owner') AS non_owner_runtimes,
        (SELECT COUNT(*) FROM account_sessions s JOIN account_memberships m ON m.account_id=s.account_id AND m.user_id=s.user_id WHERE m.role<>'owner' AND s.revoked_at IS NULL) AS non_owner_sessions,
        (SELECT COUNT(*) FROM account_member_invitations WHERE status='pending') AS pending_member_invitations,
        (SELECT COUNT(*) FROM account_agents WHERE permission_mode IN ('targeted','account')) AS legacy_shared_agents
    `);
    const row = rows[0];
    if (!row) throw new MySqlPersistenceError("human-friendship-migration-audit-unavailable");
    const audit = {
      nonOwnerMemberships: Number(row.non_owner_memberships),
      nonOwnerAgents: Number(row.non_owner_agents),
      nonOwnerRuntimes: Number(row.non_owner_runtimes),
      nonOwnerSessions: Number(row.non_owner_sessions),
      pendingMemberInvitations: Number(row.pending_member_invitations),
      legacySharedAgents: Number(row.legacy_shared_agents),
    };
    return { ...audit, requiresHumanReview: audit.nonOwnerMemberships + audit.nonOwnerAgents + audit.nonOwnerRuntimes + audit.nonOwnerSessions > 0 };
  }

  async authenticate(token: string, audience: string, requiredScope?: CredentialScope): Promise<MySqlAuthenticatedPrincipal> {
    const [rows] = await this.pool.execute<CredentialRow[]>(String.raw`
      SELECT c.credential_id, c.principal_id, c.instance_id, c.scopes, c.audience, c.expires_at, c.resource_agent_id,
             p.kind, p.owner_principal_id
      FROM credentials c JOIN principals p ON p.principal_id = c.principal_id
      WHERE c.token_digest=? AND c.revoked_at IS NULL AND p.revoked_at IS NULL AND c.expires_at > UTC_TIMESTAMP(3)
    `, [hashCredential(token)]);
    const row = rows[0];
    if (!row || row.audience !== audience) throw new MySqlPersistenceError("credential-invalid");
    const scopes = jsonArray(row.scopes).map((scope) => credentialScopeSchema.parse(scope));
    if (requiredScope && !scopes.includes(requiredScope)) throw new MySqlPersistenceError("credential-scope-denied");
    return {
      credentialId: row.credential_id,
      principalId: row.principal_id,
      instanceId: row.instance_id,
      scopes,
      audience: row.audience,
      expiresAt: toIso(row.expires_at),
      ...(row.resource_agent_id ? { resourceAgentId: row.resource_agent_id } : {}),
      kind: principalKindSchema.parse(row.kind),
      ...(row.owner_principal_id ? { ownerPrincipalId: row.owner_principal_id } : {}),
    };
  }

  async revokeCredential(credentialId: string, revokedAt = new Date().toISOString()): Promise<void> {
    await this.#transaction(async (connection) => {
      await connection.execute("UPDATE credentials SET revoked_at=? WHERE credential_id=?", [sqlDate(revokedAt), credentialId]);
      await connection.execute("UPDATE account_sessions SET revoked_at=? WHERE credential_id=? AND revoked_at IS NULL", [sqlDate(revokedAt), credentialId]);
    });
  }

  async createOwnerLoginSession(input: {
    readonly oauthStateDigest: string; readonly nonceDigest: string; readonly returnUri: string; readonly clientState: string;
    readonly codeChallenge: string; readonly deviceName: string; readonly expiresAt: string; readonly createdAt?: string;
  }): Promise<{ readonly joinSessionId: string }> {
    const createdAt = input.createdAt ?? new Date().toISOString(); const joinSessionId = `login:${randomUUID()}`;
    await this.pool.execute(String.raw`
      INSERT INTO join_sessions(join_session_id, invitation_id, oauth_state_digest, nonce_digest, return_uri, client_state, code_challenge, device_name, expires_at, created_at, purpose)
      VALUES (?,NULL,?,?,?,?,?,?,?,?,'owner')
    `, [joinSessionId, input.oauthStateDigest, input.nonceDigest, input.returnUri, input.clientState, input.codeChallenge, input.deviceName, sqlDate(input.expiresAt), sqlDate(createdAt)]);
    return { joinSessionId };
  }

  async createAccountMemberJoinSession(input: {
    readonly invitationTokenDigest: string; readonly oauthStateDigest: string; readonly nonceDigest: string;
    readonly returnUri: string; readonly clientState: string; readonly codeChallenge: string; readonly deviceName: string;
    readonly expiresAt: string; readonly createdAt?: string;
  }): Promise<{ readonly joinSessionId: string }> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    return this.#transaction(async (connection) => {
      const [rows] = await connection.execute<AccountInvitationAvailabilityRow[]>(String.raw`
        SELECT invitation_id,status,expires_at,accepted_at,revoked_at
        FROM account_member_invitations WHERE token_digest=? FOR UPDATE
      `, [input.invitationTokenDigest]);
      const invitation = rows[0];
      if (!invitation || invitation.status !== "pending" || invitation.accepted_at || invitation.revoked_at || Date.parse(toIso(invitation.expires_at)) <= Date.parse(createdAt)) {
        throw new MySqlPersistenceError("account-invitation-unavailable");
      }
      const joinSessionId = `account-join:${randomUUID()}`;
      await connection.execute(String.raw`
        INSERT INTO join_sessions(
          join_session_id,invitation_id,account_invitation_id,oauth_state_digest,nonce_digest,return_uri,
          client_state,code_challenge,device_name,expires_at,created_at,purpose
        ) VALUES (?,NULL,?,?,?,?,?,?,?,?,?,'account_invite')
      `, [joinSessionId, invitation.invitation_id, input.oauthStateDigest, input.nonceDigest, input.returnUri, input.clientState, input.codeChallenge, input.deviceName, sqlDate(input.expiresAt), sqlDate(createdAt)]);
      return { joinSessionId };
    });
  }

  async getAuthSessionByState(oauthStateDigest: string): Promise<{ readonly joinSessionId: string; readonly nonceDigest: string; readonly expiresAt: string; readonly purpose: "owner" | "account_invite"; readonly returnUri: string; readonly clientState: string }> {
    const [rows] = await this.pool.execute<(JoinStateRow & { purpose: string })[]>("SELECT join_session_id, nonce_digest, expires_at, authenticated_at, consumed_at, purpose, return_uri, client_state FROM join_sessions WHERE oauth_state_digest=?", [oauthStateDigest]);
    const row = rows[0];
    if (!row || row.authenticated_at || row.consumed_at || Date.parse(toIso(row.expires_at)) <= Date.now()) throw new MySqlPersistenceError("join-session-unavailable");
    if (row.purpose !== "owner" && row.purpose !== "account_invite") throw new MySqlPersistenceError("join-session-unavailable");
    const purpose = row.purpose;
    return { joinSessionId: row.join_session_id, nonceDigest: row.nonce_digest, expiresAt: toIso(row.expires_at), purpose, returnUri: row.return_uri, clientState: row.client_state };
  }

  async cancelAuthSession(joinSessionId: string, cancelledAt = new Date().toISOString()): Promise<void> {
    const [result] = await this.pool.execute<ResultHeader>("UPDATE join_sessions SET consumed_at=? WHERE join_session_id=? AND authenticated_at IS NULL AND consumed_at IS NULL AND expires_at > ?", [sqlDate(cancelledAt), joinSessionId, sqlDate(cancelledAt)]);
    if (result.affectedRows !== 1) throw new MySqlPersistenceError("join-session-unavailable");
  }

  async authenticateJoinSession(input: {
    readonly joinSessionId: string; readonly issuer: string; readonly subjectDigest: string; readonly displayName: string;
    readonly email?: string; readonly exchangeDigest: string; readonly authenticatedAt?: string;
  }): Promise<{ readonly returnUri: string; readonly clientState: string }> {
    const authenticatedAt = input.authenticatedAt ?? new Date().toISOString();
    const [result] = await this.pool.execute<ResultHeader>(String.raw`
      UPDATE join_sessions SET identity_issuer=?, subject_digest=?, display_name=?, identity_email=?, exchange_digest=?, authenticated_at=?
      WHERE join_session_id=? AND authenticated_at IS NULL AND consumed_at IS NULL AND expires_at > ?
    `, [input.issuer, input.subjectDigest, input.displayName, input.email?.trim().toLowerCase() ?? null, input.exchangeDigest, sqlDate(authenticatedAt), input.joinSessionId, sqlDate(authenticatedAt)]);
    if (result.affectedRows !== 1) throw new MySqlPersistenceError("join-session-unavailable");
    const [rows] = await this.pool.execute<JoinReturnRow[]>("SELECT return_uri, client_state FROM join_sessions WHERE join_session_id=?", [input.joinSessionId]);
    const row = rows[0];
    if (!row) throw new MySqlPersistenceError("join-session-unavailable");
    return { returnUri: row.return_uri, clientState: row.client_state };
  }

  async redeemOwnerLoginSession(input: {
    readonly exchangeDigest: string; readonly codeChallenge: string; readonly audience: string; readonly credentialExpiresAt: string; readonly now?: string;
  }): Promise<{ readonly token: string; readonly humanPrincipalId: string; readonly principalId: string; readonly accountId: string; readonly displayName: string; readonly expiresAt: string }> {
    const now = input.now ?? new Date().toISOString();
    return this.#transaction(async (connection) => {
      const [rows] = await connection.execute<OwnerLoginRedemptionRow[]>("SELECT * FROM join_sessions WHERE exchange_digest=? AND purpose='owner' FOR UPDATE", [input.exchangeDigest]);
      const row = rows[0];
      if (!row || row.consumed_at || !row.authenticated_at || row.code_challenge !== input.codeChallenge || Date.parse(toIso(row.expires_at)) <= Date.parse(now)) throw new MySqlPersistenceError("login-exchange-denied");
      const [existing] = await connection.execute<ExternalIdentityRow[]>("SELECT principal_id FROM external_identities WHERE issuer=? AND subject_digest=? FOR UPDATE", [row.identity_issuer, row.subject_digest]);
      let humanPrincipalId = existing[0]?.principal_id;
      if (!humanPrincipalId) {
        humanPrincipalId = `human:${randomUUID()}`;
        await connection.execute("INSERT INTO principals(principal_id, kind, display_name, created_at) VALUES (?,'human',?,?)", [humanPrincipalId, row.display_name.slice(0, 120), sqlDate(now)]);
        await connection.execute("INSERT INTO external_identities(issuer, subject_digest, principal_id, created_at) VALUES (?,?,?,?)", [row.identity_issuer, row.subject_digest, humanPrincipalId, sqlDate(now)]);
      }
      const identityEmail = row.identity_email?.trim().toLowerCase();
      if (!identityEmail) throw new MySqlPersistenceError("login-identity-email-required");
      const [memberships] = await connection.execute<AccountMembershipIdentityRow[]>(
        "SELECT account_id, role, email FROM account_memberships WHERE user_id=? ORDER BY joined_at, account_id LIMIT 2 FOR UPDATE",
        [humanPrincipalId],
      );
      if (memberships.length > 1 || (memberships[0] && memberships[0].role !== "owner")) throw new MySqlPersistenceError("human-friendship-migration-review-required");
      let accountId = memberships[0]?.account_id;
      let role: "owner" | undefined = memberships[0]?.role === "owner" ? "owner" : undefined;
      if (memberships[0] && memberships[0].email.trim().toLowerCase() !== identityEmail) {
        await connection.execute(
          "UPDATE account_memberships SET email=?,version=version+1,updated_at=? WHERE account_id=? AND user_id=?",
          [identityEmail, sqlDate(now), memberships[0].account_id, humanPrincipalId],
        );
      }
      if (!accountId || !role) {
        accountId = `account:${randomUUID()}`;
        const membershipId = `membership:${randomUUID()}`;
        await connection.execute("INSERT INTO accounts(account_id,name,version,created_at,updated_at) VALUES (?,?,1,?,?)", [accountId, `${row.display_name.slice(0, 100)} Account`, sqlDate(now), sqlDate(now)]);
        await connection.execute(String.raw`
          INSERT INTO account_memberships(membership_id,account_id,user_id,email,role,version,joined_at,updated_at)
          VALUES (?,?,?,?,'owner',1,?,?)
        `, [membershipId, accountId, humanPrincipalId, identityEmail, sqlDate(now), sqlDate(now)]);
        role = "owner";
      }
      const principalId = `device:${randomUUID()}`;
      await connection.execute("INSERT INTO principals(principal_id, kind, owner_principal_id, display_name, created_at) VALUES (?,'device',?,?,?)", [principalId, humanPrincipalId, row.device_name.slice(0, 120), sqlDate(now)]);
      const [instances] = await connection.query<IdentifierRow[]>("SELECT instance_id FROM fabric_instances LIMIT 1"); const instanceId = instances[0]?.instance_id;
      if (!instanceId) throw new MySqlPersistenceError("instance-required");
      const issued = await this.#issueCredential(connection, { principalId, instanceId, scopes: ["account:access"], audience: input.audience, expiresAt: input.credentialExpiresAt, now });
      await connection.execute(String.raw`
        INSERT INTO account_sessions(session_id,credential_id,account_id,user_id,created_at,expires_at,last_seen_at)
        VALUES (?,?,?,?,?,?,?)
      `, [`session:${randomUUID()}`, issued.record.credentialId, accountId, humanPrincipalId, sqlDate(now), sqlDate(input.credentialExpiresAt), sqlDate(now)]);
      await connection.execute("UPDATE join_sessions SET consumed_at=? WHERE join_session_id=?", [sqlDate(now), row.join_session_id]);
      await connection.execute(String.raw`
        UPDATE human_friend_invitations
        SET recipient_user_id=?
        WHERE recipient_user_id IS NULL AND recipient_email_digest=? AND recipient_email=? AND status='pending' AND expires_at>?
      `, [humanPrincipalId, hashCredential(identityEmail), identityEmail, sqlDate(now)]);
      await this.#audit(connection, principalId, "account.login", "account", accountId, "success", { role }, now);
      return { token: issued.token, humanPrincipalId, principalId, accountId, displayName: row.display_name, expiresAt: input.credentialExpiresAt };
    });
  }

  async redeemAccountMemberLoginSession(input: {
    readonly exchangeDigest: string; readonly codeChallenge: string; readonly audience: string; readonly credentialExpiresAt: string; readonly now?: string;
  }): Promise<{ readonly token: string; readonly humanPrincipalId: string; readonly principalId: string; readonly accountId: string; readonly role: "owner" | "admin" | "member"; readonly displayName: string; readonly expiresAt: string }> {
    const now = input.now ?? new Date().toISOString();
    return this.#transaction(async (connection) => {
      const [rows] = await connection.execute<AccountMemberJoinRedemptionRow[]>(String.raw`
        SELECT s.*,i.account_id,i.invited_email,i.role,i.status AS invitation_status,
               i.expires_at AS invitation_expires_at,i.accepted_at AS invitation_accepted_at,i.revoked_at AS invitation_revoked_at
        FROM join_sessions s
        JOIN account_member_invitations i ON i.invitation_id=s.account_invitation_id
        WHERE s.exchange_digest=? AND s.purpose='account_invite' FOR UPDATE
      `, [input.exchangeDigest]);
      const row = rows[0];
      const email = row?.identity_email?.trim().toLowerCase();
      if (!row || row.consumed_at || !row.authenticated_at || row.code_challenge !== input.codeChallenge
        || row.invitation_status !== "pending" || row.invitation_accepted_at || row.invitation_revoked_at
        || Date.parse(toIso(row.expires_at)) <= Date.parse(now) || Date.parse(toIso(row.invitation_expires_at)) <= Date.parse(now)
        || !email || email !== row.invited_email.trim().toLowerCase()) {
        throw new MySqlPersistenceError("account-join-exchange-denied");
      }
      const [existing] = await connection.execute<ExternalIdentityRow[]>("SELECT principal_id FROM external_identities WHERE issuer=? AND subject_digest=? FOR UPDATE", [row.identity_issuer, row.subject_digest]);
      let humanPrincipalId = existing[0]?.principal_id;
      if (!humanPrincipalId) {
        humanPrincipalId = `human:${randomUUID()}`;
        await connection.execute("INSERT INTO principals(principal_id,kind,display_name,created_at) VALUES (?,'human',?,?)", [humanPrincipalId, row.display_name.slice(0, 120), sqlDate(now)]);
        await connection.execute("INSERT INTO external_identities(issuer,subject_digest,principal_id,created_at) VALUES (?,?,?,?)", [row.identity_issuer, row.subject_digest, humanPrincipalId, sqlDate(now)]);
      }
      const [memberships] = await connection.execute<AccountMembershipIdentityRow[]>("SELECT account_id,role,email FROM account_memberships WHERE user_id=? FOR UPDATE", [humanPrincipalId]);
      if (memberships.length !== 0) throw new MySqlPersistenceError("account-membership-already-exists");
      const membershipId = `membership:${randomUUID()}`;
      await connection.execute(String.raw`
        INSERT INTO account_memberships(membership_id,account_id,user_id,email,role,version,joined_at,updated_at)
        VALUES (?,?,?,?,?,1,?,?)
      `, [membershipId, row.account_id, humanPrincipalId, email, row.role, sqlDate(now), sqlDate(now)]);
      const principalId = `device:${randomUUID()}`;
      await connection.execute("INSERT INTO principals(principal_id,kind,owner_principal_id,display_name,created_at) VALUES (?,'device',?,?,?)", [principalId, humanPrincipalId, row.device_name.slice(0, 120), sqlDate(now)]);
      const [instances] = await connection.query<IdentifierRow[]>("SELECT instance_id FROM fabric_instances LIMIT 1");
      const instanceId = instances[0]?.instance_id;
      if (!instanceId) throw new MySqlPersistenceError("instance-required");
      const expiresAt = Date.parse(input.credentialExpiresAt) < Date.parse(toIso(row.invitation_expires_at)) ? input.credentialExpiresAt : toIso(row.invitation_expires_at);
      const issued = await this.#issueCredential(connection, { principalId, instanceId, scopes: ["account:access"], audience: input.audience, expiresAt, now });
      await connection.execute("INSERT INTO account_sessions(session_id,credential_id,account_id,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?,?)", [`session:${randomUUID()}`, issued.record.credentialId, row.account_id, humanPrincipalId, sqlDate(now), sqlDate(expiresAt), sqlDate(now)]);
      await connection.execute("UPDATE account_member_invitations SET status='accepted',accepted_at=?,version=version+1 WHERE invitation_id=? AND status='pending'", [sqlDate(now), row.account_invitation_id]);
      await connection.execute("UPDATE join_sessions SET consumed_at=? WHERE join_session_id=?", [sqlDate(now), row.join_session_id]);
      await this.#audit(connection, principalId, "account.invitation.accept", "account", row.account_id, "success", { role: row.role }, now);
      return { token: issued.token, humanPrincipalId, principalId, accountId: row.account_id, role: row.role, displayName: row.display_name, expiresAt };
    });
  }

  async getAccountSessionByCredential(credentialId: string, now = new Date().toISOString()): Promise<AccountSession> {
    const [rows] = await this.pool.execute<AccountSessionRow[]>(String.raw`
      SELECT s.session_id,s.credential_id,s.account_id,s.user_id,s.created_at,s.expires_at,s.last_seen_at,s.revoked_at,
             m.email,m.role,p.display_name,c.revoked_at AS credential_revoked_at
      FROM account_sessions s
      JOIN account_memberships m ON m.account_id=s.account_id AND m.user_id=s.user_id
      JOIN principals p ON p.principal_id=s.user_id
      JOIN credentials c ON c.credential_id=s.credential_id
      WHERE s.credential_id=? AND s.expires_at>? AND s.revoked_at IS NULL AND c.revoked_at IS NULL
    `, [credentialId, sqlDate(now)]);
    const row = rows[0];
    if (!row) throw new MySqlPersistenceError("account-session-unavailable");
    await this.pool.execute("UPDATE account_sessions SET last_seen_at=? WHERE session_id=?", [sqlDate(now), row.session_id]);
    return accountSessionSchema.parse({
      sessionId: row.session_id,
      credentialId: row.credential_id,
      accountId: row.account_id,
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at),
      lastSeenAt: now,
    });
  }

  async getAccountForCredential(credentialId: string, now = new Date().toISOString()): Promise<Account> {
    const [rows] = await this.pool.execute<AccountProjectionRow[]>(String.raw`
      SELECT a.account_id,a.name,a.version,a.created_at,a.updated_at
      FROM accounts a
      JOIN account_sessions s ON s.account_id=a.account_id
      JOIN credentials c ON c.credential_id=s.credential_id
      WHERE s.credential_id=? AND s.expires_at>? AND s.revoked_at IS NULL AND c.revoked_at IS NULL
      LIMIT 1
    `, [credentialId, sqlDate(now)]);
    const row = rows[0];
    if (!row) throw new MySqlPersistenceError("account-session-unavailable");
    return accountSchema.parse({
      accountId: row.account_id,
      name: row.name,
      version: Number(row.version),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    });
  }

  async getLegacyAgentMigrationRecoveryForCredential(credentialId: string, now = new Date().toISOString()): Promise<LegacyAgentMigrationRecovery> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<LegacyMigrationRecoveryRow[]>(String.raw`
        SELECT m.account_agent_id,b.backup_id,r.acknowledged_at
        FROM personal_agent_account_migrations m
        JOIN personal_agent_migration_backups b ON b.legacy_agent_id=m.legacy_agent_id AND b.source_kind='personal_agent'
        LEFT JOIN personal_agent_migration_recovery_acknowledgements r ON r.backup_id=b.backup_id AND r.account_id=m.account_id
        WHERE m.account_id=?
        ORDER BY m.migrated_at,m.legacy_agent_id
        LIMIT 2
      `, [actor.account_id]);
      if (rows.length === 0) return legacyAgentMigrationRecoverySchema.parse({ state: "not_required" });
      if (rows.length > 1) throw new MySqlPersistenceError("legacy-recovery-ambiguous");
      const row = rows[0]!;
      return legacyAgentMigrationRecoverySchema.parse(row.acknowledged_at
        ? { state: "completed", backupId: row.backup_id, importedAgentId: row.account_agent_id, acknowledgedAt: toIso(row.acknowledged_at) }
        : { state: "needs_attention", backupId: row.backup_id, importedAgentId: row.account_agent_id, unmappedPrivateFields: legacyMigrationPrivateFields });
    });
  }

  async completeLegacyAgentMigrationRecoveryForCredential(credentialId: string, inputValue: unknown, now = new Date().toISOString()): Promise<LegacyAgentMigrationRecovery> {
    const input: CompleteLegacyAgentMigrationRecovery = completeLegacyAgentMigrationRecoverySchema.parse(inputValue);
    const acknowledged = new Set(input.acknowledgedFields);
    if (legacyMigrationPrivateFields.some((field) => !acknowledged.has(field)) || acknowledged.size !== legacyMigrationPrivateFields.length) throw new MySqlPersistenceError("legacy-recovery-acknowledgement-incomplete");
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      if (actor.role === "member") throw new MySqlPersistenceError("account-member-authority-denied");
      const [rows] = await connection.execute<LegacyMigrationRecoveryRow[]>(String.raw`
        SELECT m.account_agent_id,b.backup_id,r.acknowledged_at
        FROM personal_agent_account_migrations m
        JOIN personal_agent_migration_backups b ON b.legacy_agent_id=m.legacy_agent_id AND b.source_kind='personal_agent'
        LEFT JOIN personal_agent_migration_recovery_acknowledgements r ON r.backup_id=b.backup_id AND r.account_id=m.account_id
        WHERE m.account_id=? AND b.backup_id=?
        LIMIT 1 FOR UPDATE
      `, [actor.account_id, input.backupId]);
      const row = rows[0];
      if (!row) throw new MySqlPersistenceError("legacy-recovery-not-found");
      const acknowledgedAt = row.acknowledged_at ? toIso(row.acknowledged_at) : now;
      if (!row.acknowledged_at) {
        await connection.execute(String.raw`
          INSERT INTO personal_agent_migration_recovery_acknowledgements(
            backup_id,account_id,imported_agent_id,acknowledged_by_user_id,acknowledged_fields,acknowledged_at
          ) VALUES (?,?,?,?,?,?)
        `, [row.backup_id, actor.account_id, row.account_agent_id, actor.user_id, JSON.stringify([...legacyMigrationPrivateFields]), sqlDate(now)]);
        await this.#audit(connection, actor.user_id, "account.legacy-migration.recovery.acknowledge", "personal_agent_migration_backup", row.backup_id, "success", { fieldCount: legacyMigrationPrivateFields.length }, now);
      }
      return legacyAgentMigrationRecoverySchema.parse({ state: "completed", backupId: row.backup_id, importedAgentId: row.account_agent_id, acknowledgedAt });
    });
  }

  async listIncomingFriendInvitationsForCredential(credentialId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<FriendInvitationView>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      await this.#expireFriendInvitations(connection, now);
      const values: (string | number | Date)[] = [actor.user_id, hashCredential(actor.email)];
      let cursor = "";
      if (request.after) {
        cursor = " AND (i.created_at < ? OR (i.created_at=? AND i.invitation_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<FriendInvitationProjectionRow[]>(String.raw`
        SELECT i.*,p.display_name AS other_display_name,m.email AS other_email
        FROM human_friend_invitations i
        JOIN principals p ON p.principal_id=i.inviter_user_id
        LEFT JOIN account_memberships m ON m.user_id=i.inviter_user_id AND m.role='owner'
        WHERE (i.recipient_user_id=? OR (i.recipient_user_id IS NULL AND i.recipient_email_digest=?))${cursor}
        ORDER BY i.created_at DESC,i.invitation_id DESC LIMIT ${limit}
      `, values);
      return friendInvitationPage(rows, "incoming", limit);
    });
  }

  async listOutgoingFriendInvitationsForCredential(credentialId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<FriendInvitationView>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      await this.#expireFriendInvitations(connection, now);
      const values: (string | number | Date)[] = [actor.user_id];
      let cursor = "";
      if (request.after) {
        cursor = " AND (i.created_at < ? OR (i.created_at=? AND i.invitation_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<FriendInvitationProjectionRow[]>(String.raw`
        SELECT i.*,p.display_name AS other_display_name,m.email AS other_email
        FROM human_friend_invitations i
        LEFT JOIN principals p ON p.principal_id=i.recipient_user_id
        LEFT JOIN account_memberships m ON m.user_id=i.recipient_user_id AND m.role='owner'
        WHERE i.inviter_user_id=?${cursor}
        ORDER BY i.created_at DESC,i.invitation_id DESC LIMIT ${limit}
      `, values);
      return friendInvitationPage(rows, "outgoing", limit);
    });
  }

  async createFriendInvitationForCredential(credentialId: string, input: { readonly email: string; readonly expiresAt: string }, now = new Date().toISOString()): Promise<FriendInvitationView> {
    const email = input.email.trim().toLowerCase();
    const expiresAt = new Date(input.expiresAt).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(now) || Date.parse(expiresAt) > Date.parse(now) + 30 * 24 * 60 * 60 * 1000) throw new MySqlPersistenceError("friend-invitation-expiry-denied");
    try {
      return await this.#transaction(async (connection) => {
        const actor = await this.#accountActor(connection, credentialId, now);
        if (email === actor.email.trim().toLowerCase()) throw new MySqlPersistenceError("friend-invitation-unavailable");
        await this.#expireFriendInvitations(connection, now);
        const [recipientRows] = await connection.execute<HumanIdentityProjectionRow[]>(String.raw`
          SELECT m.user_id,p.display_name,m.email
          FROM account_memberships m JOIN principals p ON p.principal_id=m.user_id
          WHERE m.role='owner' AND m.email=? LIMIT 2 FOR UPDATE
        `, [email]);
        if (recipientRows.length > 1) throw new MySqlPersistenceError("friend-invitation-unavailable");
        const recipient = recipientRows[0];
        const recipientEmailDigest = hashCredential(email);
        if (recipient) {
          const [humanAUserId, humanBUserId] = normalizeHumanPair(actor.user_id, recipient.user_id);
          const [existing] = await connection.execute<FriendshipRow[]>("SELECT * FROM human_friendships WHERE human_a_user_id=? AND human_b_user_id=? FOR UPDATE", [humanAUserId, humanBUserId]);
          if (existing[0]?.status === "active") throw new MySqlPersistenceError("friend-invitation-unavailable");
          const [pending] = await connection.execute<RowDataPacket[]>(String.raw`
            SELECT invitation_id FROM human_friend_invitations
            WHERE status='pending' AND ((inviter_user_id=? AND recipient_email_digest=?) OR (inviter_user_id=? AND recipient_email_digest=?))
            LIMIT 1 FOR UPDATE
          `, [actor.user_id, recipientEmailDigest, recipient.user_id, hashCredential(actor.email)]);
          if (pending.length > 0) throw new MySqlPersistenceError("friend-invitation-unavailable");
        }
        const invitationId = `friend-invitation:${randomUUID()}`;
        await connection.execute(String.raw`
          INSERT INTO human_friend_invitations(
            invitation_id,inviter_user_id,recipient_email,recipient_email_digest,recipient_user_id,status,version,expires_at,created_at
          ) VALUES (?,?,?,?,?,'pending',1,?,?)
        `, [invitationId, actor.user_id, email, recipientEmailDigest, recipient?.user_id ?? null, sqlDate(expiresAt), sqlDate(now)]);
        const invitation = friendInvitationSchema.parse({
          invitationId, inviterUserId: actor.user_id, recipientEmail: email, ...(recipient ? { recipientUserId: recipient.user_id } : {}),
          status: "pending", createdAt: now, expiresAt, version: 1,
        });
        await this.#audit(connection, actor.user_id, "human.friend-invitation.create", "human_friend_invitation", invitationId, "success", { recipientRegistered: Boolean(recipient) }, now);
        return friendInvitationViewSchema.parse({
          direction: "outgoing", invitation,
          ...(recipient ? { otherHuman: { userId: recipient.user_id, displayName: recipient.display_name, email: recipient.email } } : {}),
        });
      });
    } catch (error) {
      if (isDuplicateEntry(error)) throw new MySqlPersistenceError("friend-invitation-unavailable");
      throw error;
    }
  }

  async acceptFriendInvitationForCredential(credentialId: string, invitationId: string, expectedVersion: number, now = new Date().toISOString()): Promise<{ readonly invitation: FriendInvitation; readonly friendship: Friendship }> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const invitation = await this.#incomingFriendInvitationForUpdate(connection, actor, invitationId, expectedVersion, now);
      const [humanAUserId, humanBUserId] = normalizeHumanPair(invitation.inviter_user_id, actor.user_id);
      const [existingRows] = await connection.execute<FriendshipRow[]>("SELECT * FROM human_friendships WHERE human_a_user_id=? AND human_b_user_id=? FOR UPDATE", [humanAUserId, humanBUserId]);
      const existing = existingRows[0];
      let friendship: Friendship;
      if (existing) {
        if (existing.status === "active") throw new MySqlPersistenceError("friend-invitation-unavailable");
        await connection.execute(String.raw`
          UPDATE human_friendships SET status='active',relationship_version=relationship_version+1,version=version+1,updated_at=?,revoked_at=NULL
          WHERE friendship_id=? AND status='revoked'
        `, [sqlDate(now), existing.friendship_id]);
        friendship = mapFriendship({ ...existing, status: "active", relationship_version: Number(existing.relationship_version) + 1, version: Number(existing.version) + 1, updated_at: sqlDate(now), revoked_at: null });
      } else {
        const friendshipId = `friendship:${randomUUID()}`;
        await connection.execute(String.raw`
          INSERT INTO human_friendships(friendship_id,human_a_user_id,human_b_user_id,status,relationship_version,version,created_at,updated_at)
          VALUES (?,?,?,'active',1,1,?,?)
        `, [friendshipId, humanAUserId, humanBUserId, sqlDate(now), sqlDate(now)]);
        friendship = friendshipSchema.parse({ friendshipId, humanAUserId, humanBUserId, status: "active", relationshipVersion: 1, createdAt: now, updatedAt: now, version: 1 });
      }
      await connection.execute(String.raw`
        UPDATE human_friend_invitations SET recipient_user_id=?,status='accepted',accepted_at=?,version=version+1
        WHERE invitation_id=? AND status='pending' AND version=?
      `, [actor.user_id, sqlDate(now), invitationId, expectedVersion]);
      await this.#audit(connection, actor.user_id, "human.friend-invitation.accept", "human_friend_invitation", invitationId, "success", { friendshipId: friendship.friendshipId }, now);
      return { invitation: mapFriendInvitation({ ...invitation, recipient_user_id: actor.user_id, status: "accepted", accepted_at: sqlDate(now), version: Number(invitation.version) + 1 }), friendship };
    });
  }

  async rejectFriendInvitationForCredential(credentialId: string, invitationId: string, expectedVersion: number, now = new Date().toISOString()): Promise<FriendInvitation> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const invitation = await this.#incomingFriendInvitationForUpdate(connection, actor, invitationId, expectedVersion, now);
      await connection.execute("UPDATE human_friend_invitations SET recipient_user_id=?,status='rejected',rejected_at=?,version=version+1 WHERE invitation_id=? AND status='pending' AND version=?", [actor.user_id, sqlDate(now), invitationId, expectedVersion]);
      await this.#audit(connection, actor.user_id, "human.friend-invitation.reject", "human_friend_invitation", invitationId, "success", {}, now);
      return mapFriendInvitation({ ...invitation, recipient_user_id: actor.user_id, status: "rejected", rejected_at: sqlDate(now), version: Number(invitation.version) + 1 });
    });
  }

  async revokeFriendInvitationForCredential(credentialId: string, invitationId: string, expectedVersion: number, now = new Date().toISOString()): Promise<FriendInvitation> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<FriendInvitationRow[]>("SELECT * FROM human_friend_invitations WHERE invitation_id=? AND inviter_user_id=? FOR UPDATE", [invitationId, actor.user_id]);
      const invitation = rows[0];
      if (!invitation || invitation.status !== "pending" || Number(invitation.version) !== expectedVersion || Date.parse(toIso(invitation.expires_at)) <= Date.parse(now)) throw new MySqlPersistenceError("friend-invitation-unavailable");
      await connection.execute("UPDATE human_friend_invitations SET status='revoked',revoked_at=?,version=version+1 WHERE invitation_id=? AND inviter_user_id=? AND status='pending' AND version=?", [sqlDate(now), invitationId, actor.user_id, expectedVersion]);
      await this.#audit(connection, actor.user_id, "human.friend-invitation.revoke", "human_friend_invitation", invitationId, "success", {}, now);
      return mapFriendInvitation({ ...invitation, status: "revoked", revoked_at: sqlDate(now), version: Number(invitation.version) + 1 });
    });
  }

  async listFriendsForCredential(credentialId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<FriendSummary>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const values: (string | number | Date)[] = [actor.user_id, actor.user_id, actor.user_id];
      let cursor = "";
      if (request.after) {
        cursor = " AND (f.updated_at < ? OR (f.updated_at=? AND f.friendship_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<FriendSummaryRow[]>(String.raw`
        SELECT f.friendship_id,f.relationship_version,f.created_at,f.updated_at,
               CASE WHEN f.human_a_user_id=? THEN f.human_b_user_id ELSE f.human_a_user_id END AS friend_user_id,
               p.display_name,m.email
        FROM human_friendships f
        JOIN principals p ON p.principal_id=CASE WHEN f.human_a_user_id=? THEN f.human_b_user_id ELSE f.human_a_user_id END
        JOIN account_memberships m ON m.user_id=p.principal_id AND m.role='owner'
        WHERE (f.human_a_user_id=? OR f.human_b_user_id=?) AND f.status='active'${cursor}
        ORDER BY f.updated_at DESC,f.friendship_id DESC LIMIT ${limit}
      `, [actor.user_id, actor.user_id, actor.user_id, actor.user_id, ...values.slice(3)]);
      const items = rows.map((row) => friendSummarySchema.parse({ friendshipId: row.friendship_id, friend: { userId: row.friend_user_id, displayName: row.display_name, email: row.email }, since: toIso(row.created_at), relationshipVersion: Number(row.relationship_version) }));
      const last = rows.at(-1);
      return { items, ...(items.length === limit && last ? { nextCursor: { sortValue: toIso(last.updated_at), id: last.friendship_id } } : {}) };
    });
  }

  async listActiveFriendUserIdsForAccount(accountId: string): Promise<readonly string[]> {
    const [rows] = await this.pool.execute<(RowDataPacket & { friend_user_id: string })[]>(String.raw`
      SELECT DISTINCT CASE WHEN f.human_a_user_id=owner.user_id THEN f.human_b_user_id ELSE f.human_a_user_id END AS friend_user_id
      FROM account_memberships owner
      JOIN human_friendships f ON (f.human_a_user_id=owner.user_id OR f.human_b_user_id=owner.user_id) AND f.status='active'
      WHERE owner.account_id=? AND owner.role='owner'
      ORDER BY friend_user_id
    `, [accountId]);
    return rows.map((row) => row.friend_user_id);
  }

  async removeFriendForCredential(credentialId: string, friendshipId: string, expectedVersion: number, now = new Date().toISOString()): Promise<{ readonly friendshipId: string; readonly status: "revoked"; readonly relationshipVersion: number; readonly participantUserIds: readonly [string, string] }> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<FriendshipRow[]>("SELECT * FROM human_friendships WHERE friendship_id=? AND (human_a_user_id=? OR human_b_user_id=?) FOR UPDATE", [friendshipId, actor.user_id, actor.user_id]);
      const friendship = rows[0];
      if (!friendship || friendship.status !== "active" || Number(friendship.version) !== expectedVersion) throw new MySqlPersistenceError("friendship-not-found");
      await connection.execute("UPDATE human_friendships SET status='revoked',relationship_version=relationship_version+1,version=version+1,updated_at=?,revoked_at=? WHERE friendship_id=? AND status='active' AND version=?", [sqlDate(now), sqlDate(now), friendshipId, expectedVersion]);
      const relationshipVersion = Number(friendship.relationship_version) + 1;
      await this.#audit(connection, actor.user_id, "human.friendship.remove", "human_friendship", friendshipId, "success", { relationshipVersion }, now);
      return { friendshipId, status: "revoked", relationshipVersion, participantUserIds: [friendship.human_a_user_id, friendship.human_b_user_id] };
    });
  }

  async listAccountMembersForCredential(credentialId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<AccountMember>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const values: (string | number | Date)[] = [actor.account_id];
      let cursor = "";
      if (request.after) {
        cursor = " AND (m.joined_at < ? OR (m.joined_at=? AND m.membership_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<AccountMemberProjectionRow[]>(String.raw`
        SELECT m.*,p.display_name FROM account_memberships m JOIN principals p ON p.principal_id=m.user_id
        WHERE m.account_id=?${cursor} ORDER BY m.joined_at DESC,m.membership_id DESC LIMIT ${limit}
      `, values);
      const items = rows.map(mapAccountMember);
      const last = items.at(-1);
      return { items, ...(items.length === limit && last ? { nextCursor: { sortValue: last.joinedAt, id: last.membershipId } } : {}) };
    });
  }

  async listAccountMemberInvitationsForCredential(credentialId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<MemberInvitation>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      await connection.execute("UPDATE account_member_invitations SET status='expired',version=version+1 WHERE account_id=? AND status='pending' AND expires_at<=?", [actor.account_id, sqlDate(now)]);
      const values: (string | number | Date)[] = [actor.account_id];
      let cursor = "";
      if (request.after) {
        cursor = " AND (created_at < ? OR (created_at=? AND invitation_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<AccountMemberInvitationProjectionRow[]>(
        `SELECT invitation_id,account_id,invited_email,invited_by_user_id,role,status,version,expires_at,created_at,accepted_at,revoked_at FROM account_member_invitations WHERE account_id=?${cursor} ORDER BY created_at DESC,invitation_id DESC LIMIT ${limit}`,
        values,
      );
      const items = rows.map(mapAccountMemberInvitation);
      const last = items.at(-1);
      return { items, ...(items.length === limit && last ? { nextCursor: { sortValue: last.createdAt, id: last.invitationId } } : {}) };
    });
  }

  async createAccountMemberInvitationForCredential(credentialId: string, input: { readonly email: string; readonly role: "admin" | "member"; readonly expiresAt: string }, now = new Date().toISOString()): Promise<{ readonly invitation: MemberInvitation; readonly invitationToken: string }> {
    const email = input.email.trim().toLowerCase();
    const expiresAt = new Date(input.expiresAt).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(now) || Date.parse(expiresAt) > Date.parse(now) + 30 * 24 * 60 * 60 * 1000) throw new MySqlPersistenceError("account-invitation-expiry-denied");
    try {
      return await this.#transaction(async (connection) => {
        const actor = await this.#accountActor(connection, credentialId, now);
        if (actor.role === "member" || (actor.role === "admin" && input.role !== "member")) throw new MySqlPersistenceError("account-member-authority-denied");
        await connection.execute("UPDATE account_member_invitations SET status='expired',version=version+1 WHERE account_id=? AND status='pending' AND expires_at<=?", [actor.account_id, sqlDate(now)]);
        const [members] = await connection.execute<IdentifierRow[]>("SELECT user_id AS instance_id FROM account_memberships WHERE account_id=? AND email=? LIMIT 1 FOR UPDATE", [actor.account_id, email]);
        if (members.length !== 0) throw new MySqlPersistenceError("account-member-already-exists");
        const invitationId = `account-invitation:${randomUUID()}`;
        const invitationToken = randomBytes(32).toString("base64url");
        await connection.execute(String.raw`
          INSERT INTO account_member_invitations(
            invitation_id,account_id,invited_email,invited_email_digest,invited_by_user_id,role,status,token_digest,version,expires_at,created_at
          ) VALUES (?,?,?,?,?,?,'pending',?,1,?,?)
        `, [invitationId, actor.account_id, email, hashCredential(email), actor.user_id, input.role, hashCredential(invitationToken), sqlDate(expiresAt), sqlDate(now)]);
        const invitation = memberInvitationSchema.parse({ invitationId, accountId: actor.account_id, invitedEmail: email, role: input.role, invitedByUserId: actor.user_id, status: "pending", createdAt: now, expiresAt, version: 1 });
        await this.#audit(connection, actor.user_id, "account.invitation.create", "account_member_invitation", invitationId, "success", { role: input.role }, now);
        return { invitation, invitationToken };
      });
    } catch (error) {
      if (isDuplicateEntry(error)) throw new MySqlPersistenceError("account-invitation-already-pending");
      throw error;
    }
  }

  async revokeAccountMemberInvitationForCredential(credentialId: string, invitationId: string, now = new Date().toISOString()): Promise<MemberInvitation> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<AccountMemberInvitationProjectionRow[]>("SELECT invitation_id,account_id,invited_email,invited_by_user_id,role,status,version,expires_at,created_at,accepted_at,revoked_at FROM account_member_invitations WHERE account_id=? AND invitation_id=? FOR UPDATE", [actor.account_id, invitationId]);
      const invitation = rows[0];
      if (!invitation || invitation.status !== "pending" || Date.parse(toIso(invitation.expires_at)) <= Date.parse(now)) throw new MySqlPersistenceError("account-invitation-not-found");
      if (actor.role === "member" || (actor.role === "admin" && invitation.role !== "member")) throw new MySqlPersistenceError("account-member-authority-denied");
      await connection.execute("UPDATE account_member_invitations SET status='revoked',revoked_at=?,version=version+1 WHERE account_id=? AND invitation_id=? AND status='pending'", [sqlDate(now), actor.account_id, invitationId]);
      await this.#audit(connection, actor.user_id, "account.invitation.revoke", "account_member_invitation", invitationId, "success", {}, now);
      return mapAccountMemberInvitation({ ...invitation, status: "revoked", revoked_at: sqlDate(now), version: Number(invitation.version) + 1 });
    });
  }

  async updateAccountMemberRoleForCredential(credentialId: string, targetUserId: string, input: { readonly role: MemberRole; readonly expectedVersion: number }, now = new Date().toISOString()): Promise<AccountMember> {
    const nextRole = memberRoleSchema.parse(input.role);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<AccountMemberProjectionRow[]>(String.raw`
        SELECT m.*,p.display_name FROM account_memberships m JOIN principals p ON p.principal_id=m.user_id
        WHERE m.account_id=? AND m.user_id=? FOR UPDATE
      `, [actor.account_id, targetUserId]);
      const target = rows[0];
      if (!target || Number(target.version) !== input.expectedVersion) throw new MySqlPersistenceError("account-member-not-found");
      const actorCanUpdate = actor.role === "owner" || (actor.role === "admin" && target.role === "member" && nextRole !== "owner");
      if (!actorCanUpdate) throw new MySqlPersistenceError("account-member-authority-denied");
      if (target.role === "owner" && nextRole !== "owner") {
        const [owners] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM account_memberships WHERE account_id=? AND role='owner' FOR UPDATE", [actor.account_id]);
        if (Number(owners[0]?.count ?? 0) <= 1) throw new MySqlPersistenceError("account-last-owner-required");
      }
      const [result] = await connection.execute<ResultHeader>("UPDATE account_memberships SET role=?,version=version+1,updated_at=? WHERE account_id=? AND user_id=? AND version=?", [nextRole, sqlDate(now), actor.account_id, targetUserId, input.expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-member-not-found");
      await this.#audit(connection, actor.user_id, "account.member.role.update", "account_member", targetUserId, "success", { from: target.role, to: nextRole }, now);
      return mapAccountMember({ ...target, role: nextRole, version: Number(target.version) + 1, updated_at: sqlDate(now) });
    });
  }

  async planAccountMemberRemovalForCredential(credentialId: string, targetUserId: string, now = new Date().toISOString()): Promise<MemberRemovalImpact> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const target = await this.#removableMember(connection, actor, targetUserId);
      const snapshot = await this.#memberRemovalSnapshot(connection, actor.account_id, targetUserId);
      const planId = `member-removal:${randomUUID()}`;
      const expiresAt = new Date(Date.parse(now) + 10 * 60 * 1000).toISOString();
      const impact = memberRemovalImpactSchema.parse({
        planId, accountId: actor.account_id, userId: targetUserId, expectedMemberVersion: Number(target.version),
        ...snapshot, expiresAt,
      });
      await connection.execute(String.raw`
        INSERT INTO account_member_removal_plans(plan_id,account_id,target_user_id,actor_user_id,expected_member_version,impact_digest,expires_at,created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `, [planId, actor.account_id, targetUserId, actor.user_id, Number(target.version), memberRemovalFingerprint(snapshot), sqlDate(expiresAt), sqlDate(now)]);
      await this.#audit(connection, actor.user_id, "account.member.removal.plan", "account_member", targetUserId, "success", removalAuditCounts(snapshot), now);
      return impact;
    });
  }

  async removeAccountMemberForCredential(credentialId: string, targetUserId: string, inputValue: ConfirmMemberRemovalRequest, now = new Date().toISOString()): Promise<{ readonly userId: string; readonly status: "removed" }> {
    const input = confirmMemberRemovalRequestSchema.parse(inputValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [plans] = await connection.execute<MemberRemovalPlanRow[]>(String.raw`
        SELECT plan_id,account_id,target_user_id,actor_user_id,expected_member_version,impact_digest,expires_at,consumed_at
        FROM account_member_removal_plans
        WHERE plan_id=? AND account_id=? AND target_user_id=? AND actor_user_id=? FOR UPDATE
      `, [input.planId, actor.account_id, targetUserId, actor.user_id]);
      const plan = plans[0];
      if (!plan || plan.consumed_at || Date.parse(toIso(plan.expires_at)) <= Date.parse(now) || Number(plan.expected_member_version) !== input.expectedMemberVersion) throw new MySqlPersistenceError("member-removal-plan-unavailable");
      const target = await this.#removableMember(connection, actor, targetUserId);
      if (Number(target.version) !== input.expectedMemberVersion) throw new MySqlPersistenceError("member-removal-plan-stale");
      const snapshot = await this.#memberRemovalSnapshot(connection, actor.account_id, targetUserId);
      if (memberRemovalFingerprint(snapshot) !== plan.impact_digest) throw new MySqlPersistenceError("member-removal-plan-stale");
      validateRemovalDispositions(snapshot, input);
      const transferUserIds = [...new Set([
        ...input.agentDispositions.flatMap((item) => item.action === "transfer" ? [item.transferToUserId] : []),
        ...input.runtimeDispositions.flatMap((item) => item.action === "transfer" ? [item.transferToUserId] : []),
      ])];
      if (transferUserIds.includes(targetUserId)) throw new MySqlPersistenceError("member-removal-transfer-denied");
      if (transferUserIds.length > 0) {
        const placeholders = transferUserIds.map(() => "?").join(",");
        const [transferMembers] = await connection.execute<TransferMemberRow[]>(`SELECT user_id FROM account_memberships WHERE account_id=? AND user_id IN (${placeholders}) FOR UPDATE`, [actor.account_id, ...transferUserIds]);
        if (new Set(transferMembers.map((member) => member.user_id)).size !== transferUserIds.length) throw new MySqlPersistenceError("member-removal-transfer-denied");
      }
      for (const disposition of input.agentDispositions) {
        if (disposition.action === "transfer") {
          await connection.execute("UPDATE account_agents SET owner_user_id=?,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND owner_user_id=?", [disposition.transferToUserId, sqlDate(now), actor.account_id, disposition.agentId, targetUserId]);
        } else {
          await connection.execute("UPDATE account_agents SET owner_user_id=?,archived_at=?,archived_by_user_id=?,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND owner_user_id=?", [actor.user_id, sqlDate(now), actor.user_id, sqlDate(now), actor.account_id, disposition.agentId, targetUserId]);
        }
      }
      for (const disposition of input.runtimeDispositions) {
        if (disposition.action === "transfer") {
          await connection.execute("UPDATE account_runtimes SET owner_user_id=?,version=version+1,updated_at=? WHERE account_id=? AND runtime_id=? AND owner_user_id=?", [disposition.transferToUserId, sqlDate(now), actor.account_id, disposition.runtimeId, targetUserId]);
        } else {
          await connection.execute("UPDATE account_agents SET runtime_id=NULL,version=version+1,updated_at=? WHERE account_id=? AND runtime_id=?", [sqlDate(now), actor.account_id, disposition.runtimeId]);
          await connection.execute("DELETE b FROM agent_skill_bindings b JOIN account_skills s ON s.account_id=b.account_id AND s.skill_id=b.skill_id WHERE s.account_id=? AND s.runtime_id=?", [actor.account_id, disposition.runtimeId]);
          await connection.execute("DELETE b FROM agent_disabled_runtime_skills b JOIN account_skills s ON s.account_id=b.account_id AND s.skill_id=b.skill_id WHERE s.account_id=? AND s.runtime_id=?", [actor.account_id, disposition.runtimeId]);
          await connection.execute("DELETE FROM account_skills WHERE account_id=? AND runtime_id=?", [actor.account_id, disposition.runtimeId]);
          await connection.execute("DELETE FROM account_runtimes WHERE account_id=? AND runtime_id=? AND owner_user_id=?", [actor.account_id, disposition.runtimeId, targetUserId]);
        }
      }
      await connection.execute("DELETE FROM agent_invocation_targets WHERE account_id=? AND target_user_id=?", [actor.account_id, targetUserId]);
      await connection.execute("UPDATE account_member_invitations SET status='revoked',revoked_at=?,version=version+1 WHERE account_id=? AND invited_by_user_id=? AND status='pending'", [sqlDate(now), actor.account_id, targetUserId]);
      await connection.execute(String.raw`
        UPDATE account_sessions s JOIN credentials c ON c.credential_id=s.credential_id JOIN principals p ON p.principal_id=c.principal_id
        SET s.revoked_at=? WHERE s.account_id=? AND (c.principal_id=? OR p.owner_principal_id=?) AND s.revoked_at IS NULL
      `, [sqlDate(now), actor.account_id, targetUserId, targetUserId]);
      await connection.execute(String.raw`
        UPDATE credentials c JOIN principals p ON p.principal_id=c.principal_id
        SET c.revoked_at=? WHERE (c.principal_id=? OR p.owner_principal_id=?) AND c.revoked_at IS NULL
      `, [sqlDate(now), targetUserId, targetUserId]);
      await connection.execute("UPDATE account_member_removal_plans SET consumed_at=? WHERE plan_id=?", [sqlDate(now), input.planId]);
      const [removed] = await connection.execute<ResultHeader>("DELETE FROM account_memberships WHERE account_id=? AND user_id=? AND version=?", [actor.account_id, targetUserId, input.expectedMemberVersion]);
      if (removed.affectedRows !== 1) throw new MySqlPersistenceError("member-removal-plan-stale");
      await this.#audit(connection, actor.user_id, "account.member.remove", "account_member", targetUserId, "success", removalAuditCounts(snapshot), now);
      return { userId: targetUserId, status: "removed" };
    });
  }

  async listAccountRuntimesForCredential(credentialId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<AgentRuntime>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const values: (string | number | Date)[] = [actor.account_id, actor.user_id];
      let where = " AND owner_user_id=?";
      if (request.after) {
        where += " AND (updated_at < ? OR (updated_at=? AND runtime_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<AccountRuntimeRow[]>(`SELECT * FROM account_runtimes WHERE account_id=?${where} ORDER BY updated_at DESC,runtime_id DESC LIMIT ${limit}`, values);
      const items = rows.map(mapAccountRuntime);
      const last = items.at(-1);
      return { items, ...(items.length === limit && last ? { nextCursor: { sortValue: last.updatedAt, id: last.runtimeId } } : {}) };
    });
  }

  async getAccountRuntimeForCredential(credentialId: string, runtimeId: string, now = new Date().toISOString()): Promise<AgentRuntime> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [actor.account_id, runtimeId]);
      const runtime = rows[0];
      if (!runtime || runtime.owner_user_id !== actor.user_id) throw new MySqlPersistenceError("account-runtime-not-found");
      return mapAccountRuntime(runtime);
    });
  }

  async assertAccountRuntimeConnectionForCredential(credentialId: string, runtimeId: string, now = new Date().toISOString()): Promise<AgentRuntime> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [rows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [actor.account_id, runtimeId]);
      const row = rows[0];
      if (!row || (actor.role === "member" && row.owner_user_id !== actor.user_id)) throw new MySqlPersistenceError("account-runtime-not-found");
      return mapAccountRuntime(row);
    });
  }

  async createAccountRuntimeForCredential(credentialId: string, input: { readonly provider: string; readonly adapterId: string; readonly name: string; readonly visibility: "private"; readonly health: RuntimeHealth; readonly capabilities: RuntimeCapabilities }, now = new Date().toISOString()): Promise<AgentRuntime> {
    const health = runtimeHealthSchema.parse(input.health);
    const capabilities = runtimeCapabilitiesSchema.parse(input.capabilities);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const runtime = runtimeSchema.parse({
        runtimeId: `runtime:${randomUUID()}`, accountId: actor.account_id, ownerUserId: actor.user_id,
        provider: input.provider, adapterId: input.adapterId, name: input.name, visibility: input.visibility, health, capabilities,
        lastCheckedAt: now, createdAt: now, updatedAt: now, version: 1,
      });
      await connection.execute(String.raw`
        INSERT INTO account_runtimes(runtime_id,account_id,owner_user_id,provider,adapter_id,name,visibility,health,capabilities,version,last_checked_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)
      `, [runtime.runtimeId, runtime.accountId, runtime.ownerUserId, runtime.provider, runtime.adapterId, runtime.name, runtime.visibility, runtime.health, JSON.stringify(runtime.capabilities), sqlDate(now), sqlDate(now), sqlDate(now)]);
      await this.#audit(connection, actor.user_id, "account.runtime.create", "account_runtime", runtime.runtimeId, "success", { provider: runtime.provider, health: runtime.health, visibility: runtime.visibility }, now);
      return runtime;
    });
  }

  async updateAccountRuntimeForCredential(credentialId: string, runtimeId: string, input: { readonly name: string; readonly visibility: "private"; readonly expectedVersion: number }, now = new Date().toISOString()): Promise<AgentRuntime> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const runtime = await this.#runtimeForManagement(connection, actor, runtimeId);
      if (Number(runtime.version) !== input.expectedVersion) throw new MySqlPersistenceError("account-runtime-version-conflict");
      const [result] = await connection.execute<ResultHeader>("UPDATE account_runtimes SET name=?,visibility=?,version=version+1,updated_at=? WHERE account_id=? AND runtime_id=? AND version=?", [input.name, input.visibility, sqlDate(now), actor.account_id, runtimeId, input.expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-runtime-version-conflict");
      await this.#audit(connection, actor.user_id, "account.runtime.update", "account_runtime", runtimeId, "success", { visibility: input.visibility }, now);
      return mapAccountRuntime({ ...runtime, name: input.name, visibility: input.visibility, version: input.expectedVersion + 1, updated_at: sqlDate(now) });
    });
  }

  async observeAccountRuntimeForCredential(credentialId: string, runtimeId: string, input: { readonly health: RuntimeHealth; readonly capabilities: RuntimeCapabilities; readonly runtimeSkills?: readonly RuntimeSkillSummary[]; readonly expectedVersion: number }, now = new Date().toISOString()): Promise<AgentRuntime> {
    const health = runtimeHealthSchema.parse(input.health);
    const capabilities = runtimeCapabilitiesSchema.parse(input.capabilities);
    const runtimeSkills = input.runtimeSkills === undefined ? undefined : input.runtimeSkills.map((skill) => runtimeSkillSummarySchema.parse(skill));
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const runtime = await this.#runtimeForManagement(connection, actor, runtimeId);
      if (Number(runtime.version) !== input.expectedVersion) throw new MySqlPersistenceError("account-runtime-version-conflict");
      const [result] = await connection.execute<ResultHeader>("UPDATE account_runtimes SET health=?,capabilities=?,last_checked_at=?,version=version+1,updated_at=? WHERE account_id=? AND runtime_id=? AND version=?", [health, JSON.stringify(capabilities), sqlDate(now), sqlDate(now), actor.account_id, runtimeId, input.expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-runtime-version-conflict");
      if (runtimeSkills) {
        const staleAt = new Date(Date.parse(now) - 46_000).toISOString();
        await connection.execute("UPDATE account_skills SET updated_at=? WHERE account_id=? AND runtime_id=? AND origin='runtime'", [sqlDate(staleAt), actor.account_id, runtimeId]);
        for (const skill of runtimeSkills) {
          const skillId = runtimeSkillPersistenceId(runtimeId, skill.runtimeSkillId);
          await connection.execute(String.raw`
            INSERT INTO account_skills(skill_id,account_id,runtime_id,name,description,origin,version,created_at,updated_at)
            VALUES (?,?,?,?,?,'runtime',1,?,?)
            ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),version=version+1,updated_at=VALUES(updated_at)
          `, [skillId, actor.account_id, runtimeId, skill.name, skill.description, sqlDate(now), sqlDate(now)]);
        }
      }
      return mapAccountRuntime({ ...runtime, health, capabilities: JSON.stringify(capabilities), last_checked_at: sqlDate(now), version: input.expectedVersion + 1, updated_at: sqlDate(now) });
    });
  }

  async refreshAccountRuntimeForCredential(credentialId: string, runtimeId: string, expectedVersion: number, now = new Date().toISOString()): Promise<AgentRuntime> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const runtime = await this.#runtimeForManagement(connection, actor, runtimeId);
      if (Number(runtime.version) !== expectedVersion) throw new MySqlPersistenceError("account-runtime-version-conflict");
      const [result] = await connection.execute<ResultHeader>("UPDATE account_runtimes SET health='checking',version=version+1,updated_at=? WHERE account_id=? AND runtime_id=? AND version=?", [sqlDate(now), actor.account_id, runtimeId, expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-runtime-version-conflict");
      return mapAccountRuntime({ ...runtime, health: "checking", version: expectedVersion + 1, updated_at: sqlDate(now) });
    });
  }

  async planAccountRuntimeDeletionForCredential(credentialId: string, runtimeId: string, now = new Date().toISOString()): Promise<RuntimeDeletionImpact> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const runtime = await this.#runtimeForManagement(connection, actor, runtimeId);
      const snapshot = await this.#runtimeDeletionSnapshot(connection, actor.account_id, runtimeId);
      const planId = `runtime-deletion:${randomUUID()}`;
      const expiresAt = new Date(Date.parse(now) + 10 * 60 * 1000).toISOString();
      const impact = runtimeDeletionImpactSchema.parse({ planId, accountId: actor.account_id, runtimeId, expectedRuntimeVersion: Number(runtime.version), boundAgentIds: snapshot.boundAgentIds, activeAgentIds: snapshot.activeAgentIds, expiresAt });
      await connection.execute(String.raw`
        INSERT INTO account_runtime_deletion_plans(plan_id,account_id,runtime_id,actor_user_id,expected_runtime_version,impact_digest,impact_snapshot,expires_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `, [planId, actor.account_id, runtimeId, actor.user_id, Number(runtime.version), runtimeDeletionFingerprint(snapshot), JSON.stringify(snapshot), sqlDate(expiresAt), sqlDate(now)]);
      await this.#audit(connection, actor.user_id, "account.runtime.deletion.plan", "account_runtime", runtimeId, "success", { boundAgents: snapshot.boundAgentIds.length, activeAgents: snapshot.activeAgentIds.length }, now);
      return impact;
    });
  }

  async prepareAccountRuntimeDeletionForCredential(credentialId: string, runtimeId: string, inputValue: ConfirmRuntimeDeletionRequest, now = new Date().toISOString()): Promise<AccountRuntimeDeletionExecutionPlan> {
    const input = confirmRuntimeDeletionRequestSchema.parse(inputValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [plans] = await connection.execute<RuntimeDeletionPlanRow[]>(String.raw`
        SELECT plan_id,account_id,runtime_id,actor_user_id,expected_runtime_version,impact_digest,impact_snapshot,expires_at,consumed_at
        FROM account_runtime_deletion_plans WHERE plan_id=? AND account_id=? AND runtime_id=? AND actor_user_id=? FOR UPDATE
      `, [input.planId, actor.account_id, runtimeId, actor.user_id]);
      const plan = plans[0];
      if (!plan || plan.consumed_at || Date.parse(toIso(plan.expires_at)) <= Date.parse(now) || Number(plan.expected_runtime_version) !== input.expectedRuntimeVersion) throw new MySqlPersistenceError("runtime-deletion-plan-unavailable");
      const runtime = await this.#runtimeForManagement(connection, actor, runtimeId);
      if (Number(runtime.version) !== input.expectedRuntimeVersion) throw new MySqlPersistenceError("runtime-deletion-plan-stale");
      const planned = parseRuntimeDeletionSnapshot(plan.impact_snapshot);
      const current = await this.#runtimeDeletionSnapshot(connection, actor.account_id, runtimeId);
      if (runtimeDeletionFingerprint(planned) !== plan.impact_digest || runtimeDeletionFingerprint(current) !== plan.impact_digest) throw new MySqlPersistenceError("runtime-deletion-plan-stale");
      return { accountId: actor.account_id, runtimeId, activeTasks: current.activeTasks };
    });
  }

  async settleAccountRuntimeDeletionTasksForCredential(credentialId: string, runtimeId: string, planId: string, taskIds: readonly string[], now = new Date().toISOString()): Promise<void> {
    if (taskIds.length > 500 || new Set(taskIds).size !== taskIds.length) throw new MySqlPersistenceError("runtime-deletion-task-set-invalid");
    await this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      await this.#runtimeForManagement(connection, actor, runtimeId);
      const [plans] = await connection.execute<RuntimeDeletionPlanRow[]>("SELECT * FROM account_runtime_deletion_plans WHERE plan_id=? AND account_id=? AND runtime_id=? AND actor_user_id=? FOR UPDATE", [planId, actor.account_id, runtimeId, actor.user_id]);
      const plan = plans[0];
      if (!plan || plan.consumed_at) throw new MySqlPersistenceError("runtime-deletion-plan-unavailable");
      const planned = parseRuntimeDeletionSnapshot(plan.impact_snapshot);
      const plannedTaskIds = new Set(planned.activeTasks.map((task) => task.taskId));
      if (taskIds.some((taskId) => !plannedTaskIds.has(taskId))) throw new MySqlPersistenceError("runtime-deletion-plan-stale");
      if (taskIds.length === 0) return;
      const placeholders = taskIds.map(() => "?").join(",");
      await connection.execute(`UPDATE account_agent_a2a_tasks SET state='canceled',updated_at=? WHERE account_id=? AND task_id IN (${placeholders}) AND state IN ('submitted','working','input-required')`, [sqlDate(now), actor.account_id, ...taskIds]);
      await connection.execute(`UPDATE task_metadata t JOIN account_agents a ON a.agent_id=t.agent_id SET t.state='canceled',t.updated_at=? WHERE a.account_id=? AND a.runtime_id=? AND t.task_id IN (${placeholders}) AND t.state IN ('submitted','working','input-required')`, [sqlDate(now), actor.account_id, runtimeId, ...taskIds]);
    });
  }

  async deleteAccountRuntimeForCredential(credentialId: string, runtimeId: string, inputValue: ConfirmRuntimeDeletionRequest, now = new Date().toISOString()): Promise<{ readonly runtimeId: string; readonly status: "deleted"; readonly unboundAgentIds: readonly string[] }> {
    const input = confirmRuntimeDeletionRequestSchema.parse(inputValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const [plans] = await connection.execute<RuntimeDeletionPlanRow[]>(String.raw`
        SELECT plan_id,account_id,runtime_id,actor_user_id,expected_runtime_version,impact_digest,impact_snapshot,expires_at,consumed_at
        FROM account_runtime_deletion_plans WHERE plan_id=? AND account_id=? AND runtime_id=? AND actor_user_id=? FOR UPDATE
      `, [input.planId, actor.account_id, runtimeId, actor.user_id]);
      const plan = plans[0];
      if (!plan || plan.consumed_at || Date.parse(toIso(plan.expires_at)) <= Date.parse(now) || Number(plan.expected_runtime_version) !== input.expectedRuntimeVersion) throw new MySqlPersistenceError("runtime-deletion-plan-unavailable");
      const runtime = await this.#runtimeForManagement(connection, actor, runtimeId);
      if (Number(runtime.version) !== input.expectedRuntimeVersion) throw new MySqlPersistenceError("runtime-deletion-plan-stale");
      const planned = parseRuntimeDeletionSnapshot(plan.impact_snapshot);
      const snapshot = await this.#runtimeDeletionSnapshot(connection, actor.account_id, runtimeId);
      if (runtimeDeletionFingerprint(planned) !== plan.impact_digest || !sameIdentifiers(snapshot.boundAgentIds, planned.boundAgentIds) || snapshot.activeTasks.length !== 0) throw new MySqlPersistenceError("runtime-deletion-plan-stale");
      await connection.execute("UPDATE account_agents SET runtime_id=NULL,version=version+1,updated_at=? WHERE account_id=? AND runtime_id=?", [sqlDate(now), actor.account_id, runtimeId]);
      await connection.execute("DELETE b FROM agent_skill_bindings b JOIN account_skills s ON s.account_id=b.account_id AND s.skill_id=b.skill_id WHERE s.account_id=? AND s.runtime_id=?", [actor.account_id, runtimeId]);
      await connection.execute("DELETE b FROM agent_disabled_runtime_skills b JOIN account_skills s ON s.account_id=b.account_id AND s.skill_id=b.skill_id WHERE s.account_id=? AND s.runtime_id=?", [actor.account_id, runtimeId]);
      await connection.execute("DELETE FROM account_skills WHERE account_id=? AND runtime_id=?", [actor.account_id, runtimeId]);
      const [deleted] = await connection.execute<ResultHeader>("DELETE FROM account_runtimes WHERE account_id=? AND runtime_id=? AND version=?", [actor.account_id, runtimeId, input.expectedRuntimeVersion]);
      if (deleted.affectedRows !== 1) throw new MySqlPersistenceError("runtime-deletion-plan-stale");
      await connection.execute("UPDATE account_runtime_deletion_plans SET consumed_at=? WHERE plan_id=?", [sqlDate(now), input.planId]);
      await this.#audit(connection, actor.user_id, "account.runtime.delete", "account_runtime", runtimeId, "success", { unboundAgents: snapshot.boundAgentIds.length }, now);
      return { runtimeId, status: "deleted", unboundAgentIds: snapshot.boundAgentIds };
    });
  }


  async createAccountAgentForCredential(credentialId: string, inputValue: unknown, now = new Date().toISOString()): Promise<Agent> {
    const input = parseAccountAgentMutation(inputValue, false);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      if (input.runtimeId) await this.#assertRuntimeBind(connection, actor, input.runtimeId);
      const agent = agentSchema.parse({
        agentId: `agent:${randomUUID()}`, accountId: actor.account_id, ownerUserId: actor.user_id,
        ...input, createdAt: now, updatedAt: now, version: 1,
      });
      await connection.execute(String.raw`
        INSERT INTO account_agents(agent_id,account_id,owner_user_id,runtime_id,name,description,avatar_url,permission_mode,configuration,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
      `, [agent.agentId, agent.accountId, agent.ownerUserId, agent.runtimeId ?? null, agent.name, agent.description, agent.avatarUrl ?? null, agent.permissionMode, JSON.stringify(agent.configuration), sqlDate(now), sqlDate(now)]);
      await this.#audit(connection, actor.user_id, "account.agent.create", "account_agent", agent.agentId, "success", { permissionMode: agent.permissionMode, runtimeBound: Boolean(agent.runtimeId) }, now);
      return agent;
    });
  }

  async getAccountAgentForCredential(credentialId: string, agentId: string, now = new Date().toISOString()): Promise<Agent> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const agent = await this.#loadAccountAgent(connection, actor.account_id, agentId);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!agent || (!canManageAgent(principal, agent) && !canInvokeAgent(principal, agent).allowed)) throw new MySqlPersistenceError("account-agent-not-found");
      return agent;
    });
  }

  async getAccountAgentDetailForCredential(credentialId: string, agentId: string, now = new Date().toISOString()): Promise<AgentDetailProjection> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const agent = await this.#loadAccountAgent(connection, actor.account_id, agentId);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      const manageable = agent ? canManageAgent(principal, agent) : false;
      const invocation = agent ? canInvokeAgent(principal, agent) : { allowed: false as const, code: "agent-not-found" };
      if (!agent || (!manageable && !invocation.allowed)) throw new MySqlPersistenceError("account-agent-not-found");
      let runtime: AgentRuntime | undefined;
      if (agent.runtimeId) {
        const [runtimeRows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [actor.account_id, agent.runtimeId]);
        if (runtimeRows[0]) runtime = mapAccountRuntime(runtimeRows[0]);
      }
      const { configuration } = agent;
      return agentDetailProjectionSchema.parse({
        identity: {
          agentId: agent.agentId, accountId: agent.accountId, ownerUserId: agent.ownerUserId, name: agent.name, description: agent.description,
          ...(agent.avatarUrl ? { avatarUrl: agent.avatarUrl } : {}), ...(agent.runtimeId ? { runtimeId: agent.runtimeId } : {}), ...(agent.archivedAt ? { archivedAt: agent.archivedAt } : {}),
          createdAt: agent.createdAt, updatedAt: agent.updatedAt, version: agent.version,
        },
        access: { canManage: manageable, canInvoke: invocation.allowed, effectiveAccess: effectiveAccessScope(principal, agent), permissionMode: agent.permissionMode },
        configuration: {
          ...(manageable ? { instructions: configuration.instructions, skillIds: configuration.skillIds, disabledRuntimeSkillIds: configuration.disabledRuntimeSkillIds } : {}),
          ...(configuration.model ? { model: configuration.model } : {}), ...(configuration.thinkingLevel ? { thinkingLevel: configuration.thinkingLevel } : {}), ...(configuration.serviceTier ? { serviceTier: configuration.serviceTier } : {}),
          maxConcurrentTasks: configuration.maxConcurrentTasks,
          environment: { configuredCount: configuration.environmentVariableNames.length, redacted: true },
          customArguments: { configuredCount: configuration.customArguments.length, redacted: true },
          runtimeConfiguration: { configured: Object.keys(configuration.runtimeConfiguration).length > 0, redacted: true },
          mcpConnections: manageable ? configuration.mcpConnections : [], integrations: manageable ? configuration.integrations : [],
        },
        ...(runtime ? { runtime } : {}), sections: manageable ? ["overview", "activity", "capabilities", "settings"] : ["overview", "activity"], etag: agentEtag(agent.version),
      });
    });
  }

  async listAccountAgentSkillsForCredential(credentialId: string, agentId: string, now = new Date().toISOString()): Promise<AgentSkillCatalog> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const agent = await this.#loadAccountAgent(connection, actor.account_id, agentId);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!agent || !canManageAgent(principal, agent)) throw new MySqlPersistenceError("account-agent-not-found");
      let runtime: AgentRuntime | undefined;
      if (agent.runtimeId) {
        const [runtimeRows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [actor.account_id, agent.runtimeId]);
        if (runtimeRows[0]) runtime = mapAccountRuntime(runtimeRows[0]);
      }
      const values = agent.runtimeId ? [actor.account_id, agent.runtimeId] : [actor.account_id];
      const runtimeFilter = agent.runtimeId ? " AND (origin<>'runtime' OR runtime_id=?)" : " AND origin<>'runtime'";
      const [skillRows] = await connection.execute<AccountSkillRow[]>(`SELECT skill_id,account_id,runtime_id,name,description,origin,version,created_at,updated_at FROM account_skills WHERE account_id=?${runtimeFilter} ORDER BY name ASC,skill_id ASC LIMIT 500`, values);
      const freshnessCutoff = Date.parse(now) - 45_000;
      const runtimeReady = Boolean(runtime?.lastCheckedAt && runtime.health === "ready" && Date.parse(runtime.lastCheckedAt) >= freshnessCutoff);
      const runtimeState = !agent.runtimeId || !runtime ? "unbound" : !runtime.capabilities.supportsSkills ? "unsupported" : runtimeReady ? "ready" : "offline";
      return agentSkillCatalogSchema.parse({
        agentId, agentVersion: agent.version, runtimeDiscovery: { state: runtimeState, retryable: runtimeState === "offline" },
        skills: skillRows.map((row) => {
          const skill = mapAccountSkill(row);
          const runtimeSkill = skill.origin === "runtime";
          const recentlyObserved = Date.parse(skill.updatedAt) >= freshnessCutoff;
          return { skill, attached: runtimeSkill || agent.configuration.skillIds.includes(skill.skillId), enabled: runtimeSkill ? !agent.configuration.disabledRuntimeSkillIds.includes(skill.skillId) : agent.configuration.skillIds.includes(skill.skillId), available: !runtimeSkill || (runtimeReady && recentlyObserved) };
        }),
      });
    });
  }

  async mutateAccountAgentSkillForCredential(credentialId: string, agentId: string, skillId: string, inputValue: AgentSkillMutation | unknown, now = new Date().toISOString()): Promise<Agent> {
    const input = agentSkillMutationSchema.parse(inputValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const current = await this.#loadAccountAgent(connection, actor.account_id, agentId, true);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!current || current.archivedAt || !canManageAgent(principal, current)) throw new MySqlPersistenceError("account-agent-not-found");
      if (current.version !== input.expectedVersion) throw new MySqlPersistenceError("account-agent-version-conflict");
      const [skillRows] = await connection.execute<AccountSkillRow[]>("SELECT skill_id,account_id,runtime_id,name,description,origin,version,created_at,updated_at FROM account_skills WHERE account_id=? AND skill_id=?", [actor.account_id, skillId]);
      const skill = skillRows[0] ? mapAccountSkill(skillRows[0]) : undefined;
      if (!skill) throw new MySqlPersistenceError("account-skill-not-found");
      const runtimeAction = input.action === "enable" || input.action === "disable";
      if (runtimeAction !== (skill.origin === "runtime") || (skill.origin === "runtime" && skill.runtimeId !== current.runtimeId)) throw new MySqlPersistenceError("account-skill-action-denied");
      const attached = new Set(current.configuration.skillIds);
      const disabled = new Set(current.configuration.disabledRuntimeSkillIds);
      if (input.action === "attach") attached.add(skillId);
      if (input.action === "detach") attached.delete(skillId);
      if (input.action === "enable") disabled.delete(skillId);
      if (input.action === "disable") disabled.add(skillId);
      const configuration = { ...current.configuration, skillIds: [...attached].sort(), disabledRuntimeSkillIds: [...disabled].sort() };
      const agent = agentSchema.parse({ ...current, configuration, version: current.version + 1, updatedAt: now });
      const [result] = await connection.execute<ResultHeader>("UPDATE account_agents SET configuration=?,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND version=?", [JSON.stringify(configuration), sqlDate(now), actor.account_id, agentId, current.version]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-version-conflict");
      const relation = runtimeAction ? "agent_disabled_runtime_skills" : "agent_skill_bindings";
      const shouldExist = input.action === "attach" || input.action === "disable";
      if (shouldExist) await connection.execute(`INSERT IGNORE INTO ${relation}(account_id,agent_id,skill_id,created_at) VALUES (?,?,?,?)`, [actor.account_id, agentId, skillId, sqlDate(now)]);
      else await connection.execute(`DELETE FROM ${relation} WHERE account_id=? AND agent_id=? AND skill_id=?`, [actor.account_id, agentId, skillId]);
      await this.#audit(connection, actor.user_id, `account.agent.skill.${input.action}`, "account_agent", agentId, "success", { skillId }, now);
      return agent;
    });
  }

  async prepareAccountAgentPrivateConfigurationForCredential(credentialId: string, agentId: string, expectedVersion: number, now = new Date().toISOString()): Promise<{ readonly accountId: string; readonly agentId: string; readonly runtimeId: string; readonly expectedVersion: number }> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const agent = await this.#loadAccountAgent(connection, actor.account_id, agentId);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!agent || !canManageAgent(principal, agent)) throw new MySqlPersistenceError("account-agent-not-found");
      if (agent.version !== expectedVersion) throw new MySqlPersistenceError("account-agent-version-conflict");
      if (!agent.runtimeId) throw new MySqlPersistenceError("agent-runtime-unavailable");
      const [runtimeRows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [actor.account_id, agent.runtimeId]);
      const runtime = runtimeRows[0] ? mapAccountRuntime(runtimeRows[0]) : undefined;
      if (!runtime || runtime.health !== "ready" || !runtime.lastCheckedAt || Date.parse(runtime.lastCheckedAt) < Date.parse(now) - 45_000) throw new MySqlPersistenceError("agent-runtime-unavailable");
      return { accountId: actor.account_id, agentId, runtimeId: runtime.runtimeId, expectedVersion };
    });
  }

  async commitAccountAgentPrivateConfigurationSummaryForCredential(credentialId: string, agentId: string, expectedVersion: number, summaryValue: AgentPrivateConfigurationSummary | unknown, now = new Date().toISOString()): Promise<Agent> {
    const summary = agentPrivateConfigurationSummarySchema.parse(summaryValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const current = await this.#loadAccountAgent(connection, actor.account_id, agentId, true);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!current || current.archivedAt || !canManageAgent(principal, current)) throw new MySqlPersistenceError("account-agent-not-found");
      if (current.version !== expectedVersion) throw new MySqlPersistenceError("account-agent-version-conflict");
      const mcpIds = new Set(current.configuration.mcpConnections.map((connection) => connection.connectionId));
      const integrationIds = new Set(current.configuration.integrations.map((integration) => integration.integrationId));
      if (summary.configuredMcpConnectionIds.some((id) => !mcpIds.has(id)) || summary.configuredIntegrationIds.some((id) => !integrationIds.has(id))) throw new MySqlPersistenceError("private-configuration-summary-invalid");
      const configuredMcpIds = new Set(summary.configuredMcpConnectionIds);
      const configuredIntegrationIds = new Set(summary.configuredIntegrationIds);
      const configuration = {
        ...current.configuration,
        environmentVariableNames: summary.environmentVariableNames,
        mcpConnections: current.configuration.mcpConnections.map((connection) => ({ ...connection, configured: configuredMcpIds.has(connection.connectionId) })),
        integrations: current.configuration.integrations.map((integration) => ({ ...integration, state: configuredIntegrationIds.has(integration.integrationId) ? "configured" as const : "action_required" as const })),
      };
      const [result] = await connection.execute<ResultHeader>("UPDATE account_agents SET configuration=?,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND version=?", [JSON.stringify(configuration), sqlDate(now), actor.account_id, agentId, expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-version-conflict");
      await this.#audit(connection, actor.user_id, "account.agent.private-configuration.update", "account_agent", agentId, "success", { environmentVariableCount: summary.environmentVariableNames.length, configuredMcpCount: summary.configuredMcpConnectionIds.length, configuredIntegrationCount: summary.configuredIntegrationIds.length }, now);
      return agentSchema.parse({ ...current, configuration, version: current.version + 1, updatedAt: now });
    });
  }

  async recordAccountAgentPrivateConfigurationAuditForCredential(credentialId: string, agentId: string, outcome: "success" | "denied" | "failed", reasonCode: string, now = new Date().toISOString()): Promise<void> {
    await this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      await this.#audit(connection, actor.user_id, "account.agent.private-configuration.access", "account_agent", agentId, outcome, { reasonCode }, now);
    });
  }

  async listAccountAgentsForCredential(credentialId: string, request: { readonly scope: "mine" | "archived"; readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<Agent> & { readonly counts: { readonly mine: number; readonly friends: number; readonly archived: number } }> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const values: (string | number | Date)[] = [actor.account_id];
      let where = request.scope === "archived" ? " AND a.archived_at IS NOT NULL" : " AND a.archived_at IS NULL";
      where += " AND a.owner_user_id=?";
      values.push(actor.user_id);
      if (request.after) {
        where += " AND (a.updated_at < ? OR (a.updated_at=? AND a.agent_id < ?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<AccountAgentRow[]>(`SELECT a.* FROM account_agents a WHERE a.account_id=?${where} ORDER BY a.updated_at DESC,a.agent_id DESC LIMIT ${limit}`, values);
      const items = rows.map(mapAccountAgent);
      const counts = await this.#accountAgentCounts(connection, actor);
      const last = items.at(-1);
      return { items, counts, ...(items.length === limit && last ? { nextCursor: { sortValue: last.updatedAt, id: last.agentId } } : {}) };
    });
  }

  async queryAccountAgentCatalogForCredential(credentialId: string, requestValue: AgentCatalogQuery | unknown, now = new Date().toISOString()): Promise<{
    readonly accountId: string; readonly scope: AgentCatalogQuery["scope"]; readonly rows: readonly (AgentCatalogRow | FriendAgentSummary)[];
    readonly counts: { readonly mine: number; readonly friends: number; readonly archived: number }; readonly nextCursor?: StableCursor;
  }> {
    const request = agentCatalogQuerySchema.parse(requestValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const freshnessCutoff = new Date(Date.parse(now) - 45_000).toISOString();
      if (request.scope === "friends") {
        const values: (string | Date)[] = [actor.user_id, actor.user_id];
        let where = "";
        if (request.search) {
          const query = `%${escapeLike(request.search.toLocaleLowerCase())}%`;
          where += " AND (LOWER(a.name) LIKE ? ESCAPE '\\\\' OR LOWER(a.description) LIKE ? ESCAPE '\\\\')";
          values.push(query, query);
        }
        if (request.ownerUserIds.length) {
          where += ` AND a.owner_user_id IN (${request.ownerUserIds.map(() => "?").join(",")})`;
          values.push(...request.ownerUserIds);
        }
        if (request.runtimeIds.length || request.models.length || (request.access.length > 0 && !request.access.includes("friend"))) where += " AND 1=0";
        const [friendRows] = await connection.execute<FriendAgentCatalogRow[]>(String.raw`
          SELECT a.agent_id,a.name,a.description,a.avatar_url,a.configuration,a.updated_at,a.owner_user_id,p.display_name AS owner_display_name,
            r.health AS runtime_health,r.last_checked_at AS runtime_last_checked_at
          FROM account_agents a
          JOIN principals p ON p.principal_id=a.owner_user_id
          JOIN human_friendships f ON f.status='active' AND (
            (f.human_a_user_id=? AND f.human_b_user_id=a.owner_user_id) OR
            (f.human_b_user_id=? AND f.human_a_user_id=a.owner_user_id)
          )
          LEFT JOIN account_runtimes r ON r.account_id=a.account_id AND r.runtime_id=a.runtime_id
          WHERE a.archived_at IS NULL AND a.permission_mode='friends'${where}
          ORDER BY a.updated_at DESC,a.agent_id DESC LIMIT ${request.limit}
        `, values);
        const filtered = friendRows.filter((row) => request.availability.length === 0 || request.availability.includes(friendAgentAvailability(row, freshnessCutoff)));
        const rows = filtered.map((row) => friendAgentSummarySchema.parse({
          kind: "friend", agentId: row.agent_id, name: row.name, description: row.description,
          ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
          owner: { userId: row.owner_user_id, displayName: row.owner_display_name },
          capabilitySummary: friendCapabilitySummary(row.configuration),
          availability: friendAgentAvailability(row, freshnessCutoff), effectiveAccess: "friend", updatedAt: toIso(row.updated_at),
        }));
        const counts = await this.#accountAgentCounts(connection, actor);
        return { accountId: actor.account_id, scope: request.scope, rows, counts };
      }
      const activityCutoff = new Date(Date.parse(now) - 30 * 24 * 60 * 60 * 1000).toISOString();
      const values: (string | number | Date)[] = [actor.account_id, actor.account_id, activityCutoff, actor.account_id, actor.account_id];
      let where = request.scope === "archived" ? " AND a.archived_at IS NOT NULL" : " AND a.archived_at IS NULL";
      where += " AND a.owner_user_id=?";
      values.push(actor.user_id);
      if (request.search) {
        const query = `%${escapeLike(request.search.toLocaleLowerCase())}%`;
        where += " AND (LOWER(a.name) LIKE ? ESCAPE '\\\\' OR LOWER(a.description) LIKE ? ESCAPE '\\\\')";
        values.push(query, query);
      }
      if (request.runtimeIds.length) { where += ` AND a.runtime_id IN (${request.runtimeIds.map(() => "?").join(",")})`; values.push(...request.runtimeIds); }
      if (request.ownerUserIds.length) { where += ` AND a.owner_user_id IN (${request.ownerUserIds.map(() => "?").join(",")})`; values.push(...request.ownerUserIds); }
      if (request.models.length) { where += ` AND JSON_UNQUOTE(JSON_EXTRACT(a.configuration,'$.model')) IN (${request.models.map(() => "?").join(",")})`; values.push(...request.models); }
      if (request.access.length > 0 && !request.access.includes("owner")) where += " AND 1=0";
      if (request.availability.length) {
        if (request.scope === "archived") where += " AND 1=0";
        else {
          const conditions = request.availability.map((availability) => {
            if (availability === "needs_runtime") return "a.runtime_id IS NULL";
            if (availability === "online") { values.push(sqlDate(freshnessCutoff)); return "a.runtime_id IS NOT NULL AND r.health='ready' AND r.last_checked_at>=?"; }
            if (availability === "unstable") { values.push(sqlDate(freshnessCutoff)); return "a.runtime_id IS NOT NULL AND r.last_checked_at>=? AND r.health IN ('checking','auth_required','unavailable')"; }
            values.push(sqlDate(freshnessCutoff)); return "a.runtime_id IS NOT NULL AND (r.last_checked_at IS NULL OR r.last_checked_at<? OR r.health='offline')";
          });
          where += ` AND (${conditions.join(" OR ")})`;
        }
      }
      const sort = catalogSort(request.sort);
      if (request.after) {
        const cursorValue = catalogCursorSqlValue(request.sort, request.after.sortValue);
        where += ` AND (${sort.expression} ${sort.direction === "ASC" ? ">" : "<"} ? OR (${sort.expression}=? AND a.agent_id ${sort.direction === "ASC" ? ">" : "<"} ?))`;
        values.push(cursorValue, cursorValue, request.after.id);
      }
      const [projectionRows] = await connection.execute<AccountAgentCatalogProjectionRow[]>(String.raw`
        SELECT a.*,
          m.membership_id AS owner_membership_id,m.email AS owner_email,m.role AS owner_role,m.version AS owner_version,m.joined_at AS owner_joined_at,m.updated_at AS owner_updated_at,p.display_name AS owner_display_name,
          r.runtime_id AS joined_runtime_id,r.owner_user_id AS runtime_owner_user_id,r.provider AS runtime_provider,r.adapter_id AS runtime_adapter_id,r.name AS runtime_name,r.visibility AS runtime_visibility,r.health AS runtime_health,r.capabilities AS runtime_capabilities,r.version AS runtime_version,r.last_checked_at AS runtime_last_checked_at,r.created_at AS runtime_created_at,r.updated_at AS runtime_updated_at,
          COALESCE(workload.queued_tasks,0) AS queued_tasks,COALESCE(workload.working_tasks,0) AS working_tasks,
          activity.run_count_30d,activity.last_active_at
        FROM account_agents a
        JOIN account_memberships m ON m.account_id=a.account_id AND m.user_id=a.owner_user_id
        JOIN principals p ON p.principal_id=m.user_id
        LEFT JOIN account_runtimes r ON r.account_id=a.account_id AND r.runtime_id=a.runtime_id
        LEFT JOIN (
          SELECT agent_id,SUM(state IN ('submitted','input-required')) AS queued_tasks,SUM(state='working') AS working_tasks
          FROM (
            SELECT task_id,agent_id,state FROM account_agent_a2a_tasks WHERE account_id=? AND state IN ('submitted','working','input-required')
            UNION
            SELECT t.task_id,t.agent_id,t.state FROM task_metadata t JOIN account_agents task_agent ON task_agent.agent_id=t.agent_id WHERE task_agent.account_id=? AND t.state IN ('submitted','working','input-required')
          ) active_tasks GROUP BY agent_id
        ) workload ON workload.agent_id=a.agent_id
        LEFT JOIN (
          SELECT agent_id,SUM(completed_at>=?) AS run_count_30d,MAX(completed_at) AS last_active_at
          FROM agent_activities WHERE account_id=? GROUP BY agent_id
        ) activity ON activity.agent_id=a.agent_id
        WHERE a.account_id=?${where}
        ORDER BY ${sort.expression} ${sort.direction},a.agent_id ${sort.direction} LIMIT ${request.limit}
      `, values);
      const rows = projectionRows.map((row) => {
        const agent = mapAccountAgent(row);
        const runtime = mapJoinedAccountRuntime(row);
        const status = catalogStatus(agent, runtime, freshnessCutoff);
        const presence = agent.archivedAt || !runtime?.lastCheckedAt ? undefined : {
          accountId: actor.account_id, agentId: agent.agentId, runtimeId: runtime.runtimeId,
          availability: status === "online" || status === "unstable" ? status : "offline" as const,
          connectionFresh: Date.parse(runtime.lastCheckedAt) >= Date.parse(freshnessCutoff), runtimeHealthy: runtime.health === "ready", bindingMatches: agent.runtimeId === runtime.runtimeId, observedAt: runtime.lastCheckedAt,
        };
        const runCount = row.run_count_30d === null ? undefined : Number(row.run_count_30d);
        return agentCatalogRowSchema.parse({
          agent: {
            agentId: agent.agentId, accountId: agent.accountId, ownerUserId: agent.ownerUserId, name: agent.name, description: agent.description,
            ...(agent.avatarUrl ? { avatarUrl: agent.avatarUrl } : {}), ...(agent.runtimeId ? { runtimeId: agent.runtimeId } : {}), permissionMode: agent.permissionMode,
            ...(agent.configuration.model ? { model: agent.configuration.model } : {}), ...(agent.archivedAt ? { archivedAt: agent.archivedAt } : {}), createdAt: agent.createdAt, updatedAt: agent.updatedAt, version: agent.version,
          }, owner: mapCatalogOwner(row), effectiveAccess: "owner", status,
          ...(runtime ? { runtime } : {}), ...(presence ? { presence } : {}),
          workload: { accountId: actor.account_id, agentId: agent.agentId, queuedTasks: Number(row.queued_tasks), workingTasks: Number(row.working_tasks), observedAt: now },
          ...(runCount === undefined ? {} : { runCount30d: runCount }), ...(row.last_active_at ? { lastActiveAt: toIso(row.last_active_at) } : {}),
        });
      });
      const counts = await this.#accountAgentCounts(connection, actor);
      const last = projectionRows.at(-1);
      return { accountId: actor.account_id, scope: request.scope, rows, counts, ...(projectionRows.length === request.limit && last ? { nextCursor: { sortValue: catalogRowSortValue(last, request.sort), id: last.agent_id } } : {}) };
    });
  }

  async updateAccountAgentForCredential(credentialId: string, agentId: string, inputValue: unknown, now = new Date().toISOString()): Promise<Agent> {
    const input = parseAccountAgentMutation(inputValue, true);
    const { expectedVersion, ...update } = input;
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const current = await this.#loadAccountAgent(connection, actor.account_id, agentId, true);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!current || current.archivedAt || !canManageAgent(principal, current)) throw new MySqlPersistenceError("account-agent-not-found");
      if (current.version !== expectedVersion) throw new MySqlPersistenceError("account-agent-version-conflict");
      if (current.runtimeId !== input.runtimeId) await this.#assertNoActiveAccountAgentWork(connection, actor.account_id, agentId);
      if (input.runtimeId) await this.#assertRuntimeBind(connection, actor, input.runtimeId, current.runtimeId === input.runtimeId ? agentId : undefined);
      const editable = agentEditableConfigurationSchema.safeParse(input.configuration);
      const configuration = editable.success
        ? mergeEditableConfiguration(current.configuration, editable.data)
        : agentConfigurationSchema.parse(input.configuration);
      if (input.runtimeId) {
        const [runtimeRows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [actor.account_id, input.runtimeId]);
        const runtime = runtimeRows[0];
        if (!runtime) throw new MySqlPersistenceError("runtime-account-denied");
        const errors = validateConfigurationForRuntime(configuration, mapAccountRuntime(runtime));
        if (errors[0]) throw new MySqlPersistenceError(errors[0].code);
      }
      const agent = agentSchema.parse({
        ...current, ...update, configuration, agentId, accountId: actor.account_id, ownerUserId: current.ownerUserId,
        updatedAt: now, version: current.version + 1,
      });
      const [result] = await connection.execute<ResultHeader>(String.raw`
        UPDATE account_agents SET runtime_id=?,name=?,description=?,avatar_url=?,permission_mode=?,configuration=?,version=version+1,updated_at=?
        WHERE account_id=? AND agent_id=? AND version=?
      `, [agent.runtimeId ?? null, agent.name, agent.description, agent.avatarUrl ?? null, agent.permissionMode, JSON.stringify(agent.configuration), sqlDate(now), actor.account_id, agentId, current.version]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-version-conflict");
      await this.#audit(connection, actor.user_id, "account.agent.update", "account_agent", agentId, "success", { permissionMode: agent.permissionMode, runtimeBound: Boolean(agent.runtimeId) }, now);
      return agent;
    });
  }

  async archiveAccountAgentForCredential(credentialId: string, agentId: string, expectedVersion: number, now = new Date().toISOString()): Promise<Agent> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const current = await this.#loadAccountAgent(connection, actor.account_id, agentId, true);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!current || current.archivedAt || !canManageAgent(principal, current)) throw new MySqlPersistenceError("account-agent-not-found");
      if (current.version !== expectedVersion) throw new MySqlPersistenceError("account-agent-version-conflict");
      await this.#assertNoActiveAccountAgentWork(connection, actor.account_id, agentId);
      const [result] = await connection.execute<ResultHeader>("UPDATE account_agents SET archived_at=?,archived_by_user_id=?,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND version=? AND archived_at IS NULL", [sqlDate(now), actor.user_id, sqlDate(now), actor.account_id, agentId, expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-version-conflict");
      await this.#audit(connection, actor.user_id, "account.agent.archive", "account_agent", agentId, "success", {}, now);
      return agentSchema.parse({ ...current, archivedAt: now, archivedByUserId: actor.user_id, updatedAt: now, version: current.version + 1 });
    });
  }

  async restoreAccountAgentForCredential(credentialId: string, agentId: string, expectedVersion: number, now = new Date().toISOString()): Promise<{ readonly agent: Agent; readonly needsRuntime: boolean }> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const current = await this.#loadAccountAgent(connection, actor.account_id, agentId, true);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!current?.archivedAt || !canManageAgent(principal, current)) throw new MySqlPersistenceError("account-agent-not-found");
      if (current.version !== expectedVersion) throw new MySqlPersistenceError("account-agent-version-conflict");
      let runtimeId = current.runtimeId;
      let needsRuntime = false;
      if (runtimeId) {
        try { await this.#assertRuntimeBind(connection, actor, runtimeId, agentId); }
        catch (error) {
          if (!(error instanceof MySqlPersistenceError) || !error.code.startsWith("runtime-")) throw error;
          runtimeId = undefined;
          needsRuntime = true;
        }
      } else needsRuntime = true;
      const [result] = await connection.execute<ResultHeader>("UPDATE account_agents SET runtime_id=?,archived_at=NULL,archived_by_user_id=NULL,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND version=? AND archived_at IS NOT NULL", [runtimeId ?? null, sqlDate(now), actor.account_id, agentId, expectedVersion]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-version-conflict");
      const { runtimeId: _previousRuntimeId, archivedAt: _archivedAt, archivedByUserId: _archivedByUserId, ...restoredBase } = current;
      void _previousRuntimeId; void _archivedAt; void _archivedByUserId;
      const agent = agentSchema.parse({ ...restoredBase, ...(runtimeId ? { runtimeId } : {}), updatedAt: now, version: current.version + 1 });
      await this.#audit(connection, actor.user_id, "account.agent.restore", "account_agent", agentId, "success", { needsRuntime }, now);
      return { agent, needsRuntime };
    });
  }

  async batchAccountAgentLifecycleForCredential(credentialId: string, requestValue: AgentBatchLifecycleRequest | unknown, now = new Date().toISOString()): Promise<AgentBatchLifecycleResult> {
    const request = agentBatchLifecycleRequestSchema.parse(requestValue);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      const requested = [...request.items].sort((left, right) => left.agentId.localeCompare(right.agentId));
      const planned: { current: Agent; runtimeId?: string; needsRuntime?: boolean }[] = [];
      const additionalBindings = new Map<string, number>();

      for (const item of requested) {
        const current = await this.#loadAccountAgent(connection, actor.account_id, item.agentId, true);
        const lifecycleMatches = request.action === "archive" ? !current?.archivedAt : Boolean(current?.archivedAt);
        if (!current || !lifecycleMatches || !canManageAgent(principal, current)) throw new MySqlPersistenceError("account-agent-batch-denied");
        if (current.version !== item.expectedVersion) throw new MySqlPersistenceError("account-agent-batch-stale");
        if (request.action === "archive") {
          await this.#assertNoActiveAccountAgentWork(connection, actor.account_id, current.agentId);
          planned.push({ current });
          continue;
        }
        let runtimeId = current.runtimeId;
        let needsRuntime = !runtimeId;
        if (runtimeId) {
          try {
            const additionalBoundCount = additionalBindings.get(runtimeId) ?? 0;
            await this.#assertRuntimeBind(connection, actor, runtimeId, current.agentId, additionalBoundCount);
            additionalBindings.set(runtimeId, additionalBoundCount + 1);
          } catch (error) {
            if (!(error instanceof MySqlPersistenceError) || !error.code.startsWith("runtime-")) throw error;
            runtimeId = undefined;
            needsRuntime = true;
          }
        }
        planned.push({ current, ...(runtimeId ? { runtimeId } : {}), ...(needsRuntime ? { needsRuntime: true } : {}) });
      }

      const results: { agent: Agent; needsRuntime?: boolean }[] = [];
      for (const item of planned) {
        if (request.action === "archive") {
          const [result] = await connection.execute<ResultHeader>("UPDATE account_agents SET archived_at=?,archived_by_user_id=?,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND version=? AND archived_at IS NULL", [sqlDate(now), actor.user_id, sqlDate(now), actor.account_id, item.current.agentId, item.current.version]);
          if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-batch-stale");
          const agent = agentSchema.parse({ ...item.current, archivedAt: now, archivedByUserId: actor.user_id, updatedAt: now, version: item.current.version + 1 });
          results.push({ agent });
        } else {
          const [result] = await connection.execute<ResultHeader>("UPDATE account_agents SET runtime_id=?,archived_at=NULL,archived_by_user_id=NULL,version=version+1,updated_at=? WHERE account_id=? AND agent_id=? AND version=? AND archived_at IS NOT NULL", [item.runtimeId ?? null, sqlDate(now), actor.account_id, item.current.agentId, item.current.version]);
          if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-agent-batch-stale");
          const { runtimeId: _runtimeId, archivedAt: _archivedAt, archivedByUserId: _archivedByUserId, ...base } = item.current;
          void _runtimeId; void _archivedAt; void _archivedByUserId;
          const agent = agentSchema.parse({ ...base, ...(item.runtimeId ? { runtimeId: item.runtimeId } : {}), updatedAt: now, version: item.current.version + 1 });
          results.push({ agent, ...(item.needsRuntime ? { needsRuntime: true } : {}) });
        }
        await this.#audit(connection, actor.user_id, `account.agent.batch.${request.action}`, "account_agent", item.current.agentId, "success", { semantics: "atomic", ...(item.needsRuntime ? { needsRuntime: true } : {}) }, now);
      }
      return agentBatchLifecycleResultSchema.parse({ accountId: actor.account_id, action: request.action, semantics: "atomic", results, appliedAt: now });
    });
  }

  async listAccountAgentActivitiesForCredential(credentialId: string, agentId: string, request: { readonly limit: number; readonly after?: StableCursor }, now = new Date().toISOString()): Promise<RepositoryPage<AgentActivity>> {
    const limit = accountPageLimit(request.limit);
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      const agent = await this.#loadAccountAgent(connection, actor.account_id, agentId);
      const principal = { accountId: actor.account_id, userId: actor.user_id, active: true } as const;
      if (!agent || (!canManageAgent(principal, agent) && !canInvokeAgent(principal, agent).allowed)) throw new MySqlPersistenceError("account-agent-not-found");
      const values: (string | number | Date)[] = [actor.account_id, agentId];
      let cursor = "";
      if (request.after) {
        cursor = " AND (completed_at<? OR (completed_at=? AND activity_id<?))";
        values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
      }
      const [rows] = await connection.execute<AgentActivityRow[]>(`SELECT activity_id,account_id,agent_id,task_id,terminal_state,failure_category,started_at,completed_at,duration_ms FROM agent_activities WHERE account_id=? AND agent_id=?${cursor} ORDER BY completed_at DESC,activity_id DESC LIMIT ${limit}`, values);
      const items = rows.map(mapAgentActivity);
      const last = items.at(-1);
      return { items, ...(items.length === limit && last ? { nextCursor: { sortValue: last.completedAt, id: last.activityId } } : {}) };
    });
  }

  async createAccountSelfTestForCredential(
    credentialId: string,
    agentId: string,
    input: { readonly audience: string; readonly expiresAt: string },
    now = new Date().toISOString(),
  ): Promise<AccountSelfTest> {
    const nowTime = Date.parse(now);
    const expiresTime = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresTime) || expiresTime <= nowTime || expiresTime > nowTime + 15 * 60 * 1000) throw new MySqlPersistenceError("account-self-test-expiry-invalid");
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      if (actor.role !== "owner") throw new MySqlPersistenceError("account-self-test-owner-required");
      const agent = await this.#loadAccountAgent(connection, actor.account_id, agentId, true);
      const decision = agent ? canInvokeAgent(accountAccessPrincipal(actor), agent) : undefined;
      if (!agent || !decision?.allowed || !agent.runtimeId) throw new MySqlPersistenceError("account-agent-not-found");
      const [runtimeRows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=? FOR UPDATE", [actor.account_id, agent.runtimeId]);
      const runtime = runtimeRows[0] ? mapAccountRuntime(runtimeRows[0]) : undefined;
      if (!runtime || runtime.health !== "ready") throw new MySqlPersistenceError("agent-runtime-unavailable");
      const [instances] = await connection.query<IdentifierRow[]>("SELECT instance_id FROM fabric_instances LIMIT 1");
      const instanceId = instances[0]?.instance_id;
      if (!instanceId) throw new MySqlPersistenceError("instance-required");
      const selfTestId = `self-test:${randomUUID()}`;
      const principalId = `device:${randomUUID()}`;
      await connection.execute("INSERT INTO principals(principal_id,kind,owner_principal_id,display_name,created_at) VALUES (?,'device',?,?,?)", [principalId, actor.user_id, `Self-test ${agent.name}`.slice(0, 120), sqlDate(now)]);
      const issued = await this.#issueCredential(connection, {
        principalId,
        instanceId,
        scopes: ["account:self-test"],
        audience: input.audience,
        expiresAt: input.expiresAt,
        now,
        resourceAgentId: agentId,
      });
      await connection.execute("INSERT INTO account_sessions(session_id,credential_id,account_id,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?,?,?)", [`session:${randomUUID()}`, issued.record.credentialId, actor.account_id, actor.user_id, sqlDate(now), sqlDate(input.expiresAt), sqlDate(now)]);
      await connection.execute(String.raw`
        INSERT INTO account_agent_self_tests(self_test_id,account_id,agent_id,created_by_user_id,requester_principal_id,requester_credential_id,created_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?)
      `, [selfTestId, actor.account_id, agentId, actor.user_id, principalId, issued.record.credentialId, sqlDate(now), sqlDate(input.expiresAt)]);
      await this.#audit(connection, actor.user_id, "account.agent.self_test.create", "account_agent", agentId, "success", { selfTestId, expiresAt: input.expiresAt }, now);
      return {
        selfTestId,
        accountId: actor.account_id,
        agentId,
        requester: { token: issued.token, principalId, credentialId: issued.record.credentialId, expiresAt: input.expiresAt },
      };
    });
  }

  async revokeAccountSelfTestForCredential(credentialId: string, selfTestId: string, now = new Date().toISOString()): Promise<{ readonly selfTestId: string; readonly status: "revoked" }> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now);
      if (actor.role !== "owner") throw new MySqlPersistenceError("account-self-test-owner-required");
      const [rows] = await connection.execute<AccountSelfTestRow[]>("SELECT * FROM account_agent_self_tests WHERE self_test_id=? AND account_id=? FOR UPDATE", [selfTestId, actor.account_id]);
      const selfTest = rows[0];
      if (!selfTest) throw new MySqlPersistenceError("account-self-test-not-found");
      if (!selfTest.revoked_at) {
        await connection.execute("UPDATE account_agent_self_tests SET revoked_at=? WHERE self_test_id=? AND revoked_at IS NULL", [sqlDate(now), selfTestId]);
        await connection.execute("UPDATE credentials SET revoked_at=? WHERE credential_id=? AND revoked_at IS NULL", [sqlDate(now), selfTest.requester_credential_id]);
        await connection.execute("UPDATE account_sessions SET revoked_at=? WHERE credential_id=? AND revoked_at IS NULL", [sqlDate(now), selfTest.requester_credential_id]);
        await connection.execute("UPDATE principals SET revoked_at=? WHERE principal_id=? AND revoked_at IS NULL", [sqlDate(now), selfTest.requester_principal_id]);
        await this.#audit(connection, actor.user_id, "account.agent.self_test.revoke", "account_agent", selfTest.agent_id, "success", { selfTestId }, now);
      }
      return { selfTestId, status: "revoked" };
    });
  }

  async listInvokableAccountAgentsForCredential(credentialId: string, query?: string, now = new Date().toISOString()): Promise<readonly AccountInvokableAgentProjection[]> {
    const normalizedQuery = query?.trim().toLocaleLowerCase();
    if (normalizedQuery && normalizedQuery.length > 200) throw new MySqlPersistenceError("agent-query-invalid");
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now, true);
      const values: string[] = [actor.account_id, actor.user_id, actor.user_id, actor.user_id];
      let filter = "";
      if (normalizedQuery) {
        filter = " AND (LOWER(a.agent_id)=? OR LOWER(a.name) LIKE ? OR LOWER(a.description) LIKE ?)";
        values.push(normalizedQuery, `%${escapeLike(normalizedQuery)}%`, `%${escapeLike(normalizedQuery)}%`);
      }
      const [rows] = await connection.execute<AccountAgentRow[]>(String.raw`
        SELECT a.* FROM account_agents a
        WHERE a.archived_at IS NULL AND (
          (a.account_id=? AND a.owner_user_id=?) OR
          (a.permission_mode='friends' AND EXISTS (
            SELECT 1 FROM human_friendships f WHERE f.status='active' AND
            ((f.human_a_user_id=? AND f.human_b_user_id=a.owner_user_id) OR (f.human_b_user_id=? AND f.human_a_user_id=a.owner_user_id))
          ))
        )${filter}
        ORDER BY a.name ASC,a.agent_id ASC LIMIT 500
      `, values);
      const principal = await this.#accountAccessPrincipal(connection, actor);
      const agents = rows.map(mapAccountAgent);
      const allowed = agents.flatMap((agent) => {
        const decision = canInvokeAgent(principal, agent);
        return decision.allowed ? [{ agent, accessScope: decision.scope }] : [];
      });
      if (allowed.length === 0) return [];
      const runtimeIds = [...new Set(allowed.map((item) => item.agent.runtimeId).filter((value): value is string => Boolean(value)))];
      const runtimeRows = runtimeIds.length === 0 ? [] : (await connection.execute<AccountRuntimeRow[]>(`SELECT * FROM account_runtimes WHERE runtime_id IN (${runtimeIds.map(() => "?").join(",")})`, runtimeIds))[0];
      const runtimes = new Map(runtimeRows.map((row) => [`${row.account_id}:${row.runtime_id}`, mapAccountRuntime(row)]));
      return allowed.map((item) => {
        const runtime = item.agent.runtimeId ? runtimes.get(`${item.agent.accountId}:${item.agent.runtimeId}`) : undefined;
        return runtime ? { ...item, runtime } : item;
      });
    });
  }

  async getInvokableAccountAgentForCredential(credentialId: string, agentId: string, now = new Date().toISOString()): Promise<AccountInvokableAgentProjection & { readonly runtime: AgentRuntime }> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now, true);
      const agent = await this.#loadAnyAccountAgent(connection, agentId);
      const decision = agent ? canInvokeAgent(await this.#accountAccessPrincipal(connection, actor), agent) : undefined;
      if (!agent || !decision?.allowed || !agent.runtimeId) throw new MySqlPersistenceError("account-agent-not-found");
      const [runtimeRows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [agent.accountId, agent.runtimeId]);
      const runtimeRow = runtimeRows[0];
      if (!runtimeRow) throw new MySqlPersistenceError("account-agent-not-found");
      const runtime = mapAccountRuntime(runtimeRow);
      if (runtime.health !== "ready") throw new MySqlPersistenceError("agent-runtime-unavailable");
      return { agent, runtime, accessScope: decision.scope };
    });
  }

  async createAccountA2ATaskForCredential(credentialId: string, agentId: string, taskId: string, state: AccountA2ATaskState, now = new Date().toISOString()): Promise<AccountA2ATaskRoute> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now, true);
      const agent = await this.#loadAnyAccountAgent(connection, agentId);
      const decision = agent ? canInvokeAgent(await this.#accountAccessPrincipal(connection, actor), agent) : undefined;
      if (!agent || !decision?.allowed) throw new MySqlPersistenceError("account-agent-not-found");
      await connection.execute(String.raw`
        INSERT INTO account_agent_a2a_tasks(task_id,account_id,agent_id,origin_user_id,origin_account_id,origin_credential_id,state,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `, [taskId, agent.accountId, agentId, actor.user_id, actor.account_id, credentialId, state, sqlDate(now), sqlDate(now)]);
      return { taskId, accountId: agent.accountId, originAccountId: actor.account_id, agentId, originUserId: actor.user_id, originCredentialId: credentialId, state };
    });
  }

  async updateAccountA2ATaskState(taskId: string, state: AccountA2ATaskState, now = new Date().toISOString()): Promise<void> {
    await this.#transaction(async (connection) => {
      const [rows] = await connection.execute<AccountA2ATaskRow[]>("SELECT * FROM account_agent_a2a_tasks WHERE task_id=? FOR UPDATE", [taskId]);
      const current = rows[0];
      if (!current) throw new MySqlPersistenceError("account-task-not-found");
      const [result] = await connection.execute<ResultHeader>("UPDATE account_agent_a2a_tasks SET state=?,updated_at=? WHERE task_id=?", [state, sqlDate(now), taskId]);
      if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-task-not-found");
      if (["completed", "failed", "canceled", "rejected"].includes(state) && !["completed", "failed", "canceled", "rejected"].includes(current.state)) {
        const terminalState = state === "completed" ? "completed" : state === "canceled" ? "canceled" : "failed";
        const durationMs = Math.max(0, Date.parse(now) - Date.parse(toIso(current.created_at)));
        await connection.execute(String.raw`
          INSERT IGNORE INTO agent_activities(activity_id,account_id,agent_id,task_id,terminal_state,failure_category,started_at,completed_at,duration_ms)
          VALUES (?,?,?,?,?,?,?,?,?)
        `, [`activity:${createHash("sha256").update(taskId).digest("hex")}`, current.account_id, current.agent_id, taskId, terminalState, terminalState === "failed" ? "a2a-task-failed" : null, current.created_at, sqlDate(now), durationMs]);
      }
    });
  }

  async getReadableAccountA2ATaskRouteForCredential(credentialId: string, taskId: string, now = new Date().toISOString()): Promise<AccountA2ATaskRoute> {
    return this.#transaction(async (connection) => {
      const actor = await this.#accountActor(connection, credentialId, now, true);
      const [rows] = await connection.execute<AccountA2ATaskRow[]>("SELECT * FROM account_agent_a2a_tasks WHERE task_id=? AND origin_account_id=? AND origin_credential_id=?", [taskId, actor.account_id, credentialId]);
      const row = rows[0];
      if (!row) throw new MySqlPersistenceError("account-task-not-found");
      const agent = await this.#loadAccountAgent(connection, row.account_id, row.agent_id);
      const decision = agent ? canInvokeAgent(await this.#accountAccessPrincipal(connection, actor), agent) : undefined;
      if (!agent || !decision?.allowed) throw new MySqlPersistenceError("account-task-not-found");
      return mapAccountA2ATaskRoute(row);
    });
  }

  async #issueCredential(connection: PoolConnection, input: {
    readonly principalId: string;
    readonly instanceId: string;
    readonly scopes: readonly CredentialScope[];
    readonly audience: string;
    readonly expiresAt: string;
    readonly now: string;
    readonly resourceAgentId?: string;
  }): Promise<{ readonly token: string; readonly record: MySqlCredentialRecord }> {
    const scopes = input.scopes.map((scope) => credentialScopeSchema.parse(scope));
    const token = randomBytes(32).toString("base64url");
    const credentialId = `credential:${randomUUID()}`;
    await connection.execute("INSERT INTO credentials(credential_id, principal_id, instance_id, token_digest, scopes, audience, expires_at, created_at, resource_agent_id) VALUES (?,?,?,?,?,?,?,?,?)", [credentialId, input.principalId, input.instanceId, hashCredential(token), JSON.stringify(scopes), input.audience, sqlDate(input.expiresAt), sqlDate(input.now), input.resourceAgentId ?? null]);
    return { token, record: { credentialId, principalId: input.principalId, instanceId: input.instanceId, scopes, audience: input.audience, expiresAt: input.expiresAt, ...(input.resourceAgentId ? { resourceAgentId: input.resourceAgentId } : {}) } };
  }

  async #audit(connection: PoolConnection, actor: string | null, action: string, targetType: string, targetId: string, outcome: string, metadata: Readonly<Record<string, unknown>>, createdAt: string): Promise<void> {
    await connection.execute("INSERT INTO audit_events(audit_id, actor_principal_id, action, target_type, target_id, outcome, metadata, created_at) VALUES (?,?,?,?,?,?,?,?)", [`audit:${randomUUID()}`, actor, action, targetType, targetId, outcome, JSON.stringify(metadata), sqlDate(createdAt)]);
  }

  async #expireFriendInvitations(connection: PoolConnection, now: string): Promise<void> {
    await connection.execute("UPDATE human_friend_invitations SET status='expired',version=version+1 WHERE status='pending' AND expires_at<=?", [sqlDate(now)]);
  }

  async #incomingFriendInvitationForUpdate(connection: PoolConnection, actor: AccountActorRow, invitationId: string, expectedVersion: number, now: string): Promise<FriendInvitationRow> {
    const [rows] = await connection.execute<FriendInvitationRow[]>(String.raw`
      SELECT * FROM human_friend_invitations
      WHERE invitation_id=? AND (recipient_user_id=? OR (recipient_user_id IS NULL AND recipient_email_digest=?))
      FOR UPDATE
    `, [invitationId, actor.user_id, hashCredential(actor.email)]);
    const invitation = rows[0];
    if (!invitation || invitation.status !== "pending" || Number(invitation.version) !== expectedVersion
      || invitation.inviter_user_id === actor.user_id || Date.parse(toIso(invitation.expires_at)) <= Date.parse(now)) {
      throw new MySqlPersistenceError("friend-invitation-unavailable");
    }
    return invitation;
  }

  async #accountActor(connection: PoolConnection, credentialId: string, now: string, allowSelfTest = false): Promise<AccountActorRow> {
    const [rows] = await connection.execute<AccountActorRow[]>(String.raw`
      SELECT s.account_id,s.user_id,m.role,m.email,p.display_name,c.scopes AS credential_scopes
      FROM account_sessions s
      JOIN account_memberships m ON m.account_id=s.account_id AND m.user_id=s.user_id
      JOIN principals p ON p.principal_id=s.user_id
      JOIN credentials c ON c.credential_id=s.credential_id
      WHERE s.expires_at>? AND s.credential_id=? AND s.revoked_at IS NULL AND c.revoked_at IS NULL
      FOR UPDATE
    `, [sqlDate(now), credentialId]);
    const actor = rows[0];
    if (!actor) throw new MySqlPersistenceError("account-session-unavailable");
    const scopes = actor.credential_scopes === undefined ? ["account:access"] : jsonArray(actor.credential_scopes).map(String);
    if (scopes.includes("account:access")) return actor;
    if (!allowSelfTest || !scopes.includes("account:self-test")) throw new MySqlPersistenceError("account-session-unavailable");
    const [selfTests] = await connection.execute<AgentIdRow[]>(String.raw`
      SELECT agent_id FROM account_agent_self_tests
      WHERE requester_credential_id=? AND revoked_at IS NULL AND expires_at>?
      LIMIT 1 FOR UPDATE
    `, [credentialId, sqlDate(now)]);
    const selfTestAgentId = selfTests[0]?.agent_id;
    if (!selfTestAgentId) throw new MySqlPersistenceError("account-session-unavailable");
    return { ...actor, self_test_agent_id: selfTestAgentId } as AccountActorRow;
  }

  async #removableMember(connection: PoolConnection, actor: AccountActorRow, targetUserId: string): Promise<AccountMemberProjectionRow> {
    const [rows] = await connection.execute<AccountMemberProjectionRow[]>(String.raw`
      SELECT m.*,p.display_name FROM account_memberships m JOIN principals p ON p.principal_id=m.user_id
      WHERE m.account_id=? AND m.user_id=? FOR UPDATE
    `, [actor.account_id, targetUserId]);
    const target = rows[0];
    if (!target || actor.user_id === targetUserId) throw new MySqlPersistenceError("account-member-not-found");
    if (actor.role === "member" || (actor.role === "admin" && target.role !== "member")) throw new MySqlPersistenceError("account-member-authority-denied");
    if (target.role === "owner") {
      const [owners] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM account_memberships WHERE account_id=? AND role='owner' FOR UPDATE", [actor.account_id]);
      if (Number(owners[0]?.count ?? 0) <= 1) throw new MySqlPersistenceError("account-last-owner-required");
    }
    return target;
  }

  async #memberRemovalSnapshot(connection: PoolConnection, accountId: string, targetUserId: string): Promise<MemberRemovalSnapshot> {
    const [agentRows] = await connection.execute<OwnedAgentImpactRow[]>("SELECT agent_id,name FROM account_agents WHERE account_id=? AND owner_user_id=? ORDER BY agent_id", [accountId, targetUserId]);
    const [runtimeRows] = await connection.execute<OwnedRuntimeImpactRow[]>(String.raw`
      SELECT r.runtime_id,r.name,a.agent_id
      FROM account_runtimes r LEFT JOIN account_agents a ON a.account_id=r.account_id AND a.runtime_id=r.runtime_id
      WHERE r.account_id=? AND r.owner_user_id=? ORDER BY r.runtime_id,a.agent_id
    `, [accountId, targetUserId]);
    const runtimeMap = new Map<string, { runtimeId: string; name: string; boundAgentIds: string[] }>();
    for (const row of runtimeRows) {
      const runtime = runtimeMap.get(row.runtime_id) ?? { runtimeId: row.runtime_id, name: row.name, boundAgentIds: [] };
      if (row.agent_id) runtime.boundAgentIds.push(row.agent_id);
      runtimeMap.set(row.runtime_id, runtime);
    }
    const [targetRows] = await connection.execute<AgentIdRow[]>("SELECT agent_id FROM agent_invocation_targets WHERE account_id=? AND target_user_id=? ORDER BY agent_id", [accountId, targetUserId]);
    const [invitationRows] = await connection.execute<InvitationIdRow[]>("SELECT invitation_id FROM account_member_invitations WHERE account_id=? AND invited_by_user_id=? AND status='pending' ORDER BY invitation_id", [accountId, targetUserId]);
    const [sessionRows] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM account_sessions WHERE account_id=? AND user_id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3)", [accountId, targetUserId]);
    return {
      ownedAgents: agentRows.map((row) => ({ agentId: row.agent_id, name: row.name })),
      ownedRuntimes: [...runtimeMap.values()],
      invocationTargetAgentIds: targetRows.map((row) => row.agent_id),
      pendingInvitationIds: invitationRows.map((row) => row.invitation_id),
      activeSessionCount: Number(sessionRows[0]?.count ?? 0),
    };
  }

  async #runtimeForManagement(connection: PoolConnection, actor: AccountActorRow, runtimeId: string): Promise<AccountRuntimeRow> {
    const [rows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=? FOR UPDATE", [actor.account_id, runtimeId]);
    const runtime = rows[0];
    if (!runtime || (actor.role === "member" && runtime.owner_user_id !== actor.user_id)) throw new MySqlPersistenceError("account-runtime-not-found");
    return runtime;
  }

  async #runtimeDeletionSnapshot(connection: PoolConnection, accountId: string, runtimeId: string): Promise<RuntimeDeletionSnapshot> {
    const [boundRows] = await connection.execute<AgentIdRow[]>("SELECT agent_id FROM account_agents WHERE account_id=? AND runtime_id=? ORDER BY agent_id", [accountId, runtimeId]);
    const [activeRows] = await connection.execute<ActiveRuntimeTaskRow[]>(String.raw`
      SELECT task_id,agent_id FROM (
        SELECT t.task_id,t.agent_id FROM account_agent_a2a_tasks t JOIN account_agents a ON a.account_id=t.account_id AND a.agent_id=t.agent_id
        WHERE t.account_id=? AND a.runtime_id=? AND t.state IN ('submitted','working','input-required')
        UNION
        SELECT t.task_id,t.agent_id FROM task_metadata t JOIN account_agents a ON a.agent_id=t.agent_id
        WHERE a.account_id=? AND a.runtime_id=? AND t.state IN ('submitted','working','input-required')
      ) active ORDER BY agent_id,task_id
    `, [accountId, runtimeId, accountId, runtimeId]);
    const activeTasks = activeRows.map((row) => ({ taskId: row.task_id, agentId: row.agent_id }));
    return { boundAgentIds: boundRows.map((row) => row.agent_id), activeAgentIds: [...new Set(activeTasks.map((task) => task.agentId))], activeTasks };
  }

  async #validateAccountSkillIds(connection: PoolConnection, accountId: string, runtimeId: string | undefined, skillIds: readonly string[], disabledRuntimeSkillIds: readonly string[]): Promise<void> {
    const all = [...new Set([...skillIds, ...disabledRuntimeSkillIds])];
    if (all.length === 0) return;
    const placeholders = all.map(() => "?").join(",");
    const [rows] = await connection.execute<AccountSkillValidationRow[]>(`SELECT skill_id,origin,runtime_id FROM account_skills WHERE account_id=? AND skill_id IN (${placeholders})`, [accountId, ...all]);
    const byId = new Map(rows.map((row) => [row.skill_id, row]));
    if (all.some((skillId) => !byId.has(skillId))) throw new MySqlPersistenceError("agent-skill-not-found");
    if (disabledRuntimeSkillIds.some((skillId) => { const row = byId.get(skillId); return row?.origin !== "runtime" || row.runtime_id !== runtimeId; })) throw new MySqlPersistenceError("runtime-skill-binding-invalid");
  }

  async #assertNoActiveAccountAgentWork(connection: PoolConnection, accountId: string, agentId: string): Promise<void> {
    const [accountRows] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM account_agent_a2a_tasks WHERE account_id=? AND agent_id=? AND state IN ('submitted','working','input-required')", [accountId, agentId]);
    const [legacyRows] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM task_metadata WHERE agent_id=? AND state IN ('submitted','working','input-required')", [agentId]);
    if (Number(accountRows[0]?.count ?? 0) + Number(legacyRows[0]?.count ?? 0) !== 0) throw new MySqlPersistenceError("agent-active-work-required");
  }

  async #loadAccountAgent(connection: PoolConnection, accountId: string, agentId: string, forUpdate = false): Promise<Agent | undefined> {
    const [rows] = await connection.execute<AccountAgentRow[]>(`SELECT * FROM account_agents WHERE account_id=? AND agent_id=?${forUpdate ? " FOR UPDATE" : ""}`, [accountId, agentId]);
    const row = rows[0];
    if (!row) return undefined;
    return mapAccountAgent(row);
  }

  async #loadAnyAccountAgent(connection: PoolConnection, agentId: string): Promise<Agent | undefined> {
    const [rows] = await connection.execute<AccountAgentRow[]>("SELECT * FROM account_agents WHERE agent_id=?", [agentId]);
    return rows[0] ? mapAccountAgent(rows[0]) : undefined;
  }

  async #accountAccessPrincipal(connection: PoolConnection, actor: AccountActorRow) {
    const base = accountAccessPrincipal(actor);
    if (base.boundedAgentIds) return base;
    const [rows] = await connection.execute<FriendUserIdRow[]>(String.raw`
      SELECT CASE WHEN human_a_user_id=? THEN human_b_user_id ELSE human_a_user_id END AS friend_user_id
      FROM human_friendships
      WHERE status='active' AND (human_a_user_id=? OR human_b_user_id=?)
    `, [actor.user_id, actor.user_id, actor.user_id]);
    return { ...base, activeFriendUserIds: rows.map((row) => row.friend_user_id) };
  }

  async #assertRuntimeBind(connection: PoolConnection, actor: AccountActorRow, runtimeId: string, excludingAgentId?: string, additionalBoundCount = 0): Promise<void> {
    const [rows] = await connection.execute<AccountRuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=? FOR UPDATE", [actor.account_id, runtimeId]);
    const runtime = rows[0];
    if (!runtime) throw new MySqlPersistenceError("runtime-account-denied");
    const values: string[] = [actor.account_id, runtimeId];
    const exclusion = excludingAgentId ? " AND agent_id<>?" : "";
    if (excludingAgentId) values.push(excludingAgentId);
    const [counts] = await connection.execute<CountRow[]>(`SELECT COUNT(*) AS count FROM account_agents WHERE account_id=? AND runtime_id=? AND archived_at IS NULL${exclusion}`, values);
    const decision = canBindRuntime({ accountId: actor.account_id, userId: actor.user_id, active: true }, mapAccountRuntime(runtime), Number(counts[0]?.count ?? 0) + additionalBoundCount);
    if (!decision.allowed) throw new MySqlPersistenceError(decision.code);
  }

  async #accountAgentCounts(connection: PoolConnection, actor: AccountActorRow): Promise<{ readonly mine: number; readonly friends: number; readonly archived: number }> {
    const [mineRows] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM account_agents WHERE account_id=? AND owner_user_id=? AND archived_at IS NULL", [actor.account_id, actor.user_id]);
    const [friendRows] = await connection.execute<CountRow[]>(String.raw`
      SELECT COUNT(*) AS count FROM account_agents a JOIN human_friendships f ON f.status='active' AND (
        (f.human_a_user_id=? AND f.human_b_user_id=a.owner_user_id) OR
        (f.human_b_user_id=? AND f.human_a_user_id=a.owner_user_id)
      ) WHERE a.archived_at IS NULL AND a.permission_mode='friends'
    `, [actor.user_id, actor.user_id]);
    const [archivedRows] = await connection.execute<CountRow[]>("SELECT COUNT(*) AS count FROM account_agents WHERE account_id=? AND owner_user_id=? AND archived_at IS NOT NULL", [actor.account_id, actor.user_id]);
    return { mine: Number(mineRows[0]?.count ?? 0), friends: Number(friendRows[0]?.count ?? 0), archived: Number(archivedRows[0]?.count ?? 0) };
  }

  async #transaction<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }
}

export class MySqlPersistenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MySqlPersistenceError";
  }
}

export function hashCredential(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sqlDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MySqlPersistenceError("invalid-timestamp");
  return parsed;
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).toISOString();
}

function jsonArray(value: string | readonly unknown[]): unknown[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new MySqlPersistenceError("invalid-json-array");
  return [...parsed];
}

function accountAccessPrincipal(actor: AccountActorRow) {
  const scopes = actor.credential_scopes === undefined ? ["account:access"] : jsonArray(actor.credential_scopes).map(String);
  const boundedAgentIds = !scopes.includes("account:access") && scopes.includes("account:self-test") && actor.self_test_agent_id
    ? [actor.self_test_agent_id]
    : undefined;
  return {
    accountId: actor.account_id,
    userId: actor.user_id,
    active: scopes.includes("account:access") || Boolean(boundedAgentIds),
    ...(boundedAgentIds ? { boundedAgentIds } : {}),
  } as const;
}

interface LockRow extends RowDataPacket { acquired: number | string | null }
interface VersionRow extends RowDataPacket { version: number | string }
interface HumanFriendshipMigrationAuditRow extends RowDataPacket {
  non_owner_memberships: number | string;
  non_owner_agents: number | string;
  non_owner_runtimes: number | string;
  non_owner_sessions: number | string;
  pending_member_invitations: number | string;
  legacy_shared_agents: number | string;
}
interface IdentifierRow extends RowDataPacket { instance_id: string }
interface AccountInvitationAvailabilityRow extends RowDataPacket { invitation_id: string; status: string; expires_at: string | Date; accepted_at: string | Date | null; revoked_at: string | Date | null }
interface JoinStateRow extends RowDataPacket { join_session_id: string; nonce_digest: string; expires_at: string | Date; authenticated_at: string | Date | null; consumed_at: string | Date | null; return_uri: string; client_state: string }
interface JoinReturnRow extends RowDataPacket { return_uri: string; client_state: string }
interface ExternalIdentityRow extends RowDataPacket { principal_id: string }
interface AccountMembershipIdentityRow extends RowDataPacket { account_id: string; role: "owner" | "admin" | "member"; email: string }
interface AccountSessionRow extends RowDataPacket {
  session_id: string; credential_id: string; account_id: string; user_id: string; display_name: string; email: string;
  role: string; created_at: string | Date; expires_at: string | Date; last_seen_at: string | Date; revoked_at: string | Date | null;
  credential_revoked_at: string | Date | null;
}
interface AccountProjectionRow extends RowDataPacket {
  account_id: string; name: string; version: number | string; created_at: string | Date; updated_at: string | Date;
}
interface LegacyMigrationRecoveryRow extends RowDataPacket {
  account_agent_id: string; backup_id: string; acknowledged_at: string | Date | null;
}
interface AccountActorRow extends RowDataPacket {
  account_id: string; user_id: string; role: "owner" | "admin" | "member";
  email: string; display_name: string;
  credential_scopes?: string | readonly unknown[]; self_test_agent_id?: string | null;
}
interface HumanIdentityProjectionRow extends RowDataPacket { user_id: string; display_name: string; email: string }
interface FriendInvitationRow extends RowDataPacket {
  invitation_id: string; inviter_user_id: string; recipient_email: string; recipient_email_digest: string; recipient_user_id: string | null;
  status: "pending" | "accepted" | "rejected" | "revoked" | "expired"; version: number | string;
  expires_at: string | Date; created_at: string | Date; accepted_at: string | Date | null; rejected_at: string | Date | null; revoked_at: string | Date | null;
}
interface FriendInvitationProjectionRow extends FriendInvitationRow { other_display_name: string | null; other_email: string | null }
interface FriendshipRow extends RowDataPacket {
  friendship_id: string; human_a_user_id: string; human_b_user_id: string; status: "active" | "revoked";
  relationship_version: number | string; version: number | string; created_at: string | Date; updated_at: string | Date; revoked_at: string | Date | null;
}
interface FriendSummaryRow extends RowDataPacket {
  friendship_id: string; relationship_version: number | string; created_at: string | Date; updated_at: string | Date;
  friend_user_id: string; display_name: string; email: string;
}
interface FriendUserIdRow extends RowDataPacket { friend_user_id: string }
interface AccountMemberProjectionRow extends RowDataPacket {
  membership_id: string; account_id: string; user_id: string; display_name: string; email: string; role: "owner" | "admin" | "member";
  version: number | string; joined_at: string | Date; updated_at: string | Date;
}
interface AccountMemberInvitationProjectionRow extends RowDataPacket {
  invitation_id: string; account_id: string; invited_email: string; invited_by_user_id: string; role: "owner" | "admin" | "member";
  status: "pending" | "accepted" | "revoked" | "expired"; version: number | string; expires_at: string | Date; created_at: string | Date;
  accepted_at: string | Date | null; revoked_at: string | Date | null;
}
interface CountRow extends RowDataPacket { count: number | string }
interface TransferMemberRow extends RowDataPacket { user_id: string }
interface OwnedAgentImpactRow extends RowDataPacket { agent_id: string; name: string }
interface OwnedRuntimeImpactRow extends RowDataPacket { runtime_id: string; name: string; agent_id: string | null }
interface AgentIdRow extends RowDataPacket { agent_id: string }
interface InvitationIdRow extends RowDataPacket { invitation_id: string }
interface MemberRemovalPlanRow extends RowDataPacket {
  plan_id: string; account_id: string; target_user_id: string; actor_user_id: string; expected_member_version: number | string;
  impact_digest: string; expires_at: string | Date; consumed_at: string | Date | null;
}
interface MemberRemovalSnapshot {
  readonly ownedAgents: readonly { readonly agentId: string; readonly name: string }[];
  readonly ownedRuntimes: readonly { readonly runtimeId: string; readonly name: string; readonly boundAgentIds: readonly string[] }[];
  readonly invocationTargetAgentIds: readonly string[];
  readonly pendingInvitationIds: readonly string[];
  readonly activeSessionCount: number;
}
interface AccountRuntimeRow extends RowDataPacket {
  runtime_id: string; account_id: string; owner_user_id: string; provider: string; adapter_id: string; name: string;
  visibility: "private" | "account"; health: RuntimeHealth; capabilities: string | RuntimeCapabilities; version: number | string;
  last_checked_at: string | Date | null; created_at: string | Date; updated_at: string | Date;
}
interface RuntimeDeletionSnapshot {
  readonly boundAgentIds: readonly string[];
  readonly activeAgentIds: readonly string[];
  readonly activeTasks: readonly { readonly taskId: string; readonly agentId: string }[];
}
interface RuntimeDeletionPlanRow extends RowDataPacket {
  plan_id: string; account_id: string; runtime_id: string; actor_user_id: string; expected_runtime_version: number | string;
  impact_digest: string; impact_snapshot: string | RuntimeDeletionSnapshot | null; expires_at: string | Date; consumed_at: string | Date | null;
}
interface ActiveRuntimeTaskRow extends RowDataPacket { task_id: string; agent_id: string }
interface AccountAgentRow extends RowDataPacket {
  agent_id: string; account_id: string; owner_user_id: string; runtime_id: string | null; name: string; description: string; avatar_url: string | null;
  permission_mode: "private" | "friends"; configuration: string | AgentConfiguration; version: number | string;
  archived_at: string | Date | null; archived_by_user_id: string | null; created_at: string | Date; updated_at: string | Date;
}
interface AccountAgentCatalogProjectionRow extends AccountAgentRow {
  owner_membership_id: string; owner_email: string; owner_role: "owner" | "admin" | "member"; owner_version: number | string;
  owner_joined_at: string | Date; owner_updated_at: string | Date; owner_display_name: string;
  joined_runtime_id: string | null; runtime_owner_user_id: string | null; runtime_provider: string | null; runtime_adapter_id: string | null;
  runtime_name: string | null; runtime_visibility: "private" | null; runtime_health: RuntimeHealth | null;
  runtime_capabilities: string | RuntimeCapabilities | null; runtime_version: number | string | null; runtime_last_checked_at: string | Date | null;
  runtime_created_at: string | Date | null; runtime_updated_at: string | Date | null;
  queued_tasks: number | string; working_tasks: number | string; run_count_30d: number | string | null; last_active_at: string | Date | null;
}
interface FriendAgentCatalogRow extends RowDataPacket {
  agent_id: string; name: string; description: string; avatar_url: string | null; configuration: string | AgentConfiguration;
  updated_at: string | Date; owner_user_id: string; owner_display_name: string;
  runtime_health: RuntimeHealth | null; runtime_last_checked_at: string | Date | null;
}
interface AgentActivityRow extends RowDataPacket {
  activity_id: string; account_id: string; agent_id: string; task_id: string; terminal_state: "completed" | "failed" | "canceled";
  failure_category: string | null; started_at: string | Date; completed_at: string | Date; duration_ms: number | string;
}
interface AccountSkillRow extends RowDataPacket {
  skill_id: string; account_id: string; runtime_id: string | null; name: string; description: string; origin: "account" | "runtime" | "agent";
  version: number | string; created_at: string | Date; updated_at: string | Date;
}
interface AccountA2ATaskRow extends RowDataPacket {
  task_id: string; account_id: string; origin_account_id: string; agent_id: string; origin_user_id: string; origin_credential_id: string;
  state: AccountA2ATaskState; created_at: string | Date; updated_at: string | Date;
}
interface AccountSelfTestRow extends RowDataPacket {
  self_test_id: string; account_id: string; agent_id: string; created_by_user_id: string;
  requester_principal_id: string; requester_credential_id: string; created_at: string | Date; expires_at: string | Date;
  revoked_at: string | Date | null;
}
interface AccountSkillValidationRow extends RowDataPacket { skill_id: string; origin: "account" | "runtime" | "agent"; runtime_id: string | null }
interface OwnerLoginRedemptionRow extends RowDataPacket {
  join_session_id: string; code_challenge: string; device_name: string; expires_at: string | Date;
  identity_issuer: string; subject_digest: string; display_name: string; identity_email: string | null; authenticated_at: string | Date | null; consumed_at: string | Date | null;
}
interface AccountMemberJoinRedemptionRow extends RowDataPacket {
  join_session_id: string; account_invitation_id: string; code_challenge: string; device_name: string; expires_at: string | Date;
  identity_issuer: string; subject_digest: string; display_name: string; identity_email: string | null;
  authenticated_at: string | Date | null; consumed_at: string | Date | null;
  account_id: string; invited_email: string; role: "owner" | "admin" | "member"; invitation_status: string;
  invitation_expires_at: string | Date; invitation_accepted_at: string | Date | null; invitation_revoked_at: string | Date | null;
}
interface CredentialRow extends RowDataPacket {
  credential_id: string; principal_id: string; instance_id: string; scopes: string | string[]; audience: string;
  expires_at: string | Date; kind: string; owner_principal_id: string | null;
  resource_agent_id: string | null;
}
function mapFriendInvitation(row: FriendInvitationRow): FriendInvitation {
  return friendInvitationSchema.parse({
    invitationId: row.invitation_id,
    inviterUserId: row.inviter_user_id,
    recipientEmail: row.recipient_email,
    ...(row.recipient_user_id ? { recipientUserId: row.recipient_user_id } : {}),
    status: row.status,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    ...(row.accepted_at ? { acceptedAt: toIso(row.accepted_at) } : {}),
    ...(row.rejected_at ? { rejectedAt: toIso(row.rejected_at) } : {}),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
    version: Number(row.version),
  });
}

function mapFriendship(row: FriendshipRow): Friendship {
  return friendshipSchema.parse({
    friendshipId: row.friendship_id,
    humanAUserId: row.human_a_user_id,
    humanBUserId: row.human_b_user_id,
    status: row.status,
    relationshipVersion: Number(row.relationship_version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
    version: Number(row.version),
  });
}

function friendInvitationPage(rows: readonly FriendInvitationProjectionRow[], direction: "incoming" | "outgoing", limit: number): RepositoryPage<FriendInvitationView> {
  const items = rows.map((row) => friendInvitationViewSchema.parse({
    direction,
    invitation: mapFriendInvitation(row),
    ...(row.other_display_name && row.other_email
      ? { otherHuman: { userId: direction === "incoming" ? row.inviter_user_id : row.recipient_user_id, displayName: row.other_display_name, email: row.other_email } }
      : {}),
  }));
  const last = rows.at(-1);
  return { items, ...(items.length === limit && last ? { nextCursor: { sortValue: toIso(last.created_at), id: last.invitation_id } } : {}) };
}

function normalizeHumanPair(first: string, second: string): readonly [string, string] {
  if (first === second) throw new MySqlPersistenceError("friend-invitation-unavailable");
  return first < second ? [first, second] : [second, first];
}

function mapAccountMember(row: AccountMemberProjectionRow): AccountMember {
  return accountMemberSchema.parse({
    membershipId: row.membership_id,
    accountId: row.account_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    joinedAt: toIso(row.joined_at),
    updatedAt: toIso(row.updated_at),
    version: Number(row.version),
  });
}

function mapAccountMemberInvitation(row: AccountMemberInvitationProjectionRow): MemberInvitation {
  return memberInvitationSchema.parse({
    invitationId: row.invitation_id,
    accountId: row.account_id,
    invitedEmail: row.invited_email,
    invitedByUserId: row.invited_by_user_id,
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    ...(row.accepted_at ? { acceptedAt: toIso(row.accepted_at) } : {}),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
    version: Number(row.version),
  });
}

function mapAccountRuntime(row: AccountRuntimeRow): AgentRuntime {
  return runtimeSchema.parse({
    runtimeId: row.runtime_id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    adapterId: row.adapter_id,
    name: row.name,
    visibility: row.visibility,
    health: row.health,
    capabilities: typeof row.capabilities === "string" ? JSON.parse(row.capabilities) : row.capabilities,
    version: Number(row.version),
    ...(row.last_checked_at ? { lastCheckedAt: toIso(row.last_checked_at) } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function mapAccountAgent(row: AccountAgentRow): Agent {
  return agentSchema.parse({
    agentId: row.agent_id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    description: row.description,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    ...(row.runtime_id ? { runtimeId: row.runtime_id } : {}),
    permissionMode: row.permission_mode,
    configuration: typeof row.configuration === "string" ? JSON.parse(row.configuration) : row.configuration,
    ...(row.archived_at ? { archivedAt: toIso(row.archived_at) } : {}),
    ...(row.archived_by_user_id ? { archivedByUserId: row.archived_by_user_id } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: Number(row.version),
  });
}

function mapAccountA2ATaskRoute(row: AccountA2ATaskRow): AccountA2ATaskRoute {
  return {
    taskId: row.task_id,
    accountId: row.account_id,
    originAccountId: row.origin_account_id,
    agentId: row.agent_id,
    originUserId: row.origin_user_id,
    originCredentialId: row.origin_credential_id,
    state: row.state,
  };
}

function mapAgentActivity(row: AgentActivityRow): AgentActivity {
  return {
    activityId: row.activity_id, accountId: row.account_id, agentId: row.agent_id, taskId: row.task_id, terminalState: row.terminal_state,
    ...(row.failure_category ? { failureCategory: row.failure_category } : {}), startedAt: toIso(row.started_at), completedAt: toIso(row.completed_at), durationMs: Number(row.duration_ms),
  };
}

function mapAccountSkill(row: AccountSkillRow): Skill {
  return {
    skillId: row.skill_id, accountId: row.account_id, name: row.name, description: row.description, origin: row.origin,
    ...(row.runtime_id ? { runtimeId: row.runtime_id } : {}), createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at), version: Number(row.version),
  };
}

function mapCatalogOwner(row: AccountAgentCatalogProjectionRow): HumanProfile {
  return { userId: row.owner_user_id, displayName: row.owner_display_name, email: row.owner_email };
}

function friendAgentAvailability(row: FriendAgentCatalogRow, freshnessCutoff: string): FriendAgentSummary["availability"] {
  if (!row.runtime_last_checked_at || Date.parse(toIso(row.runtime_last_checked_at)) < Date.parse(freshnessCutoff) || row.runtime_health === "offline") return "offline";
  return row.runtime_health === "ready" ? "online" : "unstable";
}

function friendCapabilitySummary(value: string | AgentConfiguration): readonly string[] {
  const parsedValue: unknown = typeof value === "string" ? JSON.parse(value) : value;
  const configuration = agentConfigurationSchema.safeParse(parsedValue);
  if (!configuration.success) return ["文本问答"];
  const result = ["文本问答"];
  if (configuration.data.skillIds.length > 0) result.push(`${configuration.data.skillIds.length} 个技能`);
  if (configuration.data.mcpConnections.length > 0) result.push(`${configuration.data.mcpConnections.length} 个 MCP 连接`);
  if (configuration.data.integrations.length > 0) result.push(`${configuration.data.integrations.length} 个集成`);
  return result;
}

function mapJoinedAccountRuntime(row: AccountAgentCatalogProjectionRow): AgentRuntime | undefined {
  if (!row.joined_runtime_id || !row.runtime_owner_user_id || !row.runtime_provider || !row.runtime_adapter_id || !row.runtime_name || !row.runtime_visibility || !row.runtime_health || !row.runtime_capabilities || row.runtime_version === null || !row.runtime_created_at || !row.runtime_updated_at) return undefined;
  return runtimeSchema.parse({
    runtimeId: row.joined_runtime_id, accountId: row.account_id, ownerUserId: row.runtime_owner_user_id, provider: row.runtime_provider,
    adapterId: row.runtime_adapter_id, name: row.runtime_name, visibility: row.runtime_visibility, health: row.runtime_health,
    capabilities: typeof row.runtime_capabilities === "string" ? JSON.parse(row.runtime_capabilities) : row.runtime_capabilities,
    ...(row.runtime_last_checked_at ? { lastCheckedAt: toIso(row.runtime_last_checked_at) } : {}), createdAt: toIso(row.runtime_created_at), updatedAt: toIso(row.runtime_updated_at), version: Number(row.runtime_version),
  });
}

function catalogStatus(agent: Agent, runtime: AgentRuntime | undefined, freshnessCutoff: string): AgentCatalogRow["status"] {
  if (agent.archivedAt) return "archived";
  if (!agent.runtimeId || !runtime) return "needs_runtime";
  if (!runtime.lastCheckedAt || Date.parse(runtime.lastCheckedAt) < Date.parse(freshnessCutoff) || runtime.health === "offline") return "offline";
  return runtime.health === "ready" ? "online" : "unstable";
}

function catalogSort(sort: AgentCatalogQuery["sort"]): { readonly expression: string; readonly direction: "ASC" | "DESC" } {
  if (sort === "name") return { expression: "LOWER(a.name)", direction: "ASC" };
  if (sort === "runs") return { expression: "COALESCE(activity.run_count_30d,0)", direction: "DESC" };
  if (sort === "created") return { expression: "a.created_at", direction: "DESC" };
  return { expression: "COALESCE(activity.last_active_at,'1970-01-01 00:00:00.000')", direction: "DESC" };
}

function catalogCursorSqlValue(sort: AgentCatalogQuery["sort"], value: string): string | number | Date {
  if (sort === "runs") {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new MySqlPersistenceError("agent-catalog-cursor-invalid");
    return parsed;
  }
  if (sort === "name") return value.toLocaleLowerCase();
  if (!Number.isFinite(Date.parse(value))) throw new MySqlPersistenceError("agent-catalog-cursor-invalid");
  return sqlDate(new Date(value).toISOString());
}

function catalogRowSortValue(row: AccountAgentCatalogProjectionRow, sort: AgentCatalogQuery["sort"]): string {
  if (sort === "runs") return String(Number(row.run_count_30d ?? 0));
  if (sort === "name") return row.name.toLocaleLowerCase();
  if (sort === "created") return toIso(row.created_at);
  return row.last_active_at ? toIso(row.last_active_at) : "1970-01-01T00:00:00.000Z";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function agentEtag(version: number): string {
  return `"agent:${version}"`;
}

function runtimeSkillPersistenceId(runtimeId: string, runtimeSkillId: string): string {
  return `runtime-skill:${createHash("sha256").update(`${runtimeId}\0${runtimeSkillId}`).digest("hex")}`;
}

function accountPageLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new MySqlPersistenceError("page-limit-invalid");
  return value;
}

function isDuplicateEntry(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ER_DUP_ENTRY");
}

function memberRemovalFingerprint(snapshot: MemberRemovalSnapshot): string {
  return hashCredential(JSON.stringify(snapshot));
}

function removalAuditCounts(snapshot: MemberRemovalSnapshot): Readonly<Record<string, number>> {
  return {
    ownedAgents: snapshot.ownedAgents.length,
    ownedRuntimes: snapshot.ownedRuntimes.length,
    invocationTargets: snapshot.invocationTargetAgentIds.length,
    pendingInvitations: snapshot.pendingInvitationIds.length,
    activeSessions: snapshot.activeSessionCount,
  };
}

function validateRemovalDispositions(snapshot: MemberRemovalSnapshot, input: ConfirmMemberRemovalRequest): void {
  const expectedAgents = new Set(snapshot.ownedAgents.map((agent) => agent.agentId));
  const suppliedAgents = input.agentDispositions.map((disposition) => disposition.agentId);
  const expectedRuntimes = new Set(snapshot.ownedRuntimes.map((runtime) => runtime.runtimeId));
  const suppliedRuntimes = input.runtimeDispositions.map((disposition) => disposition.runtimeId);
  const agentSet = new Set(suppliedAgents);
  const runtimeSet = new Set(suppliedRuntimes);
  if (agentSet.size !== suppliedAgents.length || agentSet.size !== expectedAgents.size || [...agentSet].some((id) => !expectedAgents.has(id))) throw new MySqlPersistenceError("member-removal-agent-disposition-required");
  if (runtimeSet.size !== suppliedRuntimes.length || runtimeSet.size !== expectedRuntimes.size || [...runtimeSet].some((id) => !expectedRuntimes.has(id))) throw new MySqlPersistenceError("member-removal-runtime-disposition-required");
}

function runtimeDeletionFingerprint(snapshot: RuntimeDeletionSnapshot): string {
  return hashCredential(JSON.stringify(snapshot));
}

function parseRuntimeDeletionSnapshot(value: RuntimeDeletionPlanRow["impact_snapshot"]): RuntimeDeletionSnapshot {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new MySqlPersistenceError("runtime-deletion-plan-unavailable");
  const snapshot = parsed as Partial<RuntimeDeletionSnapshot>;
  if (!Array.isArray(snapshot.boundAgentIds) || !Array.isArray(snapshot.activeAgentIds) || !Array.isArray(snapshot.activeTasks)) throw new MySqlPersistenceError("runtime-deletion-plan-unavailable");
  const bounded = [...snapshot.boundAgentIds, ...snapshot.activeAgentIds, ...snapshot.activeTasks.flatMap((task) => [task.taskId, task.agentId])];
  if (snapshot.boundAgentIds.length > 500 || snapshot.activeAgentIds.length > 500 || snapshot.activeTasks.length > 500 || bounded.some((value) => typeof value !== "string" || value.length === 0 || value.length > 191)) throw new MySqlPersistenceError("runtime-deletion-plan-unavailable");
  return { boundAgentIds: snapshot.boundAgentIds, activeAgentIds: snapshot.activeAgentIds, activeTasks: snapshot.activeTasks };
}

function sameIdentifiers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface AccountAgentMutation {
  readonly name: string;
  readonly description: string;
  readonly avatarUrl?: string;
  readonly runtimeId?: string;
  readonly permissionMode: Agent["permissionMode"];
  readonly configuration: AgentConfiguration;
}

interface AccountAgentUpdateMutation extends Omit<AccountAgentMutation, "configuration"> {
  readonly configuration: AgentEditableConfiguration | AgentConfiguration;
  readonly expectedVersion: number;
}

function emptyAgentConfiguration(): AgentConfiguration {
  return {
    instructions: "", maxConcurrentTasks: 1, skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [],
    customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [],
  };
}

function mergeEditableConfiguration(current: AgentConfiguration, update: AgentEditableConfiguration): AgentConfiguration {
  const merged: AgentConfiguration = {
    ...current,
    instructions: update.instructions,
    maxConcurrentTasks: update.maxConcurrentTasks,
  };
  if (update.model) merged.model = update.model; else delete merged.model;
  if (update.thinkingLevel) merged.thinkingLevel = update.thinkingLevel; else delete merged.thinkingLevel;
  if (update.serviceTier) merged.serviceTier = update.serviceTier; else delete merged.serviceTier;
  return merged;
}

function parseAccountAgentMutation(value: unknown, requireVersion: false): AccountAgentMutation;
function parseAccountAgentMutation(value: unknown, requireVersion: true): AccountAgentUpdateMutation;
function parseAccountAgentMutation(value: unknown, requireVersion: boolean): AccountAgentMutation | AccountAgentUpdateMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MySqlPersistenceError("account-agent-input-invalid");
  const body = value as Record<string, unknown>;
  const allowed = new Set(["name", "description", "avatarUrl", "runtimeId", "permissionMode", "configuration", ...(requireVersion ? ["expectedVersion"] : [])]);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new MySqlPersistenceError("account-agent-input-invalid");
  const expectedVersion = body.expectedVersion;
  if (requireVersion && (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1)) throw new MySqlPersistenceError("account-agent-input-invalid");
  const editableConfiguration = requireVersion ? agentEditableConfigurationSchema.safeParse(body.configuration) : undefined;
  const completeConfiguration = agentConfigurationSchema.safeParse(body.configuration);
  if (requireVersion ? !editableConfiguration?.success && !completeConfiguration.success : !completeConfiguration.success) throw new MySqlPersistenceError("account-agent-input-invalid");
  const parsed = agentSchema.parse({
    agentId: "agent:validation", accountId: "account:validation", ownerUserId: "human:validation",
    name: body.name, description: body.description, ...(body.avatarUrl ? { avatarUrl: body.avatarUrl } : {}),
    ...(typeof body.runtimeId === "string" && body.runtimeId ? { runtimeId: body.runtimeId } : {}),
    permissionMode: body.permissionMode,
    configuration: completeConfiguration.success ? completeConfiguration.data : emptyAgentConfiguration(),
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", version: 1,
  });
  const result = {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.avatarUrl ? { avatarUrl: parsed.avatarUrl } : {}),
    ...(parsed.runtimeId ? { runtimeId: parsed.runtimeId } : {}),
    permissionMode: parsed.permissionMode,
    configuration: completeConfiguration.success
      ? completeConfiguration.data
      : agentEditableConfigurationSchema.parse(body.configuration),
  };
  if (requireVersion) return { ...result, expectedVersion: Number(expectedVersion) } as AccountAgentUpdateMutation;
  return { ...result, configuration: agentConfigurationSchema.parse(result.configuration) };
}
