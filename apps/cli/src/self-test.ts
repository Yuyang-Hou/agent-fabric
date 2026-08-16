import type { AccessibleAccountAgent, AccountSelfTestSession } from "@agent-fabric/client";

export interface SelfTestTarget {
  readonly agentId: string;
}

export interface SelfTestManagementClient {
  listInvokableAgents(query?: string): Promise<readonly AccessibleAccountAgent[]>;
  createAccountSelfTest(agentId: string, expiresAt: string): Promise<AccountSelfTestSession>;
  revokeAccountSelfTest(selfTestId: string): Promise<unknown>;
}

export interface SelfTestMcpClient {
  callTool(name: "list_agents" | "ask_agent" | "get_task", argumentsValue: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface SelfTestStage {
  readonly name: "preflight" | "credential" | "mcp-discovery" | "a2a-ask" | "mcp-task-read" | "revocation" | "revocation-enforced";
  readonly status: "passed";
  readonly durationMs: number;
  readonly answerCharacters?: number;
}

export type SelfTestFailureClass = "preflight" | "authority" | "discovery" | "invocation" | "revocation" | "cleanup" | "unknown";

export interface SelfTestReport {
  readonly status: "passed";
  readonly accountId: string;
  readonly agentId: string;
  readonly stages: readonly SelfTestStage[];
  readonly cleanup: { readonly selfTest: "revoked" };
}

export class SelfTestError extends Error {
  constructor(
    readonly code: string,
    readonly remediation: Readonly<Record<string, string>> = {},
    override readonly cause?: unknown,
  ) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "SelfTestError";
  }
}

export async function runIsolatedSelfTest(input: {
  readonly management: SelfTestManagementClient;
  readonly target: SelfTestTarget;
  readonly connect: (session: AccountSelfTestSession) => Promise<SelfTestMcpClient>;
  readonly prompt?: string;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly cleanupDelay?: (milliseconds: number) => Promise<void>;
}): Promise<SelfTestReport> {
  const stages: SelfTestStage[] = [];
  const now = input.now ?? (() => new Date());
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const cleanupDelay = input.cleanupDelay ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let selfTest: AccountSelfTestSession | undefined;
  let selfTestRevoked = false;
  let primaryError: unknown;
  let report: SelfTestReport | undefined;
  let cleanupFailed = false;
  let activeStage: SelfTestStage["name"] = "preflight";
  let stageStartedAt = monotonicNow();
  let primaryFailure: { readonly stage: SelfTestStage["name"]; readonly durationMs: string; readonly failureClass: SelfTestFailureClass } | undefined;

  const selectStage = (stage: SelfTestStage["name"]): void => { activeStage = stage; };
  const completeStage = (extra: { readonly answerCharacters?: number } = {}): void => {
    const endedAt = monotonicNow();
    stages.push({ name: activeStage, status: "passed", durationMs: elapsedMilliseconds(stageStartedAt, endedAt), ...extra });
    stageStartedAt = endedAt;
  };

  try {
    const visible = await input.management.listInvokableAgents(input.target.agentId);
    const target = visible.find((agent) => agent.agentId === input.target.agentId);
    if (!target || target.availability !== "online") throw new SelfTestError("self-test-agent-unavailable");
    completeStage();

    selectStage("credential");
    const activeSelfTest = await input.management.createAccountSelfTest(input.target.agentId, new Date(now().getTime() + 10 * 60_000).toISOString());
    selfTest = activeSelfTest;
    if (activeSelfTest.agentId !== input.target.agentId) throw new SelfTestError("self-test-target-mismatch", { selfTestId: activeSelfTest.selfTestId });
    const mcp = await input.connect(activeSelfTest);
    completeStage();

    selectStage("mcp-discovery");
    const discovery = toolResult(await mcp.callTool("list_agents", {}));
    const agents = arrayField(discovery, "agents");
    if (agents.length !== 1 || objectString(agents[0], "agentId") !== input.target.agentId || objectString(agents[0], "availability") !== "online") {
      throw new SelfTestError("self-test-discovery-failed", { selfTestId: activeSelfTest.selfTestId });
    }
    completeStage();

    selectStage("a2a-ask");
    const asked = toolResult(await mcp.callTool("ask_agent", {
      agent_id: input.target.agentId,
      question: input.prompt ?? "请简短回复一句话，确认你已在线。",
      wait_ms: 30_000,
      idempotency_key: `self-test:${activeSelfTest.selfTestId.split(":").at(-1) ?? "request"}`,
    }));
    const task = objectField(asked, "task");
    const taskId = objectString(task, "taskId");
    const answer = objectString(task, "text");
    if (objectString(task, "state") !== "completed" || !taskId || !answer) throw new SelfTestError("self-test-answer-invalid", { selfTestId: activeSelfTest.selfTestId });
    completeStage({ answerCharacters: [...answer].length });

    selectStage("mcp-task-read");
    const read = objectField(toolResult(await mcp.callTool("get_task", { task_id: taskId })), "task");
    if (objectString(read, "taskId") !== taskId || objectString(read, "state") !== "completed") throw new SelfTestError("self-test-task-read-invalid", { selfTestId: activeSelfTest.selfTestId });
    completeStage();

    selectStage("revocation");
    await input.management.revokeAccountSelfTest(activeSelfTest.selfTestId);
    selfTestRevoked = true;
    completeStage();

    selectStage("revocation-enforced");
    const discoveryRejected = await isRejectedToolCall(() => mcp.callTool("list_agents", {}), (value) => {
      const result = optionalToolResult(value);
      return !result || arrayField(result, "agents").every((agent) => objectString(agent, "agentId") !== input.target.agentId);
    });
    const invocationRejected = await isRejectedToolCall(() => mcp.callTool("ask_agent", {
      agent_id: input.target.agentId,
      question: input.prompt ?? "请简短回复一句话，确认你已在线。",
      wait_ms: 1,
      idempotency_key: `self-test-revoked:${activeSelfTest.selfTestId.split(":").at(-1) ?? "request"}`,
    }));
    if (!discoveryRejected || !invocationRejected) throw new SelfTestError("self-test-revocation-not-enforced", { selfTestId: activeSelfTest.selfTestId });
    completeStage();

    report = {
      status: "passed",
      accountId: activeSelfTest.accountId,
      agentId: input.target.agentId,
      stages,
      cleanup: { selfTest: "revoked" },
    };
  } catch (error) {
    primaryError = error;
    primaryFailure = {
      stage: activeStage,
      durationMs: String(elapsedMilliseconds(stageStartedAt, monotonicNow())),
      failureClass: selfTestFailureClass(activeStage),
    };
  } finally {
    if (selfTest && !selfTestRevoked) {
      try { await cleanupWithRetries(() => input.management.revokeAccountSelfTest(selfTest?.selfTestId as string), cleanupDelay); selfTestRevoked = true; }
      catch { cleanupFailed = true; }
    }
  }

  const remediation = {
    ...(selfTest ? { selfTestId: selfTest.selfTestId } : {}),
    ...(primaryError ? { primaryCode: primaryError instanceof SelfTestError ? primaryError.code : "self-test-failed" } : {}),
  };
  if (cleanupFailed) throw new SelfTestError("self-test-cleanup-failed", { ...remediation, stage: "cleanup", durationMs: "0", failureClass: "cleanup" }, primaryError);
  if (primaryError instanceof SelfTestError) throw new SelfTestError(primaryError.code, { ...primaryError.remediation, ...primaryFailure }, primaryError);
  if (primaryError) throw new SelfTestError("self-test-failed", { ...remediation, ...primaryFailure }, primaryError);
  if (!report) throw new SelfTestError("self-test-failed", remediation);
  return report;
}

function elapsedMilliseconds(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function selfTestFailureClass(stage: SelfTestStage["name"]): SelfTestFailureClass {
  if (stage === "preflight") return "preflight";
  if (stage === "credential") return "authority";
  if (stage === "mcp-discovery") return "discovery";
  if (stage === "a2a-ask" || stage === "mcp-task-read") return "invocation";
  if (stage === "revocation" || stage === "revocation-enforced") return "revocation";
  return "unknown";
}

async function cleanupWithRetries(action: () => Promise<unknown>, delay: (milliseconds: number) => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { await action(); return; }
    catch (error) { lastError = error; if (attempt < 2) await delay(250 * (attempt + 1)); }
  }
  throw lastError;
}

function toolResult(value: unknown): Record<string, unknown> {
  const result = optionalToolResult(value);
  if (!result) throw new SelfTestError("self-test-mcp-call-failed");
  return result;
}

function optionalToolResult(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const response = value as Record<string, unknown>;
  if (!response.result || typeof response.result !== "object" || Array.isArray(response.result)) return undefined;
  const result = response.result as Record<string, unknown>;
  if (result.isError === true || !result.structuredContent || typeof result.structuredContent !== "object" || Array.isArray(result.structuredContent)) return undefined;
  return result.structuredContent as Record<string, unknown>;
}

function arrayField(value: Record<string, unknown>, field: string): unknown[] {
  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : [];
}

function objectField(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const candidate = value[field];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
}

function objectString(value: unknown, field: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : "";
}

async function isRejectedToolCall(action: () => Promise<unknown>, accepted?: (value: unknown) => boolean): Promise<boolean> {
  try { const value = await action(); return accepted ? accepted(value) : optionalToolResult(value) === undefined; }
  catch { return true; }
}
