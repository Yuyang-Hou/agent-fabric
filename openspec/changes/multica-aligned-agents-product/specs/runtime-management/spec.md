## ADDED Requirements

### Requirement: Account exposes a real Runtime catalog
The system SHALL list Account-scoped Runtimes with stable ID, owner, provider, adapter, device summary, visibility, health, supported capabilities and last observation, and MUST distinguish ready, authentication-required, unavailable, offline and checking states.

#### Scenario: Codex Runtime is healthy
- **WHEN** the Edge detects a usable authenticated Codex Adapter
- **THEN** the Runtime appears ready and is selectable by authorized Agent creators

#### Scenario: Provider is not implemented
- **WHEN** a Runtime provider has no working Adapter
- **THEN** it is not presented as selectable or executable even if a placeholder record exists

#### Scenario: Cross-Account Runtime is requested
- **WHEN** a Principal requests another Account's Runtime ID
- **THEN** the server returns a generic not-found/denied response without metadata leakage

### Requirement: Runtime binding permission is independent from Agent invocation permission
Each Runtime SHALL be `private` or `public`; a private Runtime MAY be bound only by its owner or Account owner/admin, while a public Runtime MAY be bound by any active Account member. This check MUST run on create, update, builder switch and rebind.

#### Scenario: Member binds another member's private Runtime
- **WHEN** an ordinary member selects a private Runtime they do not own
- **THEN** Agent creation/update is denied and the draft remains recoverable

#### Scenario: Member binds public Runtime
- **WHEN** an active Account member selects a healthy public Runtime
- **THEN** the binding succeeds without granting Runtime edit or secret access

### Requirement: Runtime deletion unbinds and preserves user Agents
Deleting a Runtime SHALL require an impact plan and confirmation, SHALL stop/cancel active work safely, SHALL set affected user Agents to unbound, and MUST preserve their identity, configuration and activity history.

#### Scenario: Bound Runtime is deleted
- **WHEN** an authorized user confirms deletion of a Runtime used by Agents
- **THEN** the Runtime is removed, affected Agents show `needs_runtime`, and no user Agent is deleted or archived

#### Scenario: Impact changes concurrently
- **WHEN** the set of bound or working Agents changes after the plan is displayed
- **THEN** deletion fails closed and returns a refreshed impact plan

### Requirement: Runtime management is recoverable and observable
The Runtime list/detail UI SHALL support discovery/registration, rename, visibility change, refresh, authentication guidance, delete/unbind and all loading/empty/error/offline states without exposing credentials.

#### Scenario: Runtime requires authentication
- **WHEN** detection reports authentication-required
- **THEN** the UI names the affected Runtime and exact safe recovery action without collecting credentials in Renderer fields
