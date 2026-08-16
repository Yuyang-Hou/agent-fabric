## ADDED Requirements

### Requirement: Agent detail organizes current configuration by user intent
The Agent detail SHALL provide Overview, Activity, Capabilities and Settings sections; Capabilities SHALL include Instructions, Skills and supported MCP/Integrations, while Settings SHALL include General, Access, Environment, Custom Args and provider-specific Runtime Config.

#### Scenario: Agent detail opens
- **WHEN** a member with view access opens an Agent
- **THEN** Overview loads a bounded identity/status summary and only tabs supported by that Runtime, feature set and caller permission are shown

#### Scenario: User cannot edit Agent
- **WHEN** a caller may invoke/view but not manage the Agent
- **THEN** editable controls and secret-bearing tabs are absent or read-only while invocation information remains truthful

### Requirement: General behavior configuration is validated and concurrent-safe
Authorized managers SHALL edit identity, avatar, description, Instructions, model, thinking level, service tier, concurrency and Runtime binding using provider capability catalogs; updates MUST use optimistic concurrency and reject stale writes.

#### Scenario: Two managers edit concurrently
- **WHEN** a second update carries an outdated version/ETag
- **THEN** the server rejects it with the current version and the UI offers review/reload instead of overwriting silently

#### Scenario: Unsupported model option is submitted
- **WHEN** a model, thinking level or service tier is not supported by the bound Runtime
- **THEN** the update is rejected without changing any Agent field

### Requirement: Skills combine Account and Runtime capabilities
Managers SHALL attach, remove and enable Account Skills and SHALL inspect/disable eligible Skills discovered from the bound Runtime; Runtime Skill discovery MUST be scoped to authorized Runtime access and must not copy private Skill contents to Cloud.

#### Scenario: Runtime is offline
- **WHEN** the Skills tab requests inherited Runtime Skills while the Runtime is offline
- **THEN** existing Agent configuration remains visible, discovery shows a retryable offline state and no fabricated Skills appear

#### Scenario: One Skill toggle fails
- **WHEN** a per-Skill update is rejected
- **THEN** that Skill returns to the server state without reverting unrelated Skill changes

### Requirement: Secret-bearing configuration uses dedicated audited endpoints
Environment values, MCP headers/tokens and integration credentials MUST be absent from ordinary Agent list/detail payloads. Reveal and update SHALL require Agent owner or Account owner/admin authority, SHALL be audited and SHALL return masked or write-only values where possible.

#### Scenario: Ordinary detail is fetched
- **WHEN** any authorized viewer loads an Agent
- **THEN** the response contains only flags/counts such as configured/redacted and no environment or credential value

#### Scenario: Unauthorized secret reveal is attempted
- **WHEN** an invoker-only member calls a secret endpoint
- **THEN** access is denied, no value or key name beyond its permitted summary is leaked, and an audit event records the denial

#### Scenario: Secret update succeeds
- **WHEN** an authorized manager submits a validated replacement
- **THEN** the value is stored only in the approved Edge/secret boundary, logs remain redacted and ordinary payloads still return summaries

### Requirement: Configuration navigation protects dirty edits
Editable tabs SHALL track dirty state and MUST require save/discard/cancel before route, tab or Agent changes that would lose edits.

#### Scenario: User switches tabs with unsaved changes
- **WHEN** a dirty editor requests another tab
- **THEN** a focused confirmation blocks navigation until the user saves, discards or cancels

#### Scenario: Save fails
- **WHEN** an update fails after the user chooses save
- **THEN** navigation remains blocked, edits remain present and the exact recoverable error is shown

### Requirement: Agent detail navigation is independent from data loading
Opening an Agent SHALL switch to the target detail route before Cloud detail, activity or Skill queries complete. The Desktop SHALL reuse safe catalog and session-memory data, SHALL load detail fragments independently, and MUST NOT refetch completed fragments only because the user changes detail tabs.

#### Scenario: Agent opens with a cold detail cache
- **WHEN** a user opens an Agent that has a catalog row but no cached detail fragments
- **THEN** the detail route and truthful catalog-based loading header render immediately while detail, activity and Skills load in the background

#### Scenario: One detail fragment is slow or fails
- **WHEN** Agent detail, activity or Skills completes later than another fragment or returns a recoverable error
- **THEN** completed regions render without waiting for the slow fragment and the failed region remains retryable without returning the user to the catalog

#### Scenario: User changes detail tabs or reopens the Agent
- **WHEN** the requested fragment already exists in the current signed-in session cache
- **THEN** the section changes immediately and no duplicate fragment query is issued
