# agent-access-presence Specification

## Purpose

定义 Agent 管理权、调用权、Presence、工作负载与活动真值。 本规范只描述当前 Account Agents 产品的可验收行为，不引入任何历史产品兼容面、并行目标或隐含发布体系。

## Requirements

### Requirement: Agent management and invocation are separate authorities
The system SHALL evaluate `canManageAgent` and `canInvokeAgent` separately. Only the Agent owner SHALL manage; the owner SHALL always invoke; `private` SHALL admit only the owner; `friends` SHALL admit a caller only when an active Human Friendship currently exists between caller and owner. Friendship MUST NOT grant Account, Runtime, configuration, Activity or secret management authority.

#### Scenario: Owner manages private Agent
- **WHEN** the Agent owner edits a private Agent
- **THEN** management and owner invocation succeed without involving Friendship

#### Scenario: Active friend invokes shared Agent
- **WHEN** a current friend invokes an active Agent whose access mode is `friends`
- **THEN** the same authorization result permits the friend Desktop projection and MCP/A2A invocation across the two personal Accounts

#### Scenario: Friend invokes private Agent
- **WHEN** an active friend retains the ID of an Agent whose owner selected `private`
- **THEN** invocation is denied before Runtime delivery and the Agent is absent from friend discovery

#### Scenario: Removed friend invokes Agent
- **WHEN** a former friend retains an old Agent ID, Task ID or device credential
- **THEN** invocation and Task read are denied before Runtime/result delivery with no private metadata

### Requirement: Access updates are atomic, owner-only and deny by default
Only the Agent owner SHALL replace the access mode with `private` or `friends`; missing, malformed, stale or legacy Account/member targets MUST NOT accidentally widen access. Access changes MUST be atomic and immediately invalidate affected friend projections.

#### Scenario: Owner enables friend access
- **WHEN** the owner saves `friends` with the current Agent version
- **THEN** all and only active Human friends can discover and invoke the Agent, while no friend gains management authority

#### Scenario: Owner disables friend access
- **WHEN** the owner saves `private`
- **THEN** friend discovery, new A2A delivery and subsequent Task reads are denied immediately while owner access remains

#### Scenario: Legacy or stale update is submitted
- **WHEN** an update contains Account/member targets, an unknown mode or an outdated Agent version
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

### Requirement: Activity respects owner and content boundaries
Full Agent activity queries SHALL be available only to the Agent owner. Cloud MAY retain routing/audit metadata needed for status and aggregates, but MUST NOT default to long-term raw Prompt, response, Artifact, Runtime session ID, cwd or credential storage. Friend Agent projections MUST NOT include activity, run counts, workload or peer identities.

#### Scenario: Friend requests activity
- **WHEN** a friend with current invocation access requests Activity or workload detail for the Agent
- **THEN** the server returns generic denial and no peer, prompt, result, count or private timing data is disclosed

#### Scenario: Owner requests activity
- **WHEN** the Agent owner requests its bounded Activity projection
- **THEN** authorized metadata is returned without raw Runtime-private state or default long-term message bodies
