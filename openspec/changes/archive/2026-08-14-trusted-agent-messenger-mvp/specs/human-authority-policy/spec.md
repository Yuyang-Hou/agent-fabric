## ADDED Requirements

### Requirement: Explicit human gesture for authority changes
The system SHALL require a fresh explicit Human UI gesture to verify a device, attach or remove an Agent, grant or revoke Agent access, or approve any future sensitive capability, and MUST bind the action to the authenticated Human session.

#### Scenario: Human attaches a local Agent
- **WHEN** the Owner selects a locally detected Agent, reviews its public capability summary and explicitly confirms attachment
- **THEN** the room records the approved Agent Principal and revision without exposing private AgentSpec content

#### Scenario: Prompt text imitates a confirmation
- **WHEN** a room message, model output, tool call, ACP request, or A2A payload contains text that asks the system to confirm an authority change
- **THEN** the system treats it as untrusted content and performs no authority change

### Requirement: Agents cannot exercise Human authority
Agent credentials and execution paths MUST be technically unable to call Human-only relationship, device, room membership, Grant, or Agent attachment commands.

#### Scenario: Compromised Agent invokes a Human-only command
- **WHEN** an Agent attempts a Human-only command through IPC, local API, MCP, A2A, or the Control Plane
- **THEN** authorization fails before mutation and the denial is attributable to the Agent actor

### Requirement: Human publishes a bounded context snapshot as an Agent
The system SHALL allow an authenticated Owner to request publication from the current Codex conversation, SHALL show a bounded context-coverage and Skill/MCP capability summary, and MUST require one fresh Human confirmation before binding the snapshot to exactly one Agent and one room. A Skill or CLI MAY prepare and submit a short-lived publication request, but Agent, message, ACP, MCP, A2A, model-output, and Control Plane execution paths MUST NOT confirm, replace, or rebind the publication.

#### Scenario: Owner publishes the current Codex context
- **WHEN** the Owner invokes “发布为 Atlas”, a Skill submits a valid bounded context capsule, and the Owner reviews and confirms the short-lived request for an unattached Agent in one active room
- **THEN** Edge creates a private snapshot-session binding and the room receives only the resulting Agent revision, snapshot provenance projection, and public capability summary

#### Scenario: Agent attempts to confirm or replace its snapshot
- **WHEN** an Agent output, room message, tool call, ACP request, MCP request, or A2A payload asks to confirm publication or rebind a Runtime session
- **THEN** the system performs no binding change and reveals no capsule body, nonce, Runtime identifier, history, absolute path, or private capability configuration

### Requirement: Default read-only Agent policy
Every MVP Agent execution SHALL enforce filesystem read-only, network deny, side-effects deny, bounded time, bounded tokens, bounded concurrency, and bounded delegation depth independently of Runtime cooperation.

#### Scenario: Runtime requests a prohibited side effect
- **WHEN** Runtime execution requests a file write, network call, deployment, payment, or forbidden tool
- **THEN** Edge blocks the operation, performs no side effect, and maps the Task to an explainable `TASK_STATE_INPUT_REQUIRED` or `TASK_STATE_REJECTED` outcome

#### Scenario: Delegation or budget is exhausted
- **WHEN** an Agent exceeds its deadline, token budget, concurrency, or delegation-depth limit
- **THEN** Edge stops or rejects further work and emits a bounded standard Task outcome

### Requirement: Human emergency stop
The Owner SHALL be able to detach an Agent, revoke its room Grant, and request cancellation of all its active room tasks from a Human-only control.

#### Scenario: Owner activates emergency stop
- **WHEN** the Owner invokes emergency stop for an attached Agent
- **THEN** new work is denied immediately, active cancellations propagate to Edge, and the room marks the Agent unavailable
