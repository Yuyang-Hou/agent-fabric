## ADDED Requirements

### Requirement: Private AgentSpec validation
The Edge Host SHALL validate an AgentSpec against the versioned AgentSpec v1 schema before creating or publishing a revision, and MUST keep local paths, credentials, private instructions, Runtime session identifiers, and private Skill/MCP configuration off the Control Plane.

#### Scenario: Valid local specification
- **WHEN** an Owner submits an AgentSpec containing a supported Runtime, context, capability, policy, exposure, and deployment configuration
- **THEN** the Edge Host accepts the specification and creates an immutable AgentRevision

#### Scenario: Invalid or unsafe specification
- **WHEN** an AgentSpec is missing required fields or requests a capability forbidden by the active policy
- **THEN** the Edge Host rejects it with field-level errors and does not publish any revision

### Requirement: Sanitized Agent Card projection
The system SHALL generate the public Agent Card from an immutable AgentRevision and MUST expose only the approved identity, capability summary, supported interfaces, modes, and security requirements.

#### Scenario: Public projection hides private state
- **WHEN** an Agent Card is generated from an AgentSpec containing an absolute workspace path and Runtime configuration
- **THEN** the Agent Card contains the approved public summary and contains no absolute path, credential, private instruction, or Runtime session identifier

### Requirement: Revision deployment and rollback
The system SHALL separate stable Agent identity, immutable AgentRevision, and device-specific AgentDeployment so an Owner can activate or roll back a revision without changing the Agent ID.

#### Scenario: Activate a new revision
- **WHEN** a new revision passes local preflight and the Owner activates it
- **THEN** the active deployment references the new revision while existing Agent identity and Grants remain unchanged

#### Scenario: Roll back a failed revision
- **WHEN** the Owner selects a previously valid revision after a deployment failure
- **THEN** the deployment returns to that revision without overwriting revision history
