# Multica-aligned Agents product verification evidence

## Automated product verification

| Scope | Command | Result |
| --- | --- | --- |
| Unit | `pnpm run test:unit` | 49 current-product files, 249 tests passed |
| Contract | `pnpm run test:contract` | 3 current-product files, 18 tests passed |
| Type safety | `pnpm run typecheck` | passed |
| Lint | `pnpm run lint` | passed with zero warnings |
| Build | `pnpm run build` | client distribution and managed platform runtime built |
| New OpenSpec | `openspec validate multica-aligned-agents-product --strict --no-interactive` | valid |
| Default product | `pnpm run verify:default-product` | passed |
| Source policy | `pnpm run verify:source` | passed |
| Package boundaries | `pnpm run verify:boundaries` | passed |
| Supply chain | `pnpm run verify:supply-chain` | passed, 455 current-product components |
| Development gate | `pnpm run verify:development` | passed |

## Visual and packaged product verification

- `node scripts/capture-account-product-ui.mjs` generated 35 persistent screenshots; every case verified document/body width equals viewport width and no action button wrapped unexpectedly.
- The Impeccable detector was run exactly once and returned `[]`.
- Final independent finish review returned `PASS`, no regressions, disposition `ship`.
- `pnpm --filter @agent-fabric/desktop run package:mac:smoke` produced the initial arm64 smoke App; it was superseded by the signed `0.1.0-beta.1` release build below.
- `pnpm run verify:packaged-account-product` passed: the isolated temporary Codex config readback succeeded with mode `0600`, an existing MCP was preserved, the packaged MCP launched through the packaged executable, and exposed exactly `list_agents`, `find_agent`, `ask_agent`, `get_task`.
- The packaged-renderer live check launches the final `.app` with an isolated user-data directory and random loopback DevTools port, reloads the packaged page, and requires a non-empty React root, `window.agentFabricAccount` bridge, visible login/product text, and zero renderer exceptions or error log entries.
- A 2026-08-14 white-screen finding was traced to Electron sandbox preload dependency externalization (`@agent-fabric/account-agent-domain` was unavailable inside `app.asar`). The preload is now a standalone bundle; packaged readback rejects external workspace-domain or `zod` requires, and the final arm64 `.app` passed the live renderer check.
- The packaged product contains `account-agent-mcp.mjs` and `codex-acp.mjs`; it does not contain a legacy `personal-agent-mcp.mjs` entry.
- The arm64 package retains only `@openai/codex-darwin-arm64`; foreign-platform Codex binaries are absent and enforced by the packaged-product verifier.
- Historical single-Agent data tables are retained non-destructively for migration safety, but their routes, controllers, CLI commands, executables and package exports are absent from the current product.

## macOS 0.1.0-beta.1 release verification

- `pnpm --dir apps/desktop run package:mac` built the final Apple Silicon DMG with `forceCodeSigning`, Bundle ID `ai.agentfabric.desktop`, Hardened Runtime and the Agent Fabric-owned robot icon.
- `pnpm run verify:macos-release` passed strict App/DMG codesign, arm64-only architecture, packaged icon/version, Developer ID authority, non-empty Team Identifier, Hardened Runtime, Apple notarization `Accepted`, stapler validation and Gatekeeper install assessment.
- The release verifier now mounts a copied DMG read-only and runs deep strict codesign against the App inside the image before notarization. This caught and rejected an earlier image whose outer DMG was valid but whose embedded App no longer matched its signature; the DMG was rebuilt from the signed App before the final submission.
- `pnpm run verify:macos-first-launch` copied the stapled DMG to an isolated download path, applied and read back quarantine attributes on the DMG and copied App, passed Gatekeeper execution assessment and launched through macOS Launch Services.
- The quarantined launch reached a complete Renderer with a non-empty React root, current Account/Agents product text, no legacy Personal Agent/Friends/Activity surface and no Renderer error events; white-screen status was false.
- Final artifact: `Agent-Fabric-0.1.0-beta.1-arm64.dmg`, 235,258,078 bytes, SHA-256 `38f2dac96c4d5fdae8a87cf3a8798d273f5854569fece99517261f454370f0fc`.
- The final App was installed at `/Applications/Agent Fabric.app`; deep strict codesign and Gatekeeper execution assessment returned `Notarized Developer ID`, and the existing Account session restored with two Agents plus Runtime, Codex MCP and Cloud all available.
- The release evidence intentionally excludes certificate hashes, signing identity names, Team values, Apple account data, passwords, tokens and keychain contents.

## Real MCP, restart and activity continuity

- A long-lived development MCP process returned exact text `AF_FINAL_UI_76052EF` for Task `c7e2b8e1-2035-4186-8141-c249ef05331e`; Desktop activity displayed the same completed Task ID.
- After restarting the development Desktop while keeping that MCP process alive, the same process returned exact text `AF_FINAL_RESTART_76052EF` for Task `dad63e62-5936-41ca-a847-c405fd9fcb60`; the restored Desktop activity displayed the same completed Task ID after Cloud event reconnection.
- With the development Desktop stopped, the installed App owned the Runtime and its packaged configuration drove an MCP → standard A2A request that returned exact text `AF_PACKAGED_FINAL_76052EF` for Task `2c893b12-e26b-4457-9b14-1dd940147f67`; the installed App activity view displayed the same completed Task ID.

## Explicit remaining gates

- Human Google login, persisted-session restart, selected-Agent MCP/A2A, Desktop activity synchronization and the final installed-App path have passed. Remaining product gates are the isolated self-test cleanup/post-revoke-denial proof, a real second non-owner member MCP scenario, and explicit product acceptance; no repository-only fixture is treated as proof of those paths.
