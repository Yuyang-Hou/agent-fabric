import { randomUUID } from "node:crypto";

import type { AgentFabricClient } from "@agent-fabric/client";
import { accountResourceInvalidationSchema, validateLocalAgentCreation, type AccountResourceInvalidation, type AccountSession, type AgentBuilderProposal, type AgentCatalogQuery } from "@agent-fabric/account-agent-domain";

import {
  accountProductRendererCommandResultSchema,
  accountProductRendererCommandSchema,
  accountProductRendererSnapshotSchema,
  type AccountProductRendererCommand,
  type AccountProductRendererCommandResult,
  type AccountProductRendererSnapshot,
  type AgentCreationSession,
} from "./ipc.js";

const defaultCatalogQuery: AgentCatalogQuery = {
  scope: "mine",
  availability: [],
  runtimeIds: [],
  ownerUserIds: [],
  models: [],
  access: [],
  sort: "last_active",
  limit: 100,
};

type AccountProductCloud = Pick<AgentFabricClient,
  | "archiveAgent"
  | "batchAgentLifecycle"
  | "createAgent"
  | "createFriendInvitation"
  | "completeLegacyAgentMigrationRecovery"
  | "deleteAccountRuntime"
  | "getAccountRuntime"
  | "getAgentDetail"
  | "getLegacyAgentMigrationRecovery"
  | "listIncomingFriendInvitations"
  | "listOutgoingFriendInvitations"
  | "listFriends"
  | "listAccountRuntimes"
  | "listAgentActivities"
  | "listAgentCatalog"
  | "listAgentSkills"
  | "listAgentTemplates"
  | "logout"
  | "mutateAgentSkill"
  | "planAccountRuntimeDeletion"
  | "refreshAccountRuntime"
  | "removeFriend"
  | "restoreAgent"
  | "acceptFriendInvitation"
  | "rejectFriendInvitation"
  | "revokeFriendInvitation"
  | "updateAccountRuntime"
  | "updateAgent"
  | "updateAgentPrivateConfiguration"
>;

type AgentDetail = NonNullable<AccountProductRendererSnapshot["detail"]>;
type AgentSkills = NonNullable<AccountProductRendererSnapshot["skills"]>;
type AgentFragmentCache = {
  detail?: AgentDetail;
  activities?: AccountProductRendererSnapshot["activities"];
  skills?: AgentSkills;
};

export interface AccountProductAuthenticatedSession {
  readonly client: AccountProductCloud;
  readonly session: AccountSession;
  readonly accountName: string;
  readonly localServices?: AccountProductRendererSnapshot["localServices"];
  readonly subscribeInvalidations?: (
    onEvent: (event: AccountResourceInvalidation) => void,
    onConnection: (state: AccountProductRendererSnapshot["connection"]) => void,
  ) => () => void;
}

export interface AccountProductAuthenticationPort {
  login<T>(activate: (session: AccountProductAuthenticatedSession) => Promise<T>): Promise<T>;
  restore(): Promise<AccountProductAuthenticatedSession | undefined>;
  clear(options?: { readonly preserveCredential?: boolean }): Promise<void>;
}

export class AccountProductHost {
  #snapshot: AccountProductRendererSnapshot = signedOutSnapshot("initial", true);
  #authenticated: AccountProductAuthenticatedSession | undefined;
  #unsubscribeInvalidations: (() => void) | undefined;
  #queue: Promise<void> = Promise.resolve();
  readonly #agentCache = new Map<string, AgentFragmentCache>();
  readonly #agentLoads = new Map<string, Promise<void>>();
  readonly #listeners = new Set<(snapshot: AccountProductRendererSnapshot) => void>();

  constructor(readonly authentication: AccountProductAuthenticationPort, readonly options?: {
    readonly diagnostic?: (message: string) => void;
    readonly refreshLocalRuntime?: (runtimeId: string, expectedVersion: number) => Promise<AccountProductRendererSnapshot["runtimes"][number]>;
    readonly runLocalBuilderTurn?: (input: { readonly runtimeId: string; readonly text: string; readonly configuration: AgentCreationSession["configuration"] }) => Promise<{ readonly proposal: AgentBuilderProposal; readonly assistantText: string }>;
    readonly closeLocalBuilder?: () => Promise<void>;
  }) {}

