import type {
  Account,
  AccountMember,
  Agent,
  AgentActivity,
  AgentDraft,
  AgentRuntime,
  FriendInvitation,
  FriendSummary,
  Friendship,
  MemberInvitation,
  MemberInvitationSecret,
  Skill,
} from "./index.js";

export interface StableCursor {
  readonly sortValue: string;
  readonly id: string;
}

export interface PageRequest {
  readonly limit: number;
  readonly after?: StableCursor;
}

export interface RepositoryPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: StableCursor;
}

export interface AccountRepository {
  createAccount(account: Account): Promise<Account>;
  getAccount(accountId: string): Promise<Account | undefined>;
}

export interface MemberRepository {
  createMember(member: AccountMember): Promise<AccountMember>;
  getMember(accountId: string, userId: string): Promise<AccountMember | undefined>;
  listMembers(accountId: string, page: PageRequest): Promise<RepositoryPage<AccountMember>>;
  createMemberInvitation(invitation: MemberInvitation, secret: MemberInvitationSecret): Promise<MemberInvitation>;
  listMemberInvitations(accountId: string, page: PageRequest): Promise<RepositoryPage<MemberInvitation>>;
}

export interface FriendshipRepository {
  listIncomingFriendInvitations(userId: string, page: PageRequest): Promise<RepositoryPage<FriendInvitation>>;
  listOutgoingFriendInvitations(userId: string, page: PageRequest): Promise<RepositoryPage<FriendInvitation>>;
  createFriendInvitation(invitation: FriendInvitation): Promise<FriendInvitation>;
  listFriends(userId: string, page: PageRequest): Promise<RepositoryPage<FriendSummary>>;
  getFriendship(userId: string, friendUserId: string): Promise<Friendship | undefined>;
}

export interface RuntimeRepository {
  createRuntime(runtime: AgentRuntime): Promise<AgentRuntime>;
  getRuntime(accountId: string, runtimeId: string): Promise<AgentRuntime | undefined>;
  listRuntimes(accountId: string, page: PageRequest): Promise<RepositoryPage<AgentRuntime>>;
  replaceRuntime(runtime: AgentRuntime, expectedVersion: number): Promise<AgentRuntime>;
}

export interface AgentListRequest extends PageRequest {
  readonly scope: "active" | "archived";
  readonly ownerUserId?: string;
}

export interface AgentRepository {
  createAgent(agent: Agent): Promise<Agent>;
  getAgent(accountId: string, agentId: string): Promise<Agent | undefined>;
  listAgents(accountId: string, page: AgentListRequest): Promise<RepositoryPage<Agent>>;
  replaceAgent(agent: Agent, expectedVersion: number): Promise<Agent>;
}

export interface SkillRepository {
  createSkill(skill: Skill): Promise<Skill>;
  listSkills(accountId: string, page: PageRequest): Promise<RepositoryPage<Skill>>;
  replaceAgentSkills(accountId: string, agentId: string, skillIds: readonly string[], disabledRuntimeSkillIds: readonly string[]): Promise<void>;
}

export interface DraftRepository {
  saveDraft(draft: AgentDraft, expectedVersion?: number): Promise<AgentDraft>;
  getDraft(accountId: string, draftId: string): Promise<AgentDraft | undefined>;
  listDrafts(accountId: string, ownerUserId: string, page: PageRequest): Promise<RepositoryPage<AgentDraft>>;
}

export interface ActivityRepository {
  appendActivity(activity: AgentActivity): Promise<AgentActivity>;
  listActivities(accountId: string, agentId: string, page: PageRequest): Promise<RepositoryPage<AgentActivity>>;
}

export interface AccountAgentRepositories
  extends AccountRepository,
    MemberRepository,
    RuntimeRepository,
    AgentRepository,
    SkillRepository,
    DraftRepository,
    ActivityRepository {}

export interface AccountAgentUnitOfWork extends AccountAgentRepositories {
  transaction<T>(operation: (repositories: AccountAgentRepositories) => Promise<T>): Promise<T>;
}
