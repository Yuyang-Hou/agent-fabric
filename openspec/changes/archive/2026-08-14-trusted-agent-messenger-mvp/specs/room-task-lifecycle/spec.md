## ADDED Requirements

### Requirement: Mention creates an authorized A2A Task
An `@Agent` request in an encrypted room SHALL create a new A2A v1.0.1 Task only after contact, room membership, Agent attachment, Grant, signature, idempotency, and Edge policy checks pass.

#### Scenario: Valid mention starts work
- **WHEN** an active contact mentions an online attached Agent with valid text input
- **THEN** the system creates a Task with a new taskId, the room contextId, `TASK_STATE_SUBMITTED`, and an attributable requester and target Agent

#### Scenario: Invalid or unauthorized mention
- **WHEN** the Agent is detached, the relationship is revoked, the envelope is malformed, or the requester lacks a Grant
- **THEN** the system creates no Runtime execution and returns an encrypted rejection without leaking private Agent state

### Requirement: Standard task state and Artifact projection
The system SHALL represent Agent work with standard A2A TaskState values and MUST represent final answers and generated results as Artifact Parts rather than private A2A fields.

#### Scenario: Runtime completes successfully
- **WHEN** Runtime execution returns a final text result
- **THEN** the Task reaches `TASK_STATE_COMPLETED`, the result appears as an Artifact Part, and the room UI renders it under the verified Agent identity

#### Scenario: Progressive execution update
- **WHEN** Edge receives Runtime progress before completion
- **THEN** the room receives an encrypted Task update that preserves the standard Task payload while the UI shows progressive status without claiming an unsupported external A2A streaming capability

### Requirement: Truthful production execution provenance
The default product path MUST derive `TASK_STATE_WORKING`, `TASK_STATE_COMPLETED`, and Artifact content from verified target Edge and Runtime events, MUST NOT advance Tasks with Renderer timers or fixed demo responses, and SHALL keep every Fake Runtime or deterministic demo behind an explicitly labeled non-production mode.

#### Scenario: Local snapshot Agent is mentioned from the product UI
- **WHEN** an authorized Human mentions an attached Agent whose context snapshot was published for this exact room and the local Runtime remains compatible
- **THEN** Electron main routes the Task through local Edge, resumes the private snapshot session through the production Codex ACP Adapter, and renders the actual snapshot-grounded Runtime result as an Artifact before claiming completion

#### Scenario: Remote Agent Edge has not acknowledged work
- **WHEN** an authorized Human mentions the contact's attached Agent but its remote Edge is offline, unreachable, or not configured
- **THEN** the encrypted Task remains `TASK_STATE_SUBMITTED` with a truthful waiting or offline explanation and the client emits no synthetic working state, completed state, or Artifact

#### Scenario: Runtime cannot start
- **WHEN** the selected local Runtime is unavailable, unauthenticated, incompatible, or fails before starting execution
- **THEN** the Task reports an explainable non-success outcome and the UI never substitutes a fixed success response

### Requirement: Context continuation and isolation
Each unit of work SHALL receive a new taskId, follow-up work MAY retain the room contextId, terminal Tasks MUST remain terminal, and Context state MUST be isolated by room, requester Human, and target Agent.

#### Scenario: Follow up in the same room
- **WHEN** the same authorized requester follows up to the same Agent in an active room Context
- **THEN** the system creates a new Task and Edge may resume the mapped private Runtime session without exposing its handle

#### Scenario: Context is replayed in another room
- **WHEN** a requester supplies a contextId from another room, Human pair, or target Agent
- **THEN** the system denies the request and reveals no Context history or existence detail

#### Scenario: Published snapshot session is targeted from another room
- **WHEN** another room or Agent attempts to reuse the published Agent's snapshot Runtime binding
- **THEN** Edge denies execution without revealing the capsule body, Runtime session, private workspace, or whether it is bound elsewhere

### Requirement: Cancellation and offline ordering
An authorized requester or Owner SHALL be able to cancel a non-terminal Task, and an offline Edge MUST evaluate cancellation tombstones and current authorization before starting queued work.

#### Scenario: Cancel a working task
- **WHEN** an authorized human cancels a Task in `TASK_STATE_WORKING`
- **THEN** cancellation propagates to the active Runtime and the Task reaches a valid terminal state without further Artifact production

#### Scenario: Request and cancel arrive while Agent is offline
- **WHEN** an encrypted Task request is followed by its cancellation before the target Edge reconnects
- **THEN** Edge records the cancellation and never starts Runtime execution for that Task

### Requirement: Idempotent room event processing
The system MUST use Matrix eventId and an envelope idempotency key to ensure a room task starts at most once despite sync replay, retry, reconnect, or duplicate delivery.

#### Scenario: Duplicate task event is received
- **WHEN** Edge receives the same authorized Task envelope more than once
- **THEN** it returns or republishes the existing Task state without starting another Runtime execution
