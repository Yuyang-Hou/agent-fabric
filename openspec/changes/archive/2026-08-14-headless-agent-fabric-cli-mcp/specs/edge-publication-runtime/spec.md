## ADDED Requirements

### Requirement: Immutable and private ContextCapsule revisions
Edge Host SHALL validate and store each accepted ContextCapsule as an immutable Agent Revision. Capsules, local absolute paths, Runtime handles, credentials, and private AgentSpec fields MUST remain on Edge and MUST NOT appear in Agent Cards, Control Plane persistence, ordinary logs, or telemetry.

#### Scenario: Valid capsule creates a Revision
- **WHEN** Edge receives a schema-valid bounded ContextCapsule from the local publish flow
- **THEN** it creates a content-addressed immutable Revision and exposes only its approved disclosure summary

#### Scenario: Revision is updated
- **WHEN** the Owner publishes changed context for the same Agent
- **THEN** Edge creates a new Revision while running Tasks remain pinned to their original Revision

#### Scenario: Sensitive data boundary is inspected
- **WHEN** automated leakage tests inspect Agent Cards, Server records, tunnel metadata, logs, and telemetry
- **THEN** no capsule body, credential, absolute path, Runtime handle, or private AgentSpec value is present

### Requirement: Requester and Context session isolation
Edge Session Manager SHALL map each `(Agent Revision, Requester Principal, A2A contextId)` tuple to a private derived Runtime Session. It MUST NOT reuse a Runtime Session across different Requesters, contexts, or Revisions.

#### Scenario: Same Requester continues a context
- **WHEN** the same Requester invokes the same Revision with the same A2A contextId
- **THEN** Edge resumes the tuple's existing valid Runtime Session

#### Scenario: Different Requester calls the same Agent
- **WHEN** another Requester invokes the same Agent and A2A contextId value
- **THEN** Edge creates a separate Runtime Session with no access to the first Requester's turns or artifacts

#### Scenario: Runtime Session cannot be resumed
- **WHEN** the private Runtime Session expired or became invalid
- **THEN** Edge reconstructs a successor from the immutable Revision and allowed context summary or returns an explicit non-recoverable state without attaching another tuple's Session

### Requirement: Headless Edge lifecycle and outbound connectivity
Edge Host SHALL run independently of Codex Desktop and Electron as an installable user service. It MUST initiate authenticated outbound connectivity to the configured Gateway and MUST NOT require a public inbound port.

#### Scenario: Owner closes Codex Desktop
- **WHEN** Codex Desktop is closed but the Edge user service and Runtime are available
- **THEN** authorized remote A2A requests can still reach the Owner Runtime

#### Scenario: Tunnel disconnects
- **WHEN** the authenticated outbound connection is interrupted
- **THEN** Edge reconnects with bounded backoff, Gateway reports the Deployment offline, and no Task is falsely advanced to working or completed

#### Scenario: Device identity is invalid
- **WHEN** Gateway rejects the Edge device credential or instance binding
- **THEN** Edge stops accepting remote work, preserves local state, and reports a re-authentication action through status and doctor commands

### Requirement: Runtime capability and policy enforcement
Edge SHALL re-inspect current Runtime, Skill, and MCP capabilities at publication and before execution, then intersect them with the Agent Revision, Grant, and local policy. Capability growth MUST NOT automatically broaden an existing Grant.

#### Scenario: Required capability remains allowed
- **WHEN** the Runtime exposes a capability present in both Revision and Grant and local policy allows it
- **THEN** Edge may execute it within the configured budget and records only allowed audit metadata

#### Scenario: Capability was removed or policy tightened
- **WHEN** a required capability is absent or no longer allowed
- **THEN** Edge rejects or pauses the Task with a capability mismatch and does not silently substitute broader access

#### Scenario: New local capability appears
- **WHEN** a new Skill or MCP tool becomes available after a Grant was created
- **THEN** existing remote callers cannot use it until the Owner explicitly publishes and grants a compatible scope

### Requirement: Idempotent task intake, cancellation, and revocation
Edge SHALL durably track intake idempotency, Task start state, cancellation intent, and revocation version so that each Task starts at most once and revoked work cannot restart after reconnect.

#### Scenario: Gateway retries a request
- **WHEN** Edge receives duplicate delivery with the same Task and idempotency identifiers
- **THEN** it returns the existing Task projection and does not start a second Runtime execution

#### Scenario: Cancellation arrives before Runtime start
- **WHEN** a valid cancel request is recorded before execution begins
- **THEN** Edge marks the Task canceled and never creates a Runtime turn for it

#### Scenario: Grant is revoked during execution
- **WHEN** Edge learns that the governing Grant version was revoked
- **THEN** it rejects future work, requests cancellation of active execution, and prevents queued or retried copies from starting
