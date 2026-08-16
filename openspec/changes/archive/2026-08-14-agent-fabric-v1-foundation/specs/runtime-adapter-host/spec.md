## ADDED Requirements

### Requirement: Runtime Adapter contract
The Edge Host SHALL drive every Runtime through Runtime Adapter v1 operations for detection, capability inspection, session creation or restoration, execution, cancellation, and closure, and SHALL consume a common RuntimeEvent stream.

#### Scenario: Execute through Fake Runtime
- **WHEN** the Edge Host starts a valid task using the Fake Runtime Adapter
- **THEN** it receives deterministic RuntimeEvents and maps them to the expected A2A Task and Artifact updates

#### Scenario: Runtime does not support a requested capability
- **WHEN** adapter capability inspection reports that the configured Runtime cannot satisfy an AgentSpec capability
- **THEN** local preflight fails before the AgentRevision is published

### Requirement: Private Runtime session mapping
The Edge Session Manager SHALL maintain the mapping from A2A contextId to Runtime session handle on Edge and MUST NOT expose the Runtime handle to the Control Plane, Agent Card, requester, logs, or A2A metadata.

#### Scenario: Resume a multi-turn session
- **WHEN** an authorized follow-up arrives for an active contextId
- **THEN** Session Manager resumes the mapped Runtime session or creates a successor according to policy while preserving the external contextId

#### Scenario: Inspect cloud records
- **WHEN** Control Plane task and audit records are inspected
- **THEN** no Runtime session handle, absolute cwd, model credential, or private instruction is present

### Requirement: Edge policy enforcement
The Edge Host SHALL enforce filesystem, network, tool, side-effect, timeout, token, concurrency, and delegation-depth policy independently of Runtime behavior.

#### Scenario: Forbidden side effect
- **WHEN** Runtime execution requests a write, network call, or tool action forbidden by Agent policy
- **THEN** Edge blocks the action, records the policy decision, and updates the Task without performing the side effect

#### Scenario: Delegation budget exceeded
- **WHEN** a delegated call exceeds its maximum depth, deadline, or budget
- **THEN** Edge rejects further delegation and terminates or pauses the Task with an explainable standard state

### Requirement: Cancellation and failure normalization
The Edge Host SHALL propagate cancellation through an AbortSignal to the active adapter and SHALL normalize adapter errors, disconnection, timeout, and session loss into explainable A2A outcomes.

#### Scenario: Adapter honors cancellation
- **WHEN** cancellation is requested during Runtime execution
- **THEN** the adapter stops producing work and Edge emits a valid terminal Task update

#### Scenario: Runtime process exits unexpectedly
- **WHEN** the Runtime exits while a Task is working
- **THEN** Edge marks the Task failed or recoverable according to policy and never leaves it indefinitely working
