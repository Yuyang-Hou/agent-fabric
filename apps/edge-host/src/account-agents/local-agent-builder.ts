import { randomUUID } from "node:crypto";

import { agentBuilderProposalSchema, type AgentBuilderProposal, type AgentConfiguration } from "@agent-fabric/account-agent-domain";
import type { RuntimeAdapter, RuntimeExecutionPolicy, RuntimeSession } from "@agent-fabric/runtime-contract";

const policy: RuntimeExecutionPolicy = {
  filesystem: "read-only",
  network: "deny",
  sideEffects: "deny",
  timeoutMs: 120_000,
  maxOutputCharacters: 32_000,
  maxOutputTokens: 8_000,
  maxConcurrency: 1,
  maxDelegationDepth: 0,
};

const instructions = [
  "You are the local AI Builder for Agent Fabric.",
  "Return only one JSON object with keys name, description, instructions and optional model, thinkingLevel, serviceTier.",
  "Do not include IDs, Runtime selection, access policy, secrets, Markdown fences, or prose outside the JSON object.",
].join(" ");

export interface LocalAgentBuilderTurnInput {
  readonly text: string;
  readonly configuration: AgentConfiguration;
}

export interface LocalAgentBuilderTurnResult {
  readonly proposal: AgentBuilderProposal;
  readonly assistantText: string;
}

/** Owns one ephemeral local Runtime session. No handle or conversation crosses into Cloud or Renderer. */
export class LocalAgentBuilder {
  #session: RuntimeSession | undefined;
  #controller: AbortController | undefined;

  constructor(readonly adapter: RuntimeAdapter, readonly workspaceRoot: string) {
    if (!workspaceRoot) throw new Error("runtime-workspace-root-required");
  }

  async turn(input: LocalAgentBuilderTurnInput): Promise<LocalAgentBuilderTurnResult> {
    const text = input.text.trim();
    if (!text) throw new Error("builder-text-required");
    const detection = await this.adapter.detect();
    if (detection.status !== "ready") throw new Error(detection.status === "authentication-required" ? "runtime-authentication-required" : "runtime-not-ready");
    const session = await this.#getSession();
    const controller = new AbortController();
    this.#controller = controller;
    const taskId = `builder-turn:${randomUUID()}`;
    let output = "";
    try {
      const prompt = [
        instructions,
        `Current configuration:\n${JSON.stringify({
          instructions: input.configuration.instructions,
          ...(input.configuration.model ? { model: input.configuration.model } : {}),
          ...(input.configuration.thinkingLevel ? { thinkingLevel: input.configuration.thinkingLevel } : {}),
          ...(input.configuration.serviceTier ? { serviceTier: input.configuration.serviceTier } : {}),
        })}`,
        `User request:\n${text}`,
      ].join("\n\n");
      for await (const event of this.adapter.execute({ sessionHandle: session.handle, taskId, prompt: [{ type: "text", text: prompt }], policy }, controller.signal)) {
        if (event.type === "output-delta") output += event.text;
        if (event.type === "completed") {
          output = (event.output || output).trim().slice(0, 20_000);
          const proposal = parseProposal(output);
          return { proposal, assistantText: summarizeProposal(proposal) };
        }
        if (event.type === "approval-required" || event.type === "forbidden-operation") throw new Error("builder-runtime-policy-required");
        if (event.type === "canceled") throw new Error("builder-runtime-canceled");
        if (["timed-out", "failed", "disconnected", "session-lost"].includes(event.type)) throw new Error("builder-runtime-failed");
      }
      throw new Error("builder-runtime-ended-without-result");
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  async close(): Promise<void> {
    this.#controller?.abort();
    this.#controller = undefined;
    const session = this.#session;
    this.#session = undefined;
    if (session) await this.adapter.close(session.handle).catch(() => undefined);
  }

  async #getSession(): Promise<RuntimeSession> {
    this.#session ??= await this.adapter.createSession({ agentId: `local-builder:${randomUUID()}`, workspaceRoot: this.workspaceRoot });
    return this.#session;
  }
}

function parseProposal(output: string): AgentBuilderProposal {
  try { return agentBuilderProposalSchema.parse(JSON.parse(output)); }
  catch { throw new Error("builder-output-malformed"); }
}

function summarizeProposal(proposal: AgentBuilderProposal): string {
  const name = proposal.name.trim() || "未命名智能体";
  return `已更新“${name}”的配置预览。你可以继续补充要求，或确认后创建智能体。`;
}
