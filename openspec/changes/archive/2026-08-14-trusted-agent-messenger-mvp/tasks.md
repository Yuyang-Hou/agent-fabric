> **Paused 2026-08-11:** Electron/Matrix Messenger is retained as validated research and an optional future client. The default product path moved to `headless-agent-fabric-cli-mcp`; unchecked tasks below are not the active implementation queue.

## 1. M0 Scope and Supply-Chain Gates

- [x] 1.1 Record the MVP scope ADR for macOS, one-to-one contacts, two Humans, at most one Agent per Human, text-only work, and read-only Runtime policy
- [x] 1.2 Create `docs/third-party-sources.md` with repository, pinned version or commit, license, notice obligations, adopted modules, local modifications, and replacement boundary fields
- [x] 1.3 Add dependency and copied-source policy checks that fail on unregistered provenance, forbidden licenses, missing notices, or direct Multica source inclusion
- [x] 1.4 Record the Matrix Homeserver license/deployment ADR and block commercial Alpha packaging until the selected option is approved
- [x] 1.5 Define package dependency rules that keep Matrix transport, A2A domain, Runtime adapters, Control Plane, and UI replaceable

## 2. M1 Isolated Open-Source Spikes

- [x] 2.1 Build an isolated Matrix JS SDK spike proving Rust Crypto initialization, mandatory E2EE, two accounts, room invitation, offline delivery, device verification, and no plaintext fallback
- [x] 2.2 Build an isolated assistant-ui spike proving two Human plus two Agent identities, Matrix-backed history, progressive Task cards, cancellation, and persistence adapter behavior
- [x] 2.3 Build an isolated ACP `codex-acp` spike proving Runtime detection, authenticated startup, read-only execution, progress events, session resume, cancellation, and failure normalization
- [x] 2.4 Test Paperclip `adapter-codex-local` and `adapter-utils` outside the Paperclip server and document whether stable package-level reuse is viable
- [x] 2.5 Produce a Spike gate report with adopt, wrap, replace, or reject decisions and remove every rejected dependency from the implementation plan

## 3. Product Workspace Foundation

- [x] 3.1 Scaffold the TypeScript workspace modules from the design without importing the frozen Demo API or Store
- [x] 3.2 Configure build, lint, typecheck, unit-test, contract-test, and package-boundary validation for Node.js 20+
- [x] 3.3 Pin official A2A v1.0.1 types or schemas and add conformance fixtures that prohibit private fields inside canonical A2A payloads
- [x] 3.4 Define typed Electron IPC schemas and enforce context isolation, no Node integration in Renderer, and command allowlists
- [x] 3.5 Add deterministic clocks, IDs, crypto fixtures, and Fake transports for repeatable offline and multi-device tests

## 4. Trusted Contacts and Human Authority

- [x] 4.1 Implement Human, Device, and Agent Principal domain types with stable identity and explicit ownership
- [x] 4.2 Implement contact invitation, acceptance, rejection, blocking, revocation, and illegal-transition tests
- [x] 4.3 Implement room and Agent Grant checks that require an active exact Human-pair relationship
- [x] 4.4 Implement Human-only command ports for device verification, Agent attachment, Grant changes, and emergency stop
- [x] 4.5 Prove through IPC, ACP, MCP, A2A, and prompt-injection tests that Agent execution paths cannot invoke Human-only commands
- [x] 4.6 Implement revocation behavior for future messages, queued Tasks, active cancellation, Agent detachment, and truthful historical-data disclosure

## 5. Encrypted Matrix Message Plane

- [x] 5.1 Implement a main-managed isolated Crypto Worker/WebContents that exclusively owns the Matrix client, persistent Rust Crypto IndexedDB store, authenticated command channel, single-instance lifecycle, and secure key handling
- [x] 5.2 Implement one-to-one room creation and fail-closed E2EE readiness checks before any content send
- [x] 5.3 Define and validate the versioned encrypted Agent envelope with canonical A2A payload, idempotency key, Human sender, Agent actor, revision, and signature
- [x] 5.4 Implement Agent signing-key generation, Edge-only storage, Agent Card publication, and receiver-side signature verification
- [x] 5.5 Implement offline sync, ordered processing, local durable inbox, eventId/idempotency deduplication, and restart recovery
- [x] 5.6 Implement device verification and recovery behavior that withholds plaintext from unverified devices
- [x] 5.7 Implement contact/Agent revocation integration with room membership changes and future encryption-key rotation
- [x] 5.8 Add server-state, network-fixture, log, error, and analytics leakage tests for all prohibited plaintext and Edge-private values

