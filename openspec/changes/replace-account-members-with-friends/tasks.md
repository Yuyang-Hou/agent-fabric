## 1. Establish the new product authority

- [x] 1.1 Create and switch to a dedicated `feature-replace-account-members-with-friends` branch without overwriting the existing dirty icon asset.
- [x] 1.2 Validate this change strictly and reconcile every requirement with proposal/design/tasks before behavior implementation.
- [x] 1.3 Update `openspec/CURRENT.md`, root specs, default-product configuration and authority tests so this change supersedes `multica-aligned-agents-product` without reactivating historical product code.
- [x] 1.4 Update `ARCHITECTURE.md`, README and Desktop PRODUCT/DESIGN to define personal Account ownership, Human Friendship, friend-opened Agents and explicit exclusions.

## 2. Define Human Friendship and personal Account contracts

- [x] 2.1 Replace member/role/invitation contracts with strict Human profile, friend invitation, Friendship and friend summary schemas, including accepted/rejected/revoked/expired invariants.
- [x] 2.2 Change Agent access contracts from Account/member targets to `private|friends` and define distinct owner and friend Agent projections.
- [x] 2.3 Remove member role/removal commands and snapshots from Desktop IPC/client contracts and add incoming/outgoing invite, accept/reject/revoke and friend removal contracts.
- [x] 2.4 Add domain authorization contract tests for owner manage, active-friend invoke, private Agent denial, non-friend denial and immediate revocation.
- [x] 2.5 Add schema leakage tests proving friend projections exclude Account internals, Runtime/model/configuration, Instructions, Skills, activity/workload, secrets and private identifiers.

## 3. Add safe MySQL persistence and migration

- [x] 3.1 Add additive migrations for Human friend invitations and normalized Human Friendships with unique pair, state, version, expiry and audit indexes.
- [x] 3.2 Add the Agent `friends` access representation and migrate legacy `account/targeted` access to `private` without widening authorization.
- [x] 3.3 Change A2A Task persistence to retain target resource Account while allowing an independent origin Human/personal Account across Friendship.
- [x] 3.4 Implement incoming/outgoing invitation list, create, accept, reject, revoke, friend list and friend removal repository transactions with enumeration resistance.
- [x] 3.5 Enforce one product Owner per personal Account while retaining transitional owner membership rows only as internal foreign-key compatibility.
- [x] 3.6 Implement the read-only live-data audit for non-owner memberships/resources/sessions, pending member invitations and legacy non-private access; make unsafe data a deployment stop condition.
- [x] 3.7 Add migration, concurrency, expiry, duplicate pair, self-invite, email mismatch, replay, revocation and sensitive-column persistence tests.

## 4. Replace Account member and authentication APIs

- [x] 4.1 Make Google login always restore/create the Human's personal Account and remove member-join login from current client/Desktop entrypoints.
- [x] 4.2 Add authenticated Human friend invitation/friend APIs with exact request schemas, bounded page semantics, rate limits, audit events and generic denials.
- [x] 4.3 Disable current member list/invite/role/removal mutation routes after the migration gate while retaining a bounded migration error for stale clients.
- [x] 4.4 Add Human-scoped invalidation for invitation, Friendship and friend Agent access/presence changes, with reconnect rebuild from authoritative queries.
- [x] 4.5 Add API tests for registered and not-yet-registered invitees, explicit accept/reject/revoke/remove, no Account switching and no management authority transfer.

## 5. Rebuild Agent, Runtime and configuration authorization

- [x] 5.1 Replace `canManageAgent`/`canInvokeAgent` with owner-only management and owner-or-active-friend invocation using one shared policy module.
- [x] 5.2 Update owned catalog queries to remain personal-Account scoped and add a separate friend-opened catalog query/projection that cannot reuse owner detail payloads.
- [x] 5.3 Make Agent create, archive/restore, configuration, Skills, Activity and secret endpoints owner-only and prove friend denial server-side.
- [x] 5.4 Make Runtime list, binding, mutation, authentication guidance and deletion owner-only; remove Runtime sharing visibility from product contracts.
- [x] 5.5 Update Agent access mutation to atomic `private|friends`, optimistic concurrency and exact invalidation; remove Account/member target replacement.
- [x] 5.6 Add repository/API authorization matrices for owned, active friend, private friend, removed friend, unrelated Human, archived Agent and offline/unbound Agent.

