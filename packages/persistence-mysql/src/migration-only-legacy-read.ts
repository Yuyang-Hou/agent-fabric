import { agentSchema, type Agent } from "@agent-fabric/account-agent-domain";

export type LegacyPersonalAgentReadCompatibility =
  | { readonly kind: "none" }
  | { readonly kind: "single"; readonly agent: Agent }
  | { readonly kind: "multiple-agents-unsupported"; readonly agentIds: readonly string[] };

/**
 * Migration-only guard for legacy readers. It never selects one arbitrary Agent
 * when an owner now has several, because doing so would silently recreate the
 * removed Human-to-Agent uniqueness assumption.
 */
export function planLegacyPersonalAgentRead(values: readonly unknown[]): LegacyPersonalAgentReadCompatibility {
  const agents = values.map((value) => agentSchema.parse(value));
  if (agents.length === 0) return Object.freeze({ kind: "none" });
  if (agents.length === 1) return Object.freeze({ kind: "single", agent: agents[0]! });
  return Object.freeze({ kind: "multiple-agents-unsupported", agentIds: Object.freeze(agents.map((agent) => agent.agentId).sort()) });
}
