## 1. Establish the sole product authority

- [x] 1.1 Create/switch to the dedicated `feature-multica-aligned-agents-product` development branch without discarding or overwriting the current dirty worktree, and record the exact reusable changes carried forward.
- [x] 1.2 Update root product/current-goal documentation, `apps/desktop/PRODUCT.md`, default product configuration and contributor entry points so this change is the sole implementation authority and every prior change is marked superseded/read-only.
- [x] 1.3 Add a machine-verifiable product-authority check that rejects the old single-Agent default, the old three-page navigation and implementation work driven by unfinished historical tasks.
- [x] 1.4 Update `ARCHITECTURE.md` current-phase section to describe Account-scoped Agents, Members, Runtimes and thin MCP/A2A while preserving long-term privacy and A2A boundaries and labeling deferred Revision/Deployment concepts as non-current.
- [x] 1.5 Register the fixed Multica research commit and approved evidence paths in the research/source-policy record, keeping the repository outside the product dependency graph.
- [x] 1.6 Extend source-policy tests to reject Multica imports, source/asset fingerprints, brand/copy markers, private paths and copied component/class/token names.
- [x] 1.7 Run `openspec validate multica-aligned-agents-product --strict --no-interactive` and the product-authority/source-policy tests before any behavior implementation.

## 2. Freeze clean-room product and UI compositions

- [x] 2.1 Produce a behavior inventory mapping the fixed Multica Agents list, create methods, Builder, detail sections, Runtime and member flows to Agent Fabric routes, APIs, states and explicit exclusions.
- [x] 2.2 Replace the superseded Personal Agent PRODUCT/DESIGN direction with an Account-scoped Operate-mode brief and Agent Fabric-owned token/component contract; do not copy Multica dimensions or tokens.
- [x] 2.3 Create and obtain product approval for deterministic desktop and narrow comps for signed-out login and the signed-in App Shell with Agents, Runtimes and Members navigation.
- [x] 2.4 Create and obtain product approval for Agents catalog comps covering typical, empty, loading, error, no-match, archived, unbound, offline and batch-selection states.
- [x] 2.5 Create and obtain product approval for the create-method chooser, manual create, template create, AI Builder and restored-draft compositions using realistic product data.
- [x] 2.6 Create and obtain product approval for Agent Overview, Activity, Capabilities and Settings, including dirty, read-only, secret-redacted and unsupported-feature states.
- [x] 2.7 Create and obtain product approval for Runtime list/detail/delete-impact and Members list/invitation/removal-impact compositions.
- [x] 2.8 Record the approved comp paths, Multica comparison matrix and independent design decisions as the mandatory visual authority for implementation.

## 3. Define Account-scoped contracts and persistence

- [x] 3.1 Define strict runtime-neutral TypeScript schemas for Account, Member, MemberInvitation, Runtime, Agent, invocation targets, Skills, BuilderDraft, Presence, workload and activity projections.
- [x] 3.2 Remove `Human → one Agent` and singular Desktop/Host contract assumptions from new schemas; add tests proving one owner can hold multiple isolated Agents.
- [x] 3.3 Add MySQL migrations for Accounts, memberships, invitations, Runtimes, Agents, invocation targets, Skill relationships, Builder drafts and activity indexes with explicit `account_id` scoping.
- [x] 3.4 Add repository interfaces and MySQL implementations for every new entity, including transaction helpers, optimistic version fields, stable pagination and archive queries.
- [x] 3.5 Add database constraints/indexes for active Account membership, unique invitations, stable Agent IDs, valid ownership and invocation-target deduplication without cross-Account references.
- [x] 3.6 Implement a migration that converts the existing Personal Agent into the owner's Account as its first Agent, maps its safe Runtime/public fields and backs up unmappable local data without deleting it.
- [x] 3.7 Add migration rollback/read compatibility tests proving additional Agents are never deleted or silently compressed into the old single-Agent shape.
- [x] 3.8 Add cross-Account repository isolation and sensitive-column leakage tests before exposing any new API.

## 4. Implement authentication and Account members

