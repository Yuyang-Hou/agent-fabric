import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { installAccountAgentMcp, isAccountAgentMcpInstalled, renderAccountAgentMcpConfig } from "./codex-mcp-installation.js";

describe("Codex Account Agent MCP installation", () => {
  it("preserves unrelated configuration and pins the packaged local MCP process", () => {
    const rendered = renderAccountAgentMcpConfig('[mcp_servers.other]\ncommand = "other"\n', {
      runtimeExecutable: "/Applications/Agent Fabric.app/Contents/MacOS/Agent Fabric",
      mcpExecutable: "/Applications/Agent Fabric.app/Contents/Resources/edge-host/account-agent-mcp.mjs",
      agentFabricConfigFile: "/Users/alice/Library/Application Support/Agent Fabric/agent-mcp.json",
    });
    const value = parse(rendered) as Record<string, unknown>;
    expect(value).toMatchObject({ mcp_servers: {
      other: { command: "other" },
      "agent-fabric": { env: { ELECTRON_RUN_AS_NODE: "1" } },
    } });
  });

  it("rejects non-absolute executable and capability paths", () => {
    expect(() => renderAccountAgentMcpConfig("", { runtimeExecutable: "electron", mcpExecutable: "mcp.mjs", agentFabricConfigFile: "config.json" })).toThrow("codex-mcp-path-invalid");
  });

  it("atomically installs, preserves, and readback-verifies a private Codex config", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agent-fabric-codex-mcp-"));
    const codexConfigFile = path.join(directory, "config.toml");
    const input = {
      runtimeExecutable: "/Applications/Agent Fabric.app/Contents/MacOS/Agent Fabric",
      mcpExecutable: "/Applications/Agent Fabric.app/Contents/Resources/edge-host/account-agent-mcp.mjs",
      agentFabricConfigFile: "/Users/alice/Library/Application Support/Agent Fabric/agent-mcp.json",
      codexConfigFile,
    };
    await installAccountAgentMcp(input);
    expect(await isAccountAgentMcpInstalled(input)).toBe(true);
    expect(parse(await readFile(codexConfigFile, "utf8"))).toMatchObject({ mcp_servers: { "agent-fabric": { command: input.runtimeExecutable } } });
    expect((await stat(codexConfigFile)).mode & 0o777).toBe(0o600);
  });
});
