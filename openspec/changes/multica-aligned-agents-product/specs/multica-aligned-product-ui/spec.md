## ADDED Requirements

### Requirement: Product surfaces follow the approved Multica-aligned composition
The signed-in Desktop SHALL use a quiet macOS-oriented App Shell with compact grouped navigation and one inset content plane. Primary destinations SHALL be Agents, Runtimes and Members; account/logout and local connection state SHALL remain secondary. The implementation MUST be Agent Fabric-owned clean-room code.

#### Scenario: Signed-in shell renders
- **WHEN** authentication and bootstrap complete
- **THEN** the current destination, Account identity, connection state and primary action are understandable without exposing internal credentials, IDs or implementation authority

#### Scenario: Historical surface is requested
- **WHEN** an old Personal Agent/Friends/Activity route or default state is opened
- **THEN** it redirects to the new product or displays an explicit migration state and never becomes competing primary navigation

### Requirement: Login is a focused Multica-aligned single task
The signed-out experience SHALL present a centered, restrained login composition with product identity, concise Account purpose, one Google action and real busy/error/retry states. It MUST NOT present email/password, OTP, fabricated claims or decorative product diagrams unrelated to login.

#### Scenario: Login is pending
- **WHEN** Google login has been initiated
- **THEN** duplicate submission is disabled, progress is visible and cancellation/error returns to a usable Google action

### Requirement: Agents collection matches the reference interaction model
The Agents page SHALL provide a collection header and New Agent action; local search; mine/all/archived scope controls with counts; filters; sort; configurable columns where space permits; dense two-line identity rows; status, owner, access, Runtime and recent activity; row actions; multi-selection and complete loading, empty, no-match, error and archived states.

#### Scenario: Typical desktop catalog
- **WHEN** 1–100 Agents load at a supported desktop size
- **THEN** the collection preserves scanable alignment and Multica-equivalent action placement without dashboard cards or per-row layout jumps

#### Scenario: Narrow catalog
- **WHEN** the viewport cannot support every column
- **THEN** identity and status remain visible, secondary data moves behind detail/overflow, and primary creation/search/scope actions remain operable without document-level horizontal scrolling

#### Scenario: Batch mode
- **WHEN** one or more manageable rows are selected
- **THEN** selection state and applicable batch actions replace or augment the toolbar without hiding scope context or enabling unauthorized operations

### Requirement: Create and detail flows preserve Multica-equivalent hierarchy
The method chooser, manual studio, template flow, AI Builder, draft restoration and Agent detail SHALL match the reference's information hierarchy, progressive disclosure, tab organization, sticky/visible primary actions, dirty guards and recoverable feedback while using Agent Fabric content and components.

#### Scenario: Creation method is chosen
- **WHEN** the user selects blank, template or AI Builder
- **THEN** the next surface preserves context, shows the correct primary action and does not mix all methods into one overloaded form

#### Scenario: Detail configuration is unsupported
- **WHEN** the bound Runtime does not support an MCP, Integration or provider-specific setting
- **THEN** the corresponding tab is omitted or explicitly unavailable rather than rendering a nonfunctional control

### Requirement: Runtime and Members management use the same visual system
Runtime list/detail and Members/invitations SHALL use the same collection, row, detail, setting-row, dialog, status and feedback primitives as Agents, with no separate admin-console visual language.

#### Scenario: Destructive operation opens
- **WHEN** deleting a Runtime or removing a member affects Agents
- **THEN** a focused confirmation shows the real impact plan, requires an explicit choice and keeps cancel as a safe keyboard path

### Requirement: Interactive controls use one mature primitive system
The Desktop SHALL implement selection, searchable selection, menus, popovers, dialogs, sheets, checkboxes, tabs, tooltips and labelled fields through the approved Base UI-backed component layer. Product routes MUST NOT independently recreate focus management, outside-click dismissal, keyboard navigation, popup collision handling or dialog modality when an approved primitive exists.

#### Scenario: Selection control opens
- **WHEN** a user opens a finite Select or filterable Combobox with pointer or keyboard
- **THEN** the popup uses the shared visual treatment, exposes the correct accessible name and selected state, supports expected arrow/typeahead or filtering behavior, remains inside the viewport and returns focus to its trigger when closed

#### Scenario: Menu or dialog closes
- **WHEN** a user presses Escape, activates a safe cancel action or dismisses an eligible non-destructive popup
- **THEN** the shared primitive applies the correct dismissal rule and restores focus without leaving a hidden overlay or stale local open state

