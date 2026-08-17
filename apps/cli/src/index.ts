import { AgentFabricClient, FabricClientError } from "@agent-fabric/client";
import { AgentFabricMcpServer, type AccountAgentMcpPort } from "@agent-fabric/mcp-server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, open, readFile, rename } from "node:fs/promises";
import { createServer, type Server as HttpServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { runIsolatedSelfTest, SelfTestError, type SelfTestReport } from "./self-test.js";

export const cliBoundary = "cli" as const;
export const CLI_OUTPUT_VERSION = "1" as const;

export interface CliConfig {
  readonly version: "1";
  readonly server: string;
  readonly token?: string;
  readonly ownerPrincipalId?: string;
}

export interface CliIo {
  readonly stdout: { write(value: string): unknown };
  readonly stderr: { write(value: string): unknown };
  readonly readStdin: () => Promise<string>;
}

export interface CliPaths { readonly configFile: string }

export interface CliRuntime {
  readonly openBrowser?: (url: string) => Promise<void>;
  readonly authenticateLogin?: (client: AgentFabricClient, args: readonly string[]) => Promise<{ readonly token: string; readonly humanPrincipalId: string }>;
  readonly runSelfTest?: typeof runIsolatedSelfTest;
}

export function defaultCliPaths(): CliPaths {
  return { configFile: join(process.env.AGENT_FABRIC_HOME ?? join(homedir(), ".agent-fabric"), "config.json") };
}

export async function runCli(argv: readonly string[], io: CliIo = processIo(), paths = defaultCliPaths(), runtime: CliRuntime = {}): Promise<number> {
  const json = argv.includes("--json");
  try {
    const args = argv.filter((value) => value !== "--json");
    const [group, command] = args;
    if (!group || group === "help" || group === "--help") {
      output(io, json, { commands: ["setup", "login", "logout", "doctor", "agents list", "ask", "task get", "self-test"] }, helpText());
      return 0;
    }
    if (group === "setup") {
      const server = requiredFlag(args, "--server");
      const current = await readConfig(paths.configFile).catch(() => undefined);
      const probe = new AgentFabricClient({ baseUrl: server, token: current?.token ?? "setup-probe" });
      const version = await probe.version();
      await writeConfigAtomic(paths.configFile, { ...(current ?? {}), version: "1", server });
      output(io, json, { status: "configured", server, serverVersion: version.version }, `已连接 ${server}。下一步：agent-fabric login\n`);
      return 0;
    }
    if (group === "login") {
      const current = await requireConfig(paths.configFile, false);
      if (args.includes("--token-stdin")) {
        const token = (await io.readStdin()).trim();
        if (!token) throw new CliError("token-required", 2);
        const client = new AgentFabricClient({ baseUrl: current.server, token });
        await client.getAccountSession();
        await writeConfigAtomic(paths.configFile, { ...current, token });
        output(io, json, { status: "authenticated", server: current.server }, "登录成功，凭据已保存到本机受限配置。\n");
        return 0;
      }
      const loginClient = new AgentFabricClient({ baseUrl: current.server });
      const loggedIn = await (runtime.authenticateLogin ? runtime.authenticateLogin(loginClient, args) : browserAuthentication({ client: loginClient, args, runtime }));
      await writeConfigAtomic(paths.configFile, { ...current, token: loggedIn.token, ownerPrincipalId: loggedIn.humanPrincipalId });
      output(io, json, { status: "authenticated", server: current.server, principalId: loggedIn.humanPrincipalId }, "Google 登录成功，现在可以查看并调用当前账号可访问的 Agents。\n");
      return 0;
    }
    if (group === "logout") {
      const current = await requireConfig(paths.configFile, false);
      if (current.token) await new AgentFabricClient({ baseUrl: current.server, token: current.token }).logout().catch(() => undefined);
      await writeConfigAtomic(paths.configFile, { version: "1", server: current.server });
      output(io, json, { status: "logged-out" }, "本机凭据已删除。\n");
      return 0;
    }
    if (group === "doctor") {
      const current = await requireConfig(paths.configFile, true);
      const client = clientFor(current);
      const [version, session] = await Promise.all([client.version(), client.getAccountSession()]);
      output(io, json, { status: "ready", server: current.server, serverVersion: version.version, authenticated: true, accountId: session.accountId, userId: session.userId }, `Agent Fabric Account 已就绪：${current.server}\n`);
      return 0;
    }
    if (group === "agents" && command === "list") {
      const agents = await clientFor(await requireConfig(paths.configFile, true)).listInvokableAgents(optionalFlag(args, "--query"));
      output(io, json, { agents }, agents.length ? `${agents.map((agent) => `${agent.name}  ${agent.availability}  ${agent.agentId}`).join("\n")}\n` : "没有可调用的 Agent。\n");
      return 0;
    }
    if (group === "ask") {
      const idempotencyKey = optionalFlag(args, "--idempotency-key");
      const result = await clientFor(await requireConfig(paths.configFile, true)).askAccountAgent({
        text: requiredFlag(args, "--text"), agentId: requiredFlag(args, "--agent"), waitMs: numberFlag(args, "--wait-ms", 30_000),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
      output(io, json, { task: result }, `${result.text ?? `${result.state}: ${result.taskId}`}\n`);
      return 0;
    }
    if (group === "task" && command === "get") {
      const result = await clientFor(await requireConfig(paths.configFile, true)).getAccountAgentTask(requiredFlag(args, "--id"));
      output(io, json, { task: result }, `${result.text ?? `${result.state}: ${result.taskId}`}\n`);
      return 0;
    }
    if (group === "self-test") {
      if (!args.includes("--confirm")) throw new CliError("human-confirmation-required", 2);
      const current = await requireConfig(paths.configFile, true);
      const agentId = requiredFlag(args, "--agent");
      const report = await (runtime.runSelfTest ?? runIsolatedSelfTest)({
        management: clientFor(current), target: { agentId },
        connect: async (session) => selfTestMcpClient(new AgentFabricClient({ baseUrl: current.server, token: session.requester.token })),
      });
      output(io, json, report, selfTestHumanOutput(report));
      return 0;
    }
    throw new CliError("command-unknown", 2);
  } catch (error) {
    const normalized = normalizeCliError(error);
    outputError(io, json, normalized);
    return normalized.exitCode;
  }
}

export async function readConfig(file: string): Promise<CliConfig> {
  const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<CliConfig>;
  if (parsed.version !== "1" || typeof parsed.server !== "string") throw new CliError("config-invalid", 3);
  return { version: "1", server: parsed.server, ...(typeof parsed.token === "string" ? { token: parsed.token } : {}), ...(typeof parsed.ownerPrincipalId === "string" ? { ownerPrincipalId: parsed.ownerPrincipalId } : {}) };
}

export async function writeConfigAtomic(file: string, value: CliConfig): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export class CliError extends Error {
  constructor(readonly code: string, readonly exitCode: number, override readonly cause?: unknown, readonly details?: Readonly<Record<string, string>>) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "CliError";
  }
}

async function requireConfig(file: string, token: boolean): Promise<CliConfig> {
  const config = await readConfig(file).catch((error) => { throw new CliError("setup-required", 3, error); });
  if (token && !config.token) throw new CliError("login-required", 4);
  return config;
}

function clientFor(config: CliConfig): AgentFabricClient {
  if (!config.token) throw new CliError("login-required", 4);
  return new AgentFabricClient({ baseUrl: config.server, token: config.token });
}

function requiredFlag(args: readonly string[], flag: string): string {
  const value = optionalFlag(args, flag);
  if (!value) throw new CliError(`missing-flag:${flag}`, 2);
  return value;
}

function optionalFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  const value = index < 0 ? undefined : args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function numberFlag(args: readonly string[], flag: string, fallback: number): number {
  const raw = optionalFlag(args, flag);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value <= 0) throw new CliError(`invalid-flag:${flag}`, 2);
  return value;
}

function defaultDeviceName(): string { return `${process.env.USER ?? "User"} Codex`; }

async function browserAuthentication(input: { readonly client: AgentFabricClient; readonly args: readonly string[]; readonly runtime: CliRuntime }): Promise<{ readonly token: string; readonly humanPrincipalId: string }> {
  const verifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = await listenForLoginCallback(state, numberFlag(input.args, "--timeout-seconds", 300));
  try {
    const authorizationUrl = input.client.googleLoginUrl({ codeChallenge, returnUri: callback.returnUri, clientState: state, deviceName: optionalFlag(input.args, "--device-name") ?? defaultDeviceName() });
    if (!input.args.includes("--no-browser")) await (input.runtime.openBrowser ?? openBrowser)(authorizationUrl);
    return input.client.exchangeDeviceLogin((await callback.result).code, verifier);
  } finally { await callback.close(); }
}

async function listenForLoginCallback(expectedState: string, timeoutSeconds: number): Promise<{ readonly returnUri: string; readonly result: Promise<{ readonly code: string }>; close(): Promise<void> }> {
  let resolveResult!: (value: { readonly code: string }) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<{ readonly code: string }>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback" || url.searchParams.get("state") !== expectedState || !url.searchParams.get("code")) throw new CliError("login-callback-invalid", 5);
      resolveResult({ code: url.searchParams.get("code") as string });
      response.statusCode = 200; response.setHeader("content-type", "text/html; charset=utf-8"); response.end("<!doctype html><meta charset=utf-8><title>Agent Fabric</title><p>登录完成，可以返回 Agent Fabric。</p>");
    } catch (error) { response.statusCode = 400; response.end("Invalid callback"); rejectResult(error); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === "string") throw new CliError("login-listener-failed", 5);
  const timer = setTimeout(() => rejectResult(new CliError("login-timeout", 5)), timeoutSeconds * 1000);
  timer.unref();
  return { returnUri: `http://127.0.0.1:${address.port}/callback`, result, close: async () => { clearTimeout(timer); await closeHttpServer(server); } };
}

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

