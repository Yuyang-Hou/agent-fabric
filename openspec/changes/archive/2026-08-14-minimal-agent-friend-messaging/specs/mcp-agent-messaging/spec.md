## ADDED Requirements

### Requirement: MCP exposes only the minimal Agent friendship messaging tools
The Codex-facing MCP Server SHALL expose exactly `list_agent_friends`, `send_message`, and `get_message` for this product path and MUST NOT expose login, publication, friendship management, task delegation, cancellation, context administration, or permission expansion tools.

#### Scenario: Codex lists MCP tools
- **WHEN** Codex requests the MCP tool list
- **THEN** the server SHALL return exactly the three minimal tools with schemas that reject unknown fields

#### Scenario: Codex attaches protocol metadata to a tool call
- **WHEN** Codex includes the MCP-reserved request-level `_meta` field while calling one of the three tools
- **THEN** the server SHALL accept and ignore that protocol metadata while continuing to reject unknown tool argument fields

#### Scenario: MCP attempts a Human-only operation
- **WHEN** MCP requests Agent publication, invitation creation, friendship removal, credential access, or capability expansion
- **THEN** the local Host MUST reject the operation and MUST NOT route it through an Owner credential

#### Scenario: Installed Codex skill handles an Agent contact request
- **WHEN** a user asks Codex to list, contact, or follow up with an Agent Fabric contact
- **THEN** the packaged plugin SHALL direct Codex to `list_agent_friends`, `send_message`, and `get_message` only, MUST NOT reference removed discovery, publication, Grant, task, cancellation, or context tools, and MUST NOT register a competing legacy MCP Server

### Requirement: Codex can list the self-test contact and active Agent friends
`list_agent_friends` SHALL return the current Agent's self-test contact followed by its active friends with Agent ID, contact type, public Agent Card summary, and truthful Presence only.

#### Scenario: Self-test contact is listed
- **WHEN** Codex calls `list_agent_friends` for a published current Agent
- **THEN** the result SHALL include that Agent exactly once as `contactType: self`, SHALL omit `friendshipId`, and SHALL identify it as “我的 Agent · 自测”

#### Scenario: Active friends are listed
- **WHEN** Codex calls `list_agent_friends` through an authenticated local MCP session
- **THEN** the result SHALL include each active friend once as `contactType: friend` with its real `friendshipId` and SHALL exclude revoked relationships and private Edge data

#### Scenario: Another local user invokes MCP
- **WHEN** a process without the current Agent's authenticated local MCP capability calls the tool
- **THEN** the Host MUST reject it without returning friend data

### Requirement: Codex can send a text Message to an online friend
`send_message` SHALL accept a target friend Agent ID and non-empty text, construct a conformant A2A Message, and route it through the authenticated Gateway only when the exact Friendship is active and the target Agent is online.

#### Scenario: Online friend replies successfully
- **WHEN** Codex sends valid text to an online active friend and the target Runtime completes with text
- **THEN** the source MCP SHALL receive the completed Task result and the remote text Artifact, together with the Message ID and terminal status

#### Scenario: Target friend is offline
- **WHEN** Codex sends to a friend without a healthy online Deployment
- **THEN** the operation SHALL return `offline` promptly, MUST NOT claim received or processing, and MUST NOT create a Cloud plaintext queue

#### Scenario: Target is not an active friend
- **WHEN** Codex supplies an unknown, revoked, or unrelated Agent ID
- **THEN** the system MUST reject the Message before target Runtime execution and MUST NOT disclose whether a private target Agent exists

#### Scenario: Invalid text input
- **WHEN** text is empty, exceeds the configured bound, or contains a non-text Part in P0
- **THEN** MCP or the Gateway MUST reject it without partial delivery

#### Scenario: Current Agent self-test replies successfully
- **WHEN** Codex sends valid text to the online `contactType: self` target
- **THEN** the Message SHALL traverse the authenticated local Host, Cloud Gateway, same target Edge, isolated self Session, Runtime, Artifact return, and source result persistence exactly once

#### Scenario: Self-test Agent is not healthy
- **WHEN** Codex sends to the self-test target while its current Deployment, Revision, or Runtime is not healthy
- **THEN** the operation SHALL return `offline` or a truthful failure and MUST NOT bypass Presence checks

