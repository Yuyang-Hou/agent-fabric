import { joinExchangeRequestSchema, type CredentialScope } from "@agent-fabric/fabric-contracts";
import { restHandler } from "@a2a-js/sdk/server/express";
import { AgentCard } from "@a2a-js/sdk";
import { accountRuntimeClientEnvelopeSchema, agentCatalogPageSchema, agentCatalogQuerySchema, agentPrivateConfigurationUpdateSchema, approvedAgentTemplates, completeLegacyAgentMigrationRecoverySchema, legacyAgentMigrationRecoverySchema, runtimeCapabilitiesSchema, runtimeSkillSummarySchema, type AccountResourceInvalidation, type AgentCatalogQuery, type AgentRuntime, type RuntimeCapabilities, type RuntimeSkillSummary } from "@agent-fabric/account-agent-domain";
import type { User } from "@a2a-js/sdk/server";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";

import { AccountAgentA2ARegistry, type AccountAgentExecutionPort } from "./account-agent-a2a.js";
import { AccountInvalidationHub } from "./account-invalidation.js";
import { AccountRuntimeTunnelRegistry } from "./account-runtime-tunnel.js";
import { AuthenticationBrokerError, createAuthenticationBroker, type AuthenticationBroker } from "./auth-broker.js";
import { createPersistenceStore, requireAccountAgentA2APersistence, requireAccountAgentManagementPersistence, requireAccountAuthenticationPersistence, requireHumanFriendshipManagementPersistence, requireAccountMigrationRecoveryPersistence, requireAccountProductBootstrapPersistence, requireAccountRuntimeConnectionPersistence, requireAccountRuntimeManagementPersistence, requireAccountRuntimeObservationPersistence, requireAccountSelfTestPersistence, type PersistenceStore } from "./persistence-store.js";
import type { ServerConfig } from "./server-config.js";

interface RequestPrincipal extends User {
  readonly credentialId: string;
  readonly principalId: string;
  readonly ownerPrincipalId?: string;
  readonly scopes: readonly CredentialScope[];
}

const principals = new WeakMap<Request, RequestPrincipal>();