  snapshot(): AccountProductRendererSnapshot { return this.#snapshot; }

  subscribe(listener: (snapshot: AccountProductRendererSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  discardCreationSession(): Promise<void> {
    const work = this.#queue.then(async () => {
      if (!this.#snapshot.creationSession && !isCreationRoute(this.#snapshot.route.name)) return;
      await this.options?.closeLocalBuilder?.();
      this.#replace({
        ...this.#snapshot,
        ...(isCreationRoute(this.#snapshot.route.name) ? { route: { name: "agents" } as const } : {}),
        creationSession: undefined,
        creationValidation: undefined,
        refreshing: false,
        errorCode: undefined,
      });
    });
    this.#queue = work.then(() => undefined, () => undefined);
    return work;
  }

  async restore(): Promise<AccountProductRendererSnapshot> {
    try {
      const authenticated = await this.authentication.restore();
      if (!authenticated) {
        this.#authenticated = undefined;
        this.#clearAgentCache();
        return this.#replace(signedOutSnapshot("initial", false));
      }
      return await this.#hydrate(authenticated);
    } catch (error) {
      const code = safeErrorCode(error);
      if (code === "login-session-invalid") await this.authentication.clear().catch(() => undefined);
      else await this.authentication.clear({ preserveCredential: true }).catch(() => undefined);
      this.#unsubscribeInvalidations?.();
      this.#unsubscribeInvalidations = undefined;
      this.#authenticated = undefined;
      this.#clearAgentCache();
      return this.#replace({ ...signedOutSnapshot(code === "login-session-invalid" ? "expired" : "initial", false), errorCode: code });
    }
  }

  command(value: unknown): Promise<AccountProductRendererCommandResult> {
    const command = accountProductRendererCommandSchema.parse(value);
    const work = this.#queue.then(() => this.#execute(command));
    this.#queue = work.then(() => undefined, () => undefined);
    return work;
  }

  invalidate(value: unknown): Promise<void> {
    const event = accountResourceInvalidationSchema.parse(value);
    const work = this.#queue.then(() => this.#applyInvalidation(event));
    this.#queue = work.then(() => undefined, () => undefined);
    return work;
  }

  async #execute(command: AccountProductRendererCommand): Promise<AccountProductRendererCommandResult> {
    if (command.type === "login-start") {
      this.#replace({ ...this.#snapshot, session: { state: "signing-in" }, loading: true, errorCode: undefined });
      try { return snapshotResult(await this.authentication.login((authenticated) => this.#hydrate(authenticated))); }
      catch (error) {
        await this.authentication.clear().catch(() => undefined);
        this.#unsubscribeInvalidations?.();
        this.#unsubscribeInvalidations = undefined;
        this.#authenticated = undefined;
        this.#clearAgentCache();
        this.#replace({ ...signedOutSnapshot("initial", false), errorCode: safeErrorCode(error) });
        throw new AccountProductHostError(safeErrorCode(error));
      }
    }
    if (command.type === "logout") {
      try { await this.options?.closeLocalBuilder?.(); await this.#authenticated?.client.logout(); }
      finally {
        await this.authentication.clear();
        this.#unsubscribeInvalidations?.();
        this.#unsubscribeInvalidations = undefined;
        this.#authenticated = undefined;
        this.#clearAgentCache();
      }
      return snapshotResult(this.#replace(signedOutSnapshot("logged_out", false)));
    }
    if (!this.#authenticated || this.#snapshot.session.state !== "signed-in") throw new AccountProductHostError("authentication-required");

    if (command.type === "agent-open") return snapshotResult(this.#openAgent(this.#authenticated, command.agentId, command.section));

    this.#replace({ ...this.#snapshot, refreshing: true, errorCode: undefined });
    const client = this.#authenticated.client;
    try {
      switch (command.type) {
        case "navigate":
          if (isCreationRoute(this.#snapshot.route.name) && !isCreationRoute(command.route.name)) await this.options?.closeLocalBuilder?.();
          return snapshotResult(this.#replace({
            ...this.#snapshot,
            route: command.route,
            ...(!isCreationRoute(command.route.name) ? { creationSession: undefined, creationValidation: undefined } : {}),
            ...(command.route.name === "agents" ? { detail: undefined, activities: [], skills: undefined, agentLoad: undefined } : {}),
            ...(command.route.name === "runtimes" ? { runtimeDetail: undefined, runtimeDeletionImpact: undefined } : {}),
            refreshing: false,
          }));
        case "catalog-query":
          return snapshotResult(this.#replace({ ...this.#snapshot, route: { name: "agents" }, catalog: await client.listAgentCatalog(command.query), refreshing: false }));
        case "agent-update": {
          const detail = await client.updateAgent(command.agentId, command.expectedVersion, command.update);
          this.#cacheAgentDetail(command.agentId, detail);
          return snapshotResult(this.#replace({ ...this.#snapshot, detail, refreshing: false }));
        }
        case "agent-archive":
          await client.archiveAgent(command.agentId, command.expectedVersion);
          this.#agentCache.delete(command.agentId);
          return snapshotResult(await this.#refreshCatalog());
        case "agent-restore":
          await client.restoreAgent(command.agentId, command.expectedVersion);
          this.#agentCache.delete(command.agentId);
          return snapshotResult(await this.#refreshCatalog());
        case "agent-batch-lifecycle":
          await client.batchAgentLifecycle(command.request);
          this.#agentCache.clear();
          return snapshotResult(await this.#refreshCatalog());
        case "agent-skill-mutate": {
          const detail = await client.mutateAgentSkill(command.agentId, command.skillId, command.mutation);
          const skills = await client.listAgentSkills(command.agentId);
          this.#cacheAgentDetail(command.agentId, detail);
          this.#cacheAgentSkills(command.agentId, skills);
          return snapshotResult(this.#replace({ ...this.#snapshot, detail, skills, refreshing: false }));
        }
        case "agent-private-configuration-update": {
          await client.updateAgentPrivateConfiguration(command.agentId, command.update);
          const detail = await client.getAgentDetail(command.agentId);
          this.#cacheAgentDetail(command.agentId, detail);
          return snapshotResult(this.#replace({ ...this.#snapshot, detail, refreshing: false }));
        }
        case "creation-start": {
          await this.options?.closeLocalBuilder?.();
          const creationSession = createLocalCreationSession(command, this.#snapshot);
          return snapshotResult(this.#replace({ ...this.#snapshot, route: command.mode === "ai" ? { name: "agent-create-ai" } : { name: "agent-create-manual" }, creationSession, creationValidation: undefined, refreshing: false }));
        }
        case "creation-update": {
          const current = requireCreationSession(this.#snapshot);
          if (current.runtimeId !== command.update.runtimeId && current.mode === "ai") await this.options?.closeLocalBuilder?.();
          const creationSession = { ...current, ...command.update, ...(current.mode === "ai" ? { builder: current.builder } : {}) };
          return snapshotResult(this.#replace({ ...this.#snapshot, creationSession, creationValidation: undefined, refreshing: false }));
        }
        case "builder-turn": {
          const current = requireCreationSession(this.#snapshot);
          if (current.mode !== "ai" || !current.builder) throw new AccountProductHostError("builder-session-required");
          const runtime = this.#snapshot.runtimes.find((item) => item.runtimeId === current.runtimeId);
          if (!runtime || runtime.health !== "ready" || this.#snapshot.localServices.runtime.state !== "ready" || this.#snapshot.localServices.runtime.runtimeId !== runtime.runtimeId) throw new AccountProductHostError("runtime-not-ready");
          const runLocalBuilderTurn = this.options?.runLocalBuilderTurn;
          if (!runLocalBuilderTurn) throw new AccountProductHostError("builder-runtime-unavailable");
          const userMessage = { messageId: `builder-message:${randomUUID()}`, role: "user" as const, text: command.text };
          const inFlight: AgentCreationSession = { ...current, builder: { state: "in_flight", conversation: [...current.builder.conversation, userMessage] } };
          this.#replace({ ...this.#snapshot, creationSession: inFlight, creationValidation: undefined });
          try {
            const result = await runLocalBuilderTurn({ runtimeId: runtime.runtimeId, text: command.text, configuration: current.configuration });
            const creationSession = applyBuilderProposal(inFlight, result.proposal, result.assistantText);
            return snapshotResult(this.#replace({ ...this.#snapshot, creationSession, refreshing: false }));
          } catch (error) {
            const code = safeErrorCode(error);
            const creationSession: AgentCreationSession = { ...inFlight, builder: { state: "failed", conversation: inFlight.builder?.conversation ?? [], recoverableErrorCode: code } };
            this.#replace({ ...this.#snapshot, creationSession, refreshing: false, errorCode: code });
            throw error;
          }
        }
        case "creation-submit": {
          const creationSession = requireCreationSession(this.#snapshot);
          const runtime = this.#snapshot.runtimes.find((item) => item.runtimeId === creationSession.runtimeId);
          const validation = validateLocalAgentCreation({ creation: creationSession, ...(runtime ? { runtime } : {}) });
          if (!validation.valid) return snapshotResult(this.#replace({ ...this.#snapshot, creationValidation: validation, refreshing: false }));
          const agent = await client.createAgent({
            name: creationSession.name.trim(), description: creationSession.description,
            ...(creationSession.avatarUrl ? { avatarUrl: creationSession.avatarUrl } : {}),
            ...(creationSession.runtimeId ? { runtimeId: creationSession.runtimeId } : {}),
            permissionMode: creationSession.permissionMode, configuration: creationSession.configuration,
          });
          await this.options?.closeLocalBuilder?.();
          this.#replace({ ...this.#snapshot, route: { name: "agent-detail", agentId: agent.agentId, section: "overview" }, creationSession: undefined, creationValidation: undefined, refreshing: false });
          const detail = await client.getAgentDetail(agent.agentId);
          this.#cacheAgentDetail(agent.agentId, detail);
          return snapshotResult(this.#replace({ ...this.#snapshot, detail }));
        }
        case "runtime-open":
          return snapshotResult(this.#replace({ ...this.#snapshot, route: { name: "runtime-detail", runtimeId: command.runtimeId }, runtimeDetail: await client.getAccountRuntime(command.runtimeId), runtimeDeletionImpact: undefined, refreshing: false }));
        case "runtime-update": {
          const runtime = await client.updateAccountRuntime(command.runtimeId, { name: command.name, visibility: command.visibility, expectedVersion: command.expectedVersion });
          return snapshotResult(this.#replace({ ...this.#snapshot, runtimeDetail: runtime, runtimes: upsert(this.#snapshot.runtimes, runtime, "runtimeId"), refreshing: false }));
        }
        case "runtime-refresh": {
          const refresh = this.options?.refreshLocalRuntime;
          if (!refresh) throw new AccountProductHostError("runtime-refresh-not-local");
          const runtime = await refresh(command.runtimeId, command.expectedVersion);
          return snapshotResult(this.#replace({ ...this.#snapshot, runtimeDetail: runtime, runtimes: upsert(this.#snapshot.runtimes, runtime, "runtimeId"), refreshing: false }));
        }
        case "runtime-delete-plan":
          return snapshotResult(this.#replace({ ...this.#snapshot, runtimeDeletionImpact: await client.planAccountRuntimeDeletion(command.runtimeId), refreshing: false }));
        case "runtime-delete-confirm":
          await client.deleteAccountRuntime(command.runtimeId, command.confirmation);
          return snapshotResult(this.#replace({ ...this.#snapshot, route: { name: "runtimes" }, runtimes: (await client.listAccountRuntimes()) as AccountProductRendererSnapshot["runtimes"], runtimeDetail: undefined, runtimeDeletionImpact: undefined, refreshing: false }));
        case "friend-invite": {
          const invitation = await client.createFriendInvitation(command.invitation);
          const snapshot = this.#replace({ ...this.#snapshot, outgoingFriendInvitations: upsertFriendInvitation(this.#snapshot.outgoingFriendInvitations, invitation), refreshing: false });
          return accountProductRendererCommandResultSchema.parse({ type: "friend-invitation-created", invitation, snapshot });
        }
        case "friend-invitation-accept": {
          await client.acceptFriendInvitation(command.invitationId, command.expectedVersion);
          return snapshotResult(await this.#refreshFriends());
        }
        case "friend-invitation-reject": {
          await client.rejectFriendInvitation(command.invitationId, command.expectedVersion);
          return snapshotResult(await this.#refreshFriends());
        }
        case "friend-invitation-revoke": {
          await client.revokeFriendInvitation(command.invitationId, command.expectedVersion);
          return snapshotResult(await this.#refreshFriends());
        }
        case "friend-remove":
          await client.removeFriend(command.friendshipId, command.expectedVersion);
          return snapshotResult(await this.#refreshFriends());
        case "legacy-recovery-complete":
          return snapshotResult(this.#replace({ ...this.#snapshot, legacyRecovery: await client.completeLegacyAgentMigrationRecovery({ backupId: command.backupId, acknowledgedFields: command.acknowledgedFields }), refreshing: false }));
      }
    } catch (error) {
      const code = safeErrorCode(error);
      this.#replace({ ...this.#snapshot, refreshing: false, errorCode: code });
      throw new AccountProductHostError(code);
    }
  }

  #openAgent(authenticated: AccountProductAuthenticatedSession, agentId: string, section: "overview" | "activity" | "capabilities" | "settings"): AccountProductRendererSnapshot {
    const cached = this.#agentCache.get(agentId) ?? {};
    const snapshot = this.#replace({
      ...this.#snapshot,
      route: { name: "agent-detail", agentId, section },
      detail: cached.detail,
      activities: cached.activities ? [...cached.activities] : [],
      skills: cached.skills,
      agentLoad: {
        agentId,
        detail: cached.detail ? "ready" : "loading",
        activities: cached.activities ? "ready" : "loading",
        skills: cached.skills ? "ready" : "loading",
      },
      refreshing: false,
      errorCode: undefined,
    });
    this.#loadAgentFragments(authenticated, agentId, cached);
    return snapshot;
  }

  #loadAgentFragments(authenticated: AccountProductAuthenticatedSession, agentId: string, cached: AgentFragmentCache): void {
    if (!cached.detail) this.#startAgentFragmentLoad(agentId, "detail", () => this.#loadAgentDetail(authenticated, agentId));
    if (!cached.activities) this.#startAgentFragmentLoad(agentId, "activities", () => this.#loadAgentActivities(authenticated, agentId));
    if (!cached.skills) this.#startAgentFragmentLoad(agentId, "skills", () => this.#loadAgentSkills(authenticated, agentId));
  }

  #startAgentFragmentLoad(agentId: string, fragment: "detail" | "activities" | "skills", load: () => Promise<void>): void {
    const key = `${agentId}:${fragment}`;
    if (this.#agentLoads.has(key)) return;
    const work = load();
    this.#agentLoads.set(key, work);
    void work.finally(() => {
      if (this.#agentLoads.get(key) === work) this.#agentLoads.delete(key);
    });
  }

  async #loadAgentDetail(authenticated: AccountProductAuthenticatedSession, agentId: string): Promise<void> {
    try {
      const detail = await authenticated.client.getAgentDetail(agentId);
      if (this.#authenticated !== authenticated) return;
      this.#cacheAgentDetail(agentId, detail);
      this.#publishAgentFragment(agentId, "detail", "ready", { detail });
    } catch (error) {
      if (this.#authenticated === authenticated) this.#publishAgentFragment(agentId, "detail", "failed", {}, safeErrorCode(error));
    }
  }

  async #loadAgentActivities(authenticated: AccountProductAuthenticatedSession, agentId: string): Promise<void> {
    try {
      const result = await authenticated.client.listAgentActivities(agentId);
      if (this.#authenticated !== authenticated) return;
      const activities = [...result.activities];
      this.#cacheAgentActivities(agentId, activities);
      this.#publishAgentFragment(agentId, "activities", "ready", { activities });
    } catch (error) {
      if (this.#authenticated === authenticated) this.#publishAgentFragment(agentId, "activities", "failed", {}, safeErrorCode(error));
    }
  }

  async #loadAgentSkills(authenticated: AccountProductAuthenticatedSession, agentId: string): Promise<void> {
    try {
      const skills = await authenticated.client.listAgentSkills(agentId);
      if (this.#authenticated !== authenticated) return;
      this.#cacheAgentSkills(agentId, skills);
      this.#publishAgentFragment(agentId, "skills", "ready", { skills });
    } catch (error) {
      if (this.#authenticated === authenticated) this.#publishAgentFragment(agentId, "skills", "failed", {}, safeErrorCode(error));
    }
  }

  #publishAgentFragment(
    agentId: string,
    fragment: "detail" | "activities" | "skills",
    state: "ready" | "failed",
    patch: Partial<Pick<AccountProductRendererSnapshot, "detail" | "activities" | "skills">>,
    errorCode?: string,
  ): void {
    if (this.#snapshot.route.name !== "agent-detail" || this.#snapshot.route.agentId !== agentId || this.#snapshot.agentLoad?.agentId !== agentId) return;
    this.#replace({
      ...this.#snapshot,
      ...patch,
      agentLoad: { ...this.#snapshot.agentLoad, [fragment]: state },
      ...(errorCode ? { errorCode } : {}),
    });
  }

  #cacheAgentDetail(agentId: string, detail: AgentDetail): void {
    this.#agentCache.set(agentId, { ...this.#agentCache.get(agentId), detail });
  }

  #cacheAgentActivities(agentId: string, activities: AccountProductRendererSnapshot["activities"]): void {
    this.#agentCache.set(agentId, { ...this.#agentCache.get(agentId), activities: [...activities] });
  }

  #cacheAgentSkills(agentId: string, skills: AgentSkills): void {
    this.#agentCache.set(agentId, { ...this.#agentCache.get(agentId), skills });
  }

  #clearAgentCache(): void {
    this.#agentCache.clear();
    this.#agentLoads.clear();
  }

  async #hydrate(authenticated: AccountProductAuthenticatedSession): Promise<AccountProductRendererSnapshot> {
    await this.options?.closeLocalBuilder?.();
    this.#unsubscribeInvalidations?.();
    this.#unsubscribeInvalidations = undefined;
    this.#clearAgentCache();
    this.#authenticated = authenticated;
    const [catalog, runtimes, friends, incomingFriendInvitations, outgoingFriendInvitations, templates, legacyRecovery] = await Promise.all([
      this.#bootstrap("agents", authenticated.client.listAgentCatalog(defaultCatalogQuery)),
      this.#bootstrap("runtimes", authenticated.client.listAccountRuntimes()),
      this.#bootstrap("friends", authenticated.client.listFriends()),
      this.#bootstrap("invitations", authenticated.client.listIncomingFriendInvitations()),
      this.#bootstrap("invitations", authenticated.client.listOutgoingFriendInvitations()),
      this.#bootstrap("templates", authenticated.client.listAgentTemplates()),
      this.#bootstrap("migration", authenticated.client.getLegacyAgentMigrationRecovery()),
    ]);
    const snapshot = this.#replace({
      session: {
        state: "signed-in",
        accountId: authenticated.session.accountId,
        accountName: authenticated.accountName,
        userId: authenticated.session.userId,
        displayName: authenticated.session.displayName,
        email: authenticated.session.email,
        expiresAt: authenticated.session.expiresAt,
      },
      route: { name: "agents" }, connection: "online", localServices: authenticated.localServices ?? inactiveLocalServices(), catalog,
      activities: [], templates: [...templates], runtimes: runtimes as AccountProductRendererSnapshot["runtimes"], friends: [...friends], incomingFriendInvitations: [...incomingFriendInvitations], outgoingFriendInvitations: [...outgoingFriendInvitations],
      legacyRecovery, loading: false, refreshing: false,
    });
    this.#unsubscribeInvalidations = authenticated.subscribeInvalidations?.(
      (event) => { void this.invalidate(event); },
      (connection) => { this.#replace({ ...this.#snapshot, connection }); },
    );
    return snapshot;
  }

  async #bootstrap<T>(stage: "agents" | "runtimes" | "friends" | "invitations" | "templates" | "migration", work: Promise<T>): Promise<T> {
    try { return await work; }
    catch (error) {
      this.options?.diagnostic?.(`account-login-bootstrap:${stage}:${safeDiagnosticError(error)}`);
      throw error;
    }
  }

  async #applyInvalidation(event: AccountResourceInvalidation): Promise<void> {
    if (!this.#authenticated || this.#snapshot.session.state !== "signed-in") return;
    if (event.type === "human-resource-invalidated") {
      if (event.userId !== this.#snapshot.session.userId) return;
      try {
        if (event.resourceType === "friend-agent") {
          const catalog = await this.#authenticated.client.listAgentCatalog({ ...defaultCatalogQuery, scope: this.#snapshot.catalog?.scope ?? "mine" });
          this.#clearAgentCache();
          this.#replace({ ...this.#snapshot, connection: "online", catalog, errorCode: undefined });
        } else {
          const snapshot = await this.#reloadFriendCollections();
          if (event.aspects.includes("access")) {
            const catalog = await this.#authenticated.client.listAgentCatalog({ ...defaultCatalogQuery, scope: snapshot.catalog?.scope ?? "mine" });
            this.#clearAgentCache();
            this.#replace({ ...snapshot, connection: "online", catalog, errorCode: undefined });
          }
        }
      } catch (error) {
        this.#replace({ ...this.#snapshot, connection: "reconnecting", errorCode: safeErrorCode(error) });
      }
      return;
    }
    if (event.accountId !== this.#snapshot.session.accountId) return;
    const client = this.#authenticated.client;
    try {
      if (event.resourceType === "runtime") {
        const runtimes = await client.listAccountRuntimes();
        const runtimeDetail = this.#snapshot.route.name === "runtime-detail" && this.#snapshot.route.runtimeId === event.resourceId
          ? await client.getAccountRuntime(event.resourceId).catch(() => undefined)
          : this.#snapshot.runtimeDetail;
        this.#replace({ ...this.#snapshot, connection: "online", runtimes: runtimes as AccountProductRendererSnapshot["runtimes"], runtimeDetail, errorCode: undefined });
        return;
      }
      const catalog = await client.listAgentCatalog({ ...defaultCatalogQuery, scope: this.#snapshot.catalog?.scope ?? "mine" });
      if (this.#snapshot.route.name !== "agent-detail" || this.#snapshot.route.agentId !== event.resourceId) {
        this.#agentCache.delete(event.resourceId);
        this.#replace({ ...this.#snapshot, connection: "online", catalog, errorCode: undefined });
        return;
      }
      const [detail, activityResult, skills] = await Promise.all([
        client.getAgentDetail(event.resourceId),
        event.aspects.includes("activity") ? client.listAgentActivities(event.resourceId) : undefined,
        event.aspects.includes("agent") || event.aspects.includes("runtime") ? client.listAgentSkills(event.resourceId) : undefined,
      ]);
      this.#cacheAgentDetail(event.resourceId, detail);
      if (activityResult) this.#cacheAgentActivities(event.resourceId, [...activityResult.activities]);
      if (skills) this.#cacheAgentSkills(event.resourceId, skills);
      this.#replace({
        ...this.#snapshot, connection: "online", catalog, detail,
        ...(activityResult ? { activities: [...activityResult.activities] } : {}),
        ...(skills ? { skills } : {}),
        ...(this.#snapshot.agentLoad?.agentId === event.resourceId ? {
          agentLoad: {
            ...this.#snapshot.agentLoad,
            detail: "ready" as const,
            ...(activityResult ? { activities: "ready" as const } : {}),
            ...(skills ? { skills: "ready" as const } : {}),
          },
        } : {}),
        errorCode: undefined,
      });
    } catch (error) {
      this.#replace({ ...this.#snapshot, connection: "reconnecting", errorCode: safeErrorCode(error) });
    }
  }

  async #refreshCatalog(): Promise<AccountProductRendererSnapshot> {
    const client = this.#authenticated?.client;
    if (!client) throw new AccountProductHostError("authentication-required");
    const currentQuery = this.#snapshot.catalog
      ? { ...defaultCatalogQuery, scope: this.#snapshot.catalog.scope }
      : defaultCatalogQuery;
    return this.#replace({ ...this.#snapshot, route: { name: "agents" }, catalog: await client.listAgentCatalog(currentQuery), detail: undefined, activities: [], skills: undefined, agentLoad: undefined, refreshing: false });
  }

  async #refreshFriends(): Promise<AccountProductRendererSnapshot> {
    const snapshot = await this.#reloadFriendCollections();
    return this.#replace({ ...snapshot, route: { name: "friends" }, refreshing: false });
  }

  async #reloadFriendCollections(): Promise<AccountProductRendererSnapshot> {
    const client = this.#authenticated?.client;
    if (!client) throw new AccountProductHostError("authentication-required");
    const [friends, incomingFriendInvitations, outgoingFriendInvitations] = await Promise.all([
      client.listFriends(), client.listIncomingFriendInvitations(), client.listOutgoingFriendInvitations(),
    ]);
    return this.#replace({ ...this.#snapshot, friends: [...friends], incomingFriendInvitations: [...incomingFriendInvitations], outgoingFriendInvitations: [...outgoingFriendInvitations], connection: "online", refreshing: false, errorCode: undefined });
  }

  #replace(value: AccountProductRendererSnapshot): AccountProductRendererSnapshot {
    this.#snapshot = accountProductRendererSnapshotSchema.parse(value);
    for (const listener of this.#listeners) listener(this.#snapshot);
    return this.#snapshot;
  }
}

function createLocalCreationSession(
  command: Extract<AccountProductRendererCommand, { type: "creation-start" }>,
  snapshot: AccountProductRendererSnapshot,
): AgentCreationSession {
  const template = command.mode === "template" ? snapshot.templates.find((item) => item.templateId === command.templateId) : undefined;
  if (command.mode === "template" && !template) throw new AccountProductHostError("agent-template-not-found");
  const localRuntimeId = snapshot.localServices.runtime.state === "ready" ? snapshot.localServices.runtime.runtimeId : undefined;
  const runtime = snapshot.runtimes.find((item) => item.runtimeId === localRuntimeId && item.health === "ready");
  return {
    mode: command.mode,
    ...(template ? { templateId: template.templateId } : {}),
    name: template?.name ?? "",
    description: template?.description ?? "",
    ...(runtime ? { runtimeId: runtime.runtimeId } : {}),
    permissionMode: "private",
    configuration: {
      instructions: template?.instructions ?? "",
      maxConcurrentTasks: 1,
      skillIds: [], disabledRuntimeSkillIds: [], environmentVariableNames: [], customArguments: [], runtimeConfiguration: {}, mcpConnections: [], integrations: [],
    },
    ...(command.mode === "ai" ? { builder: { state: "idle" as const, conversation: [] } } : {}),
  };
}

function requireCreationSession(snapshot: AccountProductRendererSnapshot): AgentCreationSession {
  if (!snapshot.creationSession) throw new AccountProductHostError("creation-session-required");
  return snapshot.creationSession;
}

function applyBuilderProposal(session: AgentCreationSession, proposal: AgentBuilderProposal, assistantText: string): AgentCreationSession {
  const configuration = {
    ...session.configuration,
    instructions: proposal.instructions,
    ...(proposal.model ? { model: proposal.model } : { model: undefined }),
    ...(proposal.thinkingLevel ? { thinkingLevel: proposal.thinkingLevel } : { thinkingLevel: undefined }),
    ...(proposal.serviceTier ? { serviceTier: proposal.serviceTier } : { serviceTier: undefined }),
  };
  return {
    ...session,
    name: proposal.name,
    description: proposal.description,
    configuration,
    builder: {
      state: "idle",
      conversation: [...(session.builder?.conversation ?? []), { messageId: `builder-message:${randomUUID()}`, role: "assistant", text: assistantText }],
    },
  };
}

function isCreationRoute(name: AccountProductRendererSnapshot["route"]["name"]): boolean {
  return name === "agent-create-manual" || name === "agent-create-ai";
}

export class AccountProductHostError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AccountProductHostError";
  }
}

function signedOutSnapshot(reason: "initial" | "logged_out" | "expired" | "revoked", loading: boolean): AccountProductRendererSnapshot {
  return accountProductRendererSnapshotSchema.parse({
    session: { state: "signed-out", reason }, route: { name: "agents" }, connection: "offline",
    localServices: inactiveLocalServices(),
    activities: [], templates: [], runtimes: [], friends: [], incomingFriendInvitations: [], outgoingFriendInvitations: [], legacyRecovery: { state: "not_required" },
    loading, refreshing: false,
  });
}

function inactiveLocalServices(): AccountProductRendererSnapshot["localServices"] {
  return { runtime: { state: "inactive" }, mcp: { state: "inactive" } };
}

function snapshotResult(snapshot: AccountProductRendererSnapshot): AccountProductRendererCommandResult {
  return accountProductRendererCommandResultSchema.parse({ type: "snapshot", snapshot });
}

function safeErrorCode(error: unknown): string {
  if (error instanceof AccountProductHostError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Za-z0-9._:-]{1,191}$/u.test(error.code)) return error.code;
  if (error instanceof Error && /^[A-Za-z0-9._:-]{1,191}$/u.test(error.message)) return error.message;
  return "account-product-operation-failed";
}

function safeDiagnosticError(error: unknown): string {
  if (error instanceof AccountProductHostError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Za-z0-9._:-]{1,191}$/u.test(error.code)) return error.code;
  if (error instanceof Error && error.name === "FabricClientError") {
    const status = "status" in error && typeof error.status === "number" ? String(error.status) : "none";
    const messageCode = /^[A-Za-z][A-Za-z0-9._:-]{0,120}/u.exec(error.message)?.[0] ?? "unknown";
    return `fabric-client-${status}-${messageCode}`;
  }
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    const issue = error.issues[0];
    if (issue && typeof issue === "object") {
      const code = "code" in issue && typeof issue.code === "string" ? issue.code : "schema";
      const path = "path" in issue && Array.isArray(issue.path) ? issue.path.filter((part: unknown) => typeof part === "string" || typeof part === "number").join(".") : "root";
      return `schema-${code}-${path || "root"}`.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 191);
    }
  }
  if (error instanceof Error && error.cause) return `${error.name}-${safeDiagnosticError(error.cause)}`.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 191);
  if (error instanceof Error && /^[A-Za-z0-9._:-]{1,191}$/u.test(error.message)) return error.message;
  return error instanceof Error ? error.name.replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 80) || "Error" : "unknown";
}

function upsert<T extends Record<K, string>, K extends keyof T>(items: readonly T[], item: T, key: K): T[] {
  const index = items.findIndex((candidate) => candidate[key] === item[key]);
  if (index < 0) return [...items, item];
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}

function upsertFriendInvitation(
  items: AccountProductRendererSnapshot["outgoingFriendInvitations"],
  item: AccountProductRendererSnapshot["outgoingFriendInvitations"][number],
): AccountProductRendererSnapshot["outgoingFriendInvitations"] {
  const index = items.findIndex((candidate) => candidate.invitation.invitationId === item.invitation.invitationId);
  return index < 0 ? [...items, item] : items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}
