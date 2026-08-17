## MODIFIED Requirements

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
The signed-out Desktop SHALL present one centered login card with an ordinary-email field and Continue action plus a separate Google login action. Email login SHALL progress to one six-digit verification-code step with target context, resend countdown, back action and truthful busy/error states. The surface MUST NOT request or imply a password, and MUST NOT expose internal authentication identifiers or secrets.

#### Scenario: Valid email is submitted
- **WHEN** the Human enters a syntactically valid email and activates Continue while `email-otp-login` is available
- **THEN** the Desktop requests a code once, disables duplicate submission while pending and opens the six-digit code step without claiming authentication is complete

#### Scenario: Code is entered
- **WHEN** the Human enters six digits
- **THEN** the Desktop submits one verification attempt, presents a bounded generic error on failure, and opens the signed-in product only after the one-time proof is exchanged for a valid device credential

#### Scenario: Resend is requested
- **WHEN** sixty seconds have elapsed and the Human activates resend
- **THEN** the Desktop requests one replacement code, restarts the countdown and does not reveal whether the email was previously registered

#### Scenario: Human returns to edit email
- **WHEN** the Human activates the back action from the code step
- **THEN** the transient code is discarded, the email step returns and no authenticated state is retained

#### Scenario: Google login is selected
- **WHEN** the Human activates Google login
- **THEN** the system-browser OIDC flow opens with visible pending/cancel/error feedback and returns through the same one-time device-credential exchange boundary

#### Scenario: Email login is not configured
- **WHEN** Server capabilities omit `email-otp-login`
- **THEN** the Desktop omits the email controls, keeps Google login usable and does not render a dead or development-only code path

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
The method chooser, manual studio, template flow, local AI Builder and Agent detail SHALL match the reference's information hierarchy, progressive disclosure, tab organization, visible primary actions and recoverable feedback while using Agent Fabric content and components. Creation state is current-page local state and MUST NOT expose restoration or Cloud autosave affordances.

#### Scenario: Creation method is chosen
- **WHEN** the user selects blank, template or AI Builder
- **THEN** the next surface opens fresh local state, preserves the correct primary action and does not mix all methods into one overloaded form

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

### Requirement: AI Builder presents a local ephemeral session
The AI Builder UI SHALL present local Runtime selection, multi-turn conversation, generation progress, recoverable current-page errors and a live Agent configuration preview. It MUST NOT display or depend on draft IDs, server versions, autosave state, version-conflict recovery, continue-draft entrypoints or cross-restart restoration.

#### Scenario: Builder is opened fresh
- **WHEN** the owner enters AI Builder
- **THEN** a new empty local session opens without fetching, creating or restoring an Agent draft

#### Scenario: Builder generation fails locally
- **WHEN** the selected Runtime is unavailable, unauthenticated or rejects a turn
- **THEN** the UI preserves the current page input and preview, identifies the affected local Runtime and offers an explicit retry without claiming Cloud draft recovery

#### Scenario: Final create succeeds
- **WHEN** the one final Agent create request succeeds
- **THEN** the UI leaves Builder and opens the created Agent detail without retaining a continue-draft entry