export interface AgentFabricServer {
  readonly config: ServerConfig;
  readonly store: PersistenceStore;
  readonly accountRuntimeTunnels: AccountRuntimeTunnelRegistry;
  readonly accountInvalidations: AccountInvalidationHub;
  address(): string | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createAgentFabricServer(config: ServerConfig, options: {
  readonly authenticationBroker?: AuthenticationBroker;
  readonly store?: PersistenceStore;
  readonly accountAgentExecution?: AccountAgentExecutionPort;
} = {}): AgentFabricServer {
  const store = options.store ?? createPersistenceStore(config);
  const accountRuntimeTunnels = new AccountRuntimeTunnelRegistry(config.tunnelTimeoutMs);
  const accountInvalidations = new AccountInvalidationHub();
  const publishAccountInvalidation = (event: Extract<AccountResourceInvalidation, { readonly type: "account-resource-invalidated" }>): void => {
    accountInvalidations.publish(event);
    const aspects = event.aspects.filter((aspect): aspect is "access" | "presence" => aspect === "access" || aspect === "presence");
    if (aspects.length === 0) return;
    void (async () => requireHumanFriendshipManagementPersistence(store).listActiveFriendUserIdsForAccount(event.accountId))().then((userIds) => {
      for (const userId of userIds) accountInvalidations.publish({ type: "human-resource-invalidated", userId, resourceType: "friend-agent", resourceId: "friend-agent-catalog", aspects, observedAt: event.observedAt });
    }).catch(() => undefined);
  };
  const authentication = options.authenticationBroker ?? createAuthenticationBroker(config);
  const app = express();
  const friendInvitationAttempts = new Map<string, { count: number; resetAt: number }>();
  const accountAgentExecution = options.accountAgentExecution ?? accountRuntimeTunnels;
  const accountA2A = new AccountAgentA2ARegistry(store, config.publicBaseUrl, accountAgentExecution, (event) => {
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: event.accountId, resourceType: "agent", resourceId: event.agentId, aspects: [...event.aspects], observedAt: event.observedAt });
  });
  app.disable("x-powered-by");
  if (authentication) app.all("/v1/auth/broker/callback/google", authentication.handler);
  app.use(express.json({ limit: "64kb", strict: true }));

  let ready = false;
  app.get("/live", (_request, response) => response.json({ status: "alive", version: config.component.version }));
  app.get("/ready", async (_request, response) => {
    try {
      const database = await store.health();
      response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "starting", database });
    } catch {
      response.status(503).json({ status: "not-ready", database: "unavailable" });
    }
  });
  app.get("/v1/version", (_request, response) => response.json({
    ...config.component,
    features: config.component.features.filter((feature) => feature !== "email-otp-login" || authentication?.emailOtpAvailable()),
  }));

  app.post("/v1/agents", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const credentialId = requirePrincipal(request).credentialId;
    const agent = await requireAccountAgentManagementPersistence(store).createAccountAgentForCredential(credentialId, request.body);
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: agent.accountId, resourceType: "agent", resourceId: agent.agentId, aspects: ["agent", "access", "presence"], observedAt: agent.updatedAt });
    response.status(201).json(agent);
  }));

  app.get("/v1/agent-templates", requireAnyScope(store, config, ["account:access"]), (_request, response) => {
    response.json({ templates: approvedAgentTemplates });
  });

  app.get("/v1/agents", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const page = await requireAccountAgentManagementPersistence(store).queryAccountAgentCatalogForCredential(requirePrincipal(request).credentialId, accountAgentCatalogQuery(request));
    response.json(agentCatalogPageSchema.parse({
      ...page,
      ...(page.nextCursor ? { nextCursor: Buffer.from(JSON.stringify(page.nextCursor), "utf8").toString("base64url") } : {}),
    }));
  }));

  app.get("/v1/agents/:agentId", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const detail = await requireAccountAgentManagementPersistence(store).getAccountAgentDetailForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.agentId));
    response.setHeader("etag", detail.etag);
    response.setHeader("cache-control", "private, no-cache");
    response.json(detail);
  }));

  app.get("/v1/agents/:agentId/activities", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const page = await requireAccountAgentManagementPersistence(store).listAccountAgentActivitiesForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.agentId), accountPageRequest(request));
    response.json({ activities: page.items, ...(page.nextCursor ? { nextCursor: Buffer.from(JSON.stringify(page.nextCursor), "utf8").toString("base64url") } : {}) });
  }));

  app.get("/v1/agents/:agentId/skills", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(await requireAccountAgentManagementPersistence(store).listAccountAgentSkillsForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.agentId)));
  }));

  app.post("/v1/agents/:agentId/skills/:skillId", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const persistence = requireAccountAgentManagementPersistence(store);
    const credentialId = requirePrincipal(request).credentialId;
    const agentId = routeParameter(request.params.agentId);
    const agent = await persistence.mutateAccountAgentSkillForCredential(credentialId, agentId, routeParameter(request.params.skillId), request.body);
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: agent.accountId, resourceType: "agent", resourceId: agent.agentId, aspects: ["agent"], observedAt: agent.updatedAt });
    const detail = await persistence.getAccountAgentDetailForCredential(credentialId, agentId);
    response.setHeader("etag", detail.etag).json(detail);
  }));

  app.get("/v1/agents/:agentId/private-configuration", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const persistence = requireAccountAgentManagementPersistence(store);
    const credentialId = requirePrincipal(request).credentialId;
    const agentId = routeParameter(request.params.agentId);
    let detail;
    try {
      detail = await persistence.getAccountAgentDetailForCredential(credentialId, agentId);
      if (!detail.access.canManage) throw new Error("account-agent-not-found");
    } catch (error) {
      await persistence.recordAccountAgentPrivateConfigurationAuditForCredential(credentialId, agentId, "denied", "private-configuration-authority-denied");
      throw error;
    }
    await persistence.recordAccountAgentPrivateConfigurationAuditForCredential(credentialId, agentId, "success", "redacted-summary-read");
    response.setHeader("cache-control", "private, no-store").json({
      environment: detail.configuration.environment,
      mcpConnections: detail.configuration.mcpConnections.map((connection) => ({ connectionId: connection.connectionId, configured: connection.configured, redacted: true })),
      integrations: detail.configuration.integrations.map((integration) => ({ integrationId: integration.integrationId, configured: integration.state === "configured", redacted: true })),
      etag: detail.etag,
    });
  }));

  app.put("/v1/agents/:agentId/private-configuration", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const input = agentPrivateConfigurationUpdateSchema.parse(request.body);
    const persistence = requireAccountAgentManagementPersistence(store);
    const credentialId = requirePrincipal(request).credentialId;
    const agentId = routeParameter(request.params.agentId);
    let plan;
    try { plan = await persistence.prepareAccountAgentPrivateConfigurationForCredential(credentialId, agentId, input.expectedVersion); }
    catch (error) {
      await persistence.recordAccountAgentPrivateConfigurationAuditForCredential(credentialId, agentId, "denied", "private-configuration-authority-or-state-denied");
      throw error;
    }
    let summary;
    try { summary = await accountRuntimeTunnels.replacePrivateConfiguration({ accountId: plan.accountId, runtimeId: plan.runtimeId, agentId, idempotencyKey: input.idempotencyKey, configuration: input.configuration }); }
    catch (error) {
      await persistence.recordAccountAgentPrivateConfigurationAuditForCredential(credentialId, agentId, "failed", "edge-private-configuration-write-failed");
      throw error;
    }
    const agent = await persistence.commitAccountAgentPrivateConfigurationSummaryForCredential(credentialId, agentId, input.expectedVersion, summary);
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: agent.accountId, resourceType: "agent", resourceId: agent.agentId, aspects: ["agent"], observedAt: agent.updatedAt });
    const detail = await persistence.getAccountAgentDetailForCredential(credentialId, agentId);
    response.setHeader("etag", detail.etag).setHeader("cache-control", "private, no-store").json({ status: "updated", summary: { environment: detail.configuration.environment, configuredMcpCount: detail.configuration.mcpConnections.filter((connection) => connection.configured).length, configuredIntegrationCount: detail.configuration.integrations.filter((integration) => integration.state === "configured").length }, etag: detail.etag });
  }));

  app.post("/v1/self-tests", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["agentId", "expiresAt"]);
    const result = await requireAccountSelfTestPersistence(store).createAccountSelfTestForCredential(
      requirePrincipal(request).credentialId,
      stringBody(body, "agentId"),
      { audience: config.publicBaseUrl, expiresAt: isoTimestampBody(body, "expiresAt") },
    );
    response.setHeader("cache-control", "no-store").status(201).json(result);
  }));

  app.post("/v1/self-tests/:selfTestId/revoke", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    exactObjectBody(request.body, []);
    response.json(await requireAccountSelfTestPersistence(store).revokeAccountSelfTestForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.selfTestId)));
  }));

  app.get("/v1/invokable-agents", requireAnyScope(store, config, ["account:access", "account:self-test"]), asyncRoute(async (request, response) => {
    const agents = await requireAccountAgentA2APersistence(store).listInvokableAccountAgentsForCredential(requirePrincipal(request).credentialId, optionalQueryString(request, "query"));
    response.json({ agents: agents.map(({ agent, runtime, accessScope }) => ({
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
      availability: !runtime ? "offline" : runtime.health === "ready" ? "online" : runtime.health === "checking" ? "unstable" : "offline",
      accessScope,
    })) });
  }));

  app.patch("/v1/agents/:agentId", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const persistence = requireAccountAgentManagementPersistence(store);
    const credentialId = requirePrincipal(request).credentialId;
    const agentId = routeParameter(request.params.agentId);
    const expectedVersion = positiveIntegerBody(request.body, "expectedVersion");
    const current = await persistence.getAccountAgentDetailForCredential(credentialId, agentId);
    const matchedVersion = agentIfMatchVersion(requiredHeader(request.headers["if-match"]));
    if (matchedVersion !== expectedVersion || matchedVersion !== current.identity.version) {
      response.status(409).setHeader("etag", current.etag).json({ error: { code: "account-agent-version-conflict", currentVersion: current.identity.version, currentEtag: current.etag } });
      return;
    }
    let agent;
    try { agent = await persistence.updateAccountAgentForCredential(credentialId, agentId, request.body); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes("account-agent-version-conflict")) throw error;
      const latest = await persistence.getAccountAgentDetailForCredential(credentialId, agentId);
      response.status(409).setHeader("etag", latest.etag).json({ error: { code: "account-agent-version-conflict", currentVersion: latest.identity.version, currentEtag: latest.etag } });
      return;
    }
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: agent.accountId, resourceType: "agent", resourceId: agent.agentId, aspects: ["agent", "access", "presence"], observedAt: agent.updatedAt });
    const detail = await persistence.getAccountAgentDetailForCredential(credentialId, agentId);
    response.setHeader("etag", detail.etag).json(detail);
  }));

  app.post("/v1/agents/:agentId/archive", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["expectedVersion"]);
    const agent = await requireAccountAgentManagementPersistence(store).archiveAccountAgentForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.agentId), positiveIntegerBody(body, "expectedVersion"));
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: agent.accountId, resourceType: "agent", resourceId: agent.agentId, aspects: ["agent", "access", "presence", "workload"], observedAt: agent.updatedAt });
    response.json(agent);
  }));

  app.post("/v1/agents/:agentId/restore", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["expectedVersion"]);
    const result = await requireAccountAgentManagementPersistence(store).restoreAccountAgentForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.agentId), positiveIntegerBody(body, "expectedVersion"));
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: result.agent.accountId, resourceType: "agent", resourceId: result.agent.agentId, aspects: ["agent", "access", "presence"], observedAt: result.agent.updatedAt });
    response.json(result);
  }));

  app.post("/v1/agents/batch-lifecycle", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const result = await requireAccountAgentManagementPersistence(store).batchAccountAgentLifecycleForCredential(requirePrincipal(request).credentialId, request.body);
    for (const item of result.results) publishAccountInvalidation({ type: "account-resource-invalidated", accountId: result.accountId, resourceType: "agent", resourceId: item.agent.agentId, aspects: ["agent", "access", "presence", "workload"], observedAt: result.appliedAt });
    response.json(result);
  }));

  app.get("/v1/agents/:agentId/card", requireAnyScope(store, config, ["account:access", "account:self-test"]), asyncRoute(async (request, response) => {
    const card = await accountA2A.card(routeParameter(request.params.agentId), requirePrincipal(request).credentialId);
    response.setHeader("cache-control", "private, no-store");
    response.json(AgentCard.toJSON(card));
  }));

  app.get("/v1/a2a/tasks/:taskId/route", requireAnyScope(store, config, ["account:access", "account:self-test"]), asyncRoute(async (request, response) => {
    const route = await requireAccountAgentA2APersistence(store).getReadableAccountA2ATaskRouteForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.taskId));
    response.json({ taskId: route.taskId, agentId: route.agentId, state: route.state });
  }));

  app.use("/a2a/agents/:agentId", requireAnyScope(store, config, ["account:access", "account:self-test"]), asyncRoute(async (request, response, next) => {
    const handler = await accountA2A.handler(routeParameter(request.params.agentId), requirePrincipal(request).credentialId);
    restHandler({ requestHandler: handler, userBuilder: async () => requirePrincipal(request) })(request, response, next);
  }));

  app.get("/v1/auth/device/google/start", asyncRoute(async (request, response) => {
    const broker = requireAuthentication(authentication, "google");
    const returnUri = queryString(request, "returnUri");
    validateLoopbackReturnUri(returnUri);
    const codeChallenge = pkceValue(queryString(request, "codeChallenge"), "codeChallenge");
    const clientState = boundedValue(queryString(request, "clientState"), "clientState", 200);
    const deviceName = boundedValue(queryString(request, "deviceName"), "deviceName", 120);
    await broker.consumeGoogleStart(requestIp(request));
    const now = Date.now();
    const attempt = await store.createAccountLoginAttempt({ method: "google", returnUri, clientState, codeChallenge, deviceName, expiresAt: new Date(now + 10 * 60 * 1000).toISOString(), createdAt: new Date(now).toISOString() });
    const completion = new URL("/v1/auth/device/google/complete", config.publicBaseUrl);
    completion.searchParams.set("attemptId", attempt.attemptId);
    const failure = new URL("/v1/auth/device/google/error", config.publicBaseUrl);
    failure.searchParams.set("attemptId", attempt.attemptId);
    const destination = await broker.beginGoogle({ callbackURL: completion.toString(), errorCallbackURL: failure.toString(), headers: requestHeaders(request) });
    appendSetCookies(response, destination.headers);
    response.redirect(303, destination.url);
  }));

  app.get("/v1/auth/device/google/complete", asyncRoute(async (request, response) => {
    const broker = requireAuthentication(authentication, "google");
    const attemptId = queryString(request, "attemptId");
    const user = await broker.sessionUser(requestHeaders(request));
    if (!user?.emailVerified) throw new AuthenticationBrokerError("authentication-failed");
    enforceSelfServiceIdentity(user.email, config.authentication?.google?.selfServiceAllowedDomains ?? []);
    const exchangeCode = randomBytes(32).toString("base64url");
    const destination = await store.authenticateAccountLoginAttempt({ attemptId, expectedMethod: "google", authUserId: user.id, verifiedEmail: user.email, displayName: user.name, proofDigest: digestHex(exchangeCode) });
    appendSetCookies(response, await broker.endSession(requestHeaders(request)));
    const redirect = new URL(destination.returnUri);
    redirect.searchParams.set("code", exchangeCode);
    redirect.searchParams.set("state", destination.clientState);
    response.redirect(303, redirect.toString());
  }));

  app.get("/v1/auth/device/google/error", asyncRoute(async (request, response) => {
    const broker = requireAuthentication(authentication, "google");
    const destination = await store.cancelAccountLoginAttempt(queryString(request, "attemptId"));
    appendSetCookies(response, await broker.endSession(requestHeaders(request)));
    const redirect = new URL(destination.returnUri);
    redirect.searchParams.set("error", "login_cancelled");
    redirect.searchParams.set("state", destination.clientState);
    response.redirect(303, redirect.toString());
  }));

  app.post("/v1/auth/device/email/request", asyncRoute(async (request, response) => {
    const broker = requireAuthentication(authentication, "email");
    const body = exactObjectBody(request.body, ["email", "codeChallenge", "returnUri", "clientState", "deviceName", "attemptId"]);
    const email = emailBody(body, "email");
    await broker.consumeEmail("request", requestIp(request), email);
    const existingAttemptId = optionalStringBody(body, "attemptId");
    let attempt: { readonly attemptId: string; readonly expiresAt: string };
    if (existingAttemptId) {
      const existing = await store.getAccountLoginAttempt(existingAttemptId);
      if (existing.method !== "email" || existing.emailDigest !== digestHex(email)) throw new Error("login-attempt-unavailable");
      attempt = { attemptId: existing.attemptId, expiresAt: existing.expiresAt };
    } else {
      const returnUri = stringBody(body, "returnUri");
      validateLoopbackReturnUri(returnUri);
      const now = Date.now();
      attempt = await store.createAccountLoginAttempt({ method: "email", returnUri, clientState: boundedValue(stringBody(body, "clientState"), "clientState", 200), codeChallenge: pkceValue(stringBody(body, "codeChallenge"), "codeChallenge"), deviceName: boundedValue(stringBody(body, "deviceName"), "deviceName", 120), email, expiresAt: new Date(now + 10 * 60 * 1000).toISOString(), createdAt: new Date(now).toISOString() });
    }
    await broker.requestEmailCode(email);
    response.status(202).setHeader("cache-control", "no-store").json({ attemptId: attempt.attemptId, expiresAt: attempt.expiresAt, resendAfterSeconds: 60 });
  }));

  app.post("/v1/auth/device/email/verify", asyncRoute(async (request, response) => {
    const broker = requireAuthentication(authentication, "email");
    const body = exactObjectBody(request.body, ["attemptId", "email", "otp"]);
    const email = emailBody(body, "email");
    const otp = stringBody(body, "otp");
    if (!/^\d{6}$/u.test(otp)) throw new AuthenticationBrokerError("authentication-failed");
    await broker.consumeEmail("verify", requestIp(request), email);
    const attemptId = stringBody(body, "attemptId");
    const attempt = await store.getAccountLoginAttempt(attemptId);
    if (attempt.method !== "email" || attempt.emailDigest !== digestHex(email)) throw new AuthenticationBrokerError("authentication-failed");
    const user = await broker.verifyEmailCode(email, otp);
    if (!user.emailVerified || user.email !== email) throw new AuthenticationBrokerError("authentication-failed");
    const exchangeCode = randomBytes(32).toString("base64url");
    await store.authenticateAccountLoginAttempt({ attemptId, expectedMethod: "email", authUserId: user.id, verifiedEmail: user.email, displayName: user.name, proofDigest: digestHex(exchangeCode) });
    response.setHeader("cache-control", "no-store").json({ exchangeCode });
  }));

  app.post("/v1/auth/device/exchange", asyncRoute(async (request, response) => {
    requireAuthentication(authentication);
    const input = joinExchangeRequestSchema.parse(request.body);
    const result = await store.redeemAccountLoginAttempt({ proofDigest: digestHex(input.exchangeCode), codeChallenge: digestBase64Url(input.codeVerifier), audience: config.publicBaseUrl, credentialExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() });
    response.setHeader("cache-control", "no-store").json({ server: config.publicBaseUrl, ...result });
  }));

  app.get("/v1/session", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(await requireAccountAuthenticationPersistence(store).getAccountSessionByCredential(requirePrincipal(request).credentialId));
  }));

  app.get("/v1/account", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(await requireAccountProductBootstrapPersistence(store).getAccountForCredential(requirePrincipal(request).credentialId));
  }));

  app.get("/v1/migration-recovery", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(legacyAgentMigrationRecoverySchema.parse(await requireAccountMigrationRecoveryPersistence(store).getLegacyAgentMigrationRecoveryForCredential(requirePrincipal(request).credentialId)));
  }));

  app.post("/v1/migration-recovery/complete", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(legacyAgentMigrationRecoverySchema.parse(await requireAccountMigrationRecoveryPersistence(store).completeLegacyAgentMigrationRecoveryForCredential(
      requirePrincipal(request).credentialId,
      completeLegacyAgentMigrationRecoverySchema.parse(request.body),
    )));
  }));

  app.all(["/v1/members", "/v1/members/*path", "/v1/member-invitations", "/v1/member-invitations/*path"], (_request, response) => retiredAccountMembershipResponse(response));

  app.get("/v1/friend-invitations/incoming", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const page = await requireHumanFriendshipManagementPersistence(store).listIncomingFriendInvitationsForCredential(requirePrincipal(request).credentialId, accountPageRequest(request));
    response.json(accountPageResponse("invitations", page));
  }));

  app.get("/v1/friend-invitations/outgoing", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const page = await requireHumanFriendshipManagementPersistence(store).listOutgoingFriendInvitationsForCredential(requirePrincipal(request).credentialId, accountPageRequest(request));
    response.json(accountPageResponse("invitations", page));
  }));

  app.post("/v1/friend-invitations", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const principal = requirePrincipal(request);
    enforceLocalRateLimit(friendInvitationAttempts, principal.principalId, 20);
    const body = exactObjectBody(request.body, ["email", "expiresAt"]);
    const result = await requireHumanFriendshipManagementPersistence(store).createFriendInvitationForCredential(principal.credentialId, {
      email: emailBody(body, "email"), expiresAt: isoTimestampBody(body, "expiresAt"),
    });
    accountInvalidations.publish({ type: "human-resource-invalidated", userId: result.invitation.inviterUserId, resourceType: "friend-invitation", resourceId: result.invitation.invitationId, aspects: ["invitations"], observedAt: result.invitation.createdAt });
    if (result.invitation.recipientUserId) accountInvalidations.publish({ type: "human-resource-invalidated", userId: result.invitation.recipientUserId, resourceType: "friend-invitation", resourceId: result.invitation.invitationId, aspects: ["invitations"], observedAt: result.invitation.createdAt });
    response.status(201).json(result);
  }));

  for (const action of ["accept", "reject", "revoke"] as const) {
    app.post(`/v1/friend-invitations/:invitationId/${action}`, requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
      const body = exactObjectBody(request.body, ["expectedVersion"]);
      const persistence = requireHumanFriendshipManagementPersistence(store);
      const credentialId = requirePrincipal(request).credentialId;
      const invitationId = routeParameter(request.params.invitationId);
      const expectedVersion = positiveIntegerBody(body, "expectedVersion");
      const result = action === "accept"
        ? await persistence.acceptFriendInvitationForCredential(credentialId, invitationId, expectedVersion)
        : action === "reject"
          ? await persistence.rejectFriendInvitationForCredential(credentialId, invitationId, expectedVersion)
          : await persistence.revokeFriendInvitationForCredential(credentialId, invitationId, expectedVersion);
      const invitation = "invitation" in result ? result.invitation : result;
      const observedAt = invitation.acceptedAt ?? invitation.rejectedAt ?? invitation.revokedAt ?? invitation.createdAt;
      for (const userId of new Set([invitation.inviterUserId, invitation.recipientUserId].filter((value): value is string => Boolean(value)))) {
        accountInvalidations.publish({ type: "human-resource-invalidated", userId, resourceType: action === "accept" ? "friendship" : "friend-invitation", resourceId: action === "accept" && "friendship" in result ? result.friendship.friendshipId : invitationId, aspects: action === "accept" ? ["friends", "access"] : ["invitations"], observedAt });
      }
      response.json(result);
    }));
  }

  app.get("/v1/friends", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const page = await requireHumanFriendshipManagementPersistence(store).listFriendsForCredential(requirePrincipal(request).credentialId, accountPageRequest(request));
    response.json(accountPageResponse("friends", page));
  }));

  app.post("/v1/friends/:friendshipId/remove", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["expectedVersion"]);
    const principal = requirePrincipal(request);
    const persistence = requireHumanFriendshipManagementPersistence(store);
    const friendshipId = routeParameter(request.params.friendshipId);
    const result = await persistence.removeFriendForCredential(principal.credentialId, friendshipId, positiveIntegerBody(body, "expectedVersion"));
    for (const userId of result.participantUserIds) {
      accountInvalidations.publish({ type: "human-resource-invalidated", userId, resourceType: "friendship", resourceId: friendshipId, aspects: ["friends", "access"], observedAt: new Date().toISOString() });
    }
    response.json({ friendshipId: result.friendshipId, status: result.status, relationshipVersion: result.relationshipVersion });
  }));

  app.get("/v1/runtimes", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const page = await requireAccountRuntimeManagementPersistence(store).listAccountRuntimesForCredential(requirePrincipal(request).credentialId, accountPageRequest(request));
    response.json(accountPageResponse("runtimes", page));
  }));

  app.get("/v1/runtimes/:runtimeId", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(await requireAccountRuntimeManagementPersistence(store).getAccountRuntimeForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.runtimeId)));
  }));

  app.post("/v1/runtimes", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["provider", "adapterId", "name", "visibility", "health", "capabilities"]);
    const runtime = await requireAccountRuntimeManagementPersistence(store).createAccountRuntimeForCredential(requirePrincipal(request).credentialId, {
      provider: stringBody(body, "provider"), adapterId: stringBody(body, "adapterId"), name: stringBody(body, "name"), visibility: runtimeVisibilityBody(body),
      health: runtimeHealthBody(body), capabilities: runtimeCapabilitiesBody(body.capabilities),
    });
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: runtime.accountId, resourceType: "runtime", resourceId: runtime.runtimeId, aspects: ["runtime", "presence"], observedAt: runtime.updatedAt });
    response.status(201).json(runtime);
  }));

  app.patch("/v1/runtimes/:runtimeId", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["name", "visibility", "expectedVersion"]);
    const runtime = await requireAccountRuntimeManagementPersistence(store).updateAccountRuntimeForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.runtimeId), {
      name: stringBody(body, "name"), visibility: runtimeVisibilityBody(body), expectedVersion: positiveIntegerBody(body, "expectedVersion"),
    });
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: runtime.accountId, resourceType: "runtime", resourceId: runtime.runtimeId, aspects: ["runtime", "presence"], observedAt: runtime.updatedAt });
    response.json(runtime);
  }));

  app.put("/v1/runtimes/:runtimeId/observation", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["health", "capabilities", "runtimeSkills", "expectedVersion"]);
    const runtimeSkills = runtimeSkillsBody(body.runtimeSkills);
    const runtime = await requireAccountRuntimeManagementPersistence(store).observeAccountRuntimeForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.runtimeId), {
      health: runtimeHealthBody(body), capabilities: runtimeCapabilitiesBody(body.capabilities), ...(runtimeSkills ? { runtimeSkills } : {}), expectedVersion: positiveIntegerBody(body, "expectedVersion"),
    });
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: runtime.accountId, resourceType: "runtime", resourceId: runtime.runtimeId, aspects: ["runtime", "presence"], observedAt: runtime.lastCheckedAt ?? runtime.updatedAt });
    response.json(runtime);
  }));

  app.post("/v1/runtimes/:runtimeId/refresh", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["expectedVersion"]);
    const runtime = await requireAccountRuntimeManagementPersistence(store).refreshAccountRuntimeForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.runtimeId), positiveIntegerBody(body, "expectedVersion"));
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: runtime.accountId, resourceType: "runtime", resourceId: runtime.runtimeId, aspects: ["runtime", "presence"], observedAt: runtime.updatedAt });
    response.json(runtime);
  }));

  app.get("/v1/runtimes/:runtimeId/deletion-impact", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    response.json(await requireAccountRuntimeManagementPersistence(store).planAccountRuntimeDeletionForCredential(requirePrincipal(request).credentialId, routeParameter(request.params.runtimeId)));
  }));

  app.post("/v1/runtimes/:runtimeId/deletion", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    const body = exactObjectBody(request.body, ["planId", "expectedRuntimeVersion"]);
    const credentialId = requirePrincipal(request).credentialId;
    const runtimeId = routeParameter(request.params.runtimeId);
    const confirmation = { planId: stringBody(body, "planId"), expectedRuntimeVersion: positiveIntegerBody(body, "expectedRuntimeVersion") };
    const persistence = requireAccountRuntimeManagementPersistence(store);
    const executionPlan = await persistence.prepareAccountRuntimeDeletionForCredential(credentialId, runtimeId, confirmation);
    if (executionPlan.activeTasks.length > 0 && !accountAgentExecution.cancel) throw new Error("runtime-cancellation-unavailable");
    for (const task of executionPlan.activeTasks) {
      const canceled = await accountAgentExecution.cancel?.({ accountId: executionPlan.accountId, runtimeId, agentId: task.agentId, taskId: task.taskId });
      if (!canceled || canceled.id !== task.taskId) throw new Error("runtime-cancellation-failed");
    }
    await persistence.settleAccountRuntimeDeletionTasksForCredential(credentialId, runtimeId, confirmation.planId, executionPlan.activeTasks.map((task) => task.taskId));
    const result = await persistence.deleteAccountRuntimeForCredential(credentialId, runtimeId, confirmation);
    accountRuntimeTunnels.disconnect(executionPlan.accountId, runtimeId);
    publishAccountInvalidation({ type: "account-resource-invalidated", accountId: executionPlan.accountId, resourceType: "runtime", resourceId: runtimeId, aspects: ["runtime", "presence"], observedAt: new Date().toISOString() });
    for (const agentId of result.unboundAgentIds) publishAccountInvalidation({ type: "account-resource-invalidated", accountId: executionPlan.accountId, resourceType: "agent", resourceId: agentId, aspects: ["agent", "presence"], observedAt: new Date().toISOString() });
    response.json(result);
  }));

  app.post("/v1/auth/logout", requireAnyScope(store, config, ["account:access"]), asyncRoute(async (request, response) => {
    await store.revokeCredential(requirePrincipal(request).credentialId);
    response.json({ status: "logged_out" });
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _request;
    void _next;
    const code = error instanceof AuthenticationBrokerError ? error.code : error instanceof Error ? (error.message.split(":")[0] ?? "internal-error") : "internal-error";
    if (error instanceof AuthenticationBrokerError && error.retryAfterMs) response.setHeader("retry-after", Math.ceil(error.retryAfterMs / 1000));
    const status = code.includes("unavailable") || code.includes("offline") ? 503
      : code.includes("rate-limited") ? 429
      : code.includes("scope") || code.includes("denied") ? 403
      : code.includes("credential") || code.includes("authentication") ? 401
        : code.includes("not-found") ? 404
          : 400;
    response.status(status).json({ error: { code } });
  });

  const httpServer = createServer(app);
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });
  httpServer.on("upgrade", (request, socket, head) => {
    void (async () => {
      const url = new URL(request.url ?? "/", config.publicBaseUrl);
      const token = bearerToken(request.headers.authorization);
      if (url.pathname === "/v1/account-events") {
        const principal = await store.authenticate(token, config.publicBaseUrl, "account:access");
        const session = await requireAccountAuthenticationPersistence(store).getAccountSessionByCredential(principal.credentialId);
        webSockets.handleUpgrade(request, socket, head, (webSocket) => {
          const unregister = accountInvalidations.register(session.accountId, webSocket, session.userId);
          const heartbeat = setInterval(() => {
            if (webSocket.readyState === 1) webSocket.send('{"type":"account-events-heartbeat"}');
          }, 10_000);
          webSocket.on("close", () => { clearInterval(heartbeat); unregister(); });
        });
        return;
      }
      if (url.pathname === "/v1/account-runtimes/connect") {
        const principal = await store.authenticate(token, config.publicBaseUrl, "account:access");
        const runtimeId = requiredHeader(request.headers["x-agent-fabric-runtime-id"]);
        const runtime = await requireAccountRuntimeConnectionPersistence(store).assertAccountRuntimeConnectionForCredential(principal.credentialId, runtimeId);
        webSockets.handleUpgrade(request, socket, head, (webSocket) => {
          let observationQueue = Promise.resolve();
          const unregister = accountRuntimeTunnels.register(runtime.accountId, runtime.runtimeId, webSocket);
          webSocket.on("message", (data) => {
            try {
              const raw = data.toString();
              const envelope = accountRuntimeClientEnvelopeSchema.parse(JSON.parse(raw));
              accountRuntimeTunnels.handle(runtime.accountId, runtime.runtimeId, raw);
              if (envelope.type === "heartbeat") observationQueue = observationQueue.then(async () => {
                const observedRuntime = await observeLatestAccountRuntime(store, principal.credentialId, runtime.runtimeId, { health: envelope.health, capabilities: envelope.capabilities, runtimeSkills: envelope.runtimeSkills }, envelope.observedAt);
                publishAccountInvalidation({ type: "account-resource-invalidated", accountId: observedRuntime.accountId, resourceType: "runtime", resourceId: observedRuntime.runtimeId, aspects: ["runtime", "presence"], observedAt: envelope.observedAt });
              }).catch(() => undefined);
            }
            catch { webSocket.close(1008, "invalid-account-runtime-envelope"); }
          });
          webSocket.on("close", () => {
            if (!unregister()) return;
            observationQueue = observationQueue.then(async () => {
              if (accountRuntimeTunnels.isConnected(runtime.accountId, runtime.runtimeId)) return;
              const latest = await requireAccountRuntimeObservationPersistence(store).getAccountRuntimeForCredential(principal.credentialId, runtime.runtimeId);
              const observedRuntime = await observeLatestAccountRuntime(store, principal.credentialId, runtime.runtimeId, { health: "offline", capabilities: latest.capabilities });
              publishAccountInvalidation({ type: "account-resource-invalidated", accountId: observedRuntime.accountId, resourceType: "runtime", resourceId: observedRuntime.runtimeId, aspects: ["runtime", "presence"], observedAt: observedRuntime.lastCheckedAt ?? observedRuntime.updatedAt });
            }).catch(() => undefined);
          });
        });
        return;
      }
      throw new Error("upgrade-path-invalid");
    })().catch(() => socket.destroy());
  });

  return {
    config,
    store,
    accountRuntimeTunnels,
    accountInvalidations,
    address() {
      const address = httpServer.address();
      return address && typeof address !== "string" ? `http://${address.address === "::" ? "127.0.0.1" : address.address}:${address.port}` : undefined;
    },
    async start() {
      await store.migrate();
      await authentication?.initialize();
      await listen(httpServer, config.host, config.port);
      ready = true;
    },
    async stop() {
      ready = false;
      await closeServer(httpServer);
      webSockets.close();
      await authentication?.close();
      await store.close();
    },
  };
}

