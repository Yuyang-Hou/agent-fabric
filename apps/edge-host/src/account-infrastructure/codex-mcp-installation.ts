import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { parse, stringify, type TomlTable } from "smol-toml";

const serverName = "agent-fabric";

export interface CodexMcpInstallation {
  readonly runtimeExecutable: string;
  readonly mcpExecutable: string;
  readonly agentFabricConfigFile: string;
  readonly codexConfigFile?: string;
}

export function defaultCodexConfigFile(): string {
  return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml");
}

export function renderAccountAgentMcpConfig(existing: string, input: CodexMcpInstallation): string {
  if (![input.runtimeExecutable, input.mcpExecutable, input.agentFabricConfigFile].every(isAbsolute)) throw new Error("codex-mcp-path-invalid");
  const document = parseDocument(existing);
  const current = document.mcp_servers;
  if (current !== undefined && !isTable(current)) throw new Error("codex-config-unsafe");
  const before = withoutAccountAgent(document);
  const next: TomlTable = {
    ...document,
    mcp_servers: {
      ...(current ?? {}),
      [serverName]: {
        command: input.runtimeExecutable,
        args: [input.mcpExecutable, "--config", input.agentFabricConfigFile],
        env: { ELECTRON_RUN_AS_NODE: "1" },
      },
    },
  };
  const rendered = `${stringify(next).trimEnd()}\n`;
  const verified = parseDocument(rendered);
  if (!isDeepStrictEqual(before, withoutAccountAgent(verified))) throw new Error("codex-config-preservation-failed");
  if (!matches(asTable(asTable(verified.mcp_servers)?.[serverName]), input)) throw new Error("codex-config-verification-failed");
  return rendered;
}

export async function installAccountAgentMcp(input: CodexMcpInstallation): Promise<void> {
  const destination = input.codexConfigFile ?? defaultCodexConfigFile();
  const existing = await readOptional(destination);
  await writePrivateAtomic(destination, renderAccountAgentMcpConfig(existing ?? "", input));
  if (!await isAccountAgentMcpInstalled(input)) throw new Error("codex-config-readback-failed");
}

export async function isAccountAgentMcpInstalled(input: CodexMcpInstallation): Promise<boolean> {
  const existing = await readOptional(input.codexConfigFile ?? defaultCodexConfigFile());
  if (!existing) return false;
  try { return matches(asTable(asTable(parse(existing).mcp_servers)?.[serverName]), input); }
  catch { return false; }
}

function parseDocument(value: string): TomlTable {
  try { return value.trim() ? parse(value) : {}; }
  catch { throw new Error("codex-config-invalid"); }
}

function matches(entry: TomlTable | undefined, input: CodexMcpInstallation): boolean {
  return entry?.command === input.runtimeExecutable
    && isDeepStrictEqual(entry.args, [input.mcpExecutable, "--config", input.agentFabricConfigFile])
    && asTable(entry.env)?.ELECTRON_RUN_AS_NODE === "1";
}

function withoutAccountAgent(document: TomlTable): TomlTable {
  const servers = asTable(document.mcp_servers);
  if (!servers) return document;
  const rest = { ...servers };
  delete rest[serverName];
  const result = { ...document };
  delete result.mcp_servers;
  return Object.keys(rest).length ? { ...result, mcp_servers: rest } : result;
}

async function readOptional(file: string): Promise<string | undefined> {
  try { return await readFile(file, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

async function writePrivateAtomic(file: string, value: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, file);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
}

function isTable(value: unknown): value is TomlTable {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTable(value: unknown): TomlTable | undefined { return isTable(value) ? value : undefined; }
