## ADDED Requirements

### Requirement: Registry and scoped Grants
The Control Plane SHALL register sanitized Agent Cards and deployment summaries, and MUST authorize every discovery and A2A operation using a revocable Grant scoped to a Principal, Agent, actions, and validity window.

#### Scenario: Authorized discovery and call
- **WHEN** a Principal has an active Grant for discovery and message sending
- **THEN** Registry returns the approved Agent Card and Router accepts the allowed A2A request

#### Scenario: Grant is revoked
- **WHEN** an Owner or administrator revokes a Grant
- **THEN** subsequent discovery and task operations are denied immediately, including attempts that reuse an earlier access token

### Requirement: Stable deployment routing
The Router SHALL resolve a stable Agent ID to its active AgentDeployment and route work only through an authenticated online Edge connection.

#### Scenario: Agent moves to another device
- **WHEN** an approved deployment on a new device becomes active
- **THEN** the stable Agent ID and Agent Card interface remain unchanged while new work routes to the new deployment

#### Scenario: Agent is offline
- **WHEN** no authenticated active deployment is available
- **THEN** Router returns an explicit offline or bounded-queue outcome and does not claim that execution started

### Requirement: Outbound-only Edge connection
Each Edge Host SHALL initiate and authenticate its own secure outbound connection, and the system MUST NOT require an inbound public port on the Owner device.

#### Scenario: Route over established tunnel
- **WHEN** Router receives an authorized A2A Task for an online deployment
- **THEN** it forwards the request over the deployment's authenticated outbound connection

#### Scenario: Device impersonation attempt
- **WHEN** a connection presents credentials that do not match the claimed Device or Deployment
- **THEN** Control Plane rejects the connection and routes no Agent traffic through it

### Requirement: Minimal cloud data
The Control Plane SHALL store only identity, card, Grant, deployment, presence, Task/Context index, status, policy result, time, and usage metadata required for routing and audit, and MUST NOT persist model credentials, Runtime handles, absolute paths, or private AgentSpec content.

#### Scenario: Audit a completed task
- **WHEN** an authorized auditor inspects a completed task record
- **THEN** the record identifies participants, Agent, state, timestamps, policy result, and usage summary without exposing prohibited Edge-private data

#### Scenario: Sensitive-data leakage scan
- **WHEN** Agent Cards, Control Plane state, logs, and error responses are scanned after integration tests
- **THEN** no token, absolute workspace path, Runtime session identifier, private instruction, or hidden reasoning is found
