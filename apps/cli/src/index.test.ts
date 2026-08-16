import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runCli, writeConfigAtomic } from "./index.js";
import { SelfTestError } from "./self-test.js";

function fixture() {
  let stdout = ""; let stderr = ""; let stdin = "";
  return {
    io: { stdout: { write: (value: string) => { stdout += value; } }, stderr: { write: (value: string) => { stderr += value; } }, readStdin: async () => stdin },
    setStdin(value: string) { stdin = value; }, get stdout() { return stdout; }, get stderr() { return stderr; },
  };
}

describe("Account CLI", () => {
  it("advertises exactly the current Account and A2A command surface", async () => {
    const test = fixture();
    expect(await runCli(["help", "--json"], test.io)).toBe(0);
    const result = JSON.parse(test.stdout) as { data: { commands: string[] } };
    expect(result.data.commands).toEqual(["setup", "login", "logout", "doctor", "agents list", "ask", "task get", "self-test"]);
    expect(JSON.stringify(result)).not.toMatch(/publish|invite|join|grant|revoke|revision|deployment|context|edge install/iu);
  });

  it.each(["join", "publish", "invite", "grant", "revoke", "edge", "mcp"])("rejects removed %s commands without mutation", async (command) => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-removed-"));
    const paths = { configFile: join(root, "config.json") };
    await writeConfigAtomic(paths.configFile, { version: "1", server: "https://fabric.example.test", token: "private" });
    const before = await readFile(paths.configFile, "utf8");
    const test = fixture();
    expect(await runCli([command, "--json"], test.io, paths)).toBe(2);
    expect(JSON.parse(test.stderr)).toMatchObject({ error: { code: "command-unknown" } });
    expect(await readFile(paths.configFile, "utf8")).toBe(before);
  });

  it("writes only current Account config fields with private permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-config-"));
    const file = join(root, "nested", "config.json");
    await writeConfigAtomic(file, { version: "1", server: "https://fabric.example.test", token: "private", ownerPrincipalId: "human:one" });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ version: "1", server: "https://fabric.example.test", token: "private", ownerPrincipalId: "human:one" });
  });

  it("logs in without persisting OAuth intermediates", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-login-"));
    const paths = { configFile: join(root, "config.json") };
    await writeConfigAtomic(paths.configFile, { version: "1", server: "https://fabric.example.test" });
    const test = fixture();
    expect(await runCli(["login"], test.io, paths, { authenticateLogin: async () => ({ token: "fabric-secret", humanPrincipalId: "human:alice" }) })).toBe(0);
    const config = await readFile(paths.configFile, "utf8");
    expect(config).toContain("fabric-secret");
    expect(config).not.toMatch(/exchange-code|accounts\.google\.com|revision|deployment/iu);
  });

  it("returns versioned JSON for unknown commands", async () => {
    const test = fixture();
    expect(await runCli(["wat", "--json"], test.io)).toBe(2);
    expect(JSON.parse(test.stderr)).toMatchObject({ schemaVersion: "1", ok: false, error: { code: "command-unknown" } });
  });

  it("reports isolated Account self-test without changing config or exposing content", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-self-test-"));
    const paths = { configFile: join(root, "config.json") };
    await writeConfigAtomic(paths.configFile, { version: "1", server: "https://fabric.example.test", token: "owner-private-token" });
    const before = await readFile(paths.configFile, "utf8");
    const report = {
      status: "passed", accountId: "account:one", agentId: "agent:squidward",
      stages: [
        { name: "preflight", status: "passed", durationMs: 2 }, { name: "credential", status: "passed", durationMs: 3 },
        { name: "mcp-discovery", status: "passed", durationMs: 5 }, { name: "a2a-ask", status: "passed", durationMs: 23, answerCharacters: 8 },
        { name: "mcp-task-read", status: "passed", durationMs: 4 }, { name: "revocation", status: "passed", durationMs: 6 },
        { name: "revocation-enforced", status: "passed", durationMs: 7 },
      ], cleanup: { selfTest: "revoked" },
    } as const;
    const test = fixture();
    expect(await runCli(["self-test", "--agent", "agent:squidward", "--confirm", "--json"], test.io, paths, { runSelfTest: async () => report })).toBe(0);
    expect(JSON.parse(test.stdout)).toMatchObject({ data: { status: "passed", cleanup: { selfTest: "revoked" } } });
    expect(test.stdout).not.toContain("owner-private-token");
    expect(await readFile(paths.configFile, "utf8")).toBe(before);
  });

  it("redacts self-test dependency failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "fabric-cli-self-test-"));
    const paths = { configFile: join(root, "config.json") };
    await writeConfigAtomic(paths.configFile, { version: "1", server: "https://fabric.example.test", token: "owner-private-token" });
    const test = fixture();
    const code = await runCli(["self-test", "--agent", "agent:squidward", "--confirm", "--json"], test.io, paths, {
      runSelfTest: async () => { throw new SelfTestError("self-test-cleanup-failed", { selfTestId: "self-test:one", stage: "cleanup", failureClass: "cleanup" }, new Error("oauth-code-private")); },
    });
    expect(code).toBe(5);
    expect(test.stderr).toContain("self-test-cleanup-failed");
    expect(test.stderr).not.toMatch(/oauth-code-private|owner-private-token/u);
  });
});
