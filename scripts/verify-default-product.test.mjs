import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyDefaultProduct } from "./verify-default-product.mjs";

const baseConfig = {
  schemaVersion: 3,
  change: "replace-account-members-with-friends",
  tenantBoundary: "account",
  multipleAgents: true,
  navigation: ["agents", "runtimes", "friends"],
  cloudDatabase: "mysql",
  desktopServerBaseUrl: "https://fabric.example",
  sourceRoots: [
    "packages/account-agent-domain/src",
    "apps/server/src/server.ts",
    "apps/server/src/account-agent-a2a.ts",
    "apps/server/src/account-invalidation.ts",
    "apps/server/src/account-runtime-tunnel.ts",
    "apps/edge-host/src/account-agents",
    "apps/edge-host/src/account-infrastructure",
    "packages/mcp-server/src/account-agents",
    "apps/cli/src/index.ts",
    "apps/desktop/src/account-product",
    "apps/desktop/src/account-infrastructure",
    "apps/desktop/src/account-agent-cloud-gateway.ts",
    "apps/desktop/src/account-agent-mcp.ts",
    "apps/desktop/src/account-runtime.ts",
  ],
  forbiddenHistoricalRoots: [
    "apps/control-plane",
    "apps/desktop/src/personal-agent",
    "apps/edge-host/src/personal-agent",
    "apps/server/src/personal-agent",
    "deploy/compose",
    "docs/acceptance",
    "docs/adr",
    "docs/spike-gates",
    "packages/context-capsule",
    "packages/matrix-transport",
    "packages/messenger-domain",
    "packages/persistence-postgres",
    "packages/personal-agent-domain",
    "packages/test-kit",
    "packages/ui",
    "skills/publish-to-atlas",
    "spikes/assistant-ui",
    "spikes/matrix-e2ee",
    "spikes/paperclip-adapters",
  ],
  workspacePackages: [
    "apps/cli",
    "apps/desktop",
    "apps/edge-host",
    "apps/mcp-host",
    "apps/server",
    "packages/a2a-task",
    "packages/account-agent-domain",
    "packages/client",
    "packages/codex-plugin",
    "packages/fabric-contracts",
    "packages/mcp-server",
    "packages/persistence-mysql",
    "packages/runtime-contract",
    "adapters/runtime-codex-acp",
    "adapters/runtime-fake",
  ],
  packageManifests: [],
  buildEntryFiles: [],
  clientBins: ["agent-fabric", "agent-fabric-mcp"],
  requiredRoots: [],
  forbiddenImports: ["@agent-fabric/matrix-transport", "@agent-fabric/persistence-postgres", "@multica/"],
  forbiddenSourceMarkers: ["delegate_task", "ContextCapsule"],
  mcpTools: ["list_agents", "find_agent", "ask_agent", "get_task"],
  supersededChanges: [
    "agent-fabric-v1-foundation",
    "trusted-agent-messenger-mvp",
    "headless-agent-fabric-cli-mcp",
    "minimal-agent-friend-messaging",
    "multica-aligned-agents-product",
  ],
};

function fixture(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-fabric-default-product-"));
  for (const relativeRoot of baseConfig.sourceRoots) {
    const target = path.join(root, relativeRoot);
    if (path.extname(relativeRoot)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "export {};\n");
    } else fs.mkdirSync(target, { recursive: true });
  }
  fs.writeFileSync(path.join(root, baseConfig.sourceRoots[0], "index.ts"), source);
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), `packages:\n${baseConfig.workspacePackages.map((workspace) => `  - ${workspace}`).join("\n")}\n\nonlyBuiltDependencies: []\n`);
  return root;
}

test("accepts the personal-Account and Human-friend product surface", () => {
  assert.deepEqual(verifyDefaultProduct(fixture('export const tool = "ask_agent";\n'), baseConfig), []);
});

test("rejects the superseded single-Agent product authority", () => {
  const errors = verifyDefaultProduct(fixture("export {};\n"), {
    ...baseConfig,
    schemaVersion: 2,
    change: "minimal-agent-friend-messaging",
    tenantBoundary: "human",
    multipleAgents: false,
    navigation: ["我的 Agent", "Agent 好友", "消息动态"],
    mcpTools: ["list_agent_friends", "send_message", "get_message"],
    sourceRoots: ["packages/personal-agent-domain/src"],
    forbiddenHistoricalRoots: [],
    supersededChanges: [],
  });
  assert.ok(errors.some((error) => error.includes("schemaVersion 3")));
  assert.ok(errors.some((error) => error.includes("replace-account-members-with-friends")));
  assert.ok(errors.some((error) => error.includes("multiple Agents")));
  assert.ok(errors.some((error) => error.includes("agents, runtimes, friends")));
  assert.ok(errors.some((error) => error.includes("list_agents")));
  assert.ok(errors.some((error) => error.includes("supersede historical change")));
  assert.ok(errors.some((error) => error.includes("implementation roots")));
});

test("rejects historical implementation paths that return to the active tree", () => {
  const root = fixture("export {};\n");
  const historical = path.join(root, baseConfig.forbiddenHistoricalRoots[0]);
  fs.mkdirSync(historical, { recursive: true });
  fs.writeFileSync(path.join(historical, "index.ts"), "export {};\n");
  const errors = verifyDefaultProduct(root, baseConfig);
  assert.ok(errors.some((error) => error.includes("forbidden historical product path remains")));
});

test("requires every declared authority file to name the current change", () => {
  const root = fixture("export {};\n");
  fs.writeFileSync(path.join(root, "CURRENT.md"), "historical product only\n");
  const errors = verifyDefaultProduct(root, { ...baseConfig, authorityFiles: ["CURRENT.md", "MISSING.md"] });
  assert.ok(errors.some((error) => error.includes("does not name the current product authority")));
  assert.ok(errors.some((error) => error.includes("authority file missing")));
});

test("rejects legacy default-product dependencies", () => {
  const errors = verifyDefaultProduct(fixture('import "@agent-fabric/matrix-transport";\n'), baseConfig);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /matrix-transport/u);
});

test("rejects historical workspace globs and packages", () => {
  const root = fixture("export {};\n");
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n  - adapters/*\n");
  const errors = verifyDefaultProduct(root, baseConfig);
  assert.ok(errors.some((error) => error.includes("pnpm workspace packages")));
});

test("rejects old task tools and non-MySQL defaults", () => {
  const root = fixture('export const tool = "delegate_task";\n');
  const errors = verifyDefaultProduct(root, { ...baseConfig, cloudDatabase: "postgres" });
  assert.ok(errors.some((error) => error.includes("must be mysql")));
  assert.ok(errors.some((error) => error.includes("delegate_task")));
});

test("rejects an expanded MCP tool surface", () => {
  const errors = verifyDefaultProduct(fixture("export {};\n"), { ...baseConfig, mcpTools: [...baseConfig.mcpTools, "cancel_task"] });
  assert.ok(errors.some((error) => error.includes("exactly")));
});

test("rejects a missing or insecure packaged Desktop server", () => {
  const root = fixture("export {};\n");
  assert.ok(verifyDefaultProduct(root, { ...baseConfig, desktopServerBaseUrl: "http://fabric.example" }).some((error) => error.includes("clean https origin")));
  assert.ok(verifyDefaultProduct(root, { ...baseConfig, desktopServerBaseUrl: "" }).some((error) => error.includes("clean https origin")));
});
