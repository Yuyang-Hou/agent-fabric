## 1. Freeze product authority and contracts

- [ ] 1.1 Obtain product acceptance for the focused Agent-use scope and record `agent-first-use-experience` as the active incremental behavior change in `openspec/CURRENT.md` without replacing the Account Agents authority.
- [ ] 1.2 Add strict domain schemas for the invokable-Agent use projection, local recent-use record, active Task/result state and allowlisted human-readable status.
- [ ] 1.3 Add schema tests proving private Instructions, credentials, Runtime IDs, paths and raw errors cannot enter the use projection or local record.
- [ ] 1.4 Define default-route migration, recent-content retention and secure-storage failure behavior in PRODUCT/ARCHITECTURE before product integration.
- [ ] 1.5 Run strict OpenSpec validation and reconcile every requirement with the accepted product copy and trust model.

## 2. Complete the shared A2A client path

- [ ] 2.1 Expand the invokable-Agent projection with owner display summary, access reason and allowlisted capability labels while preserving shared authorization and cross-Account non-disclosure.
- [ ] 2.2 Extend `AccountAgentTaskView` with standard Context ID and allowlisted status text without exposing history or private Agent data.
- [ ] 2.3 Add idempotent Desktop send support that returns a proven Task receipt and reuses the message identifier after an uncertain response.
- [ ] 2.4 Add standard Task cancellation and input-required continuation using only A2A Task/Context/reference semantics and gate continuation on real support.
- [ ] 2.5 Add client/Control Plane tests for success, non-terminal timeout, input-required, cancel, failed-over-HTTP-200, revoked access, cross-Principal Task guessing and server-restart result unavailability.

## 3. Implement encrypted local recent use

- [ ] 3.1 Define a Host-owned recent-use store port with Account/user scoping, stable record IDs and deterministic 100-record/30-day pruning.
- [ ] 3.2 Implement the Electron `safeStorage` encrypted file store with hashed scope paths, atomic writes and `0700`/`0600` permissions.
- [ ] 3.3 Implement list, upsert, remove-one and clear-all behavior without plaintext fallback when secure storage is unavailable.
- [ ] 3.4 Add restart, expiry, size-bound, account-switch, corrupted-ciphertext, atomic-write and clear-after-restart tests.
- [ ] 3.5 Add filesystem/content scans proving the store excludes credentials, private Instructions, Runtime context, absolute paths and raw errors.

## 4. Add Desktop Host and IPC orchestration

- [ ] 4.1 Add the `use-agents` route and strict Renderer snapshots for accessible Agents, draft request, selected target, active Task and local recent records.
- [ ] 4.2 Add Host commands for target selection, send, authorized Task refresh, cancel, supported continuation, retry, remove recent and clear all.
- [ ] 4.3 Hydrate the use surface from current invokable Agents and the authenticated local record scope without sending draft request text to Cloud.
- [ ] 4.4 Implement bounded polling, duplicate-send suppression, restart recovery and explicit `result-unavailable` state without inferred terminal outcomes.
- [ ] 4.5 Add Host/IPC contract tests for login restoration, navigation, target revocation, offline transitions, logout/account switch and Renderer leakage boundaries.

## 5. Design and build the primary use surface

- [ ] 5.1 Produce and approve deterministic comps for ready, typing, selected, submitted, working, input-required, completed, failed, cancelled, result-unavailable and local-history states at desktop and narrow widths.
- [ ] 5.2 Reorder signed-in navigation to Use Agents, Agents, Runtimes and Members and make Use Agents the default while preserving supported management deep links.
- [ ] 5.3 Build the accessible-Agent chooser with search, owner/access/availability context, local recent suggestions and explicit target confirmation.
- [ ] 5.4 Build the bounded request composer and one-task result plane with truthful A2A state, retry, cancel, supported continuation and copy actions.
- [ ] 5.5 Add visible Use actions to invokable Agent catalog rows and detail surfaces without exposing them for archived, unbound or unauthorized Agents.
- [ ] 5.6 Build per-record and clear-all local-history controls with a concise local-retention disclosure.
- [ ] 5.7 Add keyboard, screen-reader, focus-return, reduced-motion, contrast, narrow-pane and long-content tests for the complete use loop.

## 6. Complete activation and escalation behavior

- [ ] 6.1 Implement distinct activation states for no Agent, owned unbound Agent, member without access, Cloud offline and expired authentication.
- [ ] 6.2 Route authorized creators to real Agent creation and owned unbound Agents to real Runtime setup/rebind without demo data.
- [ ] 6.3 Implement allowlisted input-required and boundary explanations with supported continuation, new-request and another-Agent actions.
- [ ] 6.4 Implement copyable bounded human-handoff guidance and Agent-owner display without adding a messaging/contact domain.
- [ ] 6.5 Add tests proving failure, escalation and activation never invent success, capability, contactability or inaccessible Agent metadata.

## 7. Verify product truth and public release readiness

- [ ] 7.1 Add metadata-only observability for discovery, send, Task transitions, latency, retry and terminal category with automated content/secret exclusion tests.
- [ ] 7.2 Run unit, contract, persistence, API, Edge, A2A, Desktop, accessibility and sensitive-output suites with every new required scenario enabled.
- [ ] 7.3 Complete one real packaged-App journey for an owned Agent and one for a non-owner shared Agent, including revocation on Task reread.
- [ ] 7.4 Verify restart recovery, input-required, cancellation, result-unavailable, local expiry and clear-all against the packaged App rather than fixture-only evidence.
- [ ] 7.5 Update the positioning, trust center, privacy draft, onboarding, README and website copy so every claim matches the accepted real behavior.
- [ ] 7.6 Rebuild the final branded arm64 DMG and rerun source, boundary, default-product, SBOM, signing, notarization, Staple, Gatekeeper, quarantine and first-real-result gates.
- [ ] 7.7 Obtain external-reader and first-time-user acceptance before presenting “有事，先找 Agent” or its final-brand equivalent as the public promise.
