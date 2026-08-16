import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "adapters/{runtime-codex-acp,runtime-fake}/src/**/*.contract.test.ts",
      "packages/a2a-task/src/**/*.contract.test.ts"
    ],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
