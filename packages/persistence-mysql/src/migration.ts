export const initialMySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS fabric_instances (
    instance_id varchar(191) PRIMARY KEY,
    public_base_url text NOT NULL,
    created_at datetime(3) NOT NULL,
    bootstrap_consumed_at datetime(3) NOT NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS principals (
    principal_id varchar(191) PRIMARY KEY,
    kind varchar(32) NOT NULL,
    owner_principal_id varchar(191),
    display_name text NOT NULL,
    created_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    CONSTRAINT principals_owner_fk FOREIGN KEY (owner_principal_id) REFERENCES principals(principal_id),
    CONSTRAINT principals_kind_chk CHECK (kind IN ('human', 'device', 'agent', 'service'))
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS credentials (
    credential_id varchar(191) PRIMARY KEY,
    principal_id varchar(191) NOT NULL,
    instance_id varchar(191) NOT NULL,
    token_digest varchar(64) NOT NULL UNIQUE,
    scopes json NOT NULL,
    audience text NOT NULL,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    CONSTRAINT credentials_principal_fk FOREIGN KEY (principal_id) REFERENCES principals(principal_id),
    CONSTRAINT credentials_instance_fk FOREIGN KEY (instance_id) REFERENCES fabric_instances(instance_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS agents (
    agent_id varchar(191) PRIMARY KEY,
    owner_principal_id varchar(191) NOT NULL,
    display_name text NOT NULL,
    created_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    CONSTRAINT agents_owner_fk FOREIGN KEY (owner_principal_id) REFERENCES principals(principal_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS public_revisions (
    revision_id varchar(191) PRIMARY KEY,
    agent_id varchar(191) NOT NULL,
    title text NOT NULL,
    coverage varchar(32) NOT NULL,
    capsule_digest varchar(191) NOT NULL,
    capabilities json NOT NULL,
    capability_fingerprint varchar(191) NOT NULL,
    disclosure json NOT NULL,
    created_at datetime(3) NOT NULL,
    CONSTRAINT public_revisions_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
    CONSTRAINT public_revisions_coverage_chk CHECK (coverage IN ('full', 'partial', 'compacted'))
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS deployments (
    deployment_id varchar(191) PRIMARY KEY,
    agent_id varchar(191) NOT NULL,
    revision_id varchar(191) NOT NULL,
    device_id varchar(191) NOT NULL,
    state varchar(32) NOT NULL,
    component json NOT NULL,
    connected_at datetime(3),
    last_seen_at datetime(3) NOT NULL,
    INDEX deployments_agent_state_idx (agent_id, state),
    CONSTRAINT deployments_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
    CONSTRAINT deployments_revision_fk FOREIGN KEY (revision_id) REFERENCES public_revisions(revision_id),
    CONSTRAINT deployments_device_fk FOREIGN KEY (device_id) REFERENCES principals(principal_id),
    CONSTRAINT deployments_state_chk CHECK (state IN ('online', 'offline', 'incompatible', 'revoked'))
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS grants (
    grant_id varchar(191) PRIMARY KEY,
    owner_principal_id varchar(191) NOT NULL,
    requester_principal_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    revision_id varchar(191),
    capabilities json NOT NULL,
    valid_from datetime(3) NOT NULL,
    expires_at datetime(3) NOT NULL,
    max_tasks integer NOT NULL,
    consumed_tasks integer NOT NULL DEFAULT 0,
    revocation_version integer NOT NULL DEFAULT 0,
    revoked_at datetime(3),
    INDEX grants_requester_agent_idx (requester_principal_id, agent_id),
    CONSTRAINT grants_owner_fk FOREIGN KEY (owner_principal_id) REFERENCES principals(principal_id),
    CONSTRAINT grants_requester_fk FOREIGN KEY (requester_principal_id) REFERENCES principals(principal_id),
    CONSTRAINT grants_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
    CONSTRAINT grants_revision_fk FOREIGN KEY (revision_id) REFERENCES public_revisions(revision_id),
    CONSTRAINT grants_max_tasks_chk CHECK (max_tasks > 0),
    CONSTRAINT grants_consumed_tasks_chk CHECK (consumed_tasks >= 0),
    CONSTRAINT grants_revocation_version_chk CHECK (revocation_version >= 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS task_metadata (
    task_id varchar(191) PRIMARY KEY,
    context_digest varchar(64) NOT NULL,
    requester_principal_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    revision_id varchar(191) NOT NULL,
    grant_id varchar(191) NOT NULL,
    idempotency_key varchar(191) NOT NULL UNIQUE,
    state varchar(64) NOT NULL,
    error_category varchar(191),
    usage_summary json NOT NULL,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    INDEX task_metadata_requester_idx (requester_principal_id, updated_at),
    CONSTRAINT task_metadata_requester_fk FOREIGN KEY (requester_principal_id) REFERENCES principals(principal_id),
    CONSTRAINT task_metadata_agent_fk FOREIGN KEY (agent_id) REFERENCES agents(agent_id),
    CONSTRAINT task_metadata_revision_fk FOREIGN KEY (revision_id) REFERENCES public_revisions(revision_id),
    CONSTRAINT task_metadata_grant_fk FOREIGN KEY (grant_id) REFERENCES grants(grant_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    audit_id varchar(191) PRIMARY KEY,
    actor_principal_id varchar(191),
    action varchar(191) NOT NULL,
    target_type varchar(191) NOT NULL,
    target_id varchar(191) NOT NULL,
    outcome varchar(64) NOT NULL,
    metadata json NOT NULL,
    created_at datetime(3) NOT NULL
  ) ENGINE=InnoDB`,
] as const;

export const onboardingMySqlMigrationStatements = [] as const;

export const selfServiceMySqlMigrationStatements = [
  "ALTER TABLE credentials ADD COLUMN resource_agent_id varchar(191) NULL",
  "ALTER TABLE credentials ADD INDEX credentials_resource_agent_idx (resource_agent_id)",
  "ALTER TABLE credentials ADD CONSTRAINT credentials_resource_agent_fk FOREIGN KEY (resource_agent_id) REFERENCES agents(agent_id)",
] as const;

export const personalAgentMySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS personal_agents (
    agent_id varchar(191) PRIMARY KEY,
    owner_human_id varchar(191) NOT NULL UNIQUE,
    active_revision_id varchar(191),
    stopped_at datetime(3),
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    CONSTRAINT personal_agents_owner_fk FOREIGN KEY (owner_human_id) REFERENCES principals(principal_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_agent_revisions (
    revision_id varchar(191) PRIMARY KEY,
    agent_id varchar(191) NOT NULL,
    revision_number integer NOT NULL,
    public_name varchar(120) NOT NULL,
    public_description varchar(1000) NOT NULL,
    public_capability_tags json NOT NULL,
    public_agent_card json NOT NULL,
    created_at datetime(3) NOT NULL,
    UNIQUE KEY personal_revision_number_uidx (agent_id, revision_number),
    CONSTRAINT personal_revisions_agent_fk FOREIGN KEY (agent_id) REFERENCES personal_agents(agent_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_agent_invitations (
    invitation_id varchar(191) PRIMARY KEY,
    owner_human_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    token_digest varchar(64) NOT NULL UNIQUE,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    consumed_at datetime(3),
    revoked_at datetime(3),
    CONSTRAINT personal_invitations_owner_fk FOREIGN KEY (owner_human_id) REFERENCES principals(principal_id),
    CONSTRAINT personal_invitations_agent_fk FOREIGN KEY (agent_id) REFERENCES personal_agents(agent_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_agent_friendships (
    friendship_id varchar(191) PRIMARY KEY,
    agent_a_id varchar(191) NOT NULL,
    agent_b_id varchar(191) NOT NULL,
    status varchar(16) NOT NULL,
    revocation_version integer NOT NULL DEFAULT 0,
    created_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    UNIQUE KEY personal_friendship_pair_uidx (agent_a_id, agent_b_id),
    CONSTRAINT personal_friendships_a_fk FOREIGN KEY (agent_a_id) REFERENCES personal_agents(agent_id),
    CONSTRAINT personal_friendships_b_fk FOREIGN KEY (agent_b_id) REFERENCES personal_agents(agent_id),
    CONSTRAINT personal_friendships_status_chk CHECK (status IN ('active','revoked'))
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_agent_presence (
    agent_id varchar(191) PRIMARY KEY,
    revision_id varchar(191) NOT NULL,
    connected boolean NOT NULL,
    runtime_healthy boolean NOT NULL,
    observed_at datetime(3) NOT NULL,
    CONSTRAINT personal_presence_agent_fk FOREIGN KEY (agent_id) REFERENCES personal_agents(agent_id),
    CONSTRAINT personal_presence_revision_fk FOREIGN KEY (revision_id) REFERENCES personal_agent_revisions(revision_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_message_metadata (
    message_id varchar(191) PRIMARY KEY,
    task_id varchar(191) NOT NULL,
    context_digest varchar(64) NOT NULL,
    source_agent_id varchar(191) NOT NULL,
    target_agent_id varchar(191) NOT NULL,
    status varchar(32) NOT NULL,
    reason_code varchar(64),
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    INDEX personal_message_source_idx (source_agent_id, updated_at),
    INDEX personal_message_target_idx (target_agent_id, updated_at),
    CONSTRAINT personal_message_source_fk FOREIGN KEY (source_agent_id) REFERENCES personal_agents(agent_id),
    CONSTRAINT personal_message_target_fk FOREIGN KEY (target_agent_id) REFERENCES personal_agents(agent_id),
    CONSTRAINT personal_message_status_chk CHECK (status IN ('sent','received','processing','replied','needs_attention','failed','offline'))
  ) ENGINE=InnoDB`,
] as const;

export const accountAgentMySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS accounts (
    account_id varchar(191) PRIMARY KEY,
    name varchar(120) NOT NULL,
    version integer NOT NULL DEFAULT 1,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    CONSTRAINT accounts_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_memberships (
    membership_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    user_id varchar(191) NOT NULL,
    email varchar(320) NOT NULL,
    role varchar(16) NOT NULL,
    version integer NOT NULL DEFAULT 1,
    joined_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    UNIQUE KEY account_membership_user_uidx (account_id, user_id),
    INDEX account_membership_role_idx (account_id, role),
    CONSTRAINT account_memberships_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_memberships_user_fk FOREIGN KEY (user_id) REFERENCES principals(principal_id),
    CONSTRAINT account_memberships_role_chk CHECK (role IN ('owner','admin','member')),
    CONSTRAINT account_memberships_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_member_invitations (
    invitation_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    invited_email varchar(320) NOT NULL,
    invited_email_digest varchar(64) NOT NULL,
    invited_by_user_id varchar(191) NOT NULL,
    role varchar(16) NOT NULL,
    status varchar(16) NOT NULL,
    token_digest varchar(64) NOT NULL UNIQUE,
    active_invitation_key varchar(64) GENERATED ALWAYS AS (CASE WHEN status='pending' THEN invited_email_digest ELSE NULL END) STORED,
    version integer NOT NULL DEFAULT 1,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    accepted_at datetime(3),
    revoked_at datetime(3),
    UNIQUE KEY account_pending_invitation_uidx (account_id, active_invitation_key),
    INDEX account_invitation_status_idx (account_id, status, expires_at),
    CONSTRAINT account_invitations_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_invitations_inviter_fk FOREIGN KEY (invited_by_user_id) REFERENCES principals(principal_id),
    CONSTRAINT account_invitations_role_chk CHECK (role IN ('owner','admin','member')),
    CONSTRAINT account_invitations_status_chk CHECK (status IN ('pending','accepted','revoked','expired')),
    CONSTRAINT account_invitations_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_runtimes (
    runtime_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    owner_user_id varchar(191) NOT NULL,
    provider varchar(191) NOT NULL,
    adapter_id varchar(191) NOT NULL,
    name varchar(120) NOT NULL,
    visibility varchar(16) NOT NULL,
    health varchar(32) NOT NULL,
    capabilities json NOT NULL,
    version integer NOT NULL DEFAULT 1,
    last_checked_at datetime(3),
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    UNIQUE KEY account_runtime_scope_uidx (account_id, runtime_id),
    INDEX account_runtime_owner_idx (account_id, owner_user_id, updated_at),
    INDEX account_runtime_health_idx (account_id, health, updated_at),
    CONSTRAINT account_runtimes_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_runtimes_owner_fk FOREIGN KEY (account_id, owner_user_id) REFERENCES account_memberships(account_id, user_id),
    CONSTRAINT account_runtimes_visibility_chk CHECK (visibility IN ('private','account')),
    CONSTRAINT account_runtimes_health_chk CHECK (health IN ('checking','ready','auth_required','unavailable','offline')),
    CONSTRAINT account_runtimes_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_agents (
    agent_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    owner_user_id varchar(191) NOT NULL,
    runtime_id varchar(191),
    name varchar(120) NOT NULL,
    description varchar(1000) NOT NULL,
    avatar_url text,
    permission_mode varchar(16) NOT NULL,
    configuration json NOT NULL,
    version integer NOT NULL DEFAULT 1,
    archived_at datetime(3),
    archived_by_user_id varchar(191),
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    UNIQUE KEY account_agent_scope_uidx (account_id, agent_id),
    INDEX account_agent_owner_idx (account_id, owner_user_id, archived_at, updated_at),
    INDEX account_agent_runtime_idx (account_id, runtime_id, archived_at),
    INDEX account_agent_name_idx (account_id, name, agent_id),
    CONSTRAINT account_agents_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_agents_owner_fk FOREIGN KEY (account_id, owner_user_id) REFERENCES account_memberships(account_id, user_id),
    CONSTRAINT account_agents_runtime_fk FOREIGN KEY (account_id, runtime_id) REFERENCES account_runtimes(account_id, runtime_id),
    CONSTRAINT account_agents_archiver_fk FOREIGN KEY (archived_by_user_id) REFERENCES principals(principal_id),
    CONSTRAINT account_agents_permission_chk CHECK (permission_mode IN ('private','targeted','account')),
    CONSTRAINT account_agents_archive_pair_chk CHECK ((archived_at IS NULL AND archived_by_user_id IS NULL) OR (archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL)),
    CONSTRAINT account_agents_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS agent_invocation_targets (
    invocation_target_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    target_type varchar(16) NOT NULL,
    target_user_id varchar(191),
    target_key varchar(383) GENERATED ALWAYS AS (CASE WHEN target_type='account' THEN CONCAT('account:', account_id) ELSE CONCAT('member:', account_id, ':', target_user_id) END) STORED,
    created_at datetime(3) NOT NULL,
    UNIQUE KEY agent_invocation_target_uidx (agent_id, target_key),
    INDEX invocation_target_member_idx (account_id, target_user_id, agent_id),
    CONSTRAINT invocation_targets_agent_fk FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT invocation_targets_member_fk FOREIGN KEY (account_id, target_user_id) REFERENCES account_memberships(account_id, user_id),
    CONSTRAINT invocation_targets_shape_chk CHECK ((target_type='account' AND target_user_id IS NULL) OR (target_type='member' AND target_user_id IS NOT NULL))
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_skills (
    skill_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    runtime_id varchar(191),
    name varchar(120) NOT NULL,
    description varchar(1000) NOT NULL,
    origin varchar(16) NOT NULL,
    version integer NOT NULL DEFAULT 1,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    UNIQUE KEY account_skill_scope_uidx (account_id, skill_id),
    INDEX account_skill_origin_idx (account_id, origin, name),
    CONSTRAINT account_skills_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_skills_runtime_fk FOREIGN KEY (account_id, runtime_id) REFERENCES account_runtimes(account_id, runtime_id),
    CONSTRAINT account_skills_origin_chk CHECK (origin IN ('account','runtime','agent')),
    CONSTRAINT account_skills_runtime_shape_chk CHECK ((origin='runtime' AND runtime_id IS NOT NULL) OR (origin<>'runtime' AND runtime_id IS NULL)),
    CONSTRAINT account_skills_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS agent_skill_bindings (
    account_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    skill_id varchar(191) NOT NULL,
    created_at datetime(3) NOT NULL,
    PRIMARY KEY (agent_id, skill_id),
    CONSTRAINT agent_skill_bindings_agent_fk FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT agent_skill_bindings_skill_fk FOREIGN KEY (account_id, skill_id) REFERENCES account_skills(account_id, skill_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS agent_disabled_runtime_skills (
    account_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    skill_id varchar(191) NOT NULL,
    created_at datetime(3) NOT NULL,
    PRIMARY KEY (agent_id, skill_id),
    CONSTRAINT disabled_runtime_skills_agent_fk FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT disabled_runtime_skills_skill_fk FOREIGN KEY (account_id, skill_id) REFERENCES account_skills(account_id, skill_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS agent_builder_drafts (
    draft_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    owner_user_id varchar(191) NOT NULL,
    mode varchar(16) NOT NULL,
    template_id varchar(191),
    state varchar(16) NOT NULL,
    draft json NOT NULL,
    created_agent_id varchar(191),
    version integer NOT NULL DEFAULT 1,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    UNIQUE KEY account_draft_scope_uidx (account_id, draft_id),
    INDEX account_draft_owner_idx (account_id, owner_user_id, state, updated_at),
    INDEX account_draft_expiry_idx (expires_at, state),
    CONSTRAINT agent_builder_drafts_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT agent_builder_drafts_owner_fk FOREIGN KEY (account_id, owner_user_id) REFERENCES account_memberships(account_id, user_id),
    CONSTRAINT agent_builder_drafts_created_agent_fk FOREIGN KEY (account_id, created_agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT agent_builder_drafts_mode_chk CHECK (mode IN ('blank','template','ai')),
    CONSTRAINT agent_builder_drafts_state_chk CHECK (state IN ('active','creating','failed','created')),
    CONSTRAINT agent_builder_drafts_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS agent_activities (
    activity_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    task_id varchar(191) NOT NULL,
    terminal_state varchar(16) NOT NULL,
    failure_category varchar(191),
    started_at datetime(3) NOT NULL,
    completed_at datetime(3) NOT NULL,
    duration_ms bigint NOT NULL,
    UNIQUE KEY agent_activity_task_uidx (agent_id, task_id),
    INDEX account_activity_recent_idx (account_id, completed_at, agent_id),
    INDEX agent_activity_bucket_idx (account_id, agent_id, terminal_state, completed_at),
    CONSTRAINT agent_activities_agent_fk FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT agent_activities_state_chk CHECK (terminal_state IN ('completed','failed','canceled')),
    CONSTRAINT agent_activities_duration_chk CHECK (duration_ms >= 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_agent_account_migrations (
    legacy_agent_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    account_agent_id varchar(191) NOT NULL,
    migrated_at datetime(3) NOT NULL,
    UNIQUE KEY migrated_account_agent_uidx (account_id, account_agent_id),
    CONSTRAINT personal_migration_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT personal_migration_agent_fk FOREIGN KEY (account_id, account_agent_id) REFERENCES account_agents(account_id, agent_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS personal_agent_migration_backups (
    backup_id varchar(191) PRIMARY KEY,
    legacy_agent_id varchar(191) NOT NULL,
    source_kind varchar(32) NOT NULL,
    source_id varchar(191) NOT NULL,
    retained_payload json NOT NULL,
    retained_in_legacy_tables boolean NOT NULL DEFAULT true,
    created_at datetime(3) NOT NULL,
    UNIQUE KEY personal_migration_backup_source_uidx (source_kind, source_id),
    INDEX personal_migration_backup_agent_idx (legacy_agent_id, source_kind),
    CONSTRAINT personal_migration_backup_agent_fk FOREIGN KEY (legacy_agent_id) REFERENCES personal_agents(agent_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_sessions (
    session_id varchar(191) PRIMARY KEY,
    credential_id varchar(191) NOT NULL UNIQUE,
    account_id varchar(191) NOT NULL,
    user_id varchar(191) NOT NULL,
    created_at datetime(3) NOT NULL,
    expires_at datetime(3) NOT NULL,
    last_seen_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    INDEX account_sessions_account_user_idx (account_id, user_id, expires_at),
    CONSTRAINT account_sessions_credential_fk FOREIGN KEY (credential_id) REFERENCES credentials(credential_id),
    CONSTRAINT account_sessions_member_fk FOREIGN KEY (user_id) REFERENCES principals(principal_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_member_removal_plans (
    plan_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    target_user_id varchar(191) NOT NULL,
    actor_user_id varchar(191) NOT NULL,
    expected_member_version integer NOT NULL,
    impact_digest varchar(64) NOT NULL,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    consumed_at datetime(3),
    INDEX account_member_removal_target_idx (account_id, target_user_id, expires_at),
    CONSTRAINT account_member_removal_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_member_removal_version_chk CHECK (expected_member_version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_runtime_deletion_plans (
    plan_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    runtime_id varchar(191) NOT NULL,
    actor_user_id varchar(191) NOT NULL,
    expected_runtime_version integer NOT NULL,
    impact_digest varchar(64) NOT NULL,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    consumed_at datetime(3),
    INDEX account_runtime_deletion_target_idx (account_id, runtime_id, expires_at),
    CONSTRAINT account_runtime_deletion_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT account_runtime_deletion_version_chk CHECK (expected_runtime_version > 0)
  ) ENGINE=InnoDB`,
  `INSERT IGNORE INTO accounts(account_id, name, version, created_at, updated_at)
   SELECT CONCAT('account:migrated:', SHA2(pa.owner_human_id, 256)),
          CONCAT(COALESCE(p.display_name, 'Migrated owner'), ' Account'),
          1, pa.created_at, pa.updated_at
   FROM personal_agents pa
   JOIN principals p ON p.principal_id=pa.owner_human_id`,
  `INSERT IGNORE INTO account_memberships(membership_id, account_id, user_id, email, role, version, joined_at, updated_at)
   SELECT CONCAT('membership:migrated:', SHA2(pa.owner_human_id, 256)),
          CONCAT('account:migrated:', SHA2(pa.owner_human_id, 256)),
          pa.owner_human_id,
          CONCAT('migrated+', SHA2(pa.owner_human_id, 256), '@invalid.agent-fabric.local'),
          'owner', 1, pa.created_at, pa.updated_at
   FROM personal_agents pa`,
  `INSERT IGNORE INTO account_agents(
     agent_id, account_id, owner_user_id, runtime_id, name, description, avatar_url,
     permission_mode, configuration, version, archived_at, archived_by_user_id, created_at, updated_at
   )
   SELECT pa.agent_id,
          CONCAT('account:migrated:', SHA2(pa.owner_human_id, 256)),
          pa.owner_human_id,
          NULL,
          COALESCE(NULLIF(r.public_name, ''), 'Migrated Agent'),
          COALESCE(r.public_description, ''),
          NULL,
          'private',
          JSON_OBJECT(
            'instructions', '',
            'maxConcurrentTasks', 1,
            'skillIds', JSON_ARRAY(),
            'disabledRuntimeSkillIds', JSON_ARRAY(),
            'environmentVariableNames', JSON_ARRAY(),
            'customArguments', JSON_ARRAY(),
            'runtimeConfiguration', JSON_OBJECT(),
            'mcpConnections', JSON_ARRAY(),
            'integrations', JSON_ARRAY()
          ),
          1,
          CASE WHEN pa.stopped_at IS NOT NULL THEN pa.stopped_at ELSE NULL END,
          CASE WHEN pa.stopped_at IS NOT NULL THEN pa.owner_human_id ELSE NULL END,
          pa.created_at,
          pa.updated_at
   FROM personal_agents pa
   LEFT JOIN personal_agent_revisions r ON r.revision_id=pa.active_revision_id`,
  `INSERT IGNORE INTO personal_agent_account_migrations(legacy_agent_id, account_id, account_agent_id, migrated_at)
   SELECT pa.agent_id,
          CONCAT('account:migrated:', SHA2(pa.owner_human_id, 256)),
          pa.agent_id,
          UTC_TIMESTAMP(3)
   FROM personal_agents pa`,
  `INSERT IGNORE INTO personal_agent_migration_backups(
     backup_id, legacy_agent_id, source_kind, source_id, retained_payload, retained_in_legacy_tables, created_at
   )
   SELECT CONCAT('backup:', SHA2(CONCAT('agent:', pa.agent_id), 256)),
          pa.agent_id,
          'personal_agent',
          pa.agent_id,
          JSON_OBJECT(
            'activeRevisionId', pa.active_revision_id,
            'stoppedAt', pa.stopped_at,
            'createdAt', pa.created_at,
            'updatedAt', pa.updated_at
          ),
          true,
          UTC_TIMESTAMP(3)
   FROM personal_agents pa`,
  `INSERT IGNORE INTO personal_agent_migration_backups(
     backup_id, legacy_agent_id, source_kind, source_id, retained_payload, retained_in_legacy_tables, created_at
   )
   SELECT CONCAT('backup:', SHA2(CONCAT('revision:', r.revision_id), 256)),
          r.agent_id,
          'revision',
          r.revision_id,
          JSON_OBJECT(
            'revisionNumber', r.revision_number,
            'publicName', r.public_name,
            'publicDescription', r.public_description,
            'publicCapabilityTags', r.public_capability_tags,
            'publicAgentCard', r.public_agent_card,
            'createdAt', r.created_at
          ),
          true,
          UTC_TIMESTAMP(3)
   FROM personal_agent_revisions r`,
  `INSERT IGNORE INTO personal_agent_migration_backups(
     backup_id, legacy_agent_id, source_kind, source_id, retained_payload, retained_in_legacy_tables, created_at
   )
   SELECT CONCAT('backup:', SHA2(CONCAT('presence:', p.agent_id), 256)),
          p.agent_id,
          'presence',
          p.agent_id,
          JSON_OBJECT(
            'revisionId', p.revision_id,
            'connected', p.connected,
            'runtimeHealthy', p.runtime_healthy,
            'observedAt', p.observed_at
          ),
          true,
          UTC_TIMESTAMP(3)
   FROM personal_agent_presence p`,
] as const;

/**
 * Account A2A routing metadata only. Message bodies and Artifacts deliberately
 * remain outside Cloud persistence; this table exists solely to re-check Task
 * origin and current Agent access on every standard A2A Task read.
 */
export const accountAgentA2AMySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS account_agent_a2a_tasks (
    task_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    origin_user_id varchar(191) NOT NULL,
    origin_credential_id varchar(191) NOT NULL,
    state varchar(32) NOT NULL,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    INDEX account_a2a_task_origin_idx (account_id, origin_credential_id, updated_at),
    INDEX account_a2a_task_agent_state_idx (account_id, agent_id, state, updated_at),
    CONSTRAINT account_a2a_tasks_agent_fk FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT account_a2a_tasks_origin_user_fk FOREIGN KEY (account_id, origin_user_id) REFERENCES account_memberships(account_id, user_id),
    CONSTRAINT account_a2a_tasks_origin_credential_fk FOREIGN KEY (origin_credential_id) REFERENCES credentials(credential_id),
    CONSTRAINT account_a2a_tasks_state_chk CHECK (state IN ('submitted','working','input-required','completed','failed','canceled','rejected'))
  ) ENGINE=InnoDB`,
] as const;

/**
 * Persists the bounded deletion-plan snapshot required to distinguish planned
 * Task cancellation from new concurrent work during Runtime deletion.
 */
export const accountRuntimeDeletionV7MySqlMigrationStatements = [
  "ALTER TABLE account_runtime_deletion_plans ADD COLUMN impact_snapshot json NULL AFTER impact_digest",
] as const;

export const accountAgentCreationV8MySqlMigrationStatements = [
  "ALTER TABLE agent_builder_drafts ADD COLUMN create_idempotency_key varchar(191) NULL AFTER created_agent_id",
  "ALTER TABLE agent_builder_drafts ADD UNIQUE KEY account_draft_create_idempotency_uidx (account_id, create_idempotency_key)",
  "ALTER TABLE account_skills ADD COLUMN template_ref varchar(191) NULL AFTER runtime_id",
  "ALTER TABLE account_skills ADD UNIQUE KEY account_skill_template_ref_uidx (account_id, template_ref)",
] as const;

export const legacyMigrationRecoveryV9MySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS personal_agent_migration_recovery_acknowledgements (
    backup_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    imported_agent_id varchar(191) NOT NULL,
    acknowledged_by_user_id varchar(191) NOT NULL,
    acknowledged_fields json NOT NULL,
    acknowledged_at datetime(3) NOT NULL,
    INDEX personal_migration_recovery_account_idx (account_id, acknowledged_at),
    CONSTRAINT personal_migration_recovery_backup_fk FOREIGN KEY (backup_id) REFERENCES personal_agent_migration_backups(backup_id),
    CONSTRAINT personal_migration_recovery_account_fk FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    CONSTRAINT personal_migration_recovery_agent_fk FOREIGN KEY (account_id, imported_agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT personal_migration_recovery_user_fk FOREIGN KEY (acknowledged_by_user_id) REFERENCES principals(principal_id)
  ) ENGINE=InnoDB`,
] as const;

export const accountSelfTestV10MySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS account_agent_self_tests (
    self_test_id varchar(191) PRIMARY KEY,
    account_id varchar(191) NOT NULL,
    agent_id varchar(191) NOT NULL,
    created_by_user_id varchar(191) NOT NULL,
    requester_principal_id varchar(191) NOT NULL,
    requester_credential_id varchar(191) NOT NULL UNIQUE,
    created_at datetime(3) NOT NULL,
    expires_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    INDEX account_self_test_owner_idx (account_id, created_by_user_id, created_at),
    INDEX account_self_test_active_idx (requester_credential_id, expires_at, revoked_at),
    CONSTRAINT account_self_test_agent_fk FOREIGN KEY (account_id, agent_id) REFERENCES account_agents(account_id, agent_id),
    CONSTRAINT account_self_test_creator_fk FOREIGN KEY (account_id, created_by_user_id) REFERENCES account_memberships(account_id, user_id),
    CONSTRAINT account_self_test_principal_fk FOREIGN KEY (requester_principal_id) REFERENCES principals(principal_id),
    CONSTRAINT account_self_test_credential_fk FOREIGN KEY (requester_credential_id) REFERENCES credentials(credential_id)
  ) ENGINE=InnoDB`,
] as const;

/**
 * Human Friendship replaces Account membership as the cross-user product
 * relation. Existing owner membership rows remain only for foreign-key
 * compatibility; migration never turns a legacy member into a friend.
 */
export const humanFriendshipV11MySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS human_friend_invitations (
    invitation_id varchar(191) PRIMARY KEY,
    inviter_user_id varchar(191) NOT NULL,
    recipient_email varchar(320) NOT NULL,
    recipient_email_digest varchar(64) NOT NULL,
    recipient_user_id varchar(191),
    status varchar(16) NOT NULL,
    active_pair_key varchar(511) GENERATED ALWAYS AS (CASE WHEN status='pending' THEN CASE
      WHEN recipient_user_id IS NOT NULL THEN CONCAT(LEAST(inviter_user_id,recipient_user_id), ':', GREATEST(inviter_user_id,recipient_user_id))
      ELSE CONCAT(inviter_user_id, ':', recipient_email_digest)
    END ELSE NULL END) STORED,
    version integer NOT NULL DEFAULT 1,
    expires_at datetime(3) NOT NULL,
    created_at datetime(3) NOT NULL,
    accepted_at datetime(3),
    rejected_at datetime(3),
    revoked_at datetime(3),
    UNIQUE KEY human_friend_invitation_pending_uidx (active_pair_key),
    INDEX human_friend_invitation_incoming_idx (recipient_user_id, status, created_at, invitation_id),
    INDEX human_friend_invitation_email_idx (recipient_email_digest, status, expires_at),
    INDEX human_friend_invitation_outgoing_idx (inviter_user_id, status, created_at, invitation_id),
    CONSTRAINT human_friend_invitation_inviter_fk FOREIGN KEY (inviter_user_id) REFERENCES principals(principal_id),
    CONSTRAINT human_friend_invitation_recipient_fk FOREIGN KEY (recipient_user_id) REFERENCES principals(principal_id),
    CONSTRAINT human_friend_invitation_status_chk CHECK (status IN ('pending','accepted','rejected','revoked','expired')),
    CONSTRAINT human_friend_invitation_version_chk CHECK (version > 0)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS human_friendships (
    friendship_id varchar(191) PRIMARY KEY,
    human_a_user_id varchar(191) NOT NULL,
    human_b_user_id varchar(191) NOT NULL,
    status varchar(16) NOT NULL,
    relationship_version integer NOT NULL DEFAULT 1,
    version integer NOT NULL DEFAULT 1,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    revoked_at datetime(3),
    UNIQUE KEY human_friendship_pair_uidx (human_a_user_id, human_b_user_id),
    INDEX human_friendship_a_status_idx (human_a_user_id, status, updated_at),
    INDEX human_friendship_b_status_idx (human_b_user_id, status, updated_at),
    CONSTRAINT human_friendship_a_fk FOREIGN KEY (human_a_user_id) REFERENCES principals(principal_id),
    CONSTRAINT human_friendship_b_fk FOREIGN KEY (human_b_user_id) REFERENCES principals(principal_id),
    CONSTRAINT human_friendship_pair_chk CHECK (human_a_user_id < human_b_user_id),
    CONSTRAINT human_friendship_status_chk CHECK (status IN ('active','revoked')),
    CONSTRAINT human_friendship_version_chk CHECK (relationship_version > 0 AND version > 0),
    CONSTRAINT human_friendship_revocation_chk CHECK ((status='active' AND revoked_at IS NULL) OR (status='revoked' AND revoked_at IS NOT NULL))
  ) ENGINE=InnoDB`,
  "UPDATE account_member_invitations SET status='revoked', revoked_at=COALESCE(revoked_at, UTC_TIMESTAMP(3)), version=version+1 WHERE status='pending'",
  "DELETE FROM agent_invocation_targets",
  "UPDATE account_agents SET permission_mode='private', version=version+1, updated_at=UTC_TIMESTAMP(3) WHERE permission_mode IN ('targeted','account')",
  "ALTER TABLE account_agents DROP CHECK account_agents_permission_chk",
  "ALTER TABLE account_agents ADD CONSTRAINT account_agents_permission_chk CHECK (permission_mode IN ('private','friends'))",
  "UPDATE account_runtimes SET visibility='private', version=version+1, updated_at=UTC_TIMESTAMP(3) WHERE visibility<>'private'",
  "ALTER TABLE account_runtimes DROP CHECK account_runtimes_visibility_chk",
  "ALTER TABLE account_runtimes ADD CONSTRAINT account_runtimes_visibility_chk CHECK (visibility='private')",
  "ALTER TABLE account_agent_a2a_tasks ADD COLUMN origin_account_id varchar(191) NULL AFTER origin_user_id",
  "UPDATE account_agent_a2a_tasks SET origin_account_id=account_id WHERE origin_account_id IS NULL",
  "ALTER TABLE account_agent_a2a_tasks MODIFY origin_account_id varchar(191) NOT NULL",
  "ALTER TABLE account_agent_a2a_tasks DROP FOREIGN KEY account_a2a_tasks_origin_user_fk",
  "ALTER TABLE account_agent_a2a_tasks ADD CONSTRAINT account_a2a_tasks_origin_user_fk FOREIGN KEY (origin_user_id) REFERENCES principals(principal_id)",
  "ALTER TABLE account_agent_a2a_tasks ADD CONSTRAINT account_a2a_tasks_origin_account_fk FOREIGN KEY (origin_account_id) REFERENCES accounts(account_id)",
  "ALTER TABLE account_agent_a2a_tasks DROP INDEX account_a2a_task_origin_idx",
  "ALTER TABLE account_agent_a2a_tasks ADD INDEX account_a2a_task_origin_idx (origin_account_id, origin_credential_id, updated_at)",
] as const;

/**
 * Version 12 retires Agent draft persistence at the application boundary.
 * The empty migration is intentional: legacy tables and rows remain untouched
 * for binary rollback, while current runtime code performs no reads or writes.
 */
export const legacyCreationStateRetirementV12MySqlMigrationStatements = [] as const;

/**
 * Fresh authentication cutover. Better Auth owns its core auth tables through
 * its official migration runner; these tables only bridge a verified auth user
 * into Agent Fabric's one-time device credential exchange and persistent abuse
 * limits. No legacy identity data is copied into this model.
 */
export const unifiedAuthenticationV13MySqlMigrationStatements = [
  `CREATE TABLE IF NOT EXISTS account_auth_identities (
    auth_user_id varchar(191) PRIMARY KEY,
    principal_id varchar(191) NOT NULL UNIQUE,
    verified_email varchar(320) NOT NULL,
    verified_email_digest varchar(64) NOT NULL,
    created_at datetime(3) NOT NULL,
    updated_at datetime(3) NOT NULL,
    INDEX account_auth_identity_email_idx (verified_email_digest),
    CONSTRAINT account_auth_identity_principal_fk FOREIGN KEY (principal_id) REFERENCES principals(principal_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS account_device_login_attempts (
    attempt_id varchar(191) PRIMARY KEY,
    method varchar(16) NOT NULL,
    return_uri text NOT NULL,
    client_state varchar(256) NOT NULL,
    code_challenge varchar(128) NOT NULL,
    device_name varchar(120) NOT NULL,
    email_digest varchar(64),
    auth_user_id varchar(191),
    verified_email varchar(320),
    display_name varchar(120),
    proof_digest varchar(64) UNIQUE,
    expires_at datetime(3) NOT NULL,
    authenticated_at datetime(3),
    consumed_at datetime(3),
    created_at datetime(3) NOT NULL,
    INDEX account_device_login_expiry_idx (expires_at, consumed_at),
    CONSTRAINT account_device_login_method_chk CHECK (method IN ('google','email'))
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS auth_security_events (
    event_id varchar(191) PRIMARY KEY,
    operation varchar(32) NOT NULL,
    outcome varchar(32) NOT NULL,
    metadata json NOT NULL,
    occurred_at datetime(3) NOT NULL,
    INDEX auth_security_events_time_idx (occurred_at, operation)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS auth_rate_google_ip (
    \`key\` varchar(255) CHARACTER SET utf8 NOT NULL,
    points int(9) NOT NULL DEFAULT 0,
    expire bigint unsigned,
    PRIMARY KEY (\`key\`)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS auth_rate_email_request_ip (
    \`key\` varchar(255) CHARACTER SET utf8 NOT NULL,
    points int(9) NOT NULL DEFAULT 0,
    expire bigint unsigned,
    PRIMARY KEY (\`key\`)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS auth_rate_email_request_address (
    \`key\` varchar(255) CHARACTER SET utf8 NOT NULL,
    points int(9) NOT NULL DEFAULT 0,
    expire bigint unsigned,
    PRIMARY KEY (\`key\`)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS auth_rate_email_verify_ip (
    \`key\` varchar(255) CHARACTER SET utf8 NOT NULL,
    points int(9) NOT NULL DEFAULT 0,
    expire bigint unsigned,
    PRIMARY KEY (\`key\`)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS auth_rate_email_verify_address (
    \`key\` varchar(255) CHARACTER SET utf8 NOT NULL,
    points int(9) NOT NULL DEFAULT 0,
    expire bigint unsigned,
    PRIMARY KEY (\`key\`)
  ) ENGINE=InnoDB`,
] as const;

interface MySqlMigrationConnection {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

interface MigrationCountRow {
  readonly count: number | string;
}

async function migrationObjectExists(
  connection: MySqlMigrationConnection,
  source: "COLUMNS" | "STATISTICS" | "TABLE_CONSTRAINTS",
  tableName: string,
  objectName: string,
): Promise<boolean> {
  const objectColumn = source === "COLUMNS" ? "COLUMN_NAME" : source === "STATISTICS" ? "INDEX_NAME" : "CONSTRAINT_NAME";
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.${source} WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ${objectColumn}=?`,
    [tableName, objectName],
  );
  return Number((rows as MigrationCountRow[])[0]?.count ?? 0) > 0;
}

/**
 * MySQL DDL commits statement-by-statement, so v11 must also resume safely
 * after a container restart. Metadata guards preserve the fail-closed data
 * updates while preventing duplicate columns, constraints and indexes.
 */
export async function applyHumanFriendshipV11Migration(connection: MySqlMigrationConnection): Promise<void> {
  const [
    createInvitations,
    createFriendships,
    revokeMemberInvitations,
    clearInvocationTargets,
    privatizeAgents,
    ,
    addAgentPermissionCheck,
    privatizeRuntimes,
    ,
    addRuntimeVisibilityCheck,
    addOriginAccountColumn,
    backfillOriginAccount,
    requireOriginAccount,
    ,
    addOriginUserForeignKey,
    addOriginAccountForeignKey,
    ,
    addOriginIndex,
  ] = humanFriendshipV11MySqlMigrationStatements;

  for (const statement of [createInvitations, createFriendships, revokeMemberInvitations, clearInvocationTargets, privatizeAgents]) {
    await connection.query(statement);
  }

  if (await migrationObjectExists(connection, "TABLE_CONSTRAINTS", "account_agents", "account_agents_permission_chk")) {
    await connection.query("ALTER TABLE account_agents DROP CHECK account_agents_permission_chk");
  }
  await connection.query(addAgentPermissionCheck);

  await connection.query(privatizeRuntimes);
  if (await migrationObjectExists(connection, "TABLE_CONSTRAINTS", "account_runtimes", "account_runtimes_visibility_chk")) {
    await connection.query("ALTER TABLE account_runtimes DROP CHECK account_runtimes_visibility_chk");
  }
  await connection.query(addRuntimeVisibilityCheck);

  if (!await migrationObjectExists(connection, "COLUMNS", "account_agent_a2a_tasks", "origin_account_id")) {
    await connection.query(addOriginAccountColumn);
  }
  await connection.query(backfillOriginAccount);
  await connection.query(requireOriginAccount);

  if (await migrationObjectExists(connection, "TABLE_CONSTRAINTS", "account_agent_a2a_tasks", "account_a2a_tasks_origin_user_fk")) {
    await connection.query("ALTER TABLE account_agent_a2a_tasks DROP FOREIGN KEY account_a2a_tasks_origin_user_fk");
  }
  if (await migrationObjectExists(connection, "STATISTICS", "account_agent_a2a_tasks", "account_a2a_tasks_origin_user_fk")) {
    await connection.query("ALTER TABLE account_agent_a2a_tasks DROP INDEX account_a2a_tasks_origin_user_fk");
  }
  await connection.query(addOriginUserForeignKey);

  if (!await migrationObjectExists(connection, "TABLE_CONSTRAINTS", "account_agent_a2a_tasks", "account_a2a_tasks_origin_account_fk")) {
    await connection.query(addOriginAccountForeignKey);
  }
  if (await migrationObjectExists(connection, "STATISTICS", "account_agent_a2a_tasks", "account_a2a_task_origin_idx")) {
    await connection.query("ALTER TABLE account_agent_a2a_tasks DROP INDEX account_a2a_task_origin_idx");
  }
  await connection.query(addOriginIndex);
}