- [x] 4.1 Adapt the existing Google OIDC flow so first login creates an owner Account and invited login joins the exact Account, with state/nonce/PKCE/session contract tests.
- [x] 4.2 Implement signed-in Account/session bootstrap, restart recovery, expiry handling, logout revocation and explicit Google account selection for subsequent sign-in without deleting Account resources.
- [x] 4.3 Implement member and pending-invitation list APIs with role and Account authorization and generic cross-Account denial.
- [x] 4.4 Implement bounded single-use invitation create, accept, revoke and expiry behavior, keeping invitation secrets out of ordinary payloads and logs.
- [x] 4.5 Implement role updates with last-owner protection and tests for owner/admin/member authority.
- [x] 4.6 Implement member-removal impact planning for owned Agents/Runtimes and require explicit transfer/archive/unbind dispositions.
- [x] 4.7 Implement transactional member removal that resolves ownership, clears invocation targets/subscriptions, revokes credentials/invitations and proves immediate future denial.
- [x] 4.8 Add Account/member audit events and redaction tests before connecting the member UI.

## 5. Implement Runtime management

- [x] 5.1 Define Runtime provider/adapter capability contracts, health states and public/private bind visibility without exposing private adapter handles.
- [x] 5.2 Adapt Codex Runtime discovery and authentication detection into Account-scoped Runtime registration with truthful ready/checking/auth-required/unavailable/offline states.
- [x] 5.3 Implement Runtime list/get/create-or-register/update/refresh APIs with owner/admin authorization and cross-Account isolation.
- [x] 5.4 Implement the shared `canBindRuntime` gate and apply it to Agent create, Agent update, Builder Runtime switch and rebind paths.
- [x] 5.5 Implement Runtime deletion impact planning with a concurrency token covering bound and active Agents.
- [x] 5.6 Implement confirmed Runtime deletion that cancels/settles active work, unbinds user Agents, preserves their configuration/history and deletes no user Agent.
- [x] 5.7 Add Fake Runtime contract tests for detection, capability mismatch, offline/recovery, concurrent Agents, cancellation and authentication-required behavior.
- [x] 5.8 Add Runtime secret, absolute-path, session-ID and credential leakage tests before Runtime product integration.

## 6. Implement multi-Agent catalog and lifecycle

- [x] 6.1 Implement Account-scoped Agent create/get/update/list repositories and APIs with stable owner identity and no `single-agent-only` index or error path.
- [x] 6.2 Add a contract test creating at least three Agents for one owner and proving independent identity, configuration, Runtime binding, Presence and access.
- [x] 6.3 Implement `mine`, `all` and `archived` collection scopes with full-set counts and stable Account isolation.
- [x] 6.4 Implement search plus availability/Runtime/owner/model/access filters and last-active/name/runs/created sorts with deterministic tie-breaking.
- [x] 6.5 Implement bounded Agent row projections that join owner, effective access, Runtime, Presence, workload and activity without per-row secret/N+1 queries.
- [x] 6.6 Implement archive and restore with active-task handling, new-invocation denial, history preservation and `needs_runtime` restoration behavior.
- [x] 6.7 Implement authorization-safe batch archive/restore with explicit atomic or per-item response semantics and stale-selection handling.
- [x] 6.8 Remove or isolate every production `single-agent-only`, singular `agent` snapshot and Human-to-Agent map; keep migration-only adapters explicitly named and tested.

## 7. Implement Agent access, Presence and activity

- [x] 7.1 Implement one Account-domain `canManageAgent`, `canInvokeAgent` and `effectiveAccessScope` module used by repositories, APIs, A2A and MCP.
- [x] 7.2 Implement atomic permission-mode and full invocation-target replacement with Account/member validation and deny-by-default migration behavior.
- [x] 7.3 Add authorization matrix tests for owner, admin, ordinary member, Account target, exact member target, removed member, archived Agent and cross-Account Principal.
- [x] 7.4 Implement Edge heartbeat and Runtime health aggregation into online/unstable/offline Presence with freshness and binding-match checks.
- [x] 7.5 Implement workload aggregation from real queued/working A2A Tasks and lifecycle/needs-runtime precedence.
- [x] 7.6 Implement terminal Task activity buckets, 30-day run counts and recent activity with explicit unknown/empty behavior.
- [x] 7.7 Add WebSocket/IPC invalidation events for Agent, Runtime, Presence, workload, access and activity changes with Account/resource-scoped cache tests.
- [x] 7.8 Add revocation, stale heartbeat, HTTP-200 failed Task and activity privacy/leakage acceptance tests.