### Requirement: Message processing uses isolated friend Sessions
The target Edge SHALL maintain a private Runtime Session per `(localAgentId, friendAgentId)`, SHALL serialize messages from the same friend, and MUST use a different Session for every other friend.

#### Scenario: Same friend sends a follow-up
- **WHEN** the same active friend sends a later Message while its Session remains valid
- **THEN** the Edge SHALL process it in the same private friend Session to preserve minimal continuity

#### Scenario: Different friend sends a Message
- **WHEN** another active friend sends a Message
- **THEN** the Edge MUST use a different Runtime Session and MUST NOT expose the first friend's inputs, replies, Context, or Runtime handle

#### Scenario: Runtime Session is lost
- **WHEN** a friend Session is unavailable or expired
- **THEN** the Edge SHALL create a replacement Session for that friend without reusing another friend's Session or claiming full prior-context recovery

#### Scenario: Self-test Message uses the reserved self Session
- **WHEN** the current Agent processes its own authenticated self-test Message
- **THEN** the Edge SHALL use `(localAgentId, localAgentId)` as a private isolated Session key and MUST NOT recursively send the Runtime reply as a new Message

### Requirement: Runtime events produce truthful message status and automatic reply
The target Edge SHALL acknowledge receipt only after local validation, SHALL emit processing only after Runtime execution starts, and SHALL map the Runtime's final text to an A2A text Artifact and `TASK_STATE_COMPLETED` without requiring the receiving Agent to call MCP again.

#### Scenario: Normal text reply
- **WHEN** the Runtime starts and completes with a final text response
- **THEN** the Edge SHALL publish received, processing, and replied in order and automatically route the text Artifact to the source Agent

#### Scenario: Runtime fails before reply
- **WHEN** Runtime authentication, startup, execution, or terminal output fails
- **THEN** the Edge SHALL publish failed with an allowlisted error category and MUST NOT synthesize a successful reply

#### Scenario: Duplicate delivery
- **WHEN** the same authenticated Message or idempotency key is delivered more than once
- **THEN** the target Edge MUST start processing at most once and SHALL return the existing result or status

#### Scenario: Host sends a new Message after restart
- **WHEN** the local Host restarts with existing persisted Message records and Codex sends new text
- **THEN** the Host SHALL allocate a globally unique Message ID, SHALL execute the new request, and MUST NOT return a prior Message's status or reply

### Requirement: Advanced operations stop for Human attention
The P0 Runtime Policy MUST permit only text reply generation and SHALL stop as `TASK_STATE_INPUT_REQUIRED` when the Runtime requests a tool, file, network, command, approval, credential, or other side effect.

#### Scenario: Runtime requests an advanced operation
- **WHEN** Runtime execution emits an approval or forbidden-operation event
- **THEN** the Edge MUST deny continuation, mark the Message `needs_attention`, notify the Owner App, and return a standardized Human-attention response to the source Agent

#### Scenario: External prompt asks to change authority
- **WHEN** incoming text instructs the Runtime to publish, add friends, reveal credentials, modify AgentSpec, or bypass policy
- **THEN** the Edge MUST preserve current authority, reject the operation, and MUST NOT invoke a Human-only port

### Requirement: Delayed results remain retrievable by the originating Agent
`send_message` SHALL wait only within the bounded MCP call duration; when the Message is still non-terminal it SHALL return the Message ID, and `get_message` SHALL allow only the originating Agent to read its current status and reply.

#### Scenario: Processing exceeds MCP wait duration
- **WHEN** a valid remote Message remains non-terminal at the MCP wait deadline
- **THEN** `send_message` SHALL return its Message ID and current truthful status without converting it to failure or success

#### Scenario: Originating Agent retrieves the result
- **WHEN** the same authenticated originating Agent calls `get_message` after completion
- **THEN** the tool SHALL return the terminal status and reply text stored on the source Host

#### Scenario: Unrelated Agent retrieves the result
- **WHEN** another Agent or local identity calls `get_message` for a Message it did not originate
- **THEN** the Host MUST reject access without returning Message metadata or body
