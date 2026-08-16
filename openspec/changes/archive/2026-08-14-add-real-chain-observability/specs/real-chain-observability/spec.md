## ADDED Requirements

### Requirement: Real A2A asks emit phase observations
The Server and Edge Host MUST emit strict versioned observations for locally owned phases of a real A2A ask. Each observation SHALL contain a monotonic non-negative duration, component, operation, phase, outcome, and a shared one-way Task correlation digest, and MUST NOT change the A2A Message, Task, Context, Artifact, or Agent Card representation.

#### Scenario: Real ask completes
- **WHEN** an authorized requester sends a Message and the Edge Runtime returns a completed Task
- **THEN** Server observations distinguish authorization/routing, tunnel dispatch, task projection, and total time, while Edge observations distinguish intake, Runtime execution, response emission, and total time using the same Task correlation digest

#### Scenario: Real ask fails in a known phase
- **WHEN** authorization, availability, transport, timeout, protocol, Runtime, persistence, or cancellation prevents completion
- **THEN** the owning component emits a failed observation for that phase with an allowlisted stable failure class and code, without serializing the raw exception message or stack

#### Scenario: Runtime fails while the tunnel remains usable
- **WHEN** the Edge Runtime raises a handled authentication, policy, availability, timeout, cancellation, or execution failure after a Task is accepted
- **THEN** the Edge emits a failed Runtime observation and returns a standard failed A2A Task without raw error or partial output, while the tunnel remains available for later Tasks

### Requirement: Edge reconnect lifecycle is observable
The Edge Host SHALL emit bounded connection lifecycle observations for connect attempts, successful connections, disconnects, and scheduled reconnects. Reconnect observations MUST record attempt and bounded delay but MUST NOT record credentials, request headers, server response bodies, raw close reasons, or deployment identity.

#### Scenario: Edge connects successfully
- **WHEN** an Edge establishes and authenticates its outbound WebSocket
- **THEN** it emits a successful connect observation with attempt and connection duration

#### Scenario: Edge disconnects and retries
- **WHEN** a connected Edge loses its channel while the service is not stopping
- **THEN** it emits a stable disconnect failure class and a reconnect-scheduled observation whose delay matches the bounded exponential backoff

#### Scenario: Edge is intentionally stopped
- **WHEN** the local service receives a stop request
- **THEN** it emits no misleading failure or reconnect-scheduled observation after the intentional close

#### Scenario: Restart or another Revision overlaps the target channel
- **WHEN** multiple authenticated Edge channels exist for one Agent, including another Revision or older channels for the requested Revision
- **THEN** the Gateway rejects channels for other Revisions and routes every new Task to the newest generation for the exact requested Agent Revision, while an older matching channel may only finish Tasks that were already pending on it

### Requirement: Observation data is privacy bounded
Every observation MUST be validated against a strict allowlist before serialization. Observations MUST NOT contain Prompt or answer content, ContextCapsules, Tokens, OAuth values, Runtime session handles, absolute paths, raw Task/Message/Context IDs, Principal/Grant/Agent/Revision/Deployment identifiers, environment values, raw errors, or arbitrary extra fields.

#### Scenario: Sensitive values exist in a successful flow
- **WHEN** a successful ask processes credentials, private context, a Prompt, an answer, Runtime state, and routing identifiers
- **THEN** emitted observations contain only the versioned allowlisted fields and a one-way Task correlation digest

#### Scenario: Dependency error contains sensitive text
- **WHEN** a Server or Edge dependency raises an error message containing a Token, path, Prompt, answer, Runtime handle, or remote close reason
- **THEN** the observation contains only its stable mapped failure class and allowlisted code and none of the sensitive text

#### Scenario: Producer attempts an extra field
- **WHEN** an observation producer supplies an undeclared field
- **THEN** strict validation rejects the record before it is written to the ordinary log sink
