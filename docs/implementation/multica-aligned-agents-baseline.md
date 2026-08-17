# Multica-aligned Agents implementation baseline

Date: 2026-08-13
Branch: `feature-multica-aligned-agents-product`
OpenSpec: `openspec/changes/multica-aligned-agents-product`

The active implementation is now limited to the Account-scoped multi-Agent product graph:

- Unified Better Auth Google/email OTP, session and Account infrastructure: `apps/server/src/auth-broker*`, `apps/server/src/onboarding-api*`, `apps/server/src/account-infrastructure*`, `apps/desktop/src/account-infrastructure`.
- Agent management and standard A2A: `packages/account-agent-domain`, `packages/client`, `packages/a2a-task`, `apps/server/src/account-agent-*`.
- Runtime lifecycle and Codex execution: `packages/runtime-contract`, `adapters/runtime-fake`, `adapters/runtime-codex-acp`, `apps/edge-host/src/account-agents`, `apps/edge-host/src/account-infrastructure`.
- MCP and local integration: `packages/mcp-server/src/account-agents`, `packages/codex-plugin`, `apps/mcp-host`, `apps/cli`.
- MySQL persistence: `packages/persistence-mysql` and current Server persistence modules.
- Desktop Account product: `apps/desktop/src/account-product`, `apps/desktop/src/account-infrastructure`, current main/preload/renderer entry points and packaging scripts.
- Product and supply-chain gates: `config/default-product.json`, `config/package-boundaries.json`, `config/third-party-sources.json` and their verification scripts.

Superseded product source and dedicated historical documents are absent from the active tree. Only archived OpenSpec artifacts, `docs/history/README.md` and Git history remain as audit evidence.
