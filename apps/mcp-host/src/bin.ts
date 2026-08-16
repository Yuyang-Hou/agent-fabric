#!/usr/bin/env node
import { AgentFabricMcpServer } from "@agent-fabric/mcp-server";
import { createInterface } from "node:readline";

import { FileBackedAccountAgentGateway } from "./configured-gateway.js";

const index = process.argv.indexOf("--config");
const file = index >= 0 ? process.argv[index + 1] : undefined;
if (!file) throw new Error("mcp-config-file-required");
const server = new AgentFabricMcpServer({ gateway: new FileBackedAccountAgentGateway(file) });
const input = createInterface({ input: process.stdin, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  let response: unknown;
  try { response = await server.handle(JSON.parse(line)); }
  catch { response = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse-error" } }; }
  if (response !== undefined) process.stdout.write(`${JSON.stringify(response)}\n`);
}
