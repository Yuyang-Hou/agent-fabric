# agent-configuration Specification

## Purpose

定义 Agent 当前配置、Skills 与秘密配置行为。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

### Requirement: Agent detail separates owner management from friend summary
Owned Agent detail SHALL provide Overview, Activity, Capabilities and Settings sections with existing configuration functionality. A friend-opened Agent SHALL use a separate read-only summary containing only public identity, Human owner display summary, public capability summary, availability and effective friend access; it MUST NOT reuse the owner detail payload or expose management tabs.

#### Scenario: Owner detail opens
- **WHEN** the Agent owner opens one of their Agents
- **THEN** Overview loads the management summary and only tabs supported by that Runtime and feature set are shown

#### Scenario: Friend summary opens
- **WHEN** an active friend opens an Agent currently shared with friends
- **THEN** the App shows a bounded read-only summary and no Activity, Runtime, Instructions, Skills, model, environment, custom argument, integration, archive or edit control

#### Scenario: Friend access disappears while open
- **WHEN** Friendship is removed or the owner sets the Agent private while the friend summary is open
- **THEN** the App leaves the summary, removes cached private-adjacent fields and shows a generic no-longer-available state

### Requirement: General behavior configuration is owner-only, validated and concurrent-safe
Only the Agent owner SHALL edit identity, avatar, description, Instructions, model, thinking level, service tier, concurrency, Runtime binding and friend access mode using provider capability catalogs; updates MUST use optimistic concurrency and reject stale writes.

#### Scenario: Owner edits concurrently
- **WHEN** an owner update carries an outdated version/ETag
- **THEN** the server rejects it with the current version and the UI offers review/reload instead of overwriting silently

#### Scenario: Friend submits an update
- **WHEN** a friend sends an update for an opened Agent using a known Agent ID
- **THEN** the server returns generic denial and changes no Agent, Runtime binding or access field

#### Scenario: Unsupported model option is submitted
- **WHEN** a model, thinking level or service tier is not supported by the bound Runtime
- **THEN** the update is rejected without changing any Agent field

### Requirement: Skills remain private owner-managed capabilities
Only the Agent owner SHALL attach, remove and enable Account Skills and inspect/disable eligible Skills discovered from the bound Runtime. Friend projections MUST NOT contain Skill names, descriptions, contents, configuration or counts unless a separately reviewed public capability summary explicitly derives from them without revealing private Skill identity.

#### Scenario: Runtime is offline
- **WHEN** the owner requests inherited Runtime Skills while the Runtime is offline
- **THEN** existing Agent configuration remains visible, discovery shows a retryable offline state and no fabricated Skills appear

#### Scenario: Friend requests Skills
- **WHEN** a friend calls an Agent Skill or capability-management endpoint
- **THEN** access is denied and no Skill existence, content or Runtime metadata is disclosed

#### Scenario: One Skill toggle fails
- **WHEN** an owner per-Skill update is rejected
- **THEN** that Skill returns to the server state without reverting unrelated Skill changes

### Requirement: Secret-bearing configuration uses owner-only audited endpoints
Environment values, MCP headers/tokens and integration credentials MUST be absent from ordinary Agent list/detail and friend payloads. Reveal and update SHALL require the Agent owner, SHALL be audited and SHALL return masked or write-only values where possible.

#### Scenario: Ordinary owner detail is fetched
- **WHEN** the Agent owner loads ordinary detail
- **THEN** the response contains only flags/counts such as configured/redacted and no environment or credential value

#### Scenario: Friend secret reveal is attempted
- **WHEN** a friend calls a secret endpoint for an opened Agent
- **THEN** access is denied, no value or key name is leaked, and an audit event records the denial

#### Scenario: Secret update succeeds
- **WHEN** the Agent owner submits a validated replacement
- **THEN** the value is stored only in the approved Edge/secret boundary, logs remain redacted and ordinary payloads still return summaries

### Requirement: Configuration navigation protects dirty edits
Editable tabs SHALL track dirty state and MUST require save/discard/cancel before route, tab or Agent changes that would lose edits.

#### Scenario: User switches tabs with unsaved changes
- **WHEN** a dirty editor requests another tab
- **THEN** a focused confirmation blocks navigation until the user saves, discards or cancels

#### Scenario: Save fails
- **WHEN** an update fails after the user chooses save
- **THEN** navigation remains blocked, edits remain present and the exact recoverable error is shown
