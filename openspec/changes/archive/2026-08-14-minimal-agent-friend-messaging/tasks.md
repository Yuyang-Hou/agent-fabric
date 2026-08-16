## 1. Product Boundary and Contract Freeze

- [x] 1.1 Mark `trusted-agent-messenger-mvp` and `headless-agent-fabric-cli-mcp` as superseded/paused for the default product path without deleting their artifacts or evidence.
- [x] 1.2 Define package-boundary rules for Desktop App, local Agent Host, Runtime Adapter, MCP Server, Cloud Control Plane/Gateway, Cloud persistence, and local persistence.
- [x] 1.3 Add a default-product dependency gate that rejects Matrix, old Messenger Store/UI, ContextCapsule/Atlas, task delegation, cancellation, and extra MCP tools.
- [x] 1.4 Freeze schemas for Human Account, Device, Personal Agent, Agent Revision, Invitation, Friendship, Presence, Message metadata, local message body, and local Runtime binding.
- [x] 1.5 Freeze the product message statuses and their one-way mapping from authenticated Gateway, Edge, A2A TaskState, Runtime, and policy events.
- [x] 1.6 Record MySQL as the single P0 Cloud database and remove PostgreSQL from the new default product dependency path.
- [x] 1.7 Freeze the Multica-inspired clean-room reference boundary: retain only product-pattern notes, prohibit Multica source/assets/branding/`@multica/*`, and register every independently adopted upstream UI dependency.

## 2. Contract-First Two-Host Vertical Slice

- [x] 2.1 Build deterministic fixtures for two Humans, two Devices, two Personal Agents, one Friendship, two Hosts, and independent Fake Runtime stores.
- [x] 2.2 Implement the minimal authenticated Host-to-Cloud tunnel envelope for A2A Message routing and Edge status/result return without private A2A fields.
- [x] 2.3 Implement Cloud routing that requires an active exact-pair Friendship and a healthy target Deployment before dispatch.
- [x] 2.4 Implement target Host receipt acknowledgment, Fake Runtime start, text completion, A2A text Artifact return, and ordered product status projection.
- [x] 2.5 Implement source Host waiting, bounded timeout, Message ID return, delayed result retrieval, and local reply persistence.
- [x] 2.6 Add idempotency, duplicate delivery, malformed payload, wrong Agent pair, stale Presence, disconnect, Runtime failure, and timeout contract tests.
- [x] 2.7 Pass a no-UI two-Host acceptance proving `sent → received → processing → replied` and truthful `offline`, `failed`, and `needs_attention` branches.

## 3. Google Login and Device Identity

- [x] 3.1 Adapt the existing Google OAuth foundation to the desktop system-browser Authorization Code + PKCE flow and typed callback contract.
- [x] 3.2 Implement callback validation for issuer, audience, state, nonce, redirect binding, PKCE verifier, expiry, and replay.
- [x] 3.3 Implement Human Account lookup/creation and one-time current-Mac Device enrollment after successful login.
- [x] 3.4 Store the scoped Device Credential in the operating-system credential store and keep Google/App/Device/Agent/MCP credentials separate.
- [x] 3.5 Implement logout, App Session revocation, local session cleanup, and authenticated UI projection removal without deleting unrelated Runtime configuration.
- [x] 3.6 Add success, cancel, callback tampering, replay, expired session, cross-user, credential leakage, and MCP management-access tests.

## 4. Personal Agent Configuration and Publication

- [x] 4.1 Implement Runtime Adapter discovery and health projection for only the adapters that are actually packaged and contract-tested in P0.
- [x] 4.2 Build the local single-Agent AgentSpec store with selected Runtime, stable Agent ID, public metadata, fixed text-only policy, active Revision, and Deployment state.
- [x] 4.3 Implement the “我的 Agent” flow for Runtime selection, name, description, capability tags, validation, and exact Agent Card preview.
- [x] 4.4 Implement conformant A2A Agent Card projection and sensitive-field rejection for paths, credentials, Runtime handles, private prompts, and private Skill/MCP configuration.
- [x] 4.5 Implement publication preflight, immutable Revision creation, Cloud registration, Host tunnel activation, and atomic failure rollback.
- [x] 4.6 Implement truthful online/offline Presence from fresh Host connection, active Revision match, and Runtime health.
- [x] 4.7 Implement republish with stable Agent ID and a new immutable Revision, plus Owner stop without deleting friendships or local AI installation.
- [x] 4.8 Add one-Agent enforcement, unhealthy Runtime, invalid metadata, partial publication, stale heartbeat, App-window-close, stop, republish, and leakage tests.

## 5. Agent Friendship and Presence

