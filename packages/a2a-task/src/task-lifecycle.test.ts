import { Message, Role, TaskState, type CanonicalMessage } from "./index.js";
import {
  cancelTask,
  completeTaskWithText,
  createSubmittedTask,
  markTaskWorking,
} from "./task-lifecycle.js";
import { describe, expect, it } from "vitest";

const request = Message.fromJSON({
  messageId: "message-1",
  contextId: "context-1",
  role: "ROLE_USER",
  parts: [{ text: "@agent:alice analyze", mediaType: "text/plain" }],
}) as CanonicalMessage;

describe("canonical A2A Task lifecycle", () => {
  it("creates submitted work, becomes working, and completes with an Artifact Part", () => {
    const submitted = createSubmittedTask({
      taskId: "task-1",
      contextId: "context-1",
      request: { ...request, role: Role.ROLE_USER },
      at: "2026-08-10T00:00:00.000Z",
    });
    const working = markTaskWorking(submitted, "2026-08-10T00:00:01.000Z");
    const completed = completeTaskWithText(working, {
      artifactId: "artifact-1",
      text: "result",
      at: "2026-08-10T00:00:02.000Z",
    });

    expect(submitted.status?.state).toBe(TaskState.TASK_STATE_SUBMITTED);
    expect(working.status?.state).toBe(TaskState.TASK_STATE_WORKING);
    expect(completed.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(completed.artifacts[0]?.parts[0]?.content).toEqual({ $case: "text", value: "result" });
  });

  it("keeps terminal Tasks immutable", () => {
    const submitted = createSubmittedTask({
      taskId: "task-1",
      contextId: "context-1",
      request,
      at: "2026-08-10T00:00:00.000Z",
    });
    const canceled = cancelTask(submitted, "2026-08-10T00:00:01.000Z");

    expect(() => markTaskWorking(canceled, "2026-08-10T00:00:02.000Z")).toThrow(
      "terminal-task-immutable",
    );
  });
});
