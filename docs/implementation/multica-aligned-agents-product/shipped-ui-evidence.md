# Shipped Account product UI evidence

## Product boundary

The shipped Desktop has exactly three signed-in primary routes: Agents, Runtimes and Members. It deliberately excludes Multica Workspace, project, task-board, inbox, automation and analytics surfaces. The unique addition is the local Codex-facing MCP, which discovers only currently invokable Agents and asks them through standard A2A.

## Interaction map

| Surface | Shipped interaction |
| --- | --- |
| Login | Google system-browser login, pending/error recovery, session restore and logout |
| Agents | Search, mine/all/archived counts, filters, sorts, column control, selection, row actions, archive/restore |
| Create | Blank, template and local ephemeral AI Builder; local validation and one non-retried final create request |
| Detail | Overview, terminal A2A activity, Skills/Agent MCP capability summary, editable Settings and dirty navigation guard |
| Secrets | Redacted counts in ordinary detail; explicit acknowledged full replacement through a write-only endpoint |
| Runtimes | Search/status filter, detection health, capability truth, name/visibility edit, auth guidance and deletion impact |
| Members | Search, invite/revoke, role edit, last-owner protection and per-resource transfer/archive/unbind removal plan |

## Deterministic screenshots

All 35 files are generated from the strict Account Renderer fixture under the persistent, build-clean-safe directory `docs/implementation/multica-aligned-agents-product/ui-captures/`:

- `login-1280x800.png`
- `agents-1280x800.png`, `agents-1440x900.png`, `agents-1728x1117.png`
- `agents-768x900.png`, `agents-414x896.png`
- `agents-filter-1280x800.png`, `agents-columns-1280x800.png`, `agents-batch-1280x800.png`
- `agents-loading-1280x800.png`, `agents-empty-1280x800.png`, `agents-error-1280x800.png`
- `create-choice-1280x800.png`, `create-manual-1280x800.png`, `create-builder-1280x800.png`
- `create-choice-768x900.png`, `create-choice-414x896.png`
- `agent-detail-1280x800.png`, `agent-detail-768x900.png`, `agent-detail-414x896.png`
- `agent-capabilities-1280x800.png`, `agent-settings-1280x800.png`, `agent-dirty-guard-1280x800.png`
- `runtimes-1280x800.png`, `runtimes-768x900.png`, `runtimes-414x896.png`
- `runtime-detail-1280x800.png`, `runtime-detail-768x900.png`, `runtime-detail-414x896.png`
- `runtime-auth-required-1280x800.png`, `runtime-delete-impact-1280x800.png`
- `members-1280x800.png`, `members-768x900.png`, `members-414x896.png`
- `member-removal-impact-1280x800.png`

Every capture verifies viewport width equals document/body width and finds no unintended wrapped action button. The 414 and 768 captures prove one-pane responsive layouts for Agents, create, Agent detail, Runtime list/detail and Members. The remaining captures cover filter/column/batch controls, loading/empty/error, Capabilities/Settings/dirty navigation, Runtime authentication/deletion impact and member-removal impact.

## Visual review

- Visual authority: `visual-authority.md`
- Multica evidence commit: `2b35f8017ab3b773e0356e562ecb04e55a7a9bd7`
- Impeccable detector command: `node .agents/skills/impeccable/scripts/detect.mjs --json apps/desktop/src/account-product/app.tsx apps/desktop/src/account-product/ui.tsx apps/desktop/src/renderer.css apps/desktop/src/tokens.css`
- Detector result: `[]` (no material static findings)
- Final capture command: `node scripts/capture-account-product-ui.mjs`
- Final finish-review verdict: `PASS`; all prior material findings resolved, no regressions, disposition `ship`.

The comparison is clean-room: hierarchy, density, action placement and state coverage are aligned; Multica source, assets, copy, tokens, class names and private APIs are not shipped or imported.

## Packaged product and MCP

- Package command: `pnpm --dir apps/desktop run package:mac`
- Artifact: `apps/desktop/release/Agent-Fabric-0.1.0-beta.1-arm64.dmg` (arm64, Developer ID signed, notarized and stapled)
- Verification commands: `pnpm run verify:packaged-account-product`, `pnpm run verify:macos-release`, `pnpm run verify:macos-first-launch`
- The verifier installs the packaged MCP into an isolated temporary Codex config, reads it back with mode `0600`, proves an existing MCP entry is preserved, launches the packaged Electron executable in Node mode, and asserts the exact tool list is `list_agents`, `find_agent`, `ask_agent`, `get_task`.
- The package contains `account-agent-mcp.mjs` and `codex-acp.mjs`; it rejects a packaged `personal-agent-mcp.mjs` compatibility artifact.
- The quarantined first-launch check passed through macOS Launch Services with the current Account/Agents Renderer and no white screen; exact release evidence is in `docs/releases/0.1.0-beta.1-macos.md`.