#### Scenario: A text field receives keyboard focus
- **WHEN** a standalone input or a search input inside a composed control receives visible focus
- **THEN** exactly one aligned focus affordance follows the interactive control boundary without a displaced native outline or clipped content

### Requirement: Collection pages use the available product canvas deliberately
Agents, Runtimes and Members SHALL render inside a shared full-height collection viewport whose header, toolbar, scroll region and truthful footer form one bounded work surface. Low row counts MUST NOT leave an unbounded white region below a short roster, and the product MUST NOT add dashboards, fabricated statistics or unrelated cards merely to occupy space.

#### Scenario: Few collection rows render in a tall window
- **WHEN** a collection contains fewer rows than the available desktop height
- **THEN** the remaining height stays inside the bounded collection viewport, the rows remain compact at the top, and truthful count or selection feedback anchors the bottom edge

#### Scenario: Collection exceeds the available height
- **WHEN** rows no longer fit in the collection viewport
- **THEN** the row region scrolls independently while the page header, primary action, column context and reachable batch feedback remain stable

#### Scenario: A member searches the Members collection
- **WHEN** the member search query changes the visible member rows
- **THEN** the search control, matching rows, pending invitations and truthful footer remain within one bounded collection surface instead of appearing as detached cards

### Requirement: macOS shell preserves native window movement
The Desktop SHALL expose a non-interactive drag region across the unused top title-bar area while keeping navigation and product controls outside that region. The root product frame MUST track the full current Electron content height after launch and resize.

#### Scenario: User drags the top title-bar area
- **WHEN** the user presses and drags an unused point in the top title-bar strip
- **THEN** the macOS application window moves and no underlying control is activated

#### Scenario: User makes the window taller
- **WHEN** the Electron content height increases after launch
- **THEN** the shell and active product canvas stretch to the new bottom edge without leaving an unowned blank band

### Requirement: UI quality is evidence-gated
Before implementation, approved comps SHALL exist for login, Agents, create chooser, manual create, AI Builder, Agent detail, Runtimes and Members. Before acceptance, the shipped product SHALL pass functional state tests, accessibility checks, source-policy, one Impeccable detector pass, bounded screenshot review and a finish verdict at target viewports.

#### Scenario: Visual build claims completion
- **WHEN** implementation is ready for review
- **THEN** deterministic real-state screenshots exist at 1280×800, 1440×900, 1728×1117, 768 and 414 widths for applicable surfaces, with no unresolved material fidelity, overflow, focus, contrast, reduced-motion or state findings hidden

#### Scenario: Screenshot looks correct but behavior is fake
- **WHEN** a visual state is not backed by its real API, permission or Runtime transition
- **THEN** the surface fails acceptance even if its screenshot resembles the reference

### Requirement: Agent Fabric brand mark is globally consistent
The Desktop SHALL use one Agent Fabric-owned monochrome vector mark composed of a soft solid orb and two vertical negative-space eyes. The packaged App icon and every in-product Agent or product-brand glyph MUST derive from the same canonical geometry and MUST NOT retain the superseded robot asset or a generic third-party Bot glyph.

#### Scenario: Packaged and in-product branding render
- **WHEN** macOS displays the App icon or the Desktop renders login, bootstrap, navigation, Agent collection states, Agent detail metadata or Agent impact rows
- **THEN** every surface uses the same mouthless orb-and-eyes geometry with no antenna, face outline, ears, smile or alternate robot silhouette

#### Scenario: The mark appears on light and dark surfaces
- **WHEN** the shared mark is rendered in a supported foreground color over a light or dark product surface
- **THEN** its eyes reveal the actual background, the mark remains legible at 16 px, and no gradient, shadow or separate colored artwork is required

#### Scenario: Packaged icon assets are regenerated
- **WHEN** a release App is packaged
- **THEN** the committed 1024 PNG and `.icns` are generated from the canonical SVG and the packaged App contains that exact `.icns`

### Requirement: Direct-download macOS release candidate is signed, notarized and launchable
The first macOS release candidate SHALL be the Apple Silicon `0.1.0-beta.1` DMG for Bundle ID `ai.agentfabric.desktop`, SHALL use an Agent Fabric-owned non-default application icon, Developer ID Application signing and Hardened Runtime, and MUST be accepted by Apple notarization and carry a validated stapled ticket. Passing this internal trust-chain gate MUST NOT by itself claim external distribution; the first externally distributed beta MUST also satisfy the automatic-update bootstrap requirements below.

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

