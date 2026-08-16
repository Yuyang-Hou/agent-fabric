## ADDED Requirements

### Requirement: Creation offers blank, template and AI Builder methods
The New Agent action SHALL open a Multica-aligned method chooser with blank creation, approved templates and AI-assisted creation; every method MUST produce the same validated Agent create contract.

#### Scenario: User chooses blank creation
- **WHEN** an authorized member selects blank Agent
- **THEN** the studio opens with an unsaved draft, safe private access defaults and only actually bindable Runtimes

#### Scenario: User lacks create authority
- **WHEN** a Principal without Account membership or create permission reaches a create route or API
- **THEN** the operation is denied and no draft, builder session, Skill or Agent is created

### Requirement: Manual draft validates complete Agent configuration
Manual creation SHALL capture identity, description, Instructions, Runtime, model/runtime options, capabilities and access; validation MUST run in both client and server, with the server authoritative.

#### Scenario: Valid manual Agent is created
- **WHEN** all required fields are valid and the selected Runtime remains bindable
- **THEN** one Agent and its declared relationships are committed atomically and the user enters its detail page

#### Scenario: Runtime becomes unavailable
- **WHEN** the selected Runtime goes offline, is deleted or becomes private before submit
- **THEN** creation fails with a field-level recoverable error and the draft is retained

### Requirement: Template creation is transactional
Templates SHALL describe approved defaults and Skill references; selecting a template SHALL import/find referenced Skills and create the Agent in one transaction, without allowing clients to mint server-owned system identity.

#### Scenario: Template creation succeeds
- **WHEN** a valid template and Runtime are submitted
- **THEN** referenced Skills are deduplicated in the Account and one configured Agent is created

#### Scenario: Skill import fails
- **WHEN** any referenced Skill cannot be validated or imported
- **THEN** no partial Agent, Skill association or duplicate Skill remains

### Requirement: AI Builder sessions and user edits are durable
AI Builder SHALL use an isolated server-backed session and an autosaved complete AgentDraft, including unsent user edits, selected Runtime and the last applied assistant proposal. Builder sessions MUST be hidden from normal Agent catalogs and invocation.

#### Scenario: User resumes a draft
- **WHEN** the user reloads, restarts or returns to an unfinished Builder session
- **THEN** the latest server-saved draft and conversation state restore without reapplying an older assistant proposal over newer user edits

#### Scenario: User switches Builder Runtime
- **WHEN** a user selects another authorized healthy Runtime while no builder turn is in flight
- **THEN** subsequent builder turns use the new Runtime and incompatible model selection resets safely

#### Scenario: Builder output is malformed
- **WHEN** the Runtime returns a reply without a valid bounded AgentDraft
- **THEN** the session records a recoverable error, preserves the prior draft and creates no Agent

### Requirement: Draft exit and creation feedback prevent silent loss
Every creation method SHALL warn before leaving a dirty unsaved draft, expose autosave state, disable duplicate submits and distinguish validation, permission, Runtime and network failures.

#### Scenario: Submit is retried after timeout
- **WHEN** the client cannot determine whether create committed
- **THEN** it resolves the idempotency key before allowing another submit and never creates duplicate Agents