## 6. Runtime Contract and Codex ACP Adapter

- [x] 6.1 Define Runtime Adapter operations, capability model, normalized RuntimeEvent union, and AbortSignal semantics
- [x] 6.2 Implement deterministic Fake Runtime behavior for success, progress, multi-turn, cancellation, timeout, error, disconnect, and session loss
- [x] 6.3 Build the shared Runtime Adapter contract suite and make Fake Runtime pass it
- [x] 6.4 Implement the Edge private mapping from roomId/contextId/AgentId to Runtime session with TTL, successor, and isolation rules
- [x] 6.5 Implement the Codex ACP Adapter using the M1-approved `codex-acp` boundary without adding a Paperclip execution dependency or direct App Server driver
- [x] 6.6 Enforce filesystem read-only, network deny, side-effects deny, timeout, token, concurrency, and delegation-depth policy outside Runtime cooperation
- [x] 6.7 Make Codex ACP pass the shared contract, cancellation, auth-failure, process-exit, session-loss, and sensitive-data leakage suites
- [x] 6.8 Extend the Runtime contract and Codex ACP Adapter with bounded resumable-session discovery, opaque Human selection, private existing-thread binding, exact resume, serial ownership, capability rediscovery, and leakage/invalid-binding tests
- [x] 6.9 Add the versioned ContextCapsule contract, authenticated local publication request channel, one-time Human confirmation, new Runtime session seeding, private snapshot binding, capability rediscovery, and replay/leakage tests

## 7. Encrypted Room to A2A Task Bridge

- [x] 7.1 Parse authorized `@Agent` messages into new A2A Tasks only after relationship, room, attachment, Grant, signature, idempotency, and policy checks
- [x] 7.2 Map Runtime progress and terminal results to encrypted standard TaskState updates and Artifact Parts
- [x] 7.3 Implement contextId continuation with a new taskId per work unit and immutable terminal Tasks
- [x] 7.4 Implement cancellation events, Edge AbortSignal propagation, cancellation tombstones, and no-start behavior for offline canceled work
- [x] 7.5 Implement offline submitted status that never claims `TASK_STATE_WORKING` before the target Edge starts execution
- [x] 7.6 Add malformed envelope, forged Agent, revoked contact, detached Agent, cross-room Context, duplicate delivery, and replay tests

## 8. Messenger Product UI

- [ ] 8.1 Build the Electron shell, wire the main-supervised Crypto Worker and Edge lifecycle into the default product entry, and expose a secure minimal main-to-Renderer projection for contacts, rooms, participants, messages, Tasks, and local Runtime state
- [x] 8.2 Build invitation, acceptance, rejection, blocking, revocation, device verification, and truthful history-retention surfaces
- [x] 8.3 Build the room participant UI that distinguishes two Humans and their verified attached Agents with Owner and availability provenance
- [x] 8.4 Build text composition, `@Agent` selection, progressive Task cards, Artifact rendering, follow-up, cancellation, and failure states
- [x] 8.5 Build local Agent detection, capability review, explicit Human attachment, detachment, and emergency-stop flows
- [ ] 8.6 Build onboarding that reaches first encrypted Human-to-Agent result within five minutes on a supported Mac
- [x] 8.7 Add UI tests for identity confusion, loading/offline states, failed crypto, unverified devices, rejected work, and inaccessible Human-only actions
- [x] 8.8 Route local mentions through the production Codex ACP Adapter, keep unacknowledged remote mentions submitted/offline, remove the default Demo Store, and add tests that prohibit timer-driven or fixed-response completion
- [x] 8.9 Build the Human-only existing Codex session picker and publication confirmation, bind Atlas to the selected source session and exact room, show bounded provenance/capabilities, and remove automatic empty-session creation from the acceptance path
- [x] 8.10 Replace the default source-session picker with the one-intent “发布为 Atlas” path, add the `agent-fabric atlas publish-context` CLI and Codex Skill, and show snapshot coverage plus current public Skill/MCP availability without exposing private configuration

## 9. End-to-End Security Acceptance