async function observeLatestAccountRuntime(
  store: PersistenceStore,
  credentialId: string,
  runtimeId: string,
  input: { readonly health: AgentRuntime["health"]; readonly capabilities: AgentRuntime["capabilities"]; readonly runtimeSkills?: readonly RuntimeSkillSummary[] },
  observedAt?: string,
): Promise<AgentRuntime> {
  const persistence = requireAccountRuntimeObservationPersistence(store);
  let latest = await persistence.getAccountRuntimeForCredential(credentialId, runtimeId);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await persistence.observeAccountRuntimeForCredential(credentialId, runtimeId, { ...input, expectedVersion: latest.version }, observedAt);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":")[0] : "";
      if (code !== "account-runtime-version-conflict" || attempt > 0) throw error;
      latest = await persistence.getAccountRuntimeForCredential(credentialId, runtimeId);
    }
  }
  throw new Error("account-runtime-observation-failed");
}

function requireAuthentication(authentication: AuthenticationBroker | undefined, capability?: "google" | "email"): AuthenticationBroker {
  if (!authentication || (capability === "google" && !authentication.googleEnabled) || (capability === "email" && !authentication.emailOtpAvailable())) throw new AuthenticationBrokerError(capability === "email" ? "email-otp-unavailable" : "authentication-unavailable");
  return authentication;
}

