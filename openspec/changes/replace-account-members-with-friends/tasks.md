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
- [x] 3.8 Restore member-era Builder drafts fail closed as private and discard obsolete invocation targets without blocking Desktop login bootstrap.

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
- [ ] 9.2 Complete real acceptance with two distinct Google Humans/personal Accounts: visible received invitation, accept, active Friendship and no Account ownership change.
- [ ] 9.3 Prove B sees A's friend-opened Agent safe summary in Desktop and MCP, receives a real standard A2A answer, and cannot access A's Runtime/configuration/Activity/secrets.
- [ ] 9.4 Prove private toggle and friend removal immediately remove Desktop/MCP discovery, deny new delivery and deny prior Task reread without Runtime execution.
- [ ] 9.5 Capture approved desktop/narrow screenshots, run the bounded visual/accessibility finish review and reconcile all findings.
- [ ] 9.6 Build the final App/DMG and pass signing, notarization, stapling, Gatekeeper, quarantine first launch and truthful release/changelog gates before publication.
