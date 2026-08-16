import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EncryptedFileAccountAgentPrivateConfigurationStore } from "./private-configuration.js";

describe("EncryptedFileAccountAgentPrivateConfigurationStore", () => {
  it("persists only encrypted Edge-local bytes and returns redacted metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-fabric-private-config-"));
    const encryption = {
      encrypt: (value: string) => xor(Buffer.from(value, "utf8")),
      decrypt: (value: Buffer) => xor(value).toString("utf8"),
    };
    try {
      const store = new EncryptedFileAccountAgentPrivateConfigurationStore(directory, encryption);
      const configuration = { environmentValues: { PRIVATE_TOKEN: "secret-value" }, mcpCredentials: { "mcp:one": { token: "mcp-secret" } }, integrationCredentials: {} };
      const summary = await store.replace("agent:one", configuration, "2026-08-13T00:00:00.000Z");
      expect(summary).toEqual({ environmentVariableNames: ["PRIVATE_TOKEN"], configuredMcpConnectionIds: ["mcp:one"], configuredIntegrationIds: [], updatedAt: "2026-08-13T00:00:00.000Z" });
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      const bytes = await readFile(join(directory, files[0] as string));
      expect(bytes.toString("utf8")).not.toMatch(/secret-value|mcp-secret|PRIVATE_TOKEN/u);
      await expect(store.get("agent:one")).resolves.toEqual(configuration);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

function xor(value: Buffer): Buffer {
  const output = Buffer.alloc(value.length);
  for (const [index, byte] of value.entries()) output[index] = byte ^ 0xa5;
  return output;
}