## 6. Enable cross-Account MCP and standard A2A

- [x] 6.1 Update Agent Card/discovery queries so the four-tool MCP returns owned plus friend-opened Agents with the bounded projection and effective access source.
- [x] 6.2 Update A2A send routing and Task creation to accept cross-personal-Account friend access while preserving standard A2A v1.0.1 objects.
- [x] 6.3 Update `get_task` to recheck origin Principal, current Friendship and current Agent access on every read and reject cached results after revocation.
- [x] 6.4 Update Edge/Runtime source isolation so external friend input is untrusted and Runtime Sessions cannot cross source Human or target Agent boundaries.
- [x] 6.5 Preserve exactly `list_agents`, `find_agent`, `ask_agent`, `get_task`; update descriptions/access labels without exposing Friendship management to MCP.
- [x] 6.6 Add contract tests for friend discovery, real/fake A2A completion, offline target, timeout, revoked Friendship, private toggle, guessed Task and sensitive-output redaction.

## 7. Rebuild Desktop Friends and friend Agent experience

- [x] 7.1 Replace the Members route/navigation/snapshot with Friends, active friends, incoming invitations and outgoing invitations.
- [x] 7.2 Implement invite-by-email without roles, received-record accept/reject, sent-record revoke and friend removal with truthful pending/error/retry states.
- [x] 7.3 Remove role chips/editing, member removal impact, resource transfer, invitation token clipboard handling and all member-specific copy/CSS fixtures.
- [x] 7.4 Replace Agent scopes with `mine`, `friends`, `archived`; show friend-opened safe rows in Agent management and keep them out of owner batch actions.
- [x] 7.5 Implement a separate friend Agent read-only summary and remove all Runtime/configuration/Activity/Skill/secret/management affordances.
- [x] 7.6 Replace Agent access controls with owner-only “仅自己/好友可访问” and remove Account/member target selectors.
- [x] 7.7 Remove Runtime visibility sharing controls and ensure Friends/Agents narrow layouts remain keyboard-accessible at 414/768 widths.
- [x] 7.8 Add Desktop IPC/component/accessibility tests for incoming/outgoing states, duplicate actions, friend rows, lost access while open and absence of App messaging.

## 8. Migrate product assets, fixtures and release gates

- [x] 8.1 Replace member fixtures, deterministic screenshots and visual-authority mappings with Friends and friend-opened Agent states while preserving clean-room boundaries.
- [x] 8.2 Update CLI/package documentation, plugin/Skill descriptions and source/default-product gates to the new product without reviving friend-specific MCP tools.
- [x] 8.3 Add compatibility tests proving stale member routes/commands cannot mutate, legacy targets become private and historical Personal Agent code does not become active.
- [x] 8.4 Run full typecheck, lint, unit, contract, migration, API, Desktop, MCP/A2A, source-policy, SBOM, package and strict OpenSpec gates.

## 9. Real acceptance and delivery

- [x] 9.1 Run the read-only target-database migration audit; if real non-owner data exists, stop and obtain explicit approval for the generated resource migration plan.
- [x] 9.2 Build a versioned beta self-test candidate from current `main`; pass signing, notarization, Staple, Gatekeeper, quarantine first launch and update-asset checks; publish it as GitHub Pre-release and install it on the tester's Mac without approving pending final gates.
- [ ] 9.3 Complete real acceptance with two distinct Humans/personal Accounts, one through Google and one through a real delivered ordinary-email code: visible received invitation, accept, active Friendship and no Account ownership change.
- [ ] 9.4 Prove B sees A's friend-opened Agent safe summary in Desktop and MCP, receives a real standard A2A answer, and cannot access A's Runtime/configuration/Activity/secrets.
- [ ] 9.5 Prove private toggle and friend removal immediately remove Desktop/MCP discovery, deny new delivery and deny prior Task reread without Runtime execution; capture approved desktop/narrow screenshots and reconcile the bounded visual/accessibility review.
- [ ] 9.6 After real acceptance, record final delivery evidence, keep any unproven N→N+1 updater gate pending until a later signed beta exists, and approve only the gates actually proven.

