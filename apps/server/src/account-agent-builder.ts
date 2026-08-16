import { agentBuilderProposalSchema, type AgentDraft } from "@agent-fabric/account-agent-domain";
import { Message, Role, TaskState } from "@a2a-js/sdk";

import type { AccountAgentExecutionPort } from "./account-agent-a2a.js";
import type { AccountAgentCreationPersistencePort } from "./persistence-store.js";

const builderInstructions = "Return only one JSON object with keys name, description, instructions and optional model, thinkingLevel, serviceTier. Do not include IDs, Runtime selection, access policy, secrets, Markdown fences, or prose.";

export async function runAccountAgentBuilderTurn(input: {
  readonly persistence: AccountAgentCreationPersistencePort;
  readonly execution: AccountAgentExecutionPort;
  readonly credentialId: string;
  readonly draftId: string;
  readonly text: string;
  readonly expectedVersion: number;
}): Promise<AgentDraft> {
  const started = await input.persistence.startAccountAgentBuilderTurnForCredential(input.credentialId, input.draftId, { text: input.text, expectedVersion: input.expectedVersion });
  let task: Awaited<ReturnType<AccountAgentExecutionPort["execute"]>>;
  try {
    task = await input.execution.execute({
      accountId: started.accountId, agentId: `builder:${started.draft.draftId}`, runtimeId: started.runtimeId, requesterUserId: started.userId,
      instructions: builderInstructions,
      ...(started.draft.configuration.model ? { model: started.draft.configuration.model } : {}),
      ...(started.draft.configuration.thinkingLevel ? { thinkingLevel: started.draft.configuration.thinkingLevel } : {}),
      ...(started.draft.configuration.serviceTier ? { serviceTier: started.draft.configuration.serviceTier } : {}),
      taskId: started.turnId, contextId: `builder-context:${started.draft.draftId}`,
      message: Message.fromJSON({ messageId: `builder-request:${started.turnId}`, role: Role.ROLE_USER, parts: [{ text: input.text, mediaType: "text/plain" }] }),
    });
  } catch {
    return input.persistence.completeAccountAgentBuilderTurnForCredential(input.credentialId, input.draftId, { turnId: started.turnId, errorCode: "builder-runtime-unavailable" });
  }
  const assistantText = task.artifacts.flatMap((artifact) => artifact.parts.flatMap((part) => part.mediaType === "text/plain" && part.content?.$case === "text" ? [part.content.value] : [])).join("\n").trim().slice(0, 20_000);
  if (task.status?.state !== TaskState.TASK_STATE_COMPLETED) {
    return input.persistence.completeAccountAgentBuilderTurnForCredential(input.credentialId, input.draftId, { turnId: started.turnId, ...(assistantText ? { assistantText } : {}), errorCode: "builder-runtime-failed" });
  }
  let proposal;
  try { proposal = agentBuilderProposalSchema.parse(JSON.parse(assistantText)); }
  catch {
    return input.persistence.completeAccountAgentBuilderTurnForCredential(input.credentialId, input.draftId, { turnId: started.turnId, ...(assistantText ? { assistantText } : {}), errorCode: "builder-output-malformed" });
  }
  return input.persistence.completeAccountAgentBuilderTurnForCredential(input.credentialId, input.draftId, { turnId: started.turnId, assistantText, proposal });
}
