# multica-aligned-product-ui Specification

## Purpose

定义 Multica-aligned Account Agents 的产品界面、交互与发行物验收。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

### Requirement: Product surfaces follow the approved Multica-aligned composition
The signed-in Desktop SHALL use a quiet macOS-oriented App Shell with compact grouped navigation and one inset content plane. Primary destinations SHALL be Agents, Runtimes and Friends; account/logout and local connection state SHALL remain secondary. The implementation MUST be Agent Fabric-owned clean-room code and MUST NOT retain Members as a competing route.

#### Scenario: Signed-in shell renders
- **WHEN** authentication and bootstrap complete
- **THEN** the current destination, personal Account identity, connection state and primary action are understandable without exposing internal credentials, IDs or implementation authority

#### Scenario: Members route is requested
- **WHEN** an old Members route or member detail state is opened
- **THEN** it redirects to Friends or displays an explicit migration state and never exposes role or resource-transfer controls

#### Scenario: Historical Personal Agent surface is requested
- **WHEN** an old single Personal Agent/Friends/Activity route or default state is opened
- **THEN** it redirects to the current product or displays an explicit migration state and never becomes competing primary navigation

### Requirement: Login is a focused Multica-aligned single task
The signed-out experience SHALL present a centered, restrained login composition with product identity, concise Account purpose, one Google action and real busy/error/retry states. It MUST NOT present email/password, OTP, fabricated claims or decorative product diagrams unrelated to login.

#### Scenario: Login is pending
- **WHEN** Google login has been initiated
- **THEN** duplicate submission is disabled, progress is visible and cancellation/error returns to a usable Google action

### Requirement: Agents collection matches the reference interaction model and authority split
The Agents page SHALL provide a collection header and owner-only New Agent action; local search; `mine`, `friends` and `archived` scopes with counts; supported filters/sort/columns; dense identity rows; and complete loading, empty, no-match and error states. Owned rows SHALL expose permitted management actions; friend-opened rows SHALL expose only safe read-only summary and invocation availability.

#### Scenario: Typical owned catalog
- **WHEN** 1–100 owned Agents load at a supported desktop size
- **THEN** the collection preserves scanable alignment and reference-equivalent action placement without dashboard cards or per-row layout jumps

#### Scenario: Friend-opened catalog
- **WHEN** one or more current friends have opened Agents to friends
- **THEN** the Friends scope shows bounded rows with Human owner, public purpose, public capabilities, availability and friend access, and contains no Runtime/configuration/activity/secret or management affordance

#### Scenario: Narrow catalog
- **WHEN** the viewport cannot support every column
- **THEN** identity, Human owner and status remain visible, secondary safe data moves behind read-only detail/overflow, and search/scope actions remain operable without document-level horizontal scrolling

#### Scenario: Batch mode
- **WHEN** one or more owned manageable rows are selected
- **THEN** selection state and applicable batch actions appear without enabling selection or mutation of friend-opened rows

### Requirement: Create and detail flows preserve Multica-equivalent hierarchy
The method chooser, manual studio, template flow, AI Builder, draft restoration and Agent detail SHALL match the reference's information hierarchy, progressive disclosure, tab organization, sticky/visible primary actions, dirty guards and recoverable feedback while using Agent Fabric content and components.

#### Scenario: Creation method is chosen
- **WHEN** the user selects blank, template or AI Builder
- **THEN** the next surface preserves context, shows the correct primary action and does not mix all methods into one overloaded form

#### Scenario: Detail configuration is unsupported
- **WHEN** the bound Runtime does not support an MCP, Integration or provider-specific setting
- **THEN** the corresponding tab is omitted or explicitly unavailable rather than rendering a nonfunctional control

### Requirement: Runtime and Friends management use the same visual system
Runtime list/detail and Friends/friend-invitations SHALL use the same collection, row, detail, setting-row, dialog, status and feedback primitives as Agents, with no separate admin-console visual language. Friends UI MUST contain active friends, incoming invitations and outgoing invitations and MUST NOT contain roles, member resource impact, public search or invitation-token input.

#### Scenario: Friend invitation is received
- **WHEN** an authenticated Human has a pending incoming invitation
- **THEN** Friends shows inviter identity, creation/expiry and explicit accept/reject actions without implying Account membership