## 8. Implement Agent creation methods

- [x] 8.1 Define one strict AgentDraft schema, validation result and idempotent create command shared by blank, template and AI Builder flows.
- [x] 8.2 Implement manual creation validation for identity, Instructions, Runtime, model options, Skills, access and stale Runtime/permission recovery.
- [x] 8.3 Implement the template catalog and transactional template creation with Skill find-or-create/deduplication and rollback tests.
- [x] 8.4 Implement isolated hidden Builder sessions that cannot appear in catalogs, access queries, MCP discovery or A2A invocation.
- [x] 8.5 Implement Builder Runtime switching with ownership/bind checks, no in-flight turn race and incompatible model reset.
- [x] 8.6 Implement complete server-owned Builder draft autosave, reload/restart restoration and last-applied-assistant tracking that preserves newer user edits.
- [x] 8.7 Implement bounded AI Builder output parsing/validation and recoverable malformed/timeout/offline handling without partial Agent creation.
- [x] 8.8 Add idempotency and uncertain-submit resolution tests proving retry never creates duplicate Agents.

## 9. Implement Agent detail and configuration

- [x] 9.1 Implement versioned/ETag Agent updates for identity, Instructions, model, thinking, tier, concurrency and Runtime binding with stale-write tests.
- [x] 9.2 Implement Account Skill attach/remove/enable APIs and Runtime Skill discovery/disable APIs with per-skill failure isolation.
- [x] 9.3 Implement provider capability catalogs and reject unsupported model/thinking/tier/Runtime-config combinations atomically.
- [x] 9.4 Implement regular Agent detail redaction summaries for environment, Agent-side MCP and integrations without returning secret values.
- [x] 9.5 Implement dedicated audited reveal/update endpoints for environment and credential-bearing configuration with owner/admin checks and masked/write-only responses.
- [x] 9.6 Implement Agent-side MCP and integration configuration only for supported providers/features, preserving the distinction from Agent Fabric's Codex-facing MCP.
- [x] 9.7 Add configuration data-residency tests proving credentials, environment values, cwd, Runtime handles, private Skill contents and raw internal errors stay outside Cloud payloads, Renderer snapshots and logs.
- [x] 9.8 Add concurrent update, Runtime deletion/rebind, member removal and archived-Agent configuration contract tests.

## 10. Implement Codex MCP over standard A2A

- [x] 10.1 Replace the default friend-specific MCP contract with exactly `list_agents`, `find_agent`, `ask_agent` and `get_task`, using strict schemas and actionable descriptions.
- [x] 10.2 Authenticate MCP with an independent local least-privilege credential bound to the current Account Principal and add expiry/revocation tests.
- [x] 10.3 Implement `list_agents` and `find_agent` against the shared `canInvokeAgent` query, hiding inaccessible Agent existence and private configuration.
- [x] 10.4 Implement `ask_agent` through the shared standard A2A Client using dynamic current Agent Card projection, bounded wait and standard Task/Artifact normalization.
- [x] 10.5 Implement `get_task` with origin Principal, Account, target Agent and current-access checks plus timeout continuation behavior.
- [x] 10.6 Add MCP/A2A tests for online success, working/input-required timeout, offline, archived, unbound, access revoke, HTTP-200 failed Task and non-text Artifact.
- [x] 10.7 Update the packaged Codex plugin/Skill and installer to advertise only the new tools and avoid requiring a current local Agent identity or Friendship.
- [x] 10.8 Run a sensitive-output scan over MCP results/errors and prove no token, invitation, environment value, private Instruction, path, Runtime session ID or private Skill/MCP configuration can escape.

## 11. Rebuild Desktop foundations and core surfaces

