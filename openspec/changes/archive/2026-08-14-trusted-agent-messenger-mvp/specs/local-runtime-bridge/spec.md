## ADDED Requirements

### Requirement: Runtime-neutral ACP execution boundary
Edge Host SHALL drive Codex through a Runtime Adapter contract backed by ACP operations for detection, capability inspection, session creation or restoration, execution, cancellation, and closure, and SHALL consume a normalized RuntimeEvent stream.

#### Scenario: Execute with Codex ACP Adapter
- **WHEN** an authorized read-only Task reaches an online Edge with a compatible Codex runtime
- **THEN** Edge invokes it through the ACP-backed Adapter and maps normalized events to encrypted A2A Task updates

#### Scenario: Runtime capability is incompatible
- **WHEN** capability inspection cannot satisfy the attached Agent revision and policy
- **THEN** Edge rejects execution before starting a Runtime session and reports an explainable Task outcome

### Requirement: Private Runtime session mapping
Edge SHALL keep the mapping from roomId, contextId, and Agent ID to Runtime session handle in private local storage and MUST NOT expose the handle, cwd, credentials, private instructions, or private Skill/MCP configuration through Matrix, A2A, Control Plane, UI telemetry, or logs.

#### Scenario: Resume an authorized Context
- **WHEN** a valid follow-up arrives for an active room Context
- **THEN** Edge resumes the private session or creates a policy-approved successor while keeping the external contextId stable

#### Scenario: Inspect all external records
- **WHEN** encrypted envelopes, Agent Cards, Control Plane state, diagnostics, errors, and logs are inspected
- **THEN** no private Runtime handle, absolute cwd, model credential, private instruction, or hidden reasoning is present

### Requirement: Bounded context capsule publication and private session binding
Edge SHALL accept only a versioned, size-bounded, schema-valid context capsule through an authenticated local publication channel, SHALL expose only bounded provenance and capability projections to the trusted confirmation surface, and MUST keep the capsule body, absolute working directory, credentials, Runtime identifiers, and private Skill/MCP configuration inside Edge. A confirmed capsule SHALL create and bind exactly one new Runtime session to one Agent and one room under a serial Agent Fabric ownership lease.

#### Scenario: Submit a context capsule from Codex
- **WHEN** the local publication CLI submits a valid capsule, private working directory, target Agent, and room to the running Edge
- **THEN** Edge returns an opaque short-lived confirmation reference with bounded coverage, workspace label, and public capability summaries, without returning the capsule body, absolute cwd, credentials, Runtime handles, or private configuration

#### Scenario: Publish and execute from a context snapshot
- **WHEN** the Human confirms a valid unexpired publication request for an unattached Agent and one active room, then an authorized Task reaches that Agent
- **THEN** Edge consumes the request once, creates a new private Runtime session with the capsule as its initial trusted context, acquires a serial binding, and derives execution from that snapshot plus later room turns

#### Scenario: Publication request is invalid or unavailable
- **WHEN** the request has expired, was consumed, has an invalid schema or nonce, targets an already attached Agent, or cannot satisfy the read-only policy
- **THEN** Edge refuses publication with a bounded recoverable reason, creates no Runtime session, reveals no capsule body or ownership detail, and never claims original-session inheritance

### Requirement: Runtime capabilities are rediscovered and grant-bounded
Edge SHALL rediscover the current local Runtime Skills/MCP capabilities from the current Codex host and privately validated working directory during publication preparation, Human confirmation, new session creation, and session restoration; MUST represent only an allowlisted public capability summary and fingerprint in the Agent revision; and MUST NOT treat capsule text as proof of capability or authorization.

#### Scenario: Required capability remains available
- **WHEN** Edge restores a published snapshot session and its current capability fingerprint still satisfies the Human-approved Agent revision and room Grant
- **THEN** execution may proceed under the fixed read-only Runtime policy without exposing private Skill/MCP configuration

#### Scenario: Capability changes after publication
- **WHEN** a required Skill/MCP disappears, its permission changes, or a new capability appears after publication
- **THEN** Edge blocks incompatible execution or withholds the new capability, requires Human review before revising the Agent Grant, and never silently expands authority

### Requirement: Cancellation and failure normalization
The Adapter SHALL honor an AbortSignal or ACP cancellation request, and Edge SHALL normalize cancellation, process exit, timeout, disconnect, authentication failure, and session loss into bounded A2A TaskState outcomes.

#### Scenario: Runtime honors cancellation
- **WHEN** cancellation is requested during execution
- **THEN** the Adapter stops work, emits no later successful Artifact, and Edge publishes a valid terminal Task update

#### Scenario: Runtime exits unexpectedly
- **WHEN** the ACP process exits or its session becomes invalid while working
- **THEN** Edge marks the Task failed or recoverable according to policy and never leaves it indefinitely working

### Requirement: Approved source adoption
The production Runtime bridge SHALL use the registered, version-pinned, license-approved `codex-acp` implementation behind the project Adapter boundary, MUST NOT include the rejected Paperclip execution adapter, and MUST NOT introduce a bespoke direct Codex App Server driver without a separate reviewed design decision.

#### Scenario: Approved dependency passes supply-chain validation
- **WHEN** CI evaluates a Runtime dependency recorded with repository, version or commit, license, notices, adopted modules, local modifications, and replacement boundary
- **THEN** the dependency may enter the distributable build after contract and leakage tests pass

#### Scenario: Unregistered copied source is added
- **WHEN** source code or a Runtime dependency lacks provenance, license approval, required notices, or an adapter boundary
- **THEN** policy validation fails and the code cannot enter the product build

### Requirement: Shared Fake Runtime contract suite
Every real Runtime Adapter MUST pass the same contract suite as a deterministic Fake Runtime for multi-turn execution, isolation, progress, cancellation, timeout, error, and session-loss behavior.

#### Scenario: Codex Adapter is promoted from Spike
- **WHEN** the Codex ACP Adapter passes the shared contract suite and sensitive-data leakage fixtures
- **THEN** it may replace Fake Runtime in the end-to-end Messenger acceptance path
