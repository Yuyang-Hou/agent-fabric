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