- [x] 11.1 Replace the singular Personal Agent IPC/Snapshot with strict Account-scoped collection/detail/query/mutation contracts where every mutation carries a target resource ID.
- [x] 11.2 Rebuild the signed-out login and signed-in macOS-oriented App Shell from approved comps with Agents, Runtimes and Members routes, account menu and truthful connection state.
- [x] 11.3 Build Agent Fabric-owned collection, toolbar, row, table, status, form, setting-row, tabs, dialog, popover, skeleton, empty/error and dirty-guard primitives from the approved design contract.
- [x] 11.4 Build the Agents catalog against real APIs with search, scopes/counts, filters, sorts, column choices, virtualization where needed, row actions and batch selection.
- [x] 11.5 Build the create-method chooser, manual creation and template flows against real validation, permission, Runtime and idempotency states.
- [x] 11.6 Build AI Builder and draft restoration against real session/autosave APIs with streaming/pending/error/retry and dirty-exit behavior.
- [x] 11.7 Build Agent detail Overview and Activity against real Presence/workload/activity data and bounded access projections.
- [x] 11.8 Build Agent Capabilities and Settings tabs, secret reveal/update boundaries, unsupported-feature gating and dirty navigation guards.

## 12. Build Runtime and Members product surfaces

- [x] 12.1 Build Runtime catalog and detail against real detection/status/capability APIs with search/filter, refresh, edit visibility and authentication guidance.
- [x] 12.2 Build Runtime delete/unbind impact dialog with refreshed concurrency plan, active-work disclosure and truthful completion/failure behavior.
- [x] 12.3 Build Members and pending invitations collection with search, roles, invite creation/revocation and permissions.
- [x] 12.4 Build role editing and member-removal impact/disposition flows with last-owner and stale-plan errors.
- [x] 12.5 Add Account popover, logout, session-expiry recovery and first-login/first-Agent empty-state activation flow.
- [x] 12.6 Add shared loading, no-data, no-match, forbidden, offline, auth-required, failed and retry states for every new route.
- [x] 12.7 Add keyboard order, visible focus, screen-reader labels, status redundancy, dialog focus return, reduced motion and touch-target tests across all surfaces.
- [x] 12.8 Add 414/768 narrow-layout behavior where collection/detail becomes one pane at a time and no primary action or content causes document-level horizontal scrolling.

## 13. Migrate and remove superseded default paths

- [x] 13.1 Wire the data migration and first-run recovery UI, including backup status and prompts for private fields that could not be safely mapped.
- [x] 13.2 Switch packaged Desktop, CLI help, default config and documentation to the new Account/Agents product in one controlled change.
- [x] 13.3 Remove default registrations and references for the old Personal Agent/Friends/Activity Renderer, singular IPC and friend-specific MCP tools after migration tests pass.
- [x] 13.4 Remove dead single-Agent Cloud/Edge stores and routes that have no migration role, preserving reusable Google/A2A/Runtime primitives.
- [x] 13.5 Add regression tests proving historical routes cannot silently become the default and old credentials cannot bypass new Account/Agent authorization.
- [x] 13.6 Verify package boundaries, third-party sources, SBOM and NOTICE after dependency and product-tree changes.
- [x] 13.7 Physically delete superseded Personal Agent/Friends, Messenger/Matrix, Atlas/ContextCapsule, old Control Plane/PostgreSQL/Compose, legacy CLI publication, dedicated Spike and historical design/evidence files from active roots; retain only archived OpenSpec, Git history and `docs/history/README.md`, and add a gate proving they cannot return.

## 14. Functional, security and visual acceptance

