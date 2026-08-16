## ADDED Requirements

### Requirement: Agent use is the primary signed-in experience
The packaged Desktop SHALL open a focused Agent-use destination after successful login or session restoration and SHALL keep Agents, Runtimes and Members as supporting management destinations. The use destination MUST present an accessible-Agent chooser, request composer and current Task/result plane without presenting a generic chat room, Inbox or task board.

#### Scenario: Returning user signs in
- **WHEN** an authenticated user has one or more invokable Agents
- **THEN** the Desktop opens the Agent-use destination and the user can select an Agent and prepare a request without navigating through administration

#### Scenario: User opens management
- **WHEN** the user selects Agents, Runtimes or Members
- **THEN** the existing authorized management destination remains available without losing a locally saved active Task receipt

#### Scenario: Historical default route is restored
- **WHEN** a saved or legacy route points to the Agent administration catalog as the signed-in home
- **THEN** the product migrates the home destination to Agent use while preserving explicit deep links to supported management details

### Requirement: Only currently invokable Agents can be selected
The Agent chooser SHALL list only Agents returned by the shared current invocation policy and SHALL show each Agent's stable identity, owner display summary, description, access reason, public capability labels and truthful availability. It MUST NOT expose private Instructions, private configuration, inaccessible Agent existence or unsupported capability claims.

#### Scenario: User searches accessible Agents
- **WHEN** the user searches by an allowlisted public Agent field
- **THEN** results contain only currently invokable Agents and preserve owner, access and availability context

#### Scenario: Another Account Agent matches
- **WHEN** a query would match an Agent outside the current Account or outside the user's invocation targets
- **THEN** that Agent is absent and no count or error reveals its existence

#### Scenario: Access changes while chooser is open
- **WHEN** the selected Agent is archived, unbound or revoked before send
- **THEN** send is denied before Runtime execution, selection is marked unavailable and no substitute Agent is chosen automatically

### Requirement: Request content remains local until target confirmation
The product SHALL keep draft request text in Renderer/Host memory until the user explicitly confirms one target Agent. Search, suggestions and ordering MUST use only allowlisted Agent metadata and local recent-use metadata and MUST NOT transmit the draft request as a discovery or routing query.

#### Scenario: User types before selecting an Agent
- **WHEN** request text exists but no target is confirmed
- **THEN** no A2A Message is sent and the request text is not included in a Cloud Agent-search call, log or telemetry event

#### Scenario: User confirms a target
- **WHEN** an invokable target, execution boundary and request are visible and the user submits
- **THEN** the exact bounded text is sent to that Agent through the standard A2A path

### Requirement: Desktop invocation uses standard A2A semantics
Every Desktop invocation SHALL use the same Account authorization, dynamic Agent Card and A2A v1.0.1 Message, Task, Context and Artifact path as Codex MCP. The product MUST NOT introduce a private Agent invocation protocol or bypass discovery, send, Task-read, cancellation or revocation checks.

#### Scenario: Online Agent completes
- **WHEN** the user sends valid text to an online invokable Agent
- **THEN** the result plane shows the standard submitted/working transitions and the completed text Artifact from the resulting Task

#### Scenario: Task remains non-terminal
- **WHEN** bounded foreground waiting ends while the Task is submitted, working or input-required
- **THEN** the product preserves the Task ID and standard state, continues only bounded authorized reads and does not report completion

#### Scenario: User cancels active work
- **WHEN** the user cancels a cancellable Task
- **THEN** the standard A2A cancel operation reaches the bound Agent and the UI reflects only the returned or subsequently read TaskState

#### Scenario: HTTP succeeds with failed Task
- **WHEN** the A2A transport returns HTTP success but the TaskState is failed or rejected
- **THEN** the product shows a bounded failure and never presents the request as completed

### Requirement: Input-required and human handoff are explicit
The result plane SHALL distinguish input-required from failure and SHALL use standard A2A Task/Context linkage for continuation only when the target supports it. When safe continuation is unavailable or the Agent lacks permission, context or capability, the product SHALL offer bounded retry, another Agent or human-handoff guidance without claiming a person was replaced.

#### Scenario: Agent requests additional input
- **WHEN** a Task enters input-required with an allowlisted status message and standard continuation is supported
- **THEN** the user can submit bounded follow-up input tied to the same Task/Context and sees the resulting standard state

#### Scenario: Continuation is unsupported
- **WHEN** the Agent or Runtime cannot continue the input-required Task
- **THEN** prior state remains visible and the product offers a new request or handoff instead of fabricating continuation

#### Scenario: Human judgment is required
- **WHEN** the Agent reports a permission, confidence, context or capability boundary
- **THEN** the UI identifies the boundary with an allowlisted explanation and offers owner/contact or copyable handoff guidance