- [x] 5.1 Implement short-lived single-use Agent invitation creation as a Human-only App operation bound to the Owner's Personal Agent.
- [x] 5.2 Implement authenticated invitation consumption and atomic bidirectional exact-pair Friendship creation.
- [x] 5.3 Implement invitation expiry, replay, self-add, wrong target, duplicate-pair idempotency, and enumeration resistance.
- [x] 5.4 Implement Owner friend removal, monotonic revocation, Cloud and Edge enforcement, and revocation-before-execution race handling.
- [x] 5.5 Build the “Agent 好友” App flow for invite creation/consumption, active friend list, minimal Agent Card summary, truthful online/offline state, and removal.
- [x] 5.6 Implement the MCP friend projection without Device, Runtime, path, credential, Session, private capability, revoked relationship, or guessed last-seen data.
- [x] 5.7 Add two-account invite, duplicate add, remove, revoked delivery, stale Presence, non-friend send, public enumeration, and cross-pair isolation tests.
- [x] 5.8 Add the virtual `contactType: self` projection to App and MCP friend lists without creating a Friendship or removal action.

## 6. Minimal Codex MCP Messaging

- [x] 6.1 Replace the default MCP tool surface with exactly `list_agent_friends`, `send_message`, and `get_message`, including strict schemas and actionable tool descriptions.
- [x] 6.2 Route MCP calls through authenticated local Host IPC/loopback instead of giving MCP Human management or direct Cloud administration credentials.
- [x] 6.3 Implement `list_agent_friends` against the active local Agent identity and minimal Friendship/Presence projection.
- [x] 6.4 Implement `send_message` text validation, A2A Message construction, active-friend authorization, target-online check, bounded waiting, and result normalization.
- [x] 6.5 Implement `get_message` with origin-Agent ownership checks and local status/reply retrieval.
- [x] 6.6 Remove or disable `ask_agent`, `delegate_task`, `cancel_task`, `continue_context`, publication, Grant, and friendship management from the new default MCP entry.
- [x] 6.7 Add MCP initialize/tool-list golden tests plus invalid schema, non-friend, offline, timeout, delayed reply, unrelated-message read, Human-only operation, and credential-isolation tests.
- [ ] 6.8 Pass a real Codex acceptance in which Codex discovers a friend tool, sends a Message, receives the remote text reply in the originating Codex turn, and uses `get_message` after a bounded timeout.
- [x] 6.9 Implement the exact same-Agent self-test authorization, reserved self Session, non-recursive reply, and negative identity/health tests across Cloud, Edge, Host, and MCP.
- [x] 6.10 Accept MCP-reserved request-level `_meta` from Codex without weakening strict tool-argument validation, and add a real loaded-tool regression acceptance.
- [x] 6.11 Make default Message IDs unique across Host restarts and prove a new post-restart request cannot collide with or return a persisted prior reply.
- [x] 6.12 Update the packaged `ask-fabric-agent` skill to use only the minimal MCP tools, remove the competing legacy plugin MCP and publication skill, and add distribution regression coverage against removed entrypoints.

## 7. Friend-Isolated Runtime Processing

- [x] 7.1 Implement the private `(localAgentId, friendAgentId) → RuntimeSession` registry with TTL, serialized same-friend execution, and no cross-friend reuse.
- [x] 7.2 Implement automatic receive-to-Runtime execution and final-text-to-A2A-Artifact reply without requiring receiver-side MCP invocation.
- [x] 7.3 Implement Session loss replacement that preserves Agent/friend isolation and makes no full-history recovery claim.
- [x] 7.4 Enforce text-only P0 Runtime Policy and classify tool, file, network, command, credential, approval, and other side-effect events as `needs_attention`.
- [x] 7.5 Implement the standardized Human-attention reply and Owner notification without approval, continuation, credential entry, or manual response ports.
- [x] 7.6 Add same-friend continuation, cross-friend isolation, concurrent same-friend serialization, Session loss, prompt injection, forbidden operation, Runtime failure, and duplicate execution tests.

## 8. Desktop Interaction and Local Activity

