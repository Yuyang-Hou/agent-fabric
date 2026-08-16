## ADDED Requirements

### Requirement: Agent management and invocation are separate authorities
The system SHALL evaluate `canManageAgent` and `canInvokeAgent` separately. Agent owner and Account owner/admin MAY manage; Agent owner SHALL always invoke; `private` SHALL admit only the Agent owner; `public_to` SHALL admit active members matching an `account` or exact `member` target.

#### Scenario: Admin manages private Agent
- **WHEN** an Account admin edits a private Agent they do not own
- **THEN** management succeeds if policy permits, but admin invocation is denied unless an invocation target also grants it

#### Scenario: Specific member invokes Agent
- **WHEN** an active member matches a `member` invocation target
- **THEN** the same authorization result permits supported UI and MCP/A2A invocation

#### Scenario: Removed member invokes Agent
- **WHEN** a former member retains an old target identifier or device credential
- **THEN** invocation is denied before Runtime delivery and the Agent is absent from discoverable results

### Requirement: Access updates are atomic and deny by default
Only Agent managers SHALL replace `permissionMode` and the full invocation target set; empty, malformed, cross-Account or inert targets MUST NOT accidentally widen access.

#### Scenario: Manager selects all members
- **WHEN** a manager saves `public_to` with the Account target
- **THEN** every active Account member may invoke and no non-member may invoke

#### Scenario: Target update is invalid
- **WHEN** any member target is not active in the Agent's Account
- **THEN** the whole access update is rejected and prior access remains unchanged

### Requirement: Presence is derived from real execution health
Agent availability SHALL be `online`, `unstable` or `offline` based on fresh Edge connectivity, matching Agent/Runtime binding and Runtime health; archived and unbound Agents SHALL override this projection with `archived` and `needs_runtime` respectively.

#### Scenario: Heartbeat becomes stale
- **WHEN** the Edge heartbeat exceeds its TTL
- **THEN** every affected bound Agent becomes offline without inventing a last-online time

#### Scenario: Runtime reports degraded health
- **WHEN** connectivity is fresh but Runtime health is degraded
- **THEN** affected Agents show unstable with an allowlisted reason and are not presented as fully online

#### Scenario: Agent is archived while online
- **WHEN** an online Agent is archived
- **THEN** its catalog status becomes archived and it rejects new invocation even if the Edge heartbeat remains fresh

### Requirement: Workload and activity come from A2A Task truth
Workload SHALL derive running and queued counts from real non-terminal Tasks; recent activity and 30-day runs SHALL derive from terminal Task timestamps and outcomes. UI state MUST NOT synthesize completion or counts.

#### Scenario: Agent has active Tasks
- **WHEN** an Agent has two working and one queued Task
- **THEN** the row shows online/unstable availability plus three active items without changing availability semantics

#### Scenario: Task fails in A2A state
- **WHEN** transport returns HTTP success but the standard TaskState is failed
- **THEN** activity records a failed run and no successful reply is counted

### Requirement: Activity respects account and content boundaries
Agent activity queries SHALL be Account-scoped and access-controlled. Cloud MAY retain routing/audit metadata needed for status and aggregates, but MUST NOT default to long-term raw Prompt, response, Artifact, Runtime session ID, cwd or credential storage.

#### Scenario: Viewer lacks Agent access
- **WHEN** a member requests activity for an Agent they cannot view
- **THEN** the server returns generic denial and no peer, prompt, result or count is disclosed