- [x] 9.1 Create a single-machine two-Human/two-Agent acceptance fixture with independent identities, devices, crypto stores, Agents, and Runtime sessions
- [x] 9.2 Pass the complete invite → encrypted room → attach Agents → `@Agent` → Task → Artifact → follow-up → cancel path
- [x] 9.3 Pass offline request, offline cancellation, reconnect, duplicate sync, device replacement, and Runtime session-loss recovery scenarios
- [x] 9.4 Pass immediate contact revocation, Agent Grant revocation, emergency stop, impersonation, and cross-room isolation scenarios
- [x] 9.5 Run recursive-call, budget, concurrency, timeout, prompt injection, forbidden side-effect, and secret/cwd/session leakage adversarial suites
- [x] 9.6 Validate every third-party dependency, distributable notice, pinned source, SBOM entry, and replacement boundary
- [ ] 9.7 Pass a real desktop acceptance in which a selected Codex source session contains a unique prior fact, Atlas inherits it across first task and follow-up, another room cannot reuse it, and no thread identifier/history/private Skill/MCP configuration reaches UI, logs, Matrix, A2A, or Control Plane
- [x] 9.8 Pass a real local acceptance in which a Codex conversation publishes a partial/compacted capsule through the CLI, one Human confirmation creates Atlas, Atlas recalls its unique fact, invokes an allowed discovered Skill/MCP capability, continues across a follow-up, rejects replay/cross-room reuse, and leaks no capsule body, absolute cwd, credentials, Runtime identifiers, or private capability configuration

## 10. macOS Alpha Delivery

- [ ] 10.1 Package a signed macOS Alpha with secure local data directories, Runtime detection, diagnostics, and uninstall/data-clear guidance
- [ ] 10.2 Add update-channel, rollback, crypto-store backup/recovery, and incompatible-version handling
- [ ] 10.3 Run the two-real-Mac acceptance path without public inbound ports and preserve encrypted offline delivery
- [ ] 10.4 Measure time-to-first-result, Task success/cancel rates, reconnect recovery, and local-only diagnostics without collecting room plaintext
- [ ] 10.5 Run strict OpenSpec validation, reconcile every completed checkbox with test evidence, and record final Alpha limitations
- [ ] 10.6 Prepare a 5–10 user Alpha handoff with one concrete two-person Agent collaboration scenario and feedback rubric

## Verification Evidence (2026-08-10)

- `pnpm run check`: build, lint, typecheck, 92 unit tests, 43 contract tests, source policy, package boundaries, 319-component supply chain, and development release gates passed.
- `pnpm --filter @agent-fabric/desktop run capture:local-runtime`: the visible Renderer sent `@Atlas` through validated preload IPC, Electron Main, the Edge Utility Process, and the production Codex ACP Adapter; the Task completed only after streamed Runtime events and returned the requested real Artifact.
- `pnpm --filter @agent-fabric/desktop run verify:product-live`: a dedicated existing Codex source session was discovered, published to Atlas, resumed with its unique prior fact, and continued through an immediate follow-up; the script emitted `agent-fabric-product-runtime-path-passed` with `inheritedOriginalContext`, `followUpContinued`, and `realArtifact` all true.
- `openspec validate trusted-agent-messenger-mvp --strict --no-interactive`: strict validation passed after the real-Runtime behavior was specified.
- `pnpm run check`: after the context-publication implementation, build, lint, typecheck, 101 unit tests, 43 contract tests, source policy, package boundaries, 319-component supply chain, and development release gates passed.
- `pnpm --filter @agent-fabric/desktop run build:app && node scripts/verify-context-publication-live.mjs`: a compacted ContextCapsule crossed the authenticated local CLI channel, required one Human confirmation, created a new Atlas session, recalled a unique snapshot fact, actually invoked the discovered read-only `$atlas-read-probe` Skill to read a second unknown fact, continued through a follow-up, rejected confirmation replay and cross-room reuse, and emitted `agent-fabric-context-publication-live-passed`.
- `/opt/miniconda3/bin/python .../skill-creator/scripts/quick_validate.py skills/publish-to-atlas`: the user-level `publish-to-atlas` Skill source passed the official validator and its `agents/openai.yaml` metadata was validated before installation.
- Tasks 8.1, 8.6, 9.7, and 10.1–10.6 remain open because production Matrix/Crypto Worker wiring, encrypted first-result timing, full real-Desktop cross-room/leakage acceptance, two-Mac operation, signing, updates, telemetry, and Alpha handoff are not yet complete.
