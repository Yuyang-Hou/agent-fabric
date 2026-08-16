## ADDED Requirements

### Requirement: An Account can own multiple Agents
The system SHALL allow any authorized Account member to create multiple Agents, SHALL assign each Agent a stable ID and owner, and MUST NOT enforce a Human-to-Agent uniqueness constraint in Cloud, Edge, persistence, IPC, UI or MCP.

#### Scenario: Same owner creates a second Agent
- **WHEN** an authorized owner who already owns an Agent creates another valid Agent
- **THEN** both Agents persist independently and appear in the appropriate catalog scopes

#### Scenario: One Agent is updated
- **WHEN** one of an owner's Agents is edited or archived
- **THEN** no sibling Agent's configuration, Runtime binding, Presence or access targets change

### Requirement: Agent catalog provides Multica-aligned scopes and query controls
The Agents collection SHALL provide search; `mine`, `all` and `archived` scopes; filters for availability, Runtime, owner, model and effective access; sorts for recent activity, name, runs and creation time; and stable result/count semantics.

#### Scenario: Mine scope is selected
- **WHEN** an active member selects `mine`
- **THEN** only non-archived Agents whose `ownerId` equals that Human are shown and the scope count is derived from the full collection, independent of filters

#### Scenario: All scope is selected
- **WHEN** an active member selects `all`
- **THEN** the collection shows non-archived Agents the member is allowed to view, with management and invocation affordances derived independently

#### Scenario: Search and filters combine
- **WHEN** search plus multiple filter dimensions are active
- **THEN** rows satisfy the search and every active dimension, while clearing filters restores the unfiltered scope without refetching unrelated accounts

### Requirement: Catalog rows are complete bounded projections
Each Agent row SHALL contain identity, description, owner, effective access, Runtime label/binding, lifecycle/availability/workload, last activity and run count needed by the visible columns, and MUST NOT issue per-cell secret or cross-Account queries.

#### Scenario: Agent is unbound
- **WHEN** an active Agent has no Runtime binding
- **THEN** the row shows `needs_runtime` rather than offline and provides a permitted rebind action

#### Scenario: Activity is unknown
- **WHEN** no truthful activity sample exists
- **THEN** last active and runs display an explicit empty value instead of a fabricated time or count

### Requirement: Archive and restore are reversible lifecycle operations
Authorized managers SHALL archive and restore Agents; archiving MUST prevent new invocation and cancel/finish active work according to policy while preserving configuration and history. Archived Agents MUST remain separately queryable.

#### Scenario: Agent is archived
- **WHEN** an authorized manager confirms archive
- **THEN** the Agent leaves active scopes, enters archived scope, rejects new MCP/A2A invocation and retains its data

#### Scenario: Agent is restored without Runtime
- **WHEN** an archived Agent whose prior Runtime no longer exists is restored
- **THEN** it returns active as `needs_runtime` and is not falsely shown online

### Requirement: Batch actions are explicit and authorization-safe
The catalog SHALL support keyboard-accessible multi-selection and batch archive/restore where every target is manageable; the server MUST validate each target in the same Account and MUST NOT partially apply a batch unless the response explicitly reports per-item outcomes.

#### Scenario: Batch includes unauthorized Agent
- **WHEN** a batch request contains an Agent the caller cannot manage
- **THEN** the operation fails closed with no unauthorized mutation and no additional private Agent detail
