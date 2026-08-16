## ADDED Requirements

### Requirement: MCP exposes only Agent discovery and A2A question tools
The local MCP Server SHALL expose exactly `list_agents`, `find_agent`, `ask_agent` and `get_task` for this product path and MUST NOT expose login, membership, invitation, Runtime management, Agent creation/editing, permission mutation, secret access or identity impersonation tools.

#### Scenario: Codex lists tools
- **WHEN** an authenticated local Codex session initializes MCP
- **THEN** the four tools have strict schemas, actionable descriptions and no management operation

#### Scenario: Unknown or extra arguments are supplied
- **WHEN** a tool call includes an unsupported tool or additional property
- **THEN** MCP returns a structured tool error and performs no network or state mutation beyond audit

### Requirement: MCP discovery matches unified Agent invocation access
`list_agents` and `find_agent` SHALL return only active Agents for which the current Account Principal passes the same `canInvokeAgent` check used by A2A Gateway, with bounded public identity, capability and truthful status fields.

#### Scenario: Agent is private to another owner
- **WHEN** the current member searches for that Agent by exact name or ID
- **THEN** MCP returns no result and does not reveal that the Agent exists

#### Scenario: Access changes
- **WHEN** an Agent grants or revokes the current member
- **THEN** the next discovery call reflects the new result without requiring MCP reinstallation

### Requirement: ask_agent sends a standard A2A Message
`ask_agent` SHALL accept an exact accessible Agent ID and non-empty bounded text, resolve a current standard Agent Card, send a standard A2A Message through the shared A2A Client, and interpret only standard Task, TaskState and Artifact semantics.

#### Scenario: Agent completes with text
- **WHEN** the target is online and completes within the bounded wait with a non-empty `text/plain` Artifact
- **THEN** MCP returns the Task ID, completed state and text result to the invoking Codex turn

#### Scenario: Task remains non-terminal
- **WHEN** the bounded wait expires while the Task is working or input-required
- **THEN** MCP returns the Task ID and current standard state without converting it to success or failure

#### Scenario: Target is offline or access is denied
- **WHEN** the Agent is offline, archived, unbound or no longer invokable before delivery
- **THEN** the request is rejected before Runtime execution with a non-leaking structured error

### Requirement: get_task is origin- and access-scoped
`get_task` SHALL return only a Task initiated by the current MCP Principal and readable under current Agent authorization; every read MUST recheck revocation and MUST NOT expose Tasks from another Account, Principal or Agent.

#### Scenario: Originator reads completion
- **WHEN** the originating Principal reads its completed Task while access remains valid
- **THEN** MCP returns the current standard state and allowlisted text Artifact

#### Scenario: Another Principal guesses Task ID
- **WHEN** another Principal requests that Task
- **THEN** MCP returns a generic not-found/denied error with no Task metadata

#### Scenario: Access was revoked after send
- **WHEN** the originating member loses invocation access before reading again
- **THEN** the read is denied according to current policy and no cached body is returned

### Requirement: MCP credentials and outputs are least-privilege and redacted
MCP SHALL authenticate to the local Host with an independent least-privilege credential, SHALL bind Cloud calls to the current Account Principal, and MUST NOT emit tokens, invitation secrets, environment values, absolute paths, Runtime session IDs, private Instructions, raw internal errors or private Skill/MCP configuration.

#### Scenario: Downstream error includes private data
- **WHEN** Edge, Runtime or network failure contains a private value
- **THEN** MCP maps it to an allowlisted code/message and emits none of the raw private content
