import {
  A2A_PROTOCOL_VERSION,
  AgentCard,
  Artifact,
  Message,
  Role,
  Task,
  TaskState,
  canonicalizeAgentCard,
  generateAgentCardSignature,
  verifyAgentCardSignature,
} from "@a2a-js/sdk";

export {
  A2A_PROTOCOL_VERSION,
  AgentCard,
  Artifact,
  Message,
  Role,
  Task,
  TaskState,
  canonicalizeAgentCard,
  generateAgentCardSignature,
  verifyAgentCardSignature,
};
export type {
  Part,
  SendMessageRequest,
  SendMessageResponse,
  TaskArtifactUpdateEvent,
  TaskStatus,
  TaskStatusUpdateEvent,
} from "@a2a-js/sdk";

export const A2A_SPEC_RELEASE = "v1.0.1" as const;
export * from "./task-lifecycle.js";

const agentFabricPrivateFields = [
  "_agentFabric",
  "agentActorId",
  "agentFabric",
  "agentRevision",
  "answer",
  "cwd",
  "evidence",
  "idempotencyKey",
  "ownerHumanId",
  "roomId",
  "runtimeSessionId",
  "traceId",
] as const;

export type AgentFabricPrivateField = (typeof agentFabricPrivateFields)[number];

type NoAgentFabricPrivateFields = {
  [Field in AgentFabricPrivateField]?: never;
};

export type CanonicalMessage = Message & NoAgentFabricPrivateFields;
export type CanonicalTask = Task & NoAgentFabricPrivateFields;
export type CanonicalArtifact = Artifact & NoAgentFabricPrivateFields;

const privateFieldSet = new Set<string>(agentFabricPrivateFields);

export class NonCanonicalA2APayloadError extends Error {
  readonly field: AgentFabricPrivateField;
  readonly path: string;

  constructor(field: AgentFabricPrivateField, path: string) {
    super(`Agent Fabric private field ${field} is not allowed inside canonical A2A payload at ${path}`);
    this.name = "NonCanonicalA2APayloadError";
    this.field = field;
    this.path = path;
  }
}

export function assertNoAgentFabricPrivateFields(value: unknown): void {
  inspectValue(value, "$", new WeakSet<object>());
}

function inspectValue(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`, seen));
    return;
  }

  for (const [field, nestedValue] of Object.entries(value)) {
    if (privateFieldSet.has(field)) {
      throw new NonCanonicalA2APayloadError(field as AgentFabricPrivateField, `${path}.${field}`);
    }
    inspectValue(nestedValue, `${path}.${field}`, seen);
  }
}

export function decodeCanonicalMessage(value: unknown): CanonicalMessage {
  assertNoAgentFabricPrivateFields(value);
  return Message.fromJSON(value) as CanonicalMessage;
}

export function decodeCanonicalTask(value: unknown): CanonicalTask {
  assertNoAgentFabricPrivateFields(value);
  return Task.fromJSON(value) as CanonicalTask;
}

export function decodeCanonicalArtifact(value: unknown): CanonicalArtifact {
  assertNoAgentFabricPrivateFields(value);
  return Artifact.fromJSON(value) as CanonicalArtifact;
}