- [x] 8.1 Register and pin the approved independent client dependencies, update NOTICE/SBOM inputs, and prove source policy rejects Multica packages, source markers, branding, assets, and copied UI paths.
- [x] 8.2 Migrate the Desktop build to Electron 43 + `electron-vite` + `electron-builder`, with separate Main, Preload, Renderer, and Host entrypoints and a signed-package smoke path.
- [x] 8.3 Run Agent Host as an Electron `utilityProcess`, implement close-window/menu-bar/stop/logout/full-quit lifecycle semantics, and verify truthful Presence across every transition.
- [x] 8.4 Build Agent Fabric-owned Tailwind 4 semantic tokens and independently generated shadcn/Base UI primitives for typography, surfaces, buttons, fields, dialogs, badges, empty states, skeletons, and Sonner notifications.
- [x] 8.5 Replace the old Messenger navigation with a clean-room desktop shell containing login plus exactly “我的 Agent”, “Agent 好友”, and “消息动态”, with an account and local-connection footer and no copied Multica branding or text.
- [x] 8.6 Implement typed Renderer-to-Main-to-Host commands and subscriptions for Human-only login, publish, stop, invitation, add, remove, and read-only activity access, with no message-send or manual-reply command.
- [x] 8.7 Implement the Host-owned `node:sqlite` store with migrations, WAL, prepared statements, request/reply bodies, status history, verified Agent identity, timing, and allowlisted error/attention reason; keep credentials in async `safeStorage` outside the database.
- [x] 8.8 Implement authenticated Host-to-App immutable snapshots/status subscriptions and restart reconstruction without Renderer networking, UI timers, optimistic completion, fixed replies, or Cloud plaintext history.
- [x] 8.9 Build the Multica-inspired but independently implemented “消息动态” list with source/target Agent, direction, time, elapsed duration, status, empty/loading/error states, and allowlisted reason.
- [x] 8.10 Build read-only local message details and prominent `needs_attention` disclosure without composer, send, reply, approval, resume, or credential input controls.
- [x] 8.11 Add component, IPC, lifecycle, local-store, keyboard/focus, light/dark contrast, and UI-state tests for onboarding, unpublished changes, Runtime unavailable, offline friend, ordered processing, failure, needs attention, restart, injected send/reply command, identity confusion, and private-field rendering.
- [x] 8.12 Capture deterministic screenshots for every P0 page and critical empty/loading/error/online/offline/needs-attention state, then complete product review against the Agent Fabric interaction map without pixel-copying Multica.
- [x] 8.13 Make first successful publication automatically install and readback-verify Codex MCP, keep installation side-effect free, and show retry only when local MCP configuration fails.

## 9. Privacy, Security, and Failure Gates

- [x] 9.1 Add Cloud repository and migration tests proving Message/Artifact bodies, AgentSpec, paths, credentials, Runtime handles, private prompts, and private Skill/MCP configuration have no persistence columns or write paths.
- [x] 9.2 Add logs, errors, metrics, traces, Agent Cards, Presence, tunnel metadata, and backup/static artifact leakage scans for all prohibited fields and unique canary values.
- [x] 9.3 Add TLS/WSS startup validation, credential audience/scope checks, tunnel replacement, stale connection, forged status/result, and Agent identity binding tests.
- [x] 9.4 Add Friendship revocation, invitation replay, Message replay, cross-Agent retrieval, cross-friend Session, prompt-injection, and Renderer injection adversarial suites.
- [x] 9.5 Verify that an offline target fails without a Cloud plaintext queue and that delayed results remain available only in the originating local Host.
- [x] 9.6 Run source policy, dependency boundary, A2A conformance, Runtime Adapter contract, and default-product feature-surface gates.

## 10. Two-Mac Alpha Delivery

- [ ] 10.1 Package, sign, and notarize the macOS App with `electron-builder`, supervised Agent Host utility process, secure local directories, `safeStorage`, start/stop lifecycle, and MCP installation diagnostics.
- [ ] 10.2 Complete first-run interaction QA from Google login through Runtime selection, Agent Card preview, publication, invite exchange, friend online state, and Codex MCP readiness.
- [ ] 10.3 Run a two-real-Mac/two-Google-account acceptance proving publish, invite, friendship, online state, Codex-triggered Message, remote Runtime reply, source Codex result, and both App activity projections.
- [ ] 10.4 Run Alpha failure acceptance for target offline, revoked friendship, Runtime unavailable, timeout/delayed result, forbidden advanced operation, Host restart, and duplicate delivery.
- [ ] 10.5 Inspect both Macs and Cloud storage/logging for prohibited cross-user content, credentials, paths, Runtime Session IDs, and private Agent configuration.
- [x] 10.6 Run `openspec validate minimal-agent-friend-messaging --strict --no-interactive` and `openspec validate agent-fabric-v1-foundation --strict --no-interactive`, reconcile every completed checkbox with evidence, and record the honest Alpha limitations.

## 11. Impeccable Desktop Redesign

