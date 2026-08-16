## ADDED Requirements

### Requirement: Authenticated principals and devices
Control Plane SHALL authenticate Human, Device, Agent, and service principals with distinct credential types and scopes. Authentication and authorization decisions MUST bind requests to the configured Server instance and MUST fail closed on expiry, revocation, or audience mismatch.

#### Scenario: Registered device authenticates
- **WHEN** a device presents a valid instance-bound credential
- **THEN** Control Plane resolves its Principal, scopes, Owner relationship, and current revocation version

#### Scenario: Credential crosses instances or roles
- **WHEN** a credential issued for another Server instance or principal role is presented
- **THEN** authentication is rejected without revealing whether the target Agent exists

### Requirement: Agent registry, deployment, and card projection
Control Plane SHALL maintain stable Agent identities, immutable public Revision metadata, Deployment presence, and A2A Agent Cards. Agent Cards MUST contain only the Owner-approved capability projection and supported standard interfaces.

#### Scenario: Authorized Agent becomes discoverable
- **WHEN** an active Deployment registers a valid public Revision projection
- **THEN** authorized Requesters can discover exactly one routable projection per Agent Revision containing its stable Agent ID, effective Grant ID, intersected capabilities, current availability, and supported authentication scheme

#### Scenario: Private fields are submitted
- **WHEN** registration metadata includes a capsule body, absolute path, Runtime Session ID, credential, or undeclared field
- **THEN** registration is rejected and the private value is not persisted or logged

#### Scenario: Unauthorized discovery is attempted
- **WHEN** a Requester searches without a discovery Grant
- **THEN** the Server returns no private Agent metadata and does not disclose existence through distinguishable errors

### Requirement: Scoped grants and immediate revocation
Control Plane SHALL evaluate every discovery, send, get, list, and cancel operation against an active scoped Grant and SHALL propagate monotonically versioned revocation to Gateway and Edge.

#### Scenario: Request matches a Grant
- **WHEN** Requester, Agent, capability, time window, and budget all match an active Grant
- **THEN** the operation is authorized with the exact effective scope attached to internal routing metadata

#### Scenario: Request exceeds scope or budget
- **WHEN** any requested capability, Revision, time, rate, or budget exceeds the Grant
- **THEN** the operation is denied before the message body reaches Edge and the reason is recorded as bounded audit metadata

#### Scenario: Revocation races with a new request
- **WHEN** a Grant is revoked concurrently with task submission
- **THEN** the latest committed revocation version wins and no newly unauthorized Task starts

### Requirement: Standard A2A service behavior
Gateway SHALL implement the pinned A2A v1.0.1 HTTP+JSON/REST Agent Card, Send Message, Get Task, List Tasks, and Cancel Task behavior without adding private top-level fields to A2A objects.

#### Scenario: Message completes synchronously
- **WHEN** an authorized online Agent completes within the synchronous response window
- **THEN** Gateway returns a schema-valid A2A Task or Message containing standard Artifact Parts

#### Scenario: Work continues asynchronously
- **WHEN** execution exceeds the synchronous window
- **THEN** Gateway returns a submitted or working Task that the Requester can retrieve and cancel using standard identifiers

#### Scenario: A2A payload is invalid
- **WHEN** a request violates the pinned A2A Schema or unsupported operation set
- **THEN** Gateway returns a standards-compatible error and does not forward the payload to Edge

### Requirement: Outbound Edge routing and truthful presence
Gateway SHALL route authorized A2A work only through an authenticated active Edge channel for the target Deployment. Presence and TaskState MUST derive from actual channel and Edge/Runtime events, not timers or synthetic success.

#### Scenario: Target Edge is online
- **WHEN** an authorized Task targets an authenticated compatible active channel
- **THEN** Gateway routes it to exactly that Deployment and advances state only from verified Edge events

#### Scenario: Target Edge is offline
- **WHEN** no compatible authenticated channel exists
- **THEN** Gateway returns the defined offline/unavailable result without persisting the message body for later execution or claiming work started

#### Scenario: Stale channel sends a result
- **WHEN** a replaced, revoked, or stale Edge channel submits a Task event
- **THEN** Gateway rejects it and does not modify the authoritative Task projection

### Requirement: Minimal cloud data retention
Server SHALL persist only governance, routing, compatibility, bounded task-state, and allowlisted audit metadata required for the service. It MUST NOT persist raw Prompt, answer, Artifact body, ContextCapsule, Runtime credential, absolute path, or Runtime Session identifier by default.

#### Scenario: Task is routed successfully
- **WHEN** Gateway proxies request and response bodies between Requester and Edge
- **THEN** bodies exist only for bounded in-memory processing and are absent from database records and ordinary logs after completion

#### Scenario: Server crashes during routing
- **WHEN** the Server restarts after an in-flight request
- **THEN** it recovers bounded Task state and idempotency metadata without recovering or exposing raw message content that policy forbids persisting

#### Scenario: Operator enables diagnostics
- **WHEN** an operator requests diagnostic output
- **THEN** diagnostics use a schema allowlist and never include prohibited message content or local Runtime secrets