function validateLoopbackReturnUri(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port || parsed.pathname !== "/callback" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("loopback-return-uri-invalid");
}

function queryString(request: Request, name: string): string {
  const value = request.query[name];
  if (typeof value !== "string" || !value) throw new Error(`invalid-query:${name}`);
  return value;
}

function optionalQueryString(request: Request, name: string): string | undefined {
  const value = request.query[name];
  return typeof value === "string" && value ? value : undefined;
}

function requireAnyScope(store: PersistenceStore, config: ServerConfig, scopes: readonly CredentialScope[]) {
  return asyncRoute(async (request, response, next) => {
    const authenticated = await store.authenticate(bearerToken(request.header("authorization")), config.publicBaseUrl);
    if (!scopes.some((scope) => authenticated.scopes.includes(scope))) throw new Error("credential-scope-denied");
    setAuthenticatedPrincipal(request, response, authenticated);
    next();
  });
}

function setAuthenticatedPrincipal(request: Request, response: Response, authenticated: Awaited<ReturnType<PersistenceStore["authenticate"]>>): void {
  const principal: RequestPrincipal = {
    credentialId: authenticated.credentialId,
    principalId: authenticated.principalId,
    scopes: authenticated.scopes,
    ...(authenticated.ownerPrincipalId ? { ownerPrincipalId: authenticated.ownerPrincipalId } : {}),
    get isAuthenticated() { return true; },
    get userName() { return authenticated.principalId; },
  };
  principals.set(request, principal);
  response.locals.instanceId = authenticated.instanceId;
}

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => void handler(request, response, next).catch(next);
}

