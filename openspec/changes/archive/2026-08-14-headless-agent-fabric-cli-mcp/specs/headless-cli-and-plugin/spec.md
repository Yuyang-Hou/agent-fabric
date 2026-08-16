## ADDED Requirements

### Requirement: Headless installation and configuration
The product SHALL provide a versioned Agent Fabric CLI and Codex Plugin that can be installed and configured without installing or opening the Electron application or installing a standalone Codex CLI. Setup MUST configure the local MCP Server, Skill files, authenticated Client, and optional Owner Edge service through one guided flow. Local Codex Host configuration MUST preserve unrelated settings and MUST be updated atomically with least-privilege file permissions.

#### Scenario: New requester installs the Codex integration
- **WHEN** a user runs the documented setup flow and supplies a reachable Agent Fabric Server
- **THEN** the CLI validates compatibility, configures the Codex Plugin, authenticates the device, and reports the next usable Codex command

#### Scenario: ChatGPT Desktop requester has no standalone Codex CLI
- **WHEN** a Requester has a local ChatGPT Desktop Codex Host but the `codex` executable is absent from `PATH`
- **THEN** setup directly configures the shared Codex Host `config.toml`, installs Agent Fabric Skills, and reports that ChatGPT Desktop must be restarted without requiring the standalone Codex CLI

#### Scenario: ChatGPT Desktop does not inherit the terminal Node environment
- **WHEN** Agent Fabric was installed with an NVM-managed Node but ChatGPT Desktop starts with a `PATH` that cannot resolve that Node or the user's shell initialization
- **THEN** the MCP STDIO configuration uses the validated absolute Node executable as `command`, passes the absolute Agent Fabric MCP entry as its first argument, and starts without shell or `PATH` resolution

#### Scenario: Existing unrelated Codex configuration is preserved
- **WHEN** setup installs or refreshes Agent Fabric alongside existing models, profiles, rules, and MCP servers
- **THEN** it replaces only the Agent Fabric-owned MCP configuration and leaves all unrelated configuration semantically unchanged

#### Scenario: Setup cannot safely complete
- **WHEN** the Server is unreachable or incompatible, device authentication is rejected, or the Codex Host configuration cannot be parsed or safely updated
- **THEN** setup fails without writing a partially active configuration or removing unrelated settings and reports a recoverable reason

### Requirement: Publish the visible Codex context
The publish Skill SHALL convert only the context visible to the current Codex turn into a bounded ContextCapsule and SHALL create an Owner-only immutable Agent Revision through the local Edge. Publication MUST NOT depend on recovering or taking ownership of the source Codex thread.

#### Scenario: Owner publishes Atlas from Codex
- **WHEN** the Owner invokes the publish Skill with a valid Agent name and the local Edge accepts the ContextCapsule
- **THEN** the result returns the Agent ID, immutable Revision, disclosure summary, and local-only visibility in the same Codex conversation

#### Scenario: Source thread is busy or not recoverable
- **WHEN** the original Codex thread has an active task, is compacted, or cannot be resumed by another process
- **THEN** publication still uses the current turn's visible ContextCapsule and does not attempt to resume that thread

#### Scenario: Capsule violates publication limits
- **WHEN** the generated ContextCapsule exceeds size limits or contains prohibited fields
- **THEN** publication is rejected with actionable field-level errors and no Revision is created

### Requirement: Codex-native Agent discovery and invocation
The MCP Server SHALL expose controlled tools for Agent discovery, synchronous question answering, asynchronous delegation, task lookup, continuation, and cancellation. Tool results MUST return to the Requester's existing Codex conversation using shared Client semantics.

#### Scenario: Requester asks an authorized Agent
- **WHEN** Codex calls `ask_agent` for an online Agent covered by a valid Grant
- **THEN** the MCP Server sends a standard A2A Message and returns the resulting Task/Artifact content to that Codex conversation

#### Scenario: Requester continues the same context
- **WHEN** Codex sends a follow-up using the prior A2A contextId
- **THEN** the request continues the same Requester-isolated Agent context and returns a traceable new Task result

#### Scenario: Agent is unavailable or unauthorized
- **WHEN** the Agent is offline or the Requester lacks a valid Grant
- **THEN** the tool returns a distinct offline or authorization error and does not claim that work started

### Requirement: Human-only external authorization
External Agent Grants and revocations MUST require a human-authorized CLI path. Skill, MCP, A2A, Runtime, and ordinary Agent credentials SHALL NOT have permission to create or broaden Grants.

#### Scenario: Owner grants another user access
- **WHEN** an authenticated Owner runs the interactive grant command and confirms the target, Agent, capabilities, expiry, and budget
- **THEN** the Control Plane creates exactly that scoped Grant and the CLI displays its identifier and effective scope

#### Scenario: Agent attempts to self-authorize
- **WHEN** a Skill, MCP tool, A2A Task, Runtime tool, or non-admin token attempts to create or broaden a Grant
- **THEN** the request is rejected and the attempted privilege escalation is audit-recorded without leaking secrets

#### Scenario: Owner revokes access
- **WHEN** the Owner confirms a revoke command
- **THEN** future calls are immediately denied and active or queued work is handled by the revocation policy

### Requirement: Stable CLI automation contract
Every non-interactive CLI operation SHALL provide a versioned JSON output mode, stable exit-code classes, and machine-readable error identifiers. Human-readable output MUST describe the same result without requiring knowledge of internal Runtime or database identifiers.

#### Scenario: Automation invokes a successful command
- **WHEN** a script runs a supported command with JSON output enabled
- **THEN** stdout contains one schema-valid result and the process exits successfully without progress noise mixed into the payload

#### Scenario: Client and Server are incompatible
- **WHEN** the CLI detects an unsupported protocol or schema version
- **THEN** it exits with the compatibility error class and names the component and supported upgrade direction

### Requirement: Least-privilege local credentials
CLI, MCP Server, Edge, and administrative operations SHALL use separate credential scopes and protected local storage. A Requester MCP credential MUST NOT read Owner capsules, administer the Server, or create Grants.

#### Scenario: MCP credential is compromised
- **WHEN** a party uses a valid Requester MCP credential against Owner or admin endpoints
- **THEN** access is denied while ordinary authorized Agent invocation remains bounded to its original scope

#### Scenario: User logs out or removes the integration
- **WHEN** the user runs logout or uninstall
- **THEN** local refresh credentials are revoked or deleted and unrelated Codex configuration remains intact
