## ADDED Requirements

### Requirement: Owner can run an isolated real-path self-test
The CLI SHALL provide a human-confirmed self-test for an existing owned Agent Revision and MUST verify online Presence, bounded Invitation creation, Google join, requester Discovery, one real A2A Message result, Grant revocation, and post-revocation denial.

#### Scenario: Same Google Human completes the loop
- **WHEN** an authenticated Owner runs `agent-fabric self-test --confirm`, selects the Owner Google account, and the configured Agent Revision is online
- **THEN** the Control Plane reuses the Human identity, creates a distinct requester Device Credential and fixed Grant, and the CLI completes all self-test stages without granting Owner Scopes to the requester

#### Scenario: Agent returns a real answer
- **WHEN** the joined requester sends the self-test Message to the configured online Agent Revision
- **THEN** the returned A2A Task is completed with a non-empty Agent Artifact and the report records only its character count and duration

#### Scenario: Deployment is offline
- **WHEN** the configured owned Agent Revision is not online before Invitation creation
- **THEN** the CLI fails with a stable preflight error and creates no Invitation, requester Credential, Grant, or A2A Task

### Requirement: Self-test authority remains isolated from the user environment
The CLI MUST keep the self-test requester credential in memory and MUST NOT write or replace the normal Agent Fabric config, Codex MCP config, installed Skills, LaunchAgent, Edge credential, or Owner credential.

#### Scenario: Self-test succeeds
- **WHEN** every self-test stage completes
- **THEN** the CLI exits without changing any user configuration or service file and no requester Secret is persisted

#### Scenario: OAuth is cancelled or times out
- **WHEN** the Human cancels Google OAuth or the loopback join expires
- **THEN** the CLI reports a stable failure, preserves the existing user environment byte-for-byte, and attempts to revoke the created Invitation

### Requirement: Self-test cleans up and proves revocation
The CLI MUST revoke the temporary Grant and Invitation on success and MUST make a best-effort cleanup on every handled failure after either object is created. A successful report MUST prove that the revoked requester can no longer discover or invoke the target Agent.

#### Scenario: Revocation is enforced
- **WHEN** the first real A2A Task completes and the Owner revokes the self-test Grant
- **THEN** the requester no longer discovers the target Agent and a subsequent A2A Message is rejected before it reaches the Edge Runtime

#### Scenario: Main flow fails after join
- **WHEN** Discovery or the first A2A Task fails after the requester Grant is issued
- **THEN** the CLI attempts to revoke both Grant and Invitation before returning failure

#### Scenario: Cleanup fails
- **WHEN** Grant or Invitation cleanup cannot be confirmed
- **THEN** the CLI MUST NOT report the self-test as passed and SHALL return a stable cleanup error with the non-secret object IDs needed for manual remediation

### Requirement: Self-test output is bounded and redacted
Human and JSON output MUST use a versioned stage report and MUST NOT include Invitation Secret or URL, Device Token, Owner Token, Google email, OAuth Code, PKCE values, Prompt text, raw answer, private Edge context, runtime session ID, or absolute workspace path.

#### Scenario: JSON report succeeds
- **WHEN** the operator uses `--json` and the self-test passes
- **THEN** the response contains only schema version, pass status, target Agent and Revision IDs, allowlisted stage statuses, durations, answer character count, and cleanup status

#### Scenario: A downstream error contains a Secret
- **WHEN** a client or OAuth dependency raises an error whose message includes credential-bearing input
- **THEN** the CLI maps it to a stable allowlisted error code and emits none of the raw error message or Secret
