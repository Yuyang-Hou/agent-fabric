import { describe, expect, it } from "vitest";

import {
  A2A_PROTOCOL_VERSION,
  A2A_SPEC_RELEASE,
  Artifact,
  Message,
  NonCanonicalA2APayloadError,
  Role,
  Task,
  TaskState,
  assertNoAgentFabricPrivateFields,
  decodeCanonicalMessage,
  type CanonicalMessage,
  type CanonicalTask,
} from "./index.js";

const textPart = {
  content: { $case: "text", value: "hello" },
  metadata: undefined,
  filename: "",
  mediaType: "text/plain",
} as const;

const message = {
  messageId: "message-000001",
  contextId: "context-000001",
  taskId: "",
  role: Role.ROLE_USER,
  parts: [textPart],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
} satisfies CanonicalMessage;

const task = {
  id: "task-000001",
  contextId: "context-000001",
  status: {
    state: TaskState.TASK_STATE_COMPLETED,
    message: undefined,
    timestamp: "2026-08-10T00:00:00.000Z",
  },
  artifacts: [
    {
      artifactId: "artifact-000001",
      name: "answer",
      description: "",
      parts: [textPart],
      metadata: undefined,
      extensions: [],
    },
  ],
  history: [message],
  metadata: undefined,
} satisfies CanonicalTask;

describe("official A2A v1.0.1 conformance boundary", () => {
  it("pins the official SDK release and wire protocol version", () => {
    expect(A2A_SPEC_RELEASE).toBe("v1.0.1");
    expect(A2A_PROTOCOL_VERSION).toBe("1.0");
  });

  it("round-trips canonical Message and Task fixtures through official codecs", () => {
    const messageJson = Message.toJSON(message);
    const taskJson = Task.toJSON(task);

    expect(decodeCanonicalMessage(messageJson)).toEqual(message);
    expect(Task.fromJSON(taskJson)).toEqual(task);
    expect(Artifact.toJSON(task.artifacts[0]!)).toMatchObject({
      artifactId: "artifact-000001",
      parts: [{ text: "hello", mediaType: "text/plain" }],
    });
  });

  it("rejects Agent Fabric private fields at any payload depth", () => {
    const canonicalJson = Message.toJSON(message) as Record<string, unknown>;
    const invalidPayload = {
      ...canonicalJson,
      metadata: {
        agentFabric: {
          roomId: "private-room",
          runtimeSessionId: "private-runtime-session",
        },
      },
    };

    expect(() => assertNoAgentFabricPrivateFields(invalidPayload)).toThrowError(
      NonCanonicalA2APayloadError,
    );
    expect(() => assertNoAgentFabricPrivateFields(invalidPayload)).toThrow(
      "$.metadata.agentFabric",
    );
  });
});
