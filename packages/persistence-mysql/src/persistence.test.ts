import { describe, expect, it } from "vitest";

import { accountAgentA2AMySqlMigrationStatements, accountAgentCreationV8MySqlMigrationStatements, accountAgentMySqlMigrationStatements, accountRuntimeDeletionV7MySqlMigrationStatements, accountSelfTestV10MySqlMigrationStatements, applyHumanFriendshipV11Migration, humanFriendshipV11MySqlMigrationStatements, initialMySqlMigrationStatements, legacyMigrationRecoveryV9MySqlMigrationStatements, onboardingMySqlMigrationStatements, personalAgentMySqlMigrationStatements, selfServiceMySqlMigrationStatements } from "./migration.js";
import { hashCredential, MySqlStore } from "./store.js";

describe("MySQL persistence boundary", () => {
  const migrationSql = initialMySqlMigrationStatements.join("\n");

  it("contains every governance table and no raw content columns", () => {
    for (const table of ["fabric_instances", "principals", "credentials", "audit_events"]) {
      expect(migrationSql).toContain(`TABLE IF NOT EXISTS ${table}`);
    }
    expect(migrationSql).not.toMatch(/\b(prompt|answer|artifact_body|capsule_body|runtime_session|absolute_path)\b/iu);
  });

  it("stores only onboarding digests and bounded identity metadata", () => {
    const onboardingSql = onboardingMySqlMigrationStatements.join("\n");
    for (const table of ["external_identities", "invitations", "join_sessions"]) expect(onboardingSql).toContain(`TABLE IF NOT EXISTS ${table}`);
    expect(onboardingSql).toContain("subject_digest varchar(64) NOT NULL");
    expect(onboardingSql).not.toMatch(/\b(email|access_token|refresh_token|id_token|authorization_code|invitation_token|exchange_code|code_verifier)\b/iu);
  });

  it("binds self-service edge credentials without storing raw credentials", () => {
    const sql = selfServiceMySqlMigrationStatements.join("\n");
    expect(sql).toContain("resource_agent_id");
    expect(sql).toContain("purpose");
    expect(sql).not.toMatch(/\b(raw_token|google_token|code_verifier)\b/iu);
  });

  it("stores only public Personal Agent and message metadata in Cloud tables", () => {
    const sql = personalAgentMySqlMigrationStatements.join("\n");
    for (const table of ["personal_agents", "personal_agent_revisions", "personal_agent_invitations", "personal_agent_friendships", "personal_agent_presence", "personal_message_metadata"]) expect(sql).toContain(`TABLE IF NOT EXISTS ${table}`);
    expect(sql).toContain("public_agent_card json NOT NULL");
    expect(sql).toContain("context_digest varchar(64) NOT NULL");
    expect(sql).not.toMatch(/\b(message_body|request_text|reply_text|artifact_body|agent_spec|absolute_path|credential|runtime_handle|runtime_session|private_prompt|skill_config|mcp_config)\b/iu);
  });

  it("creates the Account-scoped multi-Agent v5 schema without a singular owner constraint", () => {
    const sql = accountAgentMySqlMigrationStatements.join("\n");
    for (const table of [
      "accounts",
      "account_memberships",
      "account_member_invitations",
      "account_runtimes",
      "account_agents",
      "agent_invocation_targets",
      "account_skills",
      "agent_skill_bindings",
      "agent_disabled_runtime_skills",
      "agent_builder_drafts",
      "agent_activities",
      "account_sessions",
      "account_member_removal_plans",
      "account_runtime_deletion_plans",
    ]) expect(sql).toContain(`TABLE IF NOT EXISTS ${table}`);
    expect(sql).not.toMatch(/UNIQUE KEY[^\n]+\(owner_user_id\)/u);
    expect(sql).toContain("UNIQUE KEY account_agent_scope_uidx (account_id, agent_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, owner_user_id) REFERENCES account_memberships(account_id, user_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, runtime_id) REFERENCES account_runtimes(account_id, runtime_id)");
  });

  it("enforces invitation, invocation-target and activity indexes without private Edge columns", () => {
    const sql = accountAgentMySqlMigrationStatements.join("\n");
    expect(sql).toContain("account_pending_invitation_uidx");
    expect(sql).toContain("agent_invocation_target_uidx");
    expect(sql).toContain("account_activity_recent_idx");
    expect(sql).toContain("agent_activity_bucket_idx");
    expect(sql).not.toMatch(/\b(runtime_session|runtime_handle|absolute_path|cwd|credential_value|environment_value|prompt_body|answer_body|artifact_body)\b/iu);
  });

  it("stores only Account A2A Task origin and state metadata in v6", () => {
    const sql = accountAgentA2AMySqlMigrationStatements.join("\n");
    expect(sql).toContain("TABLE IF NOT EXISTS account_agent_a2a_tasks");
    expect(sql).toContain("origin_credential_id");
    expect(sql).toContain("account_a2a_task_origin_idx");
    expect(sql).not.toMatch(/\b(prompt|question|answer|artifact|message_body|runtime_session|cwd|absolute_path|credential_value)\b/iu);
  });

  it("adds normalized Human friendship state and fail-closed legacy access migration in v11", () => {
    const sql = humanFriendshipV11MySqlMigrationStatements.join("\n");
    for (const table of ["human_friend_invitations", "human_friendships"]) expect(sql).toContain(`TABLE IF NOT EXISTS ${table}`);
    expect(sql).toContain("human_friendship_pair_uidx");
    expect(sql).toContain("LEAST(inviter_user_id,recipient_user_id)");
    expect(sql).toContain("status IN ('pending','accepted','rejected','revoked','expired')");
    expect(sql).toContain("SET permission_mode='private'");
    expect(sql).toContain("permission_mode IN ('private','friends')");
    expect(sql).toContain("origin_account_id");
    expect(sql).not.toMatch(/invitation_token|token_digest|prompt|answer|artifact_body|runtime_session|cwd|credential_value/iu);
  });

  it("resumes v11 after non-transactional DDL was partially applied", async () => {
    const executed: string[] = [];
    const columns = new Set(["origin_account_id"]);
    const constraints = new Set(["account_agents_permission_chk", "account_runtimes_visibility_chk"]);
    const indexes = new Set(["account_a2a_tasks_origin_user_fk", "account_a2a_task_origin_idx"]);
    const connection = {
      query: async (sql: string, values?: unknown[]): Promise<[unknown, unknown]> => {
        executed.push(sql);
        if (sql.includes("information_schema.COLUMNS")) return [[{ count: columns.has(String(values?.[1])) ? 1 : 0 }], []];
        if (sql.includes("information_schema.TABLE_CONSTRAINTS")) return [[{ count: constraints.has(String(values?.[1])) ? 1 : 0 }], []];
        if (sql.includes("information_schema.STATISTICS")) return [[{ count: indexes.has(String(values?.[1])) ? 1 : 0 }], []];
        if (sql.includes("DROP CHECK account_agents_permission_chk")) constraints.delete("account_agents_permission_chk");
        if (sql.includes("ADD CONSTRAINT account_agents_permission_chk")) constraints.add("account_agents_permission_chk");
        if (sql.includes("DROP CHECK account_runtimes_visibility_chk")) constraints.delete("account_runtimes_visibility_chk");
        if (sql.includes("ADD CONSTRAINT account_runtimes_visibility_chk")) constraints.add("account_runtimes_visibility_chk");
        if (sql.includes("DROP FOREIGN KEY account_a2a_tasks_origin_user_fk")) constraints.delete("account_a2a_tasks_origin_user_fk");
        if (sql.includes("DROP INDEX account_a2a_tasks_origin_user_fk")) indexes.delete("account_a2a_tasks_origin_user_fk");
        if (sql.includes("ADD CONSTRAINT account_a2a_tasks_origin_user_fk")) constraints.add("account_a2a_tasks_origin_user_fk");
        if (sql.includes("ADD CONSTRAINT account_a2a_tasks_origin_account_fk")) constraints.add("account_a2a_tasks_origin_account_fk");
        if (sql.includes("DROP INDEX account_a2a_task_origin_idx")) indexes.delete("account_a2a_task_origin_idx");
        if (sql.includes("ADD INDEX account_a2a_task_origin_idx")) indexes.add("account_a2a_task_origin_idx");
        return [[], []];
      },
    };

    await applyHumanFriendshipV11Migration(connection);

    expect(executed).not.toContain("ALTER TABLE account_agent_a2a_tasks ADD COLUMN origin_account_id varchar(191) NULL AFTER origin_user_id");
    expect(executed.indexOf("ALTER TABLE account_agent_a2a_tasks DROP INDEX account_a2a_tasks_origin_user_fk"))
      .toBeLessThan(executed.indexOf("ALTER TABLE account_agent_a2a_tasks ADD CONSTRAINT account_a2a_tasks_origin_user_fk FOREIGN KEY (origin_user_id) REFERENCES principals(principal_id)"));
    expect(constraints).toEqual(new Set([
      "account_agents_permission_chk",
      "account_runtimes_visibility_chk",
      "account_a2a_tasks_origin_user_fk",
      "account_a2a_tasks_origin_account_fk",
    ]));
    expect(indexes).toContain("account_a2a_task_origin_idx");
  });

  it("reports unsafe non-owner data without mutating it", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const connection = {
      query: async (sql: string) => sql.includes("non_owner_memberships") ? [[{
        non_owner_memberships: 1, non_owner_agents: 1, non_owner_runtimes: 0, non_owner_sessions: 1,
        pending_member_invitations: 2, legacy_shared_agents: 3,
      }], []] : [[], []],
      release: () => undefined,
    };
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await expect(store.auditHumanFriendshipMigration()).resolves.toEqual({
      nonOwnerMemberships: 1, nonOwnerAgents: 1, nonOwnerRuntimes: 0, nonOwnerSessions: 1,
      pendingMemberInvitations: 2, legacySharedAgents: 3, requiresHumanReview: true,
    });
  });

  it("stores only bounded Runtime deletion impact metadata in v7", () => {
    const sql = accountRuntimeDeletionV7MySqlMigrationStatements.join("\n");
    expect(sql).toContain("impact_snapshot json");
    expect(sql).not.toMatch(/prompt|answer|artifact|message_body|runtime_session|cwd|absolute_path|credential_value/iu);
  });

  it("adds bounded Agent creation idempotency and template deduplication in v8", () => {
    const sql = accountAgentCreationV8MySqlMigrationStatements.join("\n");
    expect(sql).toContain("create_idempotency_key");
    expect(sql).toContain("account_draft_create_idempotency_uidx");
    expect(sql).toContain("account_skill_template_ref_uidx");
    expect(sql).not.toMatch(/prompt|answer|artifact|runtime_session|cwd|absolute_path|credential_value/iu);
  });

  it("records only bounded migration recovery acknowledgement metadata in v9", () => {
    const sql = legacyMigrationRecoveryV9MySqlMigrationStatements.join("\n");
    expect(sql).toContain("personal_agent_migration_recovery_acknowledgements");
    expect(sql).toContain("acknowledged_fields json");
    expect(sql).not.toMatch(/credential_value|environment_value|runtime_handle|cwd/iu);
  });

  it("stores only an exact-Agent self-test credential binding in v10", () => {
    const sql = accountSelfTestV10MySqlMigrationStatements.join("\n");
    expect(sql).toContain("TABLE IF NOT EXISTS account_agent_self_tests");
    expect(sql).toContain("FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id)");
    expect(sql).toContain("FOREIGN KEY (requester_credential_id) REFERENCES credentials(credential_id)");
    expect(sql).toContain("requester_credential_id varchar(191) NOT NULL UNIQUE");
    expect(sql).not.toMatch(/prompt|question|answer|artifact|message_body|token_digest|credential_value|runtime_session|cwd|absolute_path/iu);
  });

  it("migrates each Personal Agent into an owner Account while retaining every legacy source row", () => {
    const sql = accountAgentMySqlMigrationStatements.join("\n");
    expect(sql).toContain("TABLE IF NOT EXISTS personal_agent_account_migrations");
    expect(sql).toContain("TABLE IF NOT EXISTS personal_agent_migration_backups");
    expect(sql).toContain("FROM personal_agents pa");
    expect(sql).toContain("LEFT JOIN personal_agent_revisions r ON r.revision_id=pa.active_revision_id");
    expect(sql).toContain("'private'");
    expect(sql).toMatch(/pa\.owner_human_id,\s+NULL,\s+COALESCE/u);
    expect(sql).toContain("retained_in_legacy_tables");
    expect(sql).not.toMatch(/\b(?:DELETE\s+FROM|DROP\s+TABLE|TRUNCATE\s+TABLE)\s+personal_/iu);
  });


  it("uses JSON only for bounded public projections and metadata", () => {
    expect(migrationSql).toContain("scopes json NOT NULL");
    expect(migrationSql).toContain("capabilities json NOT NULL");
    expect(migrationSql).toContain("usage_summary json NOT NULL");
  });

  it("stores credential digests instead of raw tokens", () => {
    expect(hashCredential("secret-token")).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashCredential("secret-token")).not.toContain("secret-token");
  });

  it("issues the desktop owner credential with management scope only", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let issuedScopes = "";
    let createdAccount = false;
    const connection = {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
      query: async () => [[{ instance_id: "instance:one" }], []],
      execute: async (statement: string, values?: readonly unknown[]) => {
        if (statement.includes("SELECT * FROM join_sessions")) return [[{
          join_session_id: "login:one", consumed_at: null, authenticated_at: "2026-08-13T00:00:00.000Z",
          code_challenge: "challenge", expires_at: "2026-08-14T00:00:00.000Z", identity_issuer: "https://accounts.google.com",
          subject_digest: "subject", display_name: "Alice", identity_email: "alice@example.com", device_name: "Alice Mac", purpose: "owner",
        }], []];
        if (statement.includes("SELECT principal_id FROM external_identities")) return [[{ principal_id: "human:alice" }], []];
        if (statement.includes("SELECT account_id, role, email FROM account_memberships")) return [[], []];
        if (statement.includes("INSERT INTO accounts")) createdAccount = true;
        if (statement.includes("INSERT INTO credentials")) issuedScopes = String(values?.[4]);
        return [{ affectedRows: 1 }, []];
      },
    };
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    await store.redeemOwnerLoginSession({ exchangeDigest: "exchange", codeChallenge: "challenge", audience: "https://fabric.example", credentialExpiresAt: "2026-11-10T00:00:00.000Z", now: "2026-08-13T01:00:00.000Z" });
    expect(JSON.parse(issuedScopes)).toEqual(["account:access"]);
    expect(createdAccount).toBe(true);
  });

  it("reuses the identity's single Account instead of creating another on later owner login", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    let createdAccount = false;
    let updatedMembershipEmail: readonly unknown[] | undefined;
    const connection = {
      beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
      query: async () => [[{ instance_id: "instance:one" }], []],
      execute: async (statement: string, values?: readonly unknown[]) => {
        if (statement.includes("SELECT * FROM join_sessions")) return [[{
          join_session_id: "login:two", consumed_at: null, authenticated_at: "2026-08-13T00:00:00.000Z", code_challenge: "challenge",
          expires_at: "2026-08-14T00:00:00.000Z", identity_issuer: "https://accounts.google.com", subject_digest: "subject",
          display_name: "Alice", identity_email: "alice@example.com", device_name: "Alice Mac", purpose: "owner",
        }], []];
        if (statement.includes("SELECT principal_id FROM external_identities")) return [[{ principal_id: "human:alice" }], []];
        if (statement.includes("SELECT account_id, role, email FROM account_memberships")) return [[{ account_id: "account:existing", role: "owner", email: "migrated+owner@invalid.agent-fabric.local" }], []];
        if (statement.includes("INSERT INTO accounts")) createdAccount = true;
        if (statement.includes("UPDATE account_memberships SET email=")) updatedMembershipEmail = values;
        return [{ affectedRows: 1 }, []];
      },
    };
    Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });

    const result = await store.redeemOwnerLoginSession({ exchangeDigest: "exchange", codeChallenge: "challenge", audience: "https://fabric.example", credentialExpiresAt: "2026-11-10T00:00:00.000Z", now: "2026-08-13T01:00:00.000Z" });
    expect(result).toMatchObject({ accountId: "account:existing", humanPrincipalId: "human:alice" });
    expect(createdAccount).toBe(false);
    expect(updatedMembershipEmail).toEqual(["alice@example.com", new Date("2026-08-13T01:00:00.000Z"), "account:existing", "human:alice"]);
  });

  it("accepts an Account invitation only for its exact OIDC email and issues Account-only scope", async () => {
    const redemptionRow = {
      join_session_id: "account-join:one", account_invitation_id: "account-invitation:one", consumed_at: null as string | null,
      authenticated_at: "2026-08-13T00:00:00.000Z", code_challenge: "challenge", expires_at: "2026-08-14T00:00:00.000Z",
      identity_issuer: "https://accounts.google.com", subject_digest: "subject:bob", display_name: "Bob", identity_email: "bob@example.com",
      device_name: "Bob Mac", account_id: "account:one", invited_email: "bob@example.com", role: "member", invitation_status: "pending",
      invitation_expires_at: "2026-09-01T00:00:00.000Z", invitation_accepted_at: null, invitation_revoked_at: null,
    };
    const createStore = (row: typeof redemptionRow) => {
      const store = new MySqlStore("mysql://unused:unused@localhost/unused");
      let issuedScopes = "";
      const connection = {
        beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
        query: async () => [[{ instance_id: "instance:one" }], []],
        execute: async (statement: string, values?: readonly unknown[]) => {
          if (statement.includes("JOIN account_member_invitations")) return [[row], []];
          if (statement.includes("SELECT principal_id FROM external_identities")) return [[{ principal_id: "human:bob" }], []];
          if (statement.includes("SELECT account_id,role,email FROM account_memberships")) return [[], []];
          if (statement.includes("INSERT INTO credentials")) issuedScopes = String(values?.[4]);
          return [{ affectedRows: 1 }, []];
        },
      };
      Object.defineProperty(store, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
      return { store, issuedScopes: () => issuedScopes };
    };
    const accepted = createStore(redemptionRow);
    const result = await accepted.store.redeemAccountMemberLoginSession({ exchangeDigest: "exchange", codeChallenge: "challenge", audience: "https://fabric.example", credentialExpiresAt: "2026-11-10T00:00:00.000Z", now: "2026-08-13T01:00:00.000Z" });
    expect(result).toMatchObject({ accountId: "account:one", role: "member", humanPrincipalId: "human:bob" });
    expect(JSON.parse(accepted.issuedScopes())).toEqual(["account:access"]);

    const rejected = createStore({ ...redemptionRow, identity_email: "mallory@example.com" });
    await expect(rejected.store.redeemAccountMemberLoginSession({ exchangeDigest: "exchange", codeChallenge: "challenge", audience: "https://fabric.example", credentialExpiresAt: "2026-11-10T00:00:00.000Z", now: "2026-08-13T01:00:00.000Z" })).rejects.toThrow("account-join-exchange-denied");
    const replayed = createStore({ ...redemptionRow, consumed_at: "2026-08-13T00:30:00.000Z" });
    await expect(replayed.store.redeemAccountMemberLoginSession({ exchangeDigest: "exchange", codeChallenge: "challenge", audience: "https://fabric.example", credentialExpiresAt: "2026-11-10T00:00:00.000Z", now: "2026-08-13T01:00:00.000Z" })).rejects.toThrow("account-join-exchange-denied");
  });

  it("recovers a persisted Account session after restart, rejects expiry, and revokes both session and credential", async () => {
    const recoveredStore = new MySqlStore("mysql://unused:unused@localhost/unused");
    let sessionRow: Record<string, unknown> | undefined = {
      session_id: "session:one", credential_id: "credential:one", account_id: "account:one", user_id: "human:alice",
      display_name: "Alice", email: "alice@example.com", role: "owner", created_at: "2026-08-13T00:00:00.000Z",
      expires_at: "2026-11-10T00:00:00.000Z", last_seen_at: "2026-08-13T00:00:00.000Z", revoked_at: null, credential_revoked_at: null,
    };
    Object.defineProperty(recoveredStore, "pool", { value: {
      execute: async (statement: string) => statement.includes("FROM account_sessions") ? [[...(sessionRow ? [sessionRow] : [])], []] : [{ affectedRows: 1 }, []],
      end: async () => undefined,
    } });
    await expect(recoveredStore.getAccountSessionByCredential("credential:one", "2026-08-13T01:00:00.000Z")).resolves.toMatchObject({ accountId: "account:one", userId: "human:alice", lastSeenAt: "2026-08-13T01:00:00.000Z" });
    sessionRow = undefined;
    await expect(recoveredStore.getAccountSessionByCredential("credential:one", "2026-11-11T00:00:00.000Z")).rejects.toThrow("account-session-unavailable");

    const revokedSql: string[] = [];
    const connection = {
      beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined,
      execute: async (statement: string) => { revokedSql.push(statement); return [{ affectedRows: 1 }, []]; },
    };
    const revokeStore = new MySqlStore("mysql://unused:unused@localhost/unused");
    Object.defineProperty(revokeStore, "pool", { value: { getConnection: async () => connection, end: async () => undefined } });
    await revokeStore.revokeCredential("credential:one", "2026-08-13T02:00:00.000Z");
    expect(revokedSql).toEqual(expect.arrayContaining([
      expect.stringContaining("UPDATE credentials SET revoked_at"),
      expect.stringContaining("UPDATE account_sessions SET revoked_at"),
    ]));
  });

  it("binds credential authentication to exact audience and required scope", async () => {
    const store = new MySqlStore("mysql://unused:unused@localhost/unused");
    const row = { credential_id: "credential:one", principal_id: "device:one", instance_id: "instance:one", scopes: JSON.stringify(["account:access"]), audience: "https://agents.example", expires_at: "2026-11-10T00:00:00.000Z", resource_agent_id: null, kind: "device", owner_principal_id: "human:alice" };
    Object.defineProperty(store, "pool", { value: { execute: async () => [[row], []], end: async () => undefined } });
    await expect(store.authenticate("secret", "https://other.example", "account:access")).rejects.toThrow("credential-invalid");
    await expect(store.authenticate("secret", "https://agents.example", "account:self-test")).rejects.toThrow("credential-scope-denied");
    await expect(store.authenticate("secret", "https://agents.example", "account:access")).resolves.toMatchObject({ principalId: "device:one", ownerPrincipalId: "human:alice" });
  });
});