function requirePrincipal(request: Request): RequestPrincipal {
  const principal = principals.get(request);
  if (!principal) throw new Error("authentication-required");
  return principal;
}

function enforceSelfServiceIdentity(email: string, allowedDomains: readonly string[]): void {
  if (allowedDomains.length === 0) return;
  const domain = email.toLowerCase().split("@")[1];
  if (!domain || !allowedDomains.includes(domain)) throw new Error("self-service-identity-denied");
}

function enforceLocalRateLimit(attempts: Map<string, { count: number; resetAt: number }>, key: string, limit: number): void {
  const now = Date.now(); const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 }); return; }
  if (current.count >= limit) throw new Error("rate-limit-denied");
  current.count += 1;
}

function digestHex(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function digestBase64Url(value: string): string { return createHash("sha256").update(value).digest("base64url"); }

function bearerToken(value: string | undefined): string {
  if (!value?.startsWith("Bearer ")) throw new Error("credential-required");
  return value.slice(7);
}

function requiredHeader(value: string | string[] | undefined): string {
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved) throw new Error("header-required");
  return resolved;
}

function routeParameter(value: string | string[] | undefined): string {
  return requiredHeader(value);
}

function stringBody(body: unknown, field: string): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[field] : undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid-field:${field}`);
  return value;
}

function optionalStringBody(body: unknown, field: string): string | undefined {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[field] : undefined;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`invalid-field:${field}`);
  return value;
}

function boundedValue(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) throw new Error(`invalid-field:${field}`);
  return normalized;
}

function pkceValue(value: string, field: string): string {
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(value)) throw new Error(`invalid-field:${field}`);
  return value;
}

function requestIp(request: Request): string { return request.ip ?? request.socket.remoteAddress ?? "unknown"; }

function requestHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) for (const item of value) headers.append(name, item);
  }
  return headers;
}

function appendSetCookies(response: Response, headers: Headers): void {
  const compatible = headers as Headers & { getSetCookie?: () => string[] };
  const values = compatible.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  for (const value of values) response.append("set-cookie", value);
}

function emailBody(body: unknown, field: string): string {
  const value = stringBody(body, field).trim().toLowerCase();
  if (value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) throw new Error(`invalid-field:${field}`);
  return value;
}

function isoTimestampBody(body: unknown, field: string): string {
  const value = stringBody(body, field);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`invalid-field:${field}`);
  return new Date(value).toISOString();
}

function positiveIntegerBody(body: unknown, field: string): number {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[field] : undefined;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`invalid-field:${field}`);
  return Number(value);
}

function accountPageRequest(request: Request): { readonly limit: number; readonly after?: { readonly sortValue: string; readonly id: string } } {
  const limitValue = optionalQueryString(request, "limit");
  const limit = limitValue ? Number(limitValue) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("page-limit-invalid");
  const cursorValue = optionalQueryString(request, "cursor");
  if (!cursorValue) return { limit };
  try {
    const parsed = JSON.parse(Buffer.from(cursorValue, "base64url").toString("utf8")) as { sortValue?: unknown; id?: unknown };
    if (typeof parsed.sortValue !== "string" || !Number.isFinite(Date.parse(parsed.sortValue)) || typeof parsed.id !== "string" || !parsed.id) throw new Error("invalid");
    return { limit, after: { sortValue: new Date(parsed.sortValue).toISOString(), id: parsed.id } };
  } catch {
    throw new Error("page-cursor-invalid");
  }
}

function accountAgentScope(request: Request): AgentCatalogQuery["scope"] {
  const value = optionalQueryString(request, "scope") ?? "mine";
  if (value !== "mine" && value !== "friends" && value !== "archived") throw new Error("agent-scope-invalid");
  return value;
}

function agentIfMatchVersion(value: string): number {
  const match = /^"agent:([1-9][0-9]*)"$/u.exec(value);
  if (!match?.[1]) throw new Error("agent-etag-invalid");
  return Number(match[1]);
}

function accountAgentCatalogQuery(request: Request): AgentCatalogQuery {
  const limitValue = optionalQueryString(request, "limit");
  const cursorValue = optionalQueryString(request, "cursor");
  let after: { readonly sortValue: string; readonly id: string } | undefined;
  if (cursorValue) {
    try {
      const parsed = JSON.parse(Buffer.from(cursorValue, "base64url").toString("utf8")) as { sortValue?: unknown; id?: unknown };
      if (typeof parsed.sortValue !== "string" || typeof parsed.id !== "string" || !parsed.id) throw new Error("invalid");
      after = { sortValue: parsed.sortValue, id: parsed.id };
    } catch {
      throw new Error("page-cursor-invalid");
    }
  }
  return agentCatalogQuerySchema.parse({
    scope: accountAgentScope(request),
    ...(optionalQueryString(request, "q") ? { search: optionalQueryString(request, "q") } : {}),
    availability: queryStringList(request, "availability"),
    runtimeIds: queryStringList(request, "runtimeId"),
    ownerUserIds: queryStringList(request, "ownerUserId"),
    models: queryStringList(request, "model"),
    access: queryStringList(request, "access"),
    sort: optionalQueryString(request, "sort") ?? "last_active",
    limit: limitValue ? Number(limitValue) : 50,
    ...(after ? { after } : {}),
  });
}

function queryStringList(request: Request, name: string): string[] {
  const raw = request.query[name];
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return [...new Set(values.flatMap((value) => typeof value === "string" ? value.split(",") : []).map((value) => value.trim()).filter(Boolean))];
}

function accountPageResponse<T>(key: "friends" | "invitations" | "runtimes", page: { readonly items: readonly T[]; readonly nextCursor?: { readonly sortValue: string; readonly id: string } }): Record<string, unknown> {
  return {
    [key]: page.items,
    ...(page.nextCursor ? { nextCursor: Buffer.from(JSON.stringify(page.nextCursor), "utf8").toString("base64url") } : {}),
  };
}

function retiredAccountMembershipResponse(response: Response): void {
  response.status(410).json({ error: { code: "account-membership-model-retired" } });
}

function runtimeVisibilityBody(body: unknown): "private" {
  const value = stringBody(body, "visibility");
  if (value !== "private") throw new Error("invalid-field:visibility");
  return "private";
}

function runtimeHealthBody(body: unknown): "checking" | "ready" | "auth_required" | "unavailable" | "offline" {
  const value = stringBody(body, "health");
  if (!new Set(["checking", "ready", "auth_required", "unavailable", "offline"]).has(value)) throw new Error("invalid-field:health");
  return value as "checking" | "ready" | "auth_required" | "unavailable" | "offline";
}

function runtimeCapabilitiesBody(value: unknown): RuntimeCapabilities {
  const fields = ["supportsModelSelection", "supportsThinkingLevel", "supportsServiceTier", "supportsSkills", "supportsMcpConfiguration", "supportsEnvironment", "supportsCustomArguments", "supportsRuntimeConfiguration", "supportsCancellation", "maxConcurrentAgents", "modelCatalog", "integrationProviders"] as const;
  const body = exactObjectBody(value, fields);
  const booleans = fields.slice(0, 9);
  for (const field of booleans) if (typeof body[field] !== "boolean") throw new Error(`invalid-field:${field}`);
  const maxConcurrentAgents = positiveIntegerBody(body, "maxConcurrentAgents");
  if (maxConcurrentAgents > 1_000) throw new Error("invalid-field:maxConcurrentAgents");
  return runtimeCapabilitiesSchema.parse({ ...body, maxConcurrentAgents });
}

function runtimeSkillsBody(value: unknown): RuntimeSkillSummary[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("invalid-field:runtimeSkills");
  return value.map((skill) => runtimeSkillSummarySchema.parse(skill));
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object-required");
  return value as Record<string, unknown>;
}

function exactObjectBody(value: unknown, allowedFields: readonly string[]): Record<string, unknown> {
  const body = objectBody(value);
  const allowed = new Set(allowedFields);
  if (Object.keys(body).some((field) => !allowed.has(field))) throw new Error("unexpected-field");
  return body;
}

function listen(server: HttpServer, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(); });
  });
}

function closeServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
