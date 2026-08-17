import {
  accountMemberSchema,
  accountSchema,
  agentActivitySchema,
  agentSchema,
  memberInvitationSchema,
  memberInvitationSecretSchema,
  runtimeSchema,
  skillSchema,
  type Account,
  type AccountAgentRepositories,
  type AccountAgentUnitOfWork,
  type AccountMember,
  type Agent,
  type AgentActivity,
  type AgentListRequest,
  type AgentRuntime,
  type MemberInvitation,
  type MemberInvitationSecret,
  type PageRequest,
  type RepositoryPage,
  type Skill,
  type StableCursor,
} from "@agent-fabric/account-agent-domain";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";

import { MySqlPersistenceError } from "./store.js";

type SqlExecutor = Pool | PoolConnection;
type SqlValue = string | number | bigint | boolean | Date | null | Buffer | Uint8Array | SqlValue[] | { [key: string]: SqlValue };

export class MySqlAccountAgentStore implements AccountAgentUnitOfWork {
  constructor(readonly executor: SqlExecutor) {}

  async transaction<T>(operation: (repositories: AccountAgentRepositories) => Promise<T>): Promise<T> {
    if (!isPool(this.executor)) return operation(this);
    const connection = await this.executor.getConnection();
    try {
      await connection.beginTransaction();
      const result = await operation(new MySqlAccountAgentStore(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }

  async createAccount(value: Account): Promise<Account> {
    const account = accountSchema.parse(value);
    await this.executor.execute(
      "INSERT INTO accounts(account_id, name, version, created_at, updated_at) VALUES (?,?,?,?,?)",
      [account.accountId, account.name, account.version, sqlDate(account.createdAt), sqlDate(account.updatedAt)],
    );
    return account;
  }

  async getAccount(accountId: string): Promise<Account | undefined> {
    const [rows] = await this.executor.execute<AccountRow[]>("SELECT * FROM accounts WHERE account_id=?", [accountId]);
    return rows[0] ? mapAccount(rows[0]) : undefined;
  }

  async createMember(value: AccountMember): Promise<AccountMember> {
    const member = accountMemberSchema.parse(value);
    await this.executor.execute(
      "INSERT INTO account_memberships(membership_id, account_id, user_id, email, role, version, joined_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
      [member.membershipId, member.accountId, member.userId, member.email, member.role, member.version, sqlDate(member.joinedAt), sqlDate(member.updatedAt)],
    );
    return member;
  }

  async getMember(accountId: string, userId: string): Promise<AccountMember | undefined> {
    const [rows] = await this.executor.execute<MemberRow[]>(memberSelect("WHERE m.account_id=? AND m.user_id=?"), [accountId, userId]);
    return rows[0] ? mapMember(rows[0]) : undefined;
  }

  async listMembers(accountId: string, request: PageRequest): Promise<RepositoryPage<AccountMember>> {
    const limit = pageLimit(request.limit);
    const values: SqlValue[] = [accountId];
    let cursor = "";
    if (request.after) {
      cursor = " AND (m.joined_at < ? OR (m.joined_at=? AND m.membership_id < ?))";
      values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
    }
    values.push(limit);
    const [rows] = await this.executor.execute<MemberRow[]>(
      `${memberSelect("WHERE m.account_id=?")}${cursor} ORDER BY m.joined_at DESC, m.membership_id DESC LIMIT ?`,
      values,
    );
    const items = rows.map(mapMember);
    return page(items, limit, (member) => ({ sortValue: member.joinedAt, id: member.membershipId }));
  }

  async createMemberInvitation(value: MemberInvitation, secretValue: MemberInvitationSecret): Promise<MemberInvitation> {
    const invitation = memberInvitationSchema.parse(value);
    const secret = memberInvitationSecretSchema.parse(secretValue);
    if (secret.invitationId !== invitation.invitationId) throw new MySqlPersistenceError("invitation-secret-mismatch");
    await this.executor.execute(String.raw`
      INSERT INTO account_member_invitations(
        invitation_id, account_id, invited_email, invited_email_digest, invited_by_user_id, role, status,
        token_digest, version, expires_at, created_at, accepted_at, revoked_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      invitation.invitationId,
      invitation.accountId,
      invitation.invitedEmail,
      emailDigest(invitation.invitedEmail),
      invitation.invitedByUserId,
      invitation.role,
      invitation.status,
      secret.tokenDigest.slice("sha256:".length),
      invitation.version,
      sqlDate(invitation.expiresAt),
      sqlDate(invitation.createdAt),
      invitation.acceptedAt ? sqlDate(invitation.acceptedAt) : null,
      invitation.revokedAt ? sqlDate(invitation.revokedAt) : null,
    ]);
    return invitation;
  }

  async listMemberInvitations(accountId: string, request: PageRequest): Promise<RepositoryPage<MemberInvitation>> {
    const limit = pageLimit(request.limit);
    const values: SqlValue[] = [accountId];
    let cursor = "";
    if (request.after) {
      cursor = " AND (created_at < ? OR (created_at=? AND invitation_id < ?))";
      values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
    }
    values.push(limit);
    const [rows] = await this.executor.execute<InvitationRow[]>(
      `SELECT * FROM account_member_invitations WHERE account_id=?${cursor} ORDER BY created_at DESC, invitation_id DESC LIMIT ?`,
      values,
    );
    const items = rows.map(mapInvitation);
    return page(items, limit, (invitation) => ({ sortValue: invitation.createdAt, id: invitation.invitationId }));
  }

  async createRuntime(value: AgentRuntime): Promise<AgentRuntime> {
    const runtime = runtimeSchema.parse(value);
    await this.executor.execute(String.raw`
      INSERT INTO account_runtimes(
        runtime_id, account_id, owner_user_id, provider, adapter_id, name, visibility, health,
        capabilities, version, last_checked_at, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, runtimeValues(runtime));
    return runtime;
  }

  async getRuntime(accountId: string, runtimeId: string): Promise<AgentRuntime | undefined> {
    const [rows] = await this.executor.execute<RuntimeRow[]>("SELECT * FROM account_runtimes WHERE account_id=? AND runtime_id=?", [accountId, runtimeId]);
    return rows[0] ? mapRuntime(rows[0]) : undefined;
  }

  async listRuntimes(accountId: string, request: PageRequest): Promise<RepositoryPage<AgentRuntime>> {
    const limit = pageLimit(request.limit);
    const values: SqlValue[] = [accountId];
    let cursor = "";
    if (request.after) {
      cursor = " AND (updated_at < ? OR (updated_at=? AND runtime_id < ?))";
      values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
    }
    values.push(limit);
    const [rows] = await this.executor.execute<RuntimeRow[]>(
      `SELECT * FROM account_runtimes WHERE account_id=?${cursor} ORDER BY updated_at DESC, runtime_id DESC LIMIT ?`,
      values,
    );
    const items = rows.map(mapRuntime);
    return page(items, limit, (runtime) => ({ sortValue: runtime.updatedAt, id: runtime.runtimeId }));
  }

  async replaceRuntime(value: AgentRuntime, expectedVersion: number): Promise<AgentRuntime> {
    const runtime = runtimeSchema.parse(value);
    requireNextVersion(runtime.version, expectedVersion);
    const [result] = await this.executor.execute<ResultSetHeader>(String.raw`
      UPDATE account_runtimes SET owner_user_id=?, provider=?, adapter_id=?, name=?, visibility=?, health=?,
        capabilities=?, version=?, last_checked_at=?, updated_at=?
      WHERE account_id=? AND runtime_id=? AND version=?
    `, [
      runtime.ownerUserId,
      runtime.provider,
      runtime.adapterId,
      runtime.name,
      runtime.visibility,
      runtime.health,
      JSON.stringify(runtime.capabilities),
      runtime.version,
      runtime.lastCheckedAt ? sqlDate(runtime.lastCheckedAt) : null,
      sqlDate(runtime.updatedAt),
      runtime.accountId,
      runtime.runtimeId,
      expectedVersion,
    ]);
    requireUpdated(result);
    return runtime;
  }

  async createAgent(value: Agent): Promise<Agent> {
    const agent = agentSchema.parse(value);
    return this.transaction(async (repositories) => {
      const store = repositories as MySqlAccountAgentStore;
      await store.executor.execute(String.raw`
        INSERT INTO account_agents(
          agent_id, account_id, owner_user_id, runtime_id, name, description, avatar_url,
          permission_mode, configuration, version, archived_at, archived_by_user_id, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, agentValues(agent));
      return agent;
    });
  }

  async getAgent(accountId: string, agentId: string): Promise<Agent | undefined> {
    const [rows] = await this.executor.execute<AgentRow[]>("SELECT * FROM account_agents WHERE account_id=? AND agent_id=?", [accountId, agentId]);
    if (!rows[0]) return undefined;
    return mapAgent(rows[0]);
  }

  async listAgents(accountId: string, request: AgentListRequest): Promise<RepositoryPage<Agent>> {
    const limit = pageLimit(request.limit);
    const values: SqlValue[] = [accountId];
    let where = request.scope === "archived" ? " AND archived_at IS NOT NULL" : " AND archived_at IS NULL";
    if (request.ownerUserId) {
      where += " AND owner_user_id=?";
      values.push(request.ownerUserId);
    }
    if (request.after) {
      where += " AND (updated_at < ? OR (updated_at=? AND agent_id < ?))";
      values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
    }
    values.push(limit);
    const [rows] = await this.executor.execute<AgentRow[]>(
      `SELECT * FROM account_agents WHERE account_id=?${where} ORDER BY updated_at DESC, agent_id DESC LIMIT ?`,
      values,
    );
    const items = rows.map(mapAgent);
    return page(items, limit, (agent) => ({ sortValue: agent.updatedAt, id: agent.agentId }));
  }

  async replaceAgent(value: Agent, expectedVersion: number): Promise<Agent> {
    const agent = agentSchema.parse(value);
    requireNextVersion(agent.version, expectedVersion);
    return this.transaction(async (repositories) => {
      const store = repositories as MySqlAccountAgentStore;
      const [result] = await store.executor.execute<ResultSetHeader>(String.raw`
        UPDATE account_agents SET owner_user_id=?, runtime_id=?, name=?, description=?, avatar_url=?,
          permission_mode=?, configuration=?, version=?, archived_at=?, archived_by_user_id=?, updated_at=?
        WHERE account_id=? AND agent_id=? AND version=?
      `, [
        agent.ownerUserId,
        agent.runtimeId ?? null,
        agent.name,
        agent.description,
        agent.avatarUrl ?? null,
        agent.permissionMode,
        JSON.stringify(agent.configuration),
        agent.version,
        agent.archivedAt ? sqlDate(agent.archivedAt) : null,
        agent.archivedByUserId ?? null,
        sqlDate(agent.updatedAt),
        agent.accountId,
        agent.agentId,
        expectedVersion,
      ]);
      requireUpdated(result);
      await store.executor.execute("DELETE FROM agent_invocation_targets WHERE account_id=? AND agent_id=?", [agent.accountId, agent.agentId]);
      return agent;
    });
  }

  async createSkill(value: Skill): Promise<Skill> {
    const skill = skillSchema.parse(value);
    await this.executor.execute(String.raw`
      INSERT INTO account_skills(skill_id, account_id, runtime_id, name, description, origin, version, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `, [skill.skillId, skill.accountId, skill.runtimeId ?? null, skill.name, skill.description, skill.origin, skill.version, sqlDate(skill.createdAt), sqlDate(skill.updatedAt)]);
    return skill;
  }

  async listSkills(accountId: string, request: PageRequest): Promise<RepositoryPage<Skill>> {
    const limit = pageLimit(request.limit);
    const values: SqlValue[] = [accountId];
    let cursor = "";
    if (request.after) {
      cursor = " AND (name > ? OR (name=? AND skill_id > ?))";
      values.push(request.after.sortValue, request.after.sortValue, request.after.id);
    }
    values.push(limit);
    const [rows] = await this.executor.execute<SkillRow[]>(
      `SELECT * FROM account_skills WHERE account_id=?${cursor} ORDER BY name ASC, skill_id ASC LIMIT ?`,
      values,
    );
    const items = rows.map(mapSkill);
    return page(items, limit, (skill) => ({ sortValue: skill.name, id: skill.skillId }));
  }

  async replaceAgentSkills(accountId: string, agentId: string, skillIds: readonly string[], disabledRuntimeSkillIds: readonly string[]): Promise<void> {
    const uniqueAttached = uniqueIds(skillIds);
    const uniqueDisabled = uniqueIds(disabledRuntimeSkillIds);
    await this.transaction(async (repositories) => {
      const store = repositories as MySqlAccountAgentStore;
      const [agentRows] = await store.executor.execute<IdentifierRow[]>("SELECT agent_id FROM account_agents WHERE account_id=? AND agent_id=? FOR UPDATE", [accountId, agentId]);
      if (!agentRows[0]) throw new MySqlPersistenceError("account-agent-not-found");
      await store.executor.execute("DELETE FROM agent_skill_bindings WHERE account_id=? AND agent_id=?", [accountId, agentId]);
      await store.executor.execute("DELETE FROM agent_disabled_runtime_skills WHERE account_id=? AND agent_id=?", [accountId, agentId]);
      for (const skillId of uniqueAttached) await store.insertSkillRelation("agent_skill_bindings", accountId, agentId, skillId);
      for (const skillId of uniqueDisabled) await store.insertSkillRelation("agent_disabled_runtime_skills", accountId, agentId, skillId);
    });
  }


  async appendActivity(value: AgentActivity): Promise<AgentActivity> {
    const activity = agentActivitySchema.parse(value);
    await this.executor.execute(String.raw`
      INSERT INTO agent_activities(
        activity_id, account_id, agent_id, task_id, terminal_state, failure_category,
        started_at, completed_at, duration_ms
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `, [
      activity.activityId,
      activity.accountId,
      activity.agentId,
      activity.taskId,
      activity.terminalState,
      activity.failureCategory ?? null,
      sqlDate(activity.startedAt),
      sqlDate(activity.completedAt),
      activity.durationMs,
    ]);
    return activity;
  }

  async listActivities(accountId: string, agentId: string, request: PageRequest): Promise<RepositoryPage<AgentActivity>> {
    const limit = pageLimit(request.limit);
    const values: SqlValue[] = [accountId, agentId];
    let cursor = "";
    if (request.after) {
      cursor = " AND (completed_at < ? OR (completed_at=? AND activity_id < ?))";
      values.push(sqlDate(request.after.sortValue), sqlDate(request.after.sortValue), request.after.id);
    }
    values.push(limit);
    const [rows] = await this.executor.execute<ActivityRow[]>(
      `SELECT * FROM agent_activities WHERE account_id=? AND agent_id=?${cursor} ORDER BY completed_at DESC, activity_id DESC LIMIT ?`,
      values,
    );
    const items = rows.map(mapActivity);
    return page(items, limit, (activity) => ({ sortValue: activity.completedAt, id: activity.activityId }));
  }

  private async insertSkillRelation(table: "agent_skill_bindings" | "agent_disabled_runtime_skills", accountId: string, agentId: string, skillId: string): Promise<void> {
    const [result] = await this.executor.execute<ResultSetHeader>(
      `INSERT INTO ${table}(account_id, agent_id, skill_id, created_at) SELECT ?,?,?,UTC_TIMESTAMP(3) FROM account_skills WHERE account_id=? AND skill_id=?`,
      [accountId, agentId, skillId, accountId, skillId],
    );
    if (result.affectedRows !== 1) throw new MySqlPersistenceError("account-skill-not-found");
  }
}

function memberSelect(where: string): string {
  return `SELECT m.*, p.display_name FROM account_memberships m JOIN principals p ON p.principal_id=m.user_id ${where}`;
}

function runtimeValues(runtime: AgentRuntime): SqlValue[] {
  return [
    runtime.runtimeId,
    runtime.accountId,
    runtime.ownerUserId,
    runtime.provider,
    runtime.adapterId,
    runtime.name,
    runtime.visibility,
    runtime.health,
    JSON.stringify(runtime.capabilities),
    runtime.version,
    runtime.lastCheckedAt ? sqlDate(runtime.lastCheckedAt) : null,
    sqlDate(runtime.createdAt),
    sqlDate(runtime.updatedAt),
  ];
}

function agentValues(agent: Agent): SqlValue[] {
  return [
    agent.agentId,
    agent.accountId,
    agent.ownerUserId,
    agent.runtimeId ?? null,
    agent.name,
    agent.description,
    agent.avatarUrl ?? null,
    agent.permissionMode,
    JSON.stringify(agent.configuration),
    agent.version,
    agent.archivedAt ? sqlDate(agent.archivedAt) : null,
    agent.archivedByUserId ?? null,
    sqlDate(agent.createdAt),
    sqlDate(agent.updatedAt),
  ];
}

function mapAccount(row: AccountRow): Account {
  return accountSchema.parse({ accountId: row.account_id, name: row.name, version: Number(row.version), createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) });
}

function mapMember(row: MemberRow): AccountMember {
  return accountMemberSchema.parse({
    membershipId: row.membership_id,
    accountId: row.account_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    version: Number(row.version),
    joinedAt: toIso(row.joined_at),
    updatedAt: toIso(row.updated_at),
  });
}

function mapInvitation(row: InvitationRow): MemberInvitation {
  return memberInvitationSchema.parse({
    invitationId: row.invitation_id,
    accountId: row.account_id,
    invitedEmail: row.invited_email,
    role: row.role,
    invitedByUserId: row.invited_by_user_id,
    status: row.status,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    ...(row.accepted_at ? { acceptedAt: toIso(row.accepted_at) } : {}),
    ...(row.revoked_at ? { revokedAt: toIso(row.revoked_at) } : {}),
    version: Number(row.version),
  });
}

function mapRuntime(row: RuntimeRow): AgentRuntime {
  return runtimeSchema.parse({
    runtimeId: row.runtime_id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    adapterId: row.adapter_id,
    name: row.name,
    visibility: row.visibility,
    health: row.health,
    capabilities: json(row.capabilities),
    ...(row.last_checked_at ? { lastCheckedAt: toIso(row.last_checked_at) } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: Number(row.version),
  });
}

function mapAgent(row: AgentRow): Agent {
  return agentSchema.parse({
    agentId: row.agent_id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    description: row.description,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    ...(row.runtime_id ? { runtimeId: row.runtime_id } : {}),
    permissionMode: row.permission_mode,
    configuration: json(row.configuration),
    ...(row.archived_at ? { archivedAt: toIso(row.archived_at) } : {}),
    ...(row.archived_by_user_id ? { archivedByUserId: row.archived_by_user_id } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: Number(row.version),
  });
}

function mapSkill(row: SkillRow): Skill {
  return skillSchema.parse({
    skillId: row.skill_id,
    accountId: row.account_id,
    name: row.name,
    description: row.description,
    origin: row.origin,
    ...(row.runtime_id ? { runtimeId: row.runtime_id } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    version: Number(row.version),
  });
}

function mapActivity(row: ActivityRow): AgentActivity {
  return agentActivitySchema.parse({
    activityId: row.activity_id,
    accountId: row.account_id,
    agentId: row.agent_id,
    taskId: row.task_id,
    terminalState: row.terminal_state,
    ...(row.failure_category ? { failureCategory: row.failure_category } : {}),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    durationMs: Number(row.duration_ms),
  });
}

function page<T>(items: readonly T[], limit: number, cursor: (item: T) => StableCursor): RepositoryPage<T> {
  const last = items.at(-1);
  return Object.freeze({ items: Object.freeze([...items]), ...(items.length === limit && last ? { nextCursor: cursor(last) } : {}) });
}

function pageLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new MySqlPersistenceError("page-limit-invalid");
  return value;
}

function requireNextVersion(next: number, expected: number): void {
  if (!Number.isInteger(expected) || expected < 1 || next !== expected + 1) throw new MySqlPersistenceError("optimistic-version-invalid");
}

function requireUpdated(result: ResultSetHeader): void {
  if (result.affectedRows !== 1) throw new MySqlPersistenceError("optimistic-version-conflict");
}

function uniqueIds(values: readonly string[]): readonly string[] {
  const output = [...new Set(values)];
  if (output.length !== values.length) throw new MySqlPersistenceError("relation-id-duplicate");
  return output;
}

function emailDigest(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function sqlDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MySqlPersistenceError("invalid-timestamp");
  return parsed;
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).toISOString();
}

function json(value: string | Record<string, unknown>): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function isPool(value: SqlExecutor): value is Pool {
  return "getConnection" in value;
}

interface AccountRow extends RowDataPacket { account_id: string; name: string; version: number | string; created_at: string | Date; updated_at: string | Date }
interface MemberRow extends RowDataPacket { membership_id: string; account_id: string; user_id: string; display_name: string; email: string; role: string; version: number | string; joined_at: string | Date; updated_at: string | Date }
interface InvitationRow extends RowDataPacket { invitation_id: string; account_id: string; invited_email: string; invited_by_user_id: string; role: string; status: string; version: number | string; expires_at: string | Date; created_at: string | Date; accepted_at: string | Date | null; revoked_at: string | Date | null }
interface RuntimeRow extends RowDataPacket { runtime_id: string; account_id: string; owner_user_id: string; provider: string; adapter_id: string; name: string; visibility: string; health: string; capabilities: string | Record<string, unknown>; version: number | string; last_checked_at: string | Date | null; created_at: string | Date; updated_at: string | Date }
interface AgentRow extends RowDataPacket { agent_id: string; account_id: string; owner_user_id: string; runtime_id: string | null; name: string; description: string; avatar_url: string | null; permission_mode: string; configuration: string | Record<string, unknown>; version: number | string; archived_at: string | Date | null; archived_by_user_id: string | null; created_at: string | Date; updated_at: string | Date }
interface SkillRow extends RowDataPacket { skill_id: string; account_id: string; runtime_id: string | null; name: string; description: string; origin: string; version: number | string; created_at: string | Date; updated_at: string | Date }
interface ActivityRow extends RowDataPacket { activity_id: string; account_id: string; agent_id: string; task_id: string; terminal_state: string; failure_category: string | null; started_at: string | Date; completed_at: string | Date; duration_ms: number | string }
interface IdentifierRow extends RowDataPacket { agent_id: string }