const execFileAsync = promisify(execFile);
async function openBrowser(url: string): Promise<void> {
  if (process.platform === "darwin") { await execFileAsync("open", [url]); return; }
  if (process.platform === "win32") { await execFileAsync("cmd", ["/c", "start", "", url]); return; }
  await execFileAsync("xdg-open", [url]);
}

function output(io: CliIo, json: boolean, value: unknown, human: string): void {
  io.stdout.write(json ? `${JSON.stringify({ schemaVersion: CLI_OUTPUT_VERSION, ok: true, data: value })}\n` : human);
}

function outputError(io: CliIo, json: boolean, error: CliError): void {
  const payload = { schemaVersion: CLI_OUTPUT_VERSION, ok: false, error: { code: error.code, exitCode: error.exitCode, ...(error.details ? { details: error.details } : {}) } };
  io.stderr.write(json ? `${JSON.stringify(payload)}\n` : `失败：${error.code}\n`);
}

function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  if (error instanceof SelfTestError) return new CliError(error.code, 5, error, error.remediation);
  if (error instanceof FabricClientError) return new CliError(error.code, error.status === 401 || error.status === 403 ? 4 : 5, error);
  return new CliError(error instanceof Error ? error.message.split(":")[0] ?? "unexpected-error" : "unexpected-error", 1, error);
}