#### Scenario: Friend is removed
- **WHEN** either Human opens removal confirmation
- **THEN** the dialog states that future shared-Agent visibility and invocation will stop, requires explicit confirmation and does not request Agent/Runtime transfer

#### Scenario: Runtime deletion opens
- **WHEN** the owner deletes a Runtime used by owned Agents
- **THEN** a focused confirmation shows the real owned-Agent impact plan, requires an explicit choice and keeps cancel as a safe keyboard path

### Requirement: UI quality is evidence-gated
Before implementation, approved comps SHALL exist for login, owned/friend Agent scopes, create chooser, manual create, AI Builder, owner Agent detail, friend Agent summary, Runtimes and Friends/invitations. Before acceptance, the shipped product SHALL pass functional state tests, accessibility checks, source-policy, one Impeccable detector pass, bounded screenshot review and a finish verdict at target viewports.

#### Scenario: Visual build claims completion
- **WHEN** implementation is ready for review
- **THEN** deterministic real-state screenshots exist at 1280×800, 1440×900, 1728×1117, 768 and 414 widths for applicable surfaces, with no unresolved material fidelity, overflow, focus, contrast, reduced-motion or state findings hidden

#### Scenario: Screenshot looks correct but behavior is fake
- **WHEN** invitation, Friendship, friend Agent projection or revocation state is not backed by its real API and permission transition
- **THEN** the surface fails acceptance even if its screenshot resembles the reference

### Requirement: Direct-download macOS artifact is signed, notarized and launchable
The first public macOS artifact SHALL be the Apple Silicon `0.1.0-beta.1` DMG for Bundle ID `ai.agentfabric.desktop`, SHALL use an Agent Fabric-owned non-default application icon, Developer ID Application signing and Hardened Runtime, and MUST be accepted by Apple notarization and carry a validated stapled ticket before distribution.

#### Scenario: Release artifact is verified
- **WHEN** the final arm64 DMG is proposed for website download
- **THEN** strict codesign verification passes for the packaged App, the identifier and Developer ID authority are correct, a non-empty Team Identifier and runtime flag are present, notarization reports `Accepted`, stapler validation succeeds and Gatekeeper accepts the artifact

#### Scenario: Downloaded App launches for the first time
- **WHEN** the final DMG is copied to an isolated download path with a quarantine attribute, mounted, and its App is copied out as a user download would be
- **THEN** macOS permits the signed and notarized App to complete a first launch after any required user confirmation, and the launched Renderer shows the current Account/Agents product rather than a white screen or historical Personal Agent surface

#### Scenario: Release verification fails
- **WHEN** signing, Hardened Runtime, Bundle ID, notarization, stapling, Gatekeeper or quarantined first launch cannot be proven
- **THEN** the artifact is not described or published as the official macOS beta and no secret certificate or notarization credential is emitted in evidence

### Requirement: GitHub releases expose a truthful user-facing changelog
Every published GitHub Release SHALL include a non-empty, version-matched summary generated from reviewed repository Changelog entries, SHALL preserve the same version in the persistent `CHANGELOG.md`, and SHALL keep automatically generated pull-request/contributor details secondary to the curated user-visible summary. Release metadata and generated output MUST NOT expose credentials, OAuth data, certificate identities, internal runtime identifiers or absolute paths.

#### Scenario: Release notes are prepared
- **WHEN** a version matching the root and Desktop package versions has one or more valid unreleased entries
- **THEN** the generator produces deterministic categorized Markdown for that version, updates the persistent history exactly once and provides the same summary for a draft GitHub Release

#### Scenario: Changelog preparation is invalid
- **WHEN** the requested version is empty, mismatches package versions, already exists, has no user-visible entries or contains a malformed or sensitive entry
- **THEN** preparation fails without consuming entries, changing `CHANGELOG.md` or publishing/updating a GitHub Release

#### Scenario: Internal-only pull request is excluded
- **WHEN** a pull request is explicitly marked `changelog:skip` with a reason
- **THEN** GitHub-generated supplemental notes omit it while the curated version summary and full historical Changelog remain unchanged

#### Scenario: Release artifact has not passed acceptance
- **WHEN** Changelog generation succeeds but the signed DMG, notarization, Gatekeeper or quarantined first launch has not passed
- **THEN** the GitHub Release remains draft and MUST NOT be presented as a completed product release