### Requirement: Packaged Desktop detects and downloads trusted beta updates
The packaged macOS Desktop SHALL use a fixed public GitHub Releases beta channel to check for a newer compatible arm64 version shortly after startup and periodically while running, SHALL download an available update without blocking current Agent or Runtime work, and SHALL provide an explicit manual check independent of Account login. Automatic checks SHALL default to enabled with a local preference; disabling them MUST cancel future scheduled checks without disabling manual checks. Development and unpackaged builds MUST NOT contact the production update feed.

#### Scenario: Packaged App starts with automatic updates enabled
- **WHEN** the updater-enabled packaged App remains running after startup
- **THEN** it performs one non-blocking check after the startup delay, coalesces concurrent triggers, repeats checks at the defined interval and starts at most one download for the selected compatible beta

#### Scenario: User checks manually
- **WHEN** the user activates “检查更新…” before or after login
- **THEN** the App reports checking, up-to-date, downloading, ready or a bounded retryable error using the updater's authoritative result rather than comparing untrusted version strings in the Renderer

#### Scenario: Automatic updates are disabled
- **WHEN** the user disables the local automatic-update preference
- **THEN** startup and periodic timers are cancelled, the preference survives restart, and a later manual check remains available

#### Scenario: App is not packaged
- **WHEN** a development, test or unpackaged Desktop starts
- **THEN** it does not contact the production GitHub update feed or attempt to install a release asset

### Requirement: Update installation is visible, deferrable and coordinated with local services
The Desktop SHALL expose only schema-validated update state and commands to the Renderer. Once a verified update is ready, it SHALL offer “稍后” and “重新启动并更新”, SHALL preserve the ready state when dismissed, and MUST NOT force restart or interrupt current Agent/Runtime work. Installation MUST stop the local Runtime, MCP and Runtime Adapter exactly once before invoking updater replacement and relaunch; update state MUST NOT become an Account message, Agent Activity or Cloud record.

#### Scenario: Download finishes in the foreground
- **WHEN** a compatible verified update finishes downloading while the main window is visible
- **THEN** a global in-App notification shows the target version, sanitized user-visible release summary, “稍后” and “重新启动并更新” without exposing the feed URL, download path, Token or remote HTML

#### Scenario: Download finishes while the App is hidden
- **WHEN** the main window is hidden when the update becomes ready
- **THEN** the operating system receives a local update notification and reopening the App still exposes the same ready action

#### Scenario: User chooses later
- **WHEN** the user dismisses the ready notification
- **THEN** the App continues current work without restarting and applies the update only after a later explicit update restart or user-initiated full quit

#### Scenario: User restarts to update
- **WHEN** the user activates “重新启动并更新”
- **THEN** Runtime, MCP and Adapter shutdown complete exactly once before the verified package replaces the App, the new version relaunches, and the existing login and local product data remain recoverable

#### Scenario: Check, download or installation preparation fails
- **WHEN** the network, metadata, asset, checksum, signature, architecture or graceful-shutdown validation fails
- **THEN** the currently installed App remains launchable, no success state is fabricated, no partial package is installed, and the user receives a bounded retry path

### Requirement: Automatic-update release assets are published atomically
Every updater-enabled macOS beta Release SHALL remain draft until its version-matched arm64 DMG, updater ZIP, channel metadata and blockmap have passed download readback, SHA-512, Bundle ID, Developer ID signing, Hardened Runtime, notarization, staple, Gatekeeper and real packaged N→N+1 update acceptance. Production clients MUST NOT embed private GitHub credentials or observe draft, incomplete, wrong-channel or wrong-architecture releases.

#### Scenario: Update Release is ready to publish
- **WHEN** all required assets and metadata reference the same reviewed version and arm64 build and the isolated packaged update path has completed through relaunch and service recovery
- **THEN** the Release may be made public as one complete beta update set with the same curated Changelog shown by the App

#### Scenario: Update Release is incomplete
- **WHEN** any required asset, hash, metadata reference, signature, notarization result, architecture check, readback or real update acceptance is missing or inconsistent
- **THEN** the Release remains draft and existing clients continue using the previous published version

#### Scenario: First updater-enabled beta is distributed
- **WHEN** Agent Fabric has not previously been provided to external users and the first externally distributed beta is prepared
- **THEN** that beta already contains the updater and becomes the bootstrap baseline for subsequent automatic updates without promising remote migration for earlier internal-only builds