- [x] 11.1 Capture confirmed Desktop product truth, operating context, constraints, evidence, accessibility requirements, and deliberate exclusions in `apps/desktop/PRODUCT.md`.
- [x] 11.2 Record the user-selected Multica-inspired clean-room direction and its cross-surface mapping for login, App Shell, 我的 Agent, Agent 好友, and 消息动态, while explicitly rejecting the superseded concept-world comps.
- [ ] 11.3 Produce and approve the comp-first composition set for the selected direction, using real product states and no invented release, privacy, customer, or usage claims.
- [ ] 11.4 Add the selected Impeccable direction contract to the shipped Renderer root and replace Hallmark comments, hidden authority, and tool-specific acceptance wording without weakening source-policy evidence.
- [ ] 11.5 Rebuild the signed-out login and signed-in App Shell so authentication, local Host, Cloud, account, navigation, and product boundaries are understandable without exposing private implementation state.
- [ ] 11.6 Rebuild 我的 Agent, Agent 好友, and 消息动态 with a shared component system and complete loading, empty, busy, online, offline, failed, unpublished, replied, and `needs_attention` coverage.
- [ ] 11.7 Add or update component and interaction tests for keyboard order, visible focus, truthful pending operations, destructive confirmation, reduced motion, status redundancy, narrow layouts, and absence of send/reply/approval commands.
- [ ] 11.8 Capture desktop and mobile-width screenshots, run the Impeccable detector once, complete the independent finish review, and close every material finding or record the explicit disposition.
- [ ] 11.9 Regenerate Agent Fabric `DESIGN.md` from the shipped interface, update visual acceptance evidence, and verify the product tree contains no Hallmark markers or superseded visual-authority references.

## Verification Evidence (2026-08-13)

- `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`, source policy, package-boundary, default-product, MySQL managed-runtime, client-distribution, supply-chain, and development release gates passed.
- The complete automated suite passed with 269 unit tests and 56 contract tests, including Google callback, two-Host routing, exact same-Agent self routing, restart-safe Message identity, minimal plugin distribution, revocation, Runtime isolation, local persistence, typed IPC, lifecycle, restart, injected command rejection, and leakage cases.
- `pnpm --filter @agent-fabric/desktop run capture:personal-ui` built the production Electron entrypoints and captured 11 deterministic login/Agent/friend/activity, empty/loading/error, light/dark, and 320/375/414/768/1280 px states with no document overflow or wrapped buttons. Review is recorded in `docs/personal-agent-ui-review.md`.
- `pnpm --filter @agent-fabric/desktop run package:mac:smoke` produced the arm64 `.app`; its packaged Electron executable loaded `node:sqlite`, and the resources contain the Host utility worker, Codex ACP Adapter, and Personal Agent MCP entrypoint.
- Both strict OpenSpec validations passed. Automated evidence and remaining Human gates are reconciled in `docs/acceptance/minimal-personal-agent-alpha.md`.
- A real one-Mac Alpha path completed Google PKCE login, packaged Codex discovery, Agent Card configuration/preview, immutable publication, online Host/Cloud Presence, encrypted session restoration, and installed-App restart. Startup now shows a loading window immediately and unary Host IPC times out after 30 seconds instead of waiting forever.
- The first Mac persistently enabled `[mcp_servers.agent-fabric]` in `~/.codex/config.toml`; App readback reports `MCP 已启用` and `codex mcp list` reports `agent-fabric` as enabled. First publication now performs atomic install plus readback automatically and exposes retry only after failure. After restarting Codex, the Owner confirmed that a new Codex task could load and invoke the refreshed Agent Fabric MCP; a second account/device is still required for the real friend-message acceptance.
- The final installed package listed `我的 Agent · 自测` as an online `contactType: self` contact without a Friendship. Real installed MCP calls traversed Cloud → same Edge/Host → Codex Runtime, returned `15` for the second-turn `7+8` prompt, and `get_message` read back the same reply without creating a duplicate incoming self-message.
- A real Codex-shaped tool request reproduced and fixed request-level `_meta` rejection while preserving strict unknown argument rejection. The same live check exposed restart-reset `message:1` collisions; the final installed package now emits UUID-backed Message IDs and returned a fresh identity answer instead of the persisted `SELF_TEST_OK`/`15` replies.
- The personal plugin cache and `~/.agents` skill were refreshed from the corrected source. The plugin no longer registers the competing legacy `agent-fabric-mcp` or ships `publish-agent-context`; the verified client tarball contains only the minimal `ask-fabric-agent` skill and its three current tool names.
- Tasks 6.8 and 10.1–10.5 remain open: the installed self-test passed, while a real separate-friend turn and invite exchange still need a second account/device, Developer ID signing/notarization is unavailable, and the two-device failure/privacy drills have not been claimed.
- Tasks 11.3–11.9 remain open: the user has selected the Multica-inspired clean-room direction, while approved compositions, Renderer redesign, new interaction evidence, finish review, and shipped design-system record have not been claimed. Existing Hallmark screenshots and the rejected concept-world comps remain baseline/rejected evidence only until this work replaces them.
