# agent-catalog Specification

## Purpose

定义 Account 下多 Agent 目录、查询与生命周期行为。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

### Requirement: A personal Account can own multiple Agents
The system SHALL allow the authenticated owner of a personal Account to create multiple Agents, SHALL assign each Agent a stable ID and that Human as owner, and MUST NOT allow a friend to create, transfer, edit or own an Agent in another Human's Account.

#### Scenario: Same owner creates a second Agent
- **WHEN** an authenticated owner who already owns an Agent creates another valid Agent
- **THEN** both Agents persist independently in that Human's personal Account and appear in the owned catalog

#### Scenario: One Agent is updated
- **WHEN** one of an owner's Agents is edited or archived
- **THEN** no sibling Agent's configuration, Runtime binding, Presence or friend access mode changes

#### Scenario: Friend attempts creation or ownership mutation
- **WHEN** an active friend submits another Human's Account ID, Agent owner ID or create/update route
- **THEN** the operation is denied generically and no resource or ownership field changes

### Requirement: Agent catalog separates owned and friend-opened scopes
The Agents collection SHALL provide search plus `mine`, `friends` and `archived` scopes with stable counts. `mine` and `archived` SHALL contain only the signed-in Human's Agents; `friends` SHALL contain only active non-archived Agents whose owner is a current friend and whose access mode is `friends`.

#### Scenario: Mine scope is selected
- **WHEN** the signed-in Human selects `mine`
- **THEN** only that Human's non-archived Agents are shown with management and invocation affordances derived independently

#### Scenario: Friends scope is selected
- **WHEN** the signed-in Human selects `friends`
- **THEN** only currently invokable friend-opened Agents are shown as read-only rows, grouped or labeled by their Human owner

#### Scenario: Archived scope is selected
- **WHEN** the signed-in Human selects `archived`
- **THEN** only that Human's archived Agents are shown and no friend's archived or formerly shared Agent is disclosed

#### Scenario: Search and filters combine
- **WHEN** search plus supported filters are active in one scope
- **THEN** rows satisfy the search and every active dimension, while clearing filters restores that scope without querying unrelated Humans

### Requirement: Catalog rows use authority-specific bounded projections
Owned Agent rows SHALL contain the existing management projection needed by visible columns. Friend-opened Agent rows SHALL use a distinct allowlisted projection containing only stable Agent ID, name, description, Human owner display summary, public capability summary, availability and effective friend access. They MUST NOT contain Runtime identity, model, Instructions, Skills, secrets, activity aggregates, workload, configuration version or management actions.

#### Scenario: Friend-opened Agent is online
- **WHEN** an active friend views an Agent with `friends` access and truthful online Presence
- **THEN** the row identifies its owner, describes its public purpose and shows it as callable without exposing implementation or management metadata

#### Scenario: Friend-opened Agent is unbound or offline
- **WHEN** the owner has shared an Agent that currently cannot execute
- **THEN** the row truthfully shows the bounded unavailable state and offers no rebind, Runtime or configuration action

#### Scenario: Friendship or access is revoked
- **WHEN** the owner sets the Agent private or either Human removes the Friendship
- **THEN** the next catalog query omits the row and invalidation removes any cached friend projection

### Requirement: Archive and restore are owner-only reversible lifecycle operations
Only the Agent owner SHALL archive and restore an Agent; archiving MUST prevent new invocation and cancel/finish active work according to policy while preserving configuration and history. Archived Agents MUST remain separately queryable only by their owner.

#### Scenario: Owner archives Agent
- **WHEN** the Agent owner confirms archive
- **THEN** the Agent leaves active owned and friend scopes, enters the owner's archived scope, rejects new MCP/A2A invocation and retains its data

#### Scenario: Agent is restored without Runtime
- **WHEN** the owner restores an archived Agent whose prior Runtime no longer exists
- **THEN** it returns active as `needs_runtime`, remains unavailable to friends and is not falsely shown online

#### Scenario: Friend attempts archive
- **WHEN** a friend submits archive or restore for an opened Agent
- **THEN** the server denies the request without revealing additional Agent state

### Requirement: Batch actions are explicit and owner-safe
The catalog SHALL support keyboard-accessible multi-selection and batch archive/restore only for rows owned by the signed-in Human. Friend-opened rows MUST NOT be selectable for management, and the server MUST validate every target against the same owner.

#### Scenario: Batch includes friend Agent
- **WHEN** a batch request contains a friend-opened or otherwise non-owned Agent ID
- **THEN** the operation fails closed with no unauthorized mutation and no additional private Agent detail
