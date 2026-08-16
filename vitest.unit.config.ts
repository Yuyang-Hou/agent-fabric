import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 4,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: [
      "apps/cli/src/**/*.test.ts",
      "apps/desktop/src/account-agent-*.test.ts",
      "apps/desktop/src/account-infrastructure/**/*.test.ts",
      "apps/desktop/src/account-product/**/*.test.{ts,tsx}",
      "apps/desktop/src/updater/**/*.test.{ts,tsx}",
      "apps/edge-host/src/account-agents/**/*.test.ts",
      "apps/edge-host/src/account-infrastructure/**/*.test.ts",
      "apps/server/src/account-*.test.ts",
      "apps/server/src/google-oidc.test.ts",
      "apps/server/src/onboarding-api.test.ts",
      "apps/server/src/persistence-store.test.ts",
      "apps/server/src/server-config.test.ts",
      "packages/{a2a-task,account-agent-domain,client,fabric-contracts,mcp-server,persistence-mysql,runtime-contract}/src/**/*.test.ts",
      "adapters/{runtime-codex-acp,runtime-fake}/src/**/*.test.ts"
    ],
    exclude: [
      "**/*.contract.test.ts",
      "**/migration-only-*.test.ts",
      "**/dist/**",
      "**/node_modules/**"
    ],
  },
});
