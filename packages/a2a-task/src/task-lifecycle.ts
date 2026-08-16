import { Artifact, Role, TaskState } from "@a2a-js/sdk";
import type {
  CanonicalArtifact,
  CanonicalMessage,
  CanonicalTask,
} from "./index.js";

export function createSubmittedTask(input: {
  readonly taskId: string;
  readonly contextId: string;
  readonly request: CanonicalMessage;
  readonly at: string;
}): CanonicalTask {
  assertIdentifier(input.taskId);
  assertIdentifier(input.contextId);
  assertTimestamp(input.at);
  if (input.request.role !== Role.ROLE_USER) throw new TaskLifecycleError("invalid-request-role");
  return Object.freeze({
    id: input.taskId,
    contextId: input.contextId,
    status: Object.freeze({
      state: TaskState.TASK_STATE_SUBMITTED,
      message: undefined,
      timestamp: input.at,
    }),
    artifacts: [],
    history: [input.request],
    metadata: undefined,
  });
}

export function markTaskWorking(task: CanonicalTask, at: string): CanonicalTask {
  assertMutable(task);
  assertTimestamp(at);
  return withState(task, TaskState.TASK_STATE_WORKING, at);
}

export function completeTaskWithText(
  task: CanonicalTask,
  input: { readonly artifactId: string; readonly text: string; readonly at: string },
): CanonicalTask {
  assertMutable(task);
  assertIdentifier(input.artifactId);
  assertTimestamp(input.at);
  const artifact = Artifact.fromJSON({
    artifactId: input.artifactId,
    name: "Agent result",
    description: "",
    parts: [{ text: input.text, mediaType: "text/plain" }],
  }) as CanonicalArtifact;
  return Object.freeze({
    ...withState(task, TaskState.TASK_STATE_COMPLETED, input.at),
    artifacts: [artifact],
  });
}

export function failTask(task: CanonicalTask, at: string): CanonicalTask {
  assertMutable(task);
  assertTimestamp(at);
  return withState(task, TaskState.TASK_STATE_FAILED, at);
}

export function rejectTask(task: CanonicalTask, at: string): CanonicalTask {
  assertMutable(task);
  assertTimestamp(at);
  return withState(task, TaskState.TASK_STATE_REJECTED, at);
}

export function cancelTask(task: CanonicalTask, at: string): CanonicalTask {
  assertMutable(task);
  assertTimestamp(at);
  return withState(task, TaskState.TASK_STATE_CANCELED, at);
}

export function isTerminalTask(task: CanonicalTask): boolean {
  return [
    TaskState.TASK_STATE_COMPLETED,
    TaskState.TASK_STATE_FAILED,
    TaskState.TASK_STATE_CANCELED,
    TaskState.TASK_STATE_REJECTED,
  ].includes(task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED);
}

export class TaskLifecycleError extends Error {
  constructor(readonly code: "terminal-task-immutable" | "invalid-request-role") {
    super(code);
    this.name = "TaskLifecycleError";
  }
}

function withState(task: CanonicalTask, state: TaskState, at: string): CanonicalTask {
  return Object.freeze({
    ...task,
    status: Object.freeze({ state, message: undefined, timestamp: at }),
  });
}

function assertMutable(task: CanonicalTask): void {
  if (isTerminalTask(task)) throw new TaskLifecycleError("terminal-task-immutable");
}

function assertIdentifier(value: string): void {
  if (!value.trim()) throw new Error("identifier-required");
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error("timestamp-required");
}