## 10. Replace Agent drafts with a local AI Builder session

- [x] 10.1 Replace Desktop draft routes, autosave, restore, server version and conflict retry state with a fresh in-memory Builder session that is discarded on leave or restart.
- [x] 10.2 Replace AgentDraft Client/IPC/Domain commands and methods with local Builder start/turn/close contracts and one final validated Agent create command.
- [x] 10.3 Execute multi-turn Builder inference from Desktop/Edge directly through the selected healthy local Runtime Adapter while keeping Runtime-private state outside Renderer and Cloud.
- [x] 10.4 Make the final create action validate locally, send exactly one complete Agent create request without automatic retry, and navigate to the created Agent detail on success.
- [x] 10.5 Remove `/v1/agent-drafts*`, Cloud Builder-turn orchestration and draft repository code from Server runtime registration and supported client surfaces.
- [x] 10.6 Add a safe persistence retirement migration that stops draft reads/writes while preserving existing tables and rows for rollback; document the separately gated future deletion path.
- [x] 10.7 Update product docs, schemas, fixtures and compatibility checks so no current runtime surface advertises draft IDs, continue draft, restore, autosave or version conflicts.
- [x] 10.8 Add unit/contract/Desktop tests proving no draft network request, local multi-turn success with Cloud unavailable, discard-on-leave, local validation failure with zero create calls and exactly one final create request.
- [x] 10.9 Run strict OpenSpec, typecheck, lint, full unit/contract/migration/Desktop gates and a real local App acceptance with request tracing; do not commit or deploy.

## 11. Add open-source ordinary-email login

- [x] 11.1 Audit Better Auth, Nodemailer and rate-limiter-flexible at exact pinned versions for maintenance, license, advisories, transitive dependencies and runtime behavior; register approved sources in `config/third-party-sources.json` and update source-policy/SBOM inputs before importing them into product code.
- [x] 11.2 Complete a bounded compatibility spike for Express 5, MySQL, Better Auth Google provider, Email OTP plugin, account linking and the PKCE/nonce-bound one-time exchange into Agent Fabric device credentials; if the open-source boundary cannot preserve the security model, stop and reassess the dependency choice instead of hand-writing an authentication protocol.
- [x] 11.3 Add fresh Better Auth schema and one stable Better Auth user-to-Human mapping, then directly replace the custom Google login/session/exchange implementation and client calls; remove obsolete paths without historical account migration, dual reads or stale-client compatibility.
- [x] 11.4 Configure Better Auth for Google and six-digit email codes with five-minute expiry, three attempts, hashed OTP/identifier storage, verified-email-only same-email account linking and fail-closed identity conflicts.
- [x] 11.5 Add Nodemailer SMTP with mandatory production TLS/certificate validation, server-only credentials, bounded timeouts, health-backed `email-otp-login` capability discovery and no production code echo or development transport fallback.
- [x] 11.6 Add persistent rate-limiter-flexible guards for request, resend and verify using both source IP and keyed normalized-email digest; implement sixty-second resend, generic anti-enumeration responses, atomic one-time consumption and redacted audit/observability.
- [x] 11.7 Replace Desktop Main/client/IPC login contracts with unified Google/email-code flows, PKCE/nonce-bound proof exchange and Keychain-only device credential persistence; prove codes, provider tokens, Better Auth sessions and SMTP secrets never enter Renderer snapshots or logs.
- [x] 11.8 Implement the centered email/Continue plus Google login UI and six-digit verification step with validation, countdown resend, back, keyboard/focus/accessibility, loading, generic error, offline and capability-unavailable states at target viewports.
- [ ] 11.9 Add domain, persistence, API and Desktop tests for first login, same-email cross-method identity, invitation lookup, invalid/expired/exhausted/replaced/replayed/concurrent codes, IP/email limits, SMTP failure, provider conflict, logout/recovery and secret redaction.
- [ ] 11.10 Update architecture, product, operations and release documentation for SMTP/Better Auth configuration, security posture and direct cutover; run both strict OpenSpec validations, full project gates, packaged App acceptance and a real-inbox Google/email two-Human acceptance before completing delivery.
