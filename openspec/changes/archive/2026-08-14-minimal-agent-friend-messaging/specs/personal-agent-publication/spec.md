## ADDED Requirements

### Requirement: One Personal Agent is bound to a healthy local Runtime
The system SHALL allow each Human Account to configure exactly one Personal Agent by selecting a locally detected Runtime Adapter that passes capability and health inspection.

#### Scenario: Healthy Runtime is selected
- **WHEN** the Owner selects a detected Runtime whose adapter passes health and capability inspection
- **THEN** the App SHALL allow the Owner to continue to Agent Card configuration and SHALL save the provider binding only in the local AgentSpec

#### Scenario: Runtime is unavailable
- **WHEN** a selected Runtime is missing, unauthenticated, incompatible, or unhealthy
- **THEN** the App MUST block publication, show an actionable local error, and MUST NOT register an online Deployment

#### Scenario: Second Personal Agent is requested
- **WHEN** the same Human Account attempts to create another Personal Agent in P0
- **THEN** the system MUST reject the request without modifying the existing Agent or Revision

### Requirement: Owner-configured metadata produces a minimal Agent Card
The Owner SHALL configure the Personal Agent name, description, and public capability tags, and the Edge SHALL project them with system-generated protocol, interface, version, authentication, and `text/plain` input/output fields into a conformant A2A Agent Card.

#### Scenario: Agent Card preview
- **WHEN** the Owner completes valid public metadata
- **THEN** the App SHALL preview the exact public Agent Card projection before publication

#### Scenario: Private configuration is inspected
- **WHEN** the Agent Card, Registry record, logs, errors, or Cloud database are inspected
- **THEN** they MUST NOT contain credentials, absolute paths, Runtime Session IDs, private prompts, private Skill/MCP configuration, or the complete AgentSpec

### Requirement: Publication is gated by local preflight and immutable Revision creation
The system SHALL publish only after validating the AgentSpec, Runtime health, Agent Card conformance, Agent identity, and Cloud registration, and each successful material configuration update SHALL create an immutable Agent Revision under the stable Agent ID.

#### Scenario: First successful publication
- **WHEN** all local and Cloud preflight checks pass
- **THEN** the system SHALL create the first immutable Revision, activate its Deployment, establish Presence, automatically configure and verify the Agent Fabric MCP for Codex, and show the Personal Agent and MCP results truthfully

#### Scenario: Partial publication failure
- **WHEN** any preflight, registration, credential, tunnel, or Runtime check fails
- **THEN** the App SHALL show publication failure, SHALL NOT claim online, and MUST NOT leave a partially active Revision or Deployment

#### Scenario: Republish modified metadata
- **WHEN** the Owner republishes changed public metadata
- **THEN** the system SHALL create a new Revision while preserving the stable Agent ID and historical Revision records

#### Scenario: App is installed before an Agent exists
- **WHEN** the Owner installs or launches Agent Fabric before successful Personal Agent publication
- **THEN** the App MUST NOT modify Codex MCP configuration or claim that an Agent-specific MCP is ready

#### Scenario: Agent publishes but MCP configuration fails
- **WHEN** the immutable Revision and healthy Deployment succeed but preserving, writing, or verifying the local Codex MCP configuration fails
- **THEN** the Agent SHALL remain published, the App SHALL show the MCP failure separately, and the Owner SHALL be able to retry local Codex connection without republishing

#### Scenario: MCP configuration succeeds
- **WHEN** the App writes and verifies the Agent Fabric MCP entry after publication
- **THEN** it SHALL preserve unrelated Codex configuration and SHALL instruct the Owner to restart Codex before expecting the new tools in an existing Codex process

### Requirement: Presence is truthful
The system SHALL project a Personal Agent as online only while the authenticated Host connection is fresh, the active Revision matches, and the selected Runtime remains healthy.

#### Scenario: App window closes but Host remains healthy
- **WHEN** the Owner closes the App window while the background Host and Runtime remain healthy
- **THEN** the Agent SHALL remain online

#### Scenario: Host or Runtime becomes unhealthy
- **WHEN** the Host disconnects, heartbeat expires, active Revision mismatches, or Runtime health fails
- **THEN** the Agent MUST become offline and the system MUST NOT infer online state from cached App data

### Requirement: Owner can stop publication
The App SHALL allow the authenticated Owner to stop the Personal Agent Deployment without deleting its Agent ID, Agent Card history, friendship history, or local AI installation.

#### Scenario: Owner stops the Agent
- **WHEN** the Owner confirms stop
- **THEN** the Host SHALL stop accepting new remote Messages, Presence SHALL become offline, and existing friendships SHALL remain recorded but unusable for delivery until republished

### Requirement: Agent configuration distinguishes public projection from local state
The desktop App SHALL keep Runtime health, Owner-editable public metadata, exact Agent Card preview, publication state, active Revision, and MCP readiness visibly distinguishable, and MUST NOT render Edge-private fields as public Agent information.

#### Scenario: Owner reviews unpublished changes
- **WHEN** valid public metadata differs from the active Revision
- **THEN** the App SHALL mark the changes as unpublished, SHALL preview the next public projection, and MUST NOT claim the active Revision already contains them

#### Scenario: Publication action is unavailable
- **WHEN** Runtime health or required public metadata is invalid
- **THEN** the App SHALL keep publication unavailable, SHALL identify the blocking input or health condition, and MUST NOT hide the reason only in colour or hover content