- [x] 14.1 Run unit, contract, persistence, migration, API, Edge, A2A, MCP, Desktop component and accessibility suites with no skipped required scenario.
- [x] 14.2 Pass cross-Account isolation, member removal/revocation, Runtime unbind, multi-Agent session separation, concurrency, offline/cancel and sensitive-data leakage acceptance.
- [ ] 14.3 Run the updated isolated real-path self-test against a selected accessible Agent and prove MCP discovery, standard A2A answer, cleanup and post-revoke denial.
- [ ] 14.4 Complete real acceptance with one Account containing multiple members, multiple Agents and at least two Runtime-binding states, including a non-owner Codex MCP question to an authorized Agent.
- [x] 14.5 Capture deterministic screenshots for approved real states at 1280×800, 1440×900, 1728×1117, 768 and 414 widths and compare hierarchy, density, action placement and transitions against approved comps/reference mapping.
- [x] 14.6 Run the Impeccable detector exactly once over changed UI targets, apply one batched material-finding fix, recapture once and obtain a final finish-review verdict with unresolved findings explicitly dispositioned.
- [x] 14.7 Regenerate `DESIGN.md` from the shipped implementation and update PRODUCT, interaction maps and UI evidence so documentation describes the final product rather than intention.
- [x] 14.8 Run `openspec validate multica-aligned-agents-product --strict --no-interactive` plus current release/source/package/default-product gates; archived legacy changes and historical commercial gates are not current validation inputs.
- [x] 14.9 Verify the packaged artifact and installed Codex MCP path, not only repository builds, and record exact versions, commands and redacted evidence.
- [ ] 14.10 Obtain product acceptance that Multica Agents capability/interaction parity and the unique Codex MCP→A2A path meet the stated goal before marking this change complete.

## 15. Prove the first direct-download macOS beta candidate

- [x] 15.1 Set Desktop release version to `0.1.0-beta.1`, replace the Electron default icon with the Agent Fabric-owned 1024×1024 robot mark and generate the macOS `.icns` asset.
- [x] 15.2 Configure the `ai.agentfabric.desktop` arm64 build for Developer ID Application signing, Hardened Runtime and a signed DMG without committing personal certificate, Team or notarization secrets.
- [x] 15.3 Add a deterministic release workflow that verifies the final App and DMG, submits notarization through the `agent-fabric-notary` keychain profile, waits for `Accepted`, staples and validates the ticket, and runs Gatekeeper assessment.
- [x] 15.4 Build the real `0.1.0-beta.1` arm64 DMG and record redacted evidence for strict codesign, authority/identifier/team/runtime, notarization, stapler and Gatekeeper checks.
- [x] 15.5 Copy the final DMG to an isolated quarantine-tagged download path, mount and copy the App, complete a real first launch with the current Account/Agents Renderer, and record the result without exposing credentials or local private paths.
- [x] 15.6 Re-run the current strict OpenSpec validation plus release/source/package/default-product gates, commit the complete development branch and push the intended personal release source without modifying the company remote.

## 16. Add the GitHub Changelog release module

- [x] 16.1 Define the user-visible Changelog entry format, category order, sensitive-content boundary and contributor workflow without adding a runtime dependency.
- [x] 16.2 Implement deterministic `check`, `preview` and `prepare <version>` commands with package-version matching, duplicate/empty rejection and atomic failure behavior.
- [x] 16.3 Add `CHANGELOG.md`, backfill the verified `0.1.0-beta.1` release-candidate summary without claiming external distribution, and prove the generated version body matches the persistent history.
- [x] 16.4 Add `.github/release.yml`, the pull-request Changelog prompt and GitHub Actions validation/preview using least-privilege permissions and no Apple credentials.
- [x] 16.5 Add automated tests for valid generation, malformed/sensitive entries, version mismatch, duplicate version, empty release and deterministic output without consuming inputs on failure.
- [x] 16.6 Validate the current OpenSpec and Changelog gates, generate a real next-version preview, then verify the module is present on the personal GitHub repository without modifying the company remote.

## 17. Make Agent detail navigation immediate

- [x] 17.1 Add Desktop Host and Renderer tests proving the detail route opens before Cloud fragments settle, completed fragments update independently, and tab changes do not refetch Agent data.
- [x] 17.2 Add signed-in per-Agent memory reuse for detail, activity and Skills, render a truthful catalog-based loading header, and keep fragment failures locally retryable.
- [x] 17.3 Run focused Desktop tests, typecheck and strict OpenSpec validation for the incremental detail-loading behavior.

## 18. Replace rough handwritten Desktop controls and collection layout

