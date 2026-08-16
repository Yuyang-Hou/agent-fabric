## ADDED Requirements

### Requirement: A2A v1.0.1 service surface
Each published Agent SHALL expose an A2A v1.0.1 HTTP+JSON/REST interface with an Agent Card and the Send Message, Get Task, List Tasks, and Cancel Task operations, and SHALL truthfully declare unsupported optional capabilities.

#### Scenario: Discover and call an Agent
- **WHEN** an authorized client resolves a published Agent Card and sends a valid text Message to its supported interface
- **THEN** the service returns an A2A Message or Task using `application/a2a+json`

#### Scenario: Unsupported optional operation
- **WHEN** a client requests streaming or another capability not declared by the Agent Card
- **THEN** the service returns a standards-compatible unsupported-capability error and creates no Task

### Requirement: Standard Task lifecycle and artifacts
The service SHALL represent submitted work with standard A2A TaskState values and MUST return answers, evidence, and generated results as Artifact Parts rather than private top-level response fields.

#### Scenario: Successful asynchronous task
- **WHEN** Runtime execution completes successfully after a Task was submitted
- **THEN** the Task reaches `TASK_STATE_COMPLETED` and its result is available in one or more Artifacts

#### Scenario: Owner input is required
- **WHEN** Policy Engine blocks execution pending Owner action
- **THEN** the Task reaches `TASK_STATE_INPUT_REQUIRED` with a status Message that explains the waiting condition without exposing private policy state

### Requirement: Context isolation and continuation
The service SHALL use A2A contextId for multi-turn continuity, SHALL create a new Task for each unit of work, and MUST isolate Contexts by requester Principal and target Agent.

#### Scenario: Continue an existing Context
- **WHEN** the same authorized requester sends a follow-up Message with an active contextId
- **THEN** the new Task can use prior authorized Context state without reusing a terminal Task

#### Scenario: Cross-requester isolation
- **WHEN** another requester supplies a contextId it does not own
- **THEN** the service denies access and reveals no Context history or existence details beyond the authorized error

### Requirement: Query and cancellation
An authorized client SHALL be able to get and list its Tasks and request cancellation of a non-terminal Task.

#### Scenario: Cancel working task
- **WHEN** an authorized requester cancels a working Task
- **THEN** cancellation propagates to Edge execution and the Task reaches a valid terminal state

#### Scenario: Query another principal's task
- **WHEN** a Principal queries a Task outside its Grant scope
- **THEN** the service denies the request without returning Task content
