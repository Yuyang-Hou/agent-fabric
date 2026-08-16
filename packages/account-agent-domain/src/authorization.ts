import type { Agent, AgentRuntime } from "./index.js";

export type EffectiveAgentAccessScope = "owner" | "friend" | "none";

export interface AgentAccessPrincipal {
  readonly accountId: string;
  readonly userId: string;
  readonly active: boolean;
  readonly activeFriendUserIds?: readonly string[];
  readonly boundedAgentIds?: readonly string[];
}

export type AgentAuthorizationDecision =
  | { readonly allowed: true; readonly scope: Exclude<EffectiveAgentAccessScope, "none"> }
  | { readonly allowed: false; readonly scope: "none"; readonly code: "principal-access-denied" | "agent-archived" | "agent-access-denied" };

export type RuntimeBindingDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: "runtime-owner-denied" | "runtime-not-ready" | "runtime-capacity-reached" };

export function canManageAgent(principal: AgentAccessPrincipal, agent: Agent): boolean {
  return principal.active && principal.accountId === agent.accountId && principal.userId === agent.ownerUserId;
}

export function effectiveAccessScope(principal: AgentAccessPrincipal, agent: Agent): EffectiveAgentAccessScope {
  if (!principal.active || agent.archivedAt) return "none";
  if (principal.boundedAgentIds && !principal.boundedAgentIds.includes(agent.agentId)) return "none";
  if (principal.boundedAgentIds?.includes(agent.agentId) && principal.userId === agent.ownerUserId && principal.accountId === agent.accountId) return "owner";
  if (principal.userId === agent.ownerUserId && principal.accountId === agent.accountId) return "owner";
  if (agent.permissionMode === "friends" && principal.activeFriendUserIds?.includes(agent.ownerUserId)) return "friend";
  return "none";
}

export function canInvokeAgent(principal: AgentAccessPrincipal, agent: Agent): AgentAuthorizationDecision {
  if (!principal.active) return { allowed: false, scope: "none", code: "principal-access-denied" };
  if (agent.archivedAt) return { allowed: false, scope: "none", code: "agent-archived" };
  const scope = effectiveAccessScope(principal, agent);
  return scope === "none" ? { allowed: false, scope, code: "agent-access-denied" } : { allowed: true, scope };
}

export function canBindRuntime(principal: AgentAccessPrincipal, runtime: AgentRuntime, currentBoundAgentCount: number): RuntimeBindingDecision {
  if (!principal.active || principal.accountId !== runtime.accountId || principal.userId !== runtime.ownerUserId) return { allowed: false, code: "runtime-owner-denied" };
  if (runtime.health !== "ready") return { allowed: false, code: "runtime-not-ready" };
  if (!Number.isInteger(currentBoundAgentCount) || currentBoundAgentCount < 0 || currentBoundAgentCount >= runtime.capabilities.maxConcurrentAgents) return { allowed: false, code: "runtime-capacity-reached" };
  return { allowed: true };
}