- [x] 18.1 Register the approved Base UI, shadcn/ui Base UI source recipes and stable TanStack Table React dependency, then build one shared Agent Fabric component layer without a parallel primitive system.
- [x] 18.2 Replace native Selects and handwritten account/row menus, popovers, dialogs, sheets, checkboxes, tabs, tooltips and field labelling across the signed-in product with the shared mature primitives.
- [x] 18.3 Rebuild Agents, Runtimes and Members around one full-height collection viewport and stable TanStack Table state while preserving server query truth, permissions, compact rows and 414/768 behavior.
- [x] 18.4 Add focused component and Renderer tests for keyboard operation, focus return, dismissal, searchable selection, low/high row counts, bounded scrolling and existing real mutation behavior.
- [x] 18.5 Run Desktop tests and typecheck, strict OpenSpec/source-policy validation, recapture target viewports and inspect the real App with low-count collections before recording acceptance evidence.

## 19. Finish Desktop collection geometry and macOS shell behavior

- [x] 19.1 Specify one aligned shared focus treatment, a composed Members collection, full-window root sizing and a safe macOS title-bar drag region.
- [x] 19.2 Implement the shared focus shell, integrated Members collection, resize-safe full-height canvas and cross-window drag region.
- [x] 19.3 Add focused Renderer coverage for the drag region and Members collection composition without regressing mature controls.
- [x] 19.4 Run focused Desktop tests, typecheck and strict OpenSpec validation, then inspect the rebuilt real App at a tall viewport.

## 20. Unify the Agent Fabric mark and ship the next Desktop beta

- [x] 20.1 Record the approved mouthless orb-and-eyes geometry, monochrome inversion behavior and global replacement surfaces in the current design and UI specification.
- [x] 20.2 Implement one shared in-product SVG mark and replace every generic Agent/product `Bot` glyph without disturbing unrelated Lucide utility icons.
- [x] 20.3 Replace the canonical release SVG and regenerate the committed 1024 PNG and macOS `.icns` from that source.
- [x] 20.4 Add focused Renderer and asset checks proving the same mark is used across login, bootstrap, navigation, Agent surfaces and the packaged icon path.
- [x] 20.5 Advance root and Desktop versions to `0.1.0-beta.2`, prepare the reviewed Changelog and build the complete Desktop and server products.
- [ ] 20.6 Run strict OpenSpec, source, package, test and release gates for the completed mark work, but keep the beta Release draft and unpublished until every automatic-update gate in section 21 is complete.

## 21. Add trusted Desktop automatic updates before first external beta

- [x] 21.1 Register and pin the selected updater dependency and public GitHub Releases beta provider in third-party/source policy, keeping production owner, repository, channel and packaged-only activation explicit and preventing Renderer or Account Server feed overrides.
- [x] 21.2 Extend the arm64 macOS release build to generate one version-matched signed/notarized App, DMG, updater ZIP, beta channel metadata and blockmap, with deterministic names, SHA-512 references and draft-asset validation.
- [x] 21.3 Implement a main-process updater state machine with default-enabled atomic local preferences, startup and hourly single-flight checks, automatic download, manual check and bounded failure states while disabling library-driven automatic quit/install.
- [x] 21.4 Add strict preload IPC, application-menu manual checking, sanitized Renderer state, a global ready notification and a local system notification for hidden-window completion without exposing feed URLs, file paths, Tokens, remote HTML or Account/Agent activity side effects.
- [x] 21.5 Integrate “稍后 / 重新启动并更新” with the Desktop lifecycle so current work is never forcibly interrupted and explicit install or full quit stops Runtime, MCP and Adapter exactly once before updater replacement and relaunch.
- [x] 21.6 Add focused main/preload/Renderer/lifecycle tests for timers, preferences, manual checks, concurrent triggers, destroyed windows, notification persistence, shutdown ordering, retryable network/asset failures, wrong channel/architecture rejection and sensitive-data leakage.
- [x] 21.7 Extend the draft GitHub Release workflow and release gates to upload and read back the complete update asset set, reject partial or inconsistent versions/hashes/signatures, and publish no private GitHub credential in the App or evidence.
- [ ] 21.8 From an isolated installed updater-enabled baseline and test feed, complete a real signed N→N+1 detection, download, notification, graceful Runtime/MCP shutdown, replacement, relaunch, login/data preservation and service recovery; then run all strict OpenSpec/source/package/test/release gates, publish the first external beta as the updater bootstrap baseline, and verify the public channel exposes only the intended complete arm64 Release.
