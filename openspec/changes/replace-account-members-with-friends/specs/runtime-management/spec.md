## MODIFIED Requirements

### Requirement: Personal Account exposes only its owner's Runtime catalog
The system SHALL list Runtimes only for the signed-in Human's personal Account with stable ID, owner, provider, adapter, device summary, health, supported capabilities and last observation. Friends MUST NOT list, query or infer another Human's Runtime, even when one of its Agents is friend-accessible.

#### Scenario: Codex Runtime is healthy
- **WHEN** the owner's Edge detects a usable authenticated Codex Adapter
- **THEN** the Runtime appears ready and is selectable by that owner's Agent creation/configuration flows and local AI Builder

#### Scenario: Provider is not implemented
- **WHEN** a Runtime provider has no working Adapter
- **THEN** it is not presented as selectable or executable even if a placeholder record exists

#### Scenario: Friend requests Runtime
- **WHEN** a friend uses an opened Agent's ID or guessed Runtime ID to query Runtime state
- **THEN** the server returns generic not-found/denied without Runtime identity, device, health, capability or authentication metadata

### Requirement: Runtime binding is owner-only and independent from friend invocation
Each Runtime SHALL be private to its personal Account owner and MAY be bound only by that Human to Agents they own. Agent `friends` access MUST NOT grant Runtime list, bind, edit, refresh, authentication or secret authority.

#### Scenario: Owner binds healthy Runtime
- **WHEN** the owner selects a healthy Runtime from their personal Account during create, update, Builder switch or rebind
- **THEN** the binding succeeds subject to capability and concurrency policy

#### Scenario: Builder executes directly on the selected Runtime
- **WHEN** the owner sends an AI Builder turn with a healthy selected local Runtime
- **THEN** Desktop/Edge MUST invoke that Runtime through the local Runtime Adapter without Cloud Builder orchestration and without exposing Runtime-private state to Renderer or Server

#### Scenario: Friend attempts Runtime binding
- **WHEN** a friend submits another Human's Runtime or Agent identifiers to any binding route
- **THEN** the operation is denied and the local Builder state, Agent and Runtime remain unchanged

### Requirement: Runtime management is owner-only, recoverable and observable
The Runtime list/detail UI SHALL support the owner in discovery/registration, rename, refresh, authentication guidance, delete/unbind and all loading/empty/error/offline states without exposing credentials. It MUST NOT present visibility controls for sharing Runtime with friends or show another Human's Runtime.

#### Scenario: Runtime requires authentication
- **WHEN** detection reports authentication-required
- **THEN** the owner UI names the affected Runtime and exact safe recovery action without collecting credentials in Renderer fields

#### Scenario: Friend opens Runtime route
- **WHEN** a friend navigates to or invokes another Human's Runtime management route
- **THEN** the product returns to an authorized surface with a generic denial and no cached Runtime projection
