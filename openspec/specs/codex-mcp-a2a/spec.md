# codex-mcp-a2a Specification

## Purpose

定义 Codex MCP 对可访问 Agent 的发现与标准 A2A 问答。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

### Requirement: MCP exposes only Agent discovery and A2A question tools
The local MCP Server SHALL expose exactly `list_agents`, `find_agent`, `ask_agent` and `get_task` for this product path and MUST NOT expose login, Friendship/invitation management, Account membership, Runtime management, Agent creation/editing, access mutation, secret access or identity impersonation tools.

#### Scenario: Codex lists tools
- **WHEN** an authenticated local Codex session initializes MCP
- **THEN** the four tools have strict schemas, actionable descriptions and no Human relationship or resource management operation

#### Scenario: Unknown or extra arguments are supplied
- **WHEN** a tool call includes an unsupported tool or additional property
- **THEN** MCP returns a structured tool error and performs no network or state mutation beyond audit

### Requirement: MCP discovery matches owner-or-friend invocation access
`list_agents` and `find_agent` SHALL return active owned Agents plus active Agents opened by current Human friends, using the same `canInvokeAgent` check as A2A Gateway. Friend results MUST use the bounded friend Agent projection and MUST NOT expose another Account, Runtime or private configuration.

#### Scenario: Agent is private to a friend
- **WHEN** the current Human searches for a friend's private Agent by exact name or ID
- **THEN** MCP returns no result and does not reveal that the Agent exists

#### Scenario: Friend Agent is opened
- **WHEN** an active friend owns an online Agent with access mode `friends`
- **THEN** discovery returns its stable identity, public purpose/capability summary, owner display summary, availability and `friend` effective access

#### Scenario: Access changes
- **WHEN** Friendship is removed or the owner changes the Agent between `friends` and `private`
- **THEN** the next discovery call reflects current access without MCP reinstallation and emits no stale cached row

### Requirement: ask_agent sends a standard A2A Message under current friendship authority
`ask_agent` SHALL accept an exact accessible Agent ID and non-empty bounded text, resolve a current standard Agent Card, recheck owner-or-active-friend access, send a standard A2A Message through the shared A2A Client, and interpret only standard Task, TaskState and Artifact semantics.

#### Scenario: Friend Agent completes with text
- **WHEN** the target belongs to an active friend, is opened to friends, is online and completes within the bounded wait with a non-empty `text/plain` Artifact
- **THEN** MCP returns the Task ID, completed state and text result to the invoking Codex turn without granting target Account authority

#### Scenario: Task remains non-terminal
- **WHEN** the bounded wait expires while the Task is working or input-required
- **THEN** MCP returns the Task ID and current standard state without converting it to success or failure

#### Scenario: Target is offline or access is denied
- **WHEN** the Agent is offline, archived, unbound, private or no longer owned by a current friend before delivery
- **THEN** the request is rejected before Runtime execution with a non-leaking structured error

### Requirement: get_task is origin- and current-access-scoped across Accounts
`get_task` SHALL return only a Task initiated by the current MCP Principal and readable under current owner-or-friend Agent authorization. Every read MUST recheck Friendship and Agent access and MUST NOT expose Tasks from another origin Principal or Agent.

#### Scenario: Friend originator reads completion
- **WHEN** the originating Principal reads its completed cross-Account Task while Friendship and Agent friend access remain active
- **THEN** MCP returns the current standard state and allowlisted text Artifact

#### Scenario: Another Principal guesses Task ID
- **WHEN** another Principal requests that Task
- **THEN** MCP returns a generic not-found/denied error with no Task metadata

#### Scenario: Friendship or access was revoked after send
- **WHEN** the originating Human loses Friendship or the target becomes private before reading again
- **THEN** the read is denied according to current policy and no cached body is returned

### Requirement: MCP credentials and outputs are least-privilege and redacted
MCP SHALL authenticate to the local Host with an independent least-privilege credential bound to the current Human and personal Account. Friend invocation MUST NOT copy or inherit the target Account's owner, Runtime or management authority. MCP MUST NOT emit tokens, invitation identity digests, environment values, absolute paths, Runtime session IDs, private Instructions, raw internal errors or private Skill/MCP configuration.

#### Scenario: Downstream error includes private data
- **WHEN** Edge, Runtime, Friendship lookup or network failure contains a private value
- **THEN** MCP maps it to an allowlisted code/message and emits none of the raw private content
