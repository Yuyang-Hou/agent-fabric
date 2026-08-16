## ADDED Requirements

### Requirement: Human-controlled contact invitation
The system SHALL allow only an authenticated Human Principal to send, accept, reject, block, or revoke a contact invitation, and MUST NOT expose these actions to Agent, ACP, MCP, A2A Task, or message-content execution paths.

#### Scenario: Human accepts an invitation
- **WHEN** the invited human explicitly accepts a pending invitation from the trusted product UI
- **THEN** the relationship becomes active and the two humans may create their 1-to-1 encrypted room

#### Scenario: Agent attempts to accept an invitation
- **WHEN** an Agent or task payload attempts to invoke an invitation acceptance action
- **THEN** the system denies the action, records a policy decision, and leaves the relationship unchanged

### Requirement: Active relationship gates rooms and Agent work
The system MUST require an active, non-blocked contact relationship before creating a shared room, attaching an Agent for the other party to call, or accepting a new Agent task from that contact.

#### Scenario: Active contact invokes an attached Agent
- **WHEN** an active contact submits a valid request to an Agent that its Owner attached to the shared room
- **THEN** the request may proceed to Grant and Edge policy evaluation

#### Scenario: Unknown principal probes a contact or Agent
- **WHEN** a principal without an active relationship searches for the contact, resolves its private Agent, or submits work
- **THEN** the system denies the request without revealing private room, Agent, or relationship details

### Requirement: Revocation blocks future access
The system SHALL make contact revocation effective for all subsequent room and Agent operations, SHALL rotate or replace future room encryption state, and MUST communicate that already delivered history cannot be remotely erased.

#### Scenario: Human revokes an active contact
- **WHEN** either human explicitly revokes the relationship
- **THEN** new messages and Agent tasks are denied, pending work is canceled or rejected, and future room keys are no longer shared with the revoked contact

#### Scenario: Revoked contact reuses previous identifiers
- **WHEN** a revoked contact retries with an old roomId, taskId, contextId, Agent Card, or access token
- **THEN** the system denies the operation without restoring the relationship or exposing new state

### Requirement: Contact relationship isolation
Contact relationships SHALL be scoped to the exact Human Principal pair and MUST NOT implicitly authorize another user, device, organization, or Agent.

#### Scenario: Another account on the same device attempts access
- **WHEN** a different Human Principal uses a device that previously hosted an active contact
- **THEN** the system requires its own relationship and reveals no prior contact or room content