### Requirement: Task recovery is idempotent and truthful
Every new request SHALL carry a stable local idempotency/message identifier. The Host MUST suppress duplicate submission while the outcome is uncertain, MUST preserve a proven Task receipt, and MUST label an unrecoverable result as unavailable rather than inferring a terminal state.

#### Scenario: Submission response is interrupted
- **WHEN** the connection fails after send but before the Desktop receives a Task receipt
- **THEN** retry reuses the same identifier and creates at most one A2A Task

#### Scenario: App restarts during work
- **WHEN** a non-terminal local Task receipt exists after restart and access remains valid
- **THEN** the Host reads that exact Task through the standard authorized route and updates only from returned state

#### Scenario: Task body cannot be recovered
- **WHEN** the server no longer has the in-memory Task body, access was revoked or authorized read otherwise cannot recover it
- **THEN** the local record becomes result-unavailable with a bounded explanation and retains no invented answer, completion or failure

### Requirement: Recent request and result content is local, encrypted and clearable
The Desktop Host SHALL keep at most 100 recent-use records per local Account/user identity, SHALL remove records older than 30 days on read or write, and SHALL encrypt persisted records with Electron `safeStorage` under restricted App-data permissions. The store MUST exclude credentials, Runtime session IDs, absolute paths, private Agent Instructions, private configuration and raw internal errors.

#### Scenario: Completed result is saved
- **WHEN** a Task obtains an allowlisted text result
- **THEN** the Host stores the selected Agent summary, request, Task/Context IDs, standard state, text result and timestamps only in the encrypted requester-local store

#### Scenario: Another user signs in on the Mac
- **WHEN** the active Account/user identity differs from a stored record's scope
- **THEN** the Renderer receives none of the other identity's recent content

#### Scenario: User clears recent content
- **WHEN** the user removes one record or chooses clear all
- **THEN** the corresponding encrypted local records are deleted and are absent after App restart without implying deletion from OS backups or prior recipients

#### Scenario: Secure storage is unavailable
- **WHEN** Electron secure encryption cannot be used
- **THEN** persistence fails closed, the current in-memory result may remain visible and no plaintext fallback file is written

### Requirement: Empty, offline and revoked states lead to a real next action
The Agent-use destination SHALL distinguish no invokable Agent, connection failure, authentication expiry, owned unbound Agent and revoked access. It MUST derive actions from current role and real Account resources and MUST NOT render fabricated Agents or results in the signed-in product.

#### Scenario: Owner has no Agent
- **WHEN** an owner or authorized creator has no invokable Agent and no recoverable connection error
- **THEN** the surface offers the real Agent creation path as the primary activation action

#### Scenario: Owned Agent needs Runtime
- **WHEN** the user owns an otherwise usable Agent that is unbound
- **THEN** the surface identifies Runtime setup or rebind as the next action and does not enable send

#### Scenario: Member lacks access
- **WHEN** an ordinary member has no invokable Agent but the Account is reachable
- **THEN** the surface explains that Agent access is required and identifies the Account owner/admin request path without exposing inaccessible Agent metadata

#### Scenario: Cloud is unavailable
- **WHEN** invokable-Agent discovery fails because authentication or connectivity is unavailable
- **THEN** the surface shows the real recovery state instead of an empty Account conclusion

### Requirement: Agent-use observability excludes content and secrets
Operational signals for the Agent-use surface MAY include allowlisted route, Agent ID, TaskState, latency bucket, retry count and stable error category, but MUST exclude request text, result/status text, local recent content, private Instructions, credentials, Runtime identifiers, absolute paths and raw errors.

#### Scenario: Real request completes
- **WHEN** production observability records the use journey
- **THEN** operators can verify discovery, send, Task transition and terminal outcome without seeing the user's request or result body

#### Scenario: Downstream error contains private data
- **WHEN** Cloud, Edge or Runtime returns an error containing a secret, path or user content
- **THEN** the Host and telemetry emit only an allowlisted error category and persist none of the raw value

### Requirement: Public product proof reaches a real Agent result
Before this positioning is used for public launch, the final packaged and signed macOS product SHALL prove that a first-time user can select an accessible Agent, submit one request and reach a truthful result or explicit escalation through the default product path. A screenshot, mocked fixture, local build or MCP-only result MUST NOT satisfy this acceptance.

#### Scenario: Personal Agent proof
- **WHEN** an external-style user completes the signed-in default journey with an owned online Agent
- **THEN** the released App reaches a real standard A2A terminal result and records redacted acceptance evidence

#### Scenario: Shared Agent proof
- **WHEN** a non-owner member invokes an Agent shared with that member
- **THEN** the released App reaches a real result while management remains denied and current access is rechecked on Task read

#### Scenario: Final binary differs from evidence build
- **WHEN** branding, code, signing identity, package or artifact changes after acceptance
- **THEN** the public-proof gate returns to unverified until the final downloadable artifact repeats the journey