function processIo(): CliIo {
  return { stdout: process.stdout, stderr: process.stderr, readStdin: async () => { const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8"); } };
}

function helpText(): string {
  return "Agent Fabric CLI\n\nGoogle 登录：login。\n查看本人及好友开放的 Agents：agents list。\n标准 A2A 问答：ask --agent <Agent ID> --text <问题>。\n读取延迟 Task：task get --id <Task ID>。\n隔离闭环验收：self-test --agent <Agent ID> --confirm。\nRuntime、好友和 Agent 管理请使用 Agent Fabric Desktop；登录后 Codex MCP 会自动配置。\n";
}

function selfTestHumanOutput(report: SelfTestReport): string {
  const ask = report.stages.find((stage) => stage.name === "a2a-ask");
  const timings = report.stages.map((stage) => `- ${stage.name}: ${stage.durationMs}ms`).join("\n");
  return `Agent Fabric Account 隔离闭环自测通过。\nAccount: ${report.accountId}\nAgent: ${report.agentId}\n阶段耗时:\n${timings}\n真实回答: ${ask?.answerCharacters ?? 0} 字符 / ${ask?.durationMs ?? 0}ms\n临时自测凭据已撤销；本机配置和 Desktop MCP 未改动。\n`;
}

function selfTestMcpClient(client: AgentFabricClient) {
  const gateway: AccountAgentMcpPort = {
    listAgents: (query) => client.listInvokableAgents(query),
    async findAgent(query) { return (await client.listInvokableAgents(query)).find((agent) => agent.agentId === query || agent.name === query); },
    askAgent: (agentId, question, waitMs, idempotencyKey) => client.askAccountAgent({ agentId, text: question, waitMs, ...(idempotencyKey ? { idempotencyKey } : {}) }),
    async getTask(taskId) { return client.getAccountAgentTask(taskId); },
  };
  const server = new AgentFabricMcpServer({ gateway });
  let requestId = 0;
  return { async callTool(name: "list_agents" | "ask_agent" | "get_task", argumentsValue: Readonly<Record<string, unknown>>) { requestId += 1; return server.handle({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: argumentsValue } }); } };
}
